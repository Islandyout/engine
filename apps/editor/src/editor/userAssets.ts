// Imported assets (0.58.0): models (.glb), images and audio a user adds
// through the editor. The files are kept in the browser's IndexedDB so they
// survive reloads, and are registered into the same catalogs the bundled
// content uses -- models get catalog ids from 10000 up (category
// "imported"), sounds likewise, and images are referenced as
// "asset:<file name>" from UI.image and Material.texture.
//
// Limitation: assets live in this browser only. A scene that uses them
// shows placeholder boxes / no sound elsewhere, and tools/export_build.mjs
// does not bundle them.

export type AssetKind = "model" | "image" | "sound";

export interface StoredAsset {
  id: number;
  kind: AssetKind;
  name: string; // file name, unique per kind
  type: string; // MIME type
  data: Blob;
}

export const firstUserAssetId = 10000;

export function assetKind(fileName: string): AssetKind | undefined {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  if (extension === "glb") return "model";
  if (["png", "jpg", "jpeg", "webp", "gif"].includes(extension)) return "image";
  if (["ogg", "mp3", "wav", "m4a"].includes(extension)) return "sound";
  return undefined;
}

// Re-importing a file with the same name and kind keeps its id, so scenes
// that reference it keep working; anything new gets the next free id.
export function assignId(existing: readonly StoredAsset[], kind: AssetKind, name: string): number {
  const same = existing.find((a) => a.kind === kind && a.name === name);
  if (same) return same.id;
  return Math.max(firstUserAssetId - 1, ...existing.map((a) => a.id)) + 1;
}

export function displayName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

// "asset:<name>" -> object URL for an imported image; any other string is
// used as a URL as-is.
export function resolveAssetUrl(reference: string, images: ReadonlyMap<string, string>): string {
  return reference.startsWith("asset:") ? (images.get(reference.slice(6)) ?? "") : reference;
}

const databaseName = "game-engine-editor-assets";
const storeName = "assets";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadStoredAssets(): Promise<StoredAsset[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as StoredAsset[]);
    request.onerror = () => reject(request.error);
  });
}

export async function storeAsset(asset: StoredAsset): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(asset);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
