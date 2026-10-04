# Builds assets/source/kit/people/talari.glb, the Talari of Pale Signal, from
# the CC0 Quaternius mannequin (kit/people/mannequin_f.glb): the same
# skeleton and animation clips, reshaped -- a narrower torso, a longer skull
# with a crest -- and dressed in a layered tunic and shoulder mantle skinned
# to the spine, with vertex-coloured hems so a Material tint reads as cloth.
#
# Usage (Blender's Python module, e.g. `pip install bpy==4.2.0` on Python 3.11):
#   python -c "import sys; sys.argv=['x','<mannequin_f.glb>','<talari.glb>']; exec(open('tools/models/make_talari.py').read())"
import bpy, bmesh, math, sys
from mathutils import Vector

src, dst = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.parent is None:
        bpy.data.objects.remove(o, do_unlink=True)  # the importer's bone-shape sphere
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
bones = arm.data.bones
def bone_head(name):
    return arm.matrix_world @ bones[name].head_local
def bone_tail(name):
    return arm.matrix_world @ bones[name].tail_local

TORSO = {'pelvis', 'spine_01', 'spine_02', 'spine_03', 'clavicle_l', 'clavicle_r'}
HEAD = {'Head'}
centre_x = (bone_head('pelvis').x)
head_base = bone_head('Head')

# Reshape the body meshes in their rest pose (weights stay, so the rig and
# every clip still drive them).
for o in [o for o in bpy.data.objects if o.type == 'MESH']:
    names = {g.index: g.name for g in o.vertex_groups}
    mw, mwi = o.matrix_world, o.matrix_world.inverted()
    for v in o.data.vertices:
        if not v.groups:
            continue
        best = max(v.groups, key=lambda g: g.weight)
        bone = names.get(best.group, '')
        p = mw @ v.co
        if bone in TORSO:
            # Narrow-torsoed: pull the chest and hips in toward the spine.
            p.x = centre_x + (p.x - centre_x) * 0.8
        elif bone in HEAD or bone == 'neck_01':
            # A longer skull, swept up and back.
            d = p - head_base
            if bone in HEAD:
                d.z *= 1.18
                d.y *= 1.06
                d.x *= 0.92
            p = head_base + d
        v.co = mwi @ p

def skinned(obj, weights_for):
    obj.parent = arm
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    groups = {}
    for v in obj.data.vertices:
        for bone, w in weights_for(obj.matrix_world @ v.co):
            if bone not in groups:
                groups[bone] = obj.vertex_groups.new(name=bone)
            groups[bone].add([v.index], w, 'REPLACE')

def colour(obj, fn):
    attr = obj.data.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    for poly in obj.data.polygons:
        for li in poly.loop_indices:
            p = obj.matrix_world @ obj.data.vertices[obj.data.loops[li].vertex_index].co
            attr.data[li].color = fn(p)
    obj.data.color_attributes.active_color = attr
    mat = bpy.data.materials.new(obj.name + 'Cloth')
    mat.use_nodes = True
    nt = mat.node_tree
    vc = nt.nodes.new('ShaderNodeVertexColor')
    vc.layer_name = 'Col'
    bsdf = nt.nodes['Principled BSDF']
    nt.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.9
    obj.data.materials.append(mat)

chest = bone_head('spine_03')
hips = bone_head('pelvis')
knee = bone_head('calf_l')
top_z, hem_z = chest.z + 0.12, (hips.z + knee.z) / 2

# The tunic: a tapered, slightly flared tube from the chest to mid-thigh.
bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=1, depth=1)
tunic = bpy.context.active_object
tunic.name = 'TalariTunic'
for v in tunic.data.vertices:
    t = v.co.z + 0.5  # 0 at the hem, 1 at the top
    z = hem_z + (top_z - hem_z) * t
    rx = 0.17 - 0.05 * t
    ry = 0.13 - 0.02 * t
    v.co = Vector((centre_x + v.co.x * rx, hips.y + v.co.y * ry, z))
def tunic_weights(p):
    t = (p.z - hem_z) / max(top_z - hem_z, 1e-6)
    if t > 0.66:
        return [('spine_03', 1.0)]
    if t > 0.33:
        return [('spine_01', 0.6), ('spine_02', 0.4)]
    return [('pelvis', 1.0)]
skinned(tunic, tunic_weights)
colour(tunic, lambda p: (0.55, 0.5, 0.45, 1) if p.z < hem_z + 0.05 else (1, 1, 1, 1) if p.z < top_z - 0.06 else (0.7, 0.66, 0.6, 1))

# The mantle: a ring over the shoulders.
bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.045, major_segments=24, minor_segments=8)
mantle = bpy.context.active_object
mantle.name = 'TalariMantle'
for v in mantle.data.vertices:
    v.co = Vector((centre_x + v.co.x * 1.15, chest.y + v.co.y * 0.8, chest.z + 0.17 + v.co.z))
skinned(mantle, lambda p: [('spine_03', 1.0)])
colour(mantle, lambda p: (0.82, 0.78, 0.7, 1))

# The crest: a thin swept fin over the skull.
bpy.ops.mesh.primitive_cube_add(size=1)
crest = bpy.context.active_object
crest.name = 'TalariCrest'
crown = bone_head('Head')
for v in crest.data.vertices:
    v.co = Vector((crown.x + v.co.x * 0.02, crown.y + 0.03 + v.co.y * 0.16 - (v.co.z + 0.5) * 0.06, crown.z + 0.2 + (v.co.z + 0.5) * 0.09))
skinned(crest, lambda p: [('Head', 1.0)])
colour(crest, lambda p: (0.35, 0.33, 0.4, 1))

# Clip names without Blender's "_Armature" suffix (the catalog's names).
for a in bpy.data.actions:
    if a.name.endswith('_Armature'):
        a.name = a.name[:-len('_Armature')]
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_animations=True, export_animation_mode='ACTIONS',
                          export_vertex_color='ACTIVE', export_skins=True, export_cameras=False, export_lights=False)
