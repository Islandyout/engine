import * as THREE from "three";
import type {
	EnvironmentComponent,
	Vec3
} from "../../scene/Components";
import { skyAt } from "../timeOfDay";
import type { Ctx } from "./context";

export function installEnvironment(C: Ctx): void {
  // Authored 0-1 colors (Environment, Material, sky) are sRGB, like any
  // color picker -- so defaultEnvironment()'s backdrop matches the
  // original "#101a26" exactly.
  function colorOf(v: Vec3) {
    return new THREE.Color().setRGB(v.x, v.y, v.z, THREE.SRGBColorSpace);
  }

  function gradientTexture(env: EnvironmentComponent) {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const fill = ctx.createLinearGradient(0, 0, 0, 256);
    const css = (v: Vec3) => `#${colorOf(v).getHexString()}`;
    fill.addColorStop(0, css(env.skyColor));
    fill.addColorStop(0.5, css(env.horizonColor));
    fill.addColorStop(1, css(env.groundColor));
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, 2, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function applyTimeOfDay(hours: number | undefined) {
    if (hours === undefined) {
      if (C.timeOfDay === undefined) return;
      C.timeOfDay = undefined;
      C.environmentKey = "";
      if (C.currentEnvironment) applyEnvironment(C.currentEnvironment);
      return;
    }
    C.timeOfDay = hours;
    skyAt(hours, C.skyState);
    C.sunDirection.copy(C.skyState.direction);
    C.sun.color.copy(C.skyState.sun);
    C.sun.intensity = C.skyState.sunIntensity;
    C.hemisphere.color.copy(C.skyState.sky);
    C.hemisphere.groundColor.copy(C.skyState.ground);
    C.hemisphere.intensity = C.skyState.ambient;
    C.skyBackground.copy(C.skyState.background);
    C.scene.background = C.skyBackground;
    if (C.skyMesh) C.skyMesh.visible = false;
    C.skyFog.color.copy(C.skyState.fog);
    C.skyFog.density = C.skyState.fogDensity;
    C.scene.fog = C.skyFog;
    applyExposure();
  }

  // Tone-mapping exposure: the Environment's (or the hour's), the
  // PostProcessing's and the player's brightness.
  function applyExposure() {
    if (!(C.renderer instanceof THREE.WebGLRenderer)) return;
    const base = C.timeOfDay !== undefined ? C.skyState.exposure : C.environmentExposure;
    C.renderer.toneMappingExposure = base * C.postSettings.exposure * C.playerSettings.brightness;
  }

  function applyEnvironment(env: EnvironmentComponent) {
    C.currentEnvironment = env;
    if (C.skyMesh) C.skyMesh.visible = true;
    const elevation = THREE.MathUtils.degToRad(env.sunElevation);
    const azimuth = THREE.MathUtils.degToRad(env.sunAzimuth);
    C.sunDirection.set(Math.cos(elevation) * Math.sin(azimuth), Math.sin(elevation), Math.cos(elevation) * Math.cos(azimuth));
    C.sun.color.copy(colorOf(env.sunColor));
    C.sun.intensity = env.sunIntensity;
    C.sun.castShadow = env.shadows;
    C.shadowGround.visible = env.shadows;
    C.hemisphere.intensity = env.ambientIntensity;
    if (C.lightOverride) {
      C.hemisphere.intensity = C.lightOverride.ambient;
      C.sun.intensity = C.lightOverride.sun;
    }
    C.environmentExposure = env.exposure;
    applyExposure();
    C.scene.fog =
      env.fog === "Linear"
        ? new THREE.Fog(colorOf(env.fogColor), env.fogNear, env.fogFar)
        : env.fog === "Exponential"
          ? new THREE.FogExp2(colorOf(env.fogColor), env.fogDensity)
          : null;
    const key = JSON.stringify([env.sky, env.skyColor, env.horizonColor, env.groundColor, env.sunElevation, env.sunAzimuth]);
    if (key === C.environmentKey) return;
    C.environmentKey = key;
    if (C.skyMesh) {
      C.scene.remove(C.skyMesh);
      C.skyMesh.geometry.dispose();
      (C.skyMesh.material as THREE.Material).dispose();
      C.skyMesh = undefined;
    }
    C.environmentTexture?.dispose();
    C.environmentTexture = undefined;
    C.scene.environment = null;
    if (env.sky === "Color") {
      C.scene.background = colorOf(env.skyColor);
      C.hemisphere.color.set(0xd8eeff);
      C.hemisphere.groundColor.set(0x405036);
      return;
    }
    C.hemisphere.color.copy(colorOf(env.sky === "Gradient" ? env.horizonColor : env.skyColor));
    C.hemisphere.groundColor.copy(colorOf(env.groundColor));
    if (env.sky === "Gradient") {
      const texture = gradientTexture(env);
      C.scene.background = texture;
      if (C.pmrem) C.environmentTexture = C.pmrem.fromEquirectangular(texture).texture;
    } else {
      C.skyMesh = createSky(env);
      C.scene.background = null;
      if (C.pmrem) {
        const skyScene = new THREE.Scene();
        const probe = createSky(env);
        skyScene.add(probe);
        C.environmentTexture = C.pmrem.fromScene(skyScene).texture;
        probe.geometry.dispose();
        probe.material.dispose();
      }
      C.scene.add(C.skyMesh);
    }
    if (C.environmentTexture) C.scene.environment = C.environmentTexture;
    // The sky's radiance is far brighter than the scene's own lights were
    // tuned for; scaled down so image-based lighting adds fill, not glare.
    C.scene.environmentIntensity = 0.6;
  }

  // Procedural sky: a large inside-out sphere shaded from the Environment's
  // zenith/horizon/ground colors, with a sun disc and glow toward the sun.
  // Hand-written rather than three's Sky.js, whose raw HDR output washes the
  // scene out through bloom and rendered flat grey in headless WebGL.
  function createSky(env: EnvironmentComponent) {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        zenith: { value: colorOf(env.skyColor) },
        horizon: { value: colorOf(env.horizonColor) },
        ground: { value: colorOf(env.groundColor) },
        sunColor: { value: colorOf(env.sunColor) },
        sunDirection: { value: C.sunDirection.clone() },
      },
      vertexShader: `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = clip.xyww; // always at the far plane
        }`,
      fragmentShader: `
        uniform vec3 zenith, horizon, ground, sunColor, sunDirection;
        varying vec3 vDirection;
        void main() {
          vec3 d = normalize(vDirection);
          float h = d.y;
          vec3 color = h > 0.0 ? mix(horizon, zenith, pow(h, 0.45)) : mix(horizon, ground, pow(-h, 0.35));
          float s = max(dot(d, normalize(sunDirection)), 0.0);
          color += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.18);
          gl_FragColor = vec4(color, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), material);
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    return sky;
  }

  // Keeps the sun's shadow frustum centered on what the camera looks at.
  function updateSunShadow() {
    C.sun.target.position.copy(C.controls.target);
    C.sun.position.copy(C.controls.target).addScaledVector(C.sunDirection, 50);
  }
  Object.assign(C, { colorOf, applyTimeOfDay, applyExposure, applyEnvironment, updateSunShadow });
}
