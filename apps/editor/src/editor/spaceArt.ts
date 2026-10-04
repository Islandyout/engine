// Spaceflight art (0.72.0): cloud layers, the Milky Way and nebulae, the
// landmark structures you can walk up to, and the built-in Kestrel survey
// ship. All procedural, so a scene needs no extra assets.
import * as THREE from "three";

function hashNoise(seed: number) {
  // 3D value noise with smooth interpolation, deterministic in `seed`.
  const lattice = (x: number, y: number, z: number) => {
    let h = (x * 374761393 + y * 668265263 + z * 1274126177 + seed * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const fade = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number, z: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz);
    const l = (a: number, b: number, t: number) => a + (b - a) * t;
    const v = (dx: number, dy: number, dz: number) => lattice(ix + dx, iy + dy, iz + dz);
    return l(
      l(l(v(0, 0, 0), v(1, 0, 0), fx), l(v(0, 1, 0), v(1, 1, 0), fx), fy),
      l(l(v(0, 0, 1), v(1, 0, 1), fx), l(v(0, 1, 1), v(1, 1, 1), fx), fy),
      fz,
    );
  };
}

// A cloud shell: an equirectangular coverage map from fBm on the sphere
// (so it wraps without seams), thresholded by `cover`, drifting slowly.
export function cloudShell(radius: number, height: number, cover: number, seed: number) {
  const width = 512, rows = 256;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = rows;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(width, rows);
  const noise = hashNoise(seed);
  for (let j = 0; j < rows; j++) {
    const lat = (0.5 - j / rows) * Math.PI;
    for (let i = 0; i < width; i++) {
      const lon = (i / width) * Math.PI * 2;
      const x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
      let sum = 0, amp = 0.55, f = 3;
      for (let o = 0; o < 5; o++, amp *= 0.5, f *= 2.1) sum += noise(x * f + 11, y * f + 7, z * f + 3) * amp;
      const density = THREE.MathUtils.smoothstep(sum, 1 - cover * 0.75, 1.02 - cover * 0.5);
      const k = (j * width + i) * 4;
      image.data[k] = image.data[k + 1] = image.data[k + 2] = 255;
      image.data[k + 3] = Math.round(density * 235);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 96, 48),
    new THREE.MeshLambertMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, emissive: 0x9aa4ad, emissiveMap: texture }),
  );
  mesh.scale.setScalar(radius + height);
  mesh.renderOrder = 1;
  return mesh;
}

function glow(color: string, inner = 0.15) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color);
  g.addColorStop(inner, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// The galaxy seen edge-on: a dense band of faint stars along a tilted great
// circle, plus a few soft nebulae. Unit-sphere positions; the caller scales
// it out to the sky and fades it with daylight.
export function milkyWay() {
  const group = new THREE.Group();
  const count = 9000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  let seed = 4242;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const gauss = () => (random() + random() + random() + random() - 2) * 0.9;
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9, 0.3, 0.4));
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2;
    const spread = gauss() * (0.06 + 0.08 * Math.abs(Math.cos(a * 0.5)));
    p.set(Math.cos(a), spread, Math.sin(a)).normalize().applyQuaternion(tilt);
    positions.set([p.x, p.y, p.z], i * 3);
    c.setHSL(0.6 - random() * 0.12, 0.3, 0.55 + random() * 0.2).multiplyScalar(0.35 + random() * 0.45);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const band = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ size: 1.1, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false }),
  );
  band.frustumCulled = false;
  group.add(band);
  const tints = ["rgba(120,150,255,0.55)", "rgba(255,120,170,0.45)", "rgba(140,255,220,0.35)", "rgba(255,190,120,0.35)"];
  for (let i = 0; i < 7; i++) {
    const a = random() * Math.PI * 2;
    p.set(Math.cos(a), gauss() * 0.12, Math.sin(a)).normalize().applyQuaternion(tilt);
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glow(tints[i % tints.length]!, 0.05), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, opacity: 0.5 }),
    );
    sprite.position.copy(p);
    sprite.scale.setScalar(0.18 + random() * 0.3);
    group.add(sprite);
  }
  group.renderOrder = -2;
  group.traverse((o) => (o.renderOrder = -2));
  return group;
}

