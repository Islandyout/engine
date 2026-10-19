import * as THREE from "three";
import type {
	ParticlesComponent,
	TrailComponent
} from "../../scene/Components";
import { createEmitter, stepEmitter, type EmitterSettings } from "../particles";
import { buildRibbon, updateTrail } from "../trail";
import type { Ctx } from "./context";
import { AnimState, DeathState, PARTICLE_PRESETS, ParticleState, TrailState } from "./context";

export function installEffects(C: Ctx): void {
  function createParticles(particles: ParticlesComponent, anchor: THREE.Object3D): ParticleState {
    const preset = PARTICLE_PRESETS[particles.preset];
    const settings: EmitterSettings = {
      rate: particles.rate,
      lifetime: particles.lifetime,
      speed: particles.speed,
      size: particles.size,
      endSize: particles.endSize,
      color: [particles.color.x, particles.color.y, particles.color.z],
      endColor: [particles.endColor.x, particles.endColor.y, particles.endColor.z],
      direction: [preset.direction.x, preset.direction.y, preset.direction.z],
      spread: preset.spread,
      // The presets store an upward pull as positive; the simulation's
      // gravity pulls down.
      gravity: -preset.gravity * particles.gravityScale,
      shape: particles.shape,
      shapeSize: particles.shapeSize,
      coneAngle: particles.coneAngle,
    };
    const emitter = createEmitter(settings, particles.burst);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(emitter.positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(emitter.colors, 3));
    geo.setAttribute("size", new THREE.BufferAttribute(emitter.sizes, 1));
    const shader = new THREE.ShaderMaterial({
      uniforms: { scale: C.particleScale },
      vertexShader: C.particleVertexShader,
      fragmentShader: C.particleFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geo, shader);
    // Particles move away from wherever the bounding sphere was first
    // computed; culling would hide a system that is still on screen.
    points.frustumCulled = false;
    const world = particles.space === "World";
    if (world) C.scene.add(points);
    else anchor.add(points);
    return { emitter, points, anchor, world, burstOnPlay: particles.burst };
  }

  function stepParticles(state: ParticleState, dt: number) {
    if (state.world) {
      state.anchor.getWorldPosition(C.particleOrigin);
      state.emitter.origin = [C.particleOrigin.x, C.particleOrigin.y, C.particleOrigin.z];
    }
    stepEmitter(state.emitter, dt);
    const attributes = state.points.geometry.attributes;
    attributes.position!.needsUpdate = true;
    attributes.color!.needsUpdate = true;
    attributes.size!.needsUpdate = true;
  }

  function createTrail(component: TrailComponent, anchor: THREE.Object3D): TrailState {
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.ShaderMaterial({
      uniforms: { color: { value: C.colorOf(component.color) } },
      vertexShader: `
        attribute float fade;
        varying float vFade;
        void main() { vFade = fade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 color;
        varying float vFade;
        void main() { gl_FragColor = vec4(color * vFade, 1.0); }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    C.scene.add(mesh);
    return { component, anchor, points: [], mesh };
  }

  function stepTrails(dt: number) {
    for (const trail of C.trailStates) {
      if (C.doc.mode === "edit") trail.points.length = 0;
      else if (C.doc.mode === "play") {
        trail.anchor.getWorldPosition(C.trailScratch);
        updateTrail(trail.points, C.trailScratch, dt, trail.component.lifetime, trail.component.minDistance);
      }
      const ribbon = buildRibbon(trail.points, C.viewCamera.position, trail.component.width, trail.component.lifetime);
      const geometry = trail.mesh.geometry;
      geometry.setAttribute("position", new THREE.BufferAttribute(ribbon.positions, 3));
      geometry.setAttribute("fade", new THREE.BufferAttribute(ribbon.fades, 1));
      geometry.setIndex(new THREE.BufferAttribute(ribbon.indices, 1));
    }
  }
 // seconds; how long a defeated entity lingers, fading out
  // Called once, the first frame editor_alive(i) reads false for an entity
  // that was previously alive -- starts its death sequence (a clip, if its
  // model has one, plus a fade-out) instead of the object just vanishing
  // the instant combat/AI damage brings its Health to 0.
  function startDeath(anchor: THREE.Object3D, animState: AnimState | undefined): DeathState {
    // "death"/"die" are the two conventional clip names this project's own
    // kits already use elsewhere (see animationClips.ts's pickClipName for
    // the same "look for a conventional name, fall back gracefully if this
    // particular rig doesn't have one" approach) -- not every model has a
    // death clip, so this is a bonus when present, not a requirement.
    // Matched case-insensitively (several bundled models -- Alpaca, Stag,
    // Husky, Wolf -- expose theirs as "Death" with a capital D, while
    // loadCatalogModel() keeps each clip.name exactly as authored), but
    // looked up in `actions` by its own original-case key, which is the
    // only key that's actually in that Map.
    if (animState) {
      const deathClip = [...animState.actions.keys()].find((name) => ["death", "die"].includes(name.toLowerCase()));
      if (deathClip) {
        const action = animState.actions.get(deathClip)!;
        const previous = animState.current ? animState.actions.get(animState.current) : undefined;
        action.reset().setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.fadeIn(0.15).play();
        if (previous && previous !== action) previous.fadeOut(0.15);
        animState.current = deathClip;
      }
    }
    // Every material this object's mesh hierarchy uses is shared with every
    // other placed instance of the same model (rebuild()'s own comment on
    // why cloning is skipped there for exactly this reason -- nothing to
    // dispose per rebuild otherwise) -- fading one in place would
    // incorrectly fade every other entity using that model too, so each one
    // is cloned here, lazily, only for the one object that's actually
    // dying, and disposed once its fade finishes (or on the next rebuild(),
    // whichever comes first).
    const materials: { material: THREE.Material; baseOpacity: number }[] = [];
    const cloned = new Map<THREE.Material, THREE.Material>();
    anchor.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const clone = (material: THREE.Material): THREE.Material => {
        let result = cloned.get(material);
        if (!result) {
          result = material.clone();
          // clone() already copied the source's own opacity (e.g. 0.45 for
          // vehicle glass) -- captured here, before transparent/opacity get
          // driven by the fade below, since that's the value the fade must
          // multiply down from, not overwrite.
          const baseOpacity = result.opacity;
          result.transparent = true;
          cloned.set(material, result);
          materials.push({ material: result, baseOpacity });
        }
        return result;
      };
      child.material = Array.isArray(child.material) ? child.material.map(clone) : clone(child.material);
    });
    return { elapsed: 0, materials };
  }
  Object.assign(C, { createParticles, stepParticles, createTrail, stepTrails, startDeath });
}
