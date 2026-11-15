"""Regenerate synthetic fixtures with photo-codecs-requirements.txt; no personal photos."""
from pathlib import Path
from PIL import Image, ImageDraw
import pillow_heif

pillow_heif.register_heif_opener()
root = Path(__file__).parent
image = Image.new("RGB", (80, 40), "white")
draw = ImageDraw.Draw(image)
draw.rectangle((0, 0, 39, 19), fill="red")
draw.rectangle((40, 0, 79, 19), fill="green")
draw.rectangle((0, 20, 39, 39), fill="blue")
for orientation in (1, 6):
    exif = Image.Exif()
    exif[274] = orientation
    exif[270] = "PRIVATE HEIC METADATA"
    image.save(root / f"quadrants-{orientation}.heic", quality=95, exif=exif.tobytes())
Image.new("RGBA", (40, 20), (255, 0, 0, 0)).save(root / "transparent.heic", quality=95)
Image.new("RGB", (2000, 1000), "red").save(root / "tiled.heic", quality=80, tile_size=512)
Image.new("RGB", (6400, 4000), "red").save(root / "over-24mp.heic", quality=20, tile_size=1024)
