"""MyMemory's text-only REST endpoint with the service's UTF-8 request limit."""

from __future__ import annotations

import html
from urllib.parse import urlsplit

import httpx

from .base import ProviderTranslation
from .network import HTTP_REQUEST_TIMEOUT_SECONDS, _NetworkTransport, _join_chunks


DEFAULT_MYMEMORY_ENDPOINT = "https://api.mymemory.translated.net/get"
# https://mymemory.translated.net/doc/spec.php limits q to 500 UTF-8 bytes, not characters.
QUERY_BYTE_LIMIT = 500
# A protocol caption permits 16,384 characters, each at most four UTF-8 bytes.
MAX_QUERY_CHUNKS = 132


class MyMemoryError(RuntimeError):
    def __init__(self, error_code: str) -> None:
        super().__init__(error_code)
        self.error_code = error_code


def split_utf8(text: str) -> list[str]:
    chunks: list[str] = []
    current: list[str] = []
    size = 0
    for character in text:
        length = len(character.encode("utf-8"))
        if size + length > QUERY_BYTE_LIMIT:
            chunks.append("".join(current))
            current, size = [], 0
        current.append(character)
        size += length
    if current:
        chunks.append("".join(current))
    if len(chunks) > MAX_QUERY_CHUNKS:
        raise MyMemoryError("translationInputTooLong")
    return chunks


class MyMemoryTranslationProvider(_NetworkTransport):
    name = "mymemory"

    def __init__(self, *, endpoint: str = DEFAULT_MYMEMORY_ENDPOINT, email: str = "",
                 client: httpx.AsyncClient | None = None) -> None:
        parsed = urlsplit(endpoint)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("MyMemory endpoint must be an HTTP(S) URL without credentials")
        self.endpoint = endpoint
        self.email = email.strip()
        self._http = client

    def timeout_for(self, text: str, source: str, target: str) -> float:
        return max(1, len(split_utf8(text))) * HTTP_REQUEST_TIMEOUT_SECONDS + 1

    async def translate(self, text: str, source: str, target: str) -> ProviderTranslation:
        if source == "auto":
            raise MyMemoryError("translationSourceLanguageRequired")
        parts: list[str] = []
        for chunk in split_utf8(text):
            params = {"q": chunk, "langpair": f"{source}|{target}"}
            if self.email:
                params["de"] = self.email
            try:
                response = await self._client().get(self.endpoint, params=params)
                if response.status_code == 429:
                    raise MyMemoryError("translationRateLimited")
                if response.status_code != 200:
                    raise MyMemoryError("HTTPError")
                result = response.json()
                if not isinstance(result, dict):
                    raise MyMemoryError("translationInvalidResponse")
                # Quota rejection can be embedded in an HTTP 200. Never expose responseDetails,
                # which may echo the q query and therefore the user's transcript.
                if result.get("quotaFinished") or str(result.get("responseStatus")) == "429":
                    raise MyMemoryError("translationRateLimited")
                if str(result.get("responseStatus")) != "200":
                    raise MyMemoryError("translationRejected")
                data = result.get("responseData")
                translated = data.get("translatedText") if isinstance(data, dict) else None
                if not isinstance(translated, str):
                    raise MyMemoryError("translationInvalidResponse")
                parts.append(html.unescape(translated))
                if sum(len(part) for part in parts) + len(parts) - 1 > 16_384:
                    raise MyMemoryError("translationOutputTooLong")
            except MyMemoryError:
                raise
            except httpx.TimeoutException:
                raise MyMemoryError("translationTimeout") from None
            except httpx.RequestError:
                raise MyMemoryError("URLError") from None
            except (ValueError, TypeError):
                raise MyMemoryError("translationInvalidResponse") from None
        return ProviderTranslation(_join_chunks(parts), (source, target))
