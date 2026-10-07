"""Read-only Hugging Face inspection: what a model declares about itself decides whether it can
be installed, and which loader runs it.

The engine never picks a loader from a model *name*. Every repo is judged by the artifacts it
publishes, in this order:

1. ``GET /api/models/{owner}/{repo}?blobs=true`` — the commit ``sha`` (pin it and every later
   download is reproducible), the sibling file names with sizes, the official per-file sha256 for
   LFS-tracked files (``siblings[].lfs.sha256``), plus ``pipeline_tag``, ``library_name``, tags and
   the ``gguf`` block.
2. ``GET /{owner}/{repo}/resolve/{sha}/config.json`` — ``model_type`` and ``architectures``, which
   is what the transformers path is keyed on.

A repo that yields no verdict comes back ``compatible=False`` with the evidence that was missing.
Guessing is the one unacceptable outcome here: a wrong loader is either a multi-gigabyte download
that dies at load time, or worse, a model that loads fine and is simply not the architecture the
user asked for.

This module also owns the HTTP status → error-code mapping, because it is the same concern from
the other side. 401/403/404/429 are all ``urllib.error.HTTPError`` subclasses, so folding them in
with ``URLError`` reports "网络不可用" for a typo'd repo name or a gated model, and sends the user
chasing a network problem they do not have.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
import json
import re
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlencode, urlparse
from urllib.request import Request, urlopen

from .translation.m2m100 import FLORES_LANGUAGES


Slot = Literal["recognition", "translation"]
Loader = Literal["llama.cpp", "transformers", "funasr"]

HF_ROOT = "https://huggingface.co"
USER_AGENT = "Nola Translator/0.1"
#: The model card, the config and a sharded index are all small; a repo whose file list would
#: exceed this is answered as unreadable rather than buffered into memory.
MAX_INSPECTION_BYTES = 8 * 1024 * 1024


# --------------------------------------------------------------------------------------
# HTTP status → engine error code
# --------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class HubError:

    code: str
    reason: str
    status: int | None = None


def classify_hub_error(error: BaseException) -> HubError | None:
    """Map a transport failure to an engine error code; ``None`` when it is not a hub failure.

    ``HTTPError`` subclasses ``URLError`` subclasses ``OSError``, so the checks have to run from
    the most specific down. Only a genuine transport failure is ``networkUnavailable``: a 404 is
    a repo that does not exist, and saying otherwise sends the user to debug their router.
    """
    if isinstance(error, HTTPError):
        status = error.code
        if status == 404:
            return HubError("resourceNotFound", "hubRepoNotFound", status)
        if status == 401:
            return HubError("resourceUnavailable", "hubUnauthorized", status)
        if status == 403:
            return HubError("resourceUnavailable", "hubForbidden", status)
        if status == 429:
            return HubError("resourceUnavailable", "hubRateLimited", status)
        if 500 <= status <= 599:
            return HubError("resourceUnavailable", "hubServerError", status)
        return HubError("resourceUnavailable", "hubHttpError", status)
    # URLError, TimeoutError (socket.timeout aliases it) and ConnectionError are all transport
    # failures; a bare OSError covers DNS and reset cases raised below urllib.
    if isinstance(error, (URLError, TimeoutError, ConnectionError, OSError)):
        return HubError("networkUnavailable", "hubUnreachable")
    return None


class HubInspectionError(RuntimeError):
    """HuggingFace answered, but not with something this engine can read."""


# --------------------------------------------------------------------------------------
# What the repo says about itself
# --------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class HubFile:
    path: str
    size: int | None = None
    sha256: str | None = None
    """The sha256 HuggingFace publishes for this file.

    Only LFS-tracked files carry one through the API; small git blobs expose just a git blob id
    (``blob_sha1``) instead. ``None`` therefore means "not published", never "unverified" — the
    install path still pins a digest per file, this is only what a hub inspection can hand back.
    """

    blob_sha1: str | None = None
    """Git's object id for this file, as published in ``siblings[].blobId``.

    Present for every file in a ``?blobs=true`` response, and the only content digest there is
    for the non-LFS ones. The install path uses it to verify config.json and the tokenizer files
    rather than dropping them from the download.
    """


@dataclass(frozen=True, slots=True)
class HubRepoInfo:
    """Everything the engine learned about a repo without downloading a single weight."""

    repo: str
    revision: str | None = None
    files: tuple[HubFile, ...] = ()
    pipeline_tag: str | None = None
    library_name: str | None = None
    tags: tuple[str, ...] = ()
    gguf_architecture: str | None = None
    gguf_chat_template: str | None = None
    model_type: str | None = None
    architectures: tuple[str, ...] = ()
    is_private: bool = False
    is_gated: bool = False
    author: str | None = None
    downloads: int | None = None
    last_modified: str | None = None

    @property
    def file_names(self) -> frozenset[str]:
        return frozenset(item.path for item in self.files)

    def has(self, *names: str) -> bool:
        """Whether every one of ``names`` is published by this repo."""
        published = self.file_names
        return all(name in published for name in names)

    @property
    def gguf_files(self) -> tuple[HubFile, ...]:
        return tuple(item for item in self.files if item.path.casefold().endswith(".gguf"))

    @property
    def is_installable_digest_set(self) -> bool:
        """Whether every published file carries a digest the install path can check.

        Size alone is not integrity. A repo whose file list has an undigested entry is refused
        rather than installed with the hole papered over.
        """
        return bool(self.files) and all(
            item.sha256 is not None or item.blob_sha1 is not None for item in self.files
        )

    @property
    def total_bytes(self) -> int | None:
        """Total published size, or ``None`` when any file's size is missing."""
        if not self.files:
            return None
        sizes = [item.size for item in self.files]
        if any(size is None for size in sizes):
            return None
        return sum(sizes)  # type: ignore[arg-type]


