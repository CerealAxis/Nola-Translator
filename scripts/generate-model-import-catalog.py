"""Export pinned manual-download links from the engine's trusted local manifests."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "engine"))

from nola_translator_engine.models import catalog
from nola_translator_engine.models.crisp_catalog import (ADDITIONAL_TTS_NAMES, ADDITIONAL_TTS_SPECS,
    CRISP_ASR_SPECS, QWEN3_TTS_NAMES, QWEN3_TTS_SPECS)
from nola_translator_engine.models.qwen_gguf_catalog import QWEN3_ASR_GGUF_SPECS
from nola_translator_engine.models.qwen35_catalog import QWEN35_NAMES, QWEN35_SPECS
from nola_translator_engine.models.manager import ModelSpec

NAMES = {
    "qwen3-asr-1.7b-hf": "Qwen3-ASR 1.7B",
    "qwen3-asr-0.6b-hf": "Qwen3-ASR 0.6B",
    "qwen3-asr-0.6b-gguf-q4-k-m": "Qwen3-ASR 0.6B Q4_K_M",
    "qwen3-asr-1.7b-gguf-q4-k-m": "Qwen3-ASR 1.7B Q4_K_M",
    "qwen3-asr-0.6b-gguf-q8-0": "Qwen3-ASR 0.6B Q8_0",
    "qwen3-asr-0.6b-gguf-bf16": "Qwen3-ASR 0.6B BF16",
    "qwen3-asr-1.7b-gguf-q8-0": "Qwen3-ASR 1.7B Q8_0",
    "qwen3-asr-1.7b-gguf-bf16": "Qwen3-ASR 1.7B BF16",
    "sensevoice-small": "SenseVoiceSmall",
    "sensevoice-small-crisp-q4-k": "SenseVoiceSmall Q4_K",
    "sensevoice-small-crisp-q8-0": "SenseVoiceSmall Q8_0",
    "sensevoice-small-crisp-f16": "SenseVoiceSmall F16",
    "qwen3-asr-0.6b-crisp-q4-k": "Qwen3-ASR 0.6B Q4_K",
    "qwen3-asr-0.6b-crisp-q8-0": "Qwen3-ASR 0.6B Q8_0",
    "qwen3-asr-0.6b-crisp-f16": "Qwen3-ASR 0.6B F16",
    "qwen3-asr-1.7b-crisp-q4-k": "Qwen3-ASR 1.7B Q4_K",
    "qwen3-asr-1.7b-crisp-q8-0": "Qwen3-ASR 1.7B Q8_0",
    "qwen3-asr-1.7b-crisp-f16": "Qwen3-ASR 1.7B F16",
    "hy-mt2-1.8b-q4-k-m": "Hy-MT2 1.8B Q4_K_M",
    "hy-mt2-1.8b-q3-k-m": "Hy-MT2 1.8B Q3_K_M",
    "hy-mt2-1.8b-iq2-m": "Hy-MT2 1.8B UD-IQ2_M",
    "hy-mt2-7b-q4-k-m": "Hy-MT2 7B Q4_K_M",
    "m2m100-418m": "M2M100 418M",
    "index-translate-2b-q4-k-m": "Index-Translate 2B Q4_K_M",
    "index-translate-9b-q4-k-m": "Index-Translate 9B Q4_K_M",
    "index-translate-35b-a3b-q4-k-m": "Index-Translate 35B-A3B preview Q4_K_M",
    "index-translate-2b-bf16": "Index-Translate 2B BF16",
    "index-translate-2b-fp8": "Index-Translate 2B FP8",
    "index-translate-2b-fp4": "Index-Translate 2B FP4",
    "index-translate-9b-bf16": "Index-Translate 9B BF16",
    "index-translate-9b-fp8": "Index-Translate 9B FP8",
    "index-translate-9b-fp4": "Index-Translate 9B FP4",
    "index-translate-35b-a3b-preview-bf16": "Index-Translate 35B-A3B preview BF16",
    "index-translate-35b-a3b-preview-fp8": "Index-Translate 35B-A3B preview FP8",
    "index-translate-35b-a3b-preview-fp4": "Index-Translate 35B-A3B preview FP4",
    "fun-asr-nano-q4-k": "Fun-ASR Nano Q4_K",
    "fun-asr-nano-q8-0": "Fun-ASR Nano Q8_0",
    "fun-asr-nano-f16": "Fun-ASR Nano F16",
    "vibevoice-asr-q4-k": "VibeVoice-ASR Q4_K",
    "vibevoice-asr-q8-0": "VibeVoice-ASR Q8_0",
    "vibevoice-asr-f16": "VibeVoice-ASR F16",
    "mimo-v2.5-asr-q4-k": "MiMo-V2.5-ASR Q4_K",
    "mimo-v2.5-asr-f16": "MiMo-V2.5-ASR F16",
}
NAMES.update(QWEN3_TTS_NAMES)
NAMES.update(ADDITIONAL_TTS_NAMES)
NAMES.update(QWEN35_NAMES)
RECOGNITION_IDS = {"qwen3-asr-1.7b-hf", "qwen3-asr-0.6b-hf", "sensevoice-small", *(spec.model_id for spec in CRISP_ASR_SPECS), *(spec.model_id for spec in QWEN3_ASR_GGUF_SPECS)}
TTS_IDS = {spec.model_id for spec in QWEN3_TTS_SPECS + ADDITIONAL_TTS_SPECS}


def generate() -> str:
    specs = {spec.model_id: spec for spec in vars(catalog).values() if isinstance(spec, ModelSpec)}
    specs.update({spec.model_id: spec for spec in CRISP_ASR_SPECS})
    specs.update({spec.model_id: spec for spec in QWEN3_TTS_SPECS})
    specs.update({spec.model_id: spec for spec in ADDITIONAL_TTS_SPECS})
    specs.update({spec.model_id: spec for spec in QWEN35_SPECS})
    specs.update({spec.model_id: spec for spec in QWEN3_ASR_GGUF_SPECS})
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
                        "family": "recognition" if model_id in RECOGNITION_IDS else "tts" if model_id in TTS_IDS else "translation",
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
