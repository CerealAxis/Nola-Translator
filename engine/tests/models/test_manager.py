from hashlib import md5
from pathlib import Path
import shutil
import tarfile

import pytest

from fluentcaptions_engine.models.manager import ModelIntegrityError, ModelManager, ModelSpec


def _archive(tmp_path: Path) -> Path:
    source = tmp_path / "source"
    model = source / "streaming-test"
    model.mkdir(parents=True)
    for name in ("tokens.txt", "encoder.onnx", "decoder.onnx", "joiner.onnx"):
        (model / name).write_text(name, encoding="utf-8")
    archive = tmp_path / "model.tar.bz2"
    with tarfile.open(archive, "w:bz2") as bundle:
        bundle.add(model, arcname=model.name)
    return archive


def _copy_fetcher(source: Path):
    def fetch(_url: str, destination: Path, progress) -> None:
        shutil.copyfile(source, destination)
        progress(destination.stat().st_size, destination.stat().st_size)

    return fetch


def test_model_manager_verifies_and_atomically_installs_archive(tmp_path: Path) -> None:
    archive = _archive(tmp_path)
    spec = ModelSpec(
        model_id="streaming-test",
        url="https://example.invalid/model.tar.bz2",
        archive_size=archive.stat().st_size,
        archive_md5=md5(archive.read_bytes()).hexdigest(),
        directory="streaming-test",
        required_files=("tokens.txt", "encoder.onnx", "decoder.onnx", "joiner.onnx"),
    )
    progress = []
    manager = ModelManager(tmp_path / "models", fetcher=_copy_fetcher(archive))

    installed = manager.ensure_archive(spec, lambda current, total: progress.append((current, total)))
    assert installed == tmp_path / "models" / "streaming-test"
    assert manager.is_installed(spec) is True
    assert progress[-1][0] == progress[-1][1]
    assert not list((tmp_path / "models").glob("*.part"))


def test_model_manager_rejects_bad_digest_without_partial_install(tmp_path: Path) -> None:
    archive = _archive(tmp_path)
    spec = ModelSpec(
        model_id="streaming-test",
        url="https://example.invalid/model.tar.bz2",
        archive_size=archive.stat().st_size,
        archive_md5="0" * 32,
        directory="streaming-test",
        required_files=("tokens.txt",),
    )
    manager = ModelManager(tmp_path / "models", fetcher=_copy_fetcher(archive))
    with pytest.raises(ModelIntegrityError):
        manager.ensure_archive(spec)
    assert manager.is_installed(spec) is False
