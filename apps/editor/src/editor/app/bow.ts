// The bow in the Player's hands. The script (tools/murim/lua/player.lua) decides what the bow is doing and sends it as a host
// message ("idle", "draw 0.9 1", "hold 1 1", "loose", "off"); this shows it: the bow model in the left hand, held upright in front of the
// body, and the matching archery clip on the upper body (combatView.bowPose).
import * as THREE from "three";
import { modelCatalog } from "../../scene/modelCatalog";
import type { Ctx } from "./context";

type BowState = "off" | "idle" | "draw" | "hold" | "loose";
const STATES = new Set<string>(["off", "idle", "draw", "hold", "loose"]);
// The bow model is about 1.4 m tall as authored; a 1.8 m archer holds one about 1.1 m long, gripped at its middle.
const BOW_LENGTH = 1.1;

export function installBow(C: Ctx): void {
  const states = new Map<number, { state: BowState; seconds: number; aim: boolean; since: number; model?: THREE.Object3D }>();

  function attach(index: number, entry: { state: BowState; model?: THREE.Object3D }) {
    const object = C.objects[index];
    const hand = object?.getObjectByName("hand_l");
    if (!hand || entry.model) return;
    const catalog = modelCatalog.find((m) => m.path === "./kit/weapons/bow.glb");
    if (!catalog) return;
    const place = (cached: { scene: THREE.Object3D }) => {
      if (entry.model || !hand.parent) return;
      const bow = cached.scene.clone(true);
      const size = new THREE.Box3().setFromObject(bow).getSize(new THREE.Vector3());
      // Held upright: the bow's limbs run along the hand's long axis at rest and are turned to stand across it when drawn.
      bow.rotation.set(Math.PI / 2, 0, 0);
      bow.scale.setScalar(BOW_LENGTH / Math.max(0.1, Math.max(size.x, size.y, size.z)));
      bow.name = "held bow";
      hand.add(bow);
      entry.model = bow;
      bow.visible = entry.state !== "off";
    };
    const ready = C.catalogCache.get(catalog.id);
    if (ready) place(ready);
    else C.loadCatalogModel(catalog.id)?.then(place, (error) => C.log(`The bow model failed to load: ${String(error)}`));
  }

  // What a script told the bow to do (host message "bow", value "<state> [seconds] [aim 0|1]").
  function setBow(index: number, text: string) {
    const [state = "off", seconds = "1", aim = "0"] = text.trim().split(/\s+/);
    if (!STATES.has(state)) {
      C.log(`[script] bow: unknown state "${state}" (idle, draw, hold, loose or off)`);
      return;
    }
    const entry = states.get(index) ?? { state: "off" as BowState, seconds: 1, aim: false, since: 0 };
    if (entry.state !== state) entry.since = performance.now();
    entry.aim = aim === "1";
    entry.state = state as BowState;
    entry.seconds = Number(seconds) || 1;
    states.set(index, entry);
    if (entry.state !== "off") attach(index, entry);
    if (entry.model) entry.model.visible = entry.state !== "off";
    C.combat.bowPose(index, entry.state, entry.seconds);
  }

  // Every frame: a pose the fighter lost (a hit, a weapon change) is put back while the bow is out.
  function updateBow() {
    for (const [index, entry] of states) if (entry.state !== "off") C.combat.bowPose(index, entry.state, entry.seconds);
  }
  // The bow sight's draw (0..1) while the Player aims or draws, -1 when it shows nothing.
  function bowSight(): number {
    const entry = states.get(C.playerIndex);
    if (!entry || entry.state === "off" || !(entry.aim || entry.state === "draw" || entry.state === "hold")) return -1;
    if (entry.state === "hold") return 1;
    return entry.state === "draw" ? Math.min(1, (performance.now() - entry.since) / 1000 / entry.seconds) : 0;
  }
  Object.assign(C, { setBow, updateBow, bowSight });
}