# --------------------------------------------------------------------------------------
# The runtime adapter registry
# --------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class RuntimeAdapter:
    """One loader the engine can actually run, and everything it needs to recognise its models.

    A repo has to clear ``required_files`` and land a weight from one ``weight_groups`` entry to
    be installable. ``layout_files`` is the fallback key for loaders whose snapshots carry no
    transformers ``config.json`` at all (funasr), where the file layout is the only honest signal.
    ``rejected_files`` is a hard veto rather than a warning: see the funasr entry.
    """

    adapter_id: str
    loader: Loader
    slot: Slot
    label: str
    model_types: frozenset[str] = frozenset()
    architectures: frozenset[str] = frozenset()
    layout_files: tuple[str, ...] = ()
    required_files: tuple[str, ...] = ()
    weight_groups: tuple[tuple[str, ...], ...] = ()
    rejected_files: tuple[str, ...] = ()
    remote_code: bool = False
    languages: tuple[str, ...] | None = None
    """Protocol language codes the loader covers, or ``None`` when the canonical table belongs to
    the runtime module (it pulls torch in, and this registry must stay importable without it)."""


HYMT2_LANGUAGES: dict[str, str] = {
    "zh": "Chinese",
    "en": "English",
    "fr": "French",
    "pt": "Portuguese",
    "es": "Spanish",
    "ja": "Japanese",
    "tr": "Turkish",
    "ru": "Russian",
    "ar": "Arabic",
    "ko": "Korean",
    "th": "Thai",
    "it": "Italian",
    "de": "German",
    "vi": "Vietnamese",
    "ms": "Malay",
    "id": "Indonesian",
    "tl": "Filipino",
    "hi": "Hindi",
    "zh-Hant": "Traditional Chinese",
    "pl": "Polish",
    "cs": "Czech",
    "nl": "Dutch",
    "km": "Khmer",
    "my": "Burmese",
    "fa": "Persian",
    "gu": "Gujarati",
    "ur": "Urdu",
    "te": "Telugu",
    "mr": "Marathi",
    "he": "Hebrew",
    "bn": "Bengali",
    "ta": "Tamil",
    "uk": "Ukrainian",
    "bo": "Tibetan",
    "kk": "Kazakh",
    "mn": "Mongolian",
    "ug": "Uyghur",
    "yue": "Cantonese",
}


# llama.cpp's `general.architecture` names, the same strings HuggingFace echoes in
# `gguf.architecture`.
LLAMA_CPP_ARCHITECTURES: frozenset[str] = frozenset(
    {
        "hunyuan-dense",
        "llama",
        "qwen2",
        "qwen3",
        "qwen3moe",
        "gemma",
        "gemma2",
        "gemma3",
        "mistral",
        "mixtral",
        "phi3",
        "deepseek2",
        "glm4",
        "minicpm3",
        "internlm2",
        "starcoder2",
    }
)

# Encoder-decoder families. llama.cpp implements decoder-only architectures and its
# convert_hf_to_gguf.py raises NotImplementedError on anything else; the engine ships no
# encoder-decoder loader of its own either. Naming them turns a bare "no adapter matched" into a
# reason the user can act on instead of retrying with another repo of the same family.
ENCODER_DECODER_MODEL_TYPES: frozenset[str] = frozenset(
    {
        "marian",
        "nllb",
        "mbart",
        "plbart",
        "bart",
        "blenderbot",
        "mvp",
        "t5",
        "umt5",
        "whisper",
        "speech_t5",
        "trocr",
    }
)

