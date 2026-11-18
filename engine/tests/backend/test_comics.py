from __future__ import annotations

import asyncio
from copy import deepcopy
import io
import json
from pathlib import Path
from uuid import uuid4
import zipfile

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image
import pytest

from nola_translator_engine.backend.comics import ComicService, build_comic_router
from nola_translator_engine.backend.comics.formats import png_bytes, write_pdf
from nola_translator_engine.backend.comics.schemas import Attempt, Completion, Config, ExportRequest, ImportRequest, JobRequest, Mutation

FONT = Path(__file__).resolve().parents[3] / 'src/renderer/assets/fonts/NotoSansCJK-SC-VF.otf'


@pytest.fixture
def service(tmp_path):
  return ComicService(tmp_path / 'library', FONT)


def source(tmp_path, name='page.png', size=(300, 420)):
  path = tmp_path / name
  Image.new('RGB', size, '#eeeeee').save(path)
  return path


def imported(service, tmp_path):
  return service.import_book(ImportRequest(paths=[str(source(tmp_path))]))


def bubble(text='Hello', target='你好'):
  return dict(id=str(uuid4()), x=20, y=30, width=180, height=180, sourceText=text,
    targetText=target, confidence=None, locked=False, ignored=False,
    style=dict(fontSize=28, fontFamily='Noto Sans SC', color='#222222', direction='horizontal',
      align='center', autoFontSize=True), qa=[])


def save(service, book, regions, strokes=None):
  page = dict(id=book['pages'][0]['id'], regions=regions)
  if strokes is not None:
    page['maskStrokes'] = strokes
  return asyncio.run(service.document(book['id'], Mutation(operationId=uuid4(),
    expectedRevision=book['revision'], command=dict(action='savePages', pages=[page]))))


def test_import_empty_library_real_dimensions_and_reopen(service, tmp_path):
  assert service.repository.summaries() == []
  book = imported(service, tmp_path)
  assert book['pages'][0]['width'] == 300
  assert book['pages'][0]['height'] == 420
  assert book['pages'][0]['regions'] == []
  reopened = ComicService(service.repository.root, FONT)
  assert reopened.repository.get(book['id'])['pages'] == book['pages']


async def test_concurrent_rendered_previews_share_one_render(service, tmp_path, monkeypatch):
  book = imported(service, tmp_path)
  page_id = book['pages'][0]['id']
  original = service._render
  calls = 0
  async def render(*args):
    nonlocal calls
    calls += 1
    await asyncio.sleep(.01)
    return await original(*args)
  monkeypatch.setattr(service, '_render', render)
  first, second = await asyncio.gather(
    service.image_bytes(book['id'], page_id, 'rendered'),
    service.image_bytes(book['id'], page_id, 'rendered'),
  )
  assert first == second and first.startswith(b'\x89PNG')
  assert calls == 1


async def test_async_document_and_image_reads_keep_sqlite_off_the_event_loop(service, tmp_path, monkeypatch):
  import threading
  from contextlib import contextmanager
  book = imported(service, tmp_path)
  event_thread = threading.get_ident()
  original = service.repository.connection
  calls = []
  @contextmanager
  def connection():
    calls.append(threading.get_ident())
    assert calls[-1] != event_thread
    with original() as db:
      yield db
  monkeypatch.setattr(service.repository, 'connection', connection)
  await service.document(book['id'], Mutation(operationId=uuid4(), expectedRevision=book['revision'],
    command=dict(action='configure', config=book['config'])))
  await service.image_bytes(book['id'], book['pages'][0]['id'], 'source')
  assert calls


@pytest.mark.asyncio
async def test_editor_save_rerender_and_json_keep_the_automatically_matched_font(service,tmp_path,monkeypatch):
  from contextlib import asynccontextmanager
  from types import SimpleNamespace
  from nola_translator_engine.backend.comics import vision
  calls=[]
  class Classifier:
    async def classify(self,crop):
      calls.append(crop.shape)
      return [{'family':'MatchedFont-Regular','confidence':.9}]
  @asynccontextmanager
  async def resource(owner,model):
    yield Classifier()
  monkeypatch.setattr(vision,'resource',resource)
  service.ocr=SimpleNamespace(models=SimpleNamespace(is_installed=lambda spec:True))
  service.fonts.paths['Matched Font']=FONT
  book=imported(service,tmp_path)
  item=bubble()
  item['style']['autoFont']=True
  async def edit(region):
    current=service.repository.get(book['id'])
    return await service.document(book['id'],Mutation(operationId=uuid4(),expectedRevision=current['revision'],
      command=dict(action='savePages',pages=[dict(id=current['pages'][0]['id'],regions=[region])])))
  changed=await edit(item)
  actual=changed['pages'][0]['regions'][0]
  assert actual['style']['fontFamily']==actual['resolvedLayout']['fontFamily']=='Matched Font'
  assert actual['style']['autoFont'] is True
  await service.render(book['id'],book['pages'][0]['id'])
  exported,_=await service.export(book['id'],ExportRequest(kind='json'))
  assert json.loads(exported)['pages'][0]['regions'][0]['resolvedLayout']['fontFamily']=='Matched Font'
  assert len(calls)==1
  actual['style'].update(autoFont=False,fontFamily='Noto Sans SC')
  manual=await edit(actual)
  assert manual['pages'][0]['regions'][0]['resolvedLayout']['fontFamily']=='Noto Sans SC'
  assert len(calls)==1


