"""Manual download instructions must match the manifests accepted by offline import."""
import json
from pathlib import Path
import subprocess
import sys

from nola_translator_engine.models import catalog
from nola_translator_engine.models.manager import ModelSpec

ROOT = Path(__file__).resolve().parents[3]
OUTPUT = ROOT / "src/shared/model-import-catalog.json"


def test_manual_catalog_matches_every_supported_source_and_file():
    entries = {entry["id"]: entry for entry in json.loads(OUTPUT.read_text("utf-8"))}
    specs = {spec.model_id: spec for spec in vars(catalog).values() if isinstance(spec, ModelSpec)}
    assert entries.keys() == specs.keys()
    for model_id, spec in specs.items():
        assert entries[model_id]["name"]
        assert entries[model_id]["family"] in ("recognition", "translation")
        expected_sources = {"huggingface", "hf-mirror"}
        if spec.modelscope_repo:
            expected_sources.add("modelscope")
        assert entries[model_id]["sources"].keys() == expected_sources
        for source, record in entries[model_id]["sources"].items():
            revision = spec.modelscope_revision if source == "modelscope" else spec.revision
            assert record["revision"] == revision
            if source == "modelscope":
                assert record["repositoryUrl"] == (
                    f"https://modelscope.cn/models/{spec.modelscope_repo}/files?Revision={revision}"
                )
            else:
                host = "huggingface.co" if source == "huggingface" else "hf-mirror.com"
                assert record["repositoryUrl"] == f"https://{host}/{spec.repo}/tree/{revision}"
            assert record["files"] == [
                {"path": file.path, "size": file.size, "url": spec.url_for(file, source=source)}
                for file in spec.files_for(source)
            ]


def test_snapshot_templates_are_downloadable_and_runtime_template_is_not_required():
    entries = {entry["id"]: entry for entry in json.loads(OUTPUT.read_text("utf-8"))}
    for model_id in ("qwen3-asr-0.6b-hf", "qwen3-asr-1.7b-hf"):
        for source in entries[model_id]["sources"].values():
            assert "chat_template.jinja" in {file["path"] for file in source["files"]}
    # Hy-MT2 7B's template is embedded in the application, not an import prerequisite.
    for source in entries["hy-mt2-7b-q4-k-m"]["sources"].values():
        assert len(source["files"]) == 1
        assert source["files"][0]["path"].endswith(".gguf")


def test_generated_catalog_is_current():
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts/generate-model-import-catalog.py"), "--check"],
        capture_output=True, text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_alternate_source_retains_its_independent_files():
    entries = {entry["id"]: entry for entry in json.loads(OUTPUT.read_text("utf-8"))}
    sources = entries["hy-mt2-1.8b-q3-k-m"]["sources"]
    hf, modelscope = sources["huggingface"], sources["modelscope"]
    assert hf["revision"] != modelscope["revision"]
    assert hf["files"][0]["size"] != modelscope["files"][0]["size"]
    assert hf["files"][0]["url"].startswith("https://huggingface.co/unsloth/")
    assert modelscope["files"][0]["url"].startswith("https://www.modelscope.cn/models/fss618/")
