"""Runtime tests for startSession resource gating, explicit install, and startup config validation."""

import asyncio
import json
from hashlib import sha256
from pathlib import Path

import pytest

from nola_translator_engine import resources as resources_module
from nola_translator_engine.audio.devices import AudioDeviceRecord
from nola_translator_engine import runtime as runtime_module
from nola_translator_engine.models.manager import FileEntry, ModelSpec
from nola_translator_engine.protocol import parse_command_line
from nola_translator_engine.resources import (
    HYMT2_IQ2_RESOURCE_ID,
    HYMT2_Q3_RESOURCE_ID,
    HYMT2_RESOURCE_ID,
    M2M100_RESOURCE_ID,
    QWEN_06B_RESOURCE_ID,
    QWEN_RESOURCE_ID,
    SENSEVOICE_RESOURCE_ID,
)
from nola_translator_engine.runtime import EngineRuntime


_DEVICE = AudioDeviceRecord(
    device_id="test-device",
    backend_index=0,
    name="Test Loopback",
    kind="systemOutput",
    is_default=True,
    sample_rate=48000,
    channels=2,
)


def _hymt2_command(request_id: str, model_id: str | None) -> str:
    """Builds a startSession carrying a target language; a None model_id omits the field entirely."""
    tail = "" if model_id is None else f'"translationModelId":"{model_id}",'
    return (
        '{"protocolVersion":1,"type":"startSession","requestId":"'
        + request_id
        + '","config":{"audioSource":{"kind":"defaultOutput"},"recognitionMode":"realtime",'
        + f'"sourceLanguage":"auto","targetLanguages":["en"],"translationProvider":"local",'
        + tail
        + '"recognitionModelId":"'
        + SENSEVOICE_RESOURCE_ID
        + '"}}'
    )


@pytest.mark.parametrize(
    ("model_id", "expected"),
    [
        (HYMT2_Q3_RESOURCE_ID, HYMT2_Q3_RESOURCE_ID),
        (HYMT2_IQ2_RESOURCE_ID, HYMT2_IQ2_RESOURCE_ID),
        (HYMT2_RESOURCE_ID, HYMT2_RESOURCE_ID),
        # Older clients omit the field and fall back to the baseline quantization.
        (None, HYMT2_RESOURCE_ID),
    ],
)
def test_session_gates_and_loads_the_selected_hymt2_quantization(
    tmp_path, monkeypatch, model_id, expected
) -> None:
    runtime = EngineRuntime(tmp_path / "models", lambda _e: None)
    command = parse_command_line(_hymt2_command("start-quant", model_id))

    # Stub the ASR side first: once the gate passes, the runtime really loads the
    # model and fires network requests.
    class FakeLlamaManager:
        device = "cuda"
        ready = True
        offloaded_layers = 20
        fallback_reason = None

        def configure_compute(self, _device, _options):
            pass

        def __init__(self) -> None:
            self.loaded: list[Path] = []

        async def start(self, **_kwargs) -> str:
            return "cuda"

        async def stop(self) -> None:
            return None

        def switch_gguf(self, path: Path) -> bool:
            self.loaded.append(Path(path))
            return True

    llama = FakeLlamaManager()
    monkeypatch.setattr(runtime, "llama_manager", llama)
    monkeypatch.setattr(runtime_module, "get_sensevoice_runtime", lambda _p, **_options: _Loaded())
    monkeypatch.setattr(
        runtime_module, "create_sensevoice_recognizer", lambda *_a, **_k: _Raising()
    )

    # The ASR and capture sides are stubbed too: without them the successful branch of
    # this test would open whatever default output device the test machine happens to have.
    monkeypatch.setattr(
        runtime.service.device_registry, "resolve", lambda *_a, **_k: _DEVICE
    )
    monkeypatch.setattr(runtime_module, "PortAudioCapture", _FakeCapture)

    # Only the ASR models are installed: the selected Hy-MT2 tier is still missing, and no
    # other tier stands in for it.
    installed: set[str] = {SENSEVOICE_RESOURCE_ID, QWEN_RESOURCE_ID, QWEN_06B_RESOURCE_ID}
    monkeypatch.setattr(runtime.resources, "is_installed", lambda rid: rid in installed)
    missing = asyncio.run(runtime.handle(command))
    assert missing[0].code == "resourceUnavailable"
    assert missing[0].details == {"missingResourceIds": [expected]}

    installed.add(expected)
    # The unselected tiers stay absent, so a start that still succeeds is what proves the
    # gate follows the selection rather than always checking Q4_K_M.
    started = asyncio.run(runtime.handle(command))

    assert started[0].type == "sessionStarted", started[0]
    assert llama.loaded, "应把所选档位的 GGUF 交给 llama-server"
    assert llama.loaded[0].name.startswith("Hy-MT2-1.8B-"), llama.loaded