# GGUF files exist for whisper too, but they are whisper.cpp's dialect rather than llama.cpp's:
# the repo declares itself a whisper.cpp library and carries no `gguf.architecture`. The engine
# recognises audio through transformers/funasr and translates through llama-server, so neither
# path can load them — a file extension match would happily hand the user a dead download.
WHISPER_CPP_LIBRARIES: frozenset[str] = frozenset({"whisper.cpp", "whisper-cpp"})


QWEN3_ASR_ADAPTER = RuntimeAdapter(
    adapter_id="qwen3-asr",
    loader="transformers",
    slot="recognition",
    label="transformers · Qwen3ASRForConditionalGeneration",
    model_types=frozenset({"qwen3_asr"}),
    architectures=frozenset({"Qwen3ASRForConditionalGeneration"}),
    # AutoProcessor plus the streaming apply_chat_template path need the whole -hf layout. The
    # thinker-layout repo publishes the same model_type but its weight keys match no parameter,
    # and from_pretrained answers that by random-initialising everything in silence — so the
    # processor and chat-template files are required, not merely preferred.
    required_files=(
        "config.json",
        "processor_config.json",
        "tokenizer_config.json",
        "chat_template.jinja",
    ),
    weight_groups=(("model.safetensors",), ("model.safetensors.index.json",)),
    languages=None,  # recognition/qwen_runtime.py CODE_TO_NAME — 30 codes, torch-gated module
)

SENSEVOICE_ADAPTER = RuntimeAdapter(
    adapter_id="sensevoice",
    loader="funasr",
    slot="recognition",
    label="funasr · AutoModel",
    # A funasr snapshot publishes no transformers config.json, so the layout is the only signal
    # there is: configuration.json declares init_param/config and model.pt is the weight.
    layout_files=("configuration.json", "model.pt"),
    required_files=("config.yaml", "am.mvn"),
    # funasr runs a repo's own modeling code under trust_remote_code, and it pip-installs that
    # repo's requirements.txt while doing so. SenseVoiceSmall pins numpy<=1.26.4 there, which
    # would replace the engine's own numpy. The curated catalog sidesteps this by enumerating a
    # safe file list; an arbitrary repo has no such list, so it is refused instead of guessed.
    rejected_files=("requirements.txt",),
    remote_code=True,
    languages=("zh", "en", "yue", "ja", "ko"),
)

M2M100_ADAPTER = RuntimeAdapter(
    adapter_id="m2m100",
    loader="transformers",
    slot="translation",
    label="transformers · M2M100ForConditionalGeneration",
    # `m2m_100` with the underscore, because that is what the model's own config.json declares
    # (verified against facebook/m2m100_418M).
    model_types=frozenset({"m2m_100"}),
    architectures=frozenset({"M2M100ForConditionalGeneration"}),
    required_files=("config.json", "tokenizer_config.json", "vocab.json"),
    weight_groups=(
        ("pytorch_model.bin",),
        ("model.safetensors",),
        ("model.safetensors.index.json",),
    ),
    languages=tuple(sorted(FLORES_LANGUAGES)),
)

# Order is the tie-break when two adapters could claim the same repo; a specific model_type match
# always beats a layout match, which is why the registry is scanned by key before by layout.
RUNTIME_ADAPTERS: tuple[RuntimeAdapter, ...] = (
    QWEN3_ASR_ADAPTER,
    SENSEVOICE_ADAPTER,
    M2M100_ADAPTER,
)

_ADAPTER_BY_ID: dict[str, RuntimeAdapter] = {item.adapter_id: item for item in RUNTIME_ADAPTERS}


def adapter_by_id(adapter_id: str) -> RuntimeAdapter | None:
    return _ADAPTER_BY_ID.get(adapter_id)


# --------------------------------------------------------------------------------------
# The verdict
# --------------------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class RuntimeVerdict:
    """Installability of one repo, with the evidence it was decided on."""

    compatible: bool
    reason_code: str
    reason: str
    slot: Slot | None = None
    loader: Loader | None = None
    adapter_id: str | None = None
    languages: tuple[str, ...] = ()
    evidence: tuple[tuple[str, str], ...] = ()

    @property
    def evidence_map(self) -> dict[str, str]:
        return dict(self.evidence)

    @property
    def loader_label(self) -> str | None:
        adapter = self.adapter_id and _ADAPTER_BY_ID.get(self.adapter_id)
        return adapter.label if adapter is not None else self.loader


