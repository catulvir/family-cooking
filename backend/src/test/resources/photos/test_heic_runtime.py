"""Run in the built production image to exercise Linux limits and bundled codecs."""
import io
from pathlib import Path
import struct
import subprocess
import sys
import unittest

from PIL import Image
import pillow_heif

ROOT = Path(__file__).resolve().parents[4]
HELPER = ROOT / "src/main/resources/photos/decode_heic.py"
FIXTURES = Path(__file__).parent


class HeicRuntimeTest(unittest.TestCase):
    def decode(self, source):
        return subprocess.run(
            [sys.executable, "-I", str(HELPER)], input=source,
            capture_output=True, timeout=15,
        )

    def test_rotated_primary_and_alpha(self):
        rotated = self.decode((FIXTURES / "quadrants-6.heic").read_bytes())
        self.assertEqual(0, rotated.returncode, rotated.stderr)
        self.assertEqual((40, 80), struct.unpack(">II", rotated.stdout[:8]))
        transparent = self.decode((FIXTURES / "transparent.heic").read_bytes())
        self.assertEqual(0, transparent.returncode, transparent.stderr)
        self.assertEqual(bytes([255]) * (40 * 20 * 3), transparent.stdout[8:])

    def test_phone_sized_tiled_image_with_linux_memory_limit(self):
        pillow_heif.register_heif_opener()
        # Synthetic 12 MP tiled photo, within the 24 MP source limit. This tests
        # real decoding under RLIMIT_AS, not only header validation or a stub.
        with Image.new("RGB", (4000, 3000), "red") as image:
            source = io.BytesIO()
            image.save(source, format="HEIF", quality=50, tile_size=512)
        result = self.decode(source.getvalue())
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual((1600, 1200), struct.unpack(">II", result.stdout[:8]))
        self.assertEqual(8 + 1600 * 1200 * 3, len(result.stdout))

    def test_corrupt_image_fails_without_diagnostics(self):
        result = self.decode((FIXTURES / "quadrants-1.heic").read_bytes()[:100])
        self.assertEqual(40, result.returncode)
        self.assertEqual(b"", result.stdout)
        self.assertEqual(b"", result.stderr)


if __name__ == "__main__":
    unittest.main()
