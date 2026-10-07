"""ResourceManager directory layout, install flow, and legacy cleanup (fake fetcher, no network)."""

import asyncio
from hashlib import sha256
from pathlib import Path
import threading

import pytest

from nola_translator_engine import resources as resources_module
from nola_translator_engine.models.manager import FileEntry, ModelSpec
from nola_translator_engine.protocol import ResourceRecord
from nola_translator_engine.resources import (
    HYMT2_RESOURCE_ID,
    HYMT2_Q3_RESOURCE_ID,
    HYMT2_IQ2_RESOURCE_ID,
    M2M100_RESOURCE_ID,
    QWEN_06B_RESOURCE_ID,
    QWEN_RESOURCE_ID,
    SENSEVOICE_RESOURCE_ID,
    ResourceActionError,
    ResourceManager,
)


def _tiny_qwen() -> tuple[ModelSpec, dict[str, bytes]]:
    payloads = {
        "config.json": b'{"tiny": true}',
        "model.safetensors": b"T" * 64,
    }
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
    return spec, {spec.url_for(entry): payloads[entry.path] for entry in spec.files}


def _tiny_hymt2() -> tuple[ModelSpec, dict[str, bytes]]:
    data = b"GGUF-TEST" * 8
    spec = ModelSpec(
        model_id=HYMT2_RESOURCE_ID,
        directory=HYMT2_RESOURCE_ID,
        repo="tencent/Hy-MT2-1.8B-GGUF",
        revision="pinned-test-revision",
        files=(FileEntry("Hy-MT2-1.8B-Q4_K_M.gguf", len(data), sha256(data).hexdigest()),),
    )
    return spec, {spec.url_for(spec.files[0]): data}


def _tiny_m2m100() -> tuple[ModelSpec, dict[str, bytes]]:
    payloads = {
        "config.json": b'{"tiny": true}',
        "pytorch_model.bin": b"M" * 64,
    }
    spec = ModelSpec(
        model_id=M2M100_RESOURCE_ID,
        directory=M2M100_RESOURCE_ID,
        repo="facebook/m2m100_418M",
        revision="pinned-test-revision",
        files=tuple(
            FileEntry(path, len(data), sha256(data).hexdigest())
            for path, data in payloads.items()
        ),
    )
    return spec, {spec.url_for(entry): payloads[entry.path] for entry in spec.files}


def _fetcher(payloads: dict[str, bytes]):
    def fetch(url: str, destination: Path, progress) -> None:
        data = payloads[url]
        with destination.open("wb") as output:
            half = len(data) // 2
            written = 0
            for piece in (data[:half], data[half:]):
                if not piece:
                    continue
                output.write(piece)
                written += len(piece)
                progress(written, len(data))

    return fetch


