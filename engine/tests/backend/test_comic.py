from pathlib import Path
from uuid import uuid4
import asyncio
import json
import zipfile

import cv2
import numpy as np
import pytest

from nola_translator_engine.backend.comic import ComicRepository, ComicService, RunRequest, encode_image, decode_image, repair_page, render_page, detect_comic_regions
from nola_translator_engine.backend.glossary import GlossaryTerm, active_glossary
from nola_translator_engine.backend.glossary import resolve_comic_terms
from nola_translator_engine.local_call import translate_with_glossary
from nola_translator_engine.translation.base import ProviderTranslation


FONT = Path(__file__).parents[3] / 'src/renderer/assets/fonts/NotoSansCJK-SC-VF.otf'


def test_glossary_shared_multilingual_fixtures():
    fixtures = json.loads((Path(__file__).parents[3] / 'tests/fixtures/glossary-matching.json').read_text(encoding='utf-8'))
    for fixture in fixtures:
        document = {'enabled': True, 'libraries': [{'id': str(uuid4()), 'enabled': True, 'scope': {'mode': 'global'},
            'entries': [{'id': str(uuid4()), 'source': source, 'target': target, 'caseSensitive': sensitive, 'enabled': True, 'targetLanguage': '*'} for source, target, sensitive in fixture['entries']]}]}
        terms = resolve_comic_terms(document, {'mode': 'auto'}, str(uuid4()), fixture['text'], 'zh')
        assert sorted([[term.source, term.target] for term in terms]) == sorted(fixture['expected'])


