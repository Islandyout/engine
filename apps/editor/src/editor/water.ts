// A water surface for a flat Material (Material.texture "builtin:water"): two scrolling ripple layers bend the normal, so the sun glints
// and the sky shows in moving facets, and the surface turns toward the sky colour at a low angle (Fresnel). No texture: the
// ripples are sums of sines in world space, so a lake of any size is seamless.
import * as THREE from "three";

export const waterTime = { value: 0 };

export function makeWater(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaterTime = waterTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vWaterPos;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vWaterPos;
uniform float uWaterTime;
// The slope of the ripples at a point: a few waves going different ways, a fine layer on top.
vec2 waterSlope(vec2 p, float t) {
  vec2 s = vec2(0.0);
  s += vec2(0.8, 0.4) * cos(dot(p, vec2(0.8, 0.4)) * 1.1 + t * 1.3);
  s += vec2(-0.5, 0.9) * cos(dot(p, vec2(-0.5, 0.9)) * 1.7 - t * 1.7) * 0.7;
  s += vec2(0.3, -1.0) * cos(dot(p, vec2(0.3, -1.0)) * 2.9 + t * 2.3) * 0.45;
  s += vec2(1.0, 0.6) * cos(dot(p, vec2(1.0, 0.6)) * 5.3 - t * 3.1) * 0.25;
  return s;
}`,
      )
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
{
  vec2 slope = waterSlope(vWaterPos.xz, uWaterTime) * 0.045;
  vec3 worldNormal = normalize(vec3(-slope.x, 1.0, -slope.y));
  normal = normalize((viewMatrix * vec4(worldNormal, 0.0)).xyz);
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  // Toward the sky at a low angle, deeper colour looking down.
  vec3 toEye = normalize(cameraPosition - vWaterPos);
  float fresnel = pow(1.0 - clamp(toEye.y, 0.0, 1.0), 3.0);
  diffuseColor.rgb = mix(diffuseColor.rgb * 0.8, vec3(0.62, 0.78, 0.9), fresnel * 0.7);
  diffuseColor.a = mix(diffuseColor.a, 0.95, fresnel);
}`,
      );
  };
  material.customProgramCacheKey = () => "water";
  material.needsUpdate = true;
}
