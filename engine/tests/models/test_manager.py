"""ModelManager 下载、校验、原子切换与取消的测试（注入假 fetcher，不联网）。"""

from hashlib import sha256
from pathlib import Path

import pytest

from nola_translator_engine.models.catalog import (
    HYMT2_1_8B_Q4_K_M,
    M2M100_418M,
    QWEN3_ASR_0_6B_HF,
    QWEN3_ASR_1_7B_HF,
)
from nola_translator_engine.models.manager import (
    FileEntry,
    ModelIntegrityError,
    ModelManager,
    ModelSpec,
)


class _Cancelled(RuntimeError):
    """模拟资源层从 progress 回调抛出的取消异常。"""


def _entry(path: str, data: bytes) -> FileEntry:
    return FileEntry(path, len(data), sha256(data).hexdigest())


def _snapshot_spec() -> tuple[ModelSpec, dict[str, bytes]]:
    payloads = {
        "config.json": b'{"model_type": "qwen3_asr"}',
        "model.bin": bytes(range(256)) * 4,
        "tokens.txt": "a\nb\nc\n".encode("utf-8"),
    }
    spec = ModelSpec(
        model_id="qwen3-asr-1.7b-hf",
        directory="qwen3-asr-1.7b-hf",
        repo="Qwen/Qwen3-ASR-1.7B-hf",
        revision="pinned-test-revision",
        files=tuple(_entry(path, data) for path, data in payloads.items()),
    )
    urls = {spec.url_for(entry): payloads[entry.path] for entry in spec.files}
    return spec, urls


def _single_file_spec() -> tuple[ModelSpec, dict[str, bytes]]:
    data = b"GGUF" + b"\x00" * 512
    spec = ModelSpec(
        model_id="hy-mt2-1.8b-q4-k-m",
        directory="hy-mt2-1.8b-q4-k-m",
        repo="tencent/Hy-MT2-1.8B-GGUF",
        revision="pinned-test-revision",
        files=(_entry("Hy-MT2-1.8B-Q4_K_M.gguf", data),),
    )
    return spec, {spec.url_for(spec.files[0]): data}


def _fetcher(payloads: dict[str, bytes]):
    """按 URL 返回已知字节的假下载器；分两段写入以驱动累计进度。"""

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


def _leftovers(models_root: Path) -> list[Path]:
    if not models_root.exists():
        return []
    return list(models_root.iterdir())


def test_catalog_pins_s4_values() -> None:
    assert QWEN3_ASR_1_7B_HF.model_id == "qwen3-asr-1.7b-hf"
    assert QWEN3_ASR_1_7B_HF.revision == "bcd2b5b7f32b480ab5790554cfa8347f246a14f3"
    assert len(QWEN3_ASR_1_7B_HF.files) == 9
    assert QWEN3_ASR_1_7B_HF.total_bytes == 4_087_646_324
    model = next(f for f in QWEN3_ASR_1_7B_HF.files if f.path == "model.safetensors")
    assert model.size == 4_076_193_080
    assert model.sha256 == (
        "2db53c7d81bd9b8cbc6a074e89be2c968a0d373fb4ee68bb1b1e14f7042dfee1"
    )
    first = QWEN3_ASR_1_7B_HF.files[0]
    assert QWEN3_ASR_1_7B_HF.url_for(first) == (
        "https://huggingface.co/Qwen/Qwen3-ASR-1.7B-hf/resolve/"
        "bcd2b5b7f32b480ab5790554cfa8347f246a14f3/.gitattributes"
    )

    assert HYMT2_1_8B_Q4_K_M.model_id == "hy-mt2-1.8b-q4-k-m"
    assert HYMT2_1_8B_Q4_K_M.revision == "a0c709d9fac510f2c807aa3af52872340dc37a4a"
    assert len(HYMT2_1_8B_Q4_K_M.files) == 1
    gguf = HYMT2_1_8B_Q4_K_M.files[0]
    assert gguf.path == "Hy-MT2-1.8B-Q4_K_M.gguf"
    assert gguf.size == 1_133_080_448
    assert gguf.sha256 == (
        "dc5f44fcf1fa496ee7ad725982c0c8c553a4de00259b53af84c4b89fb0c06699"
    )
    assert HYMT2_1_8B_Q4_K_M.url_for(gguf) == (
        "https://huggingface.co/tencent/Hy-MT2-1.8B-GGUF/resolve/"
        "a0c709d9fac510f2c807aa3af52872340dc37a4a/Hy-MT2-1.8B-Q4_K_M.gguf"
    )