def _reject(
    reason_code: str,
    reason: str,
    info: HubRepoInfo,
    evidence: dict[str, str] | None = None,
) -> RuntimeVerdict:
    return RuntimeVerdict(
        compatible=False,
        reason_code=reason_code,
        reason=reason,
        evidence=_evidence(info, evidence),
    )


def _evidence(info: HubRepoInfo, extra: dict[str, str] | None = None) -> tuple[tuple[str, str], ...]:
    """Model-derived facts, in a fixed order, so two runs of the same repo compare equal."""
    facts: dict[str, str] = {
        "repo": info.repo,
        "revision": info.revision or "unknown",
        "pipelineTag": info.pipeline_tag or "none",
        "libraryName": info.library_name or "none",
        "fileCount": str(len(info.files)),
    }
    if info.gguf_architecture:
        facts["gguf.architecture"] = info.gguf_architecture
    if info.model_type:
        facts["model_type"] = info.model_type
    if info.architectures:
        facts["architectures"] = ",".join(info.architectures)
    for key, value in (extra or {}).items():
        facts[key] = value
    return tuple(facts.items())


# --------------------------------------------------------------------------------------
# Detection
# --------------------------------------------------------------------------------------


def _library_names(info: HubRepoInfo) -> set[str]:
    names = {info.library_name.casefold()} if info.library_name else set()
    names.update(tag.casefold() for tag in info.tags)
    return names


def _verdict_gguf(info: HubRepoInfo) -> RuntimeVerdict:
    """The llama.cpp path: a GGUF is already converted, so the architecture is all we need."""
    architecture = info.gguf_architecture
    if not architecture:
        return _reject(
            "ggufArchitectureUnknown",
            "仓库里有 GGUF 文件，但没有声明 gguf.architecture，引擎无法判断 llama.cpp "
            "能否加载它。请确认这是 llama.cpp 转换过的权重，而不是 whisper.cpp 等其他格式。",
            info,
            {"ggufFiles": ",".join(item.path for item in info.gguf_files) or "none"},
        )
    if architecture not in LLAMA_CPP_ARCHITECTURES:
        return _reject(
            "llamaCppUnsupportedArchitecture",
            f"llama.cpp 不支持架构 {architecture}。引擎只接受 "
            f"{'、'.join(sorted(LLAMA_CPP_ARCHITECTURES))} 这些 decoder-only 架构。",
            info,
        )
    if info.pipeline_tag not in (None, "translation"):
        # A *declared* different pipeline is a real refusal. An **absent** one is not: a GGUF
        # repo that says nothing at all is common in practice (tencent/Hy-MT2-1.8B-GGUF, the
        # one this app ships, carries no pipeline_tag), and reading silence as "this is not a
        # translation model" refuses the model the app already depends on. The loader that
        # consumes a GGUF here is llama-server, so silence leaves translation as the only
        # remaining job for it; the evidence records that the tag was absent so the decision
        # stays auditable.
        return _reject(
            "slotUnsupportedForLoader",
            f"这个 GGUF 的 pipeline_tag 是 {info.pipeline_tag}，而引擎的 "
            "llama-server 路径只服务翻译模型（llama.cpp 跑不了 encoder-decoder 的语音识别模型）。",
            info,
        )
    if not info.gguf_files:
        return _reject(
            "ggufFileMissing",
            "仓库声明了 gguf.architecture，但文件列表里没有 .gguf 权重，无法安装。",
            info,
        )
    undigested = _undigested_files(info)
    if undigested:
        return _reject(
            "hubNoPublishedDigest",
            f"仓库没有为 {'、'.join(undigested)} 发布可校验的摘要，下载后无法验证完整性，"
            "因此拒绝安装。",
            info,
            {"undigestedFiles": ",".join(undigested)},
        )
    return RuntimeVerdict(
        compatible=True,
        reason_code="llamaCppTranslationModel",
        reason=f"llama.cpp 可以加载 {architecture}，由内置 llama-server 提供翻译。",
        slot="translation",
        loader="llama.cpp",
        adapter_id="llama.cpp",
        languages=(),
        evidence=_evidence(info, {"ggufFiles": ",".join(item.path for item in info.gguf_files)}),
    )


def _undigested_files(info: HubRepoInfo) -> list[str]:
    """Published files HuggingFace gave no content digest for, so nothing could verify them."""
    return [
        item.path
        for item in info.files
        if item.sha256 is None and item.blob_sha1 is None
    ]


def _adapter_missing_files(adapter: RuntimeAdapter, info: HubRepoInfo) -> list[str]:
    """Which of the adapter's required files the repo does not publish."""
    return [name for name in adapter.required_files if name not in info.file_names]


