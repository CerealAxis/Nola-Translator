"""Private HTTP boundary for comic documents and page tasks."""
from __future__ import annotations

import asyncio
from pathlib import Path
from uuid import UUID
import xml.etree.ElementTree as ET
import zipfile

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from .schemas import Attempt, Completion, Control, ExportRequest, Ids, ImportRequest, JobRequest, Mutation
from .service import ComicService


def build_comic_router(service: ComicService | None):
  router = APIRouter(prefix='/comics', tags=['comics'])

  def active():
    if service is None:
      raise HTTPException(503, detail='comicUnavailable')
    return service

  async def invoke(callback):
    try:
      result = await asyncio.to_thread(callback)
      if hasattr(result, '__await__'):
        result = await result
      return {'success': True, 'data': result}
    except (ValueError, KeyError, OSError, ET.ParseError, zipfile.BadZipFile) as error:
      code = str(error) if isinstance(error, ValueError) else 'invalidDocument'
      raise HTTPException(409 if code in ('revisionConflict', 'staleAttempt', 'invalidJobState') else 422, detail=code) from error

  @router.get('/books')
  async def books():
    return await invoke(lambda: active().repository.summaries())

  @router.post('/workspaces/quick')
  async def quick():
    return await invoke(lambda: active().public_book(active().repository.quick()))

  @router.post('/books/import')
  async def import_book(body: ImportRequest):
    async def perform():
      value = await asyncio.to_thread(active().import_book, body)
      return active().public_book(value)
    return await invoke(perform)

  @router.post('/books/delete')
  async def delete(body: Ids):
    return await invoke(lambda: active().delete_books(body.projectIds))

  @router.post('/books/restore')
  async def restore(body: Ids):
    return await invoke(lambda: active().delete_books(body.projectIds, restore=True))

  @router.get('/books/{book_id}')
  async def book(book_id: UUID):
    return await invoke(lambda: active().public_book(active().repository.get(book_id)))

  @router.post('/books/{book_id}/save')
  async def save(book_id: UUID):
    return await invoke(lambda: active().public_book(active().repository.save_workspace(book_id)))

  @router.post('/books/{book_id}/document')
  async def document(book_id: UUID, body: Mutation):
    async def perform():
      return active().public_book(await active().document(book_id, body))
    return await invoke(perform)

  @router.get('/books/{book_id}/pages/{page_id}/{kind}')
  async def image(book_id: UUID, page_id: UUID, kind: str,
    max_pixels: int | None = Query(default=None, ge=1000, le=40_000_000)):
    if kind not in ('source', 'clean', 'rendered'):
      raise HTTPException(422, detail='invalidImageKind')
    result = await invoke(lambda: active().image_bytes(book_id, page_id, kind, max_pixels))
    return Response(result['data'], media_type='image/png')

  @router.post('/books/{book_id}/export')
  async def export(book_id: UUID, body: ExportRequest):
    result = await invoke(lambda: active().export(book_id, body))
    data, mime = result['data']
    return Response(data, media_type=mime)

  @router.get('/fonts')
  async def fonts():
    return await invoke(lambda: active().fonts.list())

  @router.get('/fonts/file')
  async def font_file(family: str = Query(min_length=1, max_length=200)):
    result = await invoke(lambda: active().fonts.path(family).read_bytes())
    return Response(result['data'], media_type='font/otf')

  @router.post('/jobs')
  async def create_job(body: JobRequest):
    return await invoke(lambda: active().public_job(active().create_job(body)))

  @router.get('/jobs')
  async def jobs():
    return await invoke(lambda: [active().public_job(job) for job in active().repository.jobs()])

  @router.post('/jobs/claim')
  async def claim():
    return await invoke(lambda: active().claim())

  @router.post('/jobs/interrupt')
  async def interrupt():
    return await invoke(lambda: active().interrupt())

  @router.post('/jobs/{job_id}/prepare')
  async def prepare(job_id: UUID, body: Attempt):
    return await invoke(lambda: active().prepare(job_id, body))

  @router.post('/jobs/{job_id}/complete')
  async def complete(job_id: UUID, body: Completion):
    return await invoke(lambda: active().complete(job_id, body))

  @router.post('/jobs/{job_id}/control')
  async def control(job_id: UUID, body: Control):
    return await invoke(lambda: active().public_job(active().control(job_id, body.action)))

  return router