def test_catalog_pins_qwen3_asr_0_6b() -> None:
    # 必须钉 -hf 仓库：Qwen/Qwen3-ASR-0.6B 的 thinker 布局权重一个都加载不上。
    assert QWEN3_ASR_0_6B_HF.model_id == "qwen3-asr-0.6b-hf"
    assert QWEN3_ASR_0_6B_HF.repo == "Qwen/Qwen3-ASR-0.6B-hf"
    assert QWEN3_ASR_0_6B_HF.revision == "7f1569a48a89f3e3f4dc3a5c9d28bddd903bc76c"
    assert len(QWEN3_ASR_0_6B_HF.files) == 9
    assert QWEN3_ASR_0_6B_HF.total_bytes == 1_576_381_331
    weights = next(f for f in QWEN3_ASR_0_6B_HF.files if f.path == "model.safetensors")
    assert weights.size == 1_564_928_088
    assert weights.sha256 == (
        "d3f212dd20abecd315d830bc54ae3865e56ebfc3276484e57b771288ba27fd35"
    )
    processor = next(f for f in QWEN3_ASR_0_6B_HF.files if f.path == "processor_config.json")
    assert processor.sha256 == "bc0b230081b44e629dd5b9045b78495615c1831b4b9f4cffe97bd37e82a6156a"
    tokenizer_config = next(f for f in QWEN3_ASR_0_6B_HF.files if f.path == "tokenizer_config.json")
    assert tokenizer_config.sha256 == "945e980986de2ca7768f3326bfdbb4fbea3406f972b8ae0be233089f2b253c11"
    first = QWEN3_ASR_0_6B_HF.files[0]
    assert QWEN3_ASR_0_6B_HF.url_for(first) == (
        "https://huggingface.co/Qwen/Qwen3-ASR-0.6B-hf/resolve/"
        "7f1569a48a89f3e3f4dc3a5c9d28bddd903bc76c/.gitattributes"
    )


def test_catalog_pins_m2m100_418m() -> None:
    assert M2M100_418M.model_id == "m2m100-418m"
    assert M2M100_418M.revision == "55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636"
    assert len(M2M100_418M.files) == 9
    assert M2M100_418M.total_bytes == 1_941_936_305
    weights = next(f for f in M2M100_418M.files if f.path == "pytorch_model.bin")
    assert weights.size == 1_935_796_948
    assert weights.sha256 == (
        "d907ea45e4e4b9db163382a6674f6218b3c59566fe06d77f4055c208b4e87ed1"
    )
    spm = next(f for f in M2M100_418M.files if f.path == "sentencepiece.bpe.model")
    assert spm.sha256 == (
        "d8f7c76ed2a5e0822be39f0a4f95a55eb19c78f4593ce609e2edbc2aea4d380a"
    )
    assert M2M100_418M.url_for(weights) == (
        "https://huggingface.co/facebook/m2m100_418M/resolve/"
        "55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636/pytorch_model.bin"
    )


def test_snapshot_install_success(tmp_path: Path) -> None:
    spec, payloads = _snapshot_spec()
    manager = ModelManager(tmp_path / "models", fetcher=_fetcher(payloads))
    progress: list[tuple[int, int]] = []
    phases: list[str] = []

    target = manager.ensure(
        spec,
        lambda current, total: progress.append((current, total)),
        phases.append,
    )

    assert target == tmp_path / "models" / "qwen3-asr-1.7b-hf"
    assert manager.is_installed(spec) is True
    for entry in spec.files:
        assert (target / entry.path).read_bytes() == payloads[spec.url_for(entry)]
    # 进度单调累计并到达 1.0
    currents = [current for current, _ in progress]
    assert currents == sorted(currents)
    assert {total for _, total in progress} == {spec.total_bytes}
    assert progress[-1] == (spec.total_bytes, spec.total_bytes)
    # 阶段顺序 download → verify → install
    assert phases == ["download", "verify", "install"]
    # 无临时/暂存残留
    assert [p.name for p in _leftovers(tmp_path / "models")] == ["qwen3-asr-1.7b-hf"]
    assert not any(p.name.endswith(".part") for p in target.rglob("*"))


