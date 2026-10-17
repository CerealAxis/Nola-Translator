"""Offline imports trust pinned manifests, not user-supplied package metadata."""
from hashlib import sha256
import json
from pathlib import Path
import subprocess

import pytest

from nola_translator_engine import offline_models as offline
from nola_translator_engine.models.manager import FileEntry, ModelSpec


@pytest.fixture
def sample(tmp_path, monkeypatch):
    files = {"model.gguf": b"weights", "chat_template.jinja": b"template"}
    spec = ModelSpec("sample", "sample", "owner/sample", "revision", tuple(
        FileEntry(name, len(data), sha256(data).hexdigest()) for name, data in files.items()))
    monkeypatch.setattr(offline, "catalog_specs", lambda: {spec.model_id: spec})
    source = tmp_path / "source"
    source.mkdir()
    for name, data in files.items():
        (source / name).write_bytes(data)
    return spec, source, tmp_path / "installed"


def test_inspect_checks_companions_and_digest(sample):
    _, source, root = sample
    assert offline.inspect(source, root)["compatible"]
    (source / "chat_template.jinja").unlink()
    preview = offline.inspect(source / "model.gguf", root)
    assert preview["issues"] == ["missingFiles"]
    assert preview["items"][0]["files"] == ["chat_template.jinja"]
    (source / "chat_template.jinja").write_bytes(b"tampered")
    assert offline.inspect(source, root)["issues"] == ["checksumMismatch"]


def test_install_copies_and_preserves_existing_on_corruption(sample):
    _, source, root = sample
    offline.install(source, root)
    assert (root / "sample/model.gguf").read_bytes() == b"weights"
    (source / "model.gguf").write_bytes(b"corrupt")
    with pytest.raises(offline.OfflineError):
        offline.install(source, root)
    assert (root / "sample/model.gguf").read_bytes() == b"weights"


def test_prepare_reuses_local_files_and_rejects_forged_manifest(sample, tmp_path):
    spec, source, root = sample
    offline.install(source, root)
    package = tmp_path / "bundle"
    offline.prepare([spec.model_id], root, package)
    assert offline.inspect(package, root)["compatible"]
    inventory = json.loads((package / "models.json").read_text())
    inventory["models"][0]["directory"] = "../escape"
    (package / "models.json").write_text(json.dumps(inventory))
    with pytest.raises(offline.OfflineError, match="invalidPackage"):
        offline.inspect(package, root)


def test_unknown_file_does_not_become_arbitrary_model(sample, tmp_path):
    _, _, root = sample
    unknown = tmp_path / "unknown.gguf"
    unknown.write_bytes(b"weights")
    assert offline.inspect(unknown, root)["issues"] == ["unsupportedModel"]


def test_same_size_installed_corruption_is_replaced(sample):
    _, source, root = sample
    offline.install(source, root)
    (root / "sample/model.gguf").write_bytes(b"broken!")
    assert offline.inspect(source, root)["items"][0]["status"] == "ready"
    offline.install(source, root)
    assert (root / "sample/model.gguf").read_bytes() == b"weights"


def test_package_cannot_authorize_new_digest(sample, tmp_path):
    spec, source, root = sample
    offline.install(source, root)
    package = tmp_path / "bundle"
    offline.prepare([spec.model_id], root, package)
    inventory = json.loads((package / "models.json").read_text())
    inventory["models"][0]["files"][0]["sha256"] = sha256(b"malware").hexdigest()
    (package / "models.json").write_text(json.dumps(inventory))
    with pytest.raises(offline.OfflineError, match="invalidPackage"):
        offline.install(package, root)


def test_prepare_downloads_without_installing_into_local_root(sample, tmp_path, monkeypatch):
    spec, source, root = sample
    def downloader(_manager, _network):
        class Download:
            def download(self, _url, part, entry, progress):
                part.write_bytes((source / entry.path).read_bytes())
                progress(entry.size, entry.size)
        return Download()
    monkeypatch.setattr(offline.ModelManager, "_downloader_for", downloader)
    package = tmp_path / "bundle"
    offline.prepare([spec.model_id], root, package)
    assert not root.exists()
    assert offline.inspect(package, root)["compatible"]


def test_exported_model_folder_can_be_imported(sample, tmp_path, monkeypatch):
    spec, source, root = sample
    def downloader(_manager, _network):
        class Download:
            def download(self, url, part, entry, progress):
                assert url.endswith(f"/{entry.path}")
                part.write_bytes((source / entry.path).read_bytes())
                progress(entry.size, entry.size)
        return Download()
    monkeypatch.setattr(offline.ModelManager, "_downloader_for", downloader)
    destination = tmp_path / "export.partial"
    offline.prepare([spec.model_id], root, destination, model_source="hf-mirror", export_model=True)
    assert not root.exists()
    manifest = json.loads((destination / "models" / spec.directory / "model-manifest.json").read_text())
    assert manifest["source"] == "huggingface"
    assert offline.inspect(destination / "models" / spec.directory, root)["compatible"]
    offline.install(destination / "models" / spec.directory, root)
    assert (root / spec.directory / "model.gguf").read_bytes() == b"weights"


def test_bundle_rejects_model_ancestor_junction(sample, tmp_path):
    spec, source, root = sample
    package = tmp_path / "bundle"
    package.mkdir()
    external = tmp_path / "external"
    offline.install(source, external)
    junction = package / "models"
    try:
        junction.symlink_to(external, target_is_directory=True)
    except OSError:
        result = subprocess.run(["cmd", "/c", "mklink", "/J", str(junction), str(external)],
                                capture_output=True)
        if result.returncode:
            pytest.skip("Directory links unavailable")
    try:
        (package / "models.json").write_text(json.dumps({"version": 1,
            "models": [offline._record(spec, "huggingface")]}))
        with pytest.raises(offline.OfflineError, match="invalidPackage"):
            offline.inspect(package, root)
    finally:
        junction.unlink() if junction.is_symlink() else junction.rmdir()


@pytest.mark.parametrize("contents", [" " * (1024 * 1024 + 1),
    json.dumps({"version": 1, "models": [{}] * 17})], ids=["oversized", "too-many-models"])
def test_bundle_rejects_unbounded_inventory(sample, tmp_path, contents):
    _, _, root = sample
    package = tmp_path / "bundle"
    package.mkdir()
    (package / "models.json").write_text(contents)
    with pytest.raises(offline.OfflineError, match="invalidPackage"):
        offline.inspect(package, root)
