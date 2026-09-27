"""startSession 资源门禁、显式安装与启动期配置校验的运行时测试。"""

import asyncio
import json
from hashlib import sha256

from fluentcaptions_engine import resources as resources_module
from fluentcaptions_engine.models.manager import FileEntry, ModelSpec
from fluentcaptions_engine.protocol import parse_command_line
from fluentcaptions_engine.resources import QWEN_RESOURCE_ID
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


def test_engine_status_file_lifecycle(tmp_path) -> None:
    runtime = EngineRuntime(tmp_path / "models", lambda _e: None)
    status_path = tmp_path / "models" / ".runtime" / "engine-status.json"
    assert status_path.exists()
    data = json.loads(status_path.read_text(encoding="utf-8"))
    assert data["qwen"] == {"quant": "unloaded", "loaded": False}
    assert data["hymt2"] == {"device": "unknown", "ready": False}

    asyncio.run(runtime.close())
    assert not status_path.exists()