def test_pdf_real_pages_and_range(service, tmp_path):
  path = tmp_path / 'book.pdf'
  path.write_bytes(write_pdf([Image.new('RGB', (200, 300), color) for color in ('red', 'blue', 'white')]))
  book = service.import_book(ImportRequest(paths=[str(path)], firstPage=2, lastPage=3, pdfDpi=200))
  assert len(book['pages']) == 2
  assert book['pages'][0]['width'] == 200
  image = service.image(book['pages'][0])
  assert image.getpixel((10, 10))[2] > 240


def test_archive_natural_order_and_traversal(service, tmp_path):
  path = tmp_path / 'book.cbz'
  with zipfile.ZipFile(path, 'w') as archive:
    archive.writestr('10.png', png_bytes(Image.new('RGB', (100, 100))))
    archive.writestr('2.png', png_bytes(Image.new('RGB', (100, 100))))
  book = service.import_book(ImportRequest(paths=[str(path)]))
  assert [p['name'] for p in book['pages']] == ['2.png', '10.png']
  unsafe = tmp_path / 'unsafe.zip'
  with zipfile.ZipFile(unsafe, 'w') as archive:
    archive.writestr('../2.png', png_bytes(Image.new('RGB', (100, 100))))
  with pytest.raises(ValueError, match='unsafeArchive'):
    service.import_book(ImportRequest(paths=[str(unsafe)]))


def test_duplicate_import_does_not_append(service, tmp_path):
  path = source(tmp_path)
  book = service.import_book(ImportRequest(paths=[str(path)]))
  result = service.import_book(ImportRequest(paths=[str(path)], projectId=book['id']))
  assert len(result['pages']) == 1


def test_quick_clone_all_ids_delete_restore(service, tmp_path):
  quick = service.repository.quick()
  path = source(tmp_path)
  quick = service.import_book(ImportRequest(paths=[str(path)], projectId=quick['id']))
  quick = save(service, quick, [bubble()])
  assert service.repository.summaries() == []
  saved = service.repository.save_workspace(quick['id'])
  assert saved['id'] != quick['id']
  assert saved['pages'][0]['id'] != quick['pages'][0]['id']
  assert saved['pages'][0]['regions'][0]['id'] != quick['pages'][0]['regions'][0]['id']
  assert saved['chapters'][0]['id'] != quick['chapters'][0]['id']
  service.repository.delete([saved['id']])
  assert service.repository.summaries() == []
  service.repository.delete([saved['id']], restore=True)
  assert len(service.repository.summaries()) == 1
  assert service.repository.get(quick['id'])['pages'] == quick['pages']


def test_mutation_cas_idempotency_and_undo(service, tmp_path):
  book = imported(service, tmp_path)
  request = Mutation(operationId=uuid4(), expectedRevision=book['revision'],
    command=dict(action='configure', config=book['config'] | {'rounds': 3}))
  first = service.repository.mutate(book['id'], request)
  replay = service.repository.mutate(book['id'], request)
  assert first == replay
  with pytest.raises(ValueError, match='revisionConflict'):
    service.repository.mutate(book['id'], Mutation(operationId=uuid4(), expectedRevision=book['revision'], command=request.command))
  undone = service.repository.mutate(book['id'], Mutation(operationId=uuid4(), expectedRevision=first['revision'], command={'action':'undo'}))
  assert undone['config']['rounds'] == 2
  redo = service.repository.mutate(book['id'], Mutation(operationId=uuid4(), expectedRevision=undone['revision'], command={'action':'redo'}))
  assert redo['config']['rounds'] == 3


def test_edit_geometry_validation_preserves_document(service, tmp_path):
  book = imported(service, tmp_path)
  invalid = bubble()
  invalid['x'] = 500
  with pytest.raises(ValueError, match='invalidRegion'):
    save(service, book, [invalid])
  assert service.repository.get(book['id'])['pages'][0]['regions'] == []


