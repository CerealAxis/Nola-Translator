"""Compute inventory and per-task placement. No model weights are loaded by probing."""
from __future__ import annotations

from dataclasses import asdict, dataclass, replace
import os
from pathlib import Path
import re
import subprocess
import traceback
from typing import Literal

from pydantic import BaseModel, Field


class ComputeOptions(BaseModel):
    recognitionEngine: Literal["pytorch", "llama"] = "pytorch"
    translationEngine: Literal["auto", "pytorch", "llama"] = "auto"
    recognitionDevice: str = Field(default="auto", min_length=1, max_length=512)
    translationDevice: str = Field(default="auto", min_length=1, max_length=512)
    allowCpuFallback: bool = True
    precision: Literal["auto", "fp32", "fp16", "bf16"] = "auto"
    quantization: Literal["auto", "none", "nf4", "8bit"] = "auto"
    reservedVramMb: int = Field(default=1024, ge=256, le=65536)
    cpuThreads: int = Field(default=0, ge=0, le=256)
    gpuLayers: int = Field(default=-1, ge=-1, le=1000)
    contextSize: int = Field(default=2048, ge=512, le=32768)
    flashAttention: Literal["auto", "on", "off"] = "auto"


@dataclass(frozen=True)
class ComputeDevice:
    id: str
    name: str
    backend: str
    torchDevice: str | None = None
    llamaDevice: str | None = None
    totalMemoryMb: float = 0
    freeMemoryMb: float = 0
    integrated: bool = False
    stableId: bool = True
    recognition: bool = False
    translation: bool = False
    reason: str = ""
    score: float = 0


