// A budget for point lights (GATEBREAKER M2). three.js shades every pixel
// with every light, so a scene with dozens of torches costs dozens of light
// evaluations per pixel. Past the budget, the authored point lights stop
// rendering themselves and a fixed pool of lights stands in for the ones
// nearest the camera, so the shader's light count (and its compile) never
// changes as you walk. A light's reach ends at its range, so a far torch
// swapped out of the pool lit nothing near you anyway. Shadow-casting
// lights are left alone.
import * as THREE from "three";

export class LightPool {
  private sources: THREE.PointLight[] = [];
  private pool: THREE.PointLight[] = [];
  private active = false;
  private readonly scratch = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    readonly budget = 8,
  ) {}

  // A point light that may be pooled; others are ignored.
  register(light: THREE.Light) {
    if (light instanceof THREE.PointLight && !light.castShadow) this.sources.push(light);
  }

  // Before a rebuild: forget the old lights.
  reset() {
    this.sources = [];
    this.active = false;
    for (const light of this.pool) light.intensity = 0;
  }

  get pooling(): boolean {
    return this.active;
  }

  // Every frame: the budget's worth of lights nearest `eye` light the scene.
  update(eye: THREE.Vector3) {
    if (this.sources.length <= this.budget) return;
    if (!this.active) {
      this.active = true;
      for (const source of this.sources) source.visible = false;
      while (this.pool.length < this.budget) {
        const light = new THREE.PointLight(0xffffff, 0, 1);
        this.pool.push(light);
        this.scene.add(light);
      }
    }
    // Nearest by the distance to the edge of each light's reach.
    const ranked = this.sources
      .map((source) => {
        source.getWorldPosition(this.scratch);
        const reach = source.distance > 0 ? source.distance : 30;
        return { source, score: this.scratch.distanceTo(eye) - reach, at: this.scratch.clone() };
      })
      .sort((a, b) => a.score - b.score);
    for (let i = 0; i < this.pool.length; i++) {
      const slot = this.pool[i]!;
      const pick = ranked[i];
      if (!pick || !pick.source.parent) {
        slot.intensity = 0;
        continue;
      }
      slot.position.copy(pick.at);
      slot.color.copy(pick.source.color);
      slot.intensity = pick.source.intensity;
      slot.distance = pick.source.distance;
      slot.decay = pick.source.decay;
    }
  }
}
