# One-off import script (0.32.0): converts four species from Quaternius's
# "animal animations" CC0 pack (self-contained per-species .gltf, embedded
# base64 buffer, no external textures) into single-file .glb under
# assets/source/kit/animals/, renaming their Idle/Walk/Gallop clips to this
# project's idle/walk/run convention (see animationClips.ts's pickClipName).
# Not wired into tools/build_editor.sh -- it was run once against the
# user-supplied source archive (see assets/CREDITS.md for hash/license),
# which isn't part of this repo, so it's kept for provenance/reproducibility
# rather than as a build step.
import json, base64, struct, os

SRC_DIR = "/tmp/anim-packs/6d0d20e5-animal_animations/animal animations/gltf-extracted/glTF"
DST_DIR = "/home/user/engine/assets/source/kit/animals"

clip_rename = {"Idle": "idle", "Walk": "walk", "Gallop": "run"}

def convert(species, out_name):
    with open(os.path.join(SRC_DIR, species + ".gltf")) as f:
        gltf = json.load(f)
    buf = gltf["buffers"][0]
    uri = buf["uri"]
    assert uri.startswith("data:application/octet-stream;base64,")
    raw = base64.b64decode(uri.split(",", 1)[1])
    assert len(raw) == buf["byteLength"]
    del buf["uri"]
    for a in gltf.get("animations", []):
        if a["name"] in clip_rename:
            a["name"] = clip_rename[a["name"]]
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    pad = (4 - len(json_bytes) % 4) % 4
    json_bytes += b" " * pad
    bin_pad = (4 - len(raw) % 4) % 4
    bin_padded = raw + b"\x00" * bin_pad
    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_padded)
    out_path = os.path.join(DST_DIR, out_name + ".glb")
    with open(out_path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total_len))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
        f.write(struct.pack("<II", len(bin_padded), 0x004E4942))
        f.write(bin_padded)
    clips = [a["name"] for a in gltf.get("animations", [])]
    print(f"{species} -> {out_path}: clips={clips}")

for species, out_name in [("Wolf", "wolf"), ("Husky", "husky"), ("Stag", "stag"), ("Alpaca", "alpaca")]:
    convert(species, out_name)
