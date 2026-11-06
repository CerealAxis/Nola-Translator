"""Managed comic projects, durable edits and cancellable offline page processing."""
from __future__ import annotations

import asyncio
import base64
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
from typing import Literal
from uuid import UUID, uuid4
import zipfile

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from .glossary import resolve_comic_terms

from .comic_formats import (MAX_PAGE_BYTES, MAX_IMPORT_BYTES, MAX_PIXELS, PDF_DPI, epub_pages,
                            kindle_images, pdf_pages, png_bytes, validate_archive, write_epub, write_pdf)
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def encode_image(image) -> bytes:
    import cv2
    ok, encoded = cv2.imencode(".png", image)
    if not ok:
        raise ValueError("imageEncodingFailed")
    return encoded.tobytes()


def decode_image(data: bytes):
    import cv2
    import numpy as np
    if len(data) > MAX_PAGE_BYTES:
        raise ValueError("imageTooLarge")
    # Pillow inspects headers before OpenCV allocates the full pixel buffer.
    from PIL import Image
    with Image.open(io.BytesIO(data)) as header:
        if header.width * header.height > MAX_PIXELS:
            raise ValueError("imageTooLarge")
        header.verify()
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.shape[0] * image.shape[1] > MAX_PIXELS:
        raise ValueError("invalidImage")
    return image


def _natural(value: str):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", value)]