class _Loaded:
    loaded = True

    def load(self) -> None:
        return None

    def unload(self) -> None:
        return None

    def describe(self) -> str:
        return "unloaded"


class _Raising:
    async def close(self) -> None:
        return None


class _FakeCapture:
    """Stands in for PortAudioCapture so a successful start never touches real audio."""

    dropped_chunks = 0

    def __init__(self, _device: object) -> None:
        self.started = False

    def start(self) -> None:
        self.started = True

    def stop(self) -> None:
        return None

    async def frames(self):
        if False:
            yield None


def _start_command(request_id: str, mode: str) -> str:
    return (
        '{"protocolVersion":1,"type":"startSession","requestId":"'
        + request_id
        + '","config":{"audioSource":{"kind":"defaultOutput"},"recognitionMode":"'
        + mode
        + '","sourceLanguage":"auto","targetLanguages":[]}}'
    )


def test_start_session_reports_missing_model_without_downloading(tmp_path) -> None:
    emitted = []
    runtime = EngineRuntime(tmp_path / "models", emitted.append)

    async def run() -> None:
        for mode in ("realtime", "accurate"):
            events = await runtime.handle(
                parse_command_line(_start_command(f"start-{mode}", mode))
            )
            assert events[0].type == "error"
            assert events[0].code == "resourceUnavailable"
            assert events[0].details == {"missingResourceIds": [QWEN_RESOURCE_ID]}

    asyncio.run(run())
    assert not (tmp_path / "models" / QWEN_RESOURCE_ID).exists()
    assert emitted == []


def test_start_session_reports_missing_translation_model(tmp_path, monkeypatch) -> None:
    runtime = EngineRuntime(tmp_path / "models", lambda _e: None)
    monkeypatch.setattr(runtime.resources, "is_installed", lambda rid: rid == QWEN_RESOURCE_ID)
    command = parse_command_line(
        '{"protocolVersion":1,"type":"startSession","requestId":"missing-translation",'
        '"config":{"audioSource":{"kind":"defaultOutput"},"recognitionMode":"realtime",'
        '"sourceLanguage":"en","targetLanguages":["zh"],"translationProvider":"local"}}'
    )
    events = asyncio.run(runtime.handle(command))
    assert events[0].code == "resourceUnavailable"
    assert events[0].details == {"missingResourceIds": [HYMT2_RESOURCE_ID]}


def test_install_requires_explicit_manage_resource_action(tmp_path, monkeypatch) -> None:
    payloads = {"config.json": b'{"tiny": true}', "model.safetensors": b"T" * 64}
    spec = ModelSpec(
        model_id=QWEN_RESOURCE_ID,
        directory=QWEN_RESOURCE_ID,
        repo="Qwen/Qwen3-ASR-1.7B-hf",
        revision="pinned-test-revision",
        files=tuple(
            FileEntry(path, len(data), sha256(data).hexdigest())
            for path, data in payloads.items()
        ),
    )
    monkeypatch.setattr(resources_module, "QWEN3_ASR_1_7B_HF", spec)

    def fetch(url: str, destination, progress) -> None:
        data = {spec.url_for(entry): payloads[entry.path] for entry in spec.files}[url]
        destination.write_bytes(data)
        progress(len(data), len(data))

    emitted = []
    runtime = EngineRuntime(tmp_path / "models", emitted.append)
    runtime.resources.models.fetcher = fetch

    async def install() -> None:
        result = await runtime.handle(
            parse_command_line(
                '{"protocolVersion":1,"type":"manageResource","requestId":"install-1",'
                f'"resourceId":"{QWEN_RESOURCE_ID}","action":"install"}}'
            )
        )
        assert result[0].type == "resourceActionResult"
        await runtime.resources.tasks[QWEN_RESOURCE_ID]

    asyncio.run(install())
    assert runtime.resources.is_installed(QWEN_RESOURCE_ID)
    assert emitted[-1].resource.installed is True
    assert emitted[-1].resource.state == "idle"


