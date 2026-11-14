"""Managed comic projects, durable edits and cancellable offline page processing."""
from __future__ import annotations

import asyncio
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import io
import json
import logging
import math
import os
from pathlib import Path
import re
import sqlite3
from tempfile import TemporaryDirectory
import threading
from typing import Literal
from uuid import UUID, uuid4
import zipfile

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from ..models.ocr_catalog import COMIC_DETECTOR_ID
from .glossary import resolve_comic_terms

from .comic_formats import (MAX_PAGE_BYTES, MAX_IMPORT_BYTES, MAX_PDF_BYTES, MAX_PIXELS, MAX_PROJECT_BYTES, PDF_DPI, epub_pages,
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
    fontSize: int = Field(ge=6, le=2000)
    autoFontSize: bool | None = None
    angle: float = Field(default=0, ge=-180, le=180)
    fontFamily: str | None = Field(default=None, max_length=200, pattern=r'^[^/\\:]*$')
    fontWeight: int = Field(default=400, ge=100, le=900)
    fontStyle: Literal['normal', 'italic'] = 'normal'
    strokeColor: str = Field(default='#ffffff', pattern=r'^#[0-9a-fA-F]{6}$')
    strokeWidth: float = Field(default=0, ge=0, le=100)
    lineSpacing: float = Field(default=1.15, ge=.5, le=3)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    direction: Literal["horizontal", "vertical-rl"]
    align: Literal["left", "center", "right"]


class ComicConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sourceLanguage: str = Field(min_length=1, max_length=32)
    targetLanguage: str = Field(min_length=1, max_length=32)
    model: str = Field(max_length=512)
    readingDirection: Literal["rtl", "ltr"]
    detector: Literal["auto", "ppocr", "rtdetr", "rfdetr-seg"] = "auto"
    ocr: Literal["auto", "ppocr", "manga-ocr", "baberu", "ppocrv6", "paddleocr-vl"] = "auto"
    repairMethod: Literal["auto", "telea", "lama", "lama-manga"] = "auto"
    glossary: dict
    executionProviders: dict[Literal['detector','ocr','repair'],Literal['cpu','cuda','dml']] = Field(default_factory=dict)


def validate_artboard(value):
    allowed={'x','y','name','visible','locked','expanded'}
    if not isinstance(value,dict) or not {'x','y'}<=set(value)<=allowed:
        raise ValueError('invalidGeometry')
    if any(type(value[key]) not in (int,float) or not math.isfinite(value[key])
           or not -1_000_000<=value[key]<=1_000_000 for key in ('x','y')):
        raise ValueError('invalidGeometry')
    result={key:float(value[key]) for key in ('x','y')}
    if 'name' in value:
        if not isinstance(value['name'],str) or not 1<=len(value['name'].strip())<=200:
            raise ValueError('invalidGeometry')
        result['name']=value['name'].strip()
    for flag in ('visible','locked','expanded'):
        if flag in value:
            if type(value[flag]) is not bool:
                raise ValueError('invalidGeometry')
            result[flag]=value[flag]
    return result


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
              'deleteRegion': {'pageId', 'regionId'}, 'moveRegion': {'pageId', 'regionId', 'index'},
              'addChapter': {'title'}, 'movePage': {'pageId', 'chapterId', 'index'},
              'deletePage': {'pageId'}, 'paintMask': {'pageId', 'stroke'}, 'clearMask': {'pageId'}, 'saveMask': {'pageId','stroke'}, 'deleteMask': {'pageId','strokeId'},
              'deleteRepairLayer': {'pageId','layerId'}, 'eraseRepairArea': {'pageId','polygon'}, 'setRepairLayer': {'pageId','layerId','name','visible','opacity'}, 'setBackground': {'pageId','visible'}, 'setArtboard': {'pageId','artboard'},
              'saveDrawingLayer': {'pageId','layer'}, 'deleteDrawingLayer': {'pageId','layerId'},
              'moveDrawingLayer': {'pageId','layerId','index'}, 'undo': set(), 'redo': set()}
    command_keys = set(command) - ({'x', 'y'} if action == 'setRepairLayer' else set())
    if action not in fields or command_keys != {'action'} | fields[action]:
        raise ValueError('invalidCommand')
    for key in ('pageId', 'regionId', 'chapterId','strokeId','layerId'):
        if key in command:
            UUID(command[key])
    if 'title' in command and (not isinstance(command['title'], str) or not 1 <= len(command['title'].strip()) <= 200):
        raise ValueError('invalidTitle')
    if action == 'setArtboard':
        validate_artboard(command['artboard'])
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
    if action in ('movePage', 'moveRegion','moveDrawingLayer') and (type(command['index']) is not int
            or not 0 <= command['index'] <= (1000 if action == 'movePage' else 2048)):
        raise ValueError('invalidIndex')
    return request