class ComicStyle(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fontSize: int = Field(ge=6, le=200)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    direction: Literal["horizontal", "vertical-rl"]
    align: Literal["left", "center", "right"]


class ComicConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sourceLanguage: str = Field(min_length=1, max_length=32)
    targetLanguage: str = Field(min_length=1, max_length=32)
    model: str = Field(max_length=512)
    readingDirection: Literal["rtl", "ltr"]
    repairMethod: Literal["telea", "lama-manga"] = "telea"
    glossary: dict


def validate_edit(request: dict) -> dict:
    if not isinstance(request, dict) or set(request) != {'projectId', 'operationId', 'expectedRevision', 'command'}:
        raise ValueError('invalidCommand')
    UUID(request['projectId']); UUID(request['operationId'])
    if type(request['expectedRevision']) is not int or request['expectedRevision'] < 0:
        raise ValueError('invalidRevision')
    command = request['command']
    if not isinstance(command, dict):
        raise ValueError('invalidCommand')
    action = command.get('action')
    fields = {'rename': {'title'}, 'configure': {'config'}, 'saveRegion': {'pageId', 'region'},
              'deleteRegion': {'pageId', 'regionId'}, 'addChapter': {'title'}, 'movePage': {'pageId', 'chapterId', 'index'},
              'deletePage': {'pageId'}, 'paintMask': {'pageId', 'stroke'}, 'clearMask': {'pageId'}, 'undo': set(), 'redo': set()}
    if action not in fields or set(command) != {'action'} | fields[action]:
        raise ValueError('invalidCommand')
    for key in ('pageId', 'regionId', 'chapterId'):
        if key in command:
            UUID(command[key])
    if 'title' in command and (not isinstance(command['title'], str) or not 1 <= len(command['title'].strip()) <= 200):
        raise ValueError('invalidTitle')
    if action == 'configure':
        config = ComicConfig.model_validate(command['config'])
        selection = config.glossary
        if selection.get('mode') not in ('auto', 'off', 'selected'):
            raise ValueError('invalidGlossarySelection')
        if selection['mode'] == 'selected':
            if set(selection) != {'mode', 'libraryIds'} or not isinstance(selection['libraryIds'], list) or len(selection['libraryIds']) > 1000:
                raise ValueError('invalidGlossarySelection')
            for item in selection['libraryIds']:
                UUID(item)
        elif set(selection) != {'mode'}:
            raise ValueError('invalidGlossarySelection')
    if action == 'movePage' and (type(command['index']) is not int or not 0 <= command['index'] <= 1000):
        raise ValueError('invalidIndex')
    return request


class ComicRegion(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: UUID
    sourceText: str = Field(max_length=64000)
    targetText: str | None = Field(max_length=64000)
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    sourceQuad: list[tuple[float, float]] | None = Field(default=None, min_length=4, max_length=4)
    confidence: float | None = Field(ge=0, le=1)
    locked: bool
    ignored: bool
    style: ComicStyle
    qa: list[str] = Field(max_length=20)


class ComicMaskStroke(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    id: UUID
    mode: Literal['erase', 'restore']
    size: float = Field(ge=1, le=200)
    points: list[tuple[float, float]] = Field(min_length=1, max_length=2000)


def validate_stroke(raw: dict, page: dict) -> dict:
    value = ComicMaskStroke.model_validate(raw).model_dump(mode='json')
    if any(not 0 <= x < page['width'] or not 0 <= y < page['height'] for x, y in value['points']):
        raise ValueError('invalidGeometry')
    return value


def validate_region(region: dict, page: dict) -> dict:
    value = ComicRegion.model_validate(region).model_dump(mode="json", exclude_none=False)
    if value["x"] + value["width"] > page["width"] + 0.01 or value["y"] + value["height"] > page["height"] + 0.01:
        raise ValueError("invalidGeometry")
    if value["sourceQuad"] is None:
        value.pop("sourceQuad")
    elif any(not 0 <= x <= page["width"] or not 0 <= y <= page["height"] for x, y in value["sourceQuad"]):
        raise ValueError("invalidGeometry")
    return value


class ComicRepository:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        (self.root / "assets").mkdir(exist_ok=True)
        (self.root / "exports").mkdir(exist_ok=True)
        self.lock = threading.RLock()
        with self.connection() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version > 1:
                raise ValueError("schemaTooNew")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, body TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS edits(project_id TEXT, operation_id TEXT UNIQUE, request TEXT, before_body TEXT, after_body TEXT, undone INTEGER DEFAULT 0, sequence INTEGER PRIMARY KEY AUTOINCREMENT);
                CREATE TABLE IF NOT EXISTS operations(operation_id TEXT PRIMARY KEY, request TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, project_id TEXT, body TEXT NOT NULL, candidate TEXT, input_snapshot TEXT);
                PRAGMA user_version=1;
            """)
            if 'input_snapshot' not in {row[1] for row in db.execute('PRAGMA table_info(jobs)')}:
                db.execute('ALTER TABLE jobs ADD COLUMN input_snapshot TEXT')
            for row in db.execute("SELECT id,body FROM jobs").fetchall():
                job = json.loads(row[1])
                if job["state"] == "running":
                    job.update(state="interrupted", error="unknownOutcome" if job['stage'] == 'translate' else "interrupted")
                    db.execute("UPDATE jobs SET body=? WHERE id=?", (json.dumps(job), row[0]))

    @contextmanager
    def connection(self):
        with self.lock:
            db = sqlite3.connect(self.root / "comic.sqlite3")
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("PRAGMA synchronous=FULL")
            try:
                with db:
                    yield db
            finally:
                db.close()

    def _load(self, db, project_id):
        row = db.execute("SELECT body FROM projects WHERE id=?", (str(UUID(project_id)),)).fetchone()
        if not row:
            raise ValueError("projectNotFound")
        return json.loads(row[0])

    def _save(self, db, project):
        project["updatedAt"] = now()
        project["pageCount"] = len(project["pages"])
        project["chapterCount"] = len(project["chapters"])
        db.execute("INSERT OR REPLACE INTO projects VALUES(?,?)", (project["id"], json.dumps(project, ensure_ascii=False)))

    def list(self):
        with self.connection() as db:
            projects = [json.loads(row[0]) for row in db.execute("SELECT body FROM projects")]
        return [{key: project[key] for key in ("id", "title", "revision", "updatedAt", "pageCount", "chapterCount")} for project in sorted(projects, key=lambda item: item["updatedAt"], reverse=True)]

    def open(self, project_id):
        with self.connection() as db:
            project = self._load(db, project_id)
            project["jobs"] = [json.loads(row[0]) for row in db.execute("SELECT body FROM jobs WHERE project_id=? ORDER BY rowid DESC LIMIT 30", (project_id,))]
            project["canUndo"] = db.execute("SELECT 1 FROM edits WHERE project_id=? AND undone=0 LIMIT 1", (project_id,)).fetchone() is not None
            project["canRedo"] = db.execute("SELECT 1 FROM edits WHERE project_id=? AND undone=1 LIMIT 1", (project_id,)).fetchone() is not None
            return project

    def asset(self, data: bytes, suffix: str = 'png') -> str:
        digest = hashlib.sha256(data).hexdigest()
        if suffix not in ('png', 'original'):
            raise ValueError('invalidAsset')
        path = self.root / "assets" / f"{digest}.{suffix}"
        if not path.exists():
            temporary = path.with_suffix(f".{uuid4()}.tmp")
            try:
                with temporary.open("xb") as stream:
                    stream.write(data)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)
        return digest

    def asset_path(self, project_id: str, page_id: str, kind: str) -> Path:
        project = self.open(project_id)
        page = next((page for page in project["pages"] if page["id"] == page_id), None)
        if not page:
            raise ValueError("pageNotFound")
        return self._page_asset(page, kind)

    def _page_asset(self, page, kind):
        digest = page.get({"source": "sourceAsset", "clean": "cleanAsset", "rendered": "renderedAsset"}[kind])
        if not digest or not re.fullmatch(r"[a-f0-9]{64}", digest):
            raise ValueError("assetMissing")
        path = self.root / "assets" / f"{digest}.png"
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError("assetIntegrity")
        return path

    def import_sources(self, paths: list[str], title: str, project_id=None, chapter_id=None,
                       dpi=PDF_DPI, first=1, last=None, first_frame=False):
        if len(paths) == 1 and Path(paths[0]).suffix.lower() == '.nola-comic':
            if project_id:
                raise ValueError('projectImportMustCreate')
            return self.import_project(Path(paths[0]))
        sources = []
        imported_chapters = {}
        current_chapter = None
        direction = "rtl"
        total = 0

        def append_page(name, data, original=None):
            nonlocal total
            total += len(data)
            if total > MAX_IMPORT_BYTES or len(sources) >= 1000:
                raise ValueError("importTooLarge")
            image = decode_image(data)
            encoded = encode_image(image)
            sources.append((name, image.shape[1], image.shape[0], self.asset(encoded), original or self.asset(data, 'original'), current_chapter))

        def append(name, data):
            from PIL import Image
            if len(data) > MAX_PAGE_BYTES:
                raise ValueError("imageTooLarge")
            with Image.open(io.BytesIO(data)) as image:
                if image.format in ("GIF", "TIFF") or image.format == "WEBP" and image.is_animated:
                    original = self.asset(data, "original")
                    for index in range(1001):
                        try:
                            image.seek(index)
                        except EOFError:
                            break
                        if index == 1000 or image.width * image.height > MAX_PIXELS:
                            raise ValueError("imageTooLarge")
                        append_page(f"{Path(name).stem}-{index + 1:04}.png", png_bytes(image.convert("RGB")), original)
                        if first_frame:
                            break
                    return
            append_page(name, data)

        for raw in paths:
            current_chapter = None
            path = Path(raw).resolve(strict=True)
            if path.is_file() and path.stat().st_size > MAX_IMPORT_BYTES:
                raise ValueError("importTooLarge")
            if path.suffix.lower() == ".pdf" and path.is_file():
                for name, data in pdf_pages(path, dpi, first, last):
                    append_page(name, data)
            elif path.suffix.lower() == ".epub" and path.is_file():
                for name, data, chapter, progression in epub_pages(path):
                    if len(paths) == 1 and progression in ("rtl", "ltr"):
                        direction = progression
                    if chapter and not chapter_id:
                        current_chapter = (raw, chapter[0])
                        if current_chapter not in imported_chapters:
                            imported_chapters[current_chapter] = {"id": str(uuid4()), "title": chapter[1] or title}
                    append(name, data)
            elif path.suffix.lower() in (".mobi", ".azw", ".azw3") and path.is_file():
                for name, data in kindle_images(path):
                    append(name, data)
            elif path.is_dir():
                for child in sorted(path.rglob("*"), key=lambda item: _natural(str(item))):
                    if child.is_file() and child.suffix.lower() in IMAGE_EXTENSIONS:
                        if not child.resolve().is_relative_to(path) or child.stat().st_size > MAX_PAGE_BYTES:
                            raise ValueError("unsafeImport")
                        append(child.name, child.read_bytes())
            elif path.suffix.lower() in (".zip", ".cbz"):
                with zipfile.ZipFile(path) as archive:
                    validate_archive(archive)
                    infos = archive.infolist()
                    for info in sorted(infos, key=lambda item: _natural(item.filename)):
                        if info.is_dir() or Path(info.filename).suffix.lower() not in IMAGE_EXTENSIONS:
                            continue
                        if info.file_size > MAX_PAGE_BYTES or info.file_size > max(info.compress_size, 1) * 300:
                            raise ValueError("unsafeArchive")
                        append(Path(info.filename).name, archive.read(info))
            elif path.suffix.lower() in IMAGE_EXTENSIONS:
                if path.stat().st_size > MAX_PAGE_BYTES:
                    raise ValueError("imageTooLarge")
                append(path.name, path.read_bytes())
            else:
                raise ValueError("unsupportedFormat")
        if not sources:
            raise ValueError("noImages")
        with self.connection() as db:
            if project_id:
                project = self._load(db, project_id)
            else:
                project = {"id": str(uuid4()), "title": title, "revision": 0, "updatedAt": now(), "pageCount": 0, "chapterCount": 0,
                           "config": {"sourceLanguage": "auto", "targetLanguage": "zh", "model": "", "readingDirection": direction, "glossary": {"mode": "auto"}}, "chapters": [], "pages": []}
            if chapter_id:
                if not any(chapter["id"] == chapter_id for chapter in project["chapters"]):
                    raise ValueError("chapterNotFound")
            else:
                if any(source[-1] is None for source in sources):
                    chapter_id = str(uuid4())
                    project["chapters"].append({"id": chapter_id, "title": title})
                project["chapters"].extend(imported_chapters.values())
            if len(project["pages"]) + len(sources) > 1000:
                raise ValueError("importTooLarge")
            for name, width, height, digest, original, chapter in sources:
                page_chapter = imported_chapters[chapter]["id"] if chapter else chapter_id
                project["pages"].append({"id": str(uuid4()), "chapterId": page_chapter, "name": name, "width": width, "height": height,
                                         "regions": [], "status": "imported", "sourceAsset": digest, "originalAsset": original, "hasClean": False, "hasRendered": False})
            project["revision"] += 1
            self._save(db, project)
            db.execute('DELETE FROM edits WHERE project_id=?', (project['id'],))
        return self.open(project["id"])

    def import_project(self, path: Path):
        with zipfile.ZipFile(path) as archive:
            validate_archive(archive)
            manifest = archive.getinfo('project.json')
            if manifest.file_size > 16 * 1024 * 1024:
                raise ValueError('unsafeArchive')
            bundle = json.loads(archive.read(manifest))
            if bundle.get('schemaVersion') != 1:
                raise ValueError('schemaTooNew')
            project = bundle['project']
            if not isinstance(project.get('title'), str) or not 1 <= len(project['title']) <= 200 or not 1 <= len(project['pages']) <= 1000 or not 1 <= len(project['chapters']) <= 1000:
                raise ValueError('invalidProject')
            config = ComicConfig.model_validate(project['config']).model_dump()
            chapters, ids = [], {}
            for chapter in project['chapters']:
                old = str(UUID(chapter['id']))
                if old in ids or not isinstance(chapter['title'], str) or not 1 <= len(chapter['title']) <= 200:
                    raise ValueError('invalidProject')
                ids[old] = str(uuid4())
                chapters.append({'id': ids[old], 'title': chapter['title']})
            pages = []
            for source in project['pages']:
                if source['chapterId'] not in ids or not isinstance(source.get('name'), str) or len(source['name']) > 512 or len(source['regions']) > 2048:
                    raise ValueError('invalidProject')
                page = {key: source[key] for key in ('name', 'width', 'height', 'status')}
                page.update(id=str(uuid4()), chapterId=ids[source['chapterId']], hasClean=False, hasRendered=False, regions=[])
                for field, flag in [('sourceAsset', None), ('cleanAsset', 'hasClean'), ('renderedAsset', 'hasRendered')]:
                    digest = source.get(field)
                    if not digest and flag:
                        continue
                    if not isinstance(digest, str) or not re.fullmatch(r'[a-f0-9]{64}', digest):
                        raise ValueError('invalidAsset')
                    info = archive.getinfo(f'assets/{digest}.png')
                    if info.file_size > MAX_PAGE_BYTES or info.file_size > max(info.compress_size, 1) * 300:
                        raise ValueError('unsafeArchive')
                    data = archive.read(info)
                    image = decode_image(data)
                    if hashlib.sha256(data).hexdigest() != digest or image.shape[:2] != (page['height'], page['width']):
                        raise ValueError('assetIntegrity')
                    page[field] = self.asset(data)
                    if flag:
                        page[flag] = True
                for region in source['regions']:
                    value = validate_region(region, page)
                    value['id'] = str(uuid4())
                    page['regions'].append(value)
                if source.get('maskStrokes'):
                    if len(source['maskStrokes']) > 1000 or sum(len(item['points']) for item in source['maskStrokes']) > 20000:
                        raise ValueError('maskTooLarge')
                    page['maskStrokes'] = [validate_stroke(stroke, page) for stroke in source['maskStrokes']]
                if source.get('originalAsset'):
                    digest = source['originalAsset']
                    if not isinstance(digest, str) or not re.fullmatch(r'[a-f0-9]{64}', digest):
                        raise ValueError('invalidAsset')
                    info = archive.getinfo(f'originals/{digest}.original')
                    if info.file_size > MAX_PAGE_BYTES or info.file_size > max(info.compress_size, 1) * 300:
                        raise ValueError('unsafeArchive')
                    data = archive.read(info)
                    from PIL import Image
                    with Image.open(io.BytesIO(data)) as header:
                        if header.width * header.height > MAX_PIXELS:
                            raise ValueError("imageTooLarge")
                        header.verify()
                    if hashlib.sha256(data).hexdigest() != digest:
                        raise ValueError('assetIntegrity')
                    page['originalAsset'] = self.asset(data, 'original')
                pages.append(page)
        imported = {'id': str(uuid4()), 'title': project['title'], 'revision': 1, 'updatedAt': now(), 'config': config, 'chapters': chapters, 'pages': pages}
        with self.connection() as db:
            self._save(db, imported)
        return self.open(imported['id'])

    def edit(self, request: dict):
        request = validate_edit(request)
        project_id = str(UUID(request["projectId"]))
        operation = str(UUID(request["operationId"]))
        with self.connection() as db:
            replay = db.execute("SELECT request FROM operations WHERE operation_id=? UNION ALL SELECT request FROM edits WHERE operation_id=? LIMIT 1", (operation, operation)).fetchone()
            if replay:
                if replay[0] != json.dumps(request, sort_keys=True):
                    raise ValueError("conflict")
                return self.open(project_id)
            project = self._load(db, project_id)
            if project["revision"] != request["expectedRevision"]:
                raise ValueError("conflict")
            before = json.dumps(project)
            command = request["command"]
            action = command["action"]
            if action in ("undo", "redo"):
                undone = int(action == "redo")
                row = db.execute(f"SELECT sequence,before_body,after_body FROM edits WHERE project_id=? AND undone=? ORDER BY sequence {'ASC' if undone else 'DESC'} LIMIT 1", (project_id, undone)).fetchone()
                if not row:
                    raise ValueError("historyEmpty")
                restored = json.loads(row[2] if undone else row[1])
                restored["revision"] = project["revision"]
                project = restored
                db.execute("UPDATE edits SET undone=? WHERE sequence=?", (1 - undone, row[0]))
            elif action == "rename":
                project["title"] = command["title"]
            elif action == "configure":
                project["config"] = command["config"]
            elif action == "addChapter":
                project["chapters"].append({"id": str(uuid4()), "title": command["title"]})
            else:
                page = next((page for page in project["pages"] if page["id"] == command["pageId"]), None)
                if page is None:
                    raise ValueError("pageNotFound")
                if action in ('paintMask', 'clearMask'):
                    if action == 'clearMask':
                        page['maskStrokes'] = []
                    else:
                        stroke = validate_stroke(command['stroke'], page)
                        strokes = page.setdefault('maskStrokes', [])
                        if len(strokes) >= 1000 or sum(len(item['points']) for item in strokes) + len(stroke['points']) > 20000:
                            raise ValueError('maskTooLarge')
                        if any(item['id'] == stroke['id'] for item in strokes):
                            raise ValueError('duplicateStroke')
                        strokes.append(stroke)
                    page.pop('cleanAsset', None); page['hasClean'] = False
                    page.pop('renderedAsset', None); page['hasRendered'] = False
                elif action == "saveRegion":
                    region = validate_region(command["region"], page)
                    existing = next((index for index, item in enumerate(page["regions"]) if item["id"] == region["id"]), None)
                    if existing is None:
                        page["regions"].append(region)
                        page.pop('cleanAsset', None); page['hasClean'] = False
                    else:
                        previous = page['regions'][existing]
                        geometry = ('sourceQuad',) if previous.get('sourceQuad') and region.get('sourceQuad') else ('sourceQuad', 'x', 'y', 'width', 'height')
                        erased_before = bool(previous['targetText']) and previous['targetText'] != previous['sourceText']
                        erased_after = bool(region['targetText']) and region['targetText'] != region['sourceText']
                        if any(previous.get(key) != region.get(key) for key in geometry) or previous['ignored'] != region['ignored'] or erased_before != erased_after:
                            page.pop('cleanAsset', None); page['hasClean'] = False
                        page["regions"][existing] = region
                    page.pop("renderedAsset", None); page["hasRendered"] = False
                elif action == "deleteRegion":
                    if not any(item["id"] == command["regionId"] for item in page["regions"]):
                        raise ValueError("regionNotFound")
                    page["regions"] = [item for item in page["regions"] if item["id"] != command["regionId"]]
                    page.pop('cleanAsset', None); page['hasClean'] = False
                    page.pop("renderedAsset", None); page["hasRendered"] = False
                elif action == "deletePage":
                    project["pages"].remove(page)
                elif action == "movePage":
                    if not any(chapter["id"] == command["chapterId"] for chapter in project["chapters"]):
                        raise ValueError("chapterNotFound")
                    project["pages"].remove(page)
                    page["chapterId"] = command["chapterId"]
                    project["pages"].insert(min(command["index"], len(project["pages"])), page)
                else:
                    raise ValueError("invalidCommand")
            project["revision"] += 1
            self._save(db, project)
            if action not in ("undo", "redo"):
                db.execute("DELETE FROM edits WHERE project_id=? AND undone=1", (project_id,))
                db.execute("INSERT INTO edits(project_id,operation_id,request,before_body,after_body) VALUES(?,?,?,?,?)", (project_id, operation, json.dumps(request, sort_keys=True), before, json.dumps(project)))
            db.execute("INSERT INTO operations VALUES(?,?)", (operation, json.dumps(request, sort_keys=True)))
        return self.open(project_id)

    def publish_page(self, project_id: str, revision: int, page: dict):
        with self.connection() as db:
            project = self._load(db, project_id)
            if project["revision"] != revision:
                raise ValueError("editConflict")
            index = next((index for index, item in enumerate(project["pages"]) if item["id"] == page["id"]), None)
            if index is None:
                raise ValueError("pageNotFound")
            project["pages"][index] = page
            project["revision"] += 1
            # Automatic output starts a new history boundary; old commands must not erase it.
            db.execute("DELETE FROM edits WHERE project_id=?", (project_id,))
            self._save(db, project)
            return project["revision"]

    def save_job(self, project_id: str, job: dict, candidate=None, input_snapshot=None):
        with self.connection() as db:
            db.execute("INSERT INTO jobs(id,project_id,body,candidate) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,candidate=COALESCE(excluded.candidate,jobs.candidate)",
                       (job["id"], project_id, json.dumps(job), json.dumps(candidate) if candidate is not None else None))
            if input_snapshot is not None:
                db.execute('UPDATE jobs SET input_snapshot=? WHERE id=?', (json.dumps(input_snapshot, ensure_ascii=False), job['id']))

    def export(self, project_id: str, kind: str, page_ids: list[str] | None, layer="rendered", directory=None):
        project = self.open(project_id)
        pages = project["pages"] if page_ids is None else [page for page in project["pages"] if page["id"] in page_ids]
        if not pages or page_ids is not None and len(pages) != len(set(page_ids)):
            raise ValueError("pageNotFound")
        extension = {"images": "zip", "project": "nola-comic", "labelplus": "zip"}.get(kind, kind)
        target = self.root / "exports" / f"{uuid4()}.{extension}"

        def images():
            for page in pages:
                if layer == "rendered" and not page["hasRendered"]:
                    raise ValueError("pageNotRendered")
                yield page, self._page_asset(page, layer)

        try:
            if kind == "directory":
                from tempfile import TemporaryDirectory
                from shutil import copyfile
                parent = Path(directory).resolve(strict=True)
                with TemporaryDirectory(dir=parent, prefix=".nola-comic-") as stage:
                    staged = Path(stage) / "pages"
                    staged.mkdir()
                    for index, (_, path) in enumerate(images(), 1):
                        copyfile(path, staged / f"{index:04}.png")
                    # A unique name prevents replacing any existing export or user folder.
                    target_folder = parent / f"comic-{project_id[:8]}-{uuid4().hex[:8]}"
                    staged.rename(target_folder)
                    return target_folder
            if kind == "pdf":
                write_pdf(target, images())
                return target
            if kind == "epub":
                write_epub(target, project, images())
                return target
            if kind == "png":
                if len(pages) != 1:
                    raise ValueError("invalidPageRange")
                target.write_bytes(next(images())[1].read_bytes())
                return target
            metadata = {"schemaVersion": 1, "projectId": project["id"], "revision": project["revision"],
                        "title": project["title"], "chapters": project["chapters"], "pages": pages}
            if kind == "json":
                target.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
                return target
            with zipfile.ZipFile(target, "x", compression=zipfile.ZIP_DEFLATED) as archive:
                if kind == "project":
                    archive.writestr("project.json", json.dumps({"schemaVersion": 1, "project": project}, ensure_ascii=False))
                    digests = set()
                    for page in project["pages"]:
                        for field in ("sourceAsset", "cleanAsset", "renderedAsset"):
                            if page.get(field):
                                digests.add(page[field])
                    for digest in digests:
                        archive.write(self.root / "assets" / f"{digest}.png", f"assets/{digest}.png")
                    for digest in {page['originalAsset'] for page in project['pages'] if page.get('originalAsset')}:
                        archive.write(self.root / 'assets' / f'{digest}.original', f'originals/{digest}.original')
                elif kind == "labelplus":
                    lines = ["1,0", "-", "Bubble", "-", "Nola Translator", ""]
                    for index, page in enumerate(pages, 1):
                        name = f"{index:04}.png"
                        archive.write(self._page_asset(page, "source"), name)
                        lines.append(f">>>>>>>>[{name}]<<<<<<<<")
                        for number, region in enumerate(page["regions"], 1):
                            x = (region["x"] + region["width"] / 2) / page["width"]
                            y = (region["y"] + region["height"] / 2) / page["height"]
                            lines.extend([f"----------------[{number}]----------------[{x:.3f},{y:.3f},1]",
                                          region.get("targetText") or region["sourceText"], ""])
                    archive.writestr("labels.txt", "\r\n".join(lines).encode("utf-8-sig"))
                    archive.writestr("mapping.json", json.dumps(metadata, ensure_ascii=False))
                else:
                    for index, (_, path) in enumerate(images(), 1):
                        archive.write(path, f"{index:04}.png")
            return target
        except BaseException:
            target.unlink(missing_ok=True)
            raise


def repair_page(image, regions: list[dict], strokes: list[dict] | None = None, *, mask_only=False):
    import cv2
    import numpy as np

    mask = np.zeros(image.shape[:2], dtype=np.uint8)
    for region in regions:
        if region["ignored"] or not region["targetText"] or region["targetText"] == region["sourceText"]:
            continue
        x, y = int(region["x"]), int(region["y"])
        w, h = int(region["width"]), int(region["height"])
        quad = np.array(region.get("sourceQuad") or [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], dtype=np.int32)
        x, y, w, h = cv2.boundingRect(quad)
        x, y = max(0, x), max(0, y)
        w, h = min(w, image.shape[1] - x), min(h, image.shape[0] - y)
        crop = image[y:y + h, x:x + w]
        if w < 3 or h < 3:
            continue
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        _, threshold = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        border = np.concatenate((gray[0], gray[-1], gray[:, 0], gray[:, -1]))
        glyphs = 255 - threshold if np.median(border) > 127 else threshold
        polygon = np.zeros((h, w), np.uint8)
        cv2.fillPoly(polygon, [quad - [x, y]], 255)
        glyphs = cv2.bitwise_and(glyphs, polygon)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(glyphs)
        filtered = np.zeros_like(glyphs)
        for index in range(1, count):
            left, top, width, height, area = stats[index]
            # Bubble borders and large illustration fills are not text strokes.
            if 2 <= area <= w * h * 0.3 and not (width >= w * 0.95 or height >= h * 0.95):
                filtered[labels == index] = 255
        coverage = np.count_nonzero(filtered) / max(1, np.count_nonzero(polygon))
        if coverage < 0.001 or coverage > 0.45:
            if "maskNeedsReview" not in region["qa"]:
                region["qa"].append("maskNeedsReview")
            if not strokes or not any(stroke['mode'] == 'erase' and any(x <= px < x + w and y <= py < y + h for px, py in stroke['points']) for stroke in strokes):
                raise ValueError("maskNeedsReview")
            continue
        filtered = cv2.dilate(filtered, np.ones((3, 3), np.uint8))
        mask[y:y + h, x:x + w] |= filtered
    for stroke in strokes or []:
        points = np.rint(np.array(stroke['points'])).astype(np.int32)
        value = 255 if stroke['mode'] == 'erase' else 0
        radius = max(1, round(stroke['size'] / 2))
        for point in points:
            cv2.circle(mask, tuple(point), radius, value, -1)
        if len(points) > 1:
            cv2.polylines(mask, [points], False, value, radius * 2)
    if mask_only:
        return image, mask
    # Telea repairs actual glyph pixels from their neighbours; no rectangle is filled.
    return cv2.inpaint(image, mask, 3, cv2.INPAINT_TELEA), mask


def detect_comic_regions(image, blocks: list[dict], reading_direction: str) -> list[dict]:
    import cv2
    import numpy as np

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, labels, components, _ = cv2.connectedComponentsWithStats((gray >= 235).astype(np.uint8))
    groups = {}
    for index, block in enumerate(blocks):
        quad = np.asarray(block['quad'])
        x, y = np.maximum(0, np.floor(quad.min(axis=0))).astype(int)
        right, bottom = np.minimum([image.shape[1], image.shape[0]], np.ceil(quad.max(axis=0))).astype(int)
        if right <= x or bottom <= y:
            continue
        counts = np.bincount(labels[y:bottom, x:right].ravel())
        counts[0] = 0
        label = int(counts.argmax())
        left, top, width, height, area = components[label]
        bubble = label > 0 and (right - x) * (bottom - y) * 1.2 < area < gray.size * 0.35
        key = ('bubble', label) if bubble else ('text', index)
        groups.setdefault(key, []).append((block, x, y, right, bottom))
    regions = []
    for (kind, label), items in groups.items():
        vertical = sum(item[4] - item[2] > (item[3] - item[1]) * 1.5 for item in items) > len(items) / 2
        items.sort(key=lambda item: (-item[1], item[2]) if vertical else (item[2], item[1]))
        x, y = min(item[1] for item in items), min(item[2] for item in items)
        right, bottom = max(item[3] for item in items), max(item[4] for item in items)
        source_quad = [[x, y], [right, y], [right, bottom], [x, bottom]]
        font_size = max(6, min(200, round(min(min(item[3] - item[1], item[4] - item[2]) for item in items) * 0.75)))
        if kind == 'bubble':
            left, top, width, height, _ = components[label]
            x, y, right, bottom = left + width * 0.15, top + height * 0.15, left + width * 0.85, top + height * 0.85
        region = {'id': str(uuid4()), 'sourceText': ('\n' if vertical else ' ').join(item[0]['text'] for item in items), 'targetText': None,
                  'x': float(x), 'y': float(y), 'width': float(right - x), 'height': float(bottom - y), 'sourceQuad': source_quad,
                  'confidence': min(item[0]['confidence'] for item in items), 'locked': False, 'ignored': False,
                  'style': {'fontSize': font_size, 'color': '#000000', 'direction': 'vertical-rl' if vertical else 'horizontal', 'align': 'center'}, 'qa': []}
        regions.append(region)
    regions.sort(key=lambda item: (int(item['y'] / max(item['height'], 1)), -item['x'] if reading_direction == 'rtl' else item['x']))
    return regions


def render_page(image, regions: list[dict], font_path: Path):
    import cv2
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont

    if not font_path.is_file():
        raise ValueError("fontMissing")
    canvas = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(canvas)
    for region in regions:
        text = region["targetText"]
        if region["ignored"] or not text or text == region["sourceText"]:
            continue
        x, y, width, height = (region[key] for key in ("x", "y", "width", "height"))
        style = region["style"]
        vertical = style["direction"] == "vertical-rl"
        lines = []
        font = None
        for size in range(style["fontSize"], 5, -1):
            font = ImageFont.truetype(str(font_path), size)
            line_height = size * 1.2
            if vertical:
                count = max(1, int(height / line_height))
                lines = [line[index:index + count] for line in text.splitlines() for index in range(0, max(1, len(line)), count)]
                fits = line_height <= height and len(lines) * line_height <= width
            else:
                lines, line = [], ""
                for char in text:
                    if char == "\n":
                        lines.append(line); line = ""
                    elif line and draw.textlength(line + char, font=font) > width:
                        lines.append(line); line = char
                    else:
                        line += char
                lines.append(line)
                fits = len(lines) * line_height <= height and all(draw.textlength(line, font=font) <= width for line in lines)
            if fits:
                break
        if not fits:
            region["qa"] = list(dict.fromkeys([*region["qa"], "textOverflow"]))
            raise ValueError("textOverflow")
        color = style["color"]
        if vertical:
            start_x = x + width - line_height
            for column, line in enumerate(lines):
                for row, char in enumerate(line):
                    draw.text((start_x - column * line_height, y + row * line_height), char, font=font, fill=color, anchor="lt")
        else:
            start_y = y + (height - len(lines) * line_height) / 2
            for row, line in enumerate(lines):
                line_width = draw.textlength(line, font=font)
                offset = 0 if style["align"] == "left" else width - line_width if style["align"] == "right" else (width - line_width) / 2
                draw.text((x + offset, start_y + row * line_height), line, font=font, fill=color, anchor="lt")
    return cv2.cvtColor(np.array(canvas), cv2.COLOR_RGB2BGR)


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pdfDpi: int = Field(default=PDF_DPI, ge=72, le=600)
    firstPage: int = Field(default=1, ge=1)
    lastPage: int | None = Field(default=None, ge=1)
    firstFrame: bool = False
    paths: list[str] = Field(min_length=1, max_length=1000)
    title: str = Field(min_length=1, max_length=200)
    projectId: UUID | None = None
    chapterId: UUID | None = None


class RunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expectedRevision: int = Field(ge=0)
    jobId: UUID = Field(default_factory=uuid4)
    pageIds: list[UUID] = Field(min_length=1, max_length=1000)
    stage: Literal["full", "ocr", "translate", "repair", "layout"]
    model: str = Field(max_length=512)
    ocrResourceId: str = Field(default="pp-ocrv5-mobile-onnx", max_length=200)
    glossary: dict = Field(default_factory=dict)


class ExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["images", "cbz", "project", "pdf", "epub", "png", "json", "labelplus"]
    layer: Literal["source", "rendered"] = "rendered"
    pageIds: list[UUID] | None = Field(default=None, min_length=1, max_length=1000)


class DirectoryExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    directory: str = Field(min_length=1, max_length=32767)
    layer: Literal["source", "rendered"] = "rendered"
    pageIds: list[UUID] | None = Field(default=None, min_length=1, max_length=1000)


class ComicService:
    def __init__(self, root: Path, ocr, font_path: Path):
        self.repository = ComicRepository(root)
        self.ocr = ocr
        self.font_path = font_path
        self.tasks: dict[str, asyncio.Task] = {}
        self.cancellations: set[str] = set()

    def run(self, project_id: str, request: RunRequest, gateway, provider_options):
        if len(self.tasks) >= 4:
            raise ValueError('resourceBusy')
        project = self.repository.open(project_id)
        if project["revision"] != request.expectedRevision:
            raise ValueError("conflict")
        if any(job["state"] == "running" for job in project["jobs"]):
            raise ValueError("jobRunning")
        with self.repository.connection() as db:
            if db.execute('SELECT 1 FROM jobs WHERE id=?', (str(request.jobId),)).fetchone():
                raise ValueError('jobExists')
        ids = [str(value) for value in request.pageIds]
        if len(set(ids)) != len(ids) or any(not any(page["id"] == value for page in project["pages"]) for value in ids):
            raise ValueError("pageNotFound")
        if request.stage in ("full", "repair") and project["config"].get("repairMethod") == "lama-manga":
            if self.ocr is None:
                raise ValueError("modelMissing")
            self.ocr.variant("lama-manga")._verify()
        job = {"id": str(request.jobId), "state": "running", "stage": request.stage, "completedPages": 0, "totalPages": len(ids)}
        self.repository.save_job(project_id, job, input_snapshot={'config': project['config'], 'request': request.model_dump(mode='json'),
            'sourceAssets': {page['id']: page['sourceAsset'] for page in project['pages'] if page['id'] in ids}})
        task = asyncio.create_task(self._run(project, request, gateway, provider_options, job))
        self.tasks[job["id"]] = task
        task.add_done_callback(lambda _: self.tasks.pop(job["id"], None))
        return self.repository.open(project_id)

    async def _run(self, project, request, gateway, provider_options, job):
        from .direct_inference import DirectMtRequest, run_direct_inference
        from .screen_ocr import OcrRequest

        project_id, revision = project["id"], project["revision"]
        neural_service = None
        try:
            if request.stage in ("full", "repair") and project["config"].get("repairMethod") == "lama-manga":
                candidate = self.ocr.variant("lama-manga")
                await candidate._lease_lock.acquire()
                neural_service = candidate
                await neural_service.load()
            for page_id in request.pageIds:
                if job["id"] in self.cancellations:
                    raise asyncio.CancelledError
                page = next(page for page in project["pages"] if page["id"] == str(page_id))
                original = await asyncio.to_thread(decode_image, self.repository.asset_path(project_id, page["id"], "source").read_bytes())
                if request.stage in ("full", "ocr"):
                    if self.ocr is None:
                        raise ValueError("ocrUnavailable")
                    if any(region["locked"] for region in page["regions"]):
                        if request.stage == "ocr":
                            raise ValueError("lockedRegions")
                    else:
                        job["stage"] = "ocr"; self.repository.save_job(project_id, job)
                        result = await self.ocr.variant(request.ocrResourceId).infer(OcrRequest(
                            image="data:image/png;base64," + base64.b64encode(encode_image(original)).decode(),
                            language=project["config"]["sourceLanguage"], task_mode="offline"))
                        page["regions"] = await asyncio.to_thread(detect_comic_regions, original, result['blocks'], project['config']['readingDirection'])
                        page["status"] = "recognized"
                        page.pop("cleanAsset", None); page.pop("renderedAsset", None)
                        page["hasClean"] = page["hasRendered"] = False
                        if job["id"] in self.cancellations:
                            raise asyncio.CancelledError
                        revision = self.repository.publish_page(project_id, revision, page)
                if request.stage in ("full", "translate"):
                    if not page["regions"]:
                        raise ValueError("noRegions")
                    if gateway is None or not request.model:
                        raise ValueError("translationModelMissing")
                    job["stage"] = "translate"; self.repository.save_job(project_id, job)
                    for region in page["regions"]:
                        if job["id"] in self.cancellations:
                            raise asyncio.CancelledError
                        if region["locked"] or region["ignored"] or not region["sourceText"].strip():
                            continue
                        terms = resolve_comic_terms(request.glossary, project["config"]["glossary"], project_id, region["sourceText"], project["config"]["targetLanguage"])
                        result = await run_direct_inference(gateway, DirectMtRequest(id=uuid4(), model=request.model, kind="mt", text=region["sourceText"],
                            source=project["config"]["sourceLanguage"], target=project["config"]["targetLanguage"], glossary=terms), provider_options=provider_options)
                        if not result.text.strip():
                            raise ValueError("emptyTranslation")
                        region["targetText"] = result.text
                        region["qa"] = ["glossaryMismatch"] if any((term.source if term.mode == "keep" else term.target) not in result.text for term in terms) else []
                        self.repository.save_job(project_id, job, candidate=page)
                    page["status"] = "translated"
                    page.pop("cleanAsset", None); page["hasClean"] = False
                    page.pop("renderedAsset", None); page["hasRendered"] = False
                    if job["id"] in self.cancellations:
                        raise asyncio.CancelledError
                    revision = self.repository.publish_page(project_id, revision, page)
                if request.stage in ("full", "repair"):
                    job["stage"] = "repair"; self.repository.save_job(project_id, job)
                    neural = project["config"].get("repairMethod") == "lama-manga"
                    cleaned, mask = await asyncio.to_thread(repair_page, original, page["regions"], page.get('maskStrokes'), mask_only=neural)
                    if neural:
                        cleaned = await neural_service.repair(original, mask)
                    page["cleanAsset"] = self.repository.asset(encode_image(cleaned)); page["hasClean"] = True
                    page.pop("renderedAsset", None); page["hasRendered"] = False
                    if job["id"] in self.cancellations:
                        raise asyncio.CancelledError
                    revision = self.repository.publish_page(project_id, revision, page)
                if request.stage in ("full", "layout"):
                    job["stage"] = "layout"; self.repository.save_job(project_id, job)
                    if not page["hasClean"]:
                        raise ValueError("repairRequired")
                    cleaned = decode_image(self.repository.asset_path(project_id, page["id"], "clean").read_bytes())
                    rendered = await asyncio.to_thread(render_page, cleaned, page["regions"], self.font_path)
                    page["renderedAsset"] = self.repository.asset(encode_image(rendered)); page["hasRendered"] = True; page["status"] = "rendered"
                    if job["id"] in self.cancellations:
                        raise asyncio.CancelledError
                    revision = self.repository.publish_page(project_id, revision, page)
                job["completedPages"] += 1
                self.repository.save_job(project_id, job)
            job["state"] = "completed"
        except asyncio.CancelledError:
            job["state"] = "cancelled"
        except Exception as error:
            job["state"] = "failed"
            known = {"ocrUnavailable", "lockedRegions", "noRegions", "translationModelMissing", "emptyTranslation", "maskNeedsReview", "fontMissing", "textOverflow", "repairRequired", "editConflict", "modelNotLoaded", "modelMissing", "runtimeUnavailable", "inpaintFailed", "modelCorrupt", "resourceBusy", "glossaryBudgetExceeded"}
            job["error"] = str(error) if str(error) in known else "processingFailed"
        finally:
            if neural_service is not None:
                try:
                    await neural_service.release()
                finally:
                    neural_service._lease_lock.release()
            self.cancellations.discard(job["id"])
            self.repository.save_job(project_id, job)

    async def close(self):
        self.cancellations.update(self.tasks)
        if self.tasks:
            await asyncio.gather(*self.tasks.values(), return_exceptions=True)


def build_comic_router(service: ComicService) -> APIRouter:
    router = APIRouter(prefix="/comics")

    def invoke(function, *args):
        try:
            return function(*args)
        except (ValueError, TypeError, KeyError) as error:
            code = str(error)
            raise HTTPException(409 if code in ("conflict", "jobRunning", "editConflict") else 400, detail=code if re.fullmatch(r"[A-Za-z]{1,60}", code) else "invalidRequest") from None
        except (OSError, sqlite3.Error, zipfile.BadZipFile):
            raise HTTPException(500, detail="comicIoFailed") from None

    @router.get("/projects")
    async def list_projects():
        return invoke(service.repository.list)

    @router.get("/projects/{project_id}")
    async def open_project(project_id: UUID):
        return invoke(service.repository.open, str(project_id))

    @router.post("/import")
    async def import_project(body: ImportRequest):
        return await asyncio.to_thread(invoke, service.repository.import_sources, body.paths, body.title,
                                       str(body.projectId) if body.projectId else None, str(body.chapterId) if body.chapterId else None,
                                       body.pdfDpi, body.firstPage, body.lastPage, body.firstFrame)

    @router.post("/edit")
    async def edit_project(request: Request):
        body = await request.body()
        if len(body) > 1024 * 1024:
            raise HTTPException(413, detail="inputTooLarge")
        try:
            parsed = json.loads(body)
        except (ValueError, UnicodeError):
            raise HTTPException(400, detail='invalidRequest') from None
        return invoke(service.repository.edit, parsed)

    @router.post("/projects/{project_id}/run")
    async def run_project(project_id: UUID, body: RunRequest, request: Request):
        from .api import cloud_mt_options
        options = cloud_mt_options(request.headers)
        return invoke(service.run, str(project_id), body, request.app.state.backend.gateway, options)

    @router.post("/projects/{project_id}/jobs/{job_id}/cancel")
    async def cancel_project(project_id: UUID, job_id: UUID):
        project = invoke(service.repository.open, str(project_id))
        if not any(job["id"] == str(job_id) for job in project["jobs"]):
            raise HTTPException(404, detail="jobNotFound")
        service.cancellations.add(str(job_id))
        return project

    @router.get("/projects/{project_id}/pages/{page_id}/{kind}")
    async def image(project_id: UUID, page_id: UUID, kind: Literal["source", "clean", "rendered"], max_pixels: int | None = Query(default=None, ge=10000, le=4_000_000)):
        path = invoke(service.repository.asset_path, str(project_id), str(page_id), kind)
        if max_pixels is None:
            return FileResponse(path, media_type="image/png")
        def thumbnail():
            import cv2
            pixels = decode_image(path.read_bytes())
            height, width = pixels.shape[:2]
            scale = min(1, (max_pixels / (height * width)) ** 0.5, 1600 / max(height, width))
            if scale < 1:
                pixels = cv2.resize(pixels, (max(1, int(width * scale)), max(1, int(height * scale))), interpolation=cv2.INTER_AREA)
            return encode_image(pixels), pixels.shape[1], pixels.shape[0]
        data, width, height = await asyncio.to_thread(thumbnail)
        return Response(data, media_type="image/png", headers={"x-image-width": str(width), "x-image-height": str(height)})

    @router.post("/projects/{project_id}/export-directory")
    async def export_directory(project_id: UUID, body: DirectoryExportRequest):
        await asyncio.to_thread(invoke, service.repository.export, str(project_id), "directory",
                                [str(value) for value in body.pageIds] if body.pageIds else None, body.layer, body.directory)
        return {"ok": True}

    @router.post("/projects/{project_id}/export")
    async def export_project(project_id: UUID, body: ExportRequest):
        from starlette.background import BackgroundTask
        path = await asyncio.to_thread(invoke, service.repository.export, str(project_id), body.kind, [str(value) for value in body.pageIds] if body.pageIds else None, body.layer)
        media = {"pdf": "application/pdf", "epub": "application/epub+zip", "png": "image/png", "json": "application/json"}
        return FileResponse(path, media_type=media.get(body.kind, "application/zip"), background=BackgroundTask(path.unlink, missing_ok=True))

    return router