def test_text_render_and_separate_source(service, tmp_path):
  book = imported(service, tmp_path)
  book = save(service, book, [bubble(target='你好，世界。')])
  page = book['pages'][0]
  assert page['hasRendered']
  assert page['regions'][0]['resolvedLayout']['lines']
  assert page['renderedAsset'] != page['sourceAsset']
  assert service.image(page).getpixel((30, 30)) == (238, 238, 238)


def test_restore_brush_uses_source_pixels(service, tmp_path):
  book = imported(service, tmp_path)
  config = book['config'] | {'repairMethod':'solid'}
  config['renderSettings']['fillColor'] = '#ff0000'
  book = service.repository.mutate(book['id'], Mutation(operationId=uuid4(), expectedRevision=book['revision'], command={'action':'configure','config':config}))
  strokes = [dict(id=str(uuid4()), mode='erase', size=20, points=[[100, 100]]),
    dict(id=str(uuid4()), mode='restore', size=10, points=[[100, 100]])]
  book = save(service, book, [], strokes)
  cleaned = service.image(book['pages'][0], 'clean')
  assert cleaned.getpixel((100, 100)) == (238, 238, 238)
  assert cleaned.getpixel((108, 100)) == (255, 0, 0)


def test_task_pause_resume_results_and_stale_attempt(service, tmp_path):
  book = save(service, imported(service, tmp_path), [bubble()])
  task = service.create_job(JobRequest(projectId=book['id'], expectedRevision=book['revision'], kind='translate', pageIds=[book['pages'][0]['id']]))
  service.control(task['id'], 'pause')
  assert service.claim() is None
  service.control(task['id'], 'resume')
  claim = service.claim()
  attempt = Attempt(attemptId=claim['attemptId'], pageId=claim['pageId'])
  prepared = asyncio.run(service.prepare(task['id'], attempt))
  region = prepared['page']['regions'][0]
  result = asyncio.run(service.complete(task['id'], Completion(**attempt.model_dump(), translations=[{'id':region['id'],'text':'真实翻译'}])))
  assert result['status'] == 'completed' and result['progress'] == 100
  assert service.repository.get(book['id'])['pages'][0]['regions'][0]['targetText'] == '真实翻译'
  with pytest.raises(ValueError, match='staleAttempt'):
    asyncio.run(service.complete(task['id'], Completion(**attempt.model_dump(), translations=[])))


def test_task_conflict_and_retry_failed_only(service, tmp_path):
  book = save(service, imported(service, tmp_path), [bubble()])
  task = service.create_job(JobRequest(projectId=book['id'], expectedRevision=book['revision'], kind='translate', pageIds=[book['pages'][0]['id']]))
  claim = service.claim()
  attempt = Attempt(attemptId=claim['attemptId'], pageId=claim['pageId'])
  prepared = asyncio.run(service.prepare(task['id'], attempt))
  book = service.repository.get(book['id'])
  region = deepcopy(book['pages'][0]['regions'][0])
  region['targetText'] = 'manual'
  save(service, book, [region])
  result = asyncio.run(service.complete(task['id'], Completion(**attempt.model_dump(), translations=[{'id':region['id'],'text':'late'}])))
  assert result['status'] == 'failed'
  assert result['error'] == 'revisionConflict'
  assert service.repository.get(book['id'])['pages'][0]['regions'][0]['targetText'] == 'manual'
  retry = service.control(task['id'], 'retry')
  assert retry['pages'] == [book['pages'][0]['id']]
  assert retry['id'] != task['id']


def test_proof_candidate_and_adoption(service, tmp_path):
  book = save(service, imported(service, tmp_path), [bubble()])
  task = service.create_job(JobRequest(projectId=book['id'], expectedRevision=book['revision'], kind='proof', pageIds=[book['pages'][0]['id']]))
  claim = service.claim()
  token = Attempt(attemptId=claim['attemptId'], pageId=claim['pageId'])
  prepared = asyncio.run(service.prepare(task['id'], token))
  region = prepared['page']['regions'][0]
  result = asyncio.run(service.complete(task['id'], Completion(**token.model_dump(), translations=[{'id':region['id'],'text':'校对'}])))
  assert result['changes'][0]['to'] == '校对'
  book = service.repository.get(book['id'])
  assert book['pages'][0]['regions'][0]['targetText'] == '你好'
  book = asyncio.run(service.document(book['id'], Mutation(operationId=uuid4(), expectedRevision=book['revision'], command={'action':'applyProof','jobId':task['id']})))
  assert book['pages'][0]['regions'][0]['targetText'] == '校对'


