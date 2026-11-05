"""Screen OCR contracts, real image operators, bounded scheduling and resource lifecycle."""

import asyncio
import base64
from dataclasses import replace
from hashlib import sha256
from types import SimpleNamespace
import threading
import json
import os
import subprocess
import sys

import numpy as np
import pytest
from fastapi.testclient import TestClient

from nola_translator_engine.backend.app import create_app
from nola_translator_engine.backend import screen_ocr
from nola_translator_engine.models.manager import FileEntry, ModelManager
from nola_translator_engine.models.ocr_catalog import OCR_RESOURCE_ID, PP_OCRV5_MOBILE
from nola_translator_engine.resources import ResourceActionError, ResourceManager


@pytest.fixture
def tiny_spec(monkeypatch):
    files = tuple(FileEntry(entry.path, 5, sha256(b"model").hexdigest()) for entry in PP_OCRV5_MOBILE.files)
    spec = replace(PP_OCRV5_MOBILE, files=files, modelscope_files=files)
    monkeypatch.setattr(screen_ocr, "PP_OCRV5_MOBILE", spec)
    return spec


def install_files(root, spec):
    directory = root / spec.directory
    for entry in spec.files:
        target = directory / entry.path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(b"model")
    return directory


def image_url():
    import cv2

    image = np.full((64, 128, 3), 255, dtype=np.uint8)
    cv2.putText(image, "AB", (15, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 0), 2)
    success, encoded = cv2.imencode(".png", image)
    assert success
    return "data:image/png;base64," + base64.b64encode(encoded).decode()


def test_ctc_keeps_repeated_characters_separated_by_blank():
    # A,A,blank,A,B,B must decode to AAB, not AB or AAABB.
    prediction = np.eye(4, dtype=np.float32)[[1, 1, 0, 1, 2, 2]][None]
    assert screen_ocr.ctc_decode(prediction, ["", "A", "B", " "]) == ("AAB", 1.0)
    with pytest.raises(ValueError, match="modelCorrupt"):
        screen_ocr.ctc_decode(prediction, [""])


def test_auto_language_does_not_choose_confident_digits_over_a_full_sentence():
    candidates = [("123", 0.997), ("화면 번역 테스트 가격 123", 0.974)]
    assert max(candidates, key=screen_ocr.recognition_quality) == candidates[1]


def test_cross_process_progress_query_never_signals_the_backend(tmp_path):
    process = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(5)"],
                               creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
    try:
        (tmp_path / screen_ocr.STATE_FILE).write_text(json.dumps({"pid": process.pid, "state": "running", "progress": 0.5}), encoding="utf-8")
        assert screen_ocr.read_ocr_state(tmp_path) == {"state": "running", "progress": 0.5}
        assert process.poll() is None
    finally:
        process.terminate()
        process.wait(timeout=3)
    assert screen_ocr.read_ocr_state(tmp_path) == {}


def test_image_decoder_rejects_unbounded_or_non_png_input():
    png = image_url()
    image = screen_ocr.decode_image(png)
    assert image.shape == (64, 128, 3)
    with pytest.raises(ValueError, match="invalidImage"):
        screen_ocr.decode_image("data:image/png;base64,not valid")
    raw = bytearray(base64.b64decode(png.split(",")[1]))
    raw[16:20] = (20_000).to_bytes(4, "big")
    with pytest.raises(ValueError, match="imageTooLarge"):
        screen_ocr.decode_image("data:image/png;base64," + base64.b64encode(raw).decode())


def test_detector_maps_rotated_quad_to_original_capture_pixels():
    import cv2

    probability = np.zeros((64, 128), dtype=np.float32)
    polygon = cv2.boxPoints(((60, 30), (50, 12), 20)).astype(np.int32)
    cv2.fillPoly(probability, [polygon], 0.9)
    quads = screen_ocr.detected_quads(probability, 256, 128)
    assert len(quads) == 1
    quad = quads[0]
    assert quad.shape == (4, 2)
    assert np.allclose(quad.mean(axis=0), [120, 60], atol=4)
    assert abs(quad[1, 1] - quad[0, 1]) > 5
    assert np.all((quad[:, 0] >= 0) & (quad[:, 0] <= 255))