def _adapter_has_weights(adapter: RuntimeAdapter, info: HubRepoInfo) -> bool:
    """Whether the repo carries a weight the adapter can load.

    An adapter that declares no ``weight_groups`` is saying its ``layout_files`` already pin the
    weight down — the funasr signature names model.pt — so it imposes no extra requirement.
    """
    if not adapter.weight_groups:
        return True
    published = info.file_names
    return any(
        any(name in published for name in group) for group in adapter.weight_groups
    )


def _adapter_for(info: HubRepoInfo) -> tuple[RuntimeAdapter | None, str]:
    """The adapter claiming this repo, and why it lost when nothing did.

    Keyed on the model's own ``model_type``/``architectures`` first. The layout pass is the
    fallback for loaders that publish no transformers config at all, and it runs last precisely
    because a layout match is weaker evidence than a declared architecture.
    """
    if info.model_type or info.architectures:
        for adapter in RUNTIME_ADAPTERS:
            if info.model_type in adapter.model_types or (
                set(info.architectures) & adapter.architectures
            ):
                return adapter, "model_type"
        if info.model_type in ENCODER_DECODER_MODEL_TYPES:
            return None, "encoderDecoder"
        return None, "unknownArchitecture"

    for adapter in RUNTIME_ADAPTERS:
        if adapter.layout_files and info.has(*adapter.layout_files):
            return adapter, "layout"
    return None, "undetermined"


def detect_runtime(info: HubRepoInfo) -> RuntimeVerdict:
    """Decide whether a repo can be installed, and by which loader. Pure: no I/O, no globals.

    The check order is the specification, and each step only runs when the previous one could not
    decide: library family first (a whisper.cpp GGUF is a different format wearing a .gguf name),
    then the GGUF branch, then visibility, then the transformers config branch, then the layout
    fallback. Anything left over is an explicit refusal.
    """
    if _library_names(info) & WHISPER_CPP_LIBRARIES:
        return _reject(
            "whisperCppFormat",
            "这是 whisper.cpp 的仓库。它的 GGUF 是 whisper.cpp 的专有转换格式，llama.cpp "
            "读不了；引擎的识别走 transformers/funasr，也不接受这种权重。",
            info,
        )

    if info.gguf_architecture or info.gguf_files:
        return _verdict_gguf(info)

    if info.is_gated:
        return _reject(
            "hubGated",
            "这是一个受限仓库（gated），未授权时看不到它的文件结构，无法判断能不能装。"
            "请先在 Hugging Face 上接受授权。",
            info,
        )
    if info.is_private:
        return _reject(
            "hubPrivate",
            "这是一个私有仓库，未授权时看不到它的文件结构，无法判断能不能装。",
            info,
        )

    adapter, matched_by = _adapter_for(info)
    if adapter is None:
        return _reject(
            "noRegisteredAdapter"
            if matched_by == "unknownArchitecture"
            else "unsupportedArchitecture",
            _no_adapter_reason(matched_by, info),
            info,
        )

    if adapter.rejected_files:
        blocked = [name for name in adapter.rejected_files if name in info.file_names]
        if blocked:
            return _reject(
                "repositoryInstallsDependencies",
                f"这个 {adapter.loader} 仓库带有 {blocked[0]}。该加载器会用 "
                "trust_remote_code 执行仓库自带的代码，并顺手 pip install 它的 requirements，"
                "可能覆盖引擎自己的依赖版本（例如钉死旧版 numpy）。引擎只安装人工枚举过安全文件"
                "清单的仓库，因此拒绝这个仓库。",
                info,
                {"rejectedFiles": ",".join(blocked)},
            )

    missing = _adapter_missing_files(adapter, info)
    if missing:
        return _reject(
            "missingRequiredFiles",
            f"{adapter.label} 需要 {'、'.join(missing)}，这个仓库没有发布。",
            info,
        )
    if not _adapter_has_weights(adapter, info):
        groups = " 或 ".join("/".join(group) for group in adapter.weight_groups)
        return _reject(
            "missingWeights",
            f"{adapter.label} 需要 {groups} 之一作为权重，这个仓库只有配置文件。",
            info,
        )

    undigested = _undigested_files(info)
    if undigested:
        return _reject(
            "hubNoPublishedDigest",
            f"仓库没有为 {'、'.join(undigested)} 发布可校验的摘要，下载后无法验证完整性，"
            "因此拒绝安装。",
            info,
            {"undigestedFiles": ",".join(undigested)},
        )

    languages = adapter.languages
    extra = {"matchedBy": matched_by}
    if languages is None:
        extra["languages"] = "见该加载器运行时的语言表"
    return RuntimeVerdict(
        compatible=True,
        reason_code="adapterMatched",
        reason=f"可以用 {adapter.label} 加载，服务{'识别' if adapter.slot == 'recognition' else '翻译'}。",
        slot=adapter.slot,
        loader=adapter.loader,
        adapter_id=adapter.adapter_id,
        languages=() if languages is None else languages,
        evidence=_evidence(info, extra),
    )