@pytest.mark.parametrize('kind', ['png','jpg','images','cbz','pdf','json','labelplus'])
def test_all_exports_independent_readback(service, tmp_path, kind):
  book = save(service, imported(service, tmp_path), [bubble(target='原始词')])
  raw, mime = asyncio.run(service.export(book['id'], ExportRequest(kind=kind)))
  if kind in ('png','jpg'):
    with Image.open(io.BytesIO(raw)) as image:
      assert image.size == (300, 420)
  elif kind in ('images','cbz'):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
      assert archive.namelist() == ['0001.png']
  elif kind == 'pdf':
    import pypdfium2 as pdf
    with pdf.PdfDocument(raw) as document:
      assert len(document) == 1
  elif kind == 'json':
    exported = json.loads(raw)
    assert exported['pages'][0]['regions'][0]['targetText'] == '原始词'
    assert 'sourceAsset' not in exported['pages'][0]
  else:
    assert '原始词' in raw.decode('utf-8-sig')
    assert '>>>>>>>>[page.png]<<<<<<<<' in raw.decode('utf-8-sig')


def test_schema_only_router_and_http_validation(service, tmp_path):
  app = FastAPI()
  app.include_router(build_comic_router(service), prefix='/api/v2')
  client = TestClient(app)
  assert client.get('/api/v2/comics/books').json() == {'success':True,'data':[]}
  response = client.post('/api/v2/comics/books/import', json={'paths':[str(source(tmp_path))]})
  assert response.status_code == 200
  assert response.json()['data']['pages'][0]['width'] == 300
  assert client.post('/api/v2/comics/books/import', json={'paths':[]}).status_code == 422
  schema_app = FastAPI()
  schema_app.include_router(build_comic_router(None), prefix='/api/v2')
  assert '/api/v2/comics/jobs/{job_id}/complete' in schema_app.openapi()['paths']

def test_render_failure_keeps_document_and_operation_retry(service, tmp_path, monkeypatch):
  book = imported(service, tmp_path)
  region = bubble()
  region['style']['fontFamily'] = 'Missing Font'
  request = Mutation(operationId=uuid4(), expectedRevision=book['revision'], command={'action':'savePages','pages':[{'id':book['pages'][0]['id'],'regions':[region]}]})
  with pytest.raises(ValueError, match='fontMissing'):
    asyncio.run(service.document(book['id'], request))
  assert service.repository.get(book['id'])['revision'] == book['revision']
  assert service.repository.get(book['id'])['pages'][0]['regions'] == []
  assert not service.repository.is_replay(book['id'], request)
  monkeypatch.setitem(service.fonts.paths, 'Missing Font', FONT)
  saved = asyncio.run(service.document(book['id'], request))
  assert saved['pages'][0]['hasRendered']
  replay = asyncio.run(service.document(book['id'], request))
  assert replay == saved


@pytest.mark.asyncio
async def test_numeric_retranslation_skips_models_and_restores_previously_erased_original(service,tmp_path):
  import numpy as np
  from PIL import ImageDraw
  from nola_translator_engine.backend.comics.layout import Fonts
  path=tmp_path/'number.png'
  original=Image.new('RGB',(300,420),'white')
  ImageDraw.Draw(original).text((70,80),'1',font=Fonts(FONT).load(None,64),fill='black')
  original.save(path)
  book=service.import_book(ImportRequest(paths=[str(path)]))
  item=bubble(text='1',target='喂')
  book=await service.document(book['id'],Mutation(operationId=uuid4(),expectedRevision=book['revision'],
    command=dict(action='savePages',pages=[dict(id=book['pages'][0]['id'],regions=[item])])))
  with service.repository.connection() as db:
    current=service.repository._book(db,book['id'])
    current['pages'][0].update(cleanAsset=service.repository.asset(png_bytes(Image.new('RGB',original.size,'white'))),hasClean=True)
    service.repository._write(db,current)
  book=service.repository.get(book['id'])
  task=service.create_job(JobRequest(projectId=book['id'],expectedRevision=book['revision'],kind='translate',pageIds=[book['pages'][0]['id']]))
  claim=service.claim()
  token=dict(attemptId=claim['attemptId'],pageId=claim['pageId'])
  prepared=await service.prepare(task['id'],Attempt(**token))
  assert prepared['page']['regions'][0]['ignored'] is True
  completed=await service.complete(task['id'],Completion(**token,translations=[]))
  assert completed['status']=='completed'
  page=service.repository.get(book['id'])['pages'][0]
  assert np.array_equal(np.asarray(service.image(page,'rendered')),np.asarray(original))
  raw,_=await service.export(book['id'],ExportRequest(kind='png'))
  assert np.array_equal(np.asarray(Image.open(io.BytesIO(raw))),np.asarray(original))


