import asyncio
from pathlib import Path

from fluentcaptions_engine.protocol import parse_command_line
from fluentcaptions_engine.resources import ACCURATE_RESOURCE_ID, ResourceManager
from fluentcaptions_engine.runtime import EngineRuntime


def test_start_session_reports_missing_model_without_downloading(tmp_path) -> None:
    emitted = []
    runtime = EngineRuntime(tmp_path / "models", emitted.append)
    command = parse_command_line(
        """{"protocolVersion":1,"type":"startSession","requestId":"start-missing","config":{
        "audioSource":{"kind":"defaultOutput"},"recognitionMode":"realtime",
        "sourceLanguage":"auto","targetLanguages":[]}}"""
    )

    events = asyncio.run(runtime.handle(command))

    assert events[0].type == "error"
    assert events[0].code == "resourceUnavailable"
    assert events[0].details == {"missingResourceIds": ["sherpa-zh-en-small"]}
    assert not (tmp_path / "models").exists()
    assert emitted == []


def test_whisper_download_only_starts_after_explicit_resource_action(
    tmp_path, monkeypatch
) -> None:
    emitted = []
    manager = ResourceManager(tmp_path / "models", emitted.append)

    def fake_download(_model: str, *, output_dir: str, local_files_only: bool) -> str:
        assert local_files_only is False
        destination = tmp_path / "models" / Path(output_dir).name
        for name in ("config.json", "model.bin", "tokenizer.json"):
            (destination / name).write_text("model", encoding="utf-8")
        return str(destination)

    from faster_whisper import utils

    monkeypatch.setattr(utils, "download_model", fake_download)

    async def install() -> None:
        initial = await manager.manage(ACCURATE_RESOURCE_ID, "install")
        assert initial.state == "running"
        task = manager.tasks[ACCURATE_RESOURCE_ID]
        await task

    asyncio.run(install())

    assert manager.is_installed(ACCURATE_RESOURCE_ID)
    assert emitted[-1].resource.installed is True
    assert emitted[-1].resource.state == "idle"
