"""Prepare the two user-supplied CC BY town models (requires Pillow).

python scripts/prepare-town-model.py /path/to/upload /path/to/assets/_m
Geometry, UVs, node transforms and original attribution remain unchanged.
"""
import hashlib
import io
import json
from pathlib import Path
import struct
import sys

from PIL import Image


def prepare(source, destination):
    raw = source.read_bytes()
    assert raw[:4] == b"glTF" and struct.unpack_from("<II", raw, 4) == (2, len(raw))
    json_length = struct.unpack_from("<I", raw, 12)[0]
    document = json.loads(raw[20:20 + json_length])
    binary = raw[28 + json_length:]
    assert len(document["buffers"]) == 1
    image_views = {image["bufferView"]: image for image in document["images"]}
    color_views = {document["images"][document["textures"][material["pbrMetallicRoughness"]["baseColorTexture"]["index"]]["source"]]["bufferView"] for material in document["materials"]}
    output = bytearray()
    geometry = hashlib.sha256()
    for index, view in enumerate(document["bufferViews"]):
        offset = view.get("byteOffset", 0)
        chunk = binary[offset:offset + view["byteLength"]]
        assert len(chunk) == view["byteLength"]
        if index in image_views:
            image = Image.open(io.BytesIO(chunk))
            encoded = io.BytesIO()
            if index in color_views and image.mode == "RGB":
                image.save(encoded, "JPEG", quality=88, optimize=True)
                image_views[index]["mimeType"] = "image/jpeg"
            else:
                image.thumbnail((512, 512), Image.Resampling.LANCZOS)
                image.save(encoded, "PNG", optimize=True)
                image_views[index]["mimeType"] = "image/png"
            chunk = encoded.getvalue()
        else:
            geometry.update(chunk)
        output.extend(b"\0" * (-len(output) % 4))
        view["byteOffset"] = len(output)
        view["byteLength"] = len(chunk)
        output.extend(chunk)
    document["buffers"][0]["byteLength"] = len(output)
    document["asset"].setdefault("extras", {})["historykids"] = {
        "changes": "Base color PNG converted to JPEG quality 88; other textures reduced to 512px. Geometry and node transforms unchanged. Display uses uniform scaling and ground centering.",
        "geometrySha256": geometry.hexdigest(),
    }
    encoded_json = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode()
    encoded_json += b" " * (-len(encoded_json) % 4)
    output.extend(b"\0" * (-len(output) % 4))
    result = struct.pack("<4sII", b"glTF", 2, 28 + len(encoded_json) + len(output))
    result += struct.pack("<I4s", len(encoded_json), b"JSON") + encoded_json
    result += struct.pack("<I4s", len(output), b"BIN\0") + output
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(result)
    print(f"{destination.name}: {len(raw):,} → {len(result):,} bytes; geometry {geometry.hexdigest()}")


if __name__ == "__main__":
    source_root, output_root = map(Path, sys.argv[1:])
    prepare(source_root / "traditional_japanese_pagoda_3d_model.glb", output_root / "pagoda.glb")
    prepare(source_root / "shrine_gate_torii.glb", output_root / "torii.glb")