@pytest.mark.asyncio
async def test_same_language_normal_job_skips_detection_and_ocr_entirely(service,tmp_path):
  book=imported(service,tmp_path)
  config=deepcopy(book['config'])
  config.update(sourceLanguage='ja',targetLanguage='ja')
  book=service.repository.mutate(book['id'],Mutation(operationId=uuid4(),expectedRevision=book['revision'],
    command=dict(action='configure',config=config)))
  task=service.create_job(JobRequest(projectId=book['id'],expectedRevision=book['revision'],kind='normal',pageIds=[book['pages'][0]['id']]))
  claim=service.claim()
  token=dict(attemptId=claim['attemptId'],pageId=claim['pageId'])
  prepared=await service.prepare(task['id'],Attempt(**token))
  assert prepared['page']['regions']==[]
  completed=await service.complete(task['id'],Completion(**token,translations=[]))
  assert completed['status']=='completed'


@pytest.mark.asyncio
@pytest.mark.parametrize('translation',['佐藤秀峰',' 佐藤 秀峰 ','','123','…'])
async def test_unchanged_or_empty_translation_is_preserved_before_repair(service,tmp_path,translation):
  import numpy as np
  book=imported(service,tmp_path)
  item=bubble(text='佐藤秀峰',target=None)
  book=await service.document(book['id'],Mutation(operationId=uuid4(),expectedRevision=book['revision'],
    command=dict(action='savePages',pages=[dict(id=book['pages'][0]['id'],regions=[item])])))
  task=service.create_job(JobRequest(projectId=book['id'],expectedRevision=book['revision'],kind='normal',pageIds=[book['pages'][0]['id']]))
  claim=service.claim()
  token=dict(attemptId=claim['attemptId'],pageId=claim['pageId'])
  await service.prepare(task['id'],Attempt(**token))
  completed=await service.complete(task['id'],Completion(**token,translations=[dict(id=item['id'],text=translation)]))
  assert completed['status']=='completed'
  page=service.repository.get(book['id'])['pages'][0]
  assert page['regions'][0]['ignored'] is True
  assert page['regions'][0]['targetText']==translation
  assert np.array_equal(np.asarray(service.image(page,'rendered')),np.asarray(service.image(page)))


def test_asset_write_failure_keeps_revision(service, tmp_path, monkeypatch):
  book = imported(service, tmp_path)
  def fail(data):
    raise OSError('disk full')
  monkeypatch.setattr(service.repository, 'asset', fail)
  with pytest.raises(OSError, match='disk full'):
    save(service, book, [bubble()])
  assert service.repository.get(book['id']) == book


def test_brush_order_and_locality(service, tmp_path):
  book = imported(service, tmp_path)
  config = deepcopy(book['config'])
  config['repairMethod'] = 'solid'
  config['renderSettings']['fillColor'] = '#ff0000'
  book = service.repository.mutate(book['id'], Mutation(operationId=uuid4(), expectedRevision=book['revision'], command={'action':'configure','config':config}))
  book = save(service, book, [bubble()])
  strokes = [dict(id=str(uuid4()), mode='restore', size=20, points=[[100,100]]),
    dict(id=str(uuid4()), mode='erase', size=10, points=[[100,100]])]
  book = save(service, book, book['pages'][0]['regions'], strokes)
  clean = service.image(book['pages'][0], 'clean')
  assert clean.getpixel((100,100)) == (255,0,0)
  assert clean.getpixel((30,30)) == (238,238,238)


def test_prepare_limits_visual_image_and_tracks_page_revision(service, tmp_path):
  path = source(tmp_path, size=(2200, 2200))
  book = service.import_book(ImportRequest(paths=[str(path)]))
  book = save(service, book, [bubble()])
  revision = book['pages'][0]['revision']
  job = service.create_job(JobRequest(projectId=book['id'], expectedRevision=book['revision'], kind='translate', pageIds=[book['pages'][0]['id']]))
  claim = service.claim()
  prepared = asyncio.run(service.prepare(job['id'], Attempt(attemptId=claim['attemptId'], pageId=claim['pageId'])))
  import base64
  with Image.open(io.BytesIO(base64.b64decode(prepared['sourceImage']))) as image:
    assert image.width * image.height <= 2_000_000
  assert prepared['page']['revision'] > revision
  assert service.image(service.repository.get(book['id'])['pages'][0]).size == (2200,2200)


def test_installed_resource_selection_uses_catalog_variants():
  from types import SimpleNamespace
  from nola_translator_engine.backend.comics.vision import ppocr_model, inpaint_model
  available = {'pp-ocrv5-mobile-ch-onnx','lama-manga'}
  owner = SimpleNamespace(models=SimpleNamespace(is_installed=lambda spec: spec.model_id in available))
  assert ppocr_model(owner, 'ja') == 'pp-ocrv5-mobile-ch-onnx'
  assert inpaint_model(owner) == 'lama-manga'
  with pytest.raises(ValueError, match='ocrUnavailable'):
    ppocr_model(owner, 'ko')