def source(tmp_path):
    image = np.full((180, 360, 3), 255, np.uint8)
    cv2.putText(image, 'Hello', (65, 90), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    path = tmp_path / 'page.png'
    path.write_bytes(encode_image(image))
    return path, image


def test_delete_project_preserves_shared_assets_and_rejects_running_jobs(tmp_path):
    image, _ = source(tmp_path)
    repo = ComicRepository(tmp_path / 'comics')
    first = repo.import_sources([str(image)], 'First')
    second = repo.import_sources([str(image)], 'Second')
    first = repo.edit({'projectId': first['id'], 'operationId': str(uuid4()), 'expectedRevision': first['revision'],
                       'command': {'action': 'rename', 'title': 'Edited'}})
    job = {'id': str(uuid4()), 'state': 'running', 'stage': 'detect'}
    repo.save_job(first['id'], job)
    with pytest.raises(ValueError, match='jobRunning'):
        repo.delete(first['id'])
    job['state'] = 'completed'
    repo.save_job(first['id'], job)
    repo.delete(first['id'])
    assert [book['id'] for book in repo.list()] == [second['id']]
    assert repo.asset_path(second['id'], second['pages'][0]['id'], 'source').is_file()
    with pytest.raises(ValueError, match='projectNotFound'):
        repo.open(first['id'])
    repo = ComicRepository(tmp_path / 'comics')
    repo.restore(first['id'])
    assert repo.open(first['id'])['pages'][0]['id'] == first['pages'][0]['id']
    assert repo.open(first['id'])['jobs'][0]['state'] == 'completed'
    assert repo.open(first['id'])['canUndo']


def test_batch_delete_and_restore_are_atomic(tmp_path):
    image, _ = source(tmp_path)
    repo = ComicRepository(tmp_path / 'comics')
    first = repo.import_sources([str(image)], 'First')
    second = repo.import_sources([str(image)], 'Second')
    ids = [first['id'], second['id']]
    job = {'id': str(uuid4()), 'state': 'running', 'stage': 'detect'}
    repo.save_job(second['id'], job)
    with pytest.raises(ValueError, match='jobRunning'):
        repo.delete_many(ids)
    assert len(repo.list()) == 2
    job['state'] = 'completed'
    repo.save_job(second['id'], job)
    repo.delete_many(ids)
    assert repo.list() == []
    with pytest.raises(ValueError, match='projectNotFound'):
        repo.restore_many([first['id'], str(uuid4())])
    assert repo.list() == []
    repo.restore_many(ids)
    assert {item['id'] for item in repo.list()} == set(ids)


def test_batch_delete_and_restore_routes(tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from nola_translator_engine.backend.comic import build_comic_router
    image, _ = source(tmp_path)
    service = ComicService(tmp_path / 'comics', None, FONT)
    ids = [service.repository.import_sources([str(image)], title)['id'] for title in ('First', 'Second')]
    app = FastAPI()
    app.include_router(build_comic_router(service))
    with TestClient(app) as client:
        assert client.post('/comics/projects/batch/delete', json={'projectIds': [ids[0], ids[0]]}).status_code == 400
        assert client.post('/comics/projects/batch/delete', json={'projectIds': ids}).status_code == 200
        assert service.repository.list() == []
        assert client.post('/comics/projects/batch/restore', json={'projectIds': ids}).status_code == 200
        assert {item['id'] for item in service.repository.list()} == set(ids)


def region(text='你好'):
    return {'id': str(uuid4()), 'x': 45, 'y': 40, 'width': 200, 'height': 70, 'sourceText': 'Hello', 'targetText': text,
            'confidence': None, 'ignored': False, 'locked': True, 'qa': [],
            'style': {'fontSize': 24, 'color': '#000000', 'direction': 'horizontal', 'align': 'center'}}


def test_project_edits_restart_undo_export_import_and_revision_conflict(tmp_path):
    image, _ = source(tmp_path)
    repository = ComicRepository(tmp_path / 'comics')
    project = repository.import_sources([str(image)], 'Book')
    mutation = {'projectId': project['id'], 'operationId': str(uuid4()), 'expectedRevision': project['revision'],
                'command': {'action': 'saveRegion', 'pageId': project['pages'][0]['id'], 'region': region()}}
    changed = repository.edit(mutation)
    assert changed['pages'][0]['regions'][0]['locked']
    assert repository.edit(mutation)['revision'] == changed['revision']
    with pytest.raises(ValueError, match='conflict'):
        repository.edit({**mutation, 'operationId': str(uuid4())})
    reopened = ComicRepository(tmp_path / 'comics')
    assert reopened.open(project['id'])['pages'][0]['regions'][0]['targetText'] == '你好'
    undo_request = {**mutation, 'operationId': str(uuid4()), 'expectedRevision': changed['revision'], 'command': {'action': 'undo'}}
    undo = reopened.edit(undo_request)
    assert reopened.edit(undo_request)['revision'] == undo['revision']
    assert not undo['pages'][0]['regions']
    redo = reopened.edit({**mutation, 'operationId': str(uuid4()), 'expectedRevision': undo['revision'], 'command': {'action': 'redo'}})
    assert redo['pages'][0]['regions'][0]['targetText'] == '你好'
    exported = reopened.export(project['id'], 'project', None)
    with zipfile.ZipFile(exported) as archive:
        original = project['pages'][0]['originalAsset']
        assert archive.read(f'originals/{original}.original') == image.read_bytes()
    copied = tmp_path / 'book.nola-comic'
    copied.write_bytes(exported.read_bytes())
    imported = reopened.import_sources([str(copied)], 'ignored')
    assert imported['id'] != project['id']
    assert imported['pages'][0]['id'] != project['pages'][0]['id']
    assert imported['pages'][0]['regions'][0]['targetText'] == '你好'
    assert imported['pages'][0]['regions'][0]['locked']
    assert (reopened.root / 'assets' / f"{imported['pages'][0]['originalAsset']}.original").read_bytes() == image.read_bytes()
    appended = reopened.import_sources([str(image)], 'Next', project['id'])
    assert not appended['canUndo'] and len(appended['pages']) == 2
    assert reopened.edit(undo_request)['revision'] == appended['revision']


def test_bad_import_and_geometry_do_not_modify_saved_project(tmp_path):
    image, _ = source(tmp_path)
    repository = ComicRepository(tmp_path / 'comics')
    project = repository.import_sources([str(image)], 'Book')
    bad = tmp_path / 'bad.png'; bad.write_bytes(b'not an image')
    with pytest.raises(Exception):
        repository.import_sources([str(bad)], 'Bad', project['id'])
    assert repository.open(project['id'])['revision'] == project['revision']
    with pytest.raises(ValueError, match='invalidGeometry'):
        repository.edit({'projectId': project['id'], 'operationId': str(uuid4()), 'expectedRevision': project['revision'],
                         'command': {'action': 'saveRegion', 'pageId': project['pages'][0]['id'], 'region': {**region(), 'width': 1000}}})
    assert repository.open(project['id'])['revision'] == project['revision']


def test_real_glyph_mask_inpainting_and_cjk_horizontal_vertical_render(tmp_path):
    _, image = source(tmp_path)
    bubble = region()
    cleaned, mask = repair_page(image, [bubble])
    assert 0 < np.count_nonzero(mask) < bubble['width'] * bubble['height'] * 0.4
    assert np.array_equal(cleaned[mask == 0], image[mask == 0])
    assert np.mean(cleaned[mask != 0]) > np.mean(image[mask != 0])
    horizontal = render_page(cleaned, [bubble], FONT)
    assert not np.array_equal(horizontal, cleaned)
    bubble['style']['direction'] = 'vertical-rl'
    vertical = render_page(cleaned, [bubble], FONT)
    assert not np.array_equal(vertical, horizontal)


def test_manual_mask_erase_restore_persists_undo_and_repairs_actual_pixels(tmp_path):
    image_path, image = source(tmp_path)
    repository = ComicRepository(tmp_path / 'comics')
    project = repository.import_sources([str(image_path)], 'Book')
    page_id = project['pages'][0]['id']
    erase = {'id': str(uuid4()), 'mode': 'erase', 'size': 16, 'points': [[70, 80], [140, 80]]}
    restore = {'id': str(uuid4()), 'mode': 'restore', 'size': 20, 'points': [[105, 80]]}
    def paint(stroke):
        nonlocal project
        project = repository.edit({'projectId': project['id'], 'operationId': str(uuid4()), 'expectedRevision': project['revision'],
                                   'command': {'action': 'paintMask', 'pageId': page_id, 'stroke': stroke}})
    paint(erase); paint(restore)
    page = project['pages'][0]
    cleaned, mask = repair_page(image, [], page['maskStrokes'])
    assert mask[80, 70] == 255 and mask[80, 105] == 0
    assert not np.array_equal(cleaned, image)
    assert np.array_equal(cleaned[mask == 0], image[mask == 0])
    saved = ComicRepository(repository.root).open(project['id'])
    assert saved['pages'][0]['maskStrokes'] == [erase, restore]
    exported = tmp_path / 'painted.nola-comic'
    exported.write_bytes(repository.export(project['id'], 'project', None).read_bytes())
    assert repository.import_sources([str(exported)], 'Ignored')['pages'][0]['maskStrokes'] == [erase, restore]
    undone = repository.edit({'projectId': project['id'], 'operationId': str(uuid4()), 'expectedRevision': project['revision'], 'command': {'action': 'undo'}})
    assert undone['pages'][0]['maskStrokes'] == [erase]
    project = undone
    with pytest.raises(ValueError, match='invalidGeometry'):
        paint({**erase, 'id': str(uuid4()), 'points': [[360, 0]]})


def test_vertical_layout_respects_line_breaks_and_rejects_too_short_regions():
    image = np.full((180, 360, 3), 255, np.uint8)
    bubble = region('你\n\n好')
    bubble['style']['direction'] = 'vertical-rl'
    rendered = render_page(image, [bubble], FONT)
    changed = np.any(rendered != image, axis=2)
    columns = np.flatnonzero(np.any(changed, axis=0))
    # Explicit blank lines reserve an empty column between the two glyphs.
    groups = np.split(columns, np.flatnonzero(np.diff(columns) > 1) + 1)
    assert len(groups) == 2
    assert groups[1][0] - groups[0][-1] > bubble['style']['fontSize']
    assert np.flatnonzero(np.any(changed, axis=1))[-1] < bubble['y'] + bubble['height']
    bubble['height'] = 5
    with pytest.raises(ValueError, match='textOverflow'):
        render_page(image, [bubble], FONT)


def test_bubble_component_groups_multiple_ocr_lines_without_merging_other_panels():
    image = np.zeros((300, 600, 3), np.uint8)
    cv2.ellipse(image, (150, 150), (100, 80), 0, 0, 360, (255, 255, 255), -1)
    cv2.ellipse(image, (450, 150), (100, 80), 0, 0, 360, (255, 255, 255), -1)
    def block(text, x, y):
        return {'text': text, 'quad': [[x, y], [x+80, y], [x+80, y+20], [x, y+20]], 'confidence': 0.9}
    regions = detect_comic_regions(image, [block('Hello', 110, 120), block('world', 110, 150), block('Other', 410, 130)], 'ltr')
    assert len(regions) == 2
    assert any(item['sourceText'] == 'Hello world' for item in regions)


@pytest.mark.asyncio
async def test_app_comic_router_auth_asset_scope_and_env_mount(tmp_path, monkeypatch):
    import httpx
    from nola_translator_engine.backend.app import create_app

    image, _ = source(tmp_path)
    monkeypatch.setenv('NOLA_COMIC_DIR', str(tmp_path / 'comics'))
    monkeypatch.setenv('NOLA_COMIC_FONT_PATH', str(FONT))
    monkeypatch.delenv('NOLA_TRANSLATOR_MODEL_DIR', raising=False)
    app = create_app(control_token='private-test-token')
    async with app.router.lifespan_context(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            assert (await client.get('/api/v2/comics/projects')).status_code == 401
            client.headers['Authorization'] = 'Bearer private-test-token'
            first = (await client.post('/api/v2/comics/import', json={'paths': [str(image)], 'title': 'One'})).json()
            second = (await client.post('/api/v2/comics/import', json={'paths': [str(image)], 'title': 'Two'})).json()
            page_id = first['pages'][0]['id']
            assert (await client.get(f"/api/v2/comics/projects/{first['id']}/pages/{page_id}/source")).content == image.read_bytes()
            assert (await client.get(f"/api/v2/comics/projects/{second['id']}/pages/{page_id}/source")).status_code == 400
            preview = await client.get(f"/api/v2/comics/projects/{first['id']}/pages/{page_id}/source?max_pixels=10000")
            assert preview.status_code == 200
            assert int(preview.headers['x-image-width']) * int(preview.headers['x-image-height']) <= 10000
            bad = await client.post('/api/v2/comics/edit', json={'projectId': first['id'], 'operationId': str(uuid4()), 'expectedRevision': first['revision'], 'command': {'action': 'rename', 'title': 'Bad', 'path': '../outside'}})
            assert bad.status_code == 400
            assert (await client.get(f"/api/v2/comics/projects/{first['id']}")).json()['title'] == 'One'
            exported = await client.post(f"/api/v2/comics/projects/{first['id']}/export", json={'kind': 'project'})
            assert exported.status_code == 200


@pytest.mark.asyncio
@pytest.mark.parametrize('cancel', [True, False])
async def test_late_translation_cannot_overwrite_cancelled_or_manually_edited_page(tmp_path, monkeypatch, cancel):
    from nola_translator_engine.backend import direct_inference
    entered, finish = asyncio.Event(), asyncio.Event()
    async def infer(*args, **kwargs):
        entered.set()
        await finish.wait()
        return direct_inference.DirectInferenceResult(text='机器稿')
    monkeypatch.setattr(direct_inference, 'run_direct_inference', infer)
    image, _ = source(tmp_path)
    service = ComicService(tmp_path / 'comics', None, FONT)
    project = service.repository.import_sources([str(image)], 'Book')
    bubble = {**region(None), 'locked': False}
    mutation = {'projectId': project['id'], 'operationId': str(uuid4()), 'expectedRevision': project['revision'],
        'command': {'action': 'saveRegion', 'pageId': project['pages'][0]['id'], 'region': bubble}}
    project = service.repository.edit(mutation)
    started = service.run(project['id'], RunRequest(expectedRevision=project['revision'], pageIds=[project['pages'][0]['id']], stage='translate', model='test'), object(), {})
    await entered.wait()
    job_id = started['jobs'][0]['id']
    if cancel:
        service.cancellations.add(job_id)
    else:
        project = service.repository.edit({**mutation, 'operationId': str(uuid4()), 'expectedRevision': project['revision'],
            'command': {**mutation['command'], 'region': {**bubble, 'targetText': '人工稿', 'locked': True}}})
    finish.set()
    await asyncio.gather(*service.tasks.values())
    final = service.repository.open(project['id'])
    assert final['pages'][0]['regions'][0]['targetText'] == (None if cancel else '人工稿')
    assert final['jobs'][0]['state'] == ('cancelled' if cancel else 'failed')
    if not cancel:
        assert final['jobs'][0]['error'] == 'editConflict'


def test_restart_marks_pending_paid_stage_unknown_without_retry(tmp_path):
    image, _ = source(tmp_path)
    repository = ComicRepository(tmp_path / 'comics')
    project = repository.import_sources([str(image)], 'Book')
    repository.save_job(project['id'], {'id': str(uuid4()), 'state': 'running', 'stage': 'translate', 'completedPages': 0, 'totalPages': 1})
    restored = ComicRepository(tmp_path / 'comics').open(project['id'])
    assert restored['jobs'][0]['state'] == 'interrupted'
    assert restored['jobs'][0]['error'] == 'unknownOutcome'


@pytest.mark.asyncio
async def test_locked_text_survives_real_repair_layout_job(tmp_path):
    image, _ = source(tmp_path)
    service = ComicService(tmp_path / 'comics', None, FONT)
    project = service.repository.import_sources([str(image)], 'Book')
    project = service.repository.edit({'projectId': project['id'], 'operationId': str(uuid4()), 'expectedRevision': project['revision'],
        'command': {'action': 'saveRegion', 'pageId': project['pages'][0]['id'], 'region': region()}})
    service.run(project['id'], RunRequest(expectedRevision=project['revision'], pageIds=[project['pages'][0]['id']], stage='repair', model=''), None, {})
    await asyncio.gather(*service.tasks.values())
    project = service.repository.open(project['id'])
    assert project['jobs'][0]['state'] == 'completed'
    service.run(project['id'], RunRequest(expectedRevision=project['revision'], pageIds=[project['pages'][0]['id']], stage='layout', model=''), None, {})
    await asyncio.gather(*service.tasks.values())
    project = service.repository.open(project['id'])
    assert project['pages'][0]['regions'][0]['targetText'] == '你好'
    assert project['pages'][0]['hasRendered']
    with zipfile.ZipFile(service.repository.export(project['id'], 'cbz', None)) as archive:
        assert archive.namelist() == ['0001.png']


@pytest.mark.asyncio
async def test_detect_and_edit_before_ocr_then_process_blank_and_text_pages(tmp_path, monkeypatch):
    from nola_translator_engine.backend import direct_inference

    image, pixels = source(tmp_path)
    blank = tmp_path / 'blank.png'
    blank.write_bytes(encode_image(np.full_like(pixels, 255)))

    class Ocr:
        def variant(self, _):
            return self

        async def detect_comic(self, image):
            return [np.array([[48, 40], [208, 40], [208, 112], [48, 112]])] if image.min() < 255 else []

        async def recognize_comic_box(self, _image, quad, _language, _vertical):
            assert quad[0] == [46.0, 40.0]
            return [('Hello', 0.9)]

    translated = []

    async def translate(_gateway, request, **_options):
        translated.append(request.text)
        return direct_inference.DirectInferenceResult(text='你好')

    monkeypatch.setattr(direct_inference, 'run_direct_inference', translate)
    service = ComicService(tmp_path / 'comics', Ocr(), FONT)
    book = service.repository.import_sources([str(blank), str(image)], 'Book')
    page_ids = [page['id'] for page in book['pages']]
    service.run(book['id'], RunRequest(expectedRevision=book['revision'], pageIds=page_ids, stage='detect', model=''), None, {})
    await asyncio.gather(*service.tasks.values())
    book = service.repository.open(book['id'])
    assert [page['status'] for page in book['pages']] == ['detected', 'detected']
    detected = book['pages'][1]['regions'][0]
    assert detected['sourceText'] == ''
    assert detected['sourceLines'][0][0] == [48, 40]
    edited = {key: value for key, value in detected.items() if key not in ('sourceQuad', 'sourceLines')}
    edited['x'] = 46
    book = service.repository.edit({'projectId': book['id'], 'operationId': str(uuid4()), 'expectedRevision': book['revision'],
        'command': {'action': 'saveRegion', 'pageId': page_ids[1], 'region': edited}})

    service.run(book['id'], RunRequest(expectedRevision=book['revision'], pageIds=page_ids, stage='full', model='test'), object(), {})
    await asyncio.gather(*service.tasks.values())
    final = service.repository.open(book['id'])
    assert final['jobs'][0]['state'] == 'completed'
    assert final['jobs'][0]['completedPages'] == 2
    assert translated == ['Hello']
    blank_page, translated_page = final['pages']
    assert blank_page['renderedAsset'] == blank_page['sourceAsset']
    assert translated_page['regions'][0]['targetText'] == '你好'
    assert translated_page['hasRendered']
    assert translated_page['renderedAsset'] != translated_page['sourceAsset']


@pytest.mark.asyncio
async def test_clean_only_exports_a_clean_layer_without_translation(tmp_path):
    image, _ = source(tmp_path)
    service = ComicService(tmp_path / 'comics', None, FONT)
    book = service.repository.import_sources([str(image)], 'Book')
    page_id = book['pages'][0]['id']
    book = service.repository.edit({'projectId': book['id'], 'operationId': str(uuid4()), 'expectedRevision': book['revision'],
        'command': {'action': 'saveRegion', 'pageId': page_id, 'region': region(None)}})
    service.run(book['id'], RunRequest(expectedRevision=book['revision'], pageIds=[page_id], stage='clean', model=''), None, {})
    await asyncio.gather(*service.tasks.values())
    final = service.repository.open(book['id'])
    page = final['pages'][0]
    assert page['hasClean'] and not page['hasRendered']
    assert page['regions'][0]['targetText'] is None
    out = service.repository.export(book['id'], 'png', [page_id], 'clean')
    assert out.read_bytes() != image.read_bytes()
    assert out.read_bytes() == service.repository.asset_path(book['id'], page_id, 'clean').read_bytes()


@pytest.mark.asyncio
async def test_layout_keeps_processing_after_a_page_needs_repair(tmp_path):
    image, pixels = source(tmp_path)
    second = tmp_path / 'second.png'
    second.write_bytes(encode_image(pixels))
    service = ComicService(tmp_path / 'comics', None, FONT)
    book = service.repository.import_sources([str(image), str(second)], 'Book')
    first_id, second_id = (page['id'] for page in book['pages'])
    service.run(book['id'], RunRequest(expectedRevision=book['revision'], pageIds=[second_id], stage='repair', model=''), None, {})
    await asyncio.gather(*service.tasks.values())
    book = service.repository.open(book['id'])

    service.run(book['id'], RunRequest(expectedRevision=book['revision'], pageIds=[first_id, second_id], stage='layout', model=''), None, {})
    await asyncio.gather(*service.tasks.values())
    final = service.repository.open(book['id'])
    assert final['jobs'][0]['completedPages'] == 1
    assert final['jobs'][0]['issues'] == [{'pageId': first_id, 'stage': 'layout', 'error': 'repairRequired'}]
    assert not final['pages'][0]['hasRendered'] and final['pages'][1]['hasRendered']


@pytest.mark.asyncio
async def test_ocr_missing_is_persisted_failure_and_old_outputs_survive(tmp_path):
    image, _ = source(tmp_path)
    service = ComicService(tmp_path / 'comics', None, FONT)
    project = service.repository.import_sources([str(image)], 'Book')
    service.run(project['id'], RunRequest(expectedRevision=project['revision'], pageIds=[project['pages'][0]['id']], stage='ocr', model=''), None, {})
    await asyncio.gather(*service.tasks.values())
    result = service.repository.open(project['id'])
    assert result['jobs'][0]['error'] == 'ocrUnavailable'
    assert result['pages'][0]['sourceAsset'] == project['pages'][0]['sourceAsset']
    assert result['revision'] == project['revision']


@pytest.mark.asyncio
async def test_local_glossary_context_is_per_request_and_reset_on_error():
    captured = []
    class Provider:
        name = 'hymt2'
        async def translate(self, text, source, target):
            await asyncio.sleep(0)
            captured.append((text, active_glossary.get()))
            return ProviderTranslation(text, (source, target))
    base = {'source': 'en', 'target': 'zh'}
    await asyncio.gather(translate_with_glossary(Provider(), {**base, 'text': 'A', 'glossary': [{'source': 'A', 'target': '甲', 'caseSensitive': True, 'mode': 'fixed'}]}),
                         translate_with_glossary(Provider(), {**base, 'text': 'B', 'glossary': []}))
    assert '甲' in captured[0][1]
    assert captured[1][1] == ''
    assert active_glossary.get() == ''
    provider = Provider(); provider.name = 'm2m100'
    with pytest.raises(ValueError, match='glossaryUnsupported'):
        await translate_with_glossary(provider, {**base, 'text': 'A', 'glossary': [{'source': 'A', 'target': '', 'caseSensitive': True, 'mode': 'keep'}]})


@pytest.mark.asyncio
async def test_gateway_worker_fallback_receives_terms_or_rejects_unsupported_provider():
    from types import SimpleNamespace
    from nola_translator_engine.gateway_worker import GatewayWorker
    captured = []
    async def translate(text, source, target):
        captured.append(active_glossary.get())
        return ProviderTranslation('甲', (source, target))
    worker = GatewayWorker(lambda _: None)
    worker.kind = 'mt'
    worker.runtime = SimpleNamespace(translation_provider=SimpleNamespace(name='hymt2', translate=translate))
    worker.fallback_runtime = SimpleNamespace(translation_provider=SimpleNamespace(name='hymt2', translate=translate))
    request = {'op': 'infer', 'text': 'A', 'target': 'zh', 'glossary': [{'source': 'A', 'target': '甲', 'caseSensitive': True, 'mode': 'fixed'}]}
    assert (await worker.request(request))['text'] == '甲'
    assert (await worker.request({**request, 'fallback': True}))['text'] == '甲'
    assert all('甲' in value for value in captured)
    worker.fallback_runtime.translation_provider.name = 'm2m100'
    with pytest.raises(ValueError, match='glossaryUnsupported'):
        await worker.request({**request, 'fallback': True})


def test_bubble_keeps_vertical_title_separate_from_small_horizontal_caption():
    image = np.full((1000, 1000, 3), 255, np.uint8)
    cv2.rectangle(image, (200, 200), (700, 700), (0, 0, 0), 5)
    def block(x, y, width, height):
        return {'text': '', 'quad': [[x, y], [x+width, y], [x+width, y+height], [x, y+height]], 'confidence': None}
    regions = detect_comic_regions(image, [block(300, 300, 80, 240), block(420, 300, 80, 240),
                                           block(300, 600, 150, 10)], 'rtl')
    assert len(regions) == 2
    title = next(item for item in regions if item['style']['direction'] == 'vertical-rl')
    assert title['style']['fontSize'] == 60
    assert len(title['sourceLines']) == 2


def test_auto_layout_enlarges_legacy_detector_size_but_keeps_explicit_size():
    image = np.full((500, 500, 3), 255, np.uint8)
    bubble = region('TITLE')
    bubble.update(x=20, y=20, width=450, height=400, sourceLines=[[[20,20],[100,20],[100,28],[20,28]], [[20,40],[200,40],[200,120],[20,120]], [[20,140],[200,140],[200,220],[20,220]]])
    bubble['style']['fontSize'] = 6
    automatic = render_page(image, [bubble], FONT)
    automatic_height = np.count_nonzero(np.any(np.any(automatic != image, axis=2), axis=1))
    bubble['style']['autoFontSize'] = False
    manual = render_page(image, [bubble], FONT)
    manual_height = np.count_nonzero(np.any(np.any(manual != image, axis=2), axis=1))
    assert automatic_height > manual_height * 5


def test_page_background_is_not_a_bubble_and_layout_contains_source():
    image = np.full((500, 500, 3), 255, np.uint8)
    blocks = [{'text': '', 'quad': [[100,100],[180,100],[180,300],[100,300]], 'confidence': None}]
    detected = detect_comic_regions(image, blocks, 'rtl')[0]
    assert (detected['x'], detected['y'], detected['width'], detected['height']) == (100,100,80,200)


def test_reading_order_uses_page_coordinates_instead_of_normalized_box_height():
    image = np.full((800, 800, 3), 255, np.uint8)
    def block(name, x, y, w, h):
        return {'text': name, 'quad': [[x,y],[x+w,y],[x+w,y+h],[x,y+h]], 'confidence': .9}
    regions = detect_comic_regions(image, [block('lower', 100, 300, 80, 400),
        block('left', 100, 50, 80, 40), block('right', 500, 50, 80, 40)], 'rtl')
    assert [region['sourceText'] for region in regions] == ['right', 'left', 'lower']


@pytest.mark.asyncio
async def test_translation_gateway_error_is_page_scoped_and_sanitized(tmp_path, monkeypatch):
    from nola_translator_engine.backend import direct_inference
    from nola_translator_engine.backend.gateway.capabilities import GatewayError, GatewayErrorCode
    image, _ = source(tmp_path)
    second = tmp_path / 'second.png'
    second.write_bytes(image.read_bytes())
    service = ComicService(tmp_path / 'comics', None, FONT)
    book = service.repository.import_sources([str(image), str(second)], 'Book')
    for page in book['pages']:
        book = service.repository.edit({'projectId': book['id'], 'operationId': str(uuid4()),
            'expectedRevision': book['revision'], 'command': {'action': 'saveRegion',
            'pageId': page['id'], 'region': {**region(None), 'locked': False}}})
    calls = []
    async def translate(*args, **kwargs):
        calls.append(1)
        if len(calls) == 1:
            raise GatewayError(GatewayErrorCode.TIMEOUT, stage='translate', message='secret-provider-message')
        return direct_inference.DirectInferenceResult(text='你好')
    monkeypatch.setattr(direct_inference, 'run_direct_inference', translate)
    service.run(book['id'], RunRequest(expectedRevision=book['revision'],
        pageIds=[page['id'] for page in book['pages']], stage='translate', model='test'), object(), {})
    await asyncio.gather(*service.tasks.values())
    final = service.repository.open(book['id'])
    job = final['jobs'][0]
    assert job['completedPages'] == 1
    assert job['issues'][0]['error'] == 'translationFailed'
    assert job['issues'][0]['providerErrorCode'] == 'TIMEOUT'
    assert job['issues'][0]['retryable'] is True
    assert 'secret-provider-message' not in str(final)
    assert not final['pages'][0]['hasClean']
    assert final['pages'][1]['regions'][0]['targetText'] == '你好'


@pytest.mark.asyncio
@pytest.mark.parametrize("source_text", ["1 - 2026/11!", "ーー", "〜～〰"] )
async def test_numeric_caption_does_not_call_translation_provider(tmp_path, monkeypatch, source_text):
    from nola_translator_engine.backend import direct_inference
    image, _ = source(tmp_path)
    service = ComicService(tmp_path / 'comics', None, FONT)
    book = service.repository.import_sources([str(image)], 'Book')
    page = book['pages'][0]
    numeric = {**region(None), 'locked': False, 'sourceText': source_text}
    book = service.repository.edit({'projectId': book['id'], 'operationId': str(uuid4()),
        'expectedRevision': book['revision'], 'command': {'action': 'saveRegion', 'pageId': page['id'], 'region': numeric}})
    async def unexpected(*args, **kwargs):
        raise AssertionError('numeric caption requested MT')
    monkeypatch.setattr(direct_inference, 'run_direct_inference', unexpected)
    service.run(book['id'], RunRequest(expectedRevision=book['revision'], pageIds=[page['id']],
        stage='translate', model='test'), object(), {})
    await asyncio.gather(*service.tasks.values())
    final = service.repository.open(book['id'])
    assert final['jobs'][0]['state'] == 'completed'
    assert final['pages'][0]['regions'][0]['targetText'] == numeric['sourceText']


def test_tilted_words_form_one_phrase_in_baseline_order_and_render_rotated():
    image = np.full((400, 600, 3), 255, np.uint8)
    axis = np.array([.94, -.342])
    normal = np.array([.342, .94])
    def word(text, offset, width):
        origin = np.array([60, 200]) + axis * offset
        quad = [origin, origin + axis * width, origin + axis * width + normal * 30, origin + normal * 30]
        return {'text': text, 'quad': np.array(quad), 'confidence': .95}
    blocks = [word('JACK', 190, 80), word('BLACK', 80, 90), word('TO', 0, 60)]
    regions = detect_comic_regions(image, blocks, 'rtl')
    assert len(regions) == 1
    item = regions[0]
    assert item['sourceText'] == 'TO BLACK JACK'
    assert len(item['sourceLines']) == 3
    assert -21 < item['style']['angle'] < -19
    item['targetText'] = 'Translated title'
    rendered = render_page(image, [item], FONT)
    ys, xs = np.where(np.any(rendered != image, axis=2))
    assert len(xs) > 100
    assert np.corrcoef(xs, ys)[0,1] < -.4


def test_adjacent_vertical_columns_form_rtl_paragraph():
    image = np.full((600, 600, 3), 255, np.uint8)
    def column(text, x):
        return {'text': text, 'quad': [[x,100],[x+50,100],[x+50,400],[x,400]], 'confidence': .9}
    regions = detect_comic_regions(image, [column('second', 100), column('first', 180)], 'rtl')
    assert len(regions) == 1
    assert regions[0]['sourceText'] == 'first\nsecond'


def test_tilted_paragraph_groups_stacked_words_without_absorbing_short_author():
    image = np.full((1600, 1800, 3), 255, np.uint8)
    axis = np.array([.75, -.66]); normal = np.array([.66, .75])
    def word(text, row, width):
        origin = np.array([700, 300]) + normal * row * 90
        return {'text': text, 'quad': np.array([origin, origin+axis*width,
            origin+axis*width+normal*45, origin+normal*45]), 'confidence': .9}
    regions = detect_comic_regions(image, [word('GIVE', 0, 140), word('MY', 1, 100),
        word('REGARDS', 2, 200), word('TO', 3, 100), word('BLACK', 4, 180), word('JACK', 5, 170)], 'rtl')
    assert len(regions) == 1
    assert regions[0]['sourceText'] == 'GIVE MY REGARDS TO BLACK JACK'
    def column(text, x, y, h):
        return {'text': text, 'quad': [[x,y],[x+80,y],[x+80,y+h],[x,y+h]], 'confidence': .9}
    regions = detect_comic_regions(image, [column('title',100,100,1000), column('author',210,650,450)], 'rtl')
    assert len(regions) == 2


@pytest.mark.parametrize('background,ink,expected', [((255,255,255),(0,0,255),'#ff0000'),
    ((255,255,255),(255,0,0),'#0000ff'), ((0,0,0),(255,255,255),'#ffffff')])
def test_detect_preserves_source_ink_color(background, ink, expected):
    image = np.full((150,200,3), background, np.uint8)
    cv2.putText(image, 'Hi', (30,85), cv2.FONT_HERSHEY_SIMPLEX, 1.5, ink, 3)
    blocks = [{'text': 'Hi', 'quad': [[25,45],[100,45],[100,95],[25,95]], 'confidence': .9}]
    assert detect_comic_regions(image, blocks, 'ltr')[0]['style']['color'] == expected


@pytest.mark.parametrize('count,angle,expected', [(1,0,False),(2,0,True),(2,-41,False),(1,31,False),(0,0,True)])
def test_manga_routing_preserves_single_line_signs_and_tilted_artwork(count, angle, expected):
    from nola_translator_engine.backend.comic import use_manga_ocr
    item = region()
    item['style']['angle'] = angle
    if count:
        item['sourceLines'] = [[[0,0],[50,0],[50,200],[0,200]]] * count
    assert use_manga_ocr(item) is expected


def test_missing_ocr_config_defaults_to_auto_without_changing_explicit_choices():
    from nola_translator_engine.backend.comic import ComicConfig
    config = {'sourceLanguage': 'ja', 'targetLanguage': 'zh', 'model': '',
        'readingDirection': 'rtl', 'glossary': {'mode': 'off'}}
    assert ComicConfig.model_validate(config).ocr == 'auto'
    assert ComicConfig.model_validate({**config, 'ocr': 'ppocr'}).ocr == 'ppocr'
    assert ComicConfig.model_validate({**config, 'ocr': 'manga-ocr'}).ocr == 'manga-ocr'


@pytest.mark.parametrize('selection,language,installed,expected', [(None,'ja',True,True),
    ('auto','auto',True,True), ('auto','ja',False,False), ('auto','en',True,False),
    ('ppocr','ja',True,False), ('manga-ocr','ja',False,True)])
def test_auto_manga_uses_only_installed_models_and_preserves_explicit_selection(selection,language,installed,expected):
    from types import SimpleNamespace
    from nola_translator_engine.backend.comic import manga_ocr_enabled
    config = {'sourceLanguage': language}
    if selection is not None:
        config['ocr'] = selection
    ocr = SimpleNamespace(models=SimpleNamespace(is_installed=lambda spec: installed))
    assert manga_ocr_enabled(config, ocr) is expected


def test_sparse_black_ink_is_not_confused_with_yellow_and_white_paper():
    from nola_translator_engine.backend.comic import comic_text_color
    image = np.full((200,300,3), (36,220,250), np.uint8)
    cv2.rectangle(image, (60,70), (240,120), (250,250,250), -1)
    cv2.putText(image, 'REGARDS', (65,100), cv2.FONT_HERSHEY_SIMPLEX, .6, (0,0,0), 1)
    color = comic_text_color(image, [[[40,40],[260,40],[260,150],[40,150]]])
    assert max(int(color[index:index+2],16) for index in (1,3,5)) < 40


def test_rtdetr_fallback_keeps_only_regions_uncovered_by_refined_lines():
    from nola_translator_engine.backend.comic import overlaps_source
    image = np.full((600,800,3),255,np.uint8)
    def block(x,y,w,h):
        return {'text': '', 'quad': [[x,y],[x+w,y],[x+w,y+h],[x,y+h]], 'confidence': None}
    refined = detect_comic_regions(image,[block(100,100,80,250)],'rtl',True)
    fallback = detect_comic_regions(image,[block(50,50,300,400),block(500,100,100,200)],'rtl',False)
    novel = [item for item in fallback if not any(overlaps_source(item, other) for other in refined)]
    assert len(novel) == 1
    assert novel[0]['x'] == 500
    assert refined[0]['sourceLines']
    assert 'sourceLines' not in novel[0]


def test_automatic_translation_rejects_obvious_explanatory_expansion():
    from nola_translator_engine.backend.comic import validate_comic_translation
    with pytest.raises(ValueError, match='translationNeedsReview'):
        validate_comic_translation('hospital', 'This hospital is located in an invented city. ' * 4)
    validate_comic_translation('Hi', 'Pleased to meet you, my friend.')
    validate_comic_translation('A long source sentence with details.', 'A translated sentence with its details preserved.')


def test_precise_source_lines_keep_long_strokes_and_scale_dilation():
    image = np.full((200,300,3),255,np.uint8)
    cv2.line(image,(50,70),(248,70),(0,0,0),2)
    item = region('translated')
    item.update(sourceQuad=[[50,50],[250,50],[250,100],[50,100]],
                sourceLines=[[[50,50],[250,50],[250,100],[50,100]]])
    _,mask = repair_page(image,[item],mask_only=True)
    assert np.all(mask[70,50:249] > 0)
    assert np.count_nonzero(mask) > np.count_nonzero(np.any(image != 255,axis=2))


def test_automatic_layout_preserves_margin_and_source_size_limit():
    image = np.full((500,500,3),255,np.uint8)
    item = region('Hi')
    item.update(x=50,y=50,width=400,height=400,sourceLines=[[[50,50],[150,50],[150,90],[50,90]]])
    item['style']['autoFontSize'] = True
    output = render_page(image,[item],FONT)
    ys,xs = np.where(np.any(output != image,axis=2))
    assert xs.min() > 82 and xs.max() < 418
    assert ys.max()-ys.min() < 60


def test_legacy_region_roundtrip_omits_nullable_optional_typography():
    from nola_translator_engine.backend.comic import validate_region
    saved = validate_region(region(), {'width': 360, 'height': 180})
    assert 'autoFontSize' not in saved['style']
    assert validate_region(saved, {'width': 360, 'height': 180}) == saved
    saved['style']['autoFontSize'] = False
    assert validate_region(saved, {'width': 360, 'height': 180})['style']['autoFontSize'] is False


@pytest.mark.asyncio
@pytest.mark.parametrize('legacy', [False, True])
async def test_full_preserves_user_corrected_generated_region(tmp_path, monkeypatch, legacy):
    from nola_translator_engine.backend import direct_inference

    class Ocr:
        def variant(self, resource_id):
            return self

        async def detect_comic(self, image):
            return []

        async def recognize_comic(self, *args):
            raise AssertionError('Manual source must survive automatic OCR')

    async def translate(gateway, request, **kwargs):
        assert request.text == 'User corrected source'
        return direct_inference.DirectInferenceResult(text='Corrected translation')

    monkeypatch.setattr(direct_inference, 'run_direct_inference', translate)
    path, _ = source(tmp_path)
    service = ComicService(tmp_path / 'comics', Ocr(), FONT)
    project = service.repository.import_sources([str(path)], 'Book')
    item = region(None)
    item.update(locked=False, confidence=.9, sourceText='User corrected source',
                sourceLines=[[[45,40],[245,40],[245,110],[45,110]]])
    project = service.repository.edit({'projectId': project['id'], 'operationId': str(uuid4()),
        'expectedRevision': project['revision'], 'command': {'action': 'saveRegion',
        'pageId': project['pages'][0]['id'], 'region': item}})
    if legacy:
        with service.repository.connection() as db:
            saved = service.repository._load(db, project['id'])
            saved['pages'][0]['regions'][0].pop('manuallyEdited')
            saved['pages'][0]['regions'][0]['confidence'] = .9
            service.repository._save(db, saved)
    request = RunRequest(expectedRevision=project['revision'], pageIds=[project['pages'][0]['id']],
                         stage='full', model='test')
    service.run(project['id'], request, object(), {})
    await asyncio.gather(*service.tasks.values())
    result = service.repository.open(project['id'])
    assert result['jobs'][0]['state'] == 'completed'
    saved = result['pages'][0]['regions'][0]
    assert saved['id'] == item['id'] and saved['manuallyEdited']
    assert saved['sourceText'] == item['sourceText']
    assert saved['targetText'] == 'Corrected translation'


def test_vertical_shape_layout_does_not_draw_into_author_below_short_column():
    image = np.full((600,600,3),255,np.uint8)
    item = region('A longer translated title with more characters')
    item.update(x=50,y=50,width=450,height=500,sourceLines=[
        [[400,50],[490,50],[490,550],[400,550]],
        [[250,50],[340,50],[340,450],[250,450]],
        [[100,50],[190,50],[190,300],[100,300]]])
    item['style'].update(direction='vertical-rl',autoFontSize=True)
    rendered = render_page(image,[item],FONT)
    assert np.any(rendered != image)
    assert np.array_equal(rendered[310:550,90:200],image[310:550,90:200])
    assert np.array_equal(rendered[460:550,240:350],image[460:550,240:350])


@pytest.mark.asyncio
@pytest.mark.parametrize('source,expected,manga_calls', [('Chinese text','Chinese text',0),
    ('English paragraph','English paragraph',0), ('\u4f60\u597d\u4e16\u754c','\u4f60\u597d\u4e16\u754c',0), ('\u304a\u306f\u3088\u3046','Japanese paragraph',1)])
async def test_auto_language_uses_manga_only_after_ppocr_finds_kana(source,expected,manga_calls):
    from nola_translator_engine.backend.comic import recognize_comic_region
    class Recognizer:
        def __init__(self,text):
            self.text=text; self.calls=0
        async def recognize_comic(self,*args):
            self.calls+=1
            return [(self.text,.95)]
    pp=Recognizer(source);manga=Recognizer('Japanese paragraph')
    item=region();item['sourceLines']=[[[0,0],[50,0],[50,200],[0,200]]]*2
    result=await recognize_comic_region(None,item,'auto',pp,manga)
    assert result[0][0]==expected
    assert pp.calls==1 and manga.calls==manga_calls


def test_art_column_refinement_recovers_fragmented_display_type_inside_confirmed_block():
    from nola_translator_engine.backend.comic import refine_art_columns
    image = np.full((800,600,3),255,np.uint8)
    for y in (100,250,400,550):
        cv2.rectangle(image,(300,y),(380,y+90),(0,0,0),-1)
    fragments = [np.array([[295,y],[390,y],[390,y+100],[295,y+100]],np.float32) for y in (100,250,400,550)]
    author = np.array([[100,600],[150,600],[150,750],[100,750]],np.float32)
    block = np.array([[50,50],[550,50],[550,780],[50,780]],np.float32)
    result = refine_art_columns(image,[*fragments,author],[block])
    assert len(result) == 2
    assert any(np.array_equal(quad,author) for quad in result)
    recovered = next(quad for quad in result if not np.array_equal(quad,author))
    assert np.ptp(recovered[:,1]) > 500
    assert np.ptp(recovered[:,0]) < 120
    assert refine_art_columns(image,fragments,[]) == fragments


def test_dark_sign_text_on_midgray_background_uses_ink_polarity_not_border_threshold():
    image = np.full((300,200,3),118,np.uint8)
    cv2.putText(image,'TEST',(15,100),cv2.FONT_HERSHEY_SIMPLEX,1.5,(5,5,5),5)
    item=region('translated')
    item.update(sourceQuad=[[10,40],[180,40],[180,120],[10,120]],
        sourceLines=[[[10,40],[180,40],[180,120],[10,120]]])
    _,mask=repair_page(image,[item],mask_only=True)
    assert mask[45,15]==0
    assert np.count_nonzero(mask)>100


def test_bilingual_vertical_labels_preserve_original_latin_name_but_not_independent_text():
    from nola_translator_engine.backend.comic import preserve_bilingual_label
    latin={**region(),'sourceText':'SATO SYUHOU','sourceQuad':[[600,2265],[675,2265],[675,2686],[600,2686]]}
    latin['style']={**latin['style'],'direction':'vertical-rl'}
    han={**region(),'sourceText':'\u4f50\u85e4\u79c0\u5cf0','sourceQuad':[[474,2262],[604,2262],[604,2745],[474,2745]]}
    han['style']={**han['style'],'direction':'vertical-rl'}
    assert preserve_bilingual_label(latin,[latin,han],'zh')
    assert not preserve_bilingual_label(latin,[latin],'zh')
    assert not preserve_bilingual_label(latin,[latin,han],'zh',[object()])
    far={**han,'sourceQuad':[[0,0],[130,0],[130,483],[0,483]]}
    assert not preserve_bilingual_label(latin,[latin,far],'zh')
    horizontal={**latin,'style':{**latin['style'],'direction':'horizontal'}}
    assert not preserve_bilingual_label(horizontal,[horizontal,han],'zh')


@pytest.mark.parametrize('selection,installed,expected', [(None,True,'lama-manga'),
    ('auto',True,'lama-manga'),('auto',False,'telea'),('telea',True,'telea'),('lama-manga',False,'lama-manga')])
def test_auto_repair_selects_only_installed_lama_without_changing_saved_config(selection,installed,expected):
    from types import SimpleNamespace
    from nola_translator_engine.backend.comic import comic_repair_method
    config={} if selection is None else {'repairMethod':selection}
    before=dict(config)
    ocr=SimpleNamespace(models=SimpleNamespace(is_installed=lambda spec:installed))
    assert comic_repair_method(config,ocr)==expected
    assert config==before


@pytest.mark.parametrize('selection,installed,expected', [(None,True,'rtdetr'),
    ('auto',False,'ppocr'),('ppocr',True,'ppocr'),('rtdetr',False,'rtdetr')])
def test_auto_detector_prefers_installed_rtdetr_and_preserves_explicit_ppocr(selection,installed,expected):
    from types import SimpleNamespace
    from nola_translator_engine.backend.comic import comic_detector_method
    config={} if selection is None else {'detector':selection}
    original=dict(config)
    ocr=SimpleNamespace(models=SimpleNamespace(is_installed=lambda spec:installed))
    assert comic_detector_method(config,ocr)==expected
    assert config==original


def test_expanded_bubble_fits_complete_paragraph_in_bubble_instead_of_tight_source_columns():
    image=np.full((500,500,3),255,np.uint8)
    item=region('A readable translated paragraph')
    item.update(x=50,y=50,width=350,height=400,sourceQuad=[[100,100],[200,100],[200,300],[100,300]],
        sourceLines=[[[160,100],[200,100],[200,300],[160,300]],[[100,100],[140,100],[140,300],[100,300]]])
    item['style'].update(direction='vertical-rl',autoFontSize=True)
    expanded=render_page(image,[item],FONT)
    tight={**item,'x':100,'y':100,'width':100,'height':200}
    constrained=render_page(image,[tight],FONT)
    assert np.count_nonzero(np.any(expanded!=image,axis=2)) > np.count_nonzero(np.any(constrained!=image,axis=2))*1.5


def test_clipped_bubble_layout_expands_without_changing_source_polygons():
    from nola_translator_engine.backend.comic import apply_comic_bubbles
    item=region();item.update(x=860,y=100,width=100,height=250,sourceQuad=[[860,100],[960,100],[960,350],[860,350]])
    original=[point[:] for point in item['sourceQuad']]
    apply_comic_bubbles([item],[[[820,30],[1020,30],[1020,420],[820,420]]])
    assert item['x']==840 and item['width']==160
    assert item['sourceQuad']==original


def test_noto_vertical_punctuation_uses_supported_vertical_forms_without_changing_text():
    from PIL import ImageFont
    from nola_translator_engine.backend.comic import vertical_comic_glyph
    font=ImageFont.truetype(str(FONT),40)
    for original,expected in zip('，。！？…（）“”','︐︒︕︖︙︵︶﹁﹂'):
        assert vertical_comic_glyph(original,font)==expected
    assert vertical_comic_glyph('A',font)=='A'


def test_typography_weight_stroke_italic_and_visibility_change_actual_pixels():
    image=np.full((180,360,3),255,np.uint8)
    item=region('Type')
    plain=render_page(image,[item],FONT)
    item['style']['fontWeight']=800
    heavy=render_page(image,[item],FONT)
    assert np.count_nonzero(np.any(heavy!=image,axis=2))>np.count_nonzero(np.any(plain!=image,axis=2))
    item['style'].update(strokeWidth=3,strokeColor='#ff0000',fontStyle='italic')
    styled=render_page(image,[item],FONT)
    assert np.any((styled[:,:,2]>200)&(styled[:,:,1]<100)&(styled[:,:,0]<100))
    assert not np.array_equal(styled,heavy)
    item['visible']=False
    assert np.array_equal(render_page(image,[item],FONT),image)


@pytest.mark.asyncio
async def test_neural_repair_uses_local_context_crops_and_preserves_pixels_outside_mask():
    from nola_translator_engine.backend.comic import repair_comic_regions
    image=np.full((800,1200,3),255,np.uint8)
    mask=np.zeros(image.shape[:2],np.uint8);mask[100:120,100:120]=255;mask[700:705,1100:1105]=255
    item=region('translated');item['sourceQuad']=[[90,90],[140,90],[140,140],[90,140]]
    class Service:
        calls=[]
        async def repair(self,crop,local_mask):
            self.calls.append(crop.shape)
            result=crop.copy();result[local_mask>0]=10
            return result
    service=Service();output=await repair_comic_regions(service,image,mask,[item])
    assert len(service.calls)==2 and all(shape[0]<200 and shape[1]<200 for shape in service.calls)
    assert np.array_equal(output[mask==0],image[mask==0])
    assert np.all(output[mask>0]==10)


def test_edit_locked_region_can_only_be_unlocked_before_other_changes(tmp_path):
    image,_=source(tmp_path);repository=ComicRepository(tmp_path/'comics');book=repository.import_sources([str(image)],'Book')
    page=book['pages'][0];item={**region(),'editLocked':True}
    def edit(command):
        nonlocal book
        book=repository.edit({'projectId':book['id'],'operationId':str(uuid4()),'expectedRevision':book['revision'],'command':command})
    edit({'action':'saveRegion','pageId':page['id'],'region':item})
    saved=book['pages'][0]['regions'][0]
    with pytest.raises(ValueError,match='regionEditLocked'):
        edit({'action':'deleteRegion','pageId':page['id'],'regionId':item['id']})
    with pytest.raises(ValueError,match='regionEditLocked'):
        edit({'action':'saveRegion','pageId':page['id'],'region':{**saved,'x':100}})
    edit({'action':'saveRegion','pageId':page['id'],'region':{**saved,'editLocked':False}})
    edit({'action':'deleteRegion','pageId':page['id'],'regionId':item['id']})
    assert not book['pages'][0]['regions']


def test_horizontal_comic_wrap_keeps_closing_punctuation_with_preceding_text():
    from PIL import Image,ImageDraw,ImageFont
    from nola_translator_engine.backend.comic import wrap_comic_horizontal
    font=ImageFont.truetype(str(FONT),30);draw=ImageDraw.Draw(Image.new('RGB',(300,300)))
    lines=wrap_comic_horizontal(draw,'\u201c\u5feb\u770b\uff01\u6211\u8003\u4e0a\u548c\u54e5\u54e5\u4e00\u6837\u7684\u9ad8\u4e2d\u4e86\uff01\u201d',font,100)
    assert not any(line.startswith(('\uff01','\u201d')) for line in lines)


def test_mask_metadata_updates_and_drawing_layer_commands_persist_with_undo(tmp_path):
    image,pixels=source(tmp_path);repository=ComicRepository(tmp_path/'comics');book=repository.import_sources([str(image)],'Book');page_id=book['pages'][0]['id']
    def edit(command):
        nonlocal book
        book=repository.edit({'projectId':book['id'],'operationId':str(uuid4()),'expectedRevision':book['revision'],'command':command})
    stroke={'id':str(uuid4()),'name':'Mask','visible':False,'opacity':1,'mode':'erase','size':10,'points':[[70,70]]}
    edit({'action':'saveMask','pageId':page_id,'stroke':stroke})
    _,mask=repair_page(pixels,[],book['pages'][0]['maskStrokes'],mask_only=True)
    assert not mask.any()
    stroke['visible']=True;stroke['opacity']=0
    edit({'action':'saveMask','pageId':page_id,'stroke':stroke})
    _,mask=repair_page(pixels,[],book['pages'][0]['maskStrokes'],mask_only=True)
    assert not mask.any()
    layer={'id':str(uuid4()),'name':'Paint','visible':True,'locked':False,'opacity':.5,'strokes':[]}
    edit({'action':'saveDrawingLayer','pageId':page_id,'layer':layer})
    assert repository.open(book['id'])['pages'][0]['drawingLayers'][0]['name']=='Paint'
    edit({'action':'deleteDrawingLayer','pageId':page_id,'layerId':layer['id']})
    edit({'action':'deleteMask','pageId':page_id,'strokeId':stroke['id']})
    assert not book['pages'][0]['maskStrokes']


def test_region_opacity_blends_drawn_text_without_mutating_target():
    image=np.full((180,360,3),255,np.uint8);item=region('Visible text')
    opaque=render_page(image,[item],FONT);item['opacity']=.5
    faded=render_page(image,[item],FONT)
    assert np.all(faded>=opaque)
    assert not np.array_equal(faded,opaque)
    assert item['targetText']=='Visible text'


def test_repair_layers_roundtrip_visibility_and_transparent_layer_images(tmp_path):
    from nola_translator_engine.backend.comic import save_repair_layers
    image,pixels=source(tmp_path);service=ComicService(tmp_path/'comics',None,FONT);repository=service.repository
    book=repository.import_sources([str(image)],'Book');page=book['pages'][0];item=region('Text');page['regions']=[item]
    mask=np.zeros(pixels.shape[:2],np.uint8);mask[60:80,70:100]=255
    clean=pixels.copy();clean[mask>0]=255
    save_repair_layers(repository,page,clean,mask);page['cleanAsset']=repository.asset(encode_image(clean));page['hasClean']=True
    repository.publish_page(book['id'],book['revision'],page);book=repository.open(book['id']);layer=book['pages'][0]['repairLayers'][0]
    rgba=service.layer_rgba(book['pages'][0],'repair',layer['id'])
    assert rgba.shape[2]==4 and np.any(rgba[:,:,3]==0) and np.any(rgba[:,:,3]==255)
    edit={'projectId':book['id'],'operationId':str(uuid4()),'expectedRevision':book['revision'],'command':{'action':'setRepairLayer','pageId':page['id'],'layerId':layer['id'],'name':'Clean patch','visible':False,'opacity':.5}}
    book=repository.edit(edit)
    assert np.array_equal(decode_image(repository.asset_path(book['id'],page['id'],'clean').read_bytes()),pixels)
    archive=repository.export(book['id'],'project',None)
    imported=repository.import_sources([str(archive)],'Imported')
    imported_layer=imported['pages'][0]['repairLayers'][0]
    assert imported_layer['name']=='Clean patch' and imported_layer['visible'] is False
    assert service.layer_rgba(imported['pages'][0],'repair',imported_layer['id']).shape==rgba.shape
    text=service.layer_rgba(book['pages'][0],'text',item['id'])
    assert text.shape==(180,360,4) and np.any(text[:,:,3]>0) and np.any(text[:,:,3]==0)
    transparent=service.transparent_page(book['pages'][0])
    assert transparent.shape[2]==4 and np.any(transparent[:,:,3]==0)
    old_clean=book['pages'][0]['cleanAsset']
    book=repository.edit({'projectId':book['id'],'operationId':str(uuid4()),'expectedRevision':book['revision'],'command':{'action':'deleteRegion','pageId':page['id'],'regionId':item['id']}})
    assert book['pages'][0]['hasClean'] and book['pages'][0]['cleanAsset']==old_clean
    assert book['pages'][0]['repairLayers']


def test_jpeg_export_respects_requested_page_order_and_rejects_duplicates(tmp_path):
    from PIL import Image
    first=tmp_path/'red.png';second=tmp_path/'blue.png'
    first.write_bytes(encode_image(np.full((20,20,3),(0,0,255),np.uint8)))
    second.write_bytes(encode_image(np.full((20,20,3),(255,0,0),np.uint8)))
    repository=ComicRepository(tmp_path/'comics');book=repository.import_sources([str(first),str(second)],'Book');ids=[page['id'] for page in book['pages']]
    path=repository.export(book['id'],'jpg',ids[::-1],layer='source',quality=90)
    assert path.suffix=='.zip'
    with zipfile.ZipFile(path) as archive:
        rgb=np.asarray(Image.open(__import__('io').BytesIO(archive.read('0001.jpg'))))
        assert rgb[:,:,2].mean()>240 and rgb[:,:,0].mean()<10
    assert repository.export(book['id'],'jpg',[ids[0]],layer='source').suffix=='.jpg'
    selected=repository.export(book['id'],'project',[ids[0]])
    with zipfile.ZipFile(selected) as archive:
        manifest=__import__('json').loads(archive.read('project.json'))['project']
        assert manifest['pageCount']==1 and [page['id'] for page in manifest['pages']]==[ids[0]]
        excluded=book['pages'][1]
        assert f"assets/{excluded['sourceAsset']}.png" not in archive.namelist()
        assert f"originals/{excluded['originalAsset']}.original" not in archive.namelist()
    with pytest.raises(ValueError,match='pageNotFound'):
        repository.export(book['id'],'jpg',[ids[0],ids[0]],layer='source')


def test_segmentation_detector_mask_is_used_inside_text_boundary():
    image=np.full((180,360,3),255,np.uint8);item=region('Text')
    predicted=np.zeros(image.shape[:2],np.uint8);predicted[60:90,80:95]=255
    _,mask=repair_page(image,[item],mask_only=True,detector_mask=predicted)
    assert np.all(mask[60:90,80:95]>0)
    assert not mask[0,0]


def test_manually_moved_rotated_text_uses_layout_box_instead_of_original_source():
    image=np.full((500,600,3),255,np.uint8)
    item=region('Moved')
    item.update(x=350,y=300,width=150,height=80,manuallyEdited=True,
        sourceQuad=[[40,40],[190,40],[190,120],[40,120]],sourceLines=[[[40,40],[190,40],[190,120],[40,120]]])
    item['style'].update(angle=-25,autoFontSize=False)
    output=render_page(image,[item],FONT)
    ys,xs=np.where(np.any(output!=image,axis=2))
    assert xs.min()>300 and ys.min()>250
    assert np.array_equal(output[:150,:220],image[:150,:220])


def test_single_detected_bubble_merges_fragments_before_ocr_and_layout():
    from nola_translator_engine.backend.comic import apply_comic_bubbles
    first={**region(None),'sourceText':'','sourceQuad':[[150,50],[200,50],[200,250],[150,250]],'sourceLines':[[[150,50],[200,50],[200,250],[150,250]]]}
    second={**region(None),'sourceText':'','sourceQuad':[[70,60],[120,60],[120,180],[70,180]],'sourceLines':[[[70,60],[120,60],[120,180],[70,180]]]}
    regions=[first,second]
    apply_comic_bubbles(regions,[[[30,20],[250,20],[250,300],[30,300]]],'zh')
    assert len(regions)==1 and len(regions[0]['sourceLines'])==2
    assert regions[0]['kind']=='dialogue' and regions[0]['style']['direction']=='vertical-rl'
    apply_comic_bubbles(regions,[[[30,20],[250,20],[250,300],[30,300]]],'en')
    assert regions[0]['style']['direction']=='horizontal'


@pytest.mark.asyncio
async def test_cancel_waiting_for_ocr_lease_does_not_release_another_jobs_lock(tmp_path):
    image,_=source(tmp_path)
    class Ocr:
        def __init__(self):
            self.lease=asyncio.Lock();self._loaded=True;self.released=False
        def variant(self,_):
            return self
        async def release(self):
            self.released=True
    ocr=Ocr();await ocr.lease.acquire()
    service=ComicService(tmp_path/'comics',ocr,FONT);book=service.repository.import_sources([str(image)],'Book');page=book['pages'][0]
    item={**region(None),'sourceText':'','locked':False}
    book=service.repository.edit({'projectId':book['id'],'operationId':str(uuid4()),'expectedRevision':book['revision'],'command':{'action':'saveRegion','pageId':page['id'],'region':item}})
    request=RunRequest(expectedRevision=book['revision'],pageIds=[page['id']],stage='ocr',model='')
    service.run(book['id'],request,None,{})
    task=service.tasks[str(request.jobId)]
    await asyncio.sleep(.02);task.cancel();await task
    assert ocr.lease.locked() and not ocr.released
    assert service.repository.open(book['id'])['jobs'][0]['state']=='cancelled'
    ocr.lease.release()


def test_render_metrics_report_actual_fitted_size_and_display_text_only():
    image=np.full((500,500,3),255,np.uint8);item=region('A fitted paragraph')
    item.update(x=50,y=50,width=350,height=350)
    item['style']['fontSize']=200;item['style']['autoFontSize']=True
    metrics={};render_page(image,[item],FONT,metrics=metrics)
    assert 6<=metrics[item['id']]['fontSize']<200
    assert metrics[item['id']]['text']==item['targetText']
    assert item['style']['fontSize']==200


def test_drawing_layer_fill_samples_actual_source_and_preceding_layers(tmp_path):
    pixels=np.full((80,120,3),255,np.uint8);pixels[:,60:63]=0
    path=tmp_path/'source.png';path.write_bytes(encode_image(pixels))
    service=ComicService(tmp_path/'comics',None,FONT);book=service.repository.import_sources([str(path)],'Book');page=book['pages'][0]
    lower={'id':str(uuid4()),'name':'Barrier','visible':True,'locked':False,'opacity':1,'strokes':[{'id':str(uuid4()),'mode':'brush','color':'#0000ff','size':6,'points':[[30,0],[30,79]]}]}
    upper={'id':str(uuid4()),'name':'Fill','visible':True,'locked':False,'opacity':.4,'strokes':[{'id':str(uuid4()),'mode':'fill','color':'#ff0000','size':1,'points':[[10,30]]}]}
    page['drawingLayers']=[lower,upper]
    rgba=service.layer_rgba(page,'drawing',upper['id'])
    assert np.array_equal(rgba[30,10],[0,0,255,255])
    assert rgba[30,45,3]==0 and rgba[30,90,3]==0
    page['backgroundVisible']=False
    transparent=service.layer_rgba(page,'drawing',upper['id'])
    assert transparent[30,10,3]==255 and transparent[30,45,3]==0


@pytest.mark.asyncio
async def test_selection_repair_appends_patch_without_mt_and_erase_area_is_undoable(tmp_path):
    from nola_translator_engine.backend.comic import append_repair_layer,composite_repair_layers
    from nola_translator_engine.backend.comic_selection import selection_mask
    image,pixels=source(tmp_path);service=ComicService(tmp_path/'comics',None,FONT);repo=service.repository
    book=repo.import_sources([str(image)],'Book');page=book['pages'][0]
    page['regions']=[{**region(None),'locked':False}]
    prior=pixels.copy();prior[10:20,10:20]=(255,0,0);prior_mask=np.zeros(pixels.shape[:2],np.uint8);prior_mask[10:20,10:20]=255
    append_repair_layer(repo,page,prior,prior_mask,'Existing');page['repairLayers'][0]['opacity']=.5
    page['cleanAsset']=repo.asset(encode_image(composite_repair_layers(repo,page)));page['hasClean']=True
    repo.publish_page(book['id'],book['revision'],page);book=repo.open(book['id'])
    book=repo.edit({'projectId':book['id'],'operationId':str(uuid4()),'expectedRevision':book['revision'],'command':{'action':'configure','config':{**book['config'],'repairMethod':'telea'}}})
    before=composite_repair_layers(repo,book['pages'][0]);old_layer=dict(book['pages'][0]['repairLayers'][0])
    polygon=[[45,35],[215,35],[215,120],[45,120]]
    request=RunRequest(expectedRevision=book['revision'],pageIds=[page['id']],stage='repair',model='',selection=polygon)
    service.run(book['id'],request,None,{});await asyncio.gather(*service.tasks.values());book=repo.open(book['id']);result=book['pages'][0]
    assert book['jobs'][0]['state']=='completed' and len(result['repairLayers'])==2
    assert result['repairLayers'][0]==old_layer
    clean=decode_image(repo.asset_path(book['id'],page['id'],'clean').read_bytes());mask=selection_mask(polygon,page['width'],page['height'])
    assert np.array_equal(clean[mask==0],before[mask==0]) and np.any(clean[mask>0]!=before[mask>0])
    erased=repo.edit({'projectId':book['id'],'operationId':str(uuid4()),'expectedRevision':book['revision'],'command':{'action':'eraseRepairArea','pageId':page['id'],'polygon':polygon}})
    restored=decode_image(repo.asset_path(book['id'],page['id'],'clean').read_bytes())
    assert np.array_equal(restored[mask>0],pixels[mask>0])
    undone=repo.edit({'projectId':book['id'],'operationId':str(uuid4()),'expectedRevision':erased['revision'],'command':{'action':'undo'}})
    assert np.array_equal(decode_image(repo.asset_path(book['id'],page['id'],'clean').read_bytes()),clean)
    assert undone['pages'][0]['sourceAsset']==result['sourceAsset']


def test_polygon_mask_strokes_keep_holes_and_restore_subtracts_only_selection():
    image=np.full((180,360,3),255,np.uint8)
    polygon=[{'op':'add','points':[[20,20],[120,20],[120,120],[20,120]]},
             {'op':'subtract','points':[[50,50],[90,50],[90,90],[50,90]]}]
    stroke={'id':str(uuid4()),'mode':'erase','size':5,'points':[[20,20]],'polygon':polygon}
    restore={'id':str(uuid4()),'mode':'restore','size':5,'points':[[20,20]],'polygon':[[20,20],[40,20],[40,40],[20,40]]}
    _,mask=repair_page(image,[],[stroke,restore],mask_only=True)
    assert mask[30,30]==0 and mask[60,60]==0 and mask[100,100]==255


def test_refinement_keeps_adjacent_english_paragraphs_inside_detector_blocks():
    from nola_translator_engine.backend.comic import refine_detected_text_blocks
    image=np.full((500,600,3),255,np.uint8)
    def quad(x,y,w,h):
        return np.asarray([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],np.float32)
    lines=[quad(50,50,120,40),quad(50,110,120,40),quad(210,50,130,40),quad(210,110,130,40)]
    blocks=[quad(40,40,140,140),quad(200,40,150,140)]
    regions=refine_detected_text_blocks(image,lines,blocks,'ltr')
    assert len(regions)==2 and all(len(region['sourceLines'])==2 for region in regions)
    assert regions[0]['x']+regions[0]['width']<regions[1]['x']
    assert all(region['style']['direction']=='horizontal' for region in regions)


@pytest.mark.asyncio
async def test_manual_mask_opacity_uses_binary_inference_then_fractional_patch_blending(tmp_path):
    from nola_translator_engine.backend.comic import repair_comic_regions,save_repair_layers,composite_repair_layers
    image=np.full((180,360,3),255,np.uint8);path=tmp_path/'source.png';path.write_bytes(encode_image(image))
    repository=ComicRepository(tmp_path/'comics');book=repository.import_sources([str(path)],'Book');page=book['pages'][0]
    stroke={'id':str(uuid4()),'mode':'erase','size':10,'points':[[100,80]],'opacity':.25}
    _,coverage=repair_page(image,[],[stroke],mask_only=True)
    assert coverage[80,100]==64
    class Model:
        async def repair(self,crop,mask):
            assert set(np.unique(mask)) <= {0,255}
            assert np.any(mask==255)
            output=crop.copy();output[mask>0]=0
            return output
    predicted=await repair_comic_regions(Model(),image,coverage,[])
    save_repair_layers(repository,page,predicted,coverage)
    result=composite_repair_layers(repository,page)
    assert np.all(result[80,100]==191)
    assert np.array_equal(result[coverage==0],image[coverage==0])
    restore={**stroke,'id':str(uuid4()),'mode':'restore','opacity':.5}
    _,reduced=repair_page(image,[],[stroke,restore],mask_only=True)
    assert reduced[80,100]==32


def test_rt_paragraph_does_not_collapse_to_one_low_coverage_false_vertical_line():
    from nola_translator_engine.backend.comic import refine_detected_text_blocks
    image=np.full((600,800,3),255,np.uint8)
    block=np.asarray([[100,100],[650,100],[650,550],[100,550]],np.float32)
    fragment=np.asarray([[320,120],[460,120],[460,530],[320,530]],np.float32)
    result=refine_detected_text_blocks(image,[fragment],[block],'ltr')
    assert len(result)==1 and 'sourceLines' not in result[0]
    assert result[0]['sourceQuad']==block.tolist()
    assert result[0]['style']['direction']=='horizontal'


def test_configured_execution_providers_choose_independent_device_instances_and_onnx_repair():
    from types import SimpleNamespace
    from nola_translator_engine.backend.comic import comic_model_variant,comic_ppocr_service,comic_inpaint_resource
    calls=[]
    owner=SimpleNamespace(variant=lambda resource:calls.append(('cpu',resource)) or 'cpu',
        device_variant=lambda resource,provider:calls.append((provider,resource)) or provider)
    assert comic_model_variant(owner,'detector','detector',{})=='cpu'
    assert comic_model_variant(owner,'detector','detector',{'executionProviders':{'detector':'cuda'}})=='cuda'
    assert comic_ppocr_service(owner,'explicit-pp','en','dml')=='dml'
    assert calls==[('cpu','detector'),('cuda','detector'),('dml','explicit-pp')]
    assert comic_inpaint_resource({'repairMethod':'lama-manga','executionProviders':{'repair':'cuda'}},owner)=='comic-lama-manga-onnx'
    assert comic_inpaint_resource({'repairMethod':'lama'},owner)=='comic-lama-onnx'


@pytest.mark.asyncio
async def test_runtime_purge_preserves_live_pp_and_blocks_new_jobs_while_releasing_idle_models(tmp_path,monkeypatch):
    from types import SimpleNamespace
    from nola_translator_engine.backend import screen_ocr
    monkeypatch.setattr(screen_ocr,'comic_execution_providers',lambda:['cpu'])
    monkeypatch.setattr(screen_ocr,'comic_gpu_memory',lambda:{'gpuMemoryUsed':None,'gpuMemoryTotal':None})
    started=asyncio.Event();finish=asyncio.Event()
    class Runtime:
        def __init__(self,identifier,pause=False):
            self.spec=SimpleNamespace(model_id=identifier);self._loaded=True;self.execution_provider='cpu'
            self.lease=asyncio.Lock();self._lock=asyncio.Lock();self._variants={};self._device_variants={};self._sessions={'cached':object()};self.pause=pause;self.release_count=0
        async def release(self):
            self.release_count+=1
            if self.pause:
                started.set();await finish.wait()
            self._loaded=False;self._sessions.clear()
    pp=Runtime('pp-ocrv5-mobile-ch-onnx')
    service=ComicService(tmp_path/'comics',pp,FONT)
    with pytest.raises(ValueError,match='resourceBusy'):
        await service.purge_runtime()
    assert pp._loaded and pp.release_count==0 and not service._purging
    pp._loaded=False
    child=Runtime('manga-ocr-onnx',True);pp._variants['child']=child;pp._device_variants[('child','cpu')]=child
    assert len(service.runtime_status()['activeModels'])==1
    await child.lease.acquire()
    with pytest.raises(ValueError,match='resourceBusy'):
        await service.purge_runtime()
    assert child.release_count==0
    child.lease.release()
    purge=asyncio.create_task(service.purge_runtime());await started.wait()
    assert child.lease.locked()
    with pytest.raises(ValueError,match='resourceBusy'):
        service.run('unused',RunRequest(expectedRevision=0,pageIds=[str(uuid4())],stage='ocr',model=''),None,{})
    finish.set();result=await purge
    assert result['activeModels']==[] and not child._loaded and child.release_count==1
    assert not child.lease.locked() and not service._purging and not pp._sessions


def test_delete_repair_layer_keeps_immutable_asset_and_undo_restores_layer(tmp_path):
    from nola_translator_engine.backend.comic import append_repair_layer,composite_repair_layers
    image,pixels=source(tmp_path);repo=ComicRepository(tmp_path/'comics');book=repo.import_sources([str(image)],'Book');page=book['pages'][0]
    mask=np.zeros(pixels.shape[:2],np.uint8);mask[50:80,60:100]=255;clean=pixels.copy();clean[mask>0]=255
    append_repair_layer(repo,page,clean,mask,'Repair');page['cleanAsset']=repo.asset(encode_image(composite_repair_layers(repo,page)));page['hasClean']=True
    repo.publish_page(book['id'],book['revision'],page);book=repo.open(book['id']);layer=book['pages'][0]['repairLayers'][0];asset=repo.repair_layer_path(book['pages'][0],layer['id'])
    old=book['pages'][0]['cleanAsset']
    book=repo.edit({'projectId':book['id'],'operationId':str(uuid4()),'expectedRevision':book['revision'],'command':{'action':'deleteRepairLayer','pageId':page['id'],'layerId':layer['id']}})
    assert not book['pages'][0]['repairLayers'] and not book['pages'][0]['repairAssets'] and asset.is_file()
    assert np.array_equal(decode_image(repo.asset_path(book['id'],page['id'],'clean').read_bytes()),pixels)
    book=repo.edit({'projectId':book['id'],'operationId':str(uuid4()),'expectedRevision':book['revision'],'command':{'action':'undo'}})
    assert book['pages'][0]['repairLayers'][0]['id']==layer['id'] and book['pages'][0]['cleanAsset']==old