class ComicTextRun(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    start: int = Field(ge=0)
    end: int = Field(gt=0)
    style: dict


class ComicResolvedLayout(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    fontSize: int = Field(ge=6, le=2000)
    lineHeight: float = Field(gt=0)
    x: float
    y: float
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    fontFamily: str | None = None
    fontWeight: int | None = None
    fontStyle: Literal["normal", "italic"] | None = None
    lines: list[str]
    text: str
    direction: Literal['horizontal', 'vertical-rl']
    angle: float = Field(ge=-180, le=180)


class ComicFontCandidate(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    family: str = Field(min_length=1, max_length=200)
    confidence: float = Field(ge=0, le=1)


class ComicFontMatch(ComicFontCandidate):
    model: Literal['storia','yuzu'] | None = None
    serif: bool | None = None
    substitution: Literal['exact','category'] | None = None
    candidates: list[ComicFontCandidate] = Field(min_length=1, max_length=5)
    matchedFamily: str | None = Field(default=None, max_length=200)
    matchedConfidence: float | None = Field(default=None, ge=0, le=1)
    rank: int | None = Field(default=None, ge=1, le=5)


class ComicRegion(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: UUID
    name: str | None = Field(default=None,min_length=1,max_length=200)
    sourceText: str = Field(max_length=64000)
    targetText: str | None = Field(max_length=64000)
    x: float = Field(ge=0)
    y: float = Field(ge=0)
    width: float = Field(gt=0)
    height: float = Field(gt=0)
    sourceQuad: list[tuple[float, float]] | None = Field(default=None, min_length=4, max_length=4)
    sourceLines: list[list[tuple[float, float]]] | None = Field(default=None, min_length=1, max_length=256)
    repairPolygon: list | None = None
    sourceStyle: ComicStyle | None = None
    fontMatch: ComicFontMatch | None = None
    textRuns: list[ComicTextRun] | None = Field(default=None, max_length=2048)
    resolvedLayout: ComicResolvedLayout | None = None
    confidence: float | None = Field(ge=0, le=1)
    locked: bool
    ignored: bool
    kind: Literal['text','dialogue','artwork'] = 'text'
    opacity: float = Field(default=1,ge=0,le=1)
    visible: bool = True
    editLocked: bool = False
    manuallyEdited: bool = False
    style: ComicStyle
    qa: list[str] = Field(max_length=20)


class ComicRepairLayer(BaseModel):
    model_config=ConfigDict(extra='forbid',allow_inf_nan=False)
    id: UUID
    regionId: UUID | None = None
    origin: Literal['auto', 'manual'] | None = None
    name: str = Field(min_length=1,max_length=200)
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    visible: bool
    opacity: float = Field(ge=0,le=1)


class ComicMaskStroke(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    id: UUID
    mode: Literal['erase', 'restore']
    size: float = Field(ge=1, le=200)
    name: str | None = Field(default=None,max_length=200)
    visible: bool | None = None
    opacity: float | None = Field(default=None,ge=0,le=1)
    polygon: list | None = Field(default=None,min_length=1,max_length=2000)
    points: list[tuple[float, float]] = Field(min_length=1, max_length=2000)


def validate_comic_polygon(raw,page):
    from .comic_selection import validate_selection
    return validate_selection(raw,page['width'],page['height'])


def comic_mask_point_count(stroke):
    polygon=stroke.get('polygon') or []
    count=sum(len(operation['points']) for operation in polygon) if polygon and isinstance(polygon[0],dict) else len(polygon)
    return len(stroke['points'])+count


def validate_stroke(raw: dict, page: dict) -> dict:
    value = ComicMaskStroke.model_validate(raw).model_dump(mode='json',exclude_none=True)
    if value.get('polygon'):
        value['polygon']=validate_comic_polygon(value['polygon'],page)
    if any(not 0 <= x < page['width'] or not 0 <= y < page['height'] for x, y in value['points']):
        raise ValueError('invalidGeometry')
    return value


def validate_region(region: dict, page: dict) -> dict:
    value = ComicRegion.model_validate(region).model_dump(mode="json", exclude_none=False)
    for key in ('sourceStyle', 'textRuns', 'resolvedLayout', 'repairPolygon', 'fontMatch'):
        if value.get(key) is None:
            value.pop(key, None)
    for nested in ('sourceStyle', 'fontMatch', 'resolvedLayout'):
        if nested in value:
            value[nested] = {key: item for key, item in value[nested].items() if item is not None}
    if value.get('repairPolygon') is not None:
        value['repairPolygon'] = validate_comic_polygon(value['repairPolygon'], page)
    allowed = {'fontFamily','fontSize','fontWeight','fontStyle','color','strokeColor','strokeWidth'}
    last = 0
    for run in value.get('textRuns', []):
        if run['start'] < last or not run['start'] < run['end'] <= len(value['targetText'] or '') or not set(run['style']) <= allowed:
            raise ValueError('invalidTextRuns')
        ComicStyle.model_validate({**value['style'], **run['style']})
        last = run['end']
    if value.get('name') is None:
        value.pop('name',None)
    else:
        value['name']=value['name'].strip()
        if not value['name']:
            raise ValueError('invalidRegionName')
    if value['style'].get('fontFamily') is None:
        value['style'].pop('fontFamily',None)
    if value["style"]["autoFontSize"] is None:
        value["style"].pop("autoFontSize")
    if value["x"] + value["width"] > page["width"] + 0.01 or value["y"] + value["height"] > page["height"] + 0.01:
        raise ValueError("invalidGeometry")
    if value["sourceQuad"] is None:
        value.pop("sourceQuad")
    elif any(not 0 <= x <= page["width"] or not 0 <= y <= page["height"] for x, y in value["sourceQuad"]):
        raise ValueError("invalidGeometry")
    if value["sourceLines"] is None:
        value.pop("sourceLines")
    elif any(len(line) != 4 or any(not 0 <= x <= page["width"] or not 0 <= y <= page["height"]
                                   for x, y in line) for line in value["sourceLines"]):
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
                CREATE TABLE IF NOT EXISTS deleted_projects(id TEXT PRIMARY KEY);
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

    @staticmethod
    def _ensure_artboards(project):
        # Baseline positions depend on page order, never on another board's move.
        x = 0
        for page in project['pages']:
            if 'artboard' not in page:
                page['artboard'] = {'x': x, 'y': 0}
            x += page['width'] + 100

    def _load(self, db, project_id):
        if db.execute('SELECT 1 FROM deleted_projects WHERE id=?', (str(UUID(project_id)),)).fetchone():
            raise ValueError('projectNotFound')
        row = db.execute("SELECT body FROM projects WHERE id=?", (str(UUID(project_id)),)).fetchone()
        if not row:
            raise ValueError("projectNotFound")
        project = json.loads(row[0])
        self._ensure_artboards(project)
        legacy = [region for page in project['pages'] for region in page['regions']
                  if 'manuallyEdited' not in region]
        if legacy:
            edited = set()
            for saved, in db.execute('SELECT request FROM operations'):
                operation = json.loads(saved)
                command = operation.get('command', {})
                if operation.get('projectId') == project_id and command.get('action') == 'saveRegion':
                    edited.add(command['region']['id'])
            for region in legacy:
                region['manuallyEdited'] = region['id'] in edited
        return project

    def _save(self, db, project):
        self._ensure_artboards(project)
        project["updatedAt"] = now()
        project["pageCount"] = len(project["pages"])
        project["chapterCount"] = len(project["chapters"])
        db.execute("INSERT OR REPLACE INTO projects VALUES(?,?)", (project["id"], json.dumps(project, ensure_ascii=False)))

    def list(self):
        with self.connection() as db:
            projects = [json.loads(row[0]) for row in db.execute("SELECT body FROM projects WHERE id NOT IN (SELECT id FROM deleted_projects)")]
        return [{key: project[key] for key in ("id", "title", "revision", "updatedAt", "pageCount", "chapterCount")} for project in sorted(projects, key=lambda item: item["updatedAt"], reverse=True)]

    def open(self, project_id):
        with self.connection() as db:
            project = self._load(db, project_id)
            project["jobs"] = [json.loads(row[0]) for row in db.execute("SELECT body FROM jobs WHERE project_id=? ORDER BY rowid DESC LIMIT 30", (project_id,))]
            project["canUndo"] = db.execute("SELECT 1 FROM edits WHERE project_id=? AND undone=0 LIMIT 1", (project_id,)).fetchone() is not None
            project["canRedo"] = db.execute("SELECT 1 FROM edits WHERE project_id=? AND undone=1 LIMIT 1", (project_id,)).fetchone() is not None
            return project

    def delete(self, project_id):
        return self.delete_many([project_id])

    def delete_many(self, project_ids):
        with self.connection() as db:
            for project_id in project_ids:
                self._load(db, project_id)
                if any(json.loads(row[0]).get('state') == 'running' for row in db.execute('SELECT body FROM jobs WHERE project_id=?', (project_id,))):
                    raise ValueError('jobRunning')
            db.executemany('INSERT INTO deleted_projects VALUES (?)', ((project_id,) for project_id in project_ids))
        return {'deleted': True}

    def restore(self, project_id):
        return self.restore_many([project_id])

    def restore_many(self, project_ids):
        with self.connection() as db:
            for project_id in project_ids:
                if not db.execute('SELECT 1 FROM deleted_projects WHERE id=?', (str(UUID(project_id)),)).fetchone():
                    raise ValueError('projectNotFound')
            db.executemany('DELETE FROM deleted_projects WHERE id=?', ((project_id,) for project_id in project_ids))
        return {'restored': True}

    def asset(self, data: bytes, suffix: str = 'png', directory: Path | None = None) -> str:
        digest = hashlib.sha256(data).hexdigest()
        if suffix not in ('png', 'original'):
            raise ValueError('invalidAsset')
        stored = self.root / "assets" / f"{digest}.{suffix}"
        path = directory / stored.name if directory is not None else stored
        if not stored.exists() and not path.exists():
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
        digest = page.get({"source": "sourceAsset", "clean": "cleanAsset", "rendered": "renderedAsset", "detector":"detectorMaskAsset"}[kind])
        if not digest or not re.fullmatch(r"[a-f0-9]{64}", digest):
            raise ValueError("assetMissing")
        path = self.root / "assets" / f"{digest}.png"
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError("assetIntegrity")
        return path

    def repair_layer_path(self,page,identifier):
        digest=page.get('repairAssets',{}).get(identifier)
        if not isinstance(digest,str) or not re.fullmatch(r'[a-f0-9]{64}',digest):
            raise ValueError('assetMissing')
        path=self.root/'assets'/f'{digest}.png'
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:
            raise ValueError('assetIntegrity')
        return path

    def import_sources(self, paths: list[str], title: str, project_id=None, chapter_id=None,
                       dpi=PDF_DPI, first=1, last=None, first_frame=False):
        if len(paths) == 1 and Path(paths[0]).suffix.lower() == '.nola-comic':
            if project_id:
                raise ValueError('projectImportMustCreate')
            return self.import_project(Path(paths[0]))
        with TemporaryDirectory(prefix=".import-", dir=self.root) as staging:
            return self._import_sources(paths, title, project_id, chapter_id, dpi, first, last, first_frame, Path(staging))

    def _import_sources(self, paths, title, project_id, chapter_id, dpi, first, last, first_frame, staging):
        sources = []
        imported_chapters = {}
        current_chapter = None
        direction = "rtl"
        total = pdf_total = 0

        def save_page(name, image, encoded, original):
            if len(sources) >= 1000:
                raise ValueError("importTooLarge")
            digest = self.asset(encoded, directory=staging)
            sources.append((name, image.shape[1], image.shape[0], digest, original, current_chapter))

        def append_page(name, data, original=None):
            nonlocal total
            total += len(data)
            if total > MAX_IMPORT_BYTES or len(sources) >= 1000:
                raise ValueError("importTooLarge")
            image = decode_image(data)
            save_page(name, image, encode_image(image), original or self.asset(data, 'original', staging))

        def append(name, data):
            from PIL import Image
            if len(data) > MAX_PAGE_BYTES:
                raise ValueError("imageTooLarge")
            with Image.open(io.BytesIO(data)) as image:
                if image.format in ("GIF", "TIFF") or image.format == "WEBP" and image.is_animated:
                    original = self.asset(data, "original", staging)
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
            is_pdf = path.is_file() and path.suffix.lower() == ".pdf"
            if path.is_file() and path.stat().st_size > (MAX_PDF_BYTES if is_pdf else MAX_IMPORT_BYTES):
                raise ValueError("importTooLarge")
            if is_pdf:
                import cv2
                import numpy as np
                for name, rgb in pdf_pages(path, dpi, first, last):
                    image = cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2BGR)
                    encoded = encode_image(image)
                    pdf_total += len(encoded)
                    if pdf_total > MAX_PDF_BYTES:
                        raise ValueError("importTooLarge")
                    save_page(name, image, encoded, None)
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
                page = {"id": str(uuid4()), "chapterId": page_chapter, "name": name, "width": width, "height": height,
                        "regions": [], "status": "imported", "sourceAsset": digest, "hasClean": False, "hasRendered": False}
                if original:
                    page["originalAsset"] = original
                project["pages"].append(page)
            project["revision"] += 1
            self._save(db, project)
            for asset in staging.iterdir():
                destination = self.root / "assets" / asset.name
                if not destination.exists():
                    os.replace(asset, destination)
            db.execute('DELETE FROM edits WHERE project_id=?', (project['id'],))
        return self.open(project["id"])

    def import_project(self, path: Path):
        with zipfile.ZipFile(path) as archive:
            validate_archive(archive, MAX_PROJECT_BYTES)
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
                if 'artboard' in source:
                    page['artboard']=validate_artboard(source['artboard'])
                for field, flag in [('sourceAsset', None), ('cleanAsset', 'hasClean'), ('renderedAsset', 'hasRendered'),('detectorMaskAsset',None)]:
                    digest = source.get(field)
                    if not digest and (flag or field!='sourceAsset'):
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
                region_ids={}
                for region in source['regions']:
                    value = validate_region(region, page)
                    value['id'] = str(uuid4())
                    region_ids[region['id']]=value['id']
                    page['regions'].append(value)
                if source.get('repairLayers'):
                    if len(source['repairLayers'])>4096:
                        raise ValueError('invalidProject')
                    page['repairLayers']=[];page['repairAssets']={}
                    for raw in source['repairLayers']:
                        value=ComicRepairLayer.model_validate(raw).model_dump(mode='json',exclude_none=True)
                        if value['x']+value['width']>page['width'] or value['y']+value['height']>page['height']:
                            raise ValueError('invalidGeometry')
                        digest=source.get('repairAssets',{}).get(value['id'])
                        if not isinstance(digest,str) or not re.fullmatch(r'[a-f0-9]{64}',digest):
                            raise ValueError('assetIntegrity')
                        info=archive.getinfo(f'assets/{digest}.png')
                        if info.file_size>MAX_PAGE_BYTES or info.file_size>max(info.compress_size,1)*300:
                            raise ValueError('unsafeArchive')
                        data=archive.read(info)
                        import cv2
                        import numpy as np
                        patch=cv2.imdecode(np.frombuffer(data,np.uint8),cv2.IMREAD_UNCHANGED)
                        if hashlib.sha256(data).hexdigest()!=digest or patch is None or patch.shape!=(value['height'],value['width'],4):
                            raise ValueError('assetIntegrity')
                        value['id']=str(uuid4())
                        if value.get('regionId'):
                            value['regionId']=region_ids.get(value['regionId'])
                            if value['regionId'] is None:
                                value.pop('regionId')
                        page['repairLayers'].append(value);page['repairAssets'][value['id']]=self.asset(data)
                if source.get('backgroundVisible') is False:
                    page['backgroundVisible']=False
                if source.get('maskStrokes'):
                    if len(source['maskStrokes'])>1000:
                        raise ValueError('maskTooLarge')
                    page['maskStrokes']=[validate_stroke(stroke,page) for stroke in source['maskStrokes']]
                    if sum(comic_mask_point_count(stroke) for stroke in page['maskStrokes'])>20000:
                        raise ValueError('maskTooLarge')
                if source.get('drawingLayers'):
                    from .comic_layers import validate_drawing_layer
                    if len(source['drawingLayers'])>256:
                        raise ValueError('tooManyLayers')
                    page['drawingLayers']=[validate_drawing_layer(layer,page) for layer in source['drawingLayers']]
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
                if action=='setArtboard':
                    page['artboard']=validate_artboard(command['artboard'])
                elif action=='deleteRepairLayer':
                    identifier=command['layerId']
                    if not any(layer['id']==identifier for layer in page.get('repairLayers',[])):
                        raise ValueError('layerNotFound')
                    page['repairLayers']=[layer for layer in page['repairLayers'] if layer['id']!=identifier]
                    page.get('repairAssets',{}).pop(identifier,None)
                    page['cleanAsset']=self.asset(encode_image(composite_repair_layers(self,page)));page['hasClean']=True
                    page.pop('renderedAsset',None);page['hasRendered']=False
                elif action=='eraseRepairArea':
                    import cv2
                    import numpy as np
                    from .comic_selection import selection_mask
                    selected_page=selection_mask(command['polygon'],page['width'],page['height'])
                    if not page.get('repairLayers') and page.get('hasClean'):
                        source_image=decode_image(self._page_asset(page,'source').read_bytes())
                        clean_image=decode_image(self._page_asset(page,'clean').read_bytes())
                        append_repair_layer(self,page,clean_image,(np.any(source_image!=clean_image,axis=2).astype(np.uint8)*255),'Repair')
                    for layer in page.get('repairLayers',[]):
                        patch=cv2.imdecode(np.frombuffer(self.repair_layer_path(page,layer['id']).read_bytes(),np.uint8),cv2.IMREAD_UNCHANGED)
                        if patch is None or patch.shape!=(layer['height'],layer['width'],4):
                            raise ValueError('assetIntegrity')
                        selected=selected_page[layer['y']:layer['y']+layer['height'],layer['x']:layer['x']+layer['width']]
                        if selected.any():
                            layer['origin']='manual'
                        patch[:,:,3][selected>0]=0
                        page['repairAssets'][layer['id']]=self.asset(encode_image(patch))
                    page['cleanAsset']=self.asset(encode_image(composite_repair_layers(self,page)));page['hasClean']=True
                    page.pop('renderedAsset',None);page['hasRendered']=False
                elif action=='setRepairLayer':
                    layer=next((item for item in page.get('repairLayers',[]) if item['id']==command['layerId']),None)
                    if layer is None:
                        raise ValueError('layerNotFound')
                    if (not isinstance(command['name'],str) or not 1<=len(command['name'].strip())<=200
                            or type(command['visible']) is not bool or type(command['opacity']) not in (int,float)
                            or not 0<=command['opacity']<=1):
                        raise ValueError('invalidCommand')
                    for axis, extent in (('x', 'width'), ('y', 'height')):
                        position = command.get(axis, layer[axis])
                        if type(position) is not int or not 0 <= position <= page[extent] - layer[extent]:
                            raise ValueError('invalidCommand')
                    layer.update(x=command.get('x',layer['x']), y=command.get('y',layer['y']),
                                 name=command['name'],visible=command['visible'],opacity=command['opacity'],origin='manual')
                    page['cleanAsset']=self.asset(encode_image(composite_repair_layers(self,page)));page['hasClean']=True
                    page.pop('renderedAsset',None);page['hasRendered']=False
                elif action=='setBackground':
                    if type(command['visible']) is not bool:
                        raise ValueError('invalidCommand')
                    page['backgroundVisible']=command['visible']
                    page.pop('renderedAsset',None);page['hasRendered']=False
                elif action in ('saveDrawingLayer','deleteDrawingLayer','moveDrawingLayer'):
                    from .comic_layers import edit_drawing
                    edit_drawing(page,command)
                    page.pop('renderedAsset',None); page['hasRendered']=False
                elif action in ('paintMask', 'clearMask','saveMask','deleteMask'):
                    if action == 'clearMask':
                        page['maskStrokes'] = []
                    elif action=='deleteMask':
                        page['maskStrokes']=[stroke for stroke in page.get('maskStrokes',[]) if stroke['id']!=command['strokeId']]
                    else:
                        stroke = validate_stroke(command['stroke'], page)
                        strokes = page.setdefault('maskStrokes', [])
                        existing=next((index for index,item in enumerate(strokes) if item['id']==stroke['id']),None)
                        old_points=comic_mask_point_count(strokes[existing]) if existing is not None else 0
                        if len(strokes)+(existing is None) > 1000 or sum(comic_mask_point_count(item) for item in strokes)-old_points+comic_mask_point_count(stroke)>20000:
                            raise ValueError('maskTooLarge')
                        if existing is not None:
                            if action!='saveMask':
                                raise ValueError('duplicateStroke')
                            strokes[existing]=stroke
                        else:
                            strokes.append(stroke)
                    if page['status']=='rendered':
                        page['status']='translated'
                    page.pop('renderedAsset', None); page['hasRendered'] = False
                elif action == "saveRegion":
                    region = validate_region(command["region"], page)
                    previous = next((item for item in page['regions'] if item['id']==region['id']),None)
                    if previous and previous.get('editLocked'):
                        previous_value=ComicRegion.model_validate(previous).model_dump(mode='json')
                        next_value=ComicRegion.model_validate(region).model_dump(mode='json')
                        if next_value.pop('editLocked') or previous_value.pop('editLocked') is not True or previous_value!=next_value:
                            raise ValueError('regionEditLocked')
                    region['manuallyEdited'] = True
                    region.pop('resolvedLayout', None)
                    region['confidence'] = None
                    existing = next((index for index, item in enumerate(page["regions"]) if item["id"] == region["id"]), None)
                    if existing is None:
                        # New text is independent of the already-generated repair background.
                        page["regions"].append(region)
                    else:
                        previous = page['regions'][existing]
                        if previous['sourceText'] != region['sourceText']:
                            region['confidence'] = None
                        page["regions"][existing] = region
                    page.pop("renderedAsset", None); page["hasRendered"] = False
                elif action == "deleteRegion":
                    if any(item['id']==command['regionId'] and item.get('editLocked') for item in page['regions']):
                        raise ValueError('regionEditLocked')
                    if not any(item["id"] == command["regionId"] for item in page["regions"]):
                        raise ValueError("regionNotFound")
                    page["regions"] = [item for item in page["regions"] if item["id"] != command["regionId"]]
                    page.pop("renderedAsset", None); page["hasRendered"] = False
                elif action == "moveRegion":
                    if any(item['id']==command['regionId'] and item.get('editLocked') for item in page['regions']):
                        raise ValueError('regionEditLocked')
                    index = next((i for i, region in enumerate(page["regions"]) if region["id"] == command["regionId"]), None)
                    if index is None:
                        raise ValueError("regionNotFound")
                    page["regions"].insert(command["index"], page["regions"].pop(index))
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
            before = json.dumps(project)
            project["pages"][index] = page
            project["revision"] += 1
            db.execute("DELETE FROM edits WHERE project_id=? AND undone=1", (project_id,))
            self._save(db, project)
            operation = str(uuid4())
            db.execute("INSERT INTO edits(project_id,operation_id,request,before_body,after_body) VALUES(?,?,?,?,?)",
                       (project_id, operation, json.dumps({'action':'generatedPage','pageId':page['id']}), before, json.dumps(project)))
            return project["revision"]

    def save_job(self, project_id: str, job: dict, candidate=None, input_snapshot=None):
        with self.connection() as db:
            db.execute("INSERT INTO jobs(id,project_id,body,candidate) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,candidate=COALESCE(excluded.candidate,jobs.candidate)",
                       (job["id"], project_id, json.dumps(job), json.dumps(candidate) if candidate is not None else None))
            if input_snapshot is not None:
                db.execute('UPDATE jobs SET input_snapshot=? WHERE id=?', (json.dumps(input_snapshot, ensure_ascii=False), job['id']))

    def export(self, project_id: str, kind: str, page_ids: list[str] | None, layer="rendered", directory=None, quality=95):
        project = self.open(project_id)
        by_id={page['id']:page for page in project['pages']}
        if page_ids is not None and (len(page_ids)!=len(set(page_ids)) or any(identifier not in by_id for identifier in page_ids)):
            raise ValueError('pageNotFound')
        pages=project['pages'] if page_ids is None else [by_id[identifier] for identifier in page_ids]
        if not pages:
            raise ValueError('pageNotFound')
        if type(quality) is not int or not 1<=quality<=100:
            raise ValueError('invalidQuality')
        extension = {"images": "zip", "project": "nola-comic", "labelplus": "zip"}.get(kind, kind)
        if kind=='jpg' and len(pages)>1:
            extension='zip'
        target = self.root / "exports" / f"{uuid4()}.{extension}"

        def images():
            for page in pages:
                if layer == "rendered" and not page["hasRendered"]:
                    raise ValueError("pageNotRendered")
                if layer == "clean" and not page["hasClean"]:
                    raise ValueError("repairRequired")
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
            if kind=='jpg':
                from PIL import Image
                def jpeg(path):
                    image=Image.open(path).convert('RGBA')
                    white=Image.new('RGBA',image.size,'white');white.alpha_composite(image)
                    buffer=io.BytesIO();white.convert('RGB').save(buffer,format='JPEG',quality=quality)
                    return buffer.getvalue()
                if len(pages)==1:
                    target.write_bytes(jpeg(next(images())[1]))
                else:
                    with zipfile.ZipFile(target,'x',compression=zipfile.ZIP_STORED) as archive:
                        for index,(_,path) in enumerate(images(),1):
                            archive.writestr(f'{index:04}.jpg',jpeg(path))
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
                    chapters=[chapter for chapter in project['chapters'] if any(page['chapterId']==chapter['id'] for page in pages)]
                    selected={**project,'pages':pages,'pageCount':len(pages),'chapters':chapters,'chapterCount':len(chapters)}
                    archive.writestr("project.json", json.dumps({"schemaVersion": 1, "project": selected}, ensure_ascii=False))
                    digests = set()
                    for page in pages:
                        for field in ("sourceAsset", "cleanAsset", "renderedAsset", "detectorMaskAsset"):
                            if page.get(field):
                                digests.add(page[field])
                    for page in pages:
                        digests.update(page.get('repairAssets',{}).values())
                    for digest in digests:
                        archive.write(self.root / "assets" / f"{digest}.png", f"assets/{digest}.png")
                    for digest in {page['originalAsset'] for page in pages if page.get('originalAsset')}:
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


def source_quad(region):
    x, y, width, height = (region[key] for key in ("x", "y", "width", "height"))
    return region.get("sourceQuad") or [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]


def estimate_source_style(image, region, fonts=None):
    """Retain the detector's existing appearance estimate; no font-family recognition."""
    import numpy as np
    quads=[np.asarray(line,float) for line in region.get('sourceLines',[source_quad(region)])]
    sizes=[min(np.linalg.norm(line[1]-line[0]),np.linalg.norm(line[3]-line[0])) for line in quads]
    style={**(region.get('sourceStyle') or region['style']),'fontSize':max(6,min(2000,round(float(np.median(sizes))*.75))),
           'autoFontSize':True,'color':comic_text_color(image,quads)}
    return ComicStyle.model_validate(style).model_dump(mode='json',exclude_none=True)


def overlaps_source(first, second):
    def bounds(region):
        x, y = zip(*source_quad(region))
        return min(x), min(y), max(x), max(y)

    x, y, right, bottom = bounds(first)
    sx, sy, sr, sb = bounds(second)
    overlap = max(0, min(right, sr) - max(x, sx)) * max(0, min(bottom, sb) - max(y, sy))
    return overlap > 0.5 * min((right - x) * (bottom - y), (sr - sx) * (sb - sy))


def repair_page(image, regions: list[dict], strokes: list[dict] | None = None, *, mask_only=False, clean_only=False, detector_mask=None):
    import cv2
    import numpy as np

    mask = np.zeros(image.shape[:2], dtype=np.uint8)
    for region in regions:
        if region["ignored"] or not clean_only and (not region["targetText"] or region["targetText"] == region["sourceText"]):
            continue
        if region.get('repairPolygon') is not None:
            from .comic_selection import selection_mask
            mask |= selection_mask(region['repairPolygon'], image.shape[1], image.shape[0])
            continue
        quad = np.array(source_quad(region), dtype=np.int32)
        x, y, w, h = cv2.boundingRect(quad)
        x, y = max(0, x), max(0, y)
        w, h = min(w, image.shape[1] - x), min(h, image.shape[0] - y)
        crop = image[y:y + h, x:x + w]
        if w < 3 or h < 3:
            continue
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        _, threshold = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        source_color = comic_text_color(image, region.get('sourceLines', [quad]))
        foreground = [int(source_color[index:index+2],16) for index in (1,3,5)]
        foreground_luminance = sum(channel*weight for channel,weight in zip(foreground,(.299,.587,.114)))
        # Border intensity alone mistakes mid-gray sign backgrounds for light glyphs.
        glyphs = 255 - threshold if foreground_luminance < 127 else threshold
        polygon = np.zeros((h, w), np.uint8)
        source_lines=region.get('sourceLines',[quad])
        bubble_layout=(not region.get('manuallyEdited') and len(source_lines)>1
                       and (region['x']<x-1 or region['y']<y-1
                            or region['x']+region['width']>x+w+1 or region['y']+region['height']>y+h+1))
        # Lumina cleans complete dialogue text boxes, including gaps between OCR lines.
        mask_polygons=[quad] if bubble_layout else source_lines
        cv2.fillPoly(polygon, [np.asarray(line,dtype=np.int32)-[x,y] for line in mask_polygons],255)
        glyphs = cv2.bitwise_and(glyphs, polygon)
        if detector_mask is not None:
            predicted=cv2.bitwise_and(detector_mask[y:y+h,x:x+w],polygon)
            if np.count_nonzero(predicted)>=max(1,np.count_nonzero(polygon)*.01):
                glyphs=predicted
        count, labels, stats, _ = cv2.connectedComponentsWithStats(glyphs)
        filtered = np.zeros_like(glyphs)
        for index in range(1, count):
            left, top, width, height, area = stats[index]
            # Bubble borders and large illustration fills are not text strokes.
            precise = bool(region.get('sourceLines'))
            if 2 <= area <= w * h * (0.8 if precise else 0.3) and (precise or not (width >= w * 0.95 or height >= h * 0.95)):
                filtered[labels == index] = 255
        coverage = np.count_nonzero(filtered) / max(1, np.count_nonzero(polygon))
        if coverage < 0.001 or coverage > 0.45:
            if "maskNeedsReview" not in region["qa"]:
                region["qa"].append("maskNeedsReview")
            if not strokes or not any(stroke['mode'] == 'erase' and any(x <= px < x + w and y <= py < y + h for px, py in stroke['points']) for stroke in strokes):
                raise ValueError("maskNeedsReview")
            continue
        source_sizes = [min(np.ptp(np.asarray(line)[:,0]), np.ptp(np.asarray(line)[:,1]))
                        for line in region.get('sourceLines', [quad])]
        dilation = min(7, max(3, round(float(np.median(source_sizes)) * .08)))
        filtered = cv2.dilate(filtered, np.ones((dilation, dilation), np.uint8))
        mask[y:y + h, x:x + w] |= filtered
    for stroke in strokes or []:
        if stroke.get('visible') is False or stroke.get('opacity')==0:
            continue
        selected=np.zeros_like(mask)
        if stroke.get('polygon'):
            from .comic_selection import selection_mask
            selected=selection_mask(stroke['polygon'],image.shape[1],image.shape[0])
        else:
            points=np.rint(np.asarray(stroke['points'])).astype(np.int32)
            radius=max(1,round(stroke['size']/2))
            for point in points:
                cv2.circle(selected,tuple(point),radius,255,-1)
            if len(points)>1:
                cv2.polylines(selected,[points],False,255,radius*2)
        strength=1 if stroke.get('opacity') is None else stroke['opacity']
        coverage=selected.astype(np.float32)/255*strength
        previous=mask.astype(np.float32)
        updated=previous*(1-coverage) if stroke['mode']=='restore' else previous+(255-previous)*coverage
        mask=np.rint(updated).clip(0,255).astype(np.uint8)
    if mask_only:
        return image, mask
    # Telea repairs actual glyph pixels from their neighbours; no rectangle is filled.
    support=np.where(mask>0,255,0).astype(np.uint8)
    return cv2.inpaint(image,support,3,cv2.INPAINT_TELEA),mask


def preserve_bilingual_label(region, regions, target, terms=()):
    import unicodedata

    text = unicodedata.normalize('NFKC', region['sourceText']).strip()
    if terms or not target.startswith('zh') or region['style']['direction'] != 'vertical-rl' or not re.fullmatch(r'[A-Z][A-Z ]{1,31}', text):
        return False
    def bounds(item):
        points = source_quad(item)
        return min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)
    x,y,right,bottom = bounds(region)
    for other in regions:
        label = ''.join(other['sourceText'].split())
        if other is region or other['ignored'] or other['style']['direction'] != 'vertical-rl' or not re.fullmatch(r'[\u3400-\u9fff]{2,6}',label):
            continue
        ox,oy,orr,ob = bounds(other)
        height, other_height = bottom-y, ob-oy
        overlap = min(bottom,ob)-max(y,oy)
        gap = max(0,max(x,ox)-min(right,orr))
        if (min(height,other_height) > 0 and overlap > max(height,other_height)*.7
                and abs(y-oy) < min(height,other_height)*.2
                and gap < max(right-x,orr-ox)*1.5):
            return True
    return False


def validate_comic_translation(source, target):
    if len(target.strip()) > max(64, len(source.strip()) * 8):
        raise ValueError('translationNeedsReview')


def comic_detector_method(config, ocr):
    selection = config.get('detector', 'auto')
    if selection != 'auto':
        return selection
    from ..models.ocr_catalog import COMIC_DETECTOR
    models = getattr(ocr, 'models', None)
    return 'rtdetr' if models is not None and models.is_installed(COMIC_DETECTOR) else 'ppocr'


def comic_repair_method(config, ocr):
    selection=config.get('repairMethod','auto')
    if selection!='auto':
        return selection
    from ..models.inpaint_catalog import LAMA_MANGA
    from ..models import ocr_catalog
    models=getattr(ocr,'models',None)
    if models is not None:
        manga_onnx=getattr(ocr_catalog,'LAMA_MANGA_ONNX',None)
        ordinary=getattr(ocr_catalog,'LAMA_ONNX',None)
        if (manga_onnx is not None and models.is_installed(manga_onnx)) or models.is_installed(LAMA_MANGA):
            return 'lama-manga'
        if ordinary is not None and models.is_installed(ordinary):
            return 'lama'
    return 'telea'


def comic_model_variant(owner,resource_id,kind,config):
    provider=config.get('executionProviders',{}).get(kind,'cpu')
    return owner.variant(resource_id) if provider=='cpu' else owner.device_variant(resource_id,provider)


def comic_inpaint_resource(config,ocr):
    method=comic_repair_method(config,ocr)
    if method=='lama':
        return 'comic-lama-onnx'
    from ..models import ocr_catalog
    spec=getattr(ocr_catalog,'LAMA_MANGA_ONNX',None)
    models=getattr(ocr,'models',None)
    gpu=config.get('executionProviders',{}).get('repair','cpu')!='cpu'
    return 'comic-lama-manga-onnx' if gpu or spec is not None and models is not None and models.is_installed(spec) else 'lama-manga'


def comic_ppocr_service(owner,resource_id,language,provider="cpu"):
    from ..models.ocr_catalog import OCR_RESOURCE_ID,OCR_SPECS,OCR_LANGUAGES
    models=getattr(owner,'models',None)
    if resource_id==OCR_RESOURCE_ID and models is not None and not models.is_installed(OCR_SPECS[resource_id]):
        installed=[spec for key,spec in OCR_SPECS.items() if key.startswith('pp-ocrv5-')
                   and models.is_installed(spec) and (language=='auto' or language in OCR_LANGUAGES.get(key,()))]
        if installed:
            resource_id=installed[0].model_id
    return owner.variant(resource_id) if provider=='cpu' else owner.device_variant(resource_id,provider)


def manga_ocr_enabled(config, ocr):
    selection = config.get('ocr', 'auto')
    if selection != 'auto':
        return selection == 'manga-ocr'
    if config['sourceLanguage'] not in ('auto', 'ja'):
        return False
    from ..models.ocr_catalog import MANGA_OCR
    models = getattr(ocr, 'models', None)
    return models is not None and models.is_installed(MANGA_OCR)


async def recognize_comic_region(image, region, language, ppocr, manga=None, provider=None):
    async def recognize(service):
        if region.get('sourceLines'):
            return await service.recognize_comic(image, region['sourceLines'], language)
        return await service.recognize_comic_box(image, source_quad(region), language,
                                                region['style']['direction'] == 'vertical-rl')
    if provider is not None:
        return await recognize(provider)
    if manga is None or not use_manga_ocr(region):
        return await recognize(ppocr)
    if language == 'auto':
        recognized = await recognize(ppocr)
        if not any(('\u3040' <= char <= '\u30ff') or ('\uff66' <= char <= '\uff9f')
                   for text, confidence in recognized if confidence >= .5 for char in text):
            return recognized
    return await recognize(manga)


def use_manga_ocr(region):
    """Manga OCR handles upright paragraphs; PP-OCR retains signs and artwork."""
    lines = region.get('sourceLines')
    return abs(region['style'].get('angle', 0)) <= 1 and (not lines or len(lines) > 1)


def comic_text_color(image, quads):
    """Estimate ink from tight source polygons without running repair."""
    import cv2
    import numpy as np

    samples = []
    for quad in quads:
        points = np.asarray(quad, np.int32)
        x, y, width, height = cv2.boundingRect(points)
        x, y = max(0, x), max(0, y)
        crop = image[y:min(image.shape[0], y+height), x:min(image.shape[1], x+width)]
        if not crop.size:
            continue
        mask = np.zeros(crop.shape[:2], np.uint8)
        cv2.fillPoly(mask, [points - [x,y]], 255)
        pixels = crop[mask > 0]
        margin = max(3, min(12, min(width, height) // 4))
        left, top = max(0, x-margin), max(0, y-margin)
        right, bottom = min(image.shape[1], x+width+margin), min(image.shape[0], y+height+margin)
        padded = image[top:bottom, left:right]
        outside = np.ones(padded.shape[:2], np.uint8)
        cv2.fillPoly(outside, [points - [left,top]], 0)
        ring = padded[outside > 0]
        sample = ring if len(ring) else pixels
        bins = sample.astype(np.int32) // 16
        keys = bins[:,0] * 256 + bins[:,1] * 16 + bins[:,2]
        background = np.median(sample[keys == np.bincount(keys, minlength=4096).argmax()], axis=0)
        luminance = pixels.astype(float) @ [.114, .587, .299]
        background_luminance = float(background @ [.114, .587, .299])
        if background_luminance > 127:
            ink = pixels[luminance <= np.percentile(luminance, 3)]
        else:
            ink = pixels[luminance >= np.percentile(luminance, 97)]
        if len(ink) and np.linalg.norm(np.median(ink, axis=0) - background) > 35:
            samples.append(ink)
    color = np.median(np.concatenate(samples), axis=0).astype(int) if samples else np.zeros(3, int)
    return '#%02x%02x%02x' % tuple(color[::-1])


def apply_comic_bubbles(regions, bubbles, target_language=None):
    """Bubble interiors are layout space; source polygons remain the repair/OCR boundary."""
    import numpy as np
    # One bubble is one OCR/translation paragraph, even when line grouping split it.
    claimed=set()
    for bubble in sorted(bubbles,key=lambda value:(max(p[0] for p in value)-min(p[0] for p in value))*(max(p[1] for p in value)-min(p[1] for p in value))):
        bx,by=min(p[0] for p in bubble),min(p[1] for p in bubble)
        br,bb=max(p[0] for p in bubble),max(p[1] for p in bubble)
        contained=[]
        for region in regions:
            if region['id'] in claimed or region.get('manuallyEdited') or region['sourceText'].strip() or region['targetText']:
                continue
            points=np.asarray(source_quad(region));x,y=points.min(axis=0);right,bottom=points.max(axis=0)
            overlap=max(0,min(right,br)-max(x,bx))*max(0,min(bottom,bb)-max(y,by))
            if overlap>=(right-x)*(bottom-y)*.9:
                contained.append(region)
        claimed.update(region['id'] for region in contained)
        if len(contained)>1:
            first=contained[0]
            quads=[quad for region in contained for quad in region.get('sourceLines',[source_quad(region)])]
            vertical=sum(np.ptp(np.asarray(quad)[:,1])>np.ptp(np.asarray(quad)[:,0])*1.5 for quad in quads)>len(quads)/2
            quads = sorted(quads,key=lambda quad:(-np.mean(quad,axis=0)[0],np.mean(quad,axis=0)[1])) if vertical else order_horizontal_quads(quads)
            points=np.asarray(quads).reshape(-1,2);x,y=points.min(axis=0);right,bottom=points.max(axis=0)
            first.update(sourceLines=quads,sourceQuad=[[float(x),float(y)],[float(right),float(y)],[float(right),float(bottom)],[float(x),float(bottom)]],
                         x=float(x),y=float(y),width=float(right-x),height=float(bottom-y))
            first['style']['direction']='vertical-rl' if vertical else 'horizontal'
            first['style']['fontSize']=max(6,min(200,round(float(np.median([min(np.ptp(np.asarray(quad)[:,0]),np.ptp(np.asarray(quad)[:,1])) for quad in quads]))*.75)))
            removed={region['id'] for region in contained[1:]}
            regions[:]=[region for region in regions if region['id'] not in removed]
    for region in regions:
        points = source_quad(region)
        x,y = min(p[0] for p in points),min(p[1] for p in points)
        right,bottom = max(p[0] for p in points),max(p[1] for p in points)
        matches=[]
        for bubble in bubbles:
            bx,by = min(p[0] for p in bubble),min(p[1] for p in bubble)
            br,bb = max(p[0] for p in bubble),max(p[1] for p in bubble)
            overlap = max(0,min(right,br)-max(x,bx))*max(0,min(bottom,bb)-max(y,by))
            if overlap >= (right-x)*(bottom-y)*.9:
                matches.append((bx,by,br,bb))
        if matches:
            bx,by,br,bb=min(matches,key=lambda box:(box[2]-box[0])*(box[3]-box[1]))
            inset_x,inset_y=(br-bx)*.1,(bb-by)*.1
            region['kind']='dialogue'
            region.update(x=bx+inset_x,y=by+inset_y,width=br-bx-2*inset_x,height=bb-by-2*inset_y)
            if target_language and not target_language.split('-')[0] in ('zh','ja','ko') and not region.get('manuallyEdited'):
                region['style']['direction']='horizontal'
    return regions


def refine_art_columns(image, line_quads, block_quads):
    """Recover fragmented vertical display type inside detector-confirmed blocks."""
    import cv2
    import numpy as np

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    recovered = []
    for block in block_quads:
        points = np.asarray(block)
        left, top = np.maximum(0, np.floor(points.min(axis=0))).astype(int)
        right, bottom = np.minimum([image.shape[1], image.shape[0]], np.ceil(points.max(axis=0))).astype(int)
        if right-left < 100 or bottom-top < 200:
            continue
        _, _, stats, _ = cv2.connectedComponentsWithStats((gray[top:bottom,left:right] < 60).astype(np.uint8))
        glyphs = [[x+left,y+top,w,h] for x,y,w,h,area in stats[1:]
                  if area > 100 and min(w,h) > 8 and max(w,h) < min(right-left,bottom-top)*.6]
        columns = []
        for glyph in sorted(glyphs, key=lambda value: value[1]):
            x,y,w,h = glyph
            for column in columns:
                sx,sy,sw,sh = column[-1]
                overlap = min(x+w,sx+sw)-max(x,sx)
                if (overlap > min(w,sw)*.65 and min(w,sw)/max(w,sw) > .55
                        and abs((x+w/2)-(sx+sw/2)) < max(w,sw)*.4
                        and 0 <= y-(sy+sh) < max(w,sw)*1.5):
                    column.append(glyph)
                    break
            else:
                columns.append([glyph])
        for column in columns:
            if len(column) < 3:
                continue
            x=min(g[0] for g in column); y=min(g[1] for g in column)
            r=max(g[0]+g[2] for g in column); b=max(g[1]+g[3] for g in column)
            if b-y < (r-x)*2.5:
                continue
            fragments = [quad for quad in line_quads if x <= np.mean(quad,axis=0)[0] <= r
                         and y <= np.mean(quad,axis=0)[1] <= b]
            if len(fragments) < 2:
                continue
            margin = (r-x)*.12
            recovered.append(np.asarray([[max(left,x-margin),max(top,y-margin)],
                [min(right,r+margin),max(top,y-margin)],[min(right,r+margin),min(bottom,b+margin)],
                [max(left,x-margin),min(bottom,b+margin)]],np.float32))
    if not recovered:
        return line_quads
    return [quad for quad in line_quads if not any(
        min(candidate[:,0]) <= np.mean(quad,axis=0)[0] <= max(candidate[:,0])
        and min(candidate[:,1]) <= np.mean(quad,axis=0)[1] <= max(candidate[:,1]) for candidate in recovered)] + recovered


def order_horizontal_quads(quads):
    """Read a paragraph by baseline rows, tolerating detection jitter within a row."""
    import numpy as np
    first = np.asarray(quads[0], float)
    axis = first[1] - first[0]
    axis /= max(1, np.linalg.norm(axis))
    normal = np.array([-axis[1], axis[0]])
    ordered = sorted(quads, key=lambda quad: float(np.mean(quad, axis=0) @ normal))
    rows = []
    for quad in ordered:
        points = np.asarray(quad, float)
        height = np.linalg.norm(points[3] - points[0])
        if rows and abs(float((points.mean(axis=0) - np.mean(rows[-1][0], axis=0)) @ normal)) < height * .5:
            rows[-1].append(quad)
        else:
            rows.append([quad])
    return [quad for row in rows for quad in sorted(row, key=lambda value: float(np.mean(value, axis=0) @ axis))]


def refine_detected_text_blocks(image,line_quads,block_quads,reading_direction):
    """Detector text blocks own paragraphs; line refinement must not join adjacent speakers."""
    import numpy as np
    assigned={index:[] for index in range(len(block_quads))}
    outside=[]
    for quad in line_quads:
        center=np.mean(quad,axis=0)
        candidates=[]
        for index,block in enumerate(block_quads):
            points=np.asarray(block);left,top=points.min(axis=0);right,bottom=points.max(axis=0)
            if left<=center[0]<=right and top<=center[1]<=bottom:
                candidates.append(((right-left)*(bottom-top),index))
        if candidates:
            assigned[min(candidates)[1]].append(quad)
        else:
            outside.append(quad)
    result=[]
    for block_index,quads in assigned.items():
        if not quads:
            continue
        groups=detect_comic_regions(image,[{'quad':quad,'text':'','confidence':None} for quad in quads],reading_direction,True)
        horizontal=sum(np.linalg.norm(np.asarray(quad[1])-quad[0])>np.linalg.norm(np.asarray(quad[3])-quad[0])*1.3 for quad in quads)>=len(quads)*.8
        block=np.asarray(block_quads[block_index]);block_width,block_height=np.ptp(block[:,0]),np.ptp(block[:,1])
        if len(quads)==1 and not horizontal and block_width>=block_height:
            line=np.asarray(quads[0])
            if np.ptp(line[:,0])*np.ptp(line[:,1])<block_width*block_height*.5:
                first=groups[0];left,top=block.min(axis=0);right,bottom=block.max(axis=0)
                first.pop('sourceLines',None)
                first.update(sourceQuad=block.tolist(),x=float(left),y=float(top),width=float(right-left),height=float(bottom-top))
                first['style'].update(direction='horizontal',angle=0)
                result.append(first)
                continue
        if len(quads)>1 and horizontal:
            first=groups[0]
            points=np.asarray(quads).reshape(-1,2);left,top=points.min(axis=0);right,bottom=points.max(axis=0)
            quads=order_horizontal_quads(quads)
            first.update(sourceLines=[np.asarray(quad).tolist() for quad in quads],
                         sourceQuad=[[float(left),float(top)],[float(right),float(top)],[float(right),float(bottom)],[float(left),float(bottom)]],
                         x=float(left),y=float(top),width=float(right-left),height=float(bottom-top))
            first['style'].update(direction='horizontal',angle=0,color=comic_text_color(image,quads))
            result.append(first)
        else:
            result.extend(groups)
    if outside:
        result.extend(detect_comic_regions(image,[{'quad':quad,'text':'','confidence':None} for quad in outside],reading_direction,True))
    result.sort(key=lambda region:(region['y'],-region['x'] if reading_direction=='rtl' else region['x']))
    return result


def detect_comic_regions(image, blocks: list[dict], reading_direction: str, line_boxes=True) -> list[dict]:
    import cv2
    import numpy as np

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, labels, components, _ = cv2.connectedComponentsWithStats((gray >= 235).astype(np.uint8))
    groups = {}
    for index, block in enumerate(blocks):
        quad = np.asarray(block['quad'])
        x, y = map(int, np.maximum(0, np.floor(quad.min(axis=0))))
        right, bottom = map(int, np.minimum([image.shape[1], image.shape[0]], np.ceil(quad.max(axis=0))))
        if right <= x or bottom <= y:
            continue
        counts = np.bincount(labels[y:bottom, x:right].ravel())
        counts[0] = 0
        label = int(counts.argmax())
        left, top, width, height, area = components[label]
        bubble = (label > 0 and left <= x + 2 and top <= y + 2
                  and left + width >= right - 2 and top + height >= bottom - 2
                  and left > 0 and top > 0 and left + width < image.shape[1]
                  and top + height < image.shape[0]
                  and (right - x) * (bottom - y) * 1.2 < area < gray.size * 0.35)
        edge = quad[1] - quad[0]
        if abs(edge[1]) > abs(edge[0]) * .18:
            bubble = False
        vertical_line = bottom - y > (right - x) * 1.5
        key = ('bubble', (label, vertical_line)) if bubble else ('text', index)
        groups.setdefault(key, []).append((block, x, y, right, bottom))
    # Join neighbouring words along their detected baseline before OCR/MT.
    pending = list(groups.items())
    groups = {}
    while pending:
        key, items = pending.pop(0)
        changed = True
        while changed:
            changed = False
            for index, (other_key, other_items) in enumerate(pending):
                if key[0] == 'bubble' or other_key[0] == 'bubble':
                    continue
                def adjacent(first, second):
                    a, b = np.asarray(first[0]['quad'], float), np.asarray(second[0]['quad'], float)
                    av, bv = a[1] - a[0], b[1] - b[0]
                    ah, bh = np.linalg.norm(a[3] - a[0]), np.linalg.norm(b[3] - b[0])
                    aw, bw = np.linalg.norm(av), np.linalg.norm(bv)
                    if min(aw, bw, ah, bh) <= 0:
                        return False
                    vertical_a, vertical_b = ah > aw * 1.5, bh > bw * 1.5
                    if vertical_a != vertical_b:
                        return False
                    if vertical_a:
                        overlap = min(a[:,1].max(), b[:,1].max()) - max(a[:,1].min(), b[:,1].min())
                        gap = max(0, max(a[:,0].min(), b[:,0].min()) - min(a[:,0].max(), b[:,0].max()))
                        return (overlap > min(ah, bh) * .65 and gap < max(aw, bw) * .8
                                and min(ah, bh) / max(ah, bh) > .55
                                and abs(a[:,1].min() - b[:,1].min()) < min(ah, bh) * .35)
                    axis = av / aw
                    other_axis = bv / bw
                    if np.dot(axis, other_axis) < .966:
                        return False
                    normal = np.array([-axis[1], axis[0]])
                    delta = b.mean(axis=0) - a.mean(axis=0)
                    gap = abs(np.dot(delta, axis)) - (aw + bw) / 2
                    same_line = abs(np.dot(delta, normal)) < min(ah, bh) * .45 and gap < max(ah, bh) * 1.5 and gap > -min(aw, bw) * .3
                    overlap = min((a @ axis).max(), (b @ axis).max()) - max((a @ axis).min(), (b @ axis).min())
                    normal_gap = abs(np.dot(delta, normal)) - (ah + bh) / 2
                    tilted_paragraph = (abs(axis[1]) > .2 and overlap > min(aw, bw) * .4
                                        and 0 <= normal_gap <= max(ah, bh) * 2
                                        and min(ah, bh) / max(ah, bh) > .6)
                    return same_line or tilted_paragraph
                if any(adjacent(first, second) for first in items for second in other_items):
                    items.extend(other_items)
                    pending.pop(index)
                    changed = True
                    break
        groups[key] = items
    regions = []
    for (kind, label), items in groups.items():
        vertical = sum(item[4] - item[2] > (item[3] - item[1]) * 1.5 for item in items) > len(items) / 2
        baseline = np.asarray(items[0][0]['quad'][1], float) - np.asarray(items[0][0]['quad'][0], float)
        angle = float(np.degrees(np.arctan2(baseline[1], baseline[0]))) if not vertical else 0.0
        axis = baseline / max(1, np.linalg.norm(baseline))
        if vertical:
            items.sort(key=lambda item: (-item[1], item[2]))
        else:
            normal = np.array([-axis[1], axis[0]])
            items.sort(key=lambda item: float(np.dot(np.mean(item[0]['quad'], axis=0), normal)))
            lines = []
            for item in items:
                center = np.mean(item[0]['quad'], axis=0)
                height = np.linalg.norm(np.asarray(item[0]['quad'][3]) - item[0]['quad'][0])
                if lines and abs(np.dot(center - np.mean(lines[-1][0][0]['quad'], axis=0), normal)) < height * .5:
                    lines[-1].append(item)
                else:
                    lines.append([item])
            items = [item for line in lines for item in sorted(line, key=lambda value: float(np.dot(np.mean(value[0]['quad'], axis=0), axis)))]
        x, y = min(item[1] for item in items), min(item[2] for item in items)
        right, bottom = max(item[3] for item in items), max(item[4] for item in items)
        source_quad = [[x, y], [right, y], [right, bottom], [x, bottom]]
        font_size = max(6, min(200, round(float(np.median([min(item[3] - item[1], item[4] - item[2]) for item in items])) * 0.75)))
        if kind == 'bubble' and sum(key[0] == 'bubble' and key[1][0] == label[0] for key in groups) == 1:
            left, top, width, height, _ = components[label[0]]
            x, y, right, bottom = (min(x, left + width * 0.15), min(y, top + height * 0.15),
                                   max(right, left + width * 0.85), max(bottom, top + height * 0.85))
        text = ('\n' if vertical else ' ').join(item[0]['text'] for item in items if item[0]['text'].strip())
        region = {'id': str(uuid4()), 'sourceText': text, 'targetText': None,
                  'x': float(x), 'y': float(y), 'width': float(right - x), 'height': float(bottom - y), 'sourceQuad': source_quad,
                  'confidence': min((item[0]['confidence'] for item in items if item[0]['confidence'] is not None), default=None),
                  'locked': False, 'ignored': False, 'manuallyEdited': False,
                  'kind': 'artwork' if vertical and font_size>=100 and len(items)>1 else 'text',
                  'style': {'fontSize': font_size, 'autoFontSize': True, 'angle': angle, 'color': comic_text_color(image, [item[0]['quad'] for item in items]), 'direction': 'vertical-rl' if vertical else 'horizontal', 'align': 'center'}, 'qa': []}
        if line_boxes:
            region['sourceLines'] = [np.clip(item[0]['quad'], 0, [image.shape[1], image.shape[0]]).tolist()
                                     for item in items]
        regions.append(region)
    # Group regions sharing a top edge into a reading row, independent of box height.
    regions.sort(key=lambda item: item['y'])
    rows = []
    for region in regions:
        if rows and abs(region['y'] - rows[-1][0]['y']) <= min(region['height'], rows[-1][0]['height']) * 0.5:
            rows[-1].append(region)
        else:
            rows.append([region])
    regions = [region for row in rows for region in sorted(
        row, key=lambda item: -item['x'] if reading_direction == 'rtl' else item['x'])]
    return regions


def comic_font(font_path, style, size, fonts=None):
    from PIL import ImageFont

    family = style.get('fontFamily')
    if family and fonts is not None:
        font_path=fonts.resolve(family,style.get('fontWeight',400),style.get('fontStyle')=='italic')
    elif family:
        candidates = [path for path in font_path.parent.iterdir() if path.suffix.lower() in ('.otf','.ttf','.ttc')]
        matches = [path for path in candidates if path.stem.casefold() == family.casefold()]
        if not matches:
            raise ValueError('fontMissing')
        font_path = matches[0]
    font = ImageFont.truetype(str(font_path), size)
    try:
        axes = font.get_variation_axes()
        font.set_variation_by_axes([style.get('fontWeight',400) if axis['name'] == b'Weight' else axis['default'] for axis in axes])
    except OSError:
        pass
    return font


def comic_draw_text(draw, position, text, font, style, anchor='lt'):
    if anchor == 'ls':
        position=(position[0],position[1]+font.getbbox(text,anchor='ls')[1])
    stroke = round(style.get('strokeWidth',0))
    if style.get('fontStyle') != 'italic' or any(name in font.getname()[1].lower() for name in ('italic','oblique')):
        draw.text(position,text,font=font,fill=style['color'],anchor='lt',
                  stroke_width=stroke,stroke_fill=style.get('strokeColor','#ffffff'),
                  embedded_color=bool(style.get('_embeddedColor',False)))
        return
    from PIL import Image, ImageDraw
    left,top,right,bottom=font.getbbox(text,stroke_width=stroke)
    width,height=max(1,right-left+stroke*2),max(1,bottom-top+stroke*2)
    slant=round(height*.2)
    layer=Image.new('RGBA',(width+slant,height),(0,0,0,0))
    ImageDraw.Draw(layer).text((stroke,stroke),text,font=font,fill=style['color'],anchor='lt',
                              stroke_width=stroke,stroke_fill=style.get('strokeColor','#ffffff'))
    layer=layer.transform(layer.size,Image.Transform.AFFINE,(1,.2,-slant,0,1,0),resample=Image.Resampling.BICUBIC)
    draw._image.paste(layer,(round(position[0]-stroke),round(position[1]-stroke)),layer)


async def repair_comic_regions(service,image,mask,regions):
    """Lumina's per-box context crops keep text at inference resolution, unlike page downscaling."""
    import cv2
    import numpy as np

    output=image.copy()
    remaining=mask.copy()
    boxes=[]
    for region in regions:
        if region['ignored'] or not region['targetText'] or region['targetText']==region['sourceText']:
            continue
        points=np.asarray(source_quad(region),np.int32)
        x,y,w,h=cv2.boundingRect(points)
        boxes.append((max(0,x-7),max(0,y-7),min(image.shape[1],x+w+7),min(image.shape[0],y+h+7)))
    # Painted mask strokes may sit outside all text regions.
    for x,y,right,bottom in boxes:
        if not remaining[y:bottom,x:right].any():
            continue
        left,top=max(0,x-32),max(0,y-32)
        cr,cb=min(image.shape[1],right+32),min(image.shape[0],bottom+32)
        local_mask=np.zeros((cb-top,cr-left),np.uint8)
        local_mask[y-top:bottom-top,x-left:right-left]=remaining[y:bottom,x:right]
        repaired=await service.repair(image[top:cb,left:cr],np.where(local_mask>0,255,0).astype(np.uint8))
        view=output[top:cb,left:cr]
        view[local_mask>0]=repaired[local_mask>0]
        remaining[y:bottom,x:right]=0
    if remaining.any():
        count,_,stats,_=cv2.connectedComponentsWithStats((remaining>0).astype(np.uint8))
        for x,y,w,h,_ in stats[1:count]:
            left,top=max(0,x-32),max(0,y-32)
            right,bottom=min(image.shape[1],x+w+32),min(image.shape[0],y+h+32)
            local=remaining[top:bottom,left:right]
            repaired=await service.repair(image[top:bottom,left:right],np.where(local>0,255,0).astype(np.uint8))
            view=output[top:bottom,left:right]
            view[local>0]=repaired[local>0]
            local[:]=0
    return output


def comic_rgba_layer(black,white):
    import numpy as np
    alpha=np.clip(255-np.mean(white.astype(float)-black.astype(float),axis=2),0,255)
    rgb=np.divide(black.astype(float)*255,alpha[:,:,None],out=np.zeros_like(black,dtype=float),where=alpha[:,:,None]>0)
    return np.dstack((np.clip(rgb,0,255).astype(np.uint8),alpha.astype(np.uint8)))


def composite_repair_layers(repository,page):
    import cv2
    import numpy as np
    source=decode_image(repository._page_asset(page,'source').read_bytes())
    for layer in page.get('repairLayers',[]):
        if not layer['visible'] or not layer['opacity']:
            continue
        patch=cv2.imdecode(np.frombuffer(repository.repair_layer_path(page,layer['id']).read_bytes(),np.uint8),cv2.IMREAD_UNCHANGED)
        x,y,w,h=(layer[key] for key in ('x','y','width','height'))
        if patch is None or patch.shape!=(h,w,4):
            raise ValueError('assetIntegrity')
        alpha=patch[:,:,3:4].astype(float)/255*layer['opacity']
        source[y:y+h,x:x+w]=np.rint(source[y:y+h,x:x+w]*(1-alpha)+patch[:,:,:3]*alpha).astype(np.uint8)
    return source


def append_repair_layer(repository,page,pixels,mask,name):
    import cv2
    import numpy as np
    if not mask.any():
        return
    x,y,w,h=cv2.boundingRect(mask)
    identifier=str(uuid4())
    page.setdefault('repairLayers',[]).append({'id':identifier,'name':name,'x':x,'y':y,'width':w,'height':h,'visible':True,'opacity':1,'origin':'manual'})
    rgba=np.dstack((pixels[y:y+h,x:x+w],mask[y:y+h,x:x+w]))
    page.setdefault('repairAssets',{})[identifier]=repository.asset(encode_image(rgba))


def repair_layer_origin(layer):
    return layer.get('origin') or ('auto' if layer.get('regionId') else 'manual')


def save_repair_layers(repository, page, cleaned, mask, regions=None, overwrite_manual=False):
    import cv2
    import numpy as np
    regions = page['regions'] if regions is None else regions
    identifiers = {region['id'] for region in regions}
    full_replace = identifiers == {region['id'] for region in page['regions']}
    previous_layers = page.get('repairLayers', [])
    old = {layer.get('regionId'): layer for layer in previous_layers if layer.get('regionId')}
    kept = [layer for layer in previous_layers
            if (repair_layer_origin(layer) == 'manual' and (not overwrite_manual or layer.get('regionId') not in identifiers))
            or (repair_layer_origin(layer) == 'auto' and not full_replace and layer.get('regionId') not in identifiers)]
    protected = {layer.get('regionId') for layer in kept if repair_layer_origin(layer) == 'manual'}
    assets = {layer['id']: page['repairAssets'][layer['id']] for layer in kept}
    layers = []
    remaining = mask.copy()
    for layer in kept:
        if repair_layer_origin(layer) == 'manual':
            remaining[layer['y']:layer['y']+layer['height'],layer['x']:layer['x']+layer['width']] = 0
    for region in regions:
        if region['id'] in protected:
            continue
        if region.get('repairPolygon') is not None:
            from .comic_selection import selection_mask
            region_mask = selection_mask(region['repairPolygon'], page['width'], page['height'])
            points = cv2.findNonZero(region_mask)
            if points is None:
                continue
            x,y,w,h = cv2.boundingRect(points)
        else:
            points=np.asarray(source_quad(region),np.int32)
            x,y,w,h=cv2.boundingRect(points)
            x,y,right,bottom=max(0,x-7),max(0,y-7),min(mask.shape[1],x+w+7),min(mask.shape[0],y+h+7)
            w,h=right-x,bottom-y
        local=remaining[y:y+h,x:x+w].copy()
        if not local.any():
            continue
        previous=old.get(region['id'],{})
        identifier=previous.get('id',str(uuid4()))
        layer={'id':identifier,'regionId':region['id'],'origin':'auto',
               'name':previous.get('name',region['sourceText'][:80] or 'Repair'),
               'x':x,'y':y,'width':w,'height':h,'visible':previous.get('visible',True),'opacity':previous.get('opacity',1)}
        assets[identifier]=repository.asset(encode_image(np.dstack((cleaned[y:y+h,x:x+w],local))))
        layers.append(layer)
        remaining[y:y+h,x:x+w]=0
    if remaining.any() and len(regions) == len(page['regions']):
        x,y,w,h=cv2.boundingRect(remaining)
        identifier=str(uuid4())
        layers.append({'id':identifier,'origin':'auto','name':'Mask','x':x,'y':y,'width':w,'height':h,'visible':True,'opacity':1})
        assets[identifier]=repository.asset(encode_image(np.dstack((cleaned[y:y+h,x:x+w],remaining[y:y+h,x:x+w]))))
    page['repairLayers']=layers+kept
    page['repairAssets']=assets


def vertical_comic_glyph(char, font):
    forms = dict(zip('，。！？…（）“”「」《》', '︐︒︕︖︙︵︶﹁﹂﹁﹂︽︾'))
    candidate = forms.get(char, char)
    if candidate != char and bytes(font.getmask(candidate)) == bytes(font.getmask('\uffff')):
        return char
    return candidate


# selectPreset ported from Lumina src/renderer/lib/canvas/tools/text/font-fit.ts.
# Copyright (c) 2026 Lumina contributors. MIT License:
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
def lumina_text_preset(width,height,characters):
    big=width>=150 and height>=130 and width*height>=30000
    if big and characters<=28:
        maximum,minimum,wr,hr,scale,spacing=86,10,.85,.78,.95,.055
    elif big and characters<=55:
        maximum,minimum,wr,hr,scale,spacing=82,10,.82,.78,.94,.06
    else:
        maximum,minimum,wr,hr,scale,spacing=76,8,.76,.76,.92,.075
    aspect=height/max(1,width)
    if aspect>1.5:
        t=min(1,(aspect-1.5)/1.5)
        wr+=t*(.92-wr);hr-=t*(hr-.65)
    elif aspect<.7:
        t=min(1,(.7-aspect)/.5)
        wr-=t*(wr-.65);hr+=t*(.92-hr)
    return {'maxFont':maximum,'minFont':minimum,'widthUsageRatio':wr,
            'heightUsageRatio':hr,'fontScale':scale,'spacingRatio':spacing}


def wrap_comic_horizontal(draw,text,font,width):
    closing='，。！？、；：,.!?;:%％）)]}”’」』》〉…'
    opening='（([{“‘「『《〈'
    lines=[]
    line=''
    tokens=re.findall(r'\([^()\n]*\)|（[^（）\n]*）|[A-Za-z]+(?:-[A-Za-z]+)*|[^\n]|\n',text)
    for char in tokens:
        if char=='\n':
            lines.append(line);line=''
        elif line and draw.textlength(line+char,font=font)>width:
            if char in closing and len(line)>1:
                split=len(line)-1
                while split>0 and line[split] in closing:
                    split-=1
                if split:
                    lines.append(line[:split]);line=line[split:]+char
                else:
                    line+=char
            elif line[-1] in opening and len(line)>1:
                lines.append(line[:-1]);line=line[-1]+char
            else:
                lines.append(line);line=char
        else:
            line+=char
    lines.append(line)
    return lines


def allocate_comic_columns(text, capacities):
    """Use the same atomic bracket spans as horizontal wrapping for vertical columns."""
    tokens = []
    for match in re.finditer(r'\([^()\n]*\)|（[^（）\n]*）|[^\n]|\n', text):
        token = match.group()
        if token in '，。！？、；：,.!?;:%％）)]}”’」』》〉…' and tokens and tokens[-1] != '\n':
            tokens[-1] += token
        else:
            tokens.append(token)
    columns = []
    offset = 0
    for capacity in capacities:
        column = ''
        while offset < len(tokens):
            token = tokens[offset]
            if token == '\n':
                offset += 1
                break
            if len(column) + len(token) > capacity:
                break
            column += token
            offset += 1
        columns.append(column)
    while columns and not columns[-1]:
        columns.pop()
    return columns if offset == len(tokens) else None


def allocate_comic_line_counts(length, capacities, widths):
    """Keep every source line represented when the translation has enough characters."""
    counts = [1 if length >= len(capacities) and capacity else 0 for capacity in capacities]
    if length >= len(capacities) and any(not count for count in counts):
        return None
    desired = [length * width / sum(widths) for width in widths]
    for _ in range(length - sum(counts)):
        available = [index for index, capacity in enumerate(capacities) if counts[index] < capacity]
        if not available:
            return None
        index = max(available, key=lambda value: desired[value] - counts[value])
        counts[index] += 1
    return counts


def resolved_comic_layout(region, text, size, line_height, x, y, width, height, lines, font=None):
    layout = {'fontSize':size,'lineHeight':float(line_height),'x':float(x),'y':float(y),
              'width':float(width),'height':float(height),'lines':lines,'text':text,
              'direction':region['style']['direction'],'angle':region['style'].get('angle',0)}
    if font is not None:
        layout['fontFamily'] = font.getname()[0]
        layout['fontStyle'] = region['style'].get('fontStyle','normal')
        try:
            font.get_variation_axes()
            layout['fontWeight'] = region['style'].get('fontWeight',400)
        except OSError:
            try:
                from fontTools.ttLib import TTFont
                with TTFont(font.path, fontNumber=0, lazy=True) as metadata:
                    layout['fontWeight'] = int(metadata['OS/2'].usWeightClass)
            except (ImportError, OSError, KeyError, ValueError):
                pass
    return layout


def draw_comic_runs(draw, region, text, font_path, fonts, x, y, width, height, maximum):
    """Sparse styles use Python/Unicode code-point offsets, never UTF-16 offsets."""
    style=region['style']
    base=max(6,style['fontSize'])
    fallback_fonts=fonts
    from .comic_layers import font_glyph_metadata, ComicFonts
    overrides=[{} for _ in text]
    for run in region['textRuns']:
        for index in range(run['start'],min(len(text),run['end'])):
            overrides[index].update(run['style'])
    vertical=style['direction']=='vertical-rl'
    sizes=range(maximum,5,-1) if style.get('autoFontSize') else [base]
    closing='，。！？、；：,.!?;:%％）)]}”’」』》〉…'
    opening='（([{“‘「『《〈'
    for size in sizes:
        cache={}
        glyphs=[]
        for index,char in enumerate(text):
            local={**style,**overrides[index]}
            local_size=max(6,round(local.get('fontSize',base)*size/base))
            key=(local.get('fontFamily'),local.get('fontWeight',400),local.get('fontStyle'),local_size)
            if key not in cache:
                cache[key]=comic_font(font_path,local,local_size,fonts)
            font=cache[key]
            glyphs_available,_=font_glyph_metadata(font.path,getattr(font,'index',0))
            if not char.isspace() and ord(char) not in glyphs_available:
                if fallback_fonts is None:
                    fallback_fonts=ComicFonts(font_path,font_path.parent)
                substitute=fallback_fonts.glyph_fallback(char)
                if substitute is None:
                    raise ValueError('fontMissing')
                fallback_key=(str(substitute['path']),local_size)
                if fallback_key not in cache:
                    cache[fallback_key]=comic_font(substitute['path'],{**local,'fontFamily':None},local_size)
                font=cache[fallback_key]
                local={**local,'fontFamily':substitute['family'],'_embeddedColor':substitute['colorGlyphs']}
                if substitute['colorGlyphs']:
                    local['fontStyle']='normal'
            stroke=local.get('strokeWidth',0)
            bbox=font.getbbox(char)
            advance=max(float(font.getlength(char)),local_size if vertical else 0)+stroke*2
            ink_height=max(local_size,bbox[3]-bbox[1])+stroke*2
            glyphs.append((char,font,local,advance,ink_height))
        line_height=max((glyph[4] for glyph in glyphs),default=size)*style.get('lineSpacing',1.15)
        ascent=max((glyph[1].getmetrics()[0] for glyph in glyphs),default=size)
        descent=max((glyph[1].getmetrics()[1] for glyph in glyphs),default=0)
        baseline=(line_height+ascent-descent)/2
        lines=[[]]
        if vertical:
            for glyph in glyphs:
                if glyph[0]=='\n':
                    lines.append([]);continue
                if lines[-1] and sum(item[4] for item in lines[-1])+glyph[4]>height:
                    lines.append([])
                lines[-1].append(glyph)
            fits=len(lines)*line_height<=width and all(g[4]<=height and g[3]<=line_height for g in glyphs)
        else:
            for match in re.finditer(r'\([^()\n]*\)|（[^（）\n]*）|[A-Za-z]+(?:-[A-Za-z]+)*|[^\n]|\n',text):
                token=glyphs[match.start():match.end()]
                if match.group()=='\n':
                    lines.append([]);continue
                if lines[-1] and sum(g[3] for g in lines[-1]+token)>width:
                    carry=[]
                    if match.group() in closing or lines[-1][-1][0] in opening:
                        carry=[lines[-1].pop()]
                    lines.append(carry)
                lines[-1].extend(token)
            fits=len(lines)*line_height<=height and all(sum(g[3] for g in line)<=width for line in lines)
        if fits:
            break
    else:
        raise ValueError('textOverflow')
    for line_index,line in enumerate(lines):
        line_width=sum(g[3] for g in line)
        offset=0 if style['align']=='left' else width-line_width if style['align']=='right' else (width-line_width)/2
        cursor=0
        for glyph in line:
            char,font,local,advance,_=glyph
            column_height=sum(item[4] for item in line)
            top=y if style['align']=='left' else y+height-column_height if style['align']=='right' else y+(height-column_height)/2
            position=(x+width/2+(len(lines)-1-2*line_index)*line_height/2-font.getlength(char)/2,top+cursor+round(local.get('strokeWidth',0))) if vertical else (x+offset+cursor,y+(height-len(lines)*line_height)/2+line_index*line_height+baseline)
            comic_draw_text(draw,position,vertical_comic_glyph(char,font) if vertical else char,font,local,anchor='lt' if vertical else 'ls')
            cursor+=glyph[4] if vertical else advance
    if vertical:
        block_width=len(lines)*line_height
        block_height=max((sum(item[4] for item in line) for line in lines),default=size)
        x,y,width,height=x+(width-block_width)/2,(y if style['align']=='left' else y+height-block_height if style['align']=='right' else y+(height-block_height)/2),block_width,block_height
    return resolved_comic_layout(region,text,size,line_height,x,y,width,height,[''.join(g[0] for g in line) for line in lines],comic_font(font_path,style,size,fonts))


def render_page(image, regions: list[dict], font_path: Path, fonts=None, metrics=None):
    import cv2
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont

    if not font_path.is_file():
        raise ValueError("fontMissing")
    canvas = Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(canvas)
    for region in regions:
        text = region["targetText"]
        if region["ignored"] or not region.get("visible",True) or region.get("opacity",1)==0 or not text or not text.strip() or text == region["sourceText"]:
            continue
        if region.get('opacity',1)<1:
            base=cv2.cvtColor(np.asarray(canvas),cv2.COLOR_RGB2BGR)
            blockers=[{**other,'targetText':None} for other in regions if other is not region]
            opaque=render_page(base,[{**region,'opacity':1},*blockers],font_path,fonts,metrics)
            blended=cv2.addWeighted(base,1-region['opacity'],opaque,region['opacity'],0)
            canvas=Image.fromarray(cv2.cvtColor(blended,cv2.COLOR_BGR2RGB))
            draw=ImageDraw.Draw(canvas)
            continue
        if not region.get('textRuns') and region.get('kind')=='dialogue' and text[:1] in ('“','"') and text[-1:] in ('”','"'):
            text=text[1:-1].strip()
        x, y, width, height = (region[key] for key in ("x", "y", "width", "height"))
        style = region["style"]
        if region.get('kind')=='artwork' and style['direction']=='horizontal' and not region.get('manuallyEdited'):
            rectangles=[(x,y,x+width,y+height)]
            for other in regions:
                if other is region or not other['sourceText'].strip() or other.get('kind')=='artwork':
                    continue
                points=np.asarray(source_quad(other));left,top=points.min(axis=0);right,bottom=points.max(axis=0)
                candidates=[]
                for ax,ay,ar,ab in rectangles:
                    if min(ar,right)<=max(ax,left) or min(ab,bottom)<=max(ay,top):
                        candidates.append((ax,ay,ar,ab));continue
                    candidates.extend([(ax,ay,ar,min(ab,top)),(ax,max(ay,bottom),ar,ab),
                                       (ax,ay,min(ar,left),ab),(max(ax,right),ay,ar,ab)])
                rectangles=[rect for rect in candidates if rect[2]>rect[0] and rect[3]>rect[1]]
            if rectangles:
                x,y,right,bottom=max(rectangles,key=lambda rect:(rect[2]-rect[0])*(rect[3]-rect[1]))
                width,height=right-x,bottom-y
        if abs(style.get("angle", 0)) > 1:
            angle = style["angle"]
            radians = np.radians(angle)
            axis = np.array([np.cos(radians), np.sin(radians)])
            normal = np.array([-axis[1], axis[0]])
            points = np.asarray([point for line in region.get("sourceLines", [source_quad(region)]) for point in line])
            manual=region.get('manuallyEdited') or style.get('autoFontSize') is False
            local_width=max(1,round(width)) if manual else max(1,int(np.ptp(points@axis)))
            local_height=max(1,round(height)) if manual else max(1,int(np.ptp(points@normal)))
            local_region = {**region, "x": 0, "y": 0, "width": local_width, "height": local_height,
                            "sourceQuad": [[0,0],[local_width,0],[local_width,local_height],[0,local_height]],
                            "style": {**style, "angle": 0, "color": "#000000", "strokeColor":"#000000"}}
            if not manual and region.get('sourceLines'):
                origin = np.array([(points@axis).min(), (points@normal).min()])
                local_region['sourceLines'] = [(np.asarray(line) @ np.column_stack([axis, normal]) - origin).tolist()
                                               for line in region['sourceLines']]
                local_region['_sourceShapeLayout'] = len(region['sourceLines']) > 1
            black=np.zeros((local_height,local_width,3),np.uint8)
            white=np.full_like(black,255)
            colored_region={**local_region,'style':{**style,'angle':0}}
            rgba=comic_rgba_layer(render_page(black,[colored_region],font_path,fonts,metrics),
                                  render_page(white,[colored_region],font_path,fonts,metrics))
            ink=Image.fromarray(cv2.cvtColor(rgba,cv2.COLOR_BGRA2RGBA))
            rotated = ink.rotate(-angle, expand=True, resample=Image.Resampling.BICUBIC)
            center=np.asarray([x+width/2,y+height/2]) if manual else ((points@axis).min()+(points@axis).max())/2*axis+((points@normal).min()+(points@normal).max())/2*normal
            canvas.paste(rotated, (round(center[0] - rotated.width / 2), round(center[1] - rotated.height / 2)), rotated)
            if metrics is not None and region['id'] in metrics:
                metrics[region['id']].update(x=float(x),y=float(y),width=float(width),height=float(height),angle=float(angle))
            continue
        vertical = style["direction"] == "vertical-rl"
        lines = []
        font = None
        automatic = style.get("autoFontSize")
        if automatic is None and region.get("sourceLines"):
            # Legacy detector sizes were derived from the smallest source line.
            dimensions = [min(max(p[0] for p in line) - min(p[0] for p in line),
                              max(p[1] for p in line) - min(p[1] for p in line))
                          for line in region["sourceLines"]]
            automatic = style["fontSize"] in {max(6, min(200, round(min(dimensions) * 0.75))),
                                              max(6, min(200, round(float(np.median(dimensions)) * 0.75)))}
        if automatic:
            source_lines = region.get('sourceLines')
            source_size = (float(np.median([min(np.linalg.norm(np.asarray(line[1])-line[0]),
                                               np.linalg.norm(np.asarray(line[3])-line[0])) for line in source_lines]))
                           if source_lines else style['fontSize'] / .75)
            maximum = min(2000, int(min(width, height)), max(6, round(source_size * .75)),
                          max(6,region.get('sourceStyle',{}).get('fontSize',round(source_size*.75))))
            source_bounds=np.asarray(source_quad(region))
            bubble_box=(region['x']<source_bounds[:,0].min()-1 or region['y']<source_bounds[:,1].min()-1
                        or region['x']+region['width']>source_bounds[:,0].max()+1
                        or region['y']+region['height']>source_bounds[:,1].max()+1)
            if bubble_box and not vertical and not region.get('manuallyEdited'):
                preset=lumina_text_preset(width,height,sum(not char.isspace() for char in text))
                used_width,used_height=width*preset['widthUsageRatio'],height*preset['heightUsageRatio']
                x,y,width,height=x+(width-used_width)/2,y+(height-used_height)/2,used_width,used_height
                maximum=min(maximum,round(preset['maxFont']*preset['fontScale']))
                style={**style,'lineSpacing':style.get('lineSpacing',1+preset['spacingRatio'])}
            elif not (bubble_box and vertical and region.get('kind')=='dialogue'):
                # Detector bubble interiors already have their safety inset.
                inset_x, inset_y = width * .08, height * .08
                x, y, width, height = x + inset_x, y + inset_y, width - 2*inset_x, height - 2*inset_y
        else:
            maximum = style['fontSize']
        source_columns = region.get('sourceLines', [])
        source_points = np.asarray(source_quad(region))
        source_left, source_top = source_points.min(axis=0)
        source_right, source_bottom = source_points.max(axis=0)
        bubble_expanded = (region['x'] < source_left-1 or region['y'] < source_top-1
                           or region['x']+region['width'] > source_right+1
                           or region['y']+region['height'] > source_bottom+1)
        from .comic_layers import font_glyph_metadata
        primary=comic_font(font_path,style,max(6,maximum),fonts)
        available,_=font_glyph_metadata(primary.path,getattr(primary,'index',0))
        needs_fallback=any(not char.isspace() and ord(char) not in available for char in text)
        if region.get('textRuns') or needs_fallback:
            region_with_runs={**region,'textRuns':region.get('textRuns',[])}
            measured = draw_comic_runs(draw, region_with_runs, text, font_path, fonts, x, y, width, height, maximum)
            if metrics is not None:
                metrics[region['id']] = measured
            continue
        if automatic and not vertical and region.get('_sourceShapeLayout') and source_columns:
            rows = []
            for quad in order_horizontal_quads(source_columns):
                points = np.asarray(quad)
                left, top = points.min(axis=0)
                right, bottom = points.max(axis=0)
                if rows and abs((top+bottom)/2-(rows[-1][1]+rows[-1][3])/2) < (bottom-top)*.5:
                    a,b,c,d=rows[-1]
                    rows[-1]=(min(a,left),max(b,top),max(c,right),min(d,bottom))
                else:
                    rows.append((left,top,right,bottom))
            slots=[(left+(right-left)*.05,top+(bottom-top)*.05,(right-left)*.9,(bottom-top)*.9)
                   for left,top,right,bottom in rows]
            characters=''.join(text.splitlines())
            for size in range(maximum,5,-1):
                candidate=comic_font(font_path,style,size,fonts)
                glyph_width=max((candidate.getlength(char) for char in characters),default=size)
                capacities=[max(0,int(slot[2]/max(1,glyph_width))) if size<=slot[3] else 0 for slot in slots]
                counts=allocate_comic_line_counts(len(characters),capacities,[slot[2] for slot in slots])
                if counts is not None:
                    break
            else:
                raise ValueError('textOverflow')
            offset=0
            displayed=[]
            for (left,top,slot_width,slot_height),count in zip(slots,counts):
                line=characters[offset:offset+count]
                if not line:
                    continue
                while line and candidate.getlength(line)>slot_width:
                    line=line[:-1]
                displayed.append(line)
                comic_draw_text(draw,(left+(slot_width-candidate.getlength(line))/2,top+(slot_height-size)/2),line,candidate,style)
                offset+=len(line)
            if offset<len(characters):
                raise ValueError('textOverflow')
            if metrics is not None:
                metrics[region['id']]=resolved_comic_layout(region,text,size,size*style.get('lineSpacing',1.15),x,y,width,height,displayed,candidate)
            continue
        source_layout_matches = (abs(region['x']-source_left)<=1 and abs(region['y']-source_top)<=1
                                 and abs(region['x']+region['width']-source_right)<=1
                                 and abs(region['y']+region['height']-source_bottom)<=1)
        if automatic and vertical and source_columns and source_layout_matches and region.get('kind')!='dialogue':
            slots = []
            for quad in sorted(source_columns, key=lambda value: -sum(point[0] for point in value) / len(value)):
                points = np.asarray(quad)
                left, top = points.min(axis=0)
                right, bottom = points.max(axis=0)
                inset_x, inset_y = (right-left)*.08, (bottom-top)*.08
                slots.append((left+inset_x, top+inset_y, right-left-2*inset_x, bottom-top-2*inset_y))
            characters = ''.join(text.splitlines())
            for size in range(maximum, 5, -1):
                candidate = comic_font(font_path, style, size, fonts)
                advance = size
                capacity = [max(0, int(slot[3] / advance)) if size <= slot[2] and all(candidate.getlength(char) <= slot[2] for char in characters) else 0 for slot in slots]
                columns=allocate_comic_columns(characters,capacity)
                if columns is not None:
                    break
            else:
                region['qa'] = list(dict.fromkeys([*region['qa'], 'textOverflow']))
                raise ValueError('textOverflow')
            if metrics is not None:
                metrics[region['id']]=resolved_comic_layout(region,text,size,size*style.get('lineSpacing',1.15),x,y,width,height,
                    [column for column in columns if column],candidate)
            offset = 0
            for (left, top, slot_width, slot_height), column in zip(slots, columns):
                for index, char in enumerate(column):
                    glyph_width = candidate.getlength(char)
                    comic_draw_text(draw, (left+(slot_width-glyph_width)/2, top+index*advance), vertical_comic_glyph(char,candidate),candidate,style)
                offset += len(column)
                if offset == len(characters):
                    break
            continue
        fits = False
        for size in range(maximum, 5, -1):
            font = comic_font(font_path, style, size, fonts)
            glyph_height = max((font.getbbox(char)[3] - font.getbbox(char)[1]
                                for char in text if not char.isspace()), default=size)
            row_advance = max(size, glyph_height + 2*round(style.get("strokeWidth",0)))
            line_height = (row_advance if vertical else max(size,glyph_height)) * style.get("lineSpacing",1.15)
            if vertical:
                count = max(1, int(height / row_advance))
                lines = allocate_comic_columns(text,[count]*max(1,int(width/line_height)))
                fits = lines is not None and row_advance <= height and len(lines) * line_height <= width and all(
                    font.getlength(char) <= line_height for char in text if not char.isspace())
            else:
                lines=wrap_comic_horizontal(draw,text,font,width)
                fits = len(lines) * line_height <= height and all(draw.textlength(line, font=font) <= width for line in lines)
            if fits:
                break
        if not fits:
            region["qa"] = list(dict.fromkeys([*region["qa"], "textOverflow"]))
            raise ValueError("textOverflow")
        if vertical:
            block_width=len(lines)*line_height
            block_height=max((len(line)*row_advance for line in lines),default=row_advance)
            measured_x=x+(width-block_width)/2
            measured_y=y if style['align']=='left' else y+height-block_height if style['align']=='right' else y+(height-block_height)/2
        else:
            measured_x,measured_y,block_width,block_height=x,y,width,height
        if metrics is not None:
            metrics[region['id']]=resolved_comic_layout(region,text,size,line_height,measured_x,measured_y,block_width,block_height,lines,font)
        color = style["color"]
        if vertical:
            for column, line in enumerate(lines):
                line_height_pixels=len(line)*row_advance
                start_y=y if style['align']=='left' else y+height-line_height_pixels if style['align']=='right' else y+(height-line_height_pixels)/2
                center_x=x+width/2+(len(lines)-1-2*column)*line_height/2
                for row, char in enumerate(line):
                    glyph=vertical_comic_glyph(char,font)
                    comic_draw_text(draw,(center_x-font.getlength(glyph)/2,start_y+row*row_advance+round(style.get('strokeWidth',0))),glyph,font,style)
        else:
            start_y = y + (height - len(lines) * line_height) / 2
            ascent,descent=font.getmetrics()
            baseline=(line_height+ascent-descent)/2
            for row, line in enumerate(lines):
                line_width = draw.textlength(line, font=font)
                offset = 0 if style["align"] == "left" else width - line_width if style["align"] == "right" else (width - line_width) / 2
                comic_draw_text(draw,(x+offset,start_y+row*line_height+baseline),line,font,style,anchor='ls')
    return cv2.cvtColor(np.array(canvas), cv2.COLOR_RGB2BGR)


class ComicBatchRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    projectIds: list[UUID] = Field(min_length=1, max_length=1000)


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
    stage: Literal["full", "clean", "detect", "ocr", "translate", "repair", "layout"]
    regionId: UUID | None = None
    overwriteManual: bool = False
    selection: list | None = Field(default=None,min_length=1,max_length=2000)
    model: str = Field(max_length=512)
    ocrResourceId: str = Field(default="pp-ocrv5-mobile-onnx", max_length=200)
    glossary: dict = Field(default_factory=dict)


class ExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    quality: int = Field(default=95,ge=1,le=100)
    kind: Literal["images", "cbz", "project", "pdf", "epub", "png", "jpg", "json", "labelplus"]
    layer: Literal["source", "clean", "rendered"] = "rendered"
    pageIds: list[UUID] | None = Field(default=None, min_length=1, max_length=1000)


class DirectoryExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    directory: str = Field(min_length=1, max_length=32767)
    layer: Literal["source", "clean", "rendered"] = "rendered"
    pageIds: list[UUID] | None = Field(default=None, min_length=1, max_length=1000)


class ComicService:
    def __init__(self, root: Path, ocr, font_path: Path):
        self.repository = ComicRepository(root)
        self.ocr = ocr
        self.font_path = font_path
        from .comic_layers import ComicFonts
        self.fonts=ComicFonts(font_path,self.repository.root/"fonts")
        self.tasks: dict[str, asyncio.Task] = {}
        self.cancellations: set[str] = set()
        self._purging=False

    def runtime_services(self):
        pending=[self.ocr] if self.ocr is not None else []
        seen=set();services=[]
        while pending:
            service=pending.pop()
            if id(service) in seen:
                continue
            seen.add(id(service));services.append(service)
            for name in ('_variants','_device_variants'):
                pending.extend(getattr(service,name,{}).values())
        return services

    def runtime_status(self):
        from .screen_ocr import comic_execution_providers,comic_gpu_memory
        active={}
        for service in self.runtime_services():
            if getattr(service,'_loaded',False):
                identifier=service.spec.model_id;provider=getattr(service,'execution_provider','cpu')
                active[(identifier,provider)]={'resourceId':identifier,'provider':provider}
        return {'availableProviders':comic_execution_providers(),'activeModels':list(active.values()),**comic_gpu_memory()}

    async def purge_runtime(self):
        if self._purging or self.tasks:
            raise ValueError('resourceBusy')
        self._purging=True
        acquired=[]
        try:
            services=self.runtime_services()
            def check_idle(service):
                if (service.spec.model_id.startswith('pp-ocrv5') and getattr(service,'_loaded',False)):
                    raise ValueError('resourceBusy')
                if getattr(service,'_lock',None) is not None and service._lock.locked():
                    raise ValueError('resourceBusy')
                gate=getattr(service,'_inference_gate',None)
                if gate is not None and gate.active(service.spec.model_id):
                    raise ValueError('resourceBusy')
            locks=[];seen=set()
            for service in services:
                check_idle(service)
                for name in ('lease','_lease_lock'):
                    lock=getattr(service,name,None)
                    if lock is not None and id(lock) not in seen:
                        if lock.locked():
                            raise ValueError('resourceBusy')
                        locks.append(lock);seen.add(id(lock))
            # Unlocked asyncio locks acquire without yielding; reserve every idle owner first.
            for lock in locks:
                await lock.acquire();acquired.append(lock)
            for service in services:
                check_idle(service)
                if getattr(service,'_loaded',False):
                    await service.release()
                sessions=getattr(service,'_sessions',None)
                if sessions is not None:
                    sessions.clear()
            return self.runtime_status()
        finally:
            for lock in reversed(acquired):
                lock.release()
            self._purging=False

    def preview_region(self, project_id, page_id, region):
        import base64
        import copy
        project=self.repository.open(project_id)
        page=next((item for item in project['pages'] if item['id']==page_id),None)
        if page is None:
            raise ValueError('pageNotFound')
        candidate=validate_region(region,page)
        candidate['manuallyEdited']=True
        preview=copy.deepcopy(page)
        preview['regions']=[item for item in preview['regions'] if item['id']!=candidate['id']]+[candidate]
        metrics={}
        rgba=self.layer_rgba(preview,'text',candidate['id'],metrics)
        return {'image':'data:image/png;base64,'+base64.b64encode(encode_image(rgba)).decode('ascii'),
                'layout':metrics.get(candidate['id'])}

    def layer_rgba(self,page,kind,identifier,metrics=None):
        import cv2
        import numpy as np
        from .comic_layers import composite_drawing
        if kind=='repair':
            return cv2.imdecode(np.frombuffer(self.repository.repair_layer_path(page,identifier).read_bytes(),np.uint8),cv2.IMREAD_UNCHANGED)
        black=np.zeros((page['height'],page['width'],3),np.uint8)
        white=np.full_like(black,255)
        if kind=='drawing':
            from .comic_layers import drawing_layer_rgba
            if page.get('backgroundVisible') is False:
                base=self.transparent_page(page,clean_only=True)
            elif page.get('repairLayers'):
                base=composite_repair_layers(self.repository,page)
            else:
                base=decode_image(self.repository._page_asset(page,'clean' if page.get('hasClean') else 'source').read_bytes())
            preceding=[]
            for layer in page.get('drawingLayers',[]):
                if layer['id']==identifier:
                    base=composite_drawing(base,preceding)
                    return drawing_layer_rgba(base,{**layer,'visible':True,'opacity':1})
                preceding.append(layer)
            raise ValueError('layerNotFound')
        region=next((region for region in page['regions'] if region['id']==identifier),None)
        if region is None:
            raise ValueError('regionNotFound')
        regions=[{**region,'visible':True,'opacity':1},*[{**other,'targetText':None} for other in page['regions'] if other['id']!=identifier]]
        return comic_rgba_layer(render_page(black,regions,self.font_path,self.fonts,metrics),render_page(white,regions,self.font_path,self.fonts,metrics))

    def transparent_page(self,page,clean_only=False):
        import numpy as np
        from PIL import Image
        canvas=Image.new('RGBA',(page['width'],page['height']))
        groups=[('repair',page.get('repairLayers',[]))]
        if not clean_only:
            groups.extend([('drawing',page.get('drawingLayers',[])),('text',page['regions'])])
        for kind,layers in groups:
            for layer in layers:
                if not layer.get('visible',True) or layer.get('opacity',1)==0 or (kind=='text' and layer.get('ignored')):
                    continue
                rgba=self.layer_rgba(page,kind,layer['id'])
                if rgba is None:
                    raise ValueError('assetIntegrity')
                rgba=rgba[:,:,[2,1,0,3]].copy()
                rgba[:,:,3]=np.rint(rgba[:,:,3].astype(float)*layer.get('opacity',1)).astype(np.uint8)
                canvas.alpha_composite(Image.fromarray(rgba),(layer.get('x',0),layer.get('y',0)) if kind=='repair' else (0,0))
        return np.asarray(canvas)[:,:,[2,1,0,3]]

    def run(self, project_id: str, request: RunRequest, gateway, provider_options):
        if self._purging or len(self.tasks) >= 4:
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
        if request.selection is not None:
            if request.stage!='repair' or len(ids)!=1 or request.regionId:
                raise ValueError('invalidSelection')
            selected=next(page for page in project['pages'] if page['id']==ids[0])
            validate_comic_polygon(request.selection,selected)
        if request.regionId and (request.stage not in ("ocr", "translate", "repair", "layout") or len(ids) != 1
                or not any(region["id"] == str(request.regionId)
                           for page in project["pages"] if page["id"] == ids[0] for region in page["regions"])):
            raise ValueError("regionNotFound")
        if request.stage in ("full", "clean", "repair") and project["config"].get("repairMethod") in ("lama","lama-manga"):
            if self.ocr is None:
                raise ValueError("modelMissing")
            self.ocr.variant(comic_inpaint_resource(project["config"],self.ocr))._verify()
        job = {"id": str(request.jobId), "state": "running", "stage": request.stage, "completedPages": 0, "totalPages": len(ids)}
        self.repository.save_job(project_id, job, input_snapshot={'config': project['config'], 'request': request.model_dump(mode='json'),
            'sourceAssets': {page['id']: page['sourceAsset'] for page in project['pages'] if page['id'] in ids}})
        task = asyncio.create_task(self._run(project, request, gateway, provider_options, job))
        self.tasks[job["id"]] = task
        task.add_done_callback(lambda _: self.tasks.pop(job["id"], None))
        return self.repository.open(project_id)

    async def _run(self, project, request, gateway, provider_options, job):
        from .direct_inference import DirectMtRequest, run_direct_inference
        from .gateway.capabilities import GatewayError

        project_id, revision = project["id"], project["revision"]
        config = {**project["config"], "repairMethod": comic_repair_method(project["config"], self.ocr)}
        neural_service = None
        detector_service = None
        manga_service = None
        ocr_service=None
        angle_service=None
        font_services={}
        font_failed=set()
        pp_service=None
        pp_owned=False
        detector_method=comic_detector_method(config,self.ocr)
        comic_detector=detector_method in ("rtdetr","rfdetr-seg")
        stage = request.stage
        recoverable = {"noRegions", "maskNeedsReview", "textOverflow", "repairRequired", "emptyTranslation", "translationFailed", "translationNeedsReview"}

        def check_cancelled():
            if job["id"] in self.cancellations:
                raise asyncio.CancelledError

        def begin(name, page):
            check_cancelled()
            job.update(stage=name, pageId=page["id"])
            self.repository.save_job(project_id, job)

        def publish(page, *, clear_rendered=False):
            nonlocal revision
            check_cancelled()
            if clear_rendered:
                page.pop("renderedAsset", None)
                page["hasRendered"] = False
            revision = self.repository.publish_page(project_id, revision, page)

        async def ppocr():
            nonlocal pp_service,pp_owned
            if pp_service is None:
                candidate=comic_ppocr_service(self.ocr,request.ocrResourceId,config['sourceLanguage'],config.get('executionProviders',{}).get('ocr','cpu'))
                if hasattr(candidate,'lease'):
                    await candidate.lease.acquire()
                    pp_service=candidate
                    pp_owned=not pp_service._loaded
                    if pp_owned:
                        await pp_service.load()
                else:
                    pp_service=candidate
            return pp_service

        async def process(page):
            nonlocal detector_service, manga_service,ocr_service,angle_service
            check_cancelled()
            def load(kind):
                path = self.repository.asset_path(project_id, page["id"], kind)
                return decode_image(path.read_bytes())

            original = await asyncio.to_thread(load, "source") if stage not in ("translate", "layout") else None

            if request.selection is not None:
                import cv2
                import numpy as np
                begin('repair',page)
                if page.get('repairLayers'):
                    base=composite_repair_layers(self.repository,page)
                else:
                    base=await asyncio.to_thread(load,'clean') if page.get('hasClean') else original
                from .comic_selection import selection_mask
                mask=selection_mask(request.selection,page['width'],page['height'])
                if not mask.any():
                    raise ValueError('invalidSelection')
                cleaned=(await repair_comic_regions(neural_service,base,mask,[]) if neural_service is not None
                         else await asyncio.to_thread(cv2.inpaint,base,mask,3,cv2.INPAINT_TELEA))
                if not page.get('repairLayers') and page.get('hasClean'):
                    previous_mask=(np.any(base!=original,axis=2).astype(np.uint8)*255)
                    append_repair_layer(self.repository,page,base,previous_mask,'Repair')
                append_repair_layer(self.repository,page,cleaned,mask,'Selection repair')
                page['cleanAsset']=self.repository.asset(encode_image(composite_repair_layers(self.repository,page)))
                page['hasClean']=True
                publish(page,clear_rendered=True)
                return

            if stage == "detect" or (stage == "full" and not request.regionId) or (stage in ("full", "clean", "ocr") and
                                     page["status"] == "imported" and not page["regions"]):
                begin("detect", page)
                if self.ocr is None:
                    raise ValueError("ocrUnavailable")
                if comic_detector:
                    if detector_service is None:
                        detector = comic_model_variant(self.ocr,'comic-rfdetr-seg-onnx' if detector_method=='rfdetr-seg' else COMIC_DETECTOR_ID,'detector',config)
                        await detector.lease.acquire()
                        detector_service = detector
                        try:
                            await detector_service.load()
                        except ValueError as error:
                            if str(error) in ("modelMissing", "modelCorrupt"):
                                raise ValueError("detectorUnavailable") from error
                            raise
                    detector = detector_service
                else:
                    detector = await ppocr()
                quads = await detector.detect_comic(original)
                predicted_mask=getattr(detector,'text_mask',None)
                if predicted_mask is not None and predicted_mask.any():
                    page['detectorMaskAsset']=self.repository.asset(encode_image(predicted_mask))
                else:
                    page.pop('detectorMaskAsset',None)
                if comic_detector:
                    # RT-DETR supplies text blocks; PP-OCR refines their line geometry and direction.
                    line_detector = await ppocr()
                    line_quads = await line_detector.detect_comic(original)
                    line_quads = await asyncio.to_thread(refine_art_columns, original, line_quads, quads)
                    regions = await asyncio.to_thread(refine_detected_text_blocks,original,line_quads,quads,config['readingDirection'])
                    fallback = await asyncio.to_thread(detect_comic_regions, original,
                        [{"quad": quad, "text": "", "confidence": None} for quad in quads],
                        config["readingDirection"], False)
                    # Keep novel RT detections, without reintroducing broad boxes over refined lines.
                    regions.extend(region for region in fallback if not any(
                        overlaps_source(region, existing) for existing in regions))
                    apply_comic_bubbles(regions, getattr(detector_service, 'bubble_quads', []), config['targetLanguage'])
                else:
                    regions = await asyncio.to_thread(
                        detect_comic_regions, original,
                        [{"quad": quad, "text": "", "confidence": None} for quad in quads],
                        config["readingDirection"], True)
                from ..models import ocr_catalog
                angle_spec=getattr(ocr_catalog,'ANGLENET',None)
                models=getattr(self.ocr,'models',None)
                if angle_spec is not None and models is not None and models.is_installed(angle_spec):
                    if angle_service is None:
                        candidate=self.ocr.variant(angle_spec.model_id)
                        await candidate.lease.acquire()
                        angle_service=candidate
                        await angle_service.load()
                    for region in regions:
                        if region.get('kind')=='dialogue':
                            continue
                        estimated=await angle_service.estimate(original,source_quad(region))
                        angle=estimated[0] if isinstance(estimated,tuple) else estimated
                        if angle is not None:
                            region['style']['angle']=float(angle)
                for region in regions:
                    region['sourceStyle'] = dict(region['style'])
                if config['targetLanguage'].split('-')[0] not in ('zh','ja','ko'):
                    for region in regions:
                        region['style']['direction']='horizontal'
                previous_region_ids = [region["id"] for region in page["regions"]]
                # Full reruns rebuild generated geometry while retaining manual and protected regions.
                if stage == "full" and not request.regionId:
                    page["regions"] = [region for region in page["regions"]
                                       if region["locked"] or region["ignored"] or region.get('editLocked') or region.get('manuallyEdited')
                                       or not region.get("sourceLines") and region.get("confidence") is None]
                # Existing boxes are editable inputs, including user-drawn boxes.
                additions = [region for region in regions if not any(
                    overlaps_source(region, existing) for existing in page["regions"])]
                geometry_changed = bool(additions) or previous_region_ids != [region["id"] for region in page["regions"]]
                if geometry_changed or page["status"] == "imported":
                    page["regions"].extend(additions)
                    page["status"] = "detected"
                    publish(page, clear_rendered=geometry_changed)

            regions = [region for region in page["regions"] if not request.regionId
                       or region["id"] == str(request.regionId)]
            editable = [region for region in regions if (not region["locked"] or request.regionId and request.overwriteManual) and not region["ignored"]
                        and not region.get('editLocked')]

            if stage in ("full", "ocr"):
                begin("ocr", page)
                changed = False
                pending = [region for region in editable if not region["sourceText"] or request.overwriteManual
                           or not region.get('manuallyEdited') and (request.regionId or region["confidence"] is not None)]
                if pending:
                    if self.ocr is None:
                        raise ValueError("ocrUnavailable")
                    use_manga = manga_ocr_enabled(config, self.ocr)
                    selected_ocr={'baberu':'baberu-ocr-onnx','ppocrv6':'pp-ocrv6-medium-onnx','paddleocr-vl':'paddleocr-vl-1.6-onnx'}.get(config.get('ocr'))
                    if selected_ocr and ocr_service is None:
                        candidate=comic_model_variant(self.ocr,selected_ocr,'ocr',config)
                        await candidate.lease.acquire()
                        ocr_service=candidate
                        try:
                            await ocr_service.load()
                        except ValueError as error:
                            if str(error)=='modelMissing':
                                raise ValueError('ocrModelMissing') from error
                            raise
                    if use_manga:
                        if manga_service is None:
                            candidate=comic_model_variant(self.ocr,'manga-ocr-onnx','ocr',config)
                            await candidate.lease.acquire()
                            manga_service=candidate
                            try:
                                await manga_service.load()
                            except ValueError as error:
                                if str(error) == 'modelMissing':
                                    raise ValueError('mangaOcrMissing') from error
                                raise
                    for region in pending:
                        check_cancelled()
                        result = await recognize_comic_region(original, region, config['sourceLanguage'],
                            await ppocr(), manga_service if use_manga else None,ocr_service)
                        recognized = [(text, score) for text, score in result if text.strip() and score >= 0.5]
                        separator = "" if config["sourceLanguage"].startswith(("ja", "zh")) else " "
                        text = ""
                        previous_index = None
                        for index, (value, score) in enumerate(result):
                            if not value.strip() or score < .5:
                                continue
                            joiner = separator
                            if text and text[-1].isascii() and text[-1].isalpha() and value[0].isascii() and value[0].isalpha():
                                joiner = " "
                                source_lines = region.get("sourceLines", [])
                                if previous_index is not None and index < len(source_lines):
                                    import numpy as np
                                    before = np.asarray(source_lines[previous_index], float)
                                    after = np.asarray(source_lines[index], float)
                                    axis = before[1] - before[0]
                                    axis /= max(1, np.linalg.norm(axis))
                                    normal = np.array([-axis[1], axis[0]])
                                    height = np.linalg.norm(before[3] - before[0])
                                    same_line = abs(np.dot(after.mean(axis=0) - before.mean(axis=0), normal)) < height * .5
                                    gap = (after @ axis).min() - (before @ axis).max()
                                    if same_line and 0 <= gap < height * .5:
                                        joiner = ""
                            text += (joiner if text else "") + value
                            previous_index = index
                        if text != region["sourceText"]:
                            changed |= bool(region["targetText"])
                            region["targetText"] = None
                            region["qa"] = []
                        region["sourceText"] = text
                        region['sourceStyle']=await asyncio.to_thread(estimate_source_style,original,region,self.fonts)
                        specification = None
                        try:
                            from ..models import ocr_catalog
                            from .comic_font_match import comic_font_is_cjk
                            cjk_font = comic_font_is_cjk(text)
                            specification = getattr(ocr_catalog, 'COMIC_YUZU_FONT' if cjk_font else 'COMIC_FONT_CLASSIFIER', None)
                            models = getattr(self.ocr, 'models', None)
                            if text.strip() and specification is not None and specification.model_id not in font_failed and models is not None and models.is_installed(specification):
                                font_service=font_services.get(specification.model_id)
                                if font_service is None:
                                    candidate = self.ocr.variant(specification.model_id)
                                    await candidate.lease.acquire()
                                    font_services[specification.model_id] = candidate
                                    font_service = candidate
                                    await font_service.load()
                                from .comic_font_match import classifier_source_crop, font_weight_from_label
                                crop = classifier_source_crop(original,source_quad(region),region.get('sourceLines'),cjk_font)
                                if crop.size:
                                    appearance = await font_service.describe(crop) if cjk_font else None
                                    candidates = appearance['candidates'] if appearance else await font_service.classify(crop)
                                    if appearance and candidates[0]['confidence'] >= .6:
                                        # BallonsTranslator's Yuzu acceptance floor; uncertain heads retain OCR appearance.
                                        region['sourceStyle'].update(appearance['sourceStyle'])
                                    elif not appearance:
                                        weight=font_weight_from_label(candidates[0]['family'])
                                        if weight is not None:
                                            region['sourceStyle']['fontWeight']=weight
                                    region['fontMatch'] = {**candidates[0], 'candidates': candidates,'model':'yuzu' if cjk_font else 'storia'}
                                    if appearance and type(appearance.get('serif')) is bool:
                                        region['fontMatch']['serif']=appearance['serif']

                        except Exception:
                            logging.getLogger(__name__).exception('Optional comic font classification failed for region %s', region['id'])
                            if specification is not None:
                                font_failed.add(specification.model_id)
                            region['qa'] = list(dict.fromkeys([*region['qa'], 'fontMatchUnavailable']))
                        if not region.get('manuallyEdited'):
                            region['style']={**region['style'],**region['sourceStyle']}
                            if config['targetLanguage'].split('-')[0] not in ('zh','ja','ko'):
                                region['style']['direction']='horizontal'
                        region["confidence"] = min((score for _, score in recognized), default=None)
                if pending or page["status"] in ("imported", "detected"):
                    page["status"] = "recognized"
                    publish(page, clear_rendered=changed)

            if stage in ("full", "translate"):
                begin("translate", page)
                if stage == "translate" and not regions and page["status"] == "imported":
                    raise ValueError("noRegions")
                targets = [region for region in editable if region["sourceText"].strip()
                           and (request.overwriteManual or not region.get('manuallyEdited') or not region['targetText'])]
                if targets and (gateway is None or not request.model):
                    raise ValueError("translationModelMissing")
                for region in targets:
                    check_cancelled()
                    if not any(char.isalpha() and char not in "ー〜～〰" for char in region["sourceText"]):
                        region["targetText"] = region["sourceText"]
                        region["qa"] = []
                        self.repository.save_job(project_id, job, candidate=page)
                        continue
                    terms = resolve_comic_terms(request.glossary, config["glossary"], project_id,
                                                region["sourceText"], config["targetLanguage"])
                    if preserve_bilingual_label(region, page['regions'], config['targetLanguage'], terms):
                        region['targetText'] = region['sourceText']
                        region['qa'] = []
                        self.repository.save_job(project_id, job, candidate=page)
                        continue
                    preceding = page["regions"][:page["regions"].index(region)]
                    history = [item["sourceText"] for item in preceding
                               if not item["ignored"] and item["sourceText"].strip()][-3:]
                    result = await run_direct_inference(gateway, DirectMtRequest(
                        id=uuid4(), model=request.model, kind="mt", text=region["sourceText"],
                        source=config["sourceLanguage"], target=config["targetLanguage"], glossary=terms),
                        provider_options=provider_options, translation_history=history)
                    if not result.text.strip():
                        raise ValueError("emptyTranslation")
                    validate_comic_translation(region["sourceText"], result.text)
                    if region['targetText'] != result.text:
                        region.pop('textRuns',None)
                        region.pop('resolvedLayout',None)
                    region["targetText"] = result.text
                    region["qa"] = (["glossaryMismatch"] if any(
                        (term.source if term.mode == "keep" else term.target) not in result.text for term in terms) else []) + [code for code in region['qa'] if code == 'fontMatchUnavailable']
                    self.repository.save_job(project_id, job, candidate=page)
                if targets or page["status"] != "rendered":
                    page["status"] = "translated"
                    publish(page, clear_rendered=bool(targets))

            if stage in ("full", "clean", "repair", "layout"):
                for region in regions:
                    if region.get('fontMatch') and region.get('targetText') and not region.get('manuallyEdited'):
                        from .comic_font_match import match_installed_candidates
                        from .comic_font_match import comic_font_is_cjk
                        if comic_font_is_cjk(region['sourceText']) and region['fontMatch'].get('model') != 'yuzu':
                            continue
                        match = await asyncio.to_thread(match_installed_candidates,
                            region['fontMatch']['candidates'], self.fonts, region['targetText'],
                            region['fontMatch'].get('serif'), config['targetLanguage'])
                        match['model']=region['fontMatch'].get('model','storia')
                        region['fontMatch'] = match
                        if match.get('matchedFamily'):
                            region['style']['fontFamily'] = match['matchedFamily']
            if stage in ("full", "clean", "repair"):
                begin("repair", page)
                clean_only = stage == "clean"
                if not clean_only:
                    if any(region["sourceText"].strip() and not (region["targetText"] or "").strip()
                           and not region["ignored"] for region in regions):
                        raise ValueError("emptyTranslation")
                    # Validate replacement layout before publishing any erased pixels.
                    await asyncio.to_thread(render_page, original, regions, self.font_path,self.fonts)
                predicted_mask=None
                if page.get('detectorMaskAsset'):
                    predicted_mask=decode_image(self.repository._page_asset(page,'detector').read_bytes())[:,:,0]
                cleaned, mask = await asyncio.to_thread(
                    repair_page, original, regions, None if request.regionId else page.get("maskStrokes"),
                    mask_only=neural_service is not None, clean_only=clean_only,detector_mask=predicted_mask)
                if mask.any() and neural_service is not None:
                    cleaned = await repair_comic_regions(neural_service, original, mask, regions)
                save_repair_layers(self.repository,page,cleaned,mask,regions,request.overwriteManual)
                cleaned=composite_repair_layers(self.repository,page)
                page["cleanAsset"] = await asyncio.to_thread(lambda: self.repository.asset(encode_image(cleaned)))
                page["hasClean"] = True
                publish(page, clear_rendered=True)

            if stage in ("full", "layout"):
                begin("layout", page)
                if not page["hasClean"]:
                    raise ValueError("repairRequired")
                if any(region["sourceText"].strip() and not (region["targetText"] or "").strip()
                       and not region["ignored"] for region in page["regions"]):
                    raise ValueError("emptyTranslation")
                layout_metrics={}
                if page.get('backgroundVisible') is False:
                    await asyncio.to_thread(render_page,await asyncio.to_thread(load,'clean'),page['regions'],self.font_path,self.fonts,layout_metrics)
                if page.get('backgroundVisible') is False or page.get('drawingLayers') or any(region["targetText"] and region["targetText"] != region["sourceText"]
                       and not region["ignored"] for region in page["regions"]):
                    def render():
                        from .comic_layers import composite_drawing
                        if page.get('backgroundVisible') is False:
                            return encode_image(self.transparent_page(page))
                        canvas=composite_drawing(load('clean'),page.get('drawingLayers',[]))
                        return encode_image(render_page(canvas,page['regions'],self.font_path,self.fonts,layout_metrics))
                    page["renderedAsset"] = self.repository.asset(await asyncio.to_thread(render))
                else:
                    page["renderedAsset"] = page["cleanAsset"]
                for region in page['regions']:
                    if region['id'] in layout_metrics:
                        region['resolvedLayout']=layout_metrics[region['id']]
                page["hasRendered"] = True
                page["status"] = "rendered"
                publish(page)

        try:
            if stage in ("full", "clean", "repair") and config.get("repairMethod") in ("lama","lama-manga"):
                candidate = comic_model_variant(self.ocr,comic_inpaint_resource(config,self.ocr),'repair',config)
                await candidate._lease_lock.acquire()
                neural_service = candidate
                await neural_service.load()
            for page_id in request.pageIds:
                page = next(page for page in project["pages"] if page["id"] == str(page_id))
                try:
                    await process(page)
                except GatewayError as error:
                    if job["stage"] != "translate":
                        raise
                    job.setdefault("issues", []).append({"pageId": page["id"], "stage": "translate",
                        "error": "translationFailed", "providerErrorCode": error.code.value,
                        "retryable": error.retryable})
                    self.repository.save_job(project_id, job)
                    if len(request.pageIds) == 1:
                        raise ValueError("translationFailed") from error
                    continue
                except ValueError as error:
                    if len(request.pageIds) == 1 or str(error) not in recoverable:
                        raise
                    job.setdefault("issues", []).append({"pageId": page["id"], "stage": job["stage"], "error": str(error)})
                    self.repository.save_job(project_id, job)
                    continue
                job["completedPages"] += 1
                self.repository.save_job(project_id, job)
            job["state"] = "completed" if job["completedPages"] or not job.get("issues") else "failed"
        except asyncio.CancelledError:
            job["state"] = "cancelled"
        except Exception as error:
            job["state"] = "failed"
            known = recoverable | {"ocrUnavailable", "detectorUnavailable", "mangaOcrMissing", "ocrModelMissing", "textTooLong", "translationModelMissing", "fontMissing",
                                   "editConflict", "modelNotLoaded", "modelMissing", "runtimeUnavailable", "inpaintFailed",
                                   "modelCorrupt", "resourceBusy", "glossaryBudgetExceeded"}
            job["error"] = str(error) if str(error) in known else "processingFailed"
        finally:
            try:
                if pp_service is not None and hasattr(pp_service,'lease'):
                    try:
                        if pp_owned:
                            await pp_service.release()
                    except Exception:
                        if job['state']=='completed':
                            job.update(state='failed',error='processingFailed')
                    finally:
                        pp_service.lease.release()
                for service, lock in (*[(model,model.lease) for model in font_services.values()],(angle_service,angle_service.lease if angle_service else None),(ocr_service,ocr_service.lease if ocr_service else None),(manga_service, manga_service.lease if manga_service else None),
                                      (detector_service, detector_service.lease if detector_service else None),
                                      (neural_service, neural_service._lease_lock if neural_service else None)):
                    if service is not None:
                        try:
                            await service.release()
                        except Exception:
                            if job["state"] == "completed":
                                job.update(state="failed", error="processingFailed")
                        finally:
                            lock.release()
            finally:
                self.cancellations.discard(job["id"])
                self.repository.save_job(project_id, job)

    async def close(self):
        self.cancellations.update(self.tasks)
        if self.tasks:
            await asyncio.gather(*self.tasks.values(), return_exceptions=True)


def build_comic_router(service: ComicService) -> APIRouter:
    router = APIRouter(prefix="/comics")
    preview_slots = asyncio.Semaphore(2)

    def preview_limit(value):
        if value is None:
            return None
        if not re.fullmatch(r'[0-9]{1,7}', value) or not 10_000 <= int(value) <= 4_000_000:
            raise HTTPException(422, detail='invalidRequest')
        return int(value)

    def preview_pixels(pixels, limit):
        if limit is not None:
            import cv2
            height, width = pixels.shape[:2]
            scale = min(1, (limit / (height * width)) ** 0.5, 1600 / max(height, width))
            if scale < 1:
                pixels = cv2.resize(pixels, (max(1, int(width * scale)), max(1, int(height * scale))), interpolation=cv2.INTER_AREA)
        return encode_image(pixels), pixels.shape[1], pixels.shape[0]

    async def bounded_preview(function):
        async with preview_slots:
            # Retain the slot until its thread finishes, including client cancellation.
            task = asyncio.create_task(asyncio.to_thread(function))
            try:
                return await asyncio.shield(task)
            except asyncio.CancelledError:
                await task
                raise

    def preview_response(result, headers=None):
        data, width, height = result
        return Response(data, media_type='image/png', headers={**(headers or {}),
            'x-image-width': str(width), 'x-image-height': str(height)})

    def invoke(function, *args):
        try:
            return function(*args)
        except (ValueError, TypeError, KeyError) as error:
            code = str(error)
            raise HTTPException(409 if code in ("conflict", "jobRunning", "editConflict") else 400, detail=code if re.fullmatch(r"[A-Za-z]{1,60}", code) else "invalidRequest") from None
        except (OSError, sqlite3.Error, zipfile.BadZipFile):
            raise HTTPException(500, detail="comicIoFailed") from None

    @router.get('/runtime')
    async def runtime_status():
        return service.runtime_status()

    @router.post('/projects/batch/delete')
    async def delete_projects(body: ComicBatchRequest):
        ids = [str(value) for value in body.projectIds]
        if len(set(ids)) != len(ids):
            raise HTTPException(400, detail='invalidRequest')
        return invoke(service.repository.delete_many, ids)

    @router.post('/projects/batch/restore')
    async def restore_projects(body: ComicBatchRequest):
        ids = [str(value) for value in body.projectIds]
        if len(set(ids)) != len(ids):
            raise HTTPException(400, detail='invalidRequest')
        return invoke(service.repository.restore_many, ids)

    @router.post('/projects/{project_id}/delete')
    async def delete_project(project_id: UUID):
        return invoke(service.repository.delete, str(project_id))

    @router.post('/projects/{project_id}/restore')
    async def restore_project(project_id: UUID):
        return invoke(service.repository.restore, str(project_id))

    @router.post('/runtime/purge')
    async def purge_runtime():
        try:
            return await service.purge_runtime()
        except ValueError as error:
            raise HTTPException(409 if str(error)=='resourceBusy' else 400,detail=str(error)) from None

    @router.get('/fonts')
    async def list_fonts():
        return await asyncio.to_thread(invoke, service.fonts.list, True)

    @router.post('/fonts/import')
    async def import_fonts(request: Request):
        body=await request.json()
        if not isinstance(body,dict) or set(body)!={'paths'} or not isinstance(body['paths'],list) or not 1<=len(body['paths'])<=100:
            raise HTTPException(400,detail='invalidRequest')
        return await asyncio.to_thread(invoke,service.fonts.import_files,body['paths'])

    @router.get('/fonts/file')
    async def font_file(family: str,weight: int=Query(default=400,ge=100,le=900),italic: bool=False):
        from fastapi.responses import FileResponse
        return FileResponse(invoke(service.fonts.resolve,family,weight,italic))

    @router.get('/fonts/preview')
    async def font_preview(family: str = Query(min_length=1, max_length=200)):
        path = await asyncio.to_thread(invoke, service.fonts.preview, family)
        if path is None:
            return Response(status_code=204)
        return FileResponse(path, media_type='image/png')

    @router.get("/projects")
    async def list_projects():
        return invoke(service.repository.list)

    @router.post('/projects/{project_id}/pages/{page_id}/preview-region')
    async def preview_region(project_id: UUID, page_id: UUID, payload: dict):
        if set(payload) != {'region'} or not isinstance(payload['region'], dict):
            raise HTTPException(400, detail='invalidCommand')
        return await asyncio.to_thread(invoke, service.preview_region, str(project_id), str(page_id), payload['region'])

    @router.get('/projects/{project_id}/pages/{page_id}/layers/{kind}/{layer_id}')
    async def layer_image(project_id: UUID,page_id: UUID,kind: Literal['repair','drawing','text'],layer_id: UUID, max_pixels: str | None = Query(default=None)):
        limit = preview_limit(max_pixels)
        project=invoke(service.repository.open,str(project_id))
        page=next((page for page in project['pages'] if page['id']==str(page_id)),None)
        if page is None:
            raise HTTPException(404,detail='pageNotFound')
        metrics={}
        result=await bounded_preview(lambda: preview_pixels(invoke(service.layer_rgba,page,kind,str(layer_id),metrics), limit))
        headers={}
        if str(layer_id) in metrics:
            import base64
            headers['x-font-size']=str(metrics[str(layer_id)]['fontSize'])
            headers['x-text-base64']=base64.b64encode(metrics[str(layer_id)]['text'].encode('utf-8')).decode('ascii')
        return preview_response(result, headers)

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
    async def image(project_id: UUID, page_id: UUID, kind: Literal["source", "clean", "rendered"], max_pixels: str | None = Query(default=None)):
        limit = preview_limit(max_pixels)
        if kind=='clean':
            project=invoke(service.repository.open,str(project_id))
            page=next((page for page in project['pages'] if page['id']==str(page_id)),None)
            if page and page.get('backgroundVisible') is False:
                return preview_response(await bounded_preview(lambda: preview_pixels(invoke(service.transparent_page,page,True), limit)))
        path = invoke(service.repository.asset_path, str(project_id), str(page_id), kind)
        if limit is None:
            return FileResponse(path, media_type="image/png")
        def thumbnail():
            import cv2
            import numpy as np
            raw=path.read_bytes()
            pixels=cv2.imdecode(np.frombuffer(raw,np.uint8),cv2.IMREAD_UNCHANGED)
            if pixels is None:
                raise HTTPException(400, detail='invalidImage')
            return preview_pixels(pixels, limit)
        return preview_response(await bounded_preview(thumbnail))

    @router.post("/projects/{project_id}/export-directory")
    async def export_directory(project_id: UUID, body: DirectoryExportRequest):
        await asyncio.to_thread(invoke, service.repository.export, str(project_id), "directory",
                                [str(value) for value in body.pageIds] if body.pageIds else None, body.layer, body.directory)
        return {"ok": True}

    @router.post("/projects/{project_id}/export")
    async def export_project(project_id: UUID, body: ExportRequest):
        from starlette.background import BackgroundTask
        path = await asyncio.to_thread(invoke, service.repository.export, str(project_id), body.kind, [str(value) for value in body.pageIds] if body.pageIds else None, body.layer,None,body.quality)
        media = {"pdf": "application/pdf", "epub": "application/epub+zip", "png": "image/png", "json": "application/json"}
        if body.kind=='jpg' and path.suffix=='.jpg':
            media['jpg']='image/jpeg'
        return FileResponse(path, media_type=media.get(body.kind, "application/zip"), background=BackgroundTask(path.unlink, missing_ok=True))

    return router
