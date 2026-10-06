// The Manhwa look (GATEBREAKER M0): PostProcessing.style = "Manhwa" turns
// the lit scene into an inked comic panel.
//
// - Toon shading: every standard (PBR) material's direct light falls into
//   three tones (lit, half and unlit), shadows get a hard edge and highlights
//   are damped. The ambient light shows in the unlit tone, so a cool
//   hemisphere gives hue-shifted shadows. Off, the shader is the stock one.
// - Rim light on characters (materials of animated catalog models): a thin
//   bright edge where the surface turns away from the camera.
// - Ink: a post pass draws lines where the depth jumps (silhouettes), where
//   it bends (creases and corners) and where flat fills meet (a jacket's
//   collar, a loincloth's hem). Lines fade out in the distance.
//
// The toon uniforms are shared by every material, so switching the style
// costs no shader recompiles.
import * as THREE from "three";
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

export const toonUniforms = {
  toonOn: { value: 0 },
  toonRim: { value: 0 },
  toonRimColor: { value: new THREE.Color(1, 0.93, 0.85) },
};

// Three tones: unlit below the terminator, a half tone, then fully lit. The
// steps are a few hundredths wide so the edge is crisp but not aliased.
const toonFunctions = /* glsl */ `
uniform float toonOn;
uniform float toonRim;
uniform vec3 toonRimColor;
float toonDot( const in float x ) {
  float band = mix( 0.4, 1.0, smoothstep( 0.3, 0.36, x ) ) * smoothstep( -0.02, 0.04, x );
  return mix( saturate( x ), band, toonOn );
}
float toonShadow( const in float s ) {
  return mix( s, smoothstep( 0.4, 0.6, s ), toonOn );
}
`;

// RE_Direct_Physical's own dotNL (the first one followed by its irradiance).
const physicalLights = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
  /float dotNL = saturate\( dot\( geometryNormal, directLight\.direction \) \);(\s*vec3 irradiance)/,
  "float dotNL = toonDot( dot( geometryNormal, directLight.direction ) );$1",
).replace(
  "reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );",
  "reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material ) * ( 1.0 - 0.85 * toonOn );",
);

// Each light's shadow lookup, given a hard edge.
const lightsBegin = THREE.ShaderChunk.lights_fragment_begin.split("\n")
  .map((line) => (/\? get(Point)?Shadow\(/.test(line) ? line.replace(/\? get/, "? toonShadow( get").replace(/\) : 1\.0;\s*$/, ") ) : 1.0;") : line))
  .join("\n");

const rim = /* glsl */ `
#ifdef TOON_RIM
  {
    float facing = saturate( dot( normalize( normal ), normalize( vViewPosition ) ) );
    float edge = smoothstep( 0.68, 0.74, 1.0 - facing );
    outgoingLight += toonRimColor * toonRim * edge * ( 0.35 + 0.65 * diffuseColor.rgb );
  }
#endif
#include <opaque_fragment>`;

// True once the chunks are known to match this three.js version.
export const toonPatchApplies =
  physicalLights.includes("toonDot(") && physicalLights.includes("toonOn );") && lightsBegin.includes("toonShadow( getShadow(");

let installed = false;
// Patches every MeshStandardMaterial (and MeshPhysicalMaterial) through the
// prototype. A material with its own onBeforeCompile keeps its own shader.
export function installToonShading() {
  if (installed || !toonPatchApplies) return;
  installed = true;
  const proto = THREE.MeshStandardMaterial.prototype;
  proto.onBeforeCompile = function (this: THREE.Material, shader: THREE.WebGLProgramParametersWithUniforms) {
    shader.uniforms.toonOn = toonUniforms.toonOn;
    shader.uniforms.toonRim = toonUniforms.toonRim;
    shader.uniforms.toonRimColor = toonUniforms.toonRimColor;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <lights_physical_pars_fragment>", `${toonFunctions}\n${physicalLights}`)
      .replace("#include <lights_fragment_begin>", lightsBegin)
      .replace("#include <opaque_fragment>", rim);
    if (this.userData.toonRim) shader.fragmentShader = `#define TOON_RIM\n${shader.fragmentShader}`;
  };
  proto.customProgramCacheKey = function (this: THREE.Material) {
    return `${this.onBeforeCompile.toString()}${this.userData.toonRim ? "|rim" : ""}`;
  };
}

// Gives a character's materials the rim light.
export function markCharacter(root: THREE.Object3D) {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.userData.toonRim = true;
  });
}

const inkShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    texel: { value: new THREE.Vector2(1, 1) },
    near: { value: 0.1 },
    far: { value: 1000 },
    ink: { value: 1 },
    impact: { value: 0 },
    inkColor: { value: new THREE.Color(0.012, 0.01, 0.018) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tDepth;
    uniform vec2 texel;
    uniform float near, far, ink, impact;
    uniform vec3 inkColor;
    varying vec2 vUv;
    float viewZ(float z) { return near * far / (far - z * (far - near)); }
    float tone(vec3 c) { return log2(1.0 + 6.0 * dot(c, vec3(0.2126, 0.7152, 0.0722))); }
    void main() {
      vec4 source = texture2D(tDiffuse, vUv);
      float zc = texture2D(tDepth, vUv).x;
      if (zc >= 0.99999) { gl_FragColor = vec4(mix(source.rgb, vec3(0.012, 0.01, 0.018), impact), source.a); return; }
      vec2 dx = vec2(texel.x, 0.0), dy = vec2(0.0, texel.y);
      float zl = texture2D(tDepth, vUv - dx).x, zr = texture2D(tDepth, vUv + dx).x;
      float zd = texture2D(tDepth, vUv - dy).x, zu = texture2D(tDepth, vUv + dy).x;
      float c = viewZ(zc);
      float l = viewZ(zl), r = viewZ(zr), d = viewZ(zd), u = viewZ(zu);
      // Silhouettes: a neighbour well behind this pixel. The line goes on the near side.
      float behind = max(max(l, r), max(d, u)) - c;
      float silhouette = smoothstep(0.04, 0.1, behind / c);
      // Creases: 1/z is flat across a plane, so its second difference finds corners.
      float ic = 1.0 / c;
      float bend = max(abs(1.0 / l + 1.0 / r - 2.0 * ic), abs(1.0 / d + 1.0 / u - 2.0 * ic)) / ic;
      float crease = smoothstep(0.012, 0.03, bend);
      // Where flat fills meet.
      float t = tone(source.rgb);
      float tl = tone(texture2D(tDiffuse, vUv - dx).rgb), tr = tone(texture2D(tDiffuse, vUv + dx).rgb);
      float td = tone(texture2D(tDiffuse, vUv - dy).rgb), tu = tone(texture2D(tDiffuse, vUv + dy).rgb);
      float fill = smoothstep(0.35, 0.7, max(abs(tl - tr), abs(td - tu)) + 0.5 * max(abs(tl + tr - 2.0 * t), abs(td + tu - 2.0 * t)));
      float line = max(silhouette, max(crease * 0.85, fill * 0.55));
      float fade = 1.0 - smoothstep(25.0, 60.0, c);
      vec3 inked = mix(source.rgb, inkColor, clamp(line * ink * fade, 0.0, 1.0));
      // An impact frame: the panel inverted to ink and paper, lines in white.
      vec3 inverted = mix(t > 0.75 ? inkColor : vec3(0.96, 0.95, 0.92), vec3(0.96, 0.95, 0.92), clamp(line * 1.5, 0.0, 1.0));
      gl_FragColor = vec4(mix(inked, inverted, impact), source.a);
    }`,
};

// Reads the colour and depth the scene was rendered into (the composer's
// targets carry depth textures; see attachDepth), so it must run before any
// pass that swaps buffers.
export class InkPass extends Pass {
  private readonly material = new THREE.ShaderMaterial({ ...inkShader, uniforms: THREE.UniformsUtils.clone(inkShader.uniforms), depthTest: false, depthWrite: false });
  private readonly quad = new FullScreenQuad(this.material);
  camera: THREE.Camera;
  // Line width in pixels (scaled by the device pixel ratio by the caller).
  width = 1;

  constructor(camera: THREE.Camera) {
    super();
    this.camera = camera;
    this.enabled = false;
  }

  set ink(value: number) {
    this.material.uniforms.ink!.value = value;
  }

  // 1 during an impact frame (ComicFx.impact).
  set impact(value: number) {
    this.material.uniforms.impact!.value = value;
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const u = this.material.uniforms;
    u.tDiffuse!.value = readBuffer.texture;
    u.tDepth!.value = readBuffer.depthTexture;
    (u.texel!.value as THREE.Vector2).set(this.width / readBuffer.width, this.width / readBuffer.height);
    const camera = this.camera as THREE.PerspectiveCamera;
    u.near!.value = camera.near ?? 0.1;
    u.far!.value = camera.far ?? 1000;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}

// Gives the composer's two targets their own depth textures (one texture
// can't be attached to both: a pass reading one writes the other).
export function attachDepth(targets: THREE.WebGLRenderTarget[]) {
  for (const target of targets) if (!target.depthTexture) target.depthTexture = new THREE.DepthTexture(target.width, target.height);
}
