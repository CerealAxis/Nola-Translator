import io
import struct
import unittest
from host import read_message, write_message, MAX_MESSAGE_BYTES


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


if __name__ == '__main__':
    unittest.main()
