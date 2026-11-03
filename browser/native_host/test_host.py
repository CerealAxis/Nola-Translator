import io
import os
import struct
import threading
import time
import unittest
from multiprocessing.connection import Listener
from uuid import uuid4

from host import WindowsPipe, read_message, write_message, MAX_MESSAGE_BYTES, authorized_caller, FIREFOX_EXTENSION_ID, EXTENSION_ID


class NativeFramingTests(unittest.TestCase):
    def test_roundtrip(self):
        stream = io.BytesIO()
        write_message(stream, b'{"id":"hello"}')
        stream.seek(0)
        self.assertEqual(read_message(stream), b'{"id":"hello"}')

    def test_truncated_and_oversized(self):
        with self.assertRaises(EOFError):
            read_message(io.BytesIO(b'\x02\x00'))
        with self.assertRaises(ValueError):
            read_message(io.BytesIO(struct.pack('<I', MAX_MESSAGE_BYTES + 1)))

    def test_invalid_json(self):
        with self.assertRaises(ValueError):
            read_message(io.BytesIO(struct.pack('<I', 2) + b'xx'))

    def test_pretty_json_stays_in_one_desktop_frame(self):
        payload = b'{\n  "id": "hello",\n  "text": "line\\nbreak"\n}'
        frame = struct.pack('<I', len(payload)) + payload
        self.assertEqual(read_message(io.BytesIO(frame)), b'{"id":"hello","text":"line\\nbreak"}')




@unittest.skipUnless(os.name == "nt", "Windows named pipes required")
class NativePipeTests(unittest.TestCase):
    def test_cancel_releases_overlapped_read_before_handle_close(self):
        address = rf"\\.\pipe\nola-browser-{uuid4()}"
        with Listener(address, family="AF_PIPE") as listener, WindowsPipe(address) as pipe, listener.accept():
            results = []
            receiver = threading.Thread(target=lambda: results.append(pipe.read(4096)), daemon=True)
            receiver.start()
            try:
                deadline = time.monotonic() + 2
                while pipe._pending_read is None and time.monotonic() < deadline:
                    time.sleep(0.001)
                self.assertIsNotNone(pipe._pending_read)
            finally:
                pipe.cancel_read()
                receiver.join(timeout=2)
            self.assertFalse(receiver.is_alive())
            self.assertEqual(results, [b""])
            self.assertEqual(pipe.read(4096), b"")


class CallerTests(unittest.TestCase):
    def test_browser_callers(self):
        self.assertTrue(authorized_caller([f"chrome-extension://{EXTENSION_ID}/"]))
        self.assertTrue(authorized_caller(["C:/host.json", FIREFOX_EXTENSION_ID]))
        self.assertFalse(authorized_caller(["C:/host.json", "other@example.org"]))
        self.assertFalse(authorized_caller([FIREFOX_EXTENSION_ID]))
        self.assertFalse(authorized_caller([]))

if __name__ == '__main__':
    unittest.main()
