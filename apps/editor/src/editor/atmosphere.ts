// Atmospheric scattering (0.75.0): single scattering of sunlight through a
// body's air -- Rayleigh (colour from the body's haze, stronger the bluer a
// channel is scattered) and Mie (grey, forward-peaked haze around the sun),
// each falling off with its own scale height, with the sunlight reddened by
// the air it crossed and cut off by the planet's shadow. One GLSL function
// draws the sky from inside the air and the glowing limb from space; a CPU
// copy gives the fog its colour, so distant terrain fades into the same sky.
import * as THREE from "three";

export interface AtmosphereParams {
  // Everything in planet radii, from the planet's centre.
  top: number;
  hR: number;
  hM: number;
  betaR: THREE.Vector3;
  betaM: number;
  sunPower: number;
  // How much faster sunlight reddens crossing the air than the sky scatters
  // (thin air needs more to colour a sunset; thick air less).
  ext: number;
}

export function atmosphereParams(body: { radius: number; atmosphereHeight: number; atmosphereDensity: number; haze: string }): AtmosphereParams {
  const radius = Math.max(body.radius, 1);
  const height = Math.max(body.atmosphereHeight, 1);
  const density = Math.max(body.atmosphereDensity, 0);
  const hR = (height * 0.42) / radius;
  const hM = hR * 0.22;
  const haze = new THREE.Color(body.haze);
  const peak = Math.max(haze.r, haze.g, haze.b, 1e-3);
  // Zenith optical depth: thin air is faint, dense air (Hollow) is a
  // murky overcast. The haze colour, sharpened, is what the air scatters.
  const tau = Math.min(1.6, 0.32 * Math.pow(density, 0.85));
  const spectrum = (c: number) => Math.pow(Math.max(c / peak, 0.02), 3);
  return {
    top: 1 + (height * 2.4) / radius,
    hR,
    hM,
    betaR: new THREE.Vector3(spectrum(haze.r), spectrum(haze.g), spectrum(haze.b)).multiplyScalar(tau / hR),
    betaM: (0.008 * Math.min(density, 3)) / hM,
    sunPower: 34,
    ext: THREE.MathUtils.clamp(4 / Math.pow(Math.max(density, 0.01), 0.7), 1.2, 6),
  };
}

export const scatterUniforms = () => ({
  uCam: { value: new THREE.Vector3(0, 2, 0) },
  uSun: { value: new THREE.Vector3(0, 1, 0) },
  uTop: { value: 1.1 },
  uHR: { value: 0.01 },
  uHM: { value: 0.002 },
  uBetaR: { value: new THREE.Vector3() },
  uBetaM: { value: 0 },
  uSunPower: { value: 34 },
  uExt: { value: 4 },
  uStrength: { value: 1 },
});

export function setScatterUniforms(uniforms: ReturnType<typeof scatterUniforms>, params: AtmosphereParams, camera: THREE.Vector3, sun: THREE.Vector3) {
  uniforms.uCam.value.copy(camera);
  uniforms.uSun.value.copy(sun);
  uniforms.uTop.value = params.top;
  uniforms.uHR.value = params.hR;
  uniforms.uHM.value = params.hM;
  uniforms.uBetaR.value.copy(params.betaR);
  uniforms.uBetaM.value = params.betaM;
  uniforms.uSunPower.value = params.sunPower;
  uniforms.uExt.value = params.ext;
}

