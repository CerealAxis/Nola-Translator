from __future__ import annotations

import base64
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

TTS_SCHEMA_VERSION = 1


def tts_language_matches(supported: str, target: str) -> bool:
    aliases = {"cn": "zh-CN", "jp": "ja", "kr": "ko", "zh-chs": "zh-CN", "zh-cht": "zh-TW"}
    def parts(value: str):
        normalized = value.replace("_", "-")
        return aliases.get(normalized.lower(), normalized).lower().split("-")
    left, right = parts(supported), parts(target)
    if left == right:
        return True
    if left == ["zh", "hk"] or right == ["zh", "hk"] or left[0] != right[0]:
        return False
    left_script = next((item for item in left[1:] if len(item) == 4), None)
    right_script = next((item for item in right[1:] if len(item) == 4), None)
    region = lambda values: next((item for item in values[1:] if len(item) in (2, 3)), None)
    if left[0] == "zh":
        inferred = {"cn": "hans", "sg": "hans", "tw": "hant", "mo": "hant"}
        left_script = left_script or inferred.get(region(left))
        right_script = right_script or inferred.get(region(right))
    if left_script and right_script and left_script != right_script:
        return False
    return not region(left) or not region(right) or region(left) == region(right)


class TtsContract(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True, allow_inf_nan=False)


class DefaultVoice(TtsContract):
    kind: Literal["engine-default"] = "engine-default"


class PresetVoice(TtsContract):
    kind: Literal["preset"]
    voice_id: str = Field(alias="voiceId", min_length=1, max_length=512)


class ReferenceVoice(TtsContract):
    kind: Literal["reference-audio"]
    asset_id: str = Field(alias="assetId", pattern=r"^[a-zA-Z0-9_-]{1,128}$")
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    transcript: str | None = Field(default=None, max_length=64000)
    recorded_language: str | None = Field(default=None, alias="recordedLanguage", max_length=32)
    purpose: Literal["human-reference", "designed-sample"]


class DesignVoice(TtsContract):
    kind: Literal["design"]
    description: str = Field(min_length=1, max_length=8000)
    recipe: dict
    recipe_schema: str = Field(alias="recipeSchema")
    authoring_model_binding: str = Field(alias="authoringModelBinding")
    seed: int | None = None


class ProviderVoice(TtsContract):
    kind: Literal["provider-voice"]
    binding_id: str = Field(alias="bindingId")
    binding_revision: int = Field(alias="bindingRevision", ge=1)
    voice_id: str = Field(alias="voiceId", min_length=1, max_length=512)
    scope_id: str = Field(alias="scopeId")


ResolvedVoiceConditioning = Annotated[
    DefaultVoice | PresetVoice | ReferenceVoice | DesignVoice | ProviderVoice,
    Field(discriminator="kind"),
]


class TtsControls(TtsContract):
    speed: float | None = Field(default=None, gt=0)
    pitch: float | None = None
    volume: float | None = Field(default=None, ge=0)
    emotion: str | None = Field(default=None, max_length=128)
    emotion_strength: float | None = Field(default=None, alias="emotionStrength", ge=0, le=1)
    instruct: str | None = Field(default=None, max_length=8000)
    seed: int | None = None


class TtsOutput(TtsContract):
    format: Literal["wav", "mp3", "pcm"] = "wav"
    sample_rate: int | None = Field(default=None, alias="sampleRate", gt=0)


class SynthesisRequest(TtsContract):
    schema_version: Literal[1] = TTS_SCHEMA_VERSION
    text: str = Field(min_length=1, max_length=64000)
    language: str = Field(min_length=1, max_length=32)
    conditioning: ResolvedVoiceConditioning = Field(default_factory=DefaultVoice)
    controls: TtsControls = Field(default_factory=TtsControls)
    output: TtsOutput = Field(default_factory=TtsOutput)
    reference_audio: str | None = Field(default=None, max_length=32 * 1024 * 1024 + 64, repr=False)
    profile_id: str | None = None
    profile_revision: int | None = Field(default=None, ge=1)
    voice_epoch: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def validate_reference(self):
        if isinstance(self.conditioning, ReferenceVoice) and self.reference_audio is not None:
            if not self.reference_audio.startswith(("data:audio/wav;base64,", "data:audio/mpeg;base64,")):
                raise ValueError("Reference audio requires WAV or MP3 data URI")
            import hashlib
            raw = base64.b64decode(self.reference_audio.split(",", 1)[1], validate=True)
            if hashlib.sha256(raw).hexdigest() != self.conditioning.sha256:
                raise ValueError("Reference audio digest mismatch")
        elif not isinstance(self.conditioning, ReferenceVoice) and self.reference_audio is not None:
            raise ValueError("Reference audio requires reference conditioning")
        return self

    def worker_payload(self) -> dict:
        return self.model_dump(by_alias=True, exclude_none=True)

    def legacy_voice(self) -> str | None:
        return self.conditioning.voice_id if isinstance(self.conditioning, (PresetVoice, ProviderVoice)) else None


def hydrate_reference(request: SynthesisRequest) -> SynthesisRequest:
    if not isinstance(request.conditioning, ReferenceVoice) or request.reference_audio:
        return request
    import os
    import sqlite3
    from pathlib import Path
    root = os.environ.get("NOLA_TTS_DATA_ROOT")
    if not root:
        raise ValueError("Voice asset storage is unavailable")
    data_root = Path(root).resolve(strict=True)
    asset_root = (data_root / "voices").resolve(strict=True)
    with sqlite3.connect((data_root / "voices.sqlite3").as_uri() + "?mode=ro", uri=True) as db:
        row = db.execute("SELECT relative_path, mime, sha256, bytes FROM voice_assets WHERE id=?",
            (request.conditioning.asset_id,)).fetchone()
    if row is None:
        raise ValueError("Voice asset is missing")
    relative, mime, digest, size = row
    if not isinstance(relative, str) or "\\" in relative or ":" in relative:
        raise ValueError("Invalid voice asset path")
    candidate = asset_root / relative
    path = candidate.resolve(strict=True)
    if not path.is_relative_to(asset_root) or path == asset_root or not path.is_file():
        raise ValueError("Voice asset escapes root")
    for parent in (candidate, *candidate.parents):
        if parent == asset_root:
            break
        if parent.is_symlink() or parent.is_junction():
            raise ValueError("Voice asset links are unsupported")
    if size > 32 * 1024 * 1024 or path.stat().st_size != size or digest != request.conditioning.sha256:
        raise ValueError("Invalid voice asset metadata")
    payload = request.model_dump(by_alias=True)
    payload["reference_audio"] = f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")
    return SynthesisRequest.model_validate(payload)
