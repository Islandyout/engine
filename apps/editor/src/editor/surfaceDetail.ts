// Surface detail for the wuxia kit's buildings and props. They are modelled in flat vertex colours; this adds the grain of plaster,
// lacquered wood, roof tile and stone over those colours, in world space (so a long wall does not stretch a texture), and picks the
// material from the colour itself: warm red and brown are wood, teal and blue are tile, pale and grey are plaster or stone; green
// (leaves) and gold are left alone. Textures are ambientCG (CC0), 512 px; each multiplies over its own average so the palette stays.
import * as THREE from "three";

const names = ["plaster", "wood", "tile", "stone"] as const;
const layers: { color: THREE.Texture; mean: THREE.Vector3 }[] = [];
const uniformSets = new Set<Record<string, THREE.IUniform>>();

function load() {
  if (layers.length) return layers;
  const loader = new THREE.TextureLoader();
  for (const name of names) {
    const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    white.needsUpdate = true;
    const entry = { color: white as THREE.Texture, mean: new THREE.Vector3(1, 1, 1) };
    layers.push(entry);
    loader.load(`./kit/surfaces/${name}-color.jpg`, (texture) => {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(texture.image as CanvasImageSource, 0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      const lin = (v: number) => THREE.MathUtils.clamp(new THREE.Color().setRGB(v / 255, 0, 0, THREE.SRGBColorSpace).r, 0.03, 1);
      entry.color = texture;
      entry.mean.set(lin(r!), lin(g!), lin(b!));
      for (const uniforms of uniformSets) refresh(uniforms);
    });
  }
  return layers;
}

function refresh(uniforms: Record<string, THREE.IUniform>) {
  layers.forEach((layer, i) => {
    uniforms[`sColor${i}`]!.value = layer.color;
    uniforms[`sMean${i}`]!.value = layer.mean;
  });
}

// Patches a material (once) to carry the detail.
export function addSurfaceDetail(material: THREE.Material) {
  if (!(material instanceof THREE.MeshStandardMaterial) || !material.vertexColors || material.userData.surfaceDetail) return;
  material.userData.surfaceDetail = true;
  load();
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    for (let i = 0; i < 4; i++) {
      shader.uniforms[`sColor${i}`] = { value: null };
      shader.uniforms[`sMean${i}`] = { value: new THREE.Vector3(1, 1, 1) };
    }
    shader.uniforms.sTile = { value: 1.8 };
    refresh(shader.uniforms);
    uniformSets.add(shader.uniforms);
    const decl = Array.from({ length: 4 }, (_, i) => `uniform sampler2D sColor${i}; uniform vec3 sMean${i};`).join("\n");
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vSurfPos;\nvarying vec3 vSurfNormal;")
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
#ifdef USE_INSTANCING
  vSurfNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
#else
  vSurfNormal = normalize(mat3(modelMatrix) * objectNormal);
#endif`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vSurfPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vSurfPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vSurfPos;
varying vec3 vSurfNormal;
uniform float sTile;
${decl}
vec3 sample3(sampler2D t, vec3 weights) {
  vec3 x = texture2D(t, vSurfPos.zy / sTile).rgb;
  vec3 y = texture2D(t, vSurfPos.xz / sTile).rgb;
  vec3 z = texture2D(t, vSurfPos.xy / sTile).rgb;
  return x * weights.x + y * weights.y + z * weights.z;
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
#ifdef USE_COLOR
{
  vec3 c = vColor.rgb;
  float mx = max(max(c.r, c.g), c.b), mn = min(min(c.r, c.g), c.b);
  float sat = (mx - mn) / (mx + 1e-4);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  int cls = -1;
  if (c.g > c.r * 1.05 && c.g > c.b) cls = -1;                    // leaves, jade
  else if (c.r > 0.5 && c.g > 0.32 && c.b < c.g * 0.55 && sat > 0.5) cls = -1; // gold
  else if (c.r > c.g * 1.6 && c.r > c.b * 1.6) cls = 1;          // lacquer red
  else if (c.b > c.r * 1.12 && sat > 0.1) cls = 2;               // teal and blue roofs
  else if (sat < 0.12 && lum < 0.7) cls = 3;                      // grey stone
  else if (sat < 0.4 && lum > 0.3) cls = 0;                       // cream plaster and white
  else if (sat < 0.3) cls = 3;                                    // other stone
  else if (c.r > c.b * 1.3) cls = 1;                              // warm browns: wood
  if (cls >= 0) {
    vec3 w = pow(abs(normalize(vSurfNormal)), vec3(4.0));
    w /= (w.x + w.y + w.z);
    vec3 t = cls == 0 ? sample3(sColor0, w) / sMean0 : cls == 1 ? sample3(sColor1, w) / sMean1 : cls == 2 ? sample3(sColor2, w) / sMean2 : sample3(sColor3, w) / sMean3;
    float l = dot(t, vec3(0.299, 0.587, 0.114));
    diffuseColor.rgb *= clamp(mix(vec3(l), t, 0.25), 0.6, 1.5);
  }
}
#endif`,
      );
  };
  material.customProgramCacheKey = () => "surface-detail";
  material.needsUpdate = true;
}

export function addSurfaceDetailTo(root: THREE.Object3D) {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) addSurfaceDetail(material);
  });
}
