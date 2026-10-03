import json
from urllib.parse import parse_qs, urlparse

from nola_translator_engine.hub import search_repos


def model(repo, library, files, **extra):
    return {"id": repo, "library_name": library, "siblings": [
        {"rfilename": path} for path in files
    ], **extra}


def test_search_filters_weight_formats_without_per_repo_inspection():
    calls = []
    payload = [
        model("org/coreml", "whisperkit", ["model.mlmodelc"]),
        model("org/onnx", "onnx", ["model.onnx"]),
        model("org/pytorch", "transformers", ["model.safetensors", "config.json"]),
        model("org/torch-bin", "transformers", ["pytorch_model.bin"]),
        model("org/gguf", "llama.cpp", ["model.gguf"], gguf={"architecture": "qwen3"}),
        model("org/whisper-cpp", "whisper.cpp", ["model.gguf"]),
        model("org/gated", "transformers", ["model.safetensors"], gated="auto"),
        model("org/other-safetensors", "flax", ["model.safetensors"]),
    ]

    def fetch(url):
        calls.append(url)
        assert "/api/models?" in url  # A config/detail request would fail this test.
        return json.dumps(payload).encode()

    result = search_repos(" speech ", fetch=fetch)
    assert len(calls) == 1
    assert result.query == "speech"
    assert [info.repo for info in result.repos] == ["org/pytorch", "org/torch-bin", "org/gguf"]
    assert "siblings" in parse_qs(urlparse(calls[0]).query)["expand"]


def test_quantization_filter_is_applied_before_the_page_limit():
    def fetch(url):
        assert parse_qs(urlparse(url).query)["filter"] == ["gguf"]
        return json.dumps([
            model("org/torch", "transformers", ["model.safetensors"]),
            model("org/gguf", "llama.cpp", ["model.gguf"]),
        ]).encode()

    assert [info.repo for info in search_repos("", weight_format="gguf", limit=1, fetch=fetch).repos] == ["org/gguf"]


def test_task_tags_without_pipeline_tag_remain_searchable():
    payload = [model("org/asr", "transformers", ["model.safetensors"], tags=["automatic-speech-recognition"])]
    result = search_repos("", slot="recognition", fetch=lambda _: json.dumps(payload).encode())
    assert [info.repo for info in result.repos] == ["org/asr"]


def test_invalid_and_duplicate_rows_do_not_replace_real_results():
    row = model("org/asr", "transformers", ["model.safetensors"])
    payload = [{"id": []}, {"id": "invalid"}, row, row]
    result = search_repos("", fetch=lambda _: json.dumps(payload).encode())
    assert len(result.repos) == 1