def test_list_returns_every_builtin_resource(tmp_path: Path) -> None:
    manager = ResourceManager(tmp_path / "models", lambda _event: None)
    records = manager.list()

    assert [record.resourceId for record in records] == [
        QWEN_RESOURCE_ID,
        QWEN_06B_RESOURCE_ID,
        SENSEVOICE_RESOURCE_ID,
        HYMT2_RESOURCE_ID,
        HYMT2_Q3_RESOURCE_ID,
        HYMT2_IQ2_RESOURCE_ID,
        M2M100_RESOURCE_ID,
    ]
    assert QWEN_RESOURCE_ID == "qwen3-asr-1.7b-hf"
    assert QWEN_06B_RESOURCE_ID == "qwen3-asr-0.6b-hf"
    assert SENSEVOICE_RESOURCE_ID == "sensevoice-small"
    assert HYMT2_RESOURCE_ID == "hy-mt2-1.8b-q4-k-m"
    assert M2M100_RESOURCE_ID == "m2m100-418m"

    qwen, qwen_small, sensevoice, hymt2, hymt2_q3, hymt2_iq2, m2m100 = records
    assert qwen.kind == "recognitionModel"
    assert qwen.provider == "qwen3-asr"
    assert qwen.name == "Qwen3-ASR 1.7B"
    assert qwen.downloadBytes == 4_087_646_324
    assert len(qwen.languages) == 30
    assert qwen.installed is False
    assert qwen.state == "idle"

    assert qwen_small.kind == "recognitionModel"
    assert qwen_small.provider == "qwen3-asr"
    assert qwen_small.name == "Qwen3-ASR 0.6B"
    assert qwen_small.downloadBytes == 1_576_381_331
    assert qwen_small.installed is False

    assert sensevoice.kind == "recognitionModel"
    assert sensevoice.provider == "sensevoice"
    assert sensevoice.name == "SenseVoiceSmall"
    assert sensevoice.downloadBytes == 936_694_116
    assert sensevoice.languages == ["zh", "en", "yue", "ja", "ko"]
    assert sensevoice.installed is False

    assert hymt2.kind == "translationModel"
    assert hymt2.provider == "hymt2"
    assert hymt2.name == "Hy-MT2 1.8B Q4_K_M"
    assert hymt2.downloadBytes == 1_133_080_448
    assert len(hymt2.languages) > 16
    assert hymt2.installed is False

    assert hymt2_q3.resourceId == HYMT2_Q3_RESOURCE_ID
    assert hymt2_q3.provider == "hymt2"
    assert hymt2_q3.downloadBytes == 951_022_560

    assert hymt2_iq2.resourceId == HYMT2_IQ2_RESOURCE_ID
    assert hymt2_iq2.provider == "hymt2"
    assert hymt2_iq2.downloadBytes == 722_666_176

    assert m2m100.kind == "translationModel"
    assert m2m100.provider == "m2m100"
    assert m2m100.name == "M2M100 418M"
    assert m2m100.downloadBytes == 1_941_936_305
    assert m2m100.installed is False

    for record in records:
        assert 0 < len(record.languages) <= 128
        assert ResourceRecord.model_validate(record.model_dump()) == record