def _no_adapter_reason(matched_by: str, info: HubRepoInfo) -> str:
    if matched_by == "encoderDecoder":
        return (
            f"{info.model_type} 是 encoder-decoder 架构。引擎没有任何 encoder-decoder 加载器，"
            "llama.cpp 也只实现 decoder-only 家族（convert_hf_to_gguf.py 会抛 "
            "NotImplementedError），所以这个仓库装不了。"
        )
    if matched_by == "unknownArchitecture":
        return (
            f"没有加载器认领 model_type={info.model_type}"
            f"（architectures={','.join(info.architectures) or '未声明'}）。"
            "引擎不按模型名猜加载器，请换一个引擎已支持的架构。"
        )
    if "config.json" not in info.file_names:
        # Worth separating: this repo cannot be judged at all, rather than having been judged
        # and found unsupported, and the two send the user looking in opposite directions.
        return (
            "仓库既没有 GGUF 权重，也没有 config.json，取不到 model_type/architectures，"
            "文件结构也不匹配任何已注册的加载器，引擎无法判断该用什么加载器。"
        )
    return (
        "仓库的 config.json 里没有 model_type/architectures，文件结构也不匹配任何已注册的"
        "加载器，引擎无法判断能不能装。"
    )


# --------------------------------------------------------------------------------------
# The read-only inspection itself
# --------------------------------------------------------------------------------------

HubFetcher = Callable[[str], bytes]


def _http_get(url: str) -> bytes:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        return response.read(MAX_INSPECTION_BYTES)


def _http_get_search_page(url: str) -> tuple[bytes, str | None]:
    """Read one search page and the opaque cursor in Hugging Face's next-page link."""
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=30) as response:
        payload = response.read(MAX_INSPECTION_BYTES)
        link = response.headers.get("Link", "")
    match = re.search(r'<([^>]+)>\s*;\s*rel="?next"?', link)
    if not match:
        return payload, None
    next_url = urlparse(match.group(1))
    if next_url.scheme != "https" or next_url.netloc != "huggingface.co" or next_url.path != "/api/models":
        return payload, None
    return payload, parse_qs(next_url.query).get("cursor", [None])[0]


def _parse_json(payload: bytes, what: str) -> dict[str, object]:
    try:
        value = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HubInspectionError(f"Hugging Face 返回的 {what} 不是可解析的 JSON。") from error
    if not isinstance(value, dict):
        raise HubInspectionError(f"Hugging Face 返回的 {what} 不是 JSON 对象。")
    return value


def _normalize_repo(repo: str) -> str:
    """``owner/name`` with the URL-ish spellings people paste trimmed off; validated, not guessed."""
    trimmed = repo.strip().strip("/")
    for prefix in (f"{HF_ROOT}/", "huggingface.co/"):
        if trimmed.casefold().startswith(prefix.casefold()):
            trimmed = trimmed[len(prefix) :]
            break
    parts = [part for part in trimmed.split("/") if part]
    if len(parts) != 2 or any(part in (".", "..") for part in parts):
        raise ValueError(
            f"仓库名必须是 owner/name 形式：{repo!r}。例如 Qwen/Qwen3-ASR-1.7B-hf"
        )
    return "/".join(parts)


def _files_from_api(siblings: object) -> tuple[HubFile, ...]:
    if not isinstance(siblings, list):
        return ()
    files: list[HubFile] = []
    for sibling in siblings:
        if not isinstance(sibling, dict):
            continue
        name = sibling.get("rfilename")
        if not isinstance(name, str) or not name:
            continue
        size = sibling.get("size")
        lfs = sibling.get("lfs")
        sha256 = lfs.get("sha256") if isinstance(lfs, dict) else None
        blob_id = sibling.get("blobId")
        files.append(
            HubFile(
                path=name,
                size=size if isinstance(size, int) else None,
                sha256=sha256 if isinstance(sha256, str) else None,
                blob_sha1=blob_id if isinstance(blob_id, str) else None,
            )
        )
    return tuple(files)


