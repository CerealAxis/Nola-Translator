"""Google Cloud Translation - Basic REST provider."""

from __future__ import annotations

import html

import httpx

from .base import ProviderTranslation
from .network import HTTP_REQUEST_TIMEOUT_SECONDS, _NetworkTransport, _join_chunks


DEFAULT_GOOGLE_TRANSLATE_ENDPOINT = "https://translation.googleapis.com/language/translate/v2"
# Google recommends keeping synchronous requests at or below 5,000 code points. Keeping the
# limit conservative also keeps subtitle latency predictable when a recognizer emits a long turn.
MAX_REQUEST_CHARS = 5_000
MAX_INPUT_CHARS = 16_384


class GoogleTranslateError(RuntimeError):
    def __init__(self, error_code: str) -> None:
        super().__init__(error_code)
        self.error_code = error_code


def split_text(text: str) -> list[str]:
    """Split a protocol-sized caption into Google-sized requests without dropping text."""

    if len(text) > MAX_INPUT_CHARS:
        raise GoogleTranslateError("translationInputTooLong")
    return [text[index:index + MAX_REQUEST_CHARS] for index in range(0, len(text), MAX_REQUEST_CHARS)] or [""]


class GoogleTranslateProvider(_NetworkTransport):
    name = "google"

    def __init__(
        self,
        *,
        api_key: str,
        endpoint: str = DEFAULT_GOOGLE_TRANSLATE_ENDPOINT,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        if not api_key.strip():
            raise ValueError("Google Translate API 密钥为空")
        if not endpoint:
            raise ValueError("Google Translate 接口地址为空")
        self.api_key = api_key.strip()
        self.endpoint = endpoint
        self._http = client

    def timeout_for(self, text: str, source: str, target: str) -> float:
        return max(1, len(split_text(text))) * HTTP_REQUEST_TIMEOUT_SECONDS + 1

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        parts: list[str] = []
        for chunk in split_text(text):
            payload: dict[str, str] = {"q": chunk, "target": target, "format": "text"}
            if source != "auto":
                payload["source"] = source
            try:
                response = await self._client().post(
                    self.endpoint,
                    params={"key": self.api_key},
                    json=payload,
                )
                if response.status_code == 429:
                    raise GoogleTranslateError("translationRateLimited")
                if response.status_code == 403:
                    # Google uses 403 for both invalid credentials and exhausted project quota.
                    # Only the latter is retryable and the body may contain sensitive request data,
                    # so keep the diagnostic deliberately generic.
                    message = response.text.lower()
                    if "quota" in message or "limit" in message:
                        raise GoogleTranslateError("translationRateLimited")
                    raise GoogleTranslateError("translationProviderUnavailable")
                if response.status_code < 200 or response.status_code >= 300:
                    raise GoogleTranslateError("HTTPError")
                result = response.json()
                data = result.get("data") if isinstance(result, dict) else None
                translations = data.get("translations") if isinstance(data, dict) else None
                translated = translations[0].get("translatedText") if isinstance(translations, list) and translations else None
                if not isinstance(translated, str):
                    raise GoogleTranslateError("translationInvalidResponse")
                parts.append(html.unescape(translated))
                if sum(len(part) for part in parts) + len(parts) - 1 > MAX_INPUT_CHARS:
                    raise GoogleTranslateError("translationOutputTooLong")
            except GoogleTranslateError:
                raise
            except httpx.TimeoutException:
                raise GoogleTranslateError("translationTimeout") from None
            except httpx.RequestError:
                raise GoogleTranslateError("URLError") from None
            except (ValueError, TypeError, AttributeError):
                raise GoogleTranslateError("translationInvalidResponse") from None
        return ProviderTranslation(_join_chunks(parts), (source, target))