// A Pale Signal structure: a black monolith ringed by kneeling dishes all
// facing the same patch of sky, with glyph light along its edges. Built
// standing on +y at the origin; tens of metres tall.
export function signalStructure(color: string, kind = "array") {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.35, metalness: 0.7 });
  const rubble = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.95 });
  const glyph = new THREE.MeshStandardMaterial({ color: 0x0b0d10, emissive: new THREE.Color(color), emissiveIntensity: 1.6, roughness: 0.4 });
  const monolith = (height: number, width: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(width, height, width), stone);
    m.position.y = height / 2;
    group.add(m);
    for (const [x, z] of [
      [width / 2 + 0.02, 0],
      [-width / 2 - 0.02, 0],
      [0, width / 2 + 0.02],
      [0, -width / 2 - 0.02],
    ] as const) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(x ? 0.06 : width * 0.1, height * 0.88, z ? 0.06 : width * 0.1), glyph);
      strip.position.set(x, height / 2, z);
      group.add(strip);
    }
  };
  // The Pale Signal's grammar (0.73.0): concentric, coherent rings around
  // every structure, pulsing in step (spaceView animates userData.rings).
  const rings: THREE.Mesh[] = [];
  const addRings = (inner: number, count: number, y = 0.3) => {
    for (let i = 0; i < count; i++) {
      const r = inner + i * 7;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r, r + 0.35, 96),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = y + i * 0.02;
      group.add(ring);
      rings.push(ring);
    }
  };
  if (kind === "camp") {
    // A scorched drop capsule, half-buried, with a tarp and crates.
    const capsule = new THREE.Mesh(new THREE.CapsuleGeometry(1.6, 3.2, 6, 16), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.6, metalness: 0.5 }));
    capsule.rotation.z = 1.2;
    capsule.position.set(0, 0.9, 0);
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshBasicMaterial({ color: 0x15130f, transparent: true, opacity: 0.6, depthWrite: false }));
    scorch.rotation.x = -Math.PI / 2;
    scorch.position.y = 0.05;
    const tarp = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2, 4), new THREE.MeshStandardMaterial({ color: 0xc58a3a, roughness: 0.9 }));
    tarp.position.set(5, 1, 3);
    group.add(capsule, scorch, tarp);
    for (let i = 0; i < 3; i++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9), rubble);
      crate.position.set(4 + i * 1.1, 0.35, -2 - (i % 2));
      group.add(crate);
    }
  } else if (kind === "monolith") {
    monolith(40, 6);
    addRings(10, 4);
  } else if (kind === "ruin") {
    // Broken resonators and wall stubs in a ring, around a cracked core.
    monolith(14, 4);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const h = 3 + ((i * 37) % 11);
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, h, 8), i % 3 ? stone : rubble);
      pillar.position.set(Math.cos(a) * 22, h / 2, Math.sin(a) * 22);
      pillar.rotation.z = ((i % 4) - 1.5) * 0.06;
      group.add(pillar);
      if (i % 2) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(9, 1.6 + (i % 3), 1.2), rubble);
        wall.position.set(Math.cos(a + 0.28) * 22, 0.8, Math.sin(a + 0.28) * 22);
        wall.rotation.y = -a - 0.28 + Math.PI / 2;
        group.add(wall);
      }
    }
    addRings(8, 3);
  } else if (kind === "beacon") {
    // The origin: a tall needle in nested halos.
    const needle = new THREE.Mesh(new THREE.ConeGeometry(3, 70, 6), stone);
    needle.position.y = 35;
    group.add(needle);
    for (let i = 0; i < 4; i++) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(8 + i * 5, 0.4, 8, 64), glyph);
      halo.position.y = 18 + i * 12;
      halo.rotation.x = Math.PI / 2;
      group.add(halo);
      rings.push(halo);
    }
    addRings(14, 6);
  } else {
    monolith(34, 5);
    const aim = new THREE.Vector3(0.35, 1, -0.5).normalize();
    const dishMetal = new THREE.MeshStandardMaterial({ color: 0x5b626b, roughness: 0.45, metalness: 0.75, side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const dish = new THREE.Group();
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 0.5, 1.3, 24, 1, true), dishMetal);
      bowl.position.y = 1.4;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 3.2, 8), stone);
      stem.position.y = -0.4;
      const feed = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), glyph);
      feed.position.y = 2.6;
      dish.add(bowl, stem, feed);
      dish.position.set(Math.cos(a) * 18, 2, Math.sin(a) * 18);
      dish.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), aim);
      group.add(dish);
    }
    addRings(24, 3);
  }
  group.userData.rings = rings;
  return group;
}