export const scatterGLSL = /* glsl */ `
  uniform vec3 uCam; uniform vec3 uSun; uniform float uTop; uniform float uHR; uniform float uHM;
  uniform vec3 uBetaR; uniform float uBetaM; uniform float uSunPower; uniform float uExt;
  vec2 raySphere(vec3 o, vec3 d, float r) {
    float b = dot(o, d);
    float c = dot(o, o) - r * r;
    float h = b * b - c;
    if (h < 0.0) return vec2(1e9, -1e9);
    h = sqrt(h);
    return vec2(-b - h, -b + h);
  }
  // Light scattered toward the eye along the ray o + t d (planet radii),
  // and how much of what's behind it gets through.
  vec3 scatter(vec3 o, vec3 d, out vec3 transmit) {
    transmit = vec3(1.0);
    vec2 a = raySphere(o, d, uTop);
    if (a.x > a.y || a.y < 0.0) return vec3(0.0);
    float t0 = max(a.x, 0.0), t1 = a.y;
    vec2 p = raySphere(o, d, 1.0);
    if (p.x < p.y && p.x > 0.0) t1 = min(t1, p.x);
    if (t1 <= t0) return vec3(0.0);
    // The frame governor's low sky tier halves the samples (SKY_LOW).
    #ifdef SKY_LOW
    const int N = 6;
    const int M = 2;
    #else
    const int N = 12;
    const int M = 4;
    #endif
    // Sunlight crossing the air reddens faster than the sky scatters: the
    // planets' air is thick for their size, so a physical airmass alone
    // can't turn a sunset orange.
    float EXT = uExt;
    float ds = (t1 - t0) / float(N);
    float mu = dot(d, uSun);
    float g = 0.76;
    float phaseR = 0.0596831 * (1.0 + mu * mu);
    float phaseM = 0.1193662 * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(max(1.0 + g * g - 2.0 * g * mu, 1e-4), 1.5));
    vec3 sumR = vec3(0.0), sumM = vec3(0.0);
    float odR = 0.0, odM = 0.0;
    for (int i = 0; i < N; i++) {
      vec3 pos = o + d * (t0 + ds * (float(i) + 0.5));
      float h = max(length(pos) - 1.0, 0.0);
      float hr = exp(-h / uHR) * ds, hm = exp(-h / uHM) * ds;
      odR += hr;
      odM += hm;
      // In the planet's shadow (soft at the terminator)?
      float up = dot(normalize(pos), uSun);
      float lit = smoothstep(-0.06, 0.04, up + sqrt(max(1.0 - 1.0 / dot(pos, pos), 0.0)));
      if (lit <= 0.0) continue;
      vec2 l = raySphere(pos, uSun, uTop);
      float ls = max(l.y, 0.0) / float(M);
      float lodR = 0.0, lodM = 0.0;
      for (int j = 0; j < M; j++) {
        vec3 lpos = pos + uSun * ls * (float(j) + 0.5);
        float lh = max(length(lpos) - 1.0, 0.0);
        lodR += exp(-lh / uHR) * ls;
        lodM += exp(-lh / uHM) * ls;
      }
      vec3 att = exp(-(uBetaR * (odR + EXT * lodR) + uBetaM * 1.1 * (odM + lodM))) * lit;
      sumR += att * hr;
      sumM += att * hm;
    }
    transmit = exp(-(uBetaR * odR + uBetaM * 1.1 * odM));
    return uSunPower * (sumR * uBetaR * phaseR + sumM * uBetaM * phaseM);
  }
`;

// The sky from inside the air: drawn first, behind everything, at the
// camera.
// Switches a scattering material between full and half sampling.
export function setScatterLow(material: THREE.ShaderMaterial, low: boolean) {
  if (!!material.defines?.SKY_LOW === low) return;
  material.defines = { ...material.defines };
  if (low) material.defines.SKY_LOW = 1;
  else delete material.defines.SKY_LOW;
  material.needsUpdate = true;
}

export function scatterSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...scatterUniforms(), uSunDisc: { value: 1 }, uGround: { value: new THREE.Color(0.1, 0.1, 0.1) } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      ${scatterGLSL}
      uniform float uStrength; uniform float uSunDisc; uniform vec3 uGround;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 transmit;
        vec3 col = scatter(uCam, d, transmit);
        vec2 hit = raySphere(uCam, d, 1.0);
        bool ground = hit.x < hit.y && hit.x > 0.0;
        if (ground) {
          // Below the horizon: the ground's own colour under the air.
          float lit = clamp(dot(normalize(uCam), uSun) * 1.5 + 0.15, 0.03, 1.0);
          col += transmit * uGround * lit;
        } else {
          // The sun's disc and its glow, reddened by the air in front of it.
          float s = max(dot(d, uSun), 0.0);
          col += transmit * vec3(1.0, 0.92, 0.8) * (pow(s, 900.0) * 6.0 + pow(s, 48.0) * 0.12) * uSunDisc;
        }
        col = (1.0 - exp(-col * 1.15)) * uStrength;
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    // Opaque and first (the stars, transparent, fade in over it at night).
    transparent: false,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
}