def cpu_threads(requested: int = 0) -> int:
    available = os.cpu_count() or 2
    return max(1, min(requested or max(1, available // 2), available))


def probe_devices(llama_dir: Path | None) -> tuple[list[ComputeDevice], list[str], str]:
    devices = [ComputeDevice("cpu", "CPU", "cpu", "cpu", recognition=True, translation=True)]
    notes: list[str] = []
    version = "unavailable"
    try:
        import torch
        version = str(torch.__version__)
        if torch.cuda.is_available():
            for index in range(torch.cuda.device_count()):
                props = torch.cuda.get_device_properties(index)
                free, total = torch.cuda.mem_get_info(index)
                uuid = str(getattr(props, "uuid", "") or "")
                backend = "rocm" if torch.version.hip else "cuda"
                enabled = backend == "cuda" or backend in os.environ.get("NOLA_TRANSLATOR_COMPUTE_BACKENDS", "").split(",")
                devices.append(ComputeDevice(
                    id=f"{backend}:{uuid}" if uuid else f"{backend}:{props.name}:{index}",
                    name=props.name, backend=backend, torchDevice=f"cuda:{index}",
                    totalMemoryMb=total / 2**20, freeMemoryMb=free / 2**20,
                    stableId=bool(uuid), recognition=enabled, translation=enabled,
                    reason="" if enabled else "此运行包尚未声明该后端的模型适配",
                    score=float(getattr(props, "multi_processor_count", 1)) * 10 + props.major * 100,
                ))
        if hasattr(torch, "xpu") and torch.xpu.is_available():
            enabled = "xpu" in os.environ.get("NOLA_TRANSLATOR_COMPUTE_BACKENDS", "").split(",")
            for index in range(torch.xpu.device_count()):
                props = torch.xpu.get_device_properties(index)
                uuid = str(getattr(props, "uuid", "") or "")
                total = getattr(props, "total_memory", 0)
                # Shared memory is deliberately excluded from placement capacity.
                integrated = bool(getattr(props, "is_integrated", False))
                free = 0 if integrated else torch.xpu.mem_get_info(index)[0]
                devices.append(ComputeDevice(
                    id=f"xpu:{uuid}" if uuid else f"xpu:{props.name}:{index}", name=props.name,
                    backend="xpu", torchDevice=f"xpu:{index}", totalMemoryMb=total / 2**20,
                    freeMemoryMb=free / 2**20, integrated=integrated, stableId=bool(uuid),
                    recognition=enabled, translation=enabled,
                    reason="" if enabled else "此运行包尚未声明 Intel 模型适配", score=100,
                ))
    except Exception as error:
        notes.append(f"PyTorch 设备探测失败：{type(error).__name__}: {str(error)[:256]}")
    if llama_dir and (llama_dir / "llama-server.exe").is_file():
        try:
            result = subprocess.run(
                [str(llama_dir / "llama-server.exe"), "--list-devices"],
                capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=15,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )
            if result.returncode:
                notes.append(f"llama.cpp 设备探测退出（{result.returncode}）：{result.stderr[-256:].strip()}")
            matches = [match for line in (result.stdout + result.stderr).splitlines()
                       if (match := re.match(r"\s*(CUDA\d+|Vulkan\d+|SYCL\d+|HIP\d+):\s*(.*?)\s*\((\d+)\s*MiB,\s*(\d+)\s*MiB free\)", line))]
            for match in matches:
                identifier, name, total, free = match.groups()
                # CUDA enumeration in both children inherits the same visibility environment.
                index = int(re.search(r"\d+$", identifier).group())
                existing = next((i for i, d in enumerate(devices)
                                 if d.torchDevice == f"cuda:{index}" and d.backend == "cuda"
                                 and d.name == name), None) if identifier.startswith("CUDA") else None
                if identifier.startswith("Vulkan"):
                    same_name = [i for i, d in enumerate(devices) if d.torchDevice and d.id != "cpu" and d.name == name]
                    # A unique name can map Vulkan and CUDA to one physical card. Identical card
                    # names are ambiguous across APIs; do not invent a matching enumeration order.
                    if len(same_name) == 1 and sum(m.group(2) == name for m in matches) == 1:
                        existing = same_name[0]
                if existing is not None:
                    devices[existing] = replace(devices[existing], llamaDevice=identifier, translation=True)
                else:
                    # llama's backend index is not a stable physical ID; preserve it as a named choice,
                    # and refuse the choice if the name/index no longer exists on the next probe.
                    devices.append(ComputeDevice(
                        id=f"llama:{identifier}:{name}", name=name, backend=re.sub(r"\d+$", "", identifier).lower(),
                        llamaDevice=identifier, totalMemoryMb=float(total), freeMemoryMb=float(free),
                        stableId=False, translation=True, score=100,
                        reason="当前仅由 llama.cpp 使用；语音识别需要匹配的 PyTorch 环境",
                    ))
        except Exception as error:
            notes.append(f"llama.cpp 设备探测失败：{type(error).__name__}: {str(error)[:256]}")
    else:
        notes.append("未找到 llama.cpp 运行包")
    return devices[:64], notes[:32], version[:64]


def model_memory_mb(path: Path, adapter: str, options: ComputeOptions) -> float:
    """Conservative planning estimate, not an allocation guarantee or a benchmark."""
    files = [path] if path.is_file() else path.rglob("*")
    weight_mb = sum(p.stat().st_size for p in files
                    if p.is_file() and p.suffix in (".gguf", ".safetensors", ".bin", ".pt")) / 2**20
    factor = 1.0
    if adapter == "qwen3-asr" and options.quantization in ("auto", "nf4"):
        factor = 0.5
    elif adapter == "qwen3-asr" and options.quantization == "8bit":
        factor = 0.75
    elif options.precision == "fp32":
        factor = 2.0
    return max(256, weight_mb * factor) + (512 + options.contextSize / 4 if adapter == "llama.cpp" else 1024)


def choose_devices(devices: list[ComputeDevice], options: ComputeOptions,
                   recognition_mb: float, translation_mb: float, translation_adapter: str | None
                   ) -> tuple[ComputeDevice, ComputeDevice, list[str]]:
    by_id = {d.id: d for d in devices}
    reasons: list[str] = []

    def candidates(choice: str, task: str) -> list[ComputeDevice]:
        def supports(d: ComputeDevice) -> bool:
            if task == "recognition":
                return d.recognition and d.torchDevice is not None
            return d.id == "cpu" or (d.translation and
                (d.llamaDevice is not None if translation_adapter == "llama.cpp" else d.torchDevice is not None))
        if choice != "auto":
            found = by_id.get(choice)
            if found and supports(found):
                return [found]
            if options.allowCpuFallback:
                reasons.append(f"{task} 指定设备不可用，回退 CPU")
                return [by_id["cpu"]]
            raise ValueError(f"{task} 指定设备不可用：{choice}")
        return [d for d in devices if supports(d)]

    recognition = candidates(options.recognitionDevice, "recognition")
    translation = candidates(options.translationDevice, "translation") if translation_adapter else [by_id["cpu"]]
    if translation_adapter == "llama.cpp" and options.gpuLayers == 0:
        translation = [by_id["cpu"]]
        reasons.append("翻译 GPU 卸载层数为 0，使用 CPU")
    plans = []
    for a in recognition:
        for b in translation:
            ambiguous_shared = a.id != b.id and a.id != "cpu" and b.id != "cpu" and a.name == b.name and a.backend != b.backend
            if ambiguous_shared:
                # Treat an unidentifiable cross-backend pair conservatively as sharing memory.
                if min(a.freeMemoryMb, b.freeMemoryMb) < recognition_mb + translation_mb + options.reservedVramMb:
                    continue
            budgets: dict[str, float] = {}
            if a.id != "cpu": budgets[a.id] = recognition_mb
            if b.id != "cpu": budgets[b.id] = budgets.get(b.id, 0) + translation_mb
            if any(by_id[k].freeMemoryMb < need + options.reservedVramMb for k, need in budgets.items()):
                continue
            # Preference only: prioritize ASR headroom and usable discrete GPUs. The score is
            # an inventory heuristic; a second very weak GPU is not required to be used.
            score = (10000 if a.id != "cpu" else 0) + (5000 if b.id != "cpu" else 0)
            score += a.score * 2 + b.score
            if (a.id == b.id or ambiguous_shared) and a.id != "cpu": score -= min(a.score, b.score) * 0.5
            plans.append((score, a, b))
    if not plans:
        # A manually selected GPU with insufficient memory is not silently changed to another GPU.
        if options.allowCpuFallback:
            reasons.append("所选组合的可用显存不足，回退 CPU")
            return by_id["cpu"], by_id["cpu"], reasons
        raise ValueError("所选设备的可用显存不足，请调整显存预留、模型或设备")
    _, a, b = max(plans, key=lambda p: p[0])
    return a, b, reasons


def resolve_dtype(device: str, precision: str):
    import torch
    if device == "cpu":
        if precision in ("fp16", "bf16"):
            raise ValueError("当前 CPU 基线使用 FP32，请将计算精度设为自动或 FP32")
        return torch.float32
    bf16 = False
    if device.startswith("cuda"):
        with torch.cuda.device(device):
            bf16 = torch.cuda.is_bf16_supported(including_emulation=False)
    elif device.startswith("xpu"):
        bf16 = torch.xpu.is_bf16_supported()
    if precision == "bf16" and not bf16:
        raise ValueError("所选显卡不支持当前模型要求的 BF16 计算")
    return {"fp32": torch.float32, "fp16": torch.float16, "bf16": torch.bfloat16}.get(
        precision, torch.bfloat16 if bf16 else torch.float16)


def resource_failure(error: BaseException) -> bool:
    """Only resource/device failures qualify for a CPU retry; corrupt checkpoints do not."""
    current: BaseException | None = error
    seen: set[int] = set()
    while current and id(current) not in seen:
        seen.add(id(current))
        detail = str(current).lower()
        if any(word in detail for word in ("out of memory", "cuda driver", "cuda-capable device", "device has been lost",
                                          "no kernel image is available", "invalid device function")):
            return True
        current = current.__cause__
    return False


def release_failed_load(error: BaseException) -> None:
    """Drop checkpoint tensors kept alive by loader traceback frames before a retry."""
    current: BaseException | None = error
    seen: set[int] = set()
    while current and id(current) not in seen:
        seen.add(id(current))
        if current.__traceback__:
            traceback.clear_frames(current.__traceback__)
        current = current.__cause__ or current.__context__


def release_device_cache(device: str | None) -> None:
    import torch
    try:
        if device and device.startswith("cuda") and torch.cuda.is_available():
            with torch.cuda.device(device): torch.cuda.empty_cache()
        elif device and device.startswith("xpu") and torch.xpu.is_available():
            with torch.xpu.device(device): torch.xpu.empty_cache()
    except RuntimeError:
        # A lost device must not prevent cleanup or the configured CPU recovery.
        pass
