"""Cook the supported static GLB subset into bounded, little-endian GEA1 data."""
import json
import math
import struct
import sys
from pathlib import Path


def cook(data, texture):
    if len(data) < 28 or len(data) > 16_000_000:
        raise ValueError('GLB size outside limit')
    magic, version, length = struct.unpack_from('<III', data)
    if (magic, version, length) != (0x46546C67, 2, len(data)):
        raise ValueError('invalid GLB header')
    chunks = []
    offset = 12
    while offset < len(data):
        if offset + 8 > len(data):
            raise ValueError('truncated chunk')
        size, kind = struct.unpack_from('<II', data, offset)
        offset += 8
        if size % 4 or offset + size > len(data):
            raise ValueError('invalid chunk size')
        chunks.append((kind, data[offset:offset+size]))
        offset += size
    if [kind for kind, _ in chunks] != [0x4E4F534A, 0x004E4942]:
        raise ValueError('requires JSON then BIN')
    doc = json.loads(chunks[0][1])
    blob = chunks[1][1]
    if doc.get('asset', {}).get('version') != '2.0' or doc.get('extensionsRequired'):
        raise ValueError('unsupported asset version/extensions')
    if len(doc.get('nodes', [])) != 1 or len(doc.get('meshes', [])) != 1:
        raise ValueError('requires one static identity mesh node')
    node = doc['nodes'][0]
    if doc.get('scene', 0) != 0 or doc.get('scenes') != [{'nodes':[0]}]:
        raise ValueError('requires one scene referencing the mesh node')
    if node.get('mesh') != 0 or any(k in node for k in ('matrix','translation','rotation','scale','skin','children')):
        raise ValueError('node transforms/hierarchy/skins require a later cooker')
    if doc.get('animations') or doc.get('skins') or doc.get('textures'):
        raise ValueError('unsupported animation/skin/embedded texture')
    if len(doc.get('buffers', [])) != 1 or 'uri' in doc['buffers'][0] or doc['buffers'][0]['byteLength'] > len(blob):
        raise ValueError('requires one embedded buffer')
    def read(index, shape, component):
        if not isinstance(index, int) or index < 0 or index >= len(doc['accessors']):
            raise ValueError('invalid accessor')
        a = doc['accessors'][index]
        if a['type'] != shape or a['componentType'] != component or a.get('sparse') or a.get('normalized'):
            raise ValueError('unsupported accessor')
        vi = a['bufferView']
        if vi < 0 or vi >= len(doc['bufferViews']): raise ValueError('invalid view')
        view = doc['bufferViews'][vi]
        if view.get('buffer', 0) != 0: raise ValueError('invalid buffer')
        count = a['count']
        fmt = {5126:'f',5123:'H',5125:'I'}[component] * {'VEC3':3,'VEC2':2,'SCALAR':1}[shape]
        size = struct.calcsize('<'+fmt)
        stride = view.get('byteStride', size)
        start = view.get('byteOffset', 0)
        relative = a.get('byteOffset', 0)
        end = start + view['byteLength']
        if count < 1 or count > 300000 or stride < size or start < 0 or relative < 0 or end > doc['buffers'][0]['byteLength'] or start+relative+(count-1)*stride+size > end:
            raise ValueError('accessor out of bounds')
        return [struct.unpack_from('<'+fmt, blob, start+relative+i*stride) for i in range(count)]
    vertices = bytearray()
    for primitive in doc['meshes'][0]['primitives']:
        if primitive.get('mode', 4) != 4 or primitive.get('targets') or primitive.get('extensions'):
            raise ValueError('requires static triangles')
        attrs = primitive['attributes']
        pos, normal, uv = read(attrs['POSITION'],'VEC3',5126), read(attrs['NORMAL'],'VEC3',5126), read(attrs['TEXCOORD_0'],'VEC2',5126)
        if len(pos) != len(normal) or len(pos) != len(uv): raise ValueError('attribute counts differ')
        ii = primitive['indices']
        if not isinstance(ii,int) or ii<0 or ii>=len(doc['accessors']): raise ValueError('invalid indices accessor')
        ia = doc['accessors'][ii]
        if ia['componentType'] not in (5123,5125): raise ValueError('unsupported index type')
        indices = read(primitive['indices'],'SCALAR',ia['componentType'])
        if len(indices) % 3: raise ValueError('incomplete triangle')
        mi = primitive['material']
        if not isinstance(mi,int) or mi<0 or mi>=len(doc['materials']): raise ValueError('invalid material index')
        material = doc['materials'][mi]
        if material.get('alphaMode','OPAQUE') != 'OPAQUE': raise ValueError('transparent material')
        color = material.get('pbrMetallicRoughness',{}).get('baseColorFactor',[1,1,1,1])
        if len(color)!=4 or any(not math.isfinite(c) or c<0 or c>1 for c in color) or color[3]!=1: raise ValueError('invalid color')
        srgb = [round(255*(12.92*c if c<=0.0031308 else 1.055*c**(1/2.4)-0.055)) for c in color[:3]]
        for (index,) in indices:
            if index >= len(pos): raise ValueError('index outside vertex array')
            values = pos[index]+normal[index]+uv[index]
            if any(not math.isfinite(v) for v in values) or any(abs(v)>100 for v in pos[index]+uv[index]) or any(abs(v)>1.001 for v in normal[index]): raise ValueError('nonfinite/out-of-range vertex')
            vertices += struct.pack('<8f4B', *values, *srgb, int(material.get('name')=='wood'))
            if len(vertices)//36>300000: raise ValueError('too many vertices')
    if not vertices or len(texture)!=64*64*4: raise ValueError('empty mesh or invalid texture')
    return b'GEA1'+struct.pack('<II',len(vertices)//36,64)+vertices+texture


if __name__ == '__main__':
    if len(sys.argv)!=4: raise SystemExit('Usage: cook_static_mesh.py model.glb texture.rgba output.gea')
    Path(sys.argv[3]).write_bytes(cook(Path(sys.argv[1]).read_bytes(),Path(sys.argv[2]).read_bytes()))