def _repo_info_from_api(repo: str, payload: dict[str, object]) -> HubRepoInfo:
    gguf = payload.get("gguf")
    gguf_block = gguf if isinstance(gguf, dict) else {}
    architecture = gguf_block.get("architecture")
    chat_template = gguf_block.get("chat_template")
    tags = payload.get("tags")
    sha = payload.get("sha")
    pipeline_tag = payload.get("pipeline_tag")
    library_name = payload.get("library_name")
    gated = payload.get("gated")
    author = payload.get("author")
    downloads = payload.get("downloads")
    last_modified = payload.get("lastModified")
    return HubRepoInfo(
        repo=repo,
        revision=sha if isinstance(sha, str) and sha else None,
        files=_files_from_api(payload.get("siblings")),
        pipeline_tag=pipeline_tag if isinstance(pipeline_tag, str) else None,
        library_name=library_name if isinstance(library_name, str) else None,
        tags=tuple(tag for tag in tags if isinstance(tag, str)) if isinstance(tags, list) else (),
        gguf_architecture=architecture if isinstance(architecture, str) else None,
        gguf_chat_template=chat_template if isinstance(chat_template, str) else None,
        is_private=payload.get("private") is True,
        is_gated=gated is True or (isinstance(gated, str) and gated.casefold() != "false"),
        author=author if isinstance(author, str) and author else None,
        downloads=downloads if isinstance(downloads, int) else None,
        last_modified=last_modified if isinstance(last_modified, str) else None,
    )


def _config_archetypes(
    fetch: HubFetcher, repo: str, revision: str
) -> tuple[str | None, tuple[str, ...]]:
    """``model_type`` and ``architectures`` from config.json, or empty when there is none.

    A 404 here is normal — plenty of repos ship no config.json at all — and is not a failure. Any
    other error is left to the caller so the status code keeps its meaning.
    """
    url = f"{HF_ROOT}/{repo}/resolve/{revision}/config.json"
    try:
        payload = _parse_json(fetch(url), "config.json")
    except HTTPError as error:
        if error.code == 404:
            return None, ()
        raise
    model_type = payload.get("model_type")
    architectures = payload.get("architectures")
    return (
        model_type if isinstance(model_type, str) and model_type else None,
        tuple(item for item in architectures if isinstance(item, str))
        if isinstance(architectures, list)
        else (),
    )


def inspect_repo(repo: str, *, fetch: HubFetcher = _http_get) -> HubRepoInfo:
    """Read what a repo declares about itself. Downloads nothing but the API and config.json.

    ``fetch`` is injected so the whole decision path can be exercised against recorded payloads
    without touching the network; the default is the engine's only HTTP read, ``urlopen`` over
    plain HTTPS, the same transport ``models/manager.py`` uses for weights.
    """
    normalized = _normalize_repo(repo)
    payload = _parse_json(
        fetch(f"{HF_ROOT}/api/models/{normalized}?blobs=true"),
        "模型信息",
    )
    info = _repo_info_from_api(normalized, payload)
    if info.gguf_architecture or "config.json" not in info.file_names:
        # A GGUF repo has no transformers config worth reading, and asking for a config.json the
        # repo does not publish only buys a 404.
        return info
    model_type, architectures = _config_archetypes(fetch, normalized, info.revision or "main")
    return HubRepoInfo(
        repo=info.repo,
        revision=info.revision,
        files=info.files,
        pipeline_tag=info.pipeline_tag,
        library_name=info.library_name,
        tags=info.tags,
        gguf_architecture=info.gguf_architecture,
        gguf_chat_template=info.gguf_chat_template,
        model_type=model_type,
        architectures=architectures,
        is_private=info.is_private,
        is_gated=info.is_gated,
        author=info.author,
        downloads=info.downloads,
        last_modified=info.last_modified,
    )


# --------------------------------------------------------------------------------------
# Search
# --------------------------------------------------------------------------------------

#: The pipeline_tag each user-facing filter means. The search endpoint filters on a repo's tags,
#: and these are the tags HuggingFace derives from ``pipeline_tag``, so passing them narrows on
#: the server instead of downloading a broad result set and throwing most of it away locally.
SLOT_PIPELINE_TAGS: dict[Slot, str] = {
    "recognition": "automatic-speech-recognition",
    "translation": "translation",
}

@dataclass(frozen=True, slots=True)
class HubSearchResult:
    """One metadata page after filtering published weight formats."""

    query: str
    slot: Slot | None
    repos: tuple[HubRepoInfo, ...]
    candidates: int = 0
    rate_limited: bool = False
    next_cursor: str | None = None

