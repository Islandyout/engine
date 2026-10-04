# Converts one Quaternius .blend into a textureless GLB for the model catalog:
# each face takes the colour its UVs sample from the pack's palette texture
# (or its material's base colour), stored as a vertex colour, and the
# texture is dropped (the catalog and tools/import_model.mjs are textureless).
#
# Usage (Blender's Python module, e.g. `pip install bpy==4.2.0` on Python 3.11):
#   python -c "import sys; sys.argv=['x','<in.blend>','<out.glb>']; exec(open('tools/blend_to_vertex_color_glb.py').read())"
# Blender may crash on exit after the export finishes; check the output file.
import bpy, sys
src, dst = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=src)
for o in list(bpy.data.objects):
    if o.type in ('CAMERA', 'LIGHT'):
        bpy.data.objects.remove(o, do_unlink=True)
cache = {}
def pixels(img):
    if img.name not in cache:
        cache[img.name] = (img.size[0], img.size[1], list(img.pixels[:]))
    return cache[img.name]
def mat_image(mat):
    if not mat or not mat.use_nodes:
        return None
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            return n.image
    return None
def mat_color(mat):
    if mat and mat.use_nodes:
        for n in mat.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                return tuple(n.inputs['Base Color'].default_value)
    if mat:
        return tuple(mat.diffuse_color)
    return (0.8, 0.8, 0.8, 1.0)
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    me = o.data
    attr = me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    uv = me.uv_layers.active
    for poly in me.polygons:
        mat = o.material_slots[poly.material_index].material if o.material_slots else None
        img = mat_image(mat)
        if img and uv:
            w, h, px = pixels(img)
            u = sum(uv.data[li].uv[0] for li in poly.loop_indices) / poly.loop_total
            v = sum(uv.data[li].uv[1] for li in poly.loop_indices) / poly.loop_total
            x = min(w - 1, max(0, int((u % 1.0) * w))); y = min(h - 1, max(0, int((v % 1.0) * h)))
            i = (y * w + x) * 4
            c = (px[i], px[i + 1], px[i + 2], 1.0)
        else:
            c = mat_color(mat)
        for li in poly.loop_indices:
            attr.data[li].color = c
    me.color_attributes.active_color = attr
plain = bpy.data.materials.new('VertexColor'); plain.use_nodes = True
nt = plain.node_tree; bsdf = nt.nodes['Principled BSDF']
vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.7
for o in bpy.data.objects:
    if o.type == 'MESH':
        o.data.materials.clear(); o.data.materials.append(plain)
for img in list(bpy.data.images):
    bpy.data.images.remove(img)
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_apply=True,
    export_animations=False, export_cameras=False, export_lights=False,
    export_vertex_color='ACTIVE', export_normals=True, export_texcoords=False)
