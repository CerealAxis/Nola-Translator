"""Neural inpainting contract checks; real-weight smoke is opt-in via installed assets."""
import asyncio
from pathlib import Path

import numpy as np
import pytest

from nola_translator_engine.backend.comic_inpaint import ComicInpainter, inpaint_with_model
from nola_translator_engine.models.inpaint_catalog import LAMA_MANGA


def test_missing_weights_never_download(tmp_path, monkeypatch):
    service = ComicInpainter(tmp_path)
    monkeypatch.setattr(service.models, "ensure", lambda *a, **kw: pytest.fail("hidden download"))
    with pytest.raises(ValueError, match="modelMissing"):
        asyncio.run(service.load())
    assert not service._loaded


def test_mask_compositing_and_odd_size():
    torch = pytest.importorskip("torch")
    class Recorder(torch.nn.Module):
        def forward(self, image, mask):
            assert image.shape[-2:] == (24, 32)
            assert image[mask.expand_as(image).bool()].count_nonzero() == 0
            return torch.ones_like(image)
    source = np.full((17, 25, 3), 61, np.uint8)
    mask = np.zeros((17, 25), np.uint8)
    mask[3:9, 4:10] = 255
    result = inpaint_with_model(Recorder(), "cpu", source, mask)
    assert np.array_equal(result[mask == 0], source[mask == 0])
    assert np.all(result[mask > 0] == 255)
    with pytest.raises(ValueError, match="invalidImage"):
        inpaint_with_model(Recorder(), "cpu", source, mask[:4])


def test_catalog_is_immutable_and_verified():
    assert len(LAMA_MANGA.revision) == 40
    assert LAMA_MANGA.files[0].size == 204332996
    assert len(LAMA_MANGA.files[0].sha256) == 64


def test_real_installed_model_worker():
    import os
    root = os.environ.get("NOLA_TEST_INPAINT_MODEL_ROOT")
    if not root:
        pytest.skip("set NOLA_TEST_INPAINT_MODEL_ROOT for real installed weights")
    async def check():
        service = ComicInpainter(Path(root))
        await service.load()
        pid = service._process.pid
        image = np.full((17, 25, 3), 230, np.uint8)
        image[5:10, 6:13] = 0
        mask = np.zeros((17, 25), np.uint8)
        mask[4:11, 5:14] = 255
        try:
            for _ in range(2):
                result = await service.repair(image, mask)
                assert service._process.pid == pid
                assert np.array_equal(result[mask == 0], image[mask == 0])
                assert np.any(result[mask > 0] != image[mask > 0])
        finally:
            await service.release()
        assert service._process is None and not service._loaded
    asyncio.run(check())


def test_loading_ocr_preserves_active_inpaint_lease(tmp_path, monkeypatch):
    from types import SimpleNamespace
    from nola_translator_engine.backend.screen_ocr import ScreenOcr, build_screen_ocr_router
    service = ScreenOcr(tmp_path)
    async def loaded():
        return {"loaded": True}
    async def unexpected_release():
        pytest.fail("OCR model switching interrupted comic inpainting")
    monkeypatch.setattr(service, "load", loaded)
    service._variants["lama-manga"] = SimpleNamespace(
        spec=LAMA_MANGA, _loaded=True, release=unexpected_release)
    route = next(route for route in build_screen_ocr_router(service).routes if route.path.endswith("/load"))
    assert asyncio.run(route.endpoint(resource_id=service.spec.model_id)) == {"loaded": True}


def test_inpaint_resource_has_no_translation_configuration(tmp_path):
    from nola_translator_engine.resources import ResourceManager
    record = ResourceManager(tmp_path, lambda _: None).record("lama-manga")
    assert record.kind == "inpaintModel"
    assert record.configuration is None
