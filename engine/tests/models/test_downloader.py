from __future__ import annotations

from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Lock, Thread
import time
from urllib.error import HTTPError
from urllib.request import build_opener

import pytest

from nola_translator_engine.models.manager import (
    FileEntry,
    ModelManager,
    ModelSpec,
    ResumableParallelDownloader,
)
import nola_translator_engine.models.manager as manager_module


class _RangeServer:
    def __init__(
        self, payload: bytes, *, fail_range: tuple[int, int] | None = None,
        redirect: bool = False, truncate_once: tuple[int, int] | None = None,
    ) -> None:
        self.payload = payload
        self.fail_range = fail_range
        self.fail_enabled = True
        self.counts: dict[tuple[int, int], int] = {}
        self.lock = Lock()
        self.active = 0
        self.max_active = 0
        self.resolutions = 0

        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                if redirect and self.path.endswith('/model.bin'):
                    owner.resolutions += 1
                    self.send_response(302)
                    self.send_header('Location', '/asset.bin')
                    self.end_headers()
                    return
                value = self.headers.get("Range")
                if value:
                    start_text, end_text = value.removeprefix("bytes=").split("-")
                    start = int(start_text)
                    end = int(end_text) if end_text else len(owner.payload) - 1
                    with owner.lock:
                        key = (start, end)
                        owner.counts[key] = owner.counts.get(key, 0) + 1
                        should_fail = owner.fail_enabled and key == owner.fail_range
                        owner.active += 1
                        owner.max_active = max(owner.max_active, owner.active)
                    if should_fail:
                        time.sleep(0.05)
                        with owner.lock:
                            owner.active -= 1
                        self.send_error(503)
                        return
                    body = owner.payload[start : end + 1]
                    if key == truncate_once and owner.counts[key] == 1:
                        body = body[:len(body) // 2]
                    time.sleep(0.02)
                    self.send_response(206)
                    self.send_header("Content-Range", f"bytes {start}-{end}/{len(owner.payload)}")
                    self.send_header("Content-Length", str(len(body)))
                    self.end_headers()
                    self.wfile.write(body)
                    with owner.lock:
                        owner.active -= 1
                    return

                self.send_response(200)
                self.send_header("Content-Length", str(len(owner.payload)))
                self.end_headers()
                self.wfile.write(owner.payload)

            def log_message(self, _format: str, *_args: object) -> None:
                return

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.server.server_port}/model.bin"

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()


def _entry(data: bytes) -> FileEntry:
    return FileEntry("model.bin", len(data), sha256(data).hexdigest())


def test_parallel_ranges_download_and_report_progress(tmp_path: Path) -> None:
    payload = bytes(range(64))
    server = _RangeServer(payload)
    try:
        destination = tmp_path / "model.bin"
        progress: list[tuple[int, int]] = []
        downloader = ResumableParallelDownloader(
            tmp_path / "models", build_opener(), chunk_size=8, max_workers=4, parallel_threshold=1
        )

        downloader.download(server.url, destination, _entry(payload), lambda c, t: progress.append((c, t)))

        assert destination.read_bytes() == payload
        assert len([key for key in server.counts if key != (0, 0)]) == 8
        assert 1 < server.max_active <= 4
        assert all(total == len(payload) for _, total in progress)
        assert progress[-1] == (len(payload), len(payload))
        assert not (tmp_path / "models" / ".downloads").exists()
    finally:
        server.close()


def test_parallel_download_resolves_cdn_redirect_only_once(tmp_path: Path) -> None:
    payload = bytes(range(64))
    server = _RangeServer(payload, redirect=True)
    try:
        downloader = ResumableParallelDownloader(
            tmp_path / 'models', build_opener(), chunk_size=8, max_workers=4, parallel_threshold=1,
        )
        destination = tmp_path / 'model.bin'
        downloader.download(server.url, destination, _entry(payload), lambda *_: None)
        assert destination.read_bytes() == payload
        assert server.resolutions == 1
    finally:
        server.close()


def test_incomplete_range_retries_without_losing_finished_chunks(tmp_path: Path) -> None:
    payload = bytes(range(32))
    server = _RangeServer(payload, truncate_once=(8, 15))
    try:
        downloader = ResumableParallelDownloader(
            tmp_path / 'models', build_opener(), chunk_size=8, max_workers=4, parallel_threshold=1,
        )
        destination = tmp_path / 'model.bin'
        downloader.download(server.url, destination, _entry(payload), lambda *_: None)
        assert destination.read_bytes() == payload
        assert server.counts[(8, 15)] == 2
        assert server.counts[(0, 7)] == 1
    finally:
        server.close()