def test_incomplete_existing_model_is_not_installed(tmp_path: Path) -> None:
    spec, payloads = _snapshot_spec()
    target = tmp_path / "models" / spec.directory
    target.mkdir(parents=True)
    for entry in spec.files:
        (target / entry.path).write_bytes(payloads[spec.url_for(entry)])
    (target / spec.files[1].path).write_bytes(b"wrong size")
    assert ModelManager(tmp_path / "models").is_installed(spec) is False


def test_sha256_mismatch_rejected_without_target(tmp_path: Path) -> None:
    spec, payloads = _snapshot_spec()
    victim = spec.files[1]
    payloads[spec.url_for(victim)] = b"\x00" * victim.size  # 长度正确、内容不同
    manager = ModelManager(tmp_path / "models", fetcher=_fetcher(payloads))

    with pytest.raises(ModelIntegrityError):
        manager.ensure(spec)

    assert manager.is_installed(spec) is False
    assert _leftovers(tmp_path / "models") == []


def test_atomic_replace_quarantines_existing_target(tmp_path: Path) -> None:
    spec, payloads = _snapshot_spec()
    models = tmp_path / "models"
    target = models / spec.directory
    target.mkdir(parents=True)
    (target / "stale.bin").write_bytes(b"stale")
    corrupt = models / f".{spec.directory}.corrupt"
    corrupt.mkdir()
    (corrupt / "old-marker").write_text("old", encoding="utf-8")

    manager = ModelManager(models, fetcher=_fetcher(payloads))
    installed = manager.ensure(spec)

    assert installed == target
    assert manager.is_installed(spec) is True
    # 旧目标内容被新安装覆盖
    assert not (target / "stale.bin").exists()
    assert (target / "config.json").is_file()
    # 旧目标移入 .corrupt 隔离，并替换掉先前的隔离内容
    assert (corrupt / "stale.bin").read_bytes() == b"stale"
    assert not (corrupt / "old-marker").exists()


def test_cancel_mid_download_cleans_temp(tmp_path: Path) -> None:
    spec, payloads = _snapshot_spec()
    manager = ModelManager(tmp_path / "models", fetcher=_fetcher(payloads))
    calls = {"count": 0}

    def progress(_current: int, _total: int) -> None:
        calls["count"] += 1
        if calls["count"] >= 3:
            raise _Cancelled()

    with pytest.raises(_Cancelled):
        manager.ensure(spec, progress)

    assert manager.is_installed(spec) is False
    assert _leftovers(tmp_path / "models") == []


def test_single_file_gguf_install_success(tmp_path: Path) -> None:
    spec, payloads = _single_file_spec()
    manager = ModelManager(tmp_path / "models", fetcher=_fetcher(payloads))
    progress: list[tuple[int, int]] = []
    phases: list[str] = []

    installed = manager.ensure(
        spec,
        lambda current, total: progress.append((current, total)),
        phases.append,
    )

    gguf = installed / "Hy-MT2-1.8B-Q4_K_M.gguf"
    assert gguf.is_file()
    assert gguf.read_bytes() == payloads[spec.url_for(spec.files[0])]
    assert manager.is_installed(spec) is True
    assert progress[-1] == (spec.total_bytes, spec.total_bytes)
    assert phases == ["download", "verify", "install"]
    assert [p.name for p in _leftovers(tmp_path / "models")] == ["hy-mt2-1.8b-q4-k-m"]


def test_single_file_wrong_size_rejected(tmp_path: Path) -> None:
    data = b"GGUF" + b"\x00" * 100
    entry = FileEntry("Hy-MT2-1.8B-Q4_K_M.gguf", len(data) + 42, sha256(data).hexdigest())
    spec = ModelSpec(
        model_id="hy-mt2-1.8b-q4-k-m",
        directory="hy-mt2-1.8b-q4-k-m",
        repo="tencent/Hy-MT2-1.8B-GGUF",
        revision="pinned-test-revision",
        files=(entry,),
    )
    payloads = {spec.url_for(entry): data}
    manager = ModelManager(tmp_path / "models", fetcher=_fetcher(payloads))

    with pytest.raises(ModelIntegrityError):
        manager.ensure(spec)

    assert manager.is_installed(spec) is False
    assert _leftovers(tmp_path / "models") == []
