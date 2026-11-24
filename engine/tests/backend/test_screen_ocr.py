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


def test_comic_polygon_output_keeps_trapezoid_perspective():
    import cv2
    probability = np.zeros((300, 240), dtype=np.float32)
    trapezoid = np.array([[100,60],[130,65],[155,220],[65,205]], dtype=np.int32)
    cv2.fillPoly(probability, [trapezoid], .95)
    ordinary = screen_ocr.detected_quads(probability, 240, 300)[0]
    perspective = screen_ocr.detected_quads(probability, 240, 300, perspective=True)[0]
    ratio = lambda quad: np.linalg.norm(quad[1]-quad[0])/np.linalg.norm(quad[2]-quad[3])
    assert ratio(ordinary) == pytest.approx(1, abs=.01)
    assert ratio(perspective) < .8
    assert cv2.isContourConvex(perspective)
    assert np.array_equal(ordinary, screen_ocr.detected_quads(probability,240,300,perspective=False)[0])


def test_comic_polygon_output_remains_bounded_at_image_edges():
    import cv2
    probability = np.zeros((100, 100), dtype=np.float32)
    cv2.fillPoly(probability, [np.array([[0,0],[40,0],[70,99],[5,99]],np.int32)], .9)
    result = screen_ocr.detected_quads(probability,100,100,perspective=True)
    assert result
    assert all(np.isfinite(quad).all() and quad.min() >= 0 and quad.max() <= 99 for quad in result)


@pytest.mark.asyncio
@pytest.mark.parametrize('upright,expected', [(('1',.99),'1'),(('I',.99),'-'),(('1',.4),'-')])
async def test_tall_comic_number_is_verified_upright_without_accepting_uncertain_letters(tmp_path,monkeypatch,upright,expected):
    service=screen_ocr.ScreenOcr(tmp_path)
    monkeypatch.setattr(service,'_verify',lambda:tmp_path)
    monkeypatch.setattr(service,'_detect_quads',lambda *args:[])
    monkeypatch.setattr(service,'_recognize_quads',lambda *args,rotate_tall=True:[('-',.44)] if rotate_tall else [upright])
    async def run(language,concurrency,realtime,callback,*args):return callback(*args)
    monkeypatch.setattr(service,'_run_inference',run)
    image=np.full((100,100,3),255,np.uint8)
    result=await service.recognize_comic_box(image,[[20,10],[40,10],[40,80],[20,80]],'ja',True)
    assert result[0][0]==expected


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

        def get_providers(self):
            return ["CPUExecutionProvider"]

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


async def test_realtime_inference_queues_serially_and_shutdown_waits(tmp_path, tiny_spec, monkeypatch):
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
    queued = asyncio.create_task(service.infer(screen_ocr.OcrRequest(image=image_url())))
    await asyncio.sleep(0)
    assert not queued.done()
    queued.cancel()
    with pytest.raises(asyncio.CancelledError):
        await queued
    task.cancel()
    closing = asyncio.create_task(service.close())
    await asyncio.sleep(0)
    assert not closing.done()
    finish.set()
    with pytest.raises(asyncio.CancelledError):
        await task
    await closing


def test_export_includes_screen_ocr(tmp_path, monkeypatch):
    from nola_translator_engine.backend.export_schemas import export
    monkeypatch.delenv("NOLA_TRANSLATOR_MODEL_DIR", raising=False)
    export(tmp_path)
    schema = json.loads((tmp_path / "openapi.json").read_text(encoding="utf-8"))
    assert "/api/v2/screen/ocr" in schema["paths"]


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


def test_comic_onnx_variants_resolve_to_their_native_services(tmp_path):
    from nola_translator_engine.models.ocr_catalog import (
        ANGLENET, LAMA_MANGA_ONNX, LAMA_ONNX,
    )
    from nola_translator_engine.backend.comic_angle import ComicAngleNet
    from nola_translator_engine.backend.comic_inpaint import OnnxComicInpainter

    service = screen_ocr.ScreenOcr(tmp_path)
    ordinary = service.variant(LAMA_ONNX.model_id)
    manga = service.variant(LAMA_MANGA_ONNX.model_id)
    angle = service.variant(ANGLENET.model_id)
    assert isinstance(ordinary, OnnxComicInpainter) and ordinary.manga is False
    assert isinstance(manga, OnnxComicInpainter) and manga.manga is True
    assert isinstance(angle, ComicAngleNet)
    assert {ordinary.spec.model_id, manga.spec.model_id, angle.spec.model_id} == {
        LAMA_ONNX.model_id, LAMA_MANGA_ONNX.model_id, ANGLENET.model_id,
    }


