"""Comic application service with page checkpoints and explicit task ownership."""
from __future__ import annotations

import asyncio
import base64
from collections import OrderedDict
from contextlib import asynccontextmanager
from copy import deepcopy
from functools import lru_cache
import io
import json
import math
from pathlib import Path
import re
import zipfile

from PIL import Image

from .formats import png_bytes, read_sources, write_pdf
from .layout import Fonts, render_page
from .repository import Repository, fingerprint, identity, now
from .schemas import Config, Completion
from . import vision


@lru_cache(maxsize=32)
def preview_bytes(path, max_pixels):
  with Image.open(path) as original:
    image = original.convert('RGB')
    if image.width * image.height > max_pixels:
      scale = (max_pixels / (image.width * image.height)) ** .5
      image.thumbnail((max(1, round(image.width*scale)), max(1, round(image.height*scale))))
    return png_bytes(image)


class ComicService:
  def __init__(self, root: Path, font_path: Path, ocr=None):
    self.repository = Repository(root)
    self.fonts = Fonts(font_path)
    self.ocr = ocr
    self.stage_lock = asyncio.Lock()
    self.stage_tasks = {}
    self.font_matches = OrderedDict()

  async def lettering(self, page, base, config):
    from ..comic_font_match import match_comic_fonts
    source = await asyncio.to_thread(self.image, page)
    preserved = [dict(region, ignored=False, locked=False) for region in page['regions'] if region.get('ignored')]
    if preserved:
      # An ignored region may already have been erased in a previous clean checkpoint.
      mask, _ = await asyncio.to_thread(vision.mask_for, source, preserved, [])
      brush, _ = await asyncio.to_thread(vision.mask_for, source, [], page.get('maskStrokes', []))
      import numpy as np
      base = Image.fromarray(np.where(((mask > 0) & (brush == 0))[...,None], np.asarray(source), np.asarray(base)))
    await match_comic_fonts(self.ocr, source, page['regions'], self.fonts,
      self.font_matches, config['targetLanguage'])
    return await asyncio.to_thread(render_page, base, page['regions'], self.fonts)

  async def close(self):
    self.interrupt()
    pending = {task for tasks in self.stage_tasks.values() for task in tasks}
    if pending:
      done, _ = await asyncio.wait(pending, timeout=5)
      for task in done:
        if not task.cancelled():
          task.exception()

  def cancel_stages(self, job_id):
    for task in self.stage_tasks.get(str(job_id), ()):
      if task is not asyncio.current_task():
        task.cancel()

  @asynccontextmanager
  async def stage(self, job_id, fail=False):
    key = str(job_id)
    task = asyncio.current_task()
    if fail:
      self.cancel_stages(key)
    self.stage_tasks.setdefault(key, set()).add(task)
    acquired = False
    try:
      if not fail:
        try:
          await asyncio.wait_for(self.stage_lock.acquire(), timeout=30)
          acquired = True
        except TimeoutError as error:
          raise ValueError('resourceBusy') from error
      yield
    except asyncio.CancelledError as error:
      raise ValueError('cancelled') from error
    finally:
      if acquired:
        self.stage_lock.release()
      self.stage_tasks[key].discard(task)
      if not self.stage_tasks[key]:
        self.stage_tasks.pop(key, None)

  def public_job(self, job):
    fields = ('id', 'bookId', 'kind', 'pages', 'status', 'progress', 'createdAt',
      'changes', 'failedPageIds', 'error', 'stage')
    return {key: value for key, value in job.items() if key in fields}

  def public_book(self, book):
    result = deepcopy(book)
    result['config'] = Config.model_validate(result['config']).model_dump(mode='json')
    result.pop('jobs', None)
    result.pop('deletedAt', None)
    for page in result['pages']:
      for key in ('sourceAsset', 'cleanAsset', 'renderedAsset', 'sourceIdentity'):
        page.pop(key, None)
      for region in page['regions']:
        for key in ('sourceQuad', 'sourceLines', 'sourceFontSize', 'textQuad', 'resolvedLayout'):
          if region.get(key) is None:
            region.pop(key, None)
        if region['style'].get('fontFamily') is None:
          region['style'].pop('fontFamily', None)
    return result

  def page(self, book, page_id):
    page = next((p for p in book['pages'] if p['id'] == str(page_id)), None)
    if not page:
      raise ValueError('invalidPage')
    return page

  def image(self, page, kind='source'):
    key = {'source':'sourceAsset', 'clean':'cleanAsset', 'rendered':'renderedAsset'}[kind]
    asset = page.get(key)
    if not asset:
      raise ValueError('imageUnavailable')
    with Image.open(self.repository.asset_path(asset)) as image:
      return image.convert('RGB').copy()

  def import_book(self, request):
    pages = []
    for name, image, source_id in read_sources(request):
      pages.append(dict(id=identity(), chapterId='', name=Path(name).name,
        width=image.width, height=image.height, regions=[], maskStrokes=[],
        sourceAsset=self.repository.asset(png_bytes(image)), sourceIdentity=source_id,
        status='imported', hasClean=False, hasRendered=False, revision=0))
    title = request.title or Path(request.paths[0]).stem
    return self.repository.append(pages, title, str(request.projectId) if request.projectId else None, request.quick)

  async def document(self, book_id, request):
    if self.repository.is_replay(book_id, request):
      return self.repository.get(book_id)
    previous = self.repository.get(book_id)
    book = self.repository.mutate(book_id, request, preview=True)
    command = request.command['action']
    prepared = {}
    if command != 'configure':
      old = {p['id']: p for p in previous['pages']}
      for page in book['pages']:
        if fingerprint(page) != fingerprint(old.get(page['id'])):
          original = old.get(page['id'], {})
          if command in ('undo', 'redo'):
            page['revision'] = original.get('revision', 0) + 1
            prepared[page['id']] = page
            continue
          source = await asyncio.to_thread(self.image, page)
          strokes = page.get('maskStrokes', [])
          previous_strokes = original.get('maskStrokes', [])
          if strokes != previous_strokes:
            base = await asyncio.to_thread(self.image, original, 'clean') if original.get('hasClean') else source
            if strokes[:len(previous_strokes)] == previous_strokes:
              strokes = strokes[len(previous_strokes):]
            else:
              base = source
            cleaned = await vision.repair(self.ocr, source, base, [], strokes, book['config'])
            page.update(cleanAsset=await asyncio.to_thread(lambda: self.repository.asset(png_bytes(cleaned))), hasClean=True)
          base = await asyncio.to_thread(self.image, page, 'clean') if page.get('hasClean') else source
          if any(r.get('targetText') for r in page['regions']):
            rendered = await self.lettering(page, base, book['config'])
            page.update(renderedAsset=await asyncio.to_thread(lambda: self.repository.asset(png_bytes(rendered))), hasRendered=True, status='rendered')
          page['revision'] = original.get('revision', 0) + 1
          prepared[page['id']] = page
    self.repository.mutate(book_id, request, prepared_pages=prepared)
    return self.repository.get(book_id)

  async def render(self, book_id, page_id, repair_masks=False):
    book = self.repository.get(book_id)
    page = self.page(book, page_id)
    expected = fingerprint(page)
    source = await asyncio.to_thread(self.image, page)
    if repair_masks:
      cleaned = await vision.repair(self.ocr, source, source, page['regions'], page.get('maskStrokes', []), book['config'])
      page.update(cleanAsset=await asyncio.to_thread(lambda: self.repository.asset(png_bytes(cleaned))), hasClean=True)
    base = await asyncio.to_thread(self.image, page, 'clean') if page.get('hasClean') else source
    if any(r.get('targetText') for r in page['regions']):
      rendered = await self.lettering(page, base, book['config'])
      page.update(renderedAsset=await asyncio.to_thread(lambda: self.repository.asset(png_bytes(rendered))), hasRendered=True, status='rendered')
    with self.repository.connection() as db:
      current = self.repository._book(db, book_id)
      target = self.page(current, page_id)
      if fingerprint(target) != expected:
        raise ValueError('revisionConflict')
      target.update(page)
      target['revision'] = target.get('revision', 0) + 1
      self.repository._write(db, current)
    return page

  async def image_bytes(self, book_id, page_id, kind, max_pixels=None):
    book = self.repository.get(book_id)
    page = self.page(book, page_id)
    if kind == 'rendered' and not page.get('hasRendered'):
      await self.render(book_id, page_id)
      page = self.page(self.repository.get(book_id), page_id)
      if not page.get('hasRendered') and page.get('hasClean'):
        kind = 'clean'
      elif not page.get('hasRendered'):
        kind = 'source'
    asset = page.get({'source':'sourceAsset', 'clean':'cleanAsset', 'rendered':'renderedAsset'}[kind])
    if not asset:
      raise ValueError('imageUnavailable')
    path = self.repository.asset_path(asset)
    if max_pixels:
      loader = preview_bytes if max_pixels <= 4_000_000 else preview_bytes.__wrapped__
      return await asyncio.to_thread(loader, str(path), max_pixels)
    return await asyncio.to_thread(path.read_bytes)

  def create_job(self, request):
    with self.repository.connection() as db:
      book = self.repository._book(db, request.projectId)
      if book['revision'] != request.expectedRevision:
        raise ValueError('revisionConflict')
      ids = [str(value) for value in request.pageIds]
      region_ids = [str(value) for value in request.regionIds] if request.regionIds else None
      if len(ids) != len(set(ids)) or any(not any(p['id'] == value for p in book['pages']) for value in ids):
        raise ValueError('invalidPage')
      if region_ids and any(not any(r['id'] == value for p in book['pages'] if p['id'] in ids for r in p['regions']) for value in region_ids):
        raise ValueError('invalidRegion')
      job = dict(id=identity(), bookId=book['id'], kind=request.kind, pages=ids,
        regionIds=region_ids, status='queued', progress=0, createdAt=now(), changes=[],
        failedPageIds=[], done=[], config=Config.model_validate(book['config']).model_dump(mode='json'), active=None,
        glossaryDocument=request.glossaryDocument, wordRulesDocument=request.wordRulesDocument,
        modelConfigSignature=request.modelConfigSignature)
      self.repository.write_job(db, job)
      return job

  def delete_books(self, ids, restore=False):
    self.repository.delete(ids, restore=restore)
    if not restore:
      deleted = {str(value) for value in ids}
      for job in self.repository.jobs():
        if job['bookId'] in deleted and job['status'] not in ('completed', 'cancelled'):
          self.control(job['id'], 'cancel')

  def control(self, job_id, action):
    with self.repository.connection() as db:
      row = db.execute('SELECT body FROM jobs WHERE id=?', (str(job_id),)).fetchone()
      if not row:
        raise ValueError('invalidJob')
      job = json.loads(row['body'])
      if action == 'retry':
        if job['status'] != 'failed' or not job['failedPageIds']:
          raise ValueError('invalidJobState')
        job.update(id=identity(), pages=list(job['failedPageIds']), status='queued', progress=0,
          createdAt=now(), done=[], changes=[], failedPageIds=[], active=None)
        job.pop('error', None)
      elif action == 'pause':
        if job['status'] not in ('queued', 'running'):
          raise ValueError('invalidJobState')
        job['status'] = 'pausing' if job.get('active') else 'paused'
      elif action == 'resume':
        if job['status'] != 'paused':
          raise ValueError('invalidJobState')
        job['status'] = 'queued'
      elif action == 'cancel':
        if job['status'] in ('completed', 'cancelled'):
          raise ValueError('invalidJobState')
        job.update(status='cancelled', active=None)
      else:
        raise ValueError('invalidCommand')
      self.repository.write_job(db, job)
      if action == 'cancel':
        self.cancel_stages(job_id)
      return job

  def interrupt(self):
    for job_id in tuple(self.stage_tasks):
      self.cancel_stages(job_id)
    with self.repository.connection() as db:
      for row in db.execute('SELECT body FROM jobs').fetchall():
        job = json.loads(row['body'])
        if job['status'] in ('running', 'pausing', 'cancelling'):
          job.update(status='failed', active=None, error='interrupted')
          job['failedPageIds'] = list(dict.fromkeys(job.get('failedPageIds', []) + [p for p in job['pages'] if p not in job['done']]))
          self.repository.write_job(db, job)

  def claim(self):
    with self.repository.connection() as db:
      for row in db.execute('SELECT body FROM jobs ORDER BY rowid'):
        job = json.loads(row['body'])
        if job['status'] not in ('queued', 'running') or job.get('active'):
          continue
        remaining = [p for p in job['pages'] if p not in job['done']]
        if not remaining:
          continue
        try:
          book = self.repository._book(db, job['bookId'])
        except ValueError as error:
          if str(error) != 'comicNotFound':
            raise
          job.update(status='cancelled', active=None)
          self.repository.write_job(db, job)
          continue
        page = self.page(book, remaining[0])
        active = dict(pageId=page['id'], attemptId=identity(), fingerprint=fingerprint(page))
        job.update(status='running', active=active, stage='preparing')
        self.repository.write_job(db, job)
        return dict(jobId=job['id'], pageId=page['id'], attemptId=active['attemptId'])
    return None

  def active(self, db, job_id, attempt_id, page_id):
    row = db.execute('SELECT body FROM jobs WHERE id=?', (str(job_id),)).fetchone()
    job = json.loads(row['body']) if row else None
    active = job.get('active') if job else None
    if not active or active['attemptId'] != str(attempt_id) or active['pageId'] != str(page_id) or job['status'] not in ('running', 'pausing'):
      raise ValueError('staleAttempt')
    return job

  async def prepare(self, job_id, request):
    async with self.stage(job_id):
      with self.repository.connection() as db:
        job = self.active(db, job_id, request.attemptId, request.pageId)
        book = self.repository._book(db, job['bookId'])
        page = deepcopy(self.page(book, request.pageId))
        if fingerprint(page) != job['active']['fingerprint']:
          raise ValueError('revisionConflict')
      kind, config = job['kind'], job['config']
      source = await asyncio.to_thread(self.image, page)
      preserve_language = kind in ('normal', 'visual', 'translate') and vision.same_language(config)
      automatic_regions = any(not r.get('manuallyEdited') and not r.get('locked') for r in page['regions'])
      if not preserve_language and (kind == 'detect'
        or kind in ('normal', 'visual') and not job.get('regionIds') and automatic_regions
        or not page['regions'] and kind in ('normal', 'visual', 'erase', 'ocr', 'repair')):
        page['regions'] = await vision.detect(self.ocr, source, config, page['regions'])
        page['status'] = 'detected'
      regions = [r for r in page['regions'] if not job.get('regionIds') or r['id'] in job['regionIds']]
      recognized = []
      if kind == 'ocr':
        await vision.recognize(self.ocr, source, config, regions)
        recognized = regions
        page['status'] = 'recognized'
      elif kind in ('normal', 'visual') and not preserve_language:
        empty = [r for r in regions if not r['sourceText'].strip() and not r.get('ignored')]
        if empty:
          await vision.recognize(self.ocr, source, config, empty)
          recognized = empty
          page['status'] = 'recognized'
      if kind in ('normal', 'visual', 'translate'):
        await vision.filter_translations(self.ocr, source, config,
          [region for region in regions if region not in recognized])
      with self.repository.connection() as db:
        current_job = self.active(db, job_id, request.attemptId, request.pageId)
        current = self.repository._book(db, job['bookId'])
        target = self.page(current, request.pageId)
        if fingerprint(target) != job['active']['fingerprint']:
          raise ValueError('revisionConflict')
        target.update(page)
        target['revision'] = target.get('revision', 0) + 1
        page['revision'] = target['revision']
        self.repository._write(db, current)
        current_job['active']['fingerprint'] = fingerprint(page)
        current_job['stage'] = 'translating' if kind in ('normal', 'visual', 'translate', 'proof') else 'processing'
        self.repository.write_job(db, current_job)
      visual = source.copy()
      if visual.width * visual.height > 2_000_000:
        scale = (2_000_000 / (visual.width * visual.height)) ** .5
        visual.thumbnail((max(1, int(visual.width * scale)), max(1, int(visual.height * scale))))
      region_images = {}
      if kind == 'visual':
        selected = [r for r in regions if not r.get('ignored') and not r.get('locked') and r['sourceText'].strip()]
        pixel_budget = min(512_000, 8_000_000 // max(1, len(selected)))
        for region in selected:
          points = vision.quad(region)
          left = max(0, math.floor(min(p[0] for p in points)))
          top = max(0, math.floor(min(p[1] for p in points)))
          right = min(source.width, math.ceil(max(p[0] for p in points)))
          bottom = min(source.height, math.ceil(max(p[1] for p in points)))
          if left >= right or top >= bottom:
            raise ValueError('invalidRegion')
          crop = source.crop((left, top, right, bottom))
          if crop.width * crop.height > pixel_budget:
            scale = (pixel_budget / (crop.width * crop.height)) ** .5
            crop.thumbnail((max(1, int(crop.width * scale)), max(1, int(crop.height * scale))))
          region_images[region['id']] = base64.b64encode(await asyncio.to_thread(png_bytes, crop)).decode()
      return dict(jobId=job['id'], pageId=page['id'], attemptId=str(request.attemptId), kind=kind,
        config=config, page=page, regionIds=job.get('regionIds'), sourceImage=base64.b64encode(await asyncio.to_thread(png_bytes, visual)).decode(),
        regionImages=region_images,
        glossaryDocument=job.get('glossaryDocument'), wordRulesDocument=job.get('wordRulesDocument'), bookId=job['bookId'],
        modelConfigSignature=job.get('modelConfigSignature', ''))

  async def complete(self, job_id, request):
    async with self.stage(job_id, fail=bool(request.error)):
      with self.repository.connection() as db:
        job = self.active(db, job_id, request.attemptId, request.pageId)
        book = self.repository._book(db, job['bookId'])
        page = deepcopy(self.page(book, request.pageId))
        expected = job['active']['fingerprint']
      error = request.error
      if not error:
        try:
          if fingerprint(page) != expected:
            raise ValueError('revisionConflict')
          kind, config = job['kind'], job['config']
          regions = [r for r in page['regions'] if not job.get('regionIds') or r['id'] in job['regionIds']]
          targets = [r for r in regions if not r.get('ignored') and not r.get('locked') and r['sourceText'].strip()]
          if kind in ('normal', 'visual', 'translate', 'proof'):
            values = request.translations
            if len(values) != len(targets) or {v.get('id') for v in values} != {r['id'] for r in targets}:
              raise ValueError('invalidTranslationResult')
            by_id = {v['id']: v.get('text') for v in values}
            if any(not isinstance(text, str) or len(text) > 64000 for text in by_id.values()):
              raise ValueError('invalidTranslationResult')
            for region in targets:
              if kind == 'proof':
                job['changes'].append(dict(id=region['id'], **{'from':region.get('targetText') or '', 'to':by_id[region['id']]}))
              else:
                region['targetText'] = by_id[region['id']]
                # Filtering precedes mask generation, as in manga-image-translator.
                if not vision.has_letters(region['targetText']) or vision.same_text(region['sourceText'], region['targetText']):
                  region['ignored'] = True
                settings = config['renderSettings']
                if not region.get('manuallyEdited'):
                  region['style'].update(fontFamily=settings['fontFamily'], fontSize=settings['fontSize'], autoFontSize=settings['autoSize'],
                    autoFont=settings['autoFont'], autoLineSpacing=settings['autoLineSpacing'],
                    autoAlign=settings['autoAlign'], autoBlockAlign=settings['autoBlockAlign'],
                    align=settings['align'], blockAlign=settings['blockAlign'], lineSpacing=settings['lineSpacing'],
                    strokeColor=settings['strokeColor'], strokeWidth=settings['strokeWidth'])
                  if settings['direction'] != 'auto':
                    region['style']['direction'] = settings['direction']
                  elif config['targetLanguage'].split('-')[0] not in ('ja', 'zh'):
                    region['style']['direction'] = 'horizontal'
                  region['style']['color'] = settings['color'] if not settings['autoColor'] else await asyncio.to_thread(vision.text_color, await asyncio.to_thread(self.image, page), region)
          if kind in ('normal', 'visual', 'erase', 'repair'):
            source = await asyncio.to_thread(self.image, page)
            base = await asyncio.to_thread(self.image, page, 'clean') if page.get('hasClean') and job.get('regionIds') else source
            cleaned = await vision.repair(self.ocr, source, base, regions, page.get('maskStrokes', []), config)
            page.update(cleanAsset=await asyncio.to_thread(lambda: self.repository.asset(png_bytes(cleaned))), hasClean=True)
          if kind in ('normal', 'visual', 'translate', 'repair'):
            base = await asyncio.to_thread(self.image, page, 'clean') if page.get('hasClean') else await asyncio.to_thread(self.image, page)
            rendered = await self.lettering(page, base, config)
            page.update(renderedAsset=await asyncio.to_thread(lambda: self.repository.asset(png_bytes(rendered))), hasRendered=True, status='rendered')
          elif kind == 'erase':
            page.update(hasRendered=False)
            page.pop('renderedAsset', None)
        except Exception as cause:
          error = str(cause)[:1000] or type(cause).__name__
      with self.repository.connection() as db:
        latest_job = self.active(db, job_id, request.attemptId, request.pageId)
        current = self.repository._book(db, job['bookId'])
        target = self.page(current, request.pageId)
        if not error and fingerprint(target) != expected:
          error = 'revisionConflict'
        if error:
          latest_job['failedPageIds'].append(str(request.pageId))
          latest_job['error'] = error
        else:
          if job['kind'] == 'proof':
            latest_job['changes'] = job['changes']
          else:
            target.update(page)
            target['revision'] = target.get('revision', 0) + 1
            self.repository._write(db, current)
        latest_job['done'].append(str(request.pageId))
        latest_job['active'] = None
        latest_job['progress'] = round(100 * len(latest_job['done']) / len(latest_job['pages']))
        if len(latest_job['done']) == len(latest_job['pages']):
          latest_job['status'] = 'failed' if latest_job['failedPageIds'] else 'completed'
        else:
          latest_job['status'] = 'paused' if latest_job['status'] == 'pausing' else 'queued'
        self.repository.write_job(db, latest_job)
        return latest_job

  async def export(self, book_id, request):
    book = self.repository.get(book_id)
    ids = [str(p) for p in request.pageIds] if request.pageIds else [p['id'] for p in book['pages']]
    if not ids or len(set(ids)) != len(ids) or any(not any(p['id'] == value for p in book['pages']) for value in ids):
      raise ValueError('invalidPageRange')
    pages = [p for p in book['pages'] if p['id'] in ids]
    if request.kind == 'json':
      result = self.public_book(book)
      result['pages'] = [p for p in result['pages'] if p['id'] in ids]
      return json.dumps({'format':'nola-comic-text', 'version':1, **result}, ensure_ascii=False, indent=2).encode(), 'application/json'
    if request.kind == 'labelplus':
      lines = ['1,0', '-', '框内', '框外', '-', '']
      for page in pages:
        lines.append(f'>>>>>>>>[{page["name"]}]<<<<<<<<')
        for number, region in enumerate(page['regions'], 1):
          x = (region['x'] + region['width']/2) / page['width']
          y = (region['y'] + region['height']/2) / page['height']
          lines.extend([f'----------------[{number}]----------------[{x:.6f},{y:.6f},1]', region.get('targetText') or '', ''])
      return '\n'.join(lines).encode('utf-8-sig'), 'text/plain; charset=utf-8'
    async def images():
      for page in pages:
        yield await self.image_bytes(book_id, page['id'], request.layer)
    if request.kind in ('png', 'jpg'):
      if len(pages) != 1:
        raise ValueError('invalidPageRange')
      raw = await self.image_bytes(book_id, pages[0]['id'], request.layer)
      if request.kind == 'png':
        return raw, 'image/png'
      output = io.BytesIO()
      with Image.open(io.BytesIO(raw)) as image:
        image.convert('RGB').save(output, 'JPEG', quality=90)
      return output.getvalue(), 'image/jpeg'
    if request.kind == 'pdf':
      # PDFium operations serialize within the writer while pages decode one at a time.
      raw_pages, size = [], 0
      for page in pages:
        raw = await self.image_bytes(book_id, page['id'], request.layer)
        size += len(raw)
        if size > 256 * 1024**2:
          raise ValueError('exportTooLarge')
        raw_pages.append(raw)
      def decoded():
        for raw in raw_pages:
          with Image.open(io.BytesIO(raw)) as image:
            yield image.convert('RGB')
      return await asyncio.to_thread(write_pdf, decoded()), 'application/pdf'
    output = io.BytesIO()
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_STORED) as archive:
      async for raw in images():
        number = len(archive.namelist()) + 1
        archive.writestr(f'{number:04}.png', raw)
        if output.tell() > 256 * 1024**2:
          raise ValueError('exportTooLarge')
    return output.getvalue(), 'application/zip'
