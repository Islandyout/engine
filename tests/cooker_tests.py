import importlib.util
import json
import struct
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('cooker', ROOT/'tools/cook_static_mesh.py')
cooker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cooker)
SOURCE = (ROOT/'assets/source/bench.glb').read_bytes()
TEXTURE = (ROOT/'assets/source/planks.rgba').read_bytes()


def changed(edit):
    size = struct.unpack_from('<I', SOURCE, 12)[0]
    doc = json.loads(SOURCE[20:20+size])
    edit(doc)
    payload = json.dumps(doc, separators=(',', ':')).encode()
    payload += b' ' * (-len(payload) % 4)
    chunks = struct.pack('<II',len(payload),0x4E4F534A)+payload+SOURCE[20+size:]
    return struct.pack('<III',0x46546C67,2,12+len(chunks))+chunks


class CookerTests(unittest.TestCase):
    def test_reproducible_fixture(self):
        self.assertEqual(cooker.cook(SOURCE,TEXTURE),(ROOT/'assets/cooked/bench.gea').read_bytes())

    def test_rejects_malformed(self):
        for data in (SOURCE[:-1], b'bad', SOURCE+b'extra'):
            with self.subTest(size=len(data)), self.assertRaises(ValueError): cooker.cook(data,TEXTURE)

    def test_rejects_unsupported_and_bounds(self):
        edits = [lambda d:d.update(extensionsRequired=['KHR_draco_mesh_compression']),
                 lambda d:d['nodes'][0].update(translation=[1,0,0]),
                 lambda d:d['accessors'][0].update(count=999999999),
                 lambda d:d['accessors'][0].update(sparse={'count':1}),
                 lambda d:d['accessors'][0].update(byteOffset=-1),
                 lambda d:d['meshes'][0]['primitives'][0].update(mode=1)]
        for edit in edits:
            with self.subTest(edit=edit), self.assertRaises(ValueError): cooker.cook(changed(edit),TEXTURE)

    def test_rejects_texture_length(self):
        with self.assertRaises(ValueError): cooker.cook(SOURCE,TEXTURE[:-1])


if __name__=='__main__': unittest.main()