def test_small_download_retries_transient_failure(tmp_path: Path) -> None:
    payload = bytes(range(64))

    class Handler(BaseHTTPRequestHandler):
        requests = 0

        def do_GET(self) -> None:
            type(self).requests += 1
            if type(self).requests == 1:
                self.send_error(503)
                return
            self.send_response(200)
            self.send_header('Content-Length', str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, _format: str, *_args: object) -> None:
            return

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        downloader = ResumableParallelDownloader(tmp_path / 'models', build_opener())
        destination = tmp_path / 'model.bin'
        downloader.download(f'http://127.0.0.1:{server.server_port}/model.bin', destination, _entry(payload), lambda *_: None)
        assert destination.read_bytes() == payload
        assert Handler.requests == 2
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_completed_ranges_resume_after_a_failed_request(tmp_path: Path) -> None:
    payload = bytes(range(32))
    server = _RangeServer(payload, fail_range=(24, 31))
    downloader = ResumableParallelDownloader(
        tmp_path / "models", build_opener(), chunk_size=8, max_workers=3, parallel_threshold=1,
        max_retries=0,
    )
    try:
        with pytest.raises(HTTPError):
            downloader.download(server.url, tmp_path / "first.bin", _entry(payload), lambda *_: None)

        assert (tmp_path / "models" / ".downloads").is_dir()
        server.fail_enabled = False
        downloader.download(server.url, tmp_path / "resumed.bin", _entry(payload), lambda *_: None)

        assert (tmp_path / "resumed.bin").read_bytes() == payload
        assert server.counts[(0, 7)] == 1
        assert server.counts[(8, 15)] == 1
        assert server.counts[(16, 23)] == 1
        assert server.counts[(24, 31)] == 2
        assert not (tmp_path / "models" / ".downloads").exists()
    finally:
        server.close()


def test_server_without_range_support_falls_back_to_one_stream(tmp_path: Path) -> None:
    payload = bytes(range(32))

    class Handler(BaseHTTPRequestHandler):
        requests = 0

        def do_GET(self) -> None:
            type(self).requests += 1
            self.send_response(200)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, _format: str, *_args: object) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        downloader = ResumableParallelDownloader(
            tmp_path / "models", build_opener(), chunk_size=8, max_workers=2, parallel_threshold=1
        )
        destination = tmp_path / "model.bin"
        url = f"http://127.0.0.1:{server.server_port}/model.bin"

        downloader.download(url, destination, _entry(payload), lambda *_: None)

        assert destination.read_bytes() == payload
        assert Handler.requests == 2  # One-byte range probe, followed by the full stream.
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def test_progress_callback_cancellation_keeps_verified_chunks(tmp_path: Path) -> None:
    payload = bytes(range(32))
    server = _RangeServer(payload)
    downloader = ResumableParallelDownloader(
        tmp_path / "models", build_opener(), chunk_size=8, max_workers=1, parallel_threshold=1
    )
    try:
        calls = 0

        def cancel(_current: int, _total: int) -> None:
            nonlocal calls
            calls += 1
            if calls == 2:
                raise RuntimeError("cancelled")

        with pytest.raises(RuntimeError, match="cancelled"):
            downloader.download(server.url, tmp_path / "cancelled.bin", _entry(payload), cancel)

        assert (tmp_path / "models" / ".downloads").is_dir()
        server.fail_enabled = False
        downloader.download(server.url, tmp_path / "resumed.bin", _entry(payload), lambda *_: None)
        assert (tmp_path / "resumed.bin").read_bytes() == payload
        assert server.counts[(0, 7)] == 1
    finally:
        server.close()


def test_small_download_resumes_from_its_saved_byte_offset(tmp_path: Path) -> None:
    payload = b"x" * (2 * 1024 * 1024 + 17)
    server = _RangeServer(payload)
    downloader = ResumableParallelDownloader(
        tmp_path / "models", build_opener(), parallel_threshold=len(payload) + 1
    )
    try:
        def cancel_after_first_block(current: int, _total: int) -> None:
            if current >= 1024 * 1024:
                raise RuntimeError("cancelled")

        with pytest.raises(RuntimeError, match="cancelled"):
            downloader.download(server.url, tmp_path / "cancelled.bin", _entry(payload), cancel_after_first_block)

        downloader.download(server.url, tmp_path / "resumed.bin", _entry(payload), lambda *_: None)

        assert (tmp_path / "resumed.bin").read_bytes() == payload
        assert server.counts[(1024 * 1024, len(payload) - 1)] == 1
    finally:
        server.close()


def test_model_manager_uses_parallel_downloader_and_verifies_result(tmp_path: Path, monkeypatch) -> None:
    payload = bytes(range(64))
    server = _RangeServer(payload)
    url_prefix = server.url.removesuffix("/model.bin")
    monkeypatch.setattr(manager_module, "hf_endpoint", lambda _network: url_prefix)
    spec = ModelSpec(
        model_id="test-model",
        directory="test-model",
        repo="owner/repo",
        revision="pinned-revision",
        files=(_entry(payload),),
    )
    manager = ModelManager(tmp_path / "models")
    manager._downloader_for = lambda _network: ResumableParallelDownloader(
        manager.model_root, build_opener(), chunk_size=8, max_workers=4, parallel_threshold=1
    )
    try:
        installed = manager.ensure(spec)

        assert (installed / "model.bin").read_bytes() == payload
        assert manager.is_installed(spec)
        assert len([key for key in server.counts if key != (0, 0)]) == 8
        assert not (manager.model_root / ".downloads").exists()
    finally:
        server.close()
