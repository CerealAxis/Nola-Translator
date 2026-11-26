from __future__ import annotations

import io
from urllib.parse import urlparse

import httpx

from .adapters import Adapter
from .capabilities import CallContext, GatewayError, GatewayErrorCode, ModelKind, Operation
from .definitions import ModelInstance
from .operations import SynthesisChunk, SynthesisResult
from ..tts_contracts import SynthesisRequest

TTS_PROVIDER_RELAY_MODEL = "nola-provider-tts"


class TtsProviderRelayAdapter(Adapter):
    adapter_id = TTS_PROVIDER_RELAY_MODEL
    operations = frozenset({Operation.SYNTHESIZE})
    kinds = frozenset({ModelKind.TTS})

    async def synthesize(self, instance: ModelInstance, ctx: CallContext, *, synthesis: SynthesisRequest) -> SynthesisResult:
        endpoint = ctx.provider_options.get("relay_url", "")
        token = ctx.provider_options.get("relay_token", "")
        url = urlparse(endpoint)
        if url.scheme != "http" or url.hostname != "127.0.0.1" or url.path != "/synthesize" or not token:
            raise GatewayError(GatewayErrorCode.INVALID_INPUT, stage="tts", message="Private TTS relay is unavailable")
        ctx.cancel_token.raise_if_cancelled()
        try:
            async with httpx.AsyncClient(timeout=120, follow_redirects=False) as client:
                response = await client.post(endpoint, headers={"Authorization": f"Bearer {token}"},
                    json={"text": synthesis.text, "language": synthesis.language})
                if response.is_error:
                    codes = {"AUTHENTICATION_FAILED": "authentication_failed", "CLOUD_MODEL_KEY_REQUIRED": "authentication_failed",
                        "CLOUD_MODEL_BILLING_REQUIRED": "quota_exceeded", "CLOUD_MODEL_ACCESS_DENIED": "permission_or_region_denied",
                        "CLOUD_MODEL_RATE_LIMITED": "rate_limited", "CLOUD_MODEL_PROVIDER_UNAVAILABLE": "provider_failed",
                        "REQUEST_TIMEOUT": "request_timeout", "NETWORK_UNAVAILABLE": "network_unavailable"}
                    try:
                        code = codes.get(response.json().get("error"), "provider_failed")
                    except ValueError:
                        code = "provider_failed"
                    raise GatewayError(GatewayErrorCode.PROVIDER_ERROR, stage="tts", message="Cloud speech synthesis failed",
                        provider_code=code, retryable=code in ("rate_limited", "request_timeout", "network_unavailable"))
                response.raise_for_status()
                data = response.content
                if len(data) > 32 * 1024 * 1024:
                    raise ValueError("TTS relay audio is too large")
            import soundfile as sf
            with sf.SoundFile(io.BytesIO(data)) as audio:
                if audio.channels not in (1, 2) or not 8000 <= audio.samplerate <= 192000 or not 0 < audio.frames <= audio.samplerate * 300:
                    raise ValueError("Invalid TTS relay audio format")
                pcm = audio.read(dtype="int16", always_2d=True).astype("<i2").tobytes()
                rate, channels = audio.samplerate, audio.channels
        except (httpx.HTTPError, ValueError, RuntimeError) as error:
            raise GatewayError(GatewayErrorCode.PROVIDER_ERROR, stage="tts", message="Cloud speech synthesis failed") from error
        ctx.cancel_token.raise_if_cancelled()
        return SynthesisResult([SynthesisChunk(pcm, rate, channels, terminal=True)], sample_rate=rate)
