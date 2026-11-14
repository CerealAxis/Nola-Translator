import asyncio
import threading
import time
from pathlib import Path
from uuid import uuid4

import cv2
import httpx
import numpy as np
import pytest
from fastapi import FastAPI

from nola_translator_engine.backend.comic import ComicService, build_comic_router, encode_image

FONT = Path(__file__).parents[3] / 'src/renderer/assets/fonts/NotoSansCJK-SC-VF.otf'


def setup_preview(tmp_path):
    source = tmp_path / 'source.png'
    source.write_bytes(encode_image(np.full((400, 800, 3), 240, np.uint8)))
    service = ComicService(tmp_path / 'books', None, FONT)
    project = service.repository.import_sources([str(source)], 'Preview')
    page = project['pages'][0]
    app = FastAPI()
    app.include_router(build_comic_router(service))
    return service, project, page, httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test')


@pytest.mark.asyncio
async def test_bounded_page_and_layer_previews_preserve_rgba_and_original_assets(tmp_path, monkeypatch):
    service, project, page, client = setup_preview(tmp_path)
    prefix = f"/comics/projects/{project['id']}/pages/{page['id']}"
    patch = np.full((400, 800, 4), (10, 40, 190, 96), np.uint8)
    monkeypatch.setattr(service, 'layer_rgba', lambda *args: patch.copy())
    monkeypatch.setattr(service, 'transparent_page', lambda *args: patch.copy())
    source_path = service.repository.asset_path(project['id'], page['id'], 'source')
    original = source_path.read_bytes()
    page['backgroundVisible'] = False
    service.repository.publish_page(project['id'], project['revision'], page)
    async with client:
        for suffix in ('source', 'clean', f'layers/repair/{uuid4()}'):
            response = await client.get(f'{prefix}/{suffix}?max_pixels=10000')
            assert response.status_code == 200
            pixels = cv2.imdecode(np.frombuffer(response.content, np.uint8), cv2.IMREAD_UNCHANGED)
            assert pixels.shape[0] * pixels.shape[1] <= 10000
            assert int(response.headers['x-image-width']) == pixels.shape[1]
            if suffix != 'source':
                assert pixels.shape[2] == 4
                assert np.all(pixels[:, :, 3] == 96)
            original_response = await client.get(f'{prefix}/{suffix}')
            natural = cv2.imdecode(np.frombuffer(original_response.content, np.uint8), cv2.IMREAD_UNCHANGED)
            assert natural.shape[:2] == (400, 800)
        assert source_path.read_bytes() == original
        assert service.repository.open(project['id'])['pages'][0]['sourceAsset'] == page['sourceAsset']


@pytest.mark.asyncio
async def test_preview_query_rejects_invalid_noninteger_or_out_of_range_limits(tmp_path):
    _, project, page, client = setup_preview(tmp_path)
    prefix = f"/comics/projects/{project['id']}/pages/{page['id']}"
    async with client:
        for suffix in ('source', f'layers/text/{uuid4()}'):
            for value in ('9999', '4000001', '10000.0', '10000.5', 'NaN', 'true', '-10000', '9' * 5000):
                assert (await client.get(f'{prefix}/{suffix}', params={'max_pixels': value})).status_code == 422


@pytest.mark.asyncio
async def test_image_and_layer_previews_share_two_processing_slots(tmp_path, monkeypatch):
    import nola_translator_engine.backend.comic as comic
    service, project, page, client = setup_preview(tmp_path)
    prefix = f"/comics/projects/{project['id']}/pages/{page['id']}"
    lock = threading.Lock()
    active = maximum = calls = 0
    original_encode = comic.encode_image

    def tracked_encode(image):
        nonlocal active, maximum, calls
        with lock:
            active += 1
            maximum = max(maximum, active)
            calls += 1
        try:
            time.sleep(.02)
            return original_encode(image)
        finally:
            with lock:
                active -= 1

    monkeypatch.setattr(comic, 'encode_image', tracked_encode)
    monkeypatch.setattr(service, 'layer_rgba', lambda *args: np.zeros((400, 800, 4), np.uint8))
    async with client:
        responses = await asyncio.gather(*(client.get(f"{prefix}/{suffix}?max_pixels=10000")
            for suffix in ['source', f'layers/text/{uuid4()}'] * 4))
    assert all(response.status_code == 200 for response in responses)
    assert calls == 8
    assert maximum == 2