def search_url(
    query: str, slot: Slot | None, limit: int,
    weight_format: str | None = None, cursor: str | None = None,
) -> str:
    """The search endpoint URL for a query, as a single string.

    Built as one URL rather than as query-parameter pairs so the exact request is visible in a log
    and in a failure message — a 429 has to be reproducible to be diagnosed.
    """
    parameters: list[tuple[str, str]] = [
        ("search", query),
        ("sort", "downloads"),
        ("direction", "-1"),
        ("limit", str(limit)),
    ]
    # A single list response supplies format evidence; no per-repo config reads here.
    parameters.extend(("expand", field) for field in (
        "author", "downloads", "lastModified", "library_name", "pipeline_tag",
        "tags", "siblings", "gguf", "sha", "cardData", "private", "gated",
    ))
    if slot is not None:
        parameters.append(("filter", SLOT_PIPELINE_TAGS[slot]))
    if weight_format == "gguf":
        parameters.append(("filter", "gguf"))
    if cursor:
        parameters.append(("cursor", cursor))
    return f"{HF_ROOT}/api/models?{urlencode(parameters, quote_via=quote)}"


def _parse_list(payload: bytes, what: str) -> list[dict[str, object]]:
    try:
        value = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HubInspectionError(f"Hugging Face 返回的 {what} 不是可解析的 JSON。") from error
    if not isinstance(value, list):
        raise HubInspectionError(f"Hugging Face 返回的 {what} 不是 JSON 数组。")
    return [item for item in value if isinstance(item, dict)]


def _search_hit_repos(
    hits: list[dict[str, object]], slot: Slot | None
) -> list[str]:
    """Repo ids worth inspecting, in the order the hub ranked them.

    The server-side ``filter`` narrows on a repo's *tags*, and a tag can be present while
    ``pipeline_tag`` itself is unset, so the requested slot is re-checked here against the field
    that actually decides the loader. Without this the search would hand back repos the engine
    is about to refuse, and the result list would contradict the verdict on every card.
    """
    wanted = SLOT_PIPELINE_TAGS.get(slot) if slot is not None else None
    repos: list[str] = []
    for hit in hits:
        model_id = hit.get("modelId") or hit.get("id")
        if not isinstance(model_id, str) or model_id.count("/") != 1:
            continue
        if wanted is not None and hit.get("pipeline_tag") != wanted and wanted not in (hit.get("tags") or []):
            continue
        repos.append(model_id)
    return repos


def search_repos(
    query: str,
    *,
    slot: Slot | None = None,
    limit: int = 20,
    fetch: Callable[[str], bytes | tuple[bytes, str | None]] = _http_get_search_page,
    weight_format: str | None = None,
    cursor: str | None = None,
) -> HubSearchResult:
    """Search supported weight formats using one metadata request.

    Return the next-page cursor even when format filtering leaves this page empty.
    Runtime inspection remains on the install path, where it can check an exact revision.
    """
    limit = max(1, min(20, limit))
    page = fetch(search_url(query.strip(), slot, limit, weight_format, cursor))
    payload, next_cursor = page if isinstance(page, tuple) else (page, None)
    hits = _parse_list(payload, "搜索结果")
    allowed = set(_search_hit_repos(hits, slot))
    repos: list[HubRepoInfo] = []
    seen: set[str] = set()
    for hit in hits:
        repo = hit.get("modelId") or hit.get("id")
        if not isinstance(repo, str) or repo not in allowed or repo in seen:
            continue
        info = _repo_info_from_api(repo, hit)
        if info.is_private or info.is_gated or not search_formats(info):
            continue
        if weight_format and weight_format not in search_formats(info):
            continue
        seen.add(repo)
        repos.append(info)
        if len(repos) >= limit:
            break
    return HubSearchResult(
        query=query.strip(),
        slot=slot,
        repos=tuple(repos),
        candidates=len(hits),
        next_cursor=next_cursor,
    )


def search_formats(info: HubRepoInfo) -> tuple[str, ...]:
    """Published PyTorch or llama.cpp weight formats, independent of app adapters."""
    formats: list[str] = []
    names = _library_names(info)
    if names & WHISPER_CPP_LIBRARIES:
        return ()
    if any(path.casefold().endswith((".safetensors", ".pt", ".pth"))
           or path.rsplit("/", 1)[-1].startswith("pytorch_model")
           and path.endswith(".bin") for path in info.file_names):
        # Safetensors is also used by other frameworks; require PyTorch library/tag evidence.
        if names & {"pytorch", "transformers", "funasr", "sentence-transformers", "timm", "diffusers"}:
            formats.append("pytorch")
    if info.gguf_files and (not info.gguf_architecture
                            or info.gguf_architecture in LLAMA_CPP_ARCHITECTURES):
        formats.append("gguf")
    return tuple(formats)