def test_comic_font_classifier_is_a_managed_variant_not_a_general_ocr_model(tmp_path):
    from nola_translator_engine.backend.comic_font_match import ComicFontMatcher
    from nola_translator_engine.models.ocr_catalog import COMIC_FONT_CLASSIFIER_ID, OCR_SPECS

    service = screen_ocr.ScreenOcr(tmp_path)
    matcher = service.variant(COMIC_FONT_CLASSIFIER_ID)
    assert isinstance(matcher, ComicFontMatcher)
    assert matcher is service.variant(COMIC_FONT_CLASSIFIER_ID)
    assert matcher.spec.model_id == COMIC_FONT_CLASSIFIER_ID
    assert COMIC_FONT_CLASSIFIER_ID not in OCR_SPECS


def test_comic_execution_provider_sessions_are_isolated_and_dml_is_bounded(tmp_path, monkeypatch):
    import onnxruntime as ort
    from types import SimpleNamespace

    created = []
    class Options:
        def __init__(self):
            self.intra_op_num_threads = self.inter_op_num_threads = self.log_severity_level = None
            self.execution_mode = None
            self.enable_mem_pattern = True
    monkeypatch.setattr(ort, "get_available_providers", lambda: [
        "CPUExecutionProvider", "CUDAExecutionProvider", "DmlExecutionProvider"])
    monkeypatch.setattr(ort, "SessionOptions", Options)
    monkeypatch.setattr(ort, "ExecutionMode", SimpleNamespace(ORT_SEQUENTIAL="sequential"))
    class Session:
        def __init__(self, path, options, providers):
            created.append((path, options, providers))
        def get_providers(self):
            return ["DmlExecutionProvider", "CPUExecutionProvider"]
    monkeypatch.setattr(ort, "InferenceSession", Session)

    service = screen_ocr.ScreenOcr(tmp_path)
    base = service.device_variant("pp-ocrv5-mobile-onnx", "cpu")
    dml = service.device_variant("pp-ocrv5-mobile-onnx", "dml")
    assert base is service.variant("pp-ocrv5-mobile-onnx")
    assert dml is service.device_variant("pp-ocrv5-mobile-onnx", "dml")
    assert dml is not base and dml.lease is not base.lease and dml._lock is not base._lock
    dml._session(tmp_path / "dml.onnx")
    _, options, providers = created[0]
    assert providers == ["DmlExecutionProvider", "CPUExecutionProvider"]
    assert options.execution_mode == "sequential" and options.enable_mem_pattern is False


def test_comic_device_rejects_silent_cpu_fallback(tmp_path, monkeypatch):
    import onnxruntime as ort

    class Options:
        def __init__(self):
            self.intra_op_num_threads = self.inter_op_num_threads = self.log_severity_level = None
    class Session:
        def get_providers(self):
            return ["CPUExecutionProvider"]
    monkeypatch.setattr(ort, "get_available_providers", lambda: ["CPUExecutionProvider", "CUDAExecutionProvider"])
    monkeypatch.setattr(ort, "SessionOptions", Options)
    monkeypatch.setattr(ort, "InferenceSession", lambda *args, **kwargs: Session())
    service = screen_ocr.ScreenOcr(tmp_path)
    cuda = service.device_variant("pp-ocrv5-mobile-onnx", "cuda")
    with pytest.raises(ValueError, match="runtimeUnavailable"):
        cuda._session(tmp_path / "silent-fallback.onnx")
    assert not cuda._sessions


def test_paddle_vl_runtime_rejects_silent_cpu_fallback(tmp_path, monkeypatch):
    import onnxruntime as ort
    from nola_translator_engine.backend.lumina_paddleocr_vl.runtime import create_session

    class Options:
        def __init__(self):
            self.intra_op_num_threads = self.inter_op_num_threads = self.log_severity_level = None
    class Session:
        def get_providers(self):
            return ["CPUExecutionProvider"]
    monkeypatch.setattr(ort, "get_available_providers", lambda: ["CPUExecutionProvider", "CUDAExecutionProvider"])
    monkeypatch.setattr(ort, "SessionOptions", Options)
    monkeypatch.setattr(ort, "InferenceSession", lambda *args, **kwargs: Session())
    with pytest.raises(ValueError, match="runtimeUnavailable"):
        create_session(tmp_path / "paddle.onnx", prefer="cuda")


