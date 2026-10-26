import io
import struct
import unittest
from host import read_message, write_message, MAX_MESSAGE_BYTES, authorized_caller, FIREFOX_EXTENSION_ID, EXTENSION_ID


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




class CallerTests(unittest.TestCase):
    def test_browser_callers(self):
        self.assertTrue(authorized_caller([f"chrome-extension://{EXTENSION_ID}/"]))
        self.assertTrue(authorized_caller(["C:/host.json", FIREFOX_EXTENSION_ID]))
        self.assertFalse(authorized_caller(["C:/host.json", "other@example.org"]))
        self.assertFalse(authorized_caller([FIREFOX_EXTENSION_ID]))
        self.assertFalse(authorized_caller([]))

if __name__ == '__main__':
    unittest.main()
