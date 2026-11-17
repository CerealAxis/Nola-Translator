"""Transactional comic documents and immutable assets."""
from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import sqlite3
import threading
from uuid import uuid4

from .schemas import Config, PageEdit


def now():
  return datetime.now(timezone.utc).isoformat()


def identity():
  return str(uuid4())


def fingerprint(value):
  return sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


class Repository:
  def __init__(self, root: Path):
    self.root = root.resolve()
    self.assets = self.root / 'assets-v2'
    self.assets.mkdir(parents=True, exist_ok=True)
    self.path = self.root / 'library-v2.sqlite3'
    self.lock = threading.RLock()
    with self.connection() as db:
      db.executescript('''
        CREATE TABLE IF NOT EXISTS books(id TEXT PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, body TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY, request TEXT NOT NULL, result TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS edits(sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          book_id TEXT NOT NULL, before_body TEXT NOT NULL, after_body TEXT NOT NULL,
          undone INTEGER NOT NULL DEFAULT 0);
      ''')
      for row in db.execute('SELECT id,body FROM jobs').fetchall():
        job = json.loads(row['body'])
        if job['status'] in ('running', 'pausing', 'cancelling'):
          job.update(status='failed', error='interrupted', active=None)
          job['failedPageIds'] = list(dict.fromkeys(job.get('failedPageIds', []) + [p for p in job['pages'] if p not in job['done']]))
          db.execute('UPDATE jobs SET body=? WHERE id=?', (json.dumps(job), job['id']))

  @contextmanager
  def connection(self):
    with self.lock:
      db = sqlite3.connect(self.path, timeout=20)
      db.row_factory = sqlite3.Row
      db.execute('PRAGMA journal_mode=WAL')
      db.execute('PRAGMA foreign_keys=ON')
      try:
        with db:
          yield db
      finally:
        db.close()

  def asset(self, data: bytes):
    digest = sha256(data).hexdigest()
    target = self.assets / (digest + '.png')
    if not target.exists():
      temporary = self.assets / (identity() + '.tmp')
      try:
        with temporary.open('xb') as stream:
          stream.write(data)
          stream.flush()
          os.fsync(stream.fileno())
        os.replace(temporary, target)
      finally:
        temporary.unlink(missing_ok=True)
    return digest

  def asset_path(self, digest):
    if not isinstance(digest, str) or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
      raise ValueError('invalidAsset')
    target = self.assets / (digest + '.png')
    if not target.is_file():
      raise ValueError('assetMissing')
    return target

  def _book(self, db, book_id, deleted=False):
    row = db.execute('SELECT body FROM books WHERE id=?', (str(book_id),)).fetchone()
    if not row:
      raise ValueError('comicNotFound')
    book = json.loads(row['body'])
    if book.get('deletedAt') and not deleted:
      raise ValueError('comicNotFound')
    return book

  def _write(self, db, book, bump=True):
    book['pageCount'] = len(book['pages'])
    book['chapterCount'] = len(book['chapters'])
    if bump:
      book['revision'] += 1
    book['updatedAt'] = now()
    db.execute('INSERT OR REPLACE INTO books VALUES(?,?)', (book['id'], json.dumps(book, ensure_ascii=False)))
    return book

  def _history_flags(self, db, book):
    states = db.execute('SELECT undone FROM edits WHERE book_id=?', (book['id'],)).fetchall()
    book['canUndo'] = any(not row['undone'] for row in states)
    book['canRedo'] = any(row['undone'] for row in states)
    return book

  def get(self, book_id):
    with self.connection() as db:
      return self._history_flags(db, self._book(db, book_id))

  def summaries(self):
    with self.connection() as db:
      books = [json.loads(row['body']) for row in db.execute('SELECT body FROM books')]
      return [{key: value for key, value in b.items() if key in (
        'id', 'title', 'revision', 'updatedAt', 'pageCount', 'chapterCount', 'config')}
        | {'coverPageId': b['pages'][0]['id'] if b['pages'] else None}
        for b in books if not b.get('quick') and not b.get('deletedAt')]

  def quick(self):
    with self.connection() as db:
      for row in db.execute('SELECT body FROM books'):
        book = json.loads(row['body'])
        if book.get('quick') and not book.get('deletedAt'):
          return self._history_flags(db, book)
      return self._write(db, self.new_book('快速翻译', quick=True), bump=False)

  def new_book(self, title, quick=False):
    return dict(id=identity(), title=title, revision=0, updatedAt=now(), pageCount=0,
      chapterCount=1, config=Config().model_dump(), chapters=[dict(id=identity(), title='第 1 话')],
      pages=[], jobs=[], quick=quick, canUndo=False, canRedo=False)

  def append(self, pages, title, book_id=None, quick=False):
    with self.connection() as db:
      book = self._book(db, book_id) if book_id else self.new_book(title, quick)
      chapter = book['chapters'][0]['id']
      existing = {p.get('sourceIdentity') for p in book['pages']}
      book['pages'].extend(p | {'chapterId': chapter} for p in pages if p.get('sourceIdentity') not in existing)
      if book.get('quick') and not existing:
        book['title'] = title
      return self._write(db, book)

  def save_workspace(self, book_id):
    with self.connection() as db:
      book = deepcopy(self._book(db, book_id))
      chapter_ids = {c['id']: identity() for c in book['chapters']}
      book.update(id=identity(), quick=False, revision=0, canUndo=False, canRedo=False)
      for chapter in book['chapters']:
        chapter['id'] = chapter_ids[chapter['id']]
      for page in book['pages']:
        page.update(id=identity(), chapterId=chapter_ids[page['chapterId']])
        for region in page['regions']:
          region['id'] = identity()
        for stroke in page.get('maskStrokes', []):
          stroke['id'] = identity()
      return self._write(db, book, bump=False)

  def delete(self, ids, restore=False):
    with self.connection() as db:
      for book_id in ids:
        book = self._book(db, book_id, deleted=True)
        book['deletedAt'] = None if restore else now()
        self._write(db, book)

  def mutate(self, book_id, request, *, preview=False, prepared_pages=None):
    raw = request.model_dump(mode='json')
    serialized = json.dumps({'bookId': str(book_id), 'request': raw}, sort_keys=True)
    with self.connection() as db:
      replay = db.execute('SELECT request,result FROM operations WHERE id=?', (str(request.operationId),)).fetchone()
      if replay:
        if replay['request'] != serialized:
          raise ValueError('revisionConflict')
        return json.loads(replay['result'])
      book = self._book(db, book_id)
      if book['revision'] != request.expectedRevision:
        raise ValueError('revisionConflict')
      command = request.command
      action = command.get('action')
      if action in ('undo', 'redo'):
        undone = action == 'redo'
        order = 'ASC' if undone else 'DESC'
        edit = db.execute(f'SELECT * FROM edits WHERE book_id=? AND undone=? ORDER BY sequence {order} LIMIT 1',
          (book['id'], int(undone))).fetchone()
        if edit:
          content = json.loads(edit['after_body'] if undone else edit['before_body'])
          for key, value in content.items():
            if key == 'pages':
              by_id = {page['id']: page for page in value}
              book['pages'] = [by_id.get(page['id'], page) for page in book['pages']]
            else:
              book[key] = value
          db.execute('UPDATE edits SET undone=? WHERE sequence=?', (int(not undone), edit['sequence']))
      else:
        before = {'config': deepcopy(book['config']), 'pages': deepcopy(book['pages'])}
        if action == 'configure':
          book['config'] = Config.model_validate(command['config']).model_dump(mode='json')
        elif action == 'savePages':
          edits = [PageEdit.model_validate(value).model_dump(mode='json') for value in command.get('pages', [])]
          if not edits or len({p['id'] for p in edits}) != len(edits):
            raise ValueError('invalidPage')
          by_id = {p['id']: p for p in book['pages']}
          for edited in edits:
            page = by_id.get(edited['id'])
            if not page:
              raise ValueError('invalidPage')
            self.validate_page(edited, page)
            existing_regions = {r['id']: r for r in page['regions']}
            for region in edited['regions']:
              region.pop('resolvedLayout', None)
              previous = existing_regions.get(region['id'])
              if region.get('sourceQuad') is None:
                source = previous or region
                x, y, w, h = (source[key] for key in ('x','y','width','height'))
                region['sourceQuad'] = source.get('sourceQuad') or [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]
              if region['style'].get('fontFamily') is None:
                region['style'].pop('fontFamily', None)
              fields = ('x', 'y', 'width', 'height', 'sourceText', 'targetText', 'style', 'sourceQuad', 'textQuad')
              region['manuallyEdited'] = not previous or previous.get('manuallyEdited', False) or any(region.get(key) != previous.get(key) for key in fields)
            if edited.get('maskStrokes') is None:
              edited.pop('maskStrokes', None)
            page.update(edited)
            page['hasRendered'] = False
            page.pop('renderedAsset', None)
        elif action == 'applyProof':
          row = db.execute('SELECT body FROM jobs WHERE id=?', (command.get('jobId'),)).fetchone()
          job = json.loads(row['body']) if row else None
          if not job or job['bookId'] != book['id'] or job['status'] != 'completed':
            raise ValueError('invalidJob')
          changes = {c['id']: c for c in job.get('changes', [])}
          for page in book['pages']:
            for region in page['regions']:
              change = changes.get(region['id'])
              if change and region.get('targetText') == change['from']:
                region['targetText'] = change['to']
                page['hasRendered'] = False
                page.pop('renderedAsset', None)
        else:
          raise ValueError('invalidCommand')
        after = {'config': deepcopy(book['config']), 'pages': deepcopy(book['pages'])}
        changed = {p['id'] for p, next_page in zip(before['pages'], after['pages']) if fingerprint(p) != fingerprint(next_page)}
        before['pages'] = [p for p in before['pages'] if p['id'] in changed]
        after['pages'] = [p for p in after['pages'] if p['id'] in changed]
        if before['config'] == after['config']:
          before.pop('config')
          after.pop('config')
        db.execute('DELETE FROM edits WHERE book_id=? AND undone=1', (book['id'],))
        db.execute('INSERT INTO edits(book_id,before_body,after_body) VALUES(?,?,?)',
          (book['id'], json.dumps(before), json.dumps(after)))
        db.execute('DELETE FROM edits WHERE book_id=? AND sequence NOT IN (SELECT sequence FROM edits WHERE book_id=? ORDER BY sequence DESC LIMIT 60)', (book['id'], book['id']))
      if prepared_pages:
        for page in book['pages']:
          if page['id'] in prepared_pages:
            page.update(prepared_pages[page['id']])
        if action not in ('undo', 'redo'):
          affected = {page['id'] for page in after['pages']} | prepared_pages.keys()
          after['pages'] = [deepcopy(p) for p in book['pages'] if p['id'] in affected]
          db.execute('UPDATE edits SET after_body=? WHERE sequence=(SELECT MAX(sequence) FROM edits WHERE book_id=?)',
            (json.dumps(after), book['id']))
      self._write(db, book)
      self._history_flags(db, book)
      db.execute('INSERT INTO operations VALUES(?,?,?)', (str(request.operationId), serialized, json.dumps(book)))
      if preview:
        db.rollback()
      return book

  def is_replay(self, book_id, request):
    serialized = json.dumps({'bookId': str(book_id), 'request': request.model_dump(mode='json')}, sort_keys=True)
    with self.connection() as db:
      row = db.execute('SELECT request FROM operations WHERE id=?', (str(request.operationId),)).fetchone()
      if row and row['request'] != serialized:
        raise ValueError('revisionConflict')
      return row is not None

  def validate_page(self, edit, page):
    ids = [r['id'] for r in edit['regions']]
    if len(ids) != len(set(ids)):
      raise ValueError('invalidRegion')
    for region in edit['regions']:
      if region['x'] + region['width'] > page['width'] + .1 or region['y'] + region['height'] > page['height'] + .1:
        raise ValueError('invalidRegion')
      points = (region.get('sourceQuad') or []) + (region.get('textQuad') or [])
      points += [point for line in region.get('sourceLines') or [] for point in line]
      for point in points:
        if not 0 <= point[0] <= page['width'] or not 0 <= point[1] <= page['height']:
          raise ValueError('invalidRegion')
    for stroke in edit.get('maskStrokes') or []:
      if any(not 0 <= p[0] <= page['width'] or not 0 <= p[1] <= page['height'] for p in stroke['points']):
        raise ValueError('invalidMask')

  def jobs(self):
    with self.connection() as db:
      return [json.loads(row['body']) for row in db.execute('SELECT body FROM jobs ORDER BY rowid')]

  def job(self, job_id):
    with self.connection() as db:
      row = db.execute('SELECT body FROM jobs WHERE id=?', (str(job_id),)).fetchone()
      if not row:
        raise ValueError('invalidJob')
      return json.loads(row['body'])

  def write_job(self, db, job):
    db.execute('INSERT OR REPLACE INTO jobs VALUES(?,?)', (job['id'], json.dumps(job)))