def test_comic_device_unavailable_and_cpu_only_models_are_reported_correctly(tmp_path, monkeypatch):
    import onnxruntime as ort
    monkeypatch.setattr(ort, "get_available_providers", lambda: ["CPUExecutionProvider"])
    service = screen_ocr.ScreenOcr(tmp_path)
    assert screen_ocr.comic_execution_providers() == ["cpu"]
    angle = service.device_variant("comic-anglenet-onnx", "cuda")
    assert angle.execution_provider == "cpu"
    with pytest.raises(ValueError, match="runtimeUnavailable"):
        service.device_variant("pp-ocrv5-mobile-onnx", "cuda")
    with pytest.raises(ValueError, match="runtimeUnavailable"):
        service.device_variant("paddleocr-vl-1.6-onnx", "dml")


def test_comic_gpu_memory_is_null_without_nvml(tmp_path, monkeypatch):
    monkeypatch.setattr(screen_ocr, "_nvml_state", {"initialized": True, "library": None, "device": None})
    assert screen_ocr.comic_gpu_memory() == {"gpuMemoryUsed": None, "gpuMemoryTotal": None}


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


def test_install_routes_ppocr_to_selected_repository(tmp_path, monkeypatch):
    service = screen_ocr.ScreenOcr(tmp_path)
    downloaded = []
    resource_id = "pp-ocrv5-mobile-korean-onnx"
    variant = service.variant(resource_id)

    def ensure(spec, *, source, **kwargs):
        downloaded.extend(spec.url_for(entry, source=source) for entry in spec.files_for(source))

    monkeypatch.setattr(variant.models, "ensure", ensure)
    with TestClient(create_app(control_token="test", screen_ocr=service)) as client:
        response = client.post("/api/v2/screen/ocr/install", params={"resource_id": resource_id},
                               headers={"Authorization": "Bearer test"}, json={"source": "hf-mirror"})
        assert response.status_code == 200
        async def wait_for_install():
            await variant._install

        client.portal.call(wait_for_install)
        assert len(downloaded) == 2
        assert all(url.startswith("https://hf-mirror.com/pitapo/rapidocr/") for url in downloaded)
        assert downloaded[1].endswith("/rec/korean_PP-OCRv5_rec_mobile_infer.onnx")


def test_arabic_decoder_retains_number_and_latin_order():
    assert screen_ocr.arabic_logical_order("اب123CDج") == "ج123CDبا"


def test_overlay_blurs_only_the_source_text_quad_and_preserves_foreground_color():
    import cv2

    image = np.full((128, 320, 3), (42, 32, 16), dtype=np.uint8)
    cv2.putText(image, "North Entrance", (20, 66), cv2.FONT_HERSHEY_SIMPLEX,
                0.9, (195, 230, 255), 2, cv2.LINE_AA)
    transform = cv2.getRotationMatrix2D((140, 54), 11, 1)
    source_quad = np.array([[17, 43], [245, 43], [245, 71], [17, 71]], dtype=np.float32)
    tilted = cv2.warpAffine(image, transform, (320, 128), borderMode=cv2.BORDER_REPLICATE)
    block = {"quad": cv2.transform(source_quad[None], transform)[0].tolist()}
    screen_ocr._add_overlay_patches(tilted, [block])
    patch = block["patches"][0]
    pixels = cv2.imdecode(np.frombuffer(base64.b64decode(patch["image"].split(",", 1)[1]), np.uint8),
                         cv2.IMREAD_UNCHANGED)
    x, y = round(patch["x"] * 320), round(patch["y"] * 128)
    h, w = pixels.shape[:2]
    opaque = pixels[:, :, 3] == 255
    assert block["ink"] == "#ffe6c3"
    assert np.count_nonzero(opaque) > 0 and pixels[0, 0, 3] == 0
    assert pixels[:, :, :3][opaque].std() < tilted[y:y + h, x:x + w][opaque].std()
    assert w < 320 and h < 128


@pytest.mark.parametrize("fixed_batch,expected_calls", [(1, 2), (None, 1)])
def test_recognition_batches_only_when_the_exported_model_accepts_it(fixed_batch, expected_calls):
    class Recognizer:
        def __init__(self):
            self.calls = []
        def get_modelmeta(self):
            return SimpleNamespace(custom_metadata_map={"character": "a\nb"})
        def get_inputs(self):
            return [SimpleNamespace(shape=[fixed_batch, 3, 48, 320], name="image")]
        def run(self, _, inputs):
            self.calls.append(inputs["image"].shape)
            result = np.zeros((inputs["image"].shape[0], 2, 4), dtype=np.float32)
            result[:, 0, 1] = 0.99
            result[:, 1, 2] = 0.99
            return [result]

    recognizer = Recognizer()
    crops = [np.ones((20, 60, 3), dtype=np.uint8), np.ones((30, 80, 3), dtype=np.uint8)]
    results = screen_ocr.ScreenOcr._recognize_batch(crops, recognizer)
    assert [text for text, _ in results] == ["ab", "ab"]
    assert len(recognizer.calls) == expected_calls
    assert sum(shape[0] for shape in recognizer.calls) == 2