def test_epub_spine_order_and_multiframe(service, tmp_path):
  path = tmp_path / 'book.epub'
  with zipfile.ZipFile(path,'w') as archive:
    archive.writestr('META-INF/container.xml','<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>')
    archive.writestr('OPS/book.opf','<package xmlns="http://www.idpf.org/2007/opf"><manifest><item id="a" href="a.xhtml" media-type="application/xhtml+xml"/><item id="b" href="b.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>')
    for name,color in [('a','red'),('b','blue')]:
      archive.writestr(f'OPS/{name}.xhtml',f'<html><body><img src="{name}.png"/></body></html>')
      archive.writestr(f'OPS/{name}.png',png_bytes(Image.new('RGB',(100,120),color)))
  book=service.import_book(ImportRequest(paths=[str(path)]))
  assert [p['name'] for p in book['pages']] == ['b.png','a.png']
  gif=tmp_path/'animated.gif'
  Image.new('RGB',(50,60),'red').save(gif,save_all=True,append_images=[Image.new('RGB',(50,60),'blue')])
  all_frames=service.import_book(ImportRequest(paths=[str(gif)]))
  first=service.import_book(ImportRequest(paths=[str(gif)],firstFrame=True))
  assert len(all_frames['pages']) == 2
  assert len(first['pages']) == 1


def test_kindle_image_records_and_drm(service,tmp_path):
  header=bytearray(120)
  header[16:20]=b'MOBI'
  header[108:112]=(1).to_bytes(4,'big')
  image=png_bytes(Image.new('RGB',(90,110),'red'))
  palm=bytearray(94)
  palm[60:68]=b'BOOKMOBI'
  palm[76:78]=(2).to_bytes(2,'big')
  palm[78:82]=(94).to_bytes(4,'big')
  palm[86:90]=(214).to_bytes(4,'big')
  path=tmp_path/'book.azw3'
  path.write_bytes(palm+header+image)
  book=service.import_book(ImportRequest(paths=[str(path)]))
  assert book['pages'][0]['width'] == 90
  header[12:14]=b'\0\x02'
  path.write_bytes(palm+header+image)
  with pytest.raises(ValueError,match='encryptedBook'):
    service.import_book(ImportRequest(paths=[str(path)]))


def test_schema_rejects_invalid_rules_points_and_color():
  from pydantic import ValidationError
  from nola_translator_engine.backend.comics.schemas import Region, Stroke
  with pytest.raises(ValidationError):
    Config(glossary={'mode':'auto','libraryIds':[]})
  invalid=bubble()
  invalid['sourceQuad']=[[0,0],[1,0],[1,1]]
  with pytest.raises(ValidationError):
    Region(**invalid)
  with pytest.raises(ValidationError):
    Stroke(id=uuid4(),mode='erase',size=10,points=[[-1,10]])
  invalid=bubble()
  invalid['style']['color']='invalid'
  with pytest.raises(ValidationError):
    Region(**invalid)


def test_reopen_interrupts_claim_and_snapshot_stays_fixed(service,tmp_path):
  book=save(service,imported(service,tmp_path),[bubble()])
  rules={'revision':4,'libraries':[]}
  task=service.create_job(JobRequest(projectId=book['id'],expectedRevision=book['revision'],kind='translate',pageIds=[book['pages'][0]['id']],wordRulesDocument=rules))
  service.claim()
  reopened=ComicService(service.repository.root,FONT)
  failed=reopened.repository.job(task['id'])
  assert failed['status']=='failed'
  assert failed['wordRulesDocument']==rules
  assert failed['failedPageIds']==[book['pages'][0]['id']]

def test_brush_undo_reuses_assets_without_inference(service,tmp_path,monkeypatch):
  book=imported(service,tmp_path)
  strokes=[dict(id=str(uuid4()),mode='erase',size=20,points=[[100,100]])]
  book=save(service,book,[],strokes)
  asset=book['pages'][0]['cleanAsset']
  async def forbidden(*args,**kwargs):
    raise AssertionError('undo must reuse assets')
  from nola_translator_engine.backend.comics import vision
  monkeypatch.setattr(vision,'repair',forbidden)
  undone=asyncio.run(service.document(book['id'],Mutation(operationId=uuid4(),expectedRevision=book['revision'],command={'action':'undo'})))
  assert not undone['pages'][0]['hasClean']
  redone=asyncio.run(service.document(book['id'],Mutation(operationId=uuid4(),expectedRevision=undone['revision'],command={'action':'redo'})))
  assert redone['pages'][0]['cleanAsset']==asset