def test_start_session_rejects_unsupported_translation_language(tmp_path, monkeypatch) -> None:
    runtime = EngineRuntime(tmp_path / "models", lambda _e: None)
    monkeypatch.setattr(runtime.resources, "is_installed", lambda _rid: True)
    command = parse_command_line(
        '{"protocolVersion":1,"type":"startSession","requestId":"start-bad-lang",'
        '"config":{"audioSource":{"kind":"defaultOutput"},"recognitionMode":"realtime",'
        '"sourceLanguage":"auto","targetLanguages":["tlh"],'
        '"translationProvider":"local"}}'
    )

    events = asyncio.run(runtime.handle(command))

    assert events[0].type == "error"
    assert events[0].code == "invalidConfiguration"
    assert "unsupportedTranslationLanguage" in events[0].details["reason"]


def test_start_session_rejects_unsupported_m2m100_language(tmp_path, monkeypatch) -> None:
    runtime = EngineRuntime(tmp_path / "models", lambda _e: None)
    monkeypatch.setattr(runtime.resources, "is_installed", lambda _rid: True)
    command = parse_command_line(
        '{"protocolVersion":1,"type":"startSession","requestId":"start-bad-m2m",'
        '"config":{"audioSource":{"kind":"defaultOutput"},"recognitionMode":"realtime",'
        '"sourceLanguage":"auto","targetLanguages":["tlh"],'
        f'"translationProvider":"local","translationModelId":"{M2M100_RESOURCE_ID}"}}}}'
    )

    events = asyncio.run(runtime.handle(command))

    assert events[0].type == "error"
    assert events[0].code == "invalidConfiguration"
    assert "unsupportedTranslationLanguage (m2m100)" in events[0].details["reason"]


def test_selected_recognition_model_gates_and_loads_that_directory(
    tmp_path, monkeypatch
) -> None:
    runtime = EngineRuntime(tmp_path / "models", lambda _e: None)
    command = parse_command_line(
        '{"protocolVersion":1,"type":"startSession","requestId":"start-0-6b",'
        '"config":{"audioSource":{"kind":"defaultOutput"},"recognitionMode":"realtime",'
        f'"recognitionModelId":"{QWEN_06B_RESOURCE_ID}",'
        '"sourceLanguage":"auto","targetLanguages":[]}}'
    )

    missing = asyncio.run(runtime.handle(command))
    assert missing[0].details == {"missingResourceIds": [QWEN_06B_RESOURCE_ID]}

    monkeypatch.setattr(runtime.resources, "is_installed", lambda _rid: True)
    seen: list[Path] = []

    class LoadedRuntime(_Loaded):
        def load(self) -> None:
            seen.append(tmp_path / "models" / QWEN_06B_RESOURCE_ID)

    monkeypatch.setattr(runtime_module, "get_qwen_runtime", lambda _path, **_options: LoadedRuntime())

    def fake_create(model_dir, *, source_language=None, runtime=None):
        seen.append(Path(model_dir))
        raise RuntimeError("stop here")

    monkeypatch.setattr(runtime_module, "create_qwen_recognizer", fake_create)
    asyncio.run(runtime.handle(command))

    assert seen == [tmp_path / "models" / QWEN_06B_RESOURCE_ID] * 2
    assert runtime.active_model_id == QWEN_06B_RESOURCE_ID


def test_sensevoice_selection_loads_its_own_runtime(tmp_path, monkeypatch) -> None:
    runtime = EngineRuntime(tmp_path / "models", lambda _e: None)
    command = parse_command_line(
        '{"protocolVersion":1,"type":"startSession","requestId":"start-sensevoice",'
        '"config":{"audioSource":{"kind":"defaultOutput"},"recognitionMode":"realtime",'
        f'"recognitionModelId":"{SENSEVOICE_RESOURCE_ID}",'
        '"sourceLanguage":"auto","targetLanguages":[]}}'
    )

    monkeypatch.setattr(runtime.resources, "is_installed", lambda _rid: True)
    seen: list[Path] = []

    class LoadedRuntime(_Loaded):
        def load(self) -> None:
            seen.append(tmp_path / "models" / SENSEVOICE_RESOURCE_ID)

    monkeypatch.setattr(runtime_module, "get_sensevoice_runtime", lambda _path, **_options: LoadedRuntime())
    monkeypatch.setattr(
        runtime_module,
        "get_qwen_runtime",
        lambda _path: pytest.fail("选择 SenseVoice 时不应加载 Qwen 运行时"),
    )

    def fake_create(model_dir, *, source_language=None, runtime=None):
        seen.append(Path(model_dir))
        raise RuntimeError("stop here")

    monkeypatch.setattr(runtime_module, "create_sensevoice_recognizer", fake_create)
    asyncio.run(runtime.handle(command))

    assert seen == [tmp_path / "models" / SENSEVOICE_RESOURCE_ID] * 2
    assert runtime.active_model_id == SENSEVOICE_RESOURCE_ID