async def test_real_preprocessing_detection_crop_and_ctc_without_model_download(tmp_path, tiny_spec, monkeypatch):
    install_files(tmp_path, tiny_spec)
    service = screen_ocr.ScreenOcr(tmp_path)
    created = []

    class Session:
        def __init__(self, path):
            self.detector = "_det_" in str(path)
            created.append(str(path))

        def get_inputs(self):
            return [SimpleNamespace(name="image", shape=[None, 3, 48, None])]

        def get_modelmeta(self):
            return SimpleNamespace(custom_metadata_map={"character": "A\nB"})

        def run(self, names, inputs):
            assert inputs["image"].dtype == np.float32
            if self.detector:
                result = np.zeros((1, 1, 64, 128), dtype=np.float32)
                result[:, :, 15:45, 12:90] = 0.95
                return [result]
            return [np.eye(4, dtype=np.float32)[[1, 1, 0, 2, 2]][None]]

    import onnxruntime

    monkeypatch.setattr(onnxruntime, "InferenceSession", lambda path, *args, **kwargs: Session(path))
    request = screen_ocr.OcrRequest(image=image_url(), language="ja")
    await service.load()
    result = await service.infer(request)
    assert result["width"] == 128 and result["height"] == 64
    assert result["blocks"][0]["text"] == "AB"
    assert result["blocks"][0]["confidence"] == 1
    await service.infer(request)
    assert len(created) == 3
    await service.infer(request.model_copy(update={"language": "ko"}))
    assert len(created) == 3
    assert any("korean" in path for path in created)
    with pytest.raises(ValueError, match="resourceBusy"):
        await service.remove()
    with pytest.raises(ValueError, match="resourceBusy"):
        await service.install()
    await service.release()
    assert not service._sessions
    with pytest.raises(ValueError, match="modelNotLoaded"):
        await service.infer(request)


async def test_install_uses_existing_verified_atomic_manager_and_cancel(tmp_path, tiny_spec):
    started = threading.Event()
    finish = threading.Event()

    def fetch(url, path, progress):
        assert "modelscope.cn" in url and tiny_spec.revision in url
        started.set()
        assert finish.wait(3)
        progress(1, 5)
        path.write_bytes(b"model")
        progress(5, 5)

    manager = ModelManager(tmp_path, fetcher=fetch)
    service = screen_ocr.ScreenOcr(tmp_path, manager)
    status = await service.install()
    assert status["state"] == "running"
    assert status["resource"]["kind"] == "ocrModel"
    assert await asyncio.to_thread(started.wait, 3)
    cancel = asyncio.create_task(service.cancel_install())
    await asyncio.sleep(0)
    finish.set()
    assert (await cancel)["installed"] is False
    assert not list(tmp_path.glob(".pp-ocrv5-*"))
    await service.install()
    await service._install
    assert service.status()["installed"] is True
    await service.remove()
    assert service.status()["installed"] is False


async def test_same_size_corruption_is_detected_and_repaired(tmp_path, tiny_spec):
    directory = install_files(tmp_path, tiny_spec)
    service = screen_ocr.ScreenOcr(tmp_path, ModelManager(tmp_path, fetcher=lambda url, path, progress: path.write_bytes(b"model")))
    assert service.status()["installed"] is True
    (directory / tiny_spec.files[0].path).write_bytes(b"wrong")
    assert service.status()["error"] == "modelCorrupt"
    await service.install()
    await service._install
    assert service.status()["installed"] is True


async def test_inference_rejects_parallel_work_and_shutdown_waits(tmp_path, tiny_spec, monkeypatch):
    service = screen_ocr.ScreenOcr(tmp_path)
    started = threading.Event()
    finish = threading.Event()

    def infer(request):
        started.set()
        assert finish.wait(3)
        return {"blocks": [], "width": 1, "height": 1}

    service._loaded = True
    monkeypatch.setattr(service, "_infer", infer)
    task = asyncio.create_task(service.infer(screen_ocr.OcrRequest(image=image_url())))
    assert await asyncio.to_thread(started.wait, 3)
    with pytest.raises(ValueError, match="resourceBusy"):
        await service.infer(screen_ocr.OcrRequest(image=image_url()))
    task.cancel()
    closing = asyncio.create_task(service.close())
    await asyncio.sleep(0)
    assert not closing.done()
    finish.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    await closing


def test_private_api_auth_validation_and_missing_model(tmp_path, tiny_spec):
    service = screen_ocr.ScreenOcr(tmp_path)
    with TestClient(create_app(control_token="screen-test", screen_ocr=service)) as client:
        assert client.get("/api/v2/screen/ocr").status_code == 401
        client.headers["Authorization"] = "Bearer screen-test"
        status = client.get("/api/v2/screen/ocr").json()
        assert status["installed"] is False
        assert status["resource"]["resourceId"] == OCR_RESOURCE_ID
        assert client.post("/api/v2/screen/ocr", json={"image": image_url(), "language": "fr"}).status_code == 422
        missing = client.post("/api/v2/screen/ocr", json={"image": image_url()})
        assert missing.status_code == 422 and missing.json()["detail"] == "modelNotLoaded"
        assert client.post("/api/v2/screen/ocr/load").json()["detail"] == "modelMissing"
        assert client.post("/api/v2/screen/ocr/release").status_code == 200
    assert service._closed


async def test_ocr_resource_list_does_not_advertise_speech_configuration(tmp_path):
    resources = ResourceManager(tmp_path, lambda event: None)
    record = resources.record(OCR_RESOURCE_ID)
    assert record.kind == "ocrModel" and record.configuration is None
    assert record.downloadBytes == 34_939_630
    with pytest.raises(ResourceActionError, match="invalidConfiguration"):
        await resources.manage(OCR_RESOURCE_ID, "install")