// The air seen from outside: a shell around the planet, added over it.
export function scatterShellMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { ...scatterUniforms(), uCentre: { value: new THREE.Vector3() }, uRadius: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: /* glsl */ `
      ${scatterGLSL}
      uniform float uStrength; uniform vec3 uCentre; uniform float uRadius;
      varying vec3 vWorld;
      void main() {
        vec3 d = normalize(vWorld - cameraPosition);
        vec3 transmit;
        vec3 col = scatter(uCam, d, transmit);
        col = 1.0 - exp(-col * 1.15);
        gl_FragColor = vec4(col * uStrength, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
}

// The same model on the CPU (fewer samples), for the fog and light colours.
export function scatterColor(params: AtmosphereParams, o: THREE.Vector3, d: THREE.Vector3, sun: THREE.Vector3, out = new THREE.Color()) {
  const raySphere = (p: THREE.Vector3, dir: THREE.Vector3, r: number): [number, number] => {
    const b = p.dot(dir),
      c = p.lengthSq() - r * r,
      h = b * b - c;
    if (h < 0) return [1e9, -1e9];
    const s = Math.sqrt(h);
    return [-b - s, -b + s];
  };
  out.setRGB(0, 0, 0);
  const a = raySphere(o, d, params.top);
  if (a[0] > a[1] || a[1] < 0) return out;
  const t0 = Math.max(a[0], 0);
  let t1 = a[1];
  const p = raySphere(o, d, 1);
  if (p[0] < p[1] && p[0] > 0) t1 = Math.min(t1, p[0]);
  if (t1 <= t0) return out;
  const N = 8,
    M = 3,
    ds = (t1 - t0) / N,
    mu = d.dot(sun),
    g = 0.76;
  const phaseR = 0.0596831 * (1 + mu * mu);
  const phaseM = (0.1193662 * ((1 - g * g) * (1 + mu * mu))) / ((2 + g * g) * Math.pow(Math.max(1 + g * g - 2 * g * mu, 1e-4), 1.5));
  const b = params.betaR;
  let odR = 0,
    odM = 0;
  const sum = [0, 0, 0],
    sumM = [0, 0, 0];
  const pos = new THREE.Vector3(),
    lpos = new THREE.Vector3();
  for (let i = 0; i < N; i++) {
    pos.copy(o).addScaledVector(d, t0 + ds * (i + 0.5));
    const h = Math.max(pos.length() - 1, 0);
    const hr = Math.exp(-h / params.hR) * ds,
      hm = Math.exp(-h / params.hM) * ds;
    odR += hr;
    odM += hm;
    const up = pos.clone().normalize().dot(sun);
    const x = up + Math.sqrt(Math.max(1 - 1 / pos.lengthSq(), 0));
    const lit = THREE.MathUtils.smoothstep(x, -0.06, 0.04);
    if (lit <= 0) continue;
    const l = raySphere(pos, sun, params.top);
    const ls = Math.max(l[1], 0) / M;
    let lodR = 0,
      lodM = 0;
    for (let j = 0; j < M; j++) {
      lpos.copy(pos).addScaledVector(sun, ls * (j + 0.5));
      const lh = Math.max(lpos.length() - 1, 0);
      lodR += Math.exp(-lh / params.hR) * ls;
      lodM += Math.exp(-lh / params.hM) * ls;
    }
    const m = params.betaM * 1.1 * (odM + lodM);
    const EXT = params.ext;
    const att = [Math.exp(-(b.x * (odR + EXT * lodR) + m)), Math.exp(-(b.y * (odR + EXT * lodR) + m)), Math.exp(-(b.z * (odR + EXT * lodR) + m))].map(
      (v) => v * lit,
    );
    for (let k = 0; k < 3; k++) {
      sum[k]! += att[k]! * hr;
      sumM[k]! += att[k]! * hm;
    }
  }
  const tone = (v: number) => 1 - Math.exp(-v * 1.15);
  out.setRGB(
    tone(params.sunPower * (sum[0]! * b.x * phaseR + sumM[0]! * params.betaM * phaseM)),
    tone(params.sunPower * (sum[1]! * b.y * phaseR + sumM[1]! * params.betaM * phaseM)),
    tone(params.sunPower * (sum[2]! * b.z * phaseR + sumM[2]! * params.betaM * phaseM)),
  );
  return out;
}