def test_status_payload_reports_active_recognition_model(tmp_path, monkeypatch) -> None:
    runtime = EngineRuntime(tmp_path / "models", lambda _e: None)
    runtime.active_model_id = SENSEVOICE_RESOURCE_ID

    class SenseVoiceStub:
        loaded = True

        def describe(self) -> str:
            return "cuda:0"

    monkeypatch.setattr(
        runtime_module, "get_sensevoice_runtime", lambda _path: SenseVoiceStub()
    )
    runtime._status_cache = ""

    assert runtime._engine_status_payload()["recognition"] == {
        "modelId": SENSEVOICE_RESOURCE_ID,
        "loaded": True,
        "runtime": "cuda:0",
    }


def test_engine_status_file_lifecycle(tmp_path) -> None:
    runtime = EngineRuntime(tmp_path / "models", lambda _e: None)
    status_path = tmp_path / "models" / ".runtime" / "engine-status.json"
    assert status_path.exists()
    data = json.loads(status_path.read_text(encoding="utf-8"))
    assert data["recognition"] == {
        "modelId": QWEN_RESOURCE_ID,
        "loaded": False,
        "runtime": "unloaded",
    }
    assert data["hymt2"] == {"device": "unknown", "ready": False, "offloadedLayers": None, "fallbackReason": None}

    asyncio.run(runtime.close())
    assert not status_path.exists()


def test_m2m100_is_ready_before_session_starts(tmp_path, monkeypatch) -> None:
    from nola_translator_engine.translation import m2m100 as m2m100_module

    runtime = EngineRuntime(tmp_path / "models", lambda _e: None)
    monkeypatch.setattr(runtime.resources, "is_installed", lambda _rid: True)
    loaded: list[str] = []

    class FakeRuntime:
        loaded = False

        def load(self) -> None:
            loaded.append("load")
            self.loaded = True

    provider = m2m100_module.M2M100TranslationProvider.__new__(
        m2m100_module.M2M100TranslationProvider
    )
    provider.runtime = FakeRuntime()  # type: ignore[assignment]
    runtime.translation_provider = provider

    async def run() -> None:
        command = parse_command_line(
            '{"protocolVersion":1,"type":"startSession","requestId":"warm",'
            '"config":{"audioSource":{"kind":"defaultOutput"},"recognitionMode":"realtime",'
            '"sourceLanguage":"auto","targetLanguages":["zh"],'
            f'"translationProvider":"local","translationModelId":"{M2M100_RESOURCE_ID}"}}}}'
        )
        runtime._configure_translation(command)
        runtime.translation_provider = provider
        await runtime._ensure_translation_server(command)
        assert loaded == ["load"]

    asyncio.run(run())


def test_session_cleanup_unloads_both_local_models(tmp_path, monkeypatch) -> None:
    from nola_translator_engine.translation.m2m100 import M2M100TranslationProvider

    runtime = EngineRuntime(tmp_path / "models", lambda _e: None)
    unloaded: list[str] = []

    class FakeRuntime:
        loaded = True

        def __init__(self, name: str) -> None:
            self.name = name

        def unload(self) -> None:
            unloaded.append(self.name)
            self.loaded = False

    qwen = FakeRuntime("qwen")
    provider = M2M100TranslationProvider.__new__(M2M100TranslationProvider)
    provider.runtime = FakeRuntime("m2m100")  # type: ignore[assignment]
    runtime.translation_provider = provider
    monkeypatch.setattr(runtime_module, "get_qwen_runtime", lambda _path: qwen)

    asyncio.run(runtime._unload_session_models())

    assert unloaded == ["qwen", "m2m100"]
