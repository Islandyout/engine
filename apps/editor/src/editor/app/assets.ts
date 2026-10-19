import * as THREE from "three";
import type {
	EntityRef,
	Vec3
} from "../../scene/Components";
import { catalogReplacements, modelCatalog, retiredCatalogIds } from "../../scene/modelCatalog";
import { soundCatalog } from "../../scene/soundCatalog";
import { fuzzyRank } from "../fuzzy";
import { markCharacter } from "../manhwa";
import { assetKind, assignId, displayName, storeAsset, type StoredAsset } from "../userAssets";
import type { Ctx } from "./context";
import { CachedModel } from "./context";

export function installAssets(C: Ctx): void {
  // The gizmo drags a catalog-backed object's own three.js scale, which
  // rebuild() normalizes by the model's native size (see CachedModel's own
  // doc comment) — not the literal world-space units the authored Scale
  // component stores. Undoing that normalization here, so the scale mode
  // persists literal dimensions instead of quietly shrinking the model by
  // its own native size on the very next rebuild().
  function toLiteralScale(entity: EntityRef, scale: Vec3): Vec3 {
    const meshId = C.doc.scene.resolve(entity, "Renderable")?.mesh ?? 0;
    const cached = meshId >= 1 ? C.catalogCache.get(meshId) : undefined;
    if (!cached) return scale;
    const n = cached.nativeSize;
    return {
      x: scale.x * (n.x > 1e-6 ? n.x : 1),
      y: scale.y * (n.y > 1e-6 ? n.y : 1),
      z: scale.z * (n.z > 1e-6 ? n.z : 1),
    };
  }

  function configureSnap() {
    const enabled = C.el<HTMLInputElement>("snap").checked;
    C.gizmo.setTranslationSnap(enabled ? Number(C.el<HTMLSelectElement>("snap-size").value) : null);
    C.gizmo.setRotationSnap(enabled ? Math.PI / 12 : null);
    C.gizmo.setScaleSnap(enabled ? 0.1 : null);
  }

  function catalogEntry(meshId: number) {
    const replacement = catalogReplacements[meshId];
    if (replacement !== undefined && !C.retiredNoted.has(meshId)) {
      C.retiredNoted.add(meshId);
      C.log(`Model ${meshId} is retired: drawing ${replacement} (${modelCatalog.find((m) => m.id === replacement)?.name}) in its place.`);
    } else if (replacement === undefined && retiredCatalogIds.includes(meshId) && !C.retiredNoted.has(meshId)) {
      C.retiredNoted.add(meshId);
      C.log(`Model ${meshId} is retired and has no replacement: it is drawn as a box.`);
    }
    return modelCatalog.find((m) => m.id === (replacement ?? meshId));
  }

  // Options for AnimationState.clip's inspector dropdown: this entity's own
  // Renderable model's clip names, not a fixed list -- unlike Sound.clip
  // (one catalog, PropertyMetadata.ts), every animated model has a different
  // clip set, so this has to be computed per entity rather than statically.
  function animationClipOptions(entity: EntityRef) {
    const meshId = C.doc.scene.resolve(entity, "Renderable")?.mesh ?? 0;
    const clips = C.catalogCache.get(meshId)?.clips ?? [];
    return [{ label: "(Automatic)", value: "" }, ...clips.map((clip) => ({ label: clip.name, value: clip.name }))];
  }

  function loadCatalogModel(meshId: number): Promise<CachedModel> | undefined {
    const entry = catalogEntry(meshId);
    if (!entry) return undefined;
    let promise = C.catalogPromises.get(meshId);
    if (!promise) {
      promise = C.gltfLoader.loadAsync(entry.path).then((gltf) => {
        // A model with a distant version (a root "LOD1" node, e.g. the
        // trees): one instance draws the near one; instanced copies switch
        // (terrainMesh.ts updateScatterLod).
        const far = gltf.scene.children.find((child) => child.name === "LOD1");
        if (far) gltf.scene.remove(far);
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        const nativeSize = bounds.getSize(new THREE.Vector3());
        const nativeCenter = bounds.getCenter(new THREE.Vector3());
        const cached = { scene: gltf.scene, far, clips: gltf.animations, nativeSize, nativeCenter };
        if (entry.animated) {
          markCharacter(gltf.scene);
          // Where its lowest foot bone stands in the rest pose, relative to
          // the model's centre: combatView keeps fighters' feet there.
          gltf.scene.updateMatrixWorld(true);
          let foot = Infinity;
          gltf.scene.traverse((node) => {
            if ((node as THREE.Bone).isBone && /foot|toe/i.test(node.name)) foot = Math.min(foot, node.getWorldPosition(new THREE.Vector3()).y);
          });
          if (Number.isFinite(foot)) gltf.scene.userData.restFoot = foot - nativeCenter.y;
        }
        C.catalogCache.set(meshId, cached);
        return cached;
      });
      // Evict a failed load so the next attempt (a rebuild() encountering the
      // same id again, or a retried "Add") gets a fresh promise instead of
      // reusing a permanently rejected one. A separate .catch() here just
      // observes the rejection for this bookkeeping; it doesn't swallow it —
      // every other holder of `promise` still sees the original rejection.
      promise.catch(() => C.catalogPromises.delete(meshId));
      C.catalogPromises.set(meshId, promise);
    }
    return promise;
  }

  function registerAsset(asset: StoredAsset) {
    const url = URL.createObjectURL(asset.data);
    if (asset.kind === "image") C.importedImages.set(asset.name, url);
    else if (asset.kind === "model") {
      const existing = modelCatalog.find((m) => m.id === asset.id);
      if (existing) existing.path = url;
      else modelCatalog.push({ id: asset.id, category: "imported", name: displayName(asset.name), path: url });
      C.catalogPromises.delete(asset.id);
      C.catalogCache.delete(asset.id);
      const category = C.el<HTMLSelectElement>("catalog-category");
      if (![...category.options].some((o) => o.value === "imported")) category.add(new Option("Imported", "imported"));
    } else {
      const existing = soundCatalog.find((s) => s.id === asset.id);
      if (existing) existing.path = url;
      else soundCatalog.push({ id: asset.id, category: "imported", name: displayName(asset.name), path: url });
      C.soundBuffers.delete(asset.id);
      C.soundBufferPromises.delete(asset.id);
    }
  }

  async function importFiles(files: FileList | File[]) {
    const imported: string[] = [];
    for (const file of files) {
      const kind = assetKind(file.name);
      if (!kind) {
        C.log(`Import: ${file.name} is not a .glb model, image or audio file`);
        continue;
      }
      const asset: StoredAsset = { id: assignId(C.storedAssets, kind, file.name), kind, name: file.name, type: file.type, data: file };
      C.storedAssets = [...C.storedAssets.filter((a) => a.id !== asset.id), asset];
      try {
        await storeAsset(asset);
      } catch (error) {
        C.log(`Import: ${file.name} could not be saved in this browser (${String(error)}); it lasts until reload`);
      }
      registerAsset(asset);
      imported.push(kind === "image" ? `${file.name} (use asset:${file.name})` : `${file.name} (${kind} ${asset.id})`);
    }
    if (imported.length) {
      C.log(`Imported ${imported.join(", ")}`);
      populateCatalogModels();
      C.updatePanels();
    }
  }

  function populateCatalogModels() {
    const category = C.el<HTMLSelectElement>("catalog-category").value;
    const query = C.el<HTMLInputElement>("catalog-search").value;
    // A search spans every category, best match first; otherwise the
    // category's models. Option elements, not innerHTML: imported models
    // carry their file names, which are user text (and persist in IndexedDB).
    const live = modelCatalog.filter((m) => !retiredCatalogIds.includes(m.id));
    const models = query.trim() ? fuzzyRank(live, query, (m) => [m.name, m.category]) : modelCatalog.filter((m) => m.category === category);
    C.el<HTMLSelectElement>("catalog-category").disabled = !!query.trim();
    C.el<HTMLSelectElement>("catalog-model").replaceChildren(
      ...models.map((m) => new Option(query.trim() ? `${m.name} · ${m.category}` : m.name, String(m.id))),
    );
  }
  Object.assign(C, { toLiteralScale, configureSnap, catalogEntry, animationClipOptions, loadCatalogModel, registerAsset, importFiles, populateCatalogModels });
}