// The Kestrel survey ship, about 11 m long and 10 m across the wings,
// centred on its collision box: +z nose, +y up. Its two nacelles' exhausts
// are returned for the engine flames.
export function buildKestrel() {
  const group = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xd3d7dc, roughness: 0.35, metalness: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.5, metalness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0f1c2a, roughness: 0.06, metalness: 0.9 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xe8b62a, roughness: 0.5, metalness: 0.2 });
  const glowMaterial = new THREE.MeshStandardMaterial({ color: 0x9fdcff, emissive: new THREE.Color(0x5fc8ff), emissiveIntensity: 3 });
  const beacon = new THREE.MeshStandardMaterial({ color: 0xff4040, emissive: new THREE.Color(0xff3030), emissiveIntensity: 4 });
  // Fuselage: a lathed teardrop, flattened.
  const profile = [
    [0, -5.5],
    [0.75, -5.35],
    [1.2, -4],
    [1.32, -1],
    [1.26, 1.8],
    [1.0, 3.8],
    [0.55, 5.1],
    [0.12, 5.6],
    [0, 5.65],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const fuselage = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), hull);
  fuselage.geometry.rotateX(Math.PI / 2);
  fuselage.scale.set(1, 0.78, 1);
  group.add(fuselage);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), glass);
  canopy.scale.set(0.78, 0.52, 1.7);
  canopy.position.set(0, 0.72, 2.5);
  group.add(canopy);
  // Swept wings with yellow leading-edge stripes.
  const wingShape = new THREE.Shape([new THREE.Vector2(0.9, 1.6), new THREE.Vector2(5.1, -1.5), new THREE.Vector2(5.1, -2.5), new THREE.Vector2(0.9, -3.4)]);
  const wingGeometry = new THREE.ExtrudeGeometry(wingShape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
  wingGeometry.rotateX(Math.PI / 2);
  // Mirrored wings flip their winding: draw both sides.
  const wingMaterial = hull.clone();
  wingMaterial.side = THREE.DoubleSide;
  for (const side of [1, -1]) {
    const wing = new THREE.Mesh(wingGeometry, wingMaterial);
    wing.scale.set(side, 1, 1);
    wing.position.y = -0.18;
    group.add(wing);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.05, 0.28), accent);
    stripe.position.set(side * 3.0, 0.02, 0.02);
    stripe.rotation.y = side * -0.64;
    group.add(stripe);
  }
  // Nacelles with glowing exhausts.
  const exhausts: THREE.Vector3[] = [];
  for (const side of [1, -1]) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.7, 3.6, 18), dark);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(side * 2.3, -0.15, -3.5);
    const intake = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.08, 8, 18), hull);
    intake.position.set(side * 2.3, -0.15, -1.7);
    const exhaust = new THREE.Mesh(new THREE.CircleGeometry(0.52, 18), glowMaterial);
    exhaust.position.set(side * 2.3, -0.15, -5.32);
    exhaust.rotation.y = Math.PI;
    group.add(nacelle, intake, exhaust);
    exhausts.push(new THREE.Vector3(side * 2.3, -0.15, -5.35));
  }
  // Canted tail fins.
  const finShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-2.2, 0), new THREE.Vector2(-2.9, 1.9), new THREE.Vector2(-2.1, 1.9)]);
  const finGeometry = new THREE.ExtrudeGeometry(finShape, { depth: 0.14, bevelEnabled: false });
  finGeometry.rotateY(Math.PI / 2);
  for (const side of [1, -1]) {
    const fin = new THREE.Mesh(finGeometry, wingMaterial);
    fin.position.set(side * 0.55, 0.55, -2.2);
    fin.rotation.z = side * -0.38;
    group.add(fin);
  }
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), beacon);
  light.position.set(0, 2.35, -4.95);
  group.add(light);
  // Landing gear: struts and pads under the hull.
  for (const [x, z] of [
    [1.25, 2.6],
    [-1.25, 2.6],
    [1.5, -2.8],
    [-1.5, -2.8],
  ] as const) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.2, 8), dark);
    strut.position.set(x, -1.05, z);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.1, 12), dark);
    pad.position.set(x, -1.62, z);
    group.add(strut, pad);
  }
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
  return { group, exhausts };
}