def test_history_stores_only_changed_page(service,tmp_path):
  paths=[source(tmp_path,f'{i}.png') for i in range(4)]
  book=service.import_book(ImportRequest(paths=[str(p) for p in paths]))
  book=save(service,book,[bubble()])
  with service.repository.connection() as db:
    edit=db.execute('SELECT before_body,after_body FROM edits').fetchone()
    assert len(json.loads(edit['before_body'])['pages'])==1
    assert len(json.loads(edit['after_body'])['pages'])==1


def test_200_page_read_and_thousand_book_summaries(service,tmp_path):
  from time import perf_counter
  from nola_translator_engine.backend.comics.repository import identity
  archive_path=tmp_path/'long.cbz'
  raw=png_bytes(Image.new('RGB',(80,120),'white'))
  with zipfile.ZipFile(archive_path,'w') as archive:
    for index in range(200):
      archive.writestr(f'{index+1:04}.png',raw)
  start=perf_counter()
  book=service.import_book(ImportRequest(paths=[str(archive_path)]))
  assert len(book['pages'])==200
  for page in book['pages'][::19]:
    image=asyncio.run(service.image_bytes(book['id'],page['id'],'source',10000))
    with Image.open(io.BytesIO(image)) as decoded:
      assert decoded.width * decoded.height <= 10000
  with service.repository.connection() as db:
    for index in range(999):
      entry=service.repository.new_book(f'Book {index}')
      page=deepcopy(book['pages'][0])
      page.update(id=identity(),chapterId=entry['chapters'][0]['id'])
      entry['pages']=[page]
      service.repository._write(db,entry)
  summaries=service.repository.summaries()
  assert len(summaries)==1000
  assert all('pages' not in item for item in summaries)
  assert perf_counter()-start < 30

def test_automatic_foreground_color_handles_dark_bubbles():
  from PIL import ImageDraw
  from nola_translator_engine.backend.comics.vision import text_color
  image=Image.new('RGB',(100,100),'black')
  ImageDraw.Draw(image).rectangle((30,30,45,70),fill='white')
  assert text_color(image,dict(x=0,y=0,width=100,height=100))=='#ffffff'

def test_model_config_signature_persists_through_prepare_and_retry(service,tmp_path):
  book=save(service,imported(service,tmp_path),[bubble()])
  task=service.create_job(JobRequest(projectId=book['id'],expectedRevision=book['revision'],kind='translate',pageIds=[book['pages'][0]['id']],modelConfigSignature='a'*64))
  claim=service.claim()
  token=Attempt(attemptId=claim['attemptId'],pageId=claim['pageId'])
  prepared=asyncio.run(service.prepare(task['id'],token))
  assert prepared['modelConfigSignature']=='a'*64
  asyncio.run(service.complete(task['id'],Completion(**token.model_dump(),error='modelConfigurationChanged')))
  retry=service.control(task['id'],'retry')
  assert retry['modelConfigSignature']=='a'*64

def test_corrupted_pdf_reports_structured_error(service,tmp_path):
  path=tmp_path/'broken.pdf'
  path.write_bytes(b'%PDF-1.7\ninvalid')
  app=FastAPI()
  app.include_router(build_comic_router(service),prefix='/api/v2')
  response=TestClient(app).post('/api/v2/comics/books/import',json={'paths':[str(path)]})
  assert response.status_code==422
  assert response.json()['detail']=='invalidDocument'

def test_missing_glyph_is_reported_in_layout(service,tmp_path):
  book=save(service,imported(service,tmp_path),[bubble(target='\U0010ffff')])
  assert 'missingGlyph' in book['pages'][0]['regions'][0]['qa']

def test_visual_region_images_use_source_quad_and_pixel_budget(service,tmp_path):
  import base64
  from PIL import ImageDraw
  path=tmp_path/'colored.png'
  image=Image.new('RGB',(1800,1800),'blue')
  ImageDraw.Draw(image).rectangle((0,0,1799,899),fill='red')
  image.save(path)
  book=service.import_book(ImportRequest(paths=[str(path)]))
  first=bubble()
  first.update(x=10,y=1100,width=100,height=100,sourceQuad=[[0,0],[1800,0],[1800,900],[0,900]])
  second=bubble()
  second.update(x=10,y=30,width=100,height=100,sourceQuad=[[200,1100],[600,1100],[600,1400],[200,1400]])
  first['manuallyEdited'] = second['manuallyEdited'] = True
  book=save(service,book,[first,second])
  job=service.create_job(JobRequest(projectId=book['id'],expectedRevision=book['revision'],kind='visual',pageIds=[book['pages'][0]['id']]))
  claim=service.claim()
  prepared=asyncio.run(service.prepare(job['id'],Attempt(attemptId=claim['attemptId'],pageId=claim['pageId'])))
  assert set(prepared['regionImages'])=={first['id'],second['id']}
  with Image.open(io.BytesIO(base64.b64decode(prepared['regionImages'][first['id']]))) as crop:
    assert crop.width * crop.height <= 512_000
    assert crop.getpixel((0,0))==(255,0,0)
    assert abs(crop.width/crop.height-2)<.01
  with Image.open(io.BytesIO(base64.b64decode(prepared['regionImages'][second['id']]))) as crop:
    assert crop.size==(400,300)
    assert crop.getpixel((0,0))==(0,0,255)
  assert service.image(service.repository.get(book['id'])['pages'][0]).size==(1800,1800)

