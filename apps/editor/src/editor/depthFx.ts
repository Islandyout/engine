// Light shafts and contact shadows, from the depth the scene left behind (the planets' own sky is atmosphere.ts).
//  - Contact shadows: each lit pixel marches a short way (about half a metre) toward the sun in view space; if the depth buffer says
//    something stands in the way, the pixel darkens. It grounds feet, props and the creases the shadow map is too coarse to see.
//  - Light shafts: when the sun is in front of the camera, each pixel walks toward the sun on screen, adding up the open sky it
//    passes. Gaps in trees, eaves and gates show as rays.
// Both read the composer's depth texture, so the pass runs right after the scene (before any pass that swaps buffers).
import * as THREE from "three";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";

const shader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uProj: { value: new THREE.Matrix4() },
    uInvProj: { value: new THREE.Matrix4() },
    uLightView: { value: new THREE.Vector3(0, 1, 0) },
    uSunUv: { value: new THREE.Vector2(0.5, 0.5) },
    uSunOn: { value: 0 },
    uSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
    uShafts: { value: 0 },
    uContact: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tDepth;
    uniform mat4 uProj, uInvProj;
    uniform vec3 uLightView, uSunColor;
    uniform vec2 uSunUv;
    uniform float uSunOn, uShafts, uContact;
    varying vec2 vUv;
    vec3 viewPos(vec2 uv, float d) {
      vec4 v = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      return v.xyz / v.w;
    }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 source = texture2D(tDiffuse, vUv);
      vec3 color = source.rgb;
      float depth = texture2D(tDepth, vUv).x;
      if (uContact > 0.0 && depth < 0.99999) {
        vec3 p = viewPos(vUv, depth);
        float jitter = hash(gl_FragCoord.xy);
        float shade = 0.0;
        for (int i = 1; i <= 10; i++) {
          vec3 q = p + uLightView * (float(i) * 0.05 + jitter * 0.03);
          vec4 c = uProj * vec4(q, 1.0);
          vec2 uv = c.xy / c.w * 0.5 + 0.5;
          if (c.w <= 0.0 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
          float surface = viewPos(uv, texture2D(tDepth, uv).x).z;
          float behind = surface - q.z;
          // The ray point is hidden by a surface just in front of it (not a far-off wall).
          if (behind > 0.03 && behind < 0.35) { shade = 1.0 - float(i) / 14.0; break; }
        }
        color *= 1.0 - 0.55 * shade * uContact;
      }
      if (uShafts > 0.0 && uSunOn > 0.0) {
        vec2 toSun = uSunUv - vUv;
        vec2 stepUv = toSun / 18.0 * 0.85;
        vec2 uv = vUv + stepUv * hash(gl_FragCoord.xy + 3.0);
        float open = 0.0, weight = 1.0;
        for (int i = 0; i < 18; i++) {
          uv += stepUv;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
          open += step(0.99999, texture2D(tDepth, uv).x) * weight;
          weight *= 0.93;
        }
        float nearSun = 1.0 - smoothstep(0.0, 1.2, length(toSun));
        color += uSunColor * (open / 18.0) * (0.35 + 0.65 * nearSun) * uShafts * uSunOn * 0.9;
      }
      gl_FragColor = vec4(color, source.a);
    }`,
};

export class DepthFxPass extends Pass {
  private readonly material = new THREE.ShaderMaterial({ ...shader, uniforms: THREE.UniformsUtils.clone(shader.uniforms), depthTest: false, depthWrite: false });
  private readonly quad = new FullScreenQuad(this.material);
  private readonly scratch = { dir: new THREE.Vector3(), point: new THREE.Vector3() };

  constructor(
    private camera: THREE.Camera,
    private readonly sun: THREE.DirectionalLight,
  ) {
    super();
    this.enabled = false;
  }

  setCamera(camera: THREE.Camera) {
    this.camera = camera;
  }

  set shafts(value: number) {
    this.material.uniforms.uShafts!.value = value;
  }

  set contact(value: number) {
    this.material.uniforms.uContact!.value = value;
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const u = this.material.uniforms;
    const camera = this.camera as THREE.PerspectiveCamera;
    camera.updateMatrixWorld();
    u.tDiffuse!.value = readBuffer.texture;
    u.tDepth!.value = readBuffer.depthTexture;
    (u.uProj!.value as THREE.Matrix4).copy(camera.projectionMatrix);
    (u.uInvProj!.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    // The direction toward the sun, in the camera's view space; and where that direction lands on the screen.
    const { dir, point } = this.scratch;
    dir.copy(this.sun.position).sub(this.sun.target.position).normalize();
    (u.uLightView!.value as THREE.Vector3).copy(dir).transformDirection(camera.matrixWorldInverse);
    point.copy(camera.position).addScaledVector(dir, 500).project(camera);
    const toward = dir.dot(camera.getWorldDirection(new THREE.Vector3()));
    (u.uSunUv!.value as THREE.Vector2).set(point.x * 0.5 + 0.5, point.y * 0.5 + 0.5);
    u.uSunOn!.value = THREE.MathUtils.smoothstep(toward, 0.05, 0.5);
    (u.uSunColor!.value as THREE.Color).copy(this.sun.color).multiplyScalar(0.8);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}
