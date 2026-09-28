"""startSession 资源门禁、显式安装与启动期配置校验的运行时测试。"""

import asyncio
import json
from hashlib import sha256
from pathlib import Path

from fluentcaptions_engine import resources as resources_module
from fluentcaptions_engine import runtime as runtime_module
from fluentcaptions_engine.models.manager import FileEntry, ModelSpec
from fluentcaptions_engine.protocol import parse_command_line
from fluentcaptions_engine.resources import HYMT2_RESOURCE_ID, QWEN_06B_RESOURCE_ID, QWEN_RESOURCE_ID
from fluentcaptions_engine.runtime import EngineRuntime


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
    # 门禁阶段不得产生模型下载产物（.runtime 诊断状态文件除外）。
    assert not (tmp_path / "models" / QWEN_RESOURCE_ID).exists()
    assert emitted == []


def test_start_session_reports_missing_translation_model(tmp_path, monkeypatch) -> None:
    runtime = EngineRuntime(tmp_path / "models", lambda _e: None)
    monkeypatch.setattr(runtime.resources, "is_installed", lambda rid: rid == QWEN_RESOURCE_ID)
    command = parse_command_line(
        '{"protocolVersion":1,"type":"startSession","requestId":"missing-translation",'
        '"config":{"audioSource":{"kind":"defaultOutput"},"recognitionMode":"realtime",'
        '"sourceLanguage":"en","targetLanguages":["zh"],"translationProvider":"hymt2"}}'
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
        '"translationProvider":"hymt2"}}'
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
        '"translationProvider":"m2m100"}}'
    )

    events = asyncio.run(runtime.handle(command))

    assert events[0].type == "error"
    assert events[0].code == "invalidConfiguration"
    assert "unsupportedTranslationLanguage (m2m100)" in events[0].details["reason"]


def test_selected_recognition_model_gates_and_loads_that_directory(
    tmp_path, monkeypatch
) -> None:
    """选择 0.6B 时门禁与识别器都指向 0.6B 目录，而不是默认的 1.7B。"""
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

    class LoadedRuntime:
        def load(self) -> None:
            seen.append(tmp_path / "models" / QWEN_06B_RESOURCE_ID)

    monkeypatch.setattr(runtime_module, "get_qwen_runtime", lambda _path: LoadedRuntime())

    def fake_create(model_dir, *, source_language=None):
        seen.append(Path(model_dir))
        raise RuntimeError("stop here")

    monkeypatch.setattr(runtime_module, "create_qwen_recognizer", fake_create)
    asyncio.run(runtime.handle(command))

    assert seen == [tmp_path / "models" / QWEN_06B_RESOURCE_ID] * 2
    assert runtime.active_model_id == QWEN_06B_RESOURCE_ID


def test_engine_status_file_lifecycle(tmp_path) -> None:
    runtime = EngineRuntime(tmp_path / "models", lambda _e: None)
    status_path = tmp_path / "models" / ".runtime" / "engine-status.json"
    assert status_path.exists()
    data = json.loads(status_path.read_text(encoding="utf-8"))
    assert data["qwen"] == {"quant": "unloaded", "loaded": False}
    assert data["hymt2"] == {"device": "unknown", "ready": False}

    asyncio.run(runtime.close())
    assert not status_path.exists()


def test_m2m100_is_ready_before_session_starts(tmp_path, monkeypatch) -> None:
    """进入识别会话前，翻译模型已完成加载。"""
    from fluentcaptions_engine.translation import m2m100 as m2m100_module

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
            '"translationProvider":"m2m100"}}'
        )
        runtime._configure_translation(command)
        runtime.translation_provider = provider
        await runtime._ensure_translation_server(command)
        assert loaded == ["load"]

    asyncio.run(run())


def test_session_cleanup_unloads_both_local_models(tmp_path, monkeypatch) -> None:
    from fluentcaptions_engine.translation.m2m100 import M2M100TranslationProvider

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
