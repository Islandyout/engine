# One-off import script (0.32.0): builds assets/source/kit/people/mannequin_f.glb
# by combining Quaternius's "Female Mannequin" mesh/skin (Mannequin_F.glb, no
# animations of its own) with a curated, renamed subset of locomotion clips
# from Quaternius's Universal Animation Library[Standard] (UAL1_Standard.glb,
# same 67-bone UE-mannequin-style skeleton, verified by name/order match).
# Not wired into tools/build_editor.sh -- it was run once against the
# user-supplied source archives (see assets/CREDITS.md for hashes/license),
# which aren't part of this repo, so it's kept for provenance/reproducibility
# rather than as a build step.
import struct, json, base64, copy

def read_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, version, length = struct.unpack("<4sII", data[0:12])
    offset = 12
    gltf = None
    bin_chunk = b""
    while offset < length:
        chunk_len, chunk_type = struct.unpack("<II", data[offset:offset+8])
        chunk_data = data[offset+8:offset+8+chunk_len]
        if chunk_type == 0x4E4F534A:
            gltf = json.loads(chunk_data)
        elif chunk_type == 0x004E4942:
            bin_chunk = chunk_data
        offset += 8 + chunk_len
    return gltf, bin_chunk

def write_glb(path, gltf, bin_chunk):
    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    pad = (4 - len(json_bytes) % 4) % 4
    json_bytes += b" " * pad
    bin_pad = (4 - len(bin_chunk) % 4) % 4
    bin_padded = bin_chunk + b"\x00" * bin_pad
    total_len = 12 + 8 + len(json_bytes) + 8 + len(bin_padded)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total_len))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
        f.write(struct.pack("<II", len(bin_padded), 0x004E4942))
        f.write(bin_padded)

mesh_gltf, mesh_bin = read_glb("/tmp/anim-packs/cbe1b5f4-Universal_Animation_Library_2Standard/Universal Animation Library 2[Standard]/Female Mannequin/Unreal-Godot/Mannequin_F.glb")
anim_gltf, anim_bin = read_glb("/tmp/anim-packs/518c579b-Universal_Animation_LibraryStandard/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb")

mesh_names = [n.get("name") for n in mesh_gltf["nodes"]]
anim_names = [n.get("name") for n in anim_gltf["nodes"]]
# Every bone name/order matches between the two rigs except each file's own
# mesh-container node name (index 65: "Mannequin_F" vs "Mannequin") -- that
# node isn't a bone and isn't targeted by any animation channel.
mismatches = [i for i, (a, b) in enumerate(zip(mesh_names, anim_names)) if a != b]
assert mismatches == [65], f"unexpected skeleton mismatch at {mismatches}"

clip_map = {
    "idle": "Idle_Loop",
    "walk": "Walk_Loop",
    "run": "Jog_Fwd_Loop",
    "sprint": "Sprint_Loop",
    "talk": "Idle_Talking_Loop",
    "sit": "Sitting_Idle_Loop",
}

anim_by_name = {a["name"]: a for a in anim_gltf["animations"]}

# We'll append: anim_gltf's accessors/bufferViews (renumbered) plus its bin chunk
# (appended after mesh_bin, offsets shifted), and new animation entries referencing
# the SAME node indices (0..66) since node order/names are identical between the two files.

out_gltf = copy.deepcopy(mesh_gltf)
base_accessor_offset = len(out_gltf.get("accessors", []))
base_bufferview_offset = len(out_gltf.get("bufferViews", []))
base_buffer_offset = len(out_gltf.get("buffers", []))

mesh_bin_len = len(mesh_bin)
pad = (4 - mesh_bin_len % 4) % 4
combined_bin = mesh_bin + b"\x00" * pad
bin_shift = len(combined_bin)

out_gltf.setdefault("accessors", [])
out_gltf.setdefault("bufferViews", [])
out_gltf.setdefault("buffers", [])

# Copy anim_gltf's buffers (should be 1, index 0) -- append as new buffer(s), byteOffset-shifted bufferViews.
for bv in anim_gltf["bufferViews"]:
    new_bv = copy.deepcopy(bv)
    new_bv["buffer"] = base_buffer_offset + bv.get("buffer", 0)
    new_bv["byteOffset"] = bv.get("byteOffset", 0) + bin_shift
    out_gltf["bufferViews"].append(new_bv)

for acc in anim_gltf["accessors"]:
    new_acc = copy.deepcopy(acc)
    if "bufferView" in new_acc:
        new_acc["bufferView"] = base_bufferview_offset + new_acc["bufferView"]
    out_gltf["accessors"].append(new_acc)

for buf in anim_gltf["buffers"]:
    new_buf = copy.deepcopy(buf)
    out_gltf["buffers"].append(new_buf)

combined_bin = combined_bin + anim_bin

# total buffer length correction: single combined buffer covering both chunks
out_gltf["buffers"] = [{"byteLength": len(combined_bin)}]
# fix bufferView.buffer indices all to 0 (single combined buffer)
for bv in out_gltf["bufferViews"]:
    bv["buffer"] = 0

new_animations = []
for new_name, src_name in clip_map.items():
    src = anim_by_name[src_name]
    clip = {"name": new_name, "channels": [], "samplers": []}
    sampler_offset = 0
    for ch in src["channels"]:
        sampler = src["samplers"][ch["sampler"]]
        new_sampler = {
            "input": base_accessor_offset + sampler["input"],
            "output": base_accessor_offset + sampler["output"],
            "interpolation": sampler.get("interpolation", "LINEAR"),
        }
        clip["samplers"].append(new_sampler)
        clip["channels"].append({
            "sampler": len(clip["samplers"]) - 1,
            "target": {"node": ch["target"]["node"], "path": ch["target"]["path"]},
        })
    new_animations.append(clip)

out_gltf["animations"] = new_animations
out_gltf["asset"] = {"version": "2.0", "generator": "engine tools/scratch/build_mannequin.py"}

write_glb("/home/user/engine/assets/source/kit/people/mannequin_f.glb", out_gltf, combined_bin)
print("wrote mannequin_f.glb, clips:", [a["name"] for a in new_animations])