async def test_install_m2m100_leaves_xdg_dirs_untouched(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """M2M100 is not Hy-MT2, so installing it must not trigger the Argos-era XDG cleanup."""
    spec, payloads = _tiny_m2m100()
    monkeypatch.setattr(resources_module, "M2M100_418M", spec)

    xdg_data = tmp_path / "xdg-data"
    (xdg_data / "argos").mkdir(parents=True)
    monkeypatch.setenv("XDG_DATA_HOME", str(xdg_data))

    model_root = tmp_path / "models"
    manager = ResourceManager(model_root, lambda _event: None)
    manager.models.fetcher = _fetcher(payloads)

    await manager.manage(M2M100_RESOURCE_ID, "install")
    await manager.tasks[M2M100_RESOURCE_ID]

    assert manager.is_installed(M2M100_RESOURCE_ID) is True
    assert (manager.model_path(M2M100_RESOURCE_ID) / "config.json").is_file()
    assert xdg_data.exists()


async def test_install_qwen_phases_progress_and_cleanup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spec, payloads = _tiny_qwen()
    monkeypatch.setattr(resources_module, "QWEN3_ASR_1_7B_HF", spec)

    model_root = tmp_path / "models"
    legacy_dirs = (
        "sherpa-onnx-streaming-zipformer-small-bilingual-zh-en-2023-02-16",
        "sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2024-07-17",
        "faster-whisper-small",
    )
    for name in legacy_dirs:
        path = model_root / name
        path.mkdir(parents=True)
        (path / "old.bin").write_bytes(b"old")
    (model_root / ".sherpa-zh-en-small.part").write_bytes(b"part")
    (model_root / ".sensevoice-small.part").write_bytes(b"part")
    (model_root / ".faster-whisper-small.corrupt").mkdir()
    (model_root / "user-own-model").mkdir()
    (model_root / "ollama").mkdir()
    xdg_data = tmp_path / "xdg-data"
    (xdg_data / "argos").mkdir(parents=True)
    monkeypatch.setenv("XDG_DATA_HOME", str(xdg_data))

    emitted = []
    manager = ResourceManager(model_root, emitted.append)
    manager.models.fetcher = _fetcher(payloads)

    initial = await manager.manage(QWEN_RESOURCE_ID, "install")
    assert initial.state == "running"
    assert initial.cancellable is True
    assert initial.phase == "download"
    await manager.tasks[QWEN_RESOURCE_ID]

    assert manager.is_installed(QWEN_RESOURCE_ID) is True
    final = manager.record(QWEN_RESOURCE_ID)
    assert final.installed is True
    assert final.state == "idle"
    assert final.errorCode is None
    assert (manager.qwen_path / "config.json").is_file()
    assert manager.qwen_path == model_root / QWEN_RESOURCE_ID

    phases = [event.resource.phase for event in emitted]
    assert "download" in phases
    assert phases.index("verify") < phases.index("install")
    progresses = [
        event.resource.progress
        for event in emitted
        if event.resource.progress is not None
    ]
    assert progresses == sorted(progresses)
    assert progresses[-1] == 1.0

    for name in legacy_dirs:
        assert not (model_root / name).exists()
    assert not (model_root / ".sherpa-zh-en-small.part").exists()
    assert not (model_root / ".sensevoice-small.part").exists()
    assert not (model_root / ".faster-whisper-small.corrupt").exists()
    assert (model_root / "user-own-model").is_dir()
    assert (model_root / "ollama").is_dir()
    assert xdg_data.exists()


async def test_failed_install_skips_cleanup(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spec, payloads = _tiny_qwen()
    victim = spec.files[0]
    original = payloads[spec.url_for(victim)]
    payloads[spec.url_for(victim)] = b"X" * victim.size  # Same size, different digest: isolates the checksum check from the size check.
    monkeypatch.setattr(resources_module, "QWEN3_ASR_1_7B_HF", spec)

    model_root = tmp_path / "models"
    legacy = model_root / "faster-whisper-small"
    legacy.mkdir(parents=True)
    (legacy / "model.bin").write_bytes(b"m")

    emitted = []
    manager = ResourceManager(model_root, emitted.append)
    manager.models.fetcher = _fetcher(payloads)

    await manager.manage(QWEN_RESOURCE_ID, "install")
    await manager.tasks[QWEN_RESOURCE_ID]

    record = manager.record(QWEN_RESOURCE_ID)
    assert record.state == "failed"
    assert record.errorCode == "integrityCheckFailed"
    assert legacy.exists()
    assert manager.is_installed(QWEN_RESOURCE_ID) is False

    payloads[spec.url_for(victim)] = original
    retry = await manager.manage(QWEN_RESOURCE_ID, "install")
    assert retry.state == "running"
    await manager.tasks[QWEN_RESOURCE_ID]
    assert manager.record(QWEN_RESOURCE_ID).installed is True
    assert not legacy.exists()


async def test_install_hymt2_cleans_xdg_dirs_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spec, payloads = _tiny_hymt2()
    monkeypatch.setattr(resources_module, "HYMT2_1_8B_Q4_K_M", spec)

    xdg_paths = (tmp_path / "xdg-data", tmp_path / "xdg-config", tmp_path / "xdg-cache")
    for path in xdg_paths:
        (path / "argos").mkdir(parents=True)
        (path / "argos" / "index").write_text("x", encoding="utf-8")
    monkeypatch.setenv("XDG_DATA_HOME", str(xdg_paths[0]))
    monkeypatch.setenv("XDG_CONFIG_HOME", str(xdg_paths[1]))
    monkeypatch.setenv("XDG_CACHE_HOME", str(xdg_paths[2]))

    model_root = tmp_path / "models"
    legacy = model_root / "faster-whisper-small"
    legacy.mkdir(parents=True)
    (model_root / "user-own-model").mkdir()
    (model_root / "ollama").mkdir()

    emitted = []
    manager = ResourceManager(model_root, emitted.append)
    manager.models.fetcher = _fetcher(payloads)

    await manager.manage(HYMT2_RESOURCE_ID, "install")
    await manager.tasks[HYMT2_RESOURCE_ID]

    assert manager.is_installed(HYMT2_RESOURCE_ID) is True
    assert manager.hymt2_gguf_path().is_file()
    for path in xdg_paths:
        assert not path.exists()
    assert legacy.is_dir()
    assert (model_root / "user-own-model").is_dir()
    assert (model_root / "ollama").is_dir()


async def test_manage_unknown_id_raises_not_found(tmp_path: Path) -> None:
    manager = ResourceManager(tmp_path / "models", lambda _event: None)
    with pytest.raises(ResourceActionError) as excinfo:
        await manager.manage("does-not-exist", "install")
    assert excinfo.value.code == "resourceNotFound"


async def test_busy_and_cancel_guards(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spec, payloads = _tiny_qwen()
    monkeypatch.setattr(resources_module, "QWEN3_ASR_1_7B_HF", spec)

    model_root = tmp_path / "models"
    started = threading.Event()
    release = threading.Event()
    inner = _fetcher(payloads)

    def slow_fetch(url: str, destination: Path, progress) -> None:
        started.set()
        assert release.wait(10)
        inner(url, destination, progress)

    emitted = []
    manager = ResourceManager(model_root, emitted.append)
    manager.models.fetcher = slow_fetch

    with pytest.raises(ResourceActionError) as excinfo:
        await manager.manage(QWEN_RESOURCE_ID, "cancel")
    assert excinfo.value.code == "resourceBusy"
    assert excinfo.value.details == {"reason": "operationNotCancellable"}

    await manager.manage(QWEN_RESOURCE_ID, "install")
    assert await asyncio.to_thread(started.wait, 10)

    with pytest.raises(ResourceActionError) as excinfo:
        await manager.manage(QWEN_RESOURCE_ID, "install")
    assert excinfo.value.code == "resourceBusy"

    cancelling = await manager.manage(QWEN_RESOURCE_ID, "cancel")
    assert cancelling.state == "cancelling"
    release.set()
    await manager.tasks[QWEN_RESOURCE_ID]

    assert manager.is_installed(QWEN_RESOURCE_ID) is False
    assert QWEN_RESOURCE_ID not in manager.operations
    assert not model_root.exists() or not any(model_root.iterdir())

    manager.models.fetcher = _fetcher(payloads)
    retry = await manager.manage(QWEN_RESOURCE_ID, "install")
    assert retry.state == "running"
    await manager.tasks[QWEN_RESOURCE_ID]
    assert manager.is_installed(QWEN_RESOURCE_ID) is True


async def test_remove_installed_resource(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    spec, _payloads = _tiny_hymt2()
    monkeypatch.setattr(resources_module, "HYMT2_1_8B_Q4_K_M", spec)

    model_root = tmp_path / "models"
    target = model_root / HYMT2_RESOURCE_ID
    target.mkdir(parents=True)
    (target / "Hy-MT2-1.8B-Q4_K_M.gguf").write_bytes(b"GGUF-TEST" * 8)

    manager = ResourceManager(model_root, lambda _event: None)
    assert manager.is_installed(HYMT2_RESOURCE_ID) is True

    record = await manager.manage(HYMT2_RESOURCE_ID, "remove")
    assert record.state == "running"
    await manager.tasks[HYMT2_RESOURCE_ID]

    assert manager.is_installed(HYMT2_RESOURCE_ID) is False
    assert not target.exists()
    assert manager.record(HYMT2_RESOURCE_ID).installedBytes == 0