def test_shared_resource_lock_wait_is_bounded_and_not_released_by_waiter(monkeypatch):
  from types import SimpleNamespace
  from nola_translator_engine.backend.comics import vision
  async def run():
    lease=asyncio.Lock()
    await lease.acquire()
    owner=SimpleNamespace(variant=lambda resource_id: SimpleNamespace(lease=lease,_loaded=True))
    monkeypatch.setattr(vision,'RESOURCE_WAIT_SECONDS',.01)
    with pytest.raises(ValueError,match='resourceBusy'):
      async with vision.resource(owner,'shared'):
        pytest.fail('shared lock must remain owned')
    assert lease.locked()
    lease.release()
  asyncio.run(run())


def test_cancel_and_shutdown_interrupt_shared_resource_wait(service,tmp_path):
  from types import SimpleNamespace
  async def run(mode):
    lease=asyncio.Lock()
    await lease.acquire()
    owner=SimpleNamespace(variant=lambda resource_id: SimpleNamespace(lease=lease,_loaded=True))
    service.ocr=owner
    book=imported(service,tmp_path)
    config=deepcopy(book['config'])
    config['detector']='rtdetr'
    book=service.repository.mutate(book['id'],Mutation(operationId=uuid4(),expectedRevision=book['revision'],command={'action':'configure','config':config}))
    job=service.create_job(JobRequest(projectId=book['id'],expectedRevision=book['revision'],kind='detect',pageIds=[book['pages'][0]['id']]))
    claim=service.claim()
    token=Attempt(attemptId=claim['attemptId'],pageId=claim['pageId'])
    task=asyncio.create_task(service.prepare(job['id'],token))
    while job['id'] not in service.stage_tasks:
      await asyncio.sleep(0)
    if mode=='cancel':
      service.control(job['id'],'cancel')
    elif mode=='error':
      completed=await asyncio.wait_for(service.complete(job['id'],Completion(**token.model_dump(),error='cancelled')),1)
      assert completed['status']=='failed'
    else:
      await asyncio.wait_for(service.close(),1)
    with pytest.raises(ValueError,match='cancelled'):
      await asyncio.wait_for(task,1)
    assert lease.locked()
    assert not service.stage_lock.locked()
    assert not service.stage_tasks
    assert service.repository.job(job['id'])['status']==('cancelled' if mode=='cancel' else 'failed')
    lease.release()
  for mode in ('cancel','error','close'):
    asyncio.run(run(mode))

def test_restart_keeps_previous_and_interrupted_failures(service,tmp_path):
  paths=[source(tmp_path,f'{i}.png') for i in range(2)]
  book=service.import_book(ImportRequest(paths=[str(p) for p in paths]))
  job=service.create_job(JobRequest(projectId=book['id'],expectedRevision=book['revision'],kind='detect',pageIds=[p['id'] for p in book['pages']]))
  first=service.claim()
  asyncio.run(service.complete(job['id'],Completion(attemptId=first['attemptId'],pageId=first['pageId'],error='firstFailure')))
  second=service.claim()
  assert second['pageId'] != first['pageId']
  reopened=ComicService(service.repository.root,FONT)
  failed=reopened.repository.job(job['id'])
  assert set(failed['failedPageIds'])=={p['id'] for p in book['pages']}
  retry=reopened.control(job['id'],'retry')
  assert set(retry['pages'])==set(failed['failedPageIds'])


def test_deleted_book_cannot_block_other_book_queue(service,tmp_path):
  first=imported(service,tmp_path)
  second=imported(service,tmp_path)
  jobs=[service.create_job(JobRequest(projectId=book['id'],expectedRevision=book['revision'],kind='detect',pageIds=[book['pages'][0]['id']])) for book in (first,second)]
  service.delete_books([first['id']])
  assert service.repository.job(jobs[0]['id'])['status']=='cancelled'
  assert service.claim()['jobId']==jobs[1]['id']
  service.delete_books([first['id']],restore=True)
  assert service.repository.get(first['id'])['id']==first['id']
