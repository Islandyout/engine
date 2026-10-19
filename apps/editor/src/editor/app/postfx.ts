import * as THREE from "three";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { toonUniforms } from "../manhwa";
import { type EmitterState } from "../particles";
import { gradingActive, shadowQualities, type PostSettings } from "../postFx";
import type { Ctx } from "./context";

export function installPostfx(C: Ctx): void {
  function makeEffectPoints(emitter: EmitterState) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(emitter.positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(emitter.colors, 3));
    geometry.setAttribute("size", new THREE.BufferAttribute(emitter.sizes, 1));
    const points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: { scale: C.particleScale },
        vertexShader: C.particleVertexShader,
        fragmentShader: C.particleFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    points.frustumCulled = false;
    return points;
  }

  // Ink lines: the scene's strength times the player's.
  function applyInk() {
    const ink = C.postSettings.ink * C.playerSettings.ink;
    C.inkPass.enabled = !!C.composer && C.postSettings.style === "Manhwa" && ink > 0;
    C.inkPass.ink = ink;
  }

  function applyPostProcessing(settings: PostSettings) {
    C.postSettings = settings;
    if (C.bloomPass) {
      C.bloomPass.strength = settings.bloom;
      C.bloomPass.radius = settings.bloomRadius;
      C.bloomPass.threshold = settings.bloomThreshold;
    }
    C.applyExposure();
    const manhwa = settings.style === "Manhwa";
    toonUniforms.toonOn.value = manhwa ? 1 : 0;
    toonUniforms.toonRim.value = manhwa ? settings.rim : 0;
    applyInk();
    C.combat.comic.enabled = manhwa;
    C.gradingPass.enabled = !!C.composer && gradingActive(settings);
    const uniforms = C.gradingPass.uniforms as Record<string, { value: number }>;
    uniforms.contrast!.value = settings.contrast;
    uniforms.saturation!.value = settings.saturation;
    uniforms.temperature!.value = settings.temperature;
    uniforms.vignette!.value = settings.vignette;
    uniforms.grain!.value = settings.grain;
    C.fxaaPass.enabled = !!C.composer && settings.antialias === "FXAA";
    C.smaaPass.enabled = !!C.composer && settings.antialias === "SMAA";
    // Flat fills don't want ambient occlusion, and the ink pass must read the
    // scene's own target (GTAO swaps it).
    const ambientOcclusion = settings.ambientOcclusion && !manhwa;
    if (C.composer && ambientOcclusion && !C.gtaoPass) {
      // Created on first use: it allocates its own normal and AO targets.
      C.gtaoPass = new GTAOPass(C.scene, C.camera, C.viewport.clientWidth || 1, C.viewport.clientHeight || 1);
      C.composer.insertPass(C.gtaoPass, 1);
    }
    if (C.gtaoPass) {
      C.gtaoPass.enabled = ambientOcclusion;
      C.gtaoPass.blendIntensity = settings.aoIntensity;
      C.gtaoPass.updateGtaoMaterial({ radius: settings.aoRadius });
    }
    const quality = shadowQualities[settings.shadowQuality];
    // The frame governor halves the map under load.
    const mapSize = quality.mapSize / (C.governorTier().shadows === 1 ? 2 : 1);
    if (C.sun.shadow.mapSize.x !== mapSize) {
      C.sun.shadow.mapSize.set(mapSize, mapSize);
      C.sun.shadow.map?.dispose();
      C.sun.shadow.map = null;
    }
    C.sun.shadow.camera.left = C.sun.shadow.camera.bottom = -quality.extent;
    C.sun.shadow.camera.right = C.sun.shadow.camera.top = quality.extent;
    C.sun.shadow.camera.updateProjectionMatrix();
    resizeAntialias();
  }

  function resizeAntialias() {
    const ratio = C.renderer instanceof THREE.WebGLRenderer ? C.renderer.getPixelRatio() : 1;
    const w = Math.max(1, C.viewport.clientWidth),
      h = Math.max(1, C.viewport.clientHeight);
    (C.fxaaPass.material.uniforms.resolution!.value as THREE.Vector2).set(1 / (w * ratio), 1 / (h * ratio));
    // About 2 px at 720p, scaling with the view so lines keep their weight.
    C.inkPass.width = ratio * Math.max(1.5, h / 360);
  }
  Object.assign(C, { makeEffectPoints, applyInk, applyPostProcessing, resizeAntialias });
}
