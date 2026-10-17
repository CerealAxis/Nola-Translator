"""Export pinned manual-download links from the engine's trusted local manifests."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))

from nola_translator_engine.models import catalog
from nola_translator_engine.models.manager import ModelSpec

NAMES = {
    "qwen3-asr-1.7b-hf": "Qwen3-ASR 1.7B",
    "qwen3-asr-0.6b-hf": "Qwen3-ASR 0.6B",
    "sensevoice-small": "SenseVoiceSmall",
    "hy-mt2-1.8b-q4-k-m": "Hy-MT2 1.8B Q4_K_M",
    "hy-mt2-1.8b-q3-k-m": "Hy-MT2 1.8B Q3_K_M",
    "hy-mt2-1.8b-iq2-m": "Hy-MT2 1.8B UD-IQ2_M",
    "hy-mt2-7b-q4-k-m": "Hy-MT2 7B Q4_K_M",
    "m2m100-418m": "M2M100 418M",
    "index-translate-2b-q4-k-m": "Index-Translate 2B Q4_K_M",
    "index-translate-9b-q4-k-m": "Index-Translate 9B Q4_K_M",
    "index-translate-35b-a3b-q4-k-m": "Index-Translate 35B-A3B preview Q4_K_M",
}
RECOGNITION_IDS = {"qwen3-asr-1.7b-hf", "qwen3-asr-0.6b-hf", "sensevoice-small"}


def generate() -> str:
    specs = {spec.model_id: spec for spec in vars(catalog).values() if isinstance(spec, ModelSpec)}
    if specs.keys() != NAMES.keys():
        raise ValueError("Update manual-download product names for the engine model catalog")
    entries = []
    for model_id, name in NAMES.items():
        spec = specs[model_id]
        sources = {}
        for source in ("huggingface", "hf-mirror", "modelscope"):
            if source == "modelscope" and not spec.modelscope_repo:
                continue
            revision = spec.modelscope_revision if source == "modelscope" else spec.revision
            if source == "modelscope":
                repository_url = f"https://modelscope.cn/models/{spec.modelscope_repo}/files?Revision={revision}"
            else:
                host = "huggingface.co" if source == "huggingface" else "hf-mirror.com"
                repository_url = f"https://{host}/{spec.repo}/tree/{revision}"
            sources[source] = {
                "revision": revision,
                "repositoryUrl": repository_url,
                "files": [{"path": file.path, "size": file.size, "url": spec.url_for(file, source=source)}
                          for file in spec.files_for(source)],
            }
        entries.append({"id": model_id, "name": name,
                        "family": "recognition" if model_id in RECOGNITION_IDS else "translation",
                        "sources": sources})
    return json.dumps(entries, ensure_ascii=False, indent=2) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if checked-in output is stale")
    args = parser.parse_args()
    output = ROOT / "src/shared/model-import-catalog.json"
    generated = generate()
    if args.check:
        if not output.exists() or output.read_text("utf-8") != generated:
            print("Manual download catalog is stale; run scripts/generate-model-import-catalog.py")
            return 1
        return 0
    output.write_text(generated, encoding="utf-8", newline="\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
