"""One upload per process. stdin: HEIC bytes; stdout: big-endian width/height + RGB.

Only pixels cross back to the JVM. No originals, metadata, or credentials are saved.
Exit codes: 40 invalid, 41 unsupported, 42 excessive dimensions, 43 codec unavailable.
"""
import io
import struct
import sys

# Production runs on Linux. Windows development still has the JVM deadline and
# byte/pixel/concurrency bounds, but resource.setrlimit is not available there.
if sys.platform == "linux":
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024,) * 2)
    resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

try:
    from PIL import Image
    import pillow_heif
except ImportError:
    sys.exit(43)


def decode():
    pillow_heif.options.DECODE_THREADS = 1
    pillow_heif.options.THUMBNAILS = False
    pillow_heif.options.DEPTH_IMAGES = False
    pillow_heif.options.AUX_IMAGES = False
    # Keep libheif's security limits enabled. The plugin applies container
    # transforms and resets EXIF orientation, avoiding a second rotation.
    pillow_heif.register_heif_opener()
    source = sys.stdin.buffer.read(5 * 1024 * 1024 + 1)
    if len(source) > 5 * 1024 * 1024:
        sys.exit(42)
    with Image.open(io.BytesIO(source), formats=["HEIF"]) as image:
        if image.format != "HEIF" or image.get_format_mimetype() not in ("image/heic", "image/heif"):
            sys.exit(41)
        # Use the primary still image; depth maps/thumbnails are not user photos.
        width, height = image.size
        if width <= 0 or height <= 0:
            sys.exit(40)
        if width * height > 24_000_000:
            sys.exit(42)
        image.load()
        if image.width * image.height > 24_000_000:
            sys.exit(42)
        image.thumbnail((1600, 1600), Image.Resampling.LANCZOS)
        rgba = image.convert("RGBA")
        rgb = Image.new("RGB", rgba.size, "white")
        rgb.paste(rgba, mask=rgba.getchannel("A"))
        sys.stdout.buffer.write(struct.pack(">II", *rgb.size))
        sys.stdout.buffer.write(rgb.tobytes())


try:
    decode()
except (Image.DecompressionBombError, Image.DecompressionBombWarning):
    sys.exit(42)
except MemoryError:
    sys.exit(43)
except Exception:
    # Neither native diagnostics nor metadata are returned/logged.
    sys.exit(40)
