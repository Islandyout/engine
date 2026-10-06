// Post-processing settings (0.65.0): what the PostProcessing component
// controls, its defaults (which reproduce the editor's original look), and
// the color-grading shader applied after tone mapping.
import type { PostProcessingComponent } from "../scene/Components";

export type PostSettings = PostProcessingComponent;

// No PostProcessing component: the original fixed bloom, nothing else.
export const defaultPostSettings: PostSettings = {
  style: "Standard",
  ink: 1,
  rim: 0.6,
  antialias: "None",
  ambientOcclusion: false,
  aoRadius: 0.5,
  aoIntensity: 1,
  bloom: 0.35,
  bloomRadius: 0.5,
  bloomThreshold: 0.85,
  exposure: 1,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  vignette: 0,
  grain: 0,
  shadowQuality: "Medium",
};

// Shadow map size and half-extent of the sun's shadow box, per quality.
export const shadowQualities = {
  Low: { mapSize: 1024, extent: 25 },
  Medium: { mapSize: 2048, extent: 30 },
  High: { mapSize: 4096, extent: 45 },
} as const;

// True when the grading pass would change anything.
export function gradingActive(settings: PostSettings): boolean {
  return (
    settings.contrast !== 0 ||
    settings.saturation !== 0 ||
    settings.temperature !== 0 ||
    settings.vignette !== 0 ||
    settings.grain !== 0
  );
}

// Contrast, saturation and temperature in display space, then vignette and
// animated film grain.
export const gradingShader = {
  uniforms: {
    tDiffuse: { value: null },
    contrast: { value: 0 },
    saturation: { value: 0 },
    temperature: { value: 0 },
    vignette: { value: 0 },
    grain: { value: 0 },
    time: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float contrast, saturation, temperature, vignette, grain, time;
    varying vec2 vUv;
    void main() {
      vec4 source = texture2D(tDiffuse, vUv);
      vec3 color = source.rgb;
      color += vec3(temperature * 0.06, temperature * 0.01, -temperature * 0.06);
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, 1.0 + saturation);
      color = (color - 0.5) * (1.0 + contrast) + 0.5;
      float edge = smoothstep(0.35, 0.85, length(vUv - 0.5) * 1.25);
      color *= 1.0 - vignette * edge;
      float noise = fract(sin(dot(vUv * (time + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
      color += (noise - 0.5) * grain * 0.1;
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), source.a);
    }`,
};
