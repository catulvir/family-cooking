# Synthetic HEIC fixtures

These repository-owned images contain only coloured blocks, transparency, and the
test string `PRIVATE HEIC METADATA`; no real photos or personal metadata.

Run `generate_heic_fixtures.py` using the versions pinned in
`backend/photo-codecs-requirements.txt` to regenerate them. The rotated fixture
has a real `irot` property plus EXIF orientation to detect accidental double
rotation. The tiled and over-24mp fixtures exercise HEVC grids and pre-decode
size rejection.

`test_heic_runtime.py` runs the actual decoder helper, including a generated
12 MP tiled photo, under Linux resource limits. CI runs it after installing the
codecs; it can also run inside the production Docker image with this source
directory mounted read-only.
