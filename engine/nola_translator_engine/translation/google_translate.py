"""Google's public web translation provider, without user credentials."""

from __future__ import annotations

import html
import re

import httpx

from .base import ProviderTranslation
from .network import HTTP_REQUEST_TIMEOUT_SECONDS, _NetworkTransport, _join_chunks


DEFAULT_GOOGLE_TRANSLATE_ENDPOINT = "https://translate-pa.googleapis.com/v1/translateHtml"
# This public web-client identifier ships in Google's translation widget; it is not a user secret.
GOOGLE_WEB_CLIENT_KEY = "AIzaSyATBXajvzQLTDHEQbcpq0Ihe0vWDHmO520"
LINE_BREAK = '<br data-nola-lb="1">'
# Conservative chunks keep subtitle latency predictable for long recognizer turns.
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
        client: httpx.AsyncClient | None = None,
    ) -> None:
        self.endpoint = DEFAULT_GOOGLE_TRANSLATE_ENDPOINT
        self._http = client

    def timeout_for(self, text: str, source: str, target: str) -> float:
        return max(1, len(split_text(text))) * HTTP_REQUEST_TIMEOUT_SECONDS + 1

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        parts: list[str] = []
        for chunk in split_text(text):
            encoded = html.escape(chunk, quote=False).replace("\n", LINE_BREAK * 2)
            target_language = {"zh": "zh-CN"}.get(target, target)
            try:
                response = await self._client().post(
                    self.endpoint,
                    headers={"Content-Type": "application/json+protobuf", "X-Goog-API-Key": GOOGLE_WEB_CLIENT_KEY},
                    json=[[[encoded], source, target_language], "wt_lib"],
                )
                if response.status_code == 429:
                    raise GoogleTranslateError("translationRateLimited")
                if response.status_code == 403:
                    # The web endpoint can report throttling as 403; never echo response data.
                    message = response.text.lower()
                    if "quota" in message or "limit" in message:
                        raise GoogleTranslateError("translationRateLimited")
                    raise GoogleTranslateError("translationProviderUnavailable")
                if response.status_code < 200 or response.status_code >= 300:
                    raise GoogleTranslateError("HTTPError")
                result = response.json()
                translated = result[0][0] if isinstance(result, list) and result and isinstance(result[0], list) and result[0] else None
                if not isinstance(translated, str):
                    raise GoogleTranslateError("translationInvalidResponse")
                translated = re.sub(r'(?:<br data-nola-lb="1"\s*/?>[^\S\r\n]*){2}', "\n", translated)
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
