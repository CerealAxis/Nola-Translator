from pathlib import Path
from uuid import uuid4
import asyncio
import json
import zipfile

import cv2
import numpy as np
import pytest

from nola_translator_engine.backend.comic import ComicRepository, ComicService, RunRequest, encode_image, repair_page, render_page, detect_comic_regions
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