async def test_offline_ocr_runs_concurrently_and_release_waits_for_every_native_call(tmp_path, monkeypatch):
    service = screen_ocr.ScreenOcr(tmp_path)
    service._loaded = True
    ready = threading.Barrier(3)
    finish = threading.Event()
    def infer(request):
        ready.wait(3)
        assert finish.wait(3)
        return {"blocks": [], "width": 1, "height": 1}
    monkeypatch.setattr(service, "_infer", infer)
    request = screen_ocr.OcrRequest(image=image_url(), task_mode="offline", max_concurrency=3)
    tasks = [asyncio.create_task(service.infer(request)) for _ in range(3)]
    for _ in range(100):
        if service._inference_gate.active(service.spec.model_id) == 3:
            break
        await asyncio.sleep(0.001)
    assert service._inference_gate.active(service.spec.model_id) == 3
    closing = asyncio.create_task(service.release())
    await asyncio.sleep(0)
    assert not closing.done()
    finish.set()
    assert len(await asyncio.gather(*tasks)) == 3
    await closing
    assert not service._loaded


def test_manga_ocr_decodes_complete_paragraph_without_rotating_vertical_crop(tmp_path):
    from types import SimpleNamespace
    from nola_translator_engine.backend.screen_ocr import MangaOcr
    import numpy as np
    (tmp_path / 'vocab.txt').write_text('[PAD]\n[UNK]\n[CLS]\n[SEP]\nhello\n##world', encoding='utf-8')
    class Encoder:
        def get_inputs(self):
            return [SimpleNamespace(name='pixel_values')]
        def run(self, _, feed):
            assert feed['pixel_values'].shape == (1,3,224,224)
            assert np.isfinite(feed['pixel_values']).all()
            assert np.all(feed['pixel_values'] == 1), 'outside paragraph polygons leaked into encoder'
            return [np.zeros((1,4,8), np.float32)]
    class Decoder:
        never_stop = False
        def get_inputs(self):
            return [SimpleNamespace(name=name) for name in ('input_ids','encoder_hidden_states','encoder_attention_mask')]
        def run(self, _, feed):
            ids = feed['input_ids'][0]
            token = 4 if self.never_stop else [4,5,3][len(ids)-1]
            result = np.zeros((1,len(ids),6), np.float32)
            result[0,-1,token] = 1
            assert feed['encoder_attention_mask'].shape == (1,4)
            return [result]
    ocr = object.__new__(MangaOcr)
    ocr._verify = lambda: tmp_path
    ocr._session = lambda path: Encoder() if 'encoder' in path.name else Decoder()
    image = np.full((200,100,3), 255, np.uint8)
    assert ocr._paragraph(image, [[[0,0],[100,0],[100,200],[0,200]]]) == [('helloworld', 1.0)]
    # Overlapping text polygons form a union, not an even-odd hole.
    assert ocr._paragraph(image, [[[0,0],[70,0],[70,200],[0,200]],
                                 [[30,0],[100,0],[100,200],[30,200]]]) == [('helloworld', 1.0)]
    image[:,41:60] = 0
    assert ocr._paragraph(image, [[[0,0],[40,0],[40,200],[0,200]],
                                 [[61,0],[100,0],[100,200],[61,200]]]) == [('helloworld', 1.0)]
    image[:] = 255
    Decoder.never_stop = True
    with pytest.raises(ValueError, match='textTooLong'):
        ocr._paragraph(image, [[[0,0],[100,0],[100,200],[0,200]]])


@pytest.mark.asyncio
async def test_manga_ocr_rejects_unsupported_language_before_loading_models():
    from nola_translator_engine.backend.screen_ocr import MangaOcr, OcrRequest
    ocr = object.__new__(MangaOcr)
    with pytest.raises(ValueError, match='unsupportedLanguage'):
        await ocr.recognize_comic(None, [], 'en')
    with pytest.raises(ValueError, match='unsupportedLanguage'):
        await ocr.infer(OcrRequest(image='data:image/png;base64,AAAA', language='ko'))