def test_multilingual_catalog_has_independently_verified_language_packs():
    from nola_translator_engine.models.ocr_catalog import OCR_SPECS, OCR_LANGUAGES, OCR_VARIANTS

    assert len(OCR_VARIANTS) == 12
    assert {"fr", "de", "es"} <= set(OCR_LANGUAGES["pp-ocrv5-mobile-latin-onnx"])
    assert {"ar", "fa", "ur"} <= set(OCR_LANGUAGES["pp-ocrv5-mobile-arabic-onnx"])
    assert {"hi", "mr", "ne"} <= set(OCR_LANGUAGES["pp-ocrv5-mobile-devanagari-onnx"])
    for spec in OCR_VARIANTS:
        assert len(spec.files) == 2
        assert spec.files[0].path == screen_ocr.OCR_DETECTOR
        assert spec.total_bytes < 22_000_000
        assert all(len(entry.sha256) == 64 for entry in spec.files)
        assert spec.model_id in OCR_SPECS


async def test_language_pack_uses_its_own_weights_and_rejects_unsupported_languages(tmp_path, monkeypatch):
    from nola_translator_engine.models.ocr_catalog import OCR_SPECS

    original = OCR_SPECS["pp-ocrv5-mobile-latin-onnx"]
    spec = replace(original, files=tuple(FileEntry(entry.path, 5, sha256(b"model").hexdigest()) for entry in original.files))
    install_files(tmp_path, spec)
    service = screen_ocr.ScreenOcr(tmp_path, spec=spec)
    loaded = []
    monkeypatch.setattr(service, "_session", lambda path: loaded.append(path.name) or SimpleNamespace(get_modelmeta=lambda: SimpleNamespace(custom_metadata_map={"character": "A"})))
    await service.load()
    assert loaded == [screen_ocr.OCR_DETECTOR, "latin_PP-OCRv5_rec_mobile.onnx"]
    assert "fr" in service.status()["languages"]
    assert service.status()["resource"]["resourceId"] == spec.model_id
    monkeypatch.setattr(service, "_infer", lambda request: {"blocks": [], "width": 1, "height": 1})
    assert (await service.infer(screen_ocr.OcrRequest(image=image_url(), language="fr")))["width"] == 1
    with pytest.raises(ValueError, match="unsupportedLanguage"):
        await service.infer(screen_ocr.OcrRequest(image=image_url(), language="ko"))
    await service.release()
    assert not service._loaded


def test_variant_private_api_validates_model_ids_and_reports_language_capabilities(tmp_path):
    service = screen_ocr.ScreenOcr(tmp_path)
    with TestClient(create_app(control_token="test", screen_ocr=service)) as client:
        client.headers["Authorization"] = "Bearer test"
        status = client.get("/api/v2/screen/ocr", params={"resource_id": "pp-ocrv5-mobile-latin-onnx"}).json()
        assert status["resource"]["resourceId"] == "pp-ocrv5-mobile-latin-onnx"
        assert "fr" in status["languages"] and not status["installed"]
        invalid = client.get("/api/v2/screen/ocr", params={"resource_id": "../../outside"})
        assert invalid.status_code == 422
    assert all(variant._closed for variant in service._variants.values())


def test_arabic_decoder_retains_number_and_latin_order():
    assert screen_ocr.arabic_logical_order("اب123CDج") == "ج123CDبا"


@pytest.mark.parametrize("dark,gradient", [(False, False), (True, False), (False, True)])
def test_text_repair_erases_glyphs_and_preserves_the_surrounding_image(dark, gradient):
    import cv2

    level = 28 if dark else 235
    original = np.full((100, 320, 3), level, np.uint8)
    if gradient:
        original[:] = np.linspace(180, 245, 320, dtype=np.uint8)[None, :, None]
    captured = original.copy()
    ink = (245, 245, 245) if dark else (20, 20, 20)
    cv2.putText(captured, "Hello 123", (30, 57), cv2.FONT_HERSHEY_SIMPLEX, 1, ink, 2, cv2.LINE_AA)
    quad = [[27, 31], [195, 31], [195, 62], [27, 62]]
    result = screen_ocr.screen_text_appearance(captured, quad)
    patch = result["patches"][0]
    decoded = cv2.imdecode(np.frombuffer(base64.b64decode(patch["image"].split(",", 1)[1]), np.uint8), cv2.IMREAD_UNCHANGED)
    left, top = round(patch["x"] * 320), round(patch["y"] * 100)
    h, w = decoded.shape[:2]
    alpha = decoded[:, :, 3:4] / 255
    rendered = captured.copy()
    rendered[top:top+h, left:left+w] = decoded[:, :, :3] * alpha + captured[top:top+h, left:left+w] * (1-alpha)
    mask = np.any(captured != original, axis=2)
    before = np.abs(captured.astype(float) - original).mean(axis=2)[mask].mean()
    after = np.abs(rendered.astype(float) - original).mean(axis=2)[mask].mean()
    assert after < before * .2
    assert np.array_equal(rendered[:15], original[:15])
    assert len(result["color"]) == 7 and len(result["background"]) == 7
