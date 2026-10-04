// Swaying plants (0.75.0): scattered flora bends in a travelling wind wave;
// near a Pale Signal structure it falls into step with the structure's
// breathing rings instead -- every blade on the same narrow-band clock.
import * as THREE from "three";

export const MAX_SPOTS = 8;

export interface SwayUniforms {
  uSwayTime: { value: number };
  uPulse: { value: number };
  uWind: { value: number };
  uSpots: { value: THREE.Vector4[] };
}

export function swayUniforms(): SwayUniforms {
  return {
    uSwayTime: { value: 0 },
    uPulse: { value: 0 },
    uWind: { value: 0 },
    uSpots: { value: Array.from({ length: MAX_SPOTS }, () => new THREE.Vector4(1e9, 0, 1e9, 70)) },
  };
}

// A copy of `material` whose vertices sway (instanced meshes only).
export function swayMaterial(material: THREE.Material, uniforms: SwayUniforms): THREE.Material {
  const copy = material.clone();
  copy.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uSwayTime; uniform float uPulse; uniform float uWind; uniform vec4 uSpots[${MAX_SPOTS}];`,
      )
      .replace(
        "#include <project_vertex>",
        `vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float sync = 0.0;
          for (int i = 0; i < ${MAX_SPOTS}; i++) {
            float d = distance(root.xz, uSpots[i].xz);
            sync = max(sync, 1.0 - smoothstep(uSpots[i].w * 0.4, uSpots[i].w, d));
          }
          float natural = uSwayTime * 1.7 + dot(root.xz, vec2(0.11, 0.07));
          float phase = mix(natural, uPulse * 1.4, sync);
          float bend = max(mvPosition.y - root.y, 0.0);
          float amount = (0.035 + 0.02 * uWind + 0.03 * sync) * bend;
          mvPosition.x += sin(phase) * amount;
          mvPosition.z += cos(phase * 0.8) * amount * 0.5;
        #endif
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  copy.customProgramCacheKey = () => `sway-${material.uuid}`;
  return copy;
}
