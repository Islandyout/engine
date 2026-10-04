// Pale Signal's data tables, transcribed from the prototype
// (github.com/Islandyout/pale-signal, prototype/pale-signal.html.html:
// BODIES, SPECIES, LANDMARKS, UPGRADES, CIV_SITES, CIV_EVIDENCE, CIV_NPCS,
// the investigations and TUTORIAL_PAGES) and placed on this engine's
// worlds. build_pale_signal.ts turns them into entities and director.lua's
// config. Directions from the prototype are converted to latitude/longitude.

export type Hazard = "none" | "thermal" | "cryo" | "toxic" | "pressure";

// Per-body facts the HUD, suit and journal use.
export const BODY_INFO: Record<string, { temp: string; hazard: Hazard; rate: number; breathable: boolean; desc: string; dust: string; dustDensity: number; soft: boolean }> = {
  Cinder: { temp: "+412 C", hazard: "thermal", rate: 2.2, breathable: false, desc: "Tide-scorched inner world. Basalt flats split by cooling rifts.", dust: "#ff8a4a", dustDensity: 0.6, soft: false },
  Tethys: { temp: "+14 C", hazard: "none", rate: 0, breathable: true, desc: "Temperate. Thin but breathable air. Your expedition begins here.", dust: "#e8f0c8", dustDensity: 0.25, soft: true },
  Vell: { temp: "-171 C", hazard: "cryo", rate: 1.1, breathable: false, desc: "Ice moon of Tethys. Cratered, silent, and not entirely empty.", dust: "#e6f2ff", dustDensity: 0.3, soft: true },
  Ossuary: { temp: "-38 C", hazard: "toxic", rate: 1.6, breathable: false, desc: "Dust-choked and dead. Something built here, then stopped.", dust: "#c9b48a", dustDensity: 0.9, soft: true },
  Hollow: { temp: "-96 C", hazard: "pressure", rate: 1.9, breathable: false, desc: "Dense atmosphere, permanent overcast, and light that comes from below.", dust: "#7fe6ff", dustDensity: 0.7, soft: true },
  Nemesis: { temp: "-228 C", hazard: "cryo", rate: 1.4, breathable: false, desc: "Unlit. Uncharted. The signal resolves to a point on its surface.", dust: "#9a6cff", dustDensity: 0.4, soft: false },
};

// The system, scaled as in the prototype's BODIES table. Format: name parent
// orbit period phase(deg) inclination(deg) radius gravity atmosphere density
// relief scale seed colour haze options.
export const BODIES = [
  "Cinder - 900000 2120 40 2 44000 7 0 0 500 2500 5 #8a4a34 #000000 craters=0.3 rifts=1 day=1800",
  "Tethys - 1600000 5027 0 0 60000 9 9000 1.05 320 3200 7 #4f7a4a #87b6c8 sea=-60 clouds=0.42 snow=1 day=1200",
  "Vell Tethys 230000 3850 20 7 18000 2.6 0 0 180 1800 3 #c3cfdc #000000 snow=1 craters=0.6",
  "Ossuary - 2400000 9230 126 -3 52000 6.4 5000 0.18 420 4000 11 #9a9385 #c0b49a clouds=0.25 craters=0.15 dunes=1 day=2400",
  "Hollow - 3400000 15540 235 4 68000 11.2 16000 2.6 600 5000 13 #2f4a6b #3f7fa8 clouds=0.9 day=3000",
  "Nemesis - 4700000 25300 189 18 30000 4.2 0 0 400 2600 17 #2a2732 #000000 hidden=1 unlit=1 craters=0.5",
];

// [id, body, class, model, scatter weight, scale, name, RP, yield, amount, description]
export type SpeciesRow = [string, string, string, number, number, number, string, number, "ore" | "biomass" | "volatiles", number, string];
export const SPECIES: SpeciesRow[] = [
  ["ci_slag", "Cinder", "mineral", 44, 4, 1, "Vitrous Slag", 6, "ore", 9, "Rift glass, quenched in seconds. Trapped bubbles still hold the original atmosphere."],
  ["ci_sulf", "Cinder", "mineral", 43, 3, 0.9, "Sulphur Bloom", 5, "volatiles", 7, "Vents deposit it faster than the heat can destroy it. Barely a mineral. Barely stable."],
  ["ci_ember", "Cinder", "flora", 37, 2, 0.6, "Ember Lichen", 12, "biomass", 5, "Not a plant. A thermophile colony that metabolises the rock it sits on."],
  ["ci_crawl", "Cinder", "fauna", 116, 0, 0.8, "Slag Crawler", 20, "biomass", 9, "Armoured, blind, and running an internal temperature that should not permit chemistry."],
  ["te_reed", "Tethys", "flora", 38, 6, 0.8, "Pale Reed", 8, "biomass", 8, "Hollow-stemmed, wind-pollinated, and the dominant ground cover of the northern flats."],
  ["te_cap", "Tethys", "flora", 45, 2, 0.7, "Lantern Cap", 11, "biomass", 10, "Fruiting body glows on a 40-second cycle. Nothing here is known to see in that band."],
  ["te_pine", "Tethys", "flora", 49, 3, 1, "Kestra Spire", 9, "biomass", 6, "A conifer analogue whose rings record every flood the Talari have recorded, and several they have not."],
  ["te_iron", "Tethys", "mineral", 42, 2, 1.1, "Banded Ironstone", 5, "ore", 12, "Layered oxide. Proof this world once had far more free oxygen than it does now."],
  ["te_ice", "Tethys", "mineral", 44, 2, 1.2, "Clathrate Pocket", 6, "volatiles", 14, "Methane locked in a water lattice. Vents when disturbed. Excellent propellant feedstock."],
  ["te_graze", "Tethys", "fauna", 135, 0, 1, "Flat Grazer", 22, "biomass", 12, "Herd animal. Six legs, no forward-facing eyes, and an alarm call you feel before you hear."],
  ["te_skim", "Tethys", "fauna", 108, 0, 1.4, "Ridge Skimmer", 26, "biomass", 10, "Glides the thermal line along ridge crests. Will not approach a lit helmet."],
  ["ve_ice", "Vell", "mineral", 43, 5, 1.1, "Blue Ice Column", 7, "volatiles", 16, "Compressed for long enough to squeeze out every bubble. Rings when struck."],
  ["ve_reg", "Vell", "mineral", 42, 3, 1.6, "Impact Regolith", 4, "ore", 8, "Glass beads and shattered anorthosite. The record of every strike this moon ever took."],
  ["ve_frond", "Vell", "flora", 37, 2, 0.5, "Rime Frond", 16, "biomass", 6, "Grows in vacuum, in the dark, at 100 kelvin. It should not exist. It is thriving."],
  ["ve_strider", "Vell", "fauna", 112, 0, 0.9, "Rime Strider", 28, "biomass", 7, "Crosses the crater floors in the dark, grazing rime fronds. Its heat signature is barely warmer than the ice it walks on."],
  ["os_bone", "Ossuary", "mineral", 42, 4, 1.4, "Chalk Spar", 6, "ore", 11, "Calcite, laid down in water this world has not had for a very long time."],
  ["os_dust", "Ossuary", "mineral", 44, 3, 0.9, "Ferric Dust", 4, "ore", 9, "Fine enough to hold a static charge. It gets into every seal you own."],
  ["os_stalk", "Ossuary", "flora", 51, 1, 0.6, "Grey Stalk", 14, "biomass", 6, "Desiccated but not dead. Rehydrates in minutes if you are careless with your water."],
  ["os_husk", "Ossuary", "fauna", 136, 0, 0.9, "Dust Husk", 24, "biomass", 8, "Moves once every few minutes. Long-lived, low-energy, and aware of you."],
  ["ho_bulb", "Hollow", "flora", 45, 3, 0.9, "Deeplight Bulb", 15, "biomass", 12, "Photosynthesises by its own light. The energy budget only closes if it is also feeding."],
  ["ho_vine", "Hollow", "flora", 38, 3, 1.1, "Pressure Vine", 13, "biomass", 9, "Stiffened by internal pressure alone. Cut one and the whole plant collapses."],
  ["ho_crys", "Hollow", "mineral", 43, 3, 1.3, "Abyssal Crystal", 9, "volatiles", 15, "Grew under this atmosphere. It is under enormous strain and it is holding."],
  ["ho_drift", "Hollow", "fauna", 114, 0, 2.2, "Mist Drifter", 30, "biomass", 12, "Rides the overcast, filter-feeding. It is the largest living thing in the system."],
  ["ne_shard", "Nemesis", "mineral", 44, 4, 1.2, "Null Shard", 18, "ore", 14, "Absorbs across every band you can measure. The sample reads colder than its surroundings."],
  ["ne_watcher", "Nemesis", "fauna", 133, 0, 1.1, "Pale Watcher", 40, "biomass", 6, "It keeps its distance and keeps facing you. The signal is loudest when one is near."],
];

// Landmarks: [body, lat, lon, colour, name, fragment (0 none), kind, RP, log]
export type LandmarkRow = [string, number, number, string, string, number, string, number, string];
export const LANDMARKS: LandmarkRow[] = [
  ["Tethys", 31.1, 41.6, "#ffd36e", "Site 1 - Landfall", 0, "camp", 10, "Your drop capsule. Scorched, empty, and already half-buried by the reeds."],
  ["Tethys", 21, 54, "#8ff7ff", "The Kneeling Array", 1, "array", 40, "Nine dishes, all facing the same empty patch of sky. None of them are pointed at anything in this system."],
  ["Tethys", -24.8, 28.3, "#8ff7ff", "Reed Sink", 2, "array", 40, "A receiver, sunk to its collar in peat. Still drawing power. The source is below the waterline."],
  ["Cinder", 18, -30, "#ff9a5a", "The Anvil", 3, "monolith", 45, "A slab of worked metal standing in a lava channel. The rock flowed around it. It did not melt."],
  ["Vell", -12, 35, "#8ff7ff", "Under-Ice Relay", 4, "array", 60, "Forty metres of clear ice, and beneath it a lattice of aerials, aimed straight up at you."],
  ["Ossuary", 6.3, 51.5, "#ffe0a0", "The Ossuary Spine", 5, "monolith", 50, "A ridge of fused columns two kilometres long. Machine-cut. Then abandoned mid-cut."],
  ["Ossuary", 39.0, -156.4, "#ffe0a0", "Silent Foundry", 6, "ruin", 50, "Casting floors, crucibles, and no slag anywhere. Whatever they made here, they took all of it with them."],
  ["Hollow", -48.6, 65.0, "#9ff0ff", "The Drowned Choir", 7, "ruin", 60, "Resonators the size of towers, still humming under the overcast. The seventh voice in the signal is this."],
  ["Nemesis", 0, 90, "#c9a6ff", "THE PALE SIGNAL", 0, "beacon", 100, "The origin. It has been transmitting since before Tethys had an atmosphere."],
];

// The ship's upgrades (the prototype's seven).
export const UPGRADES = [
  { id: "thrust", name: "Thrust Vectoring", max: 5, base: 30, step: 38, desc: "main engine +%d%%", per: 14 },
  { id: "fuel", name: "Propellant Tanks", max: 5, base: 26, step: 32, desc: "fuel capacity +%d%%", per: 22 },
  { id: "scan", name: "Survey Optics", max: 4, base: 34, step: 40, desc: "scan range +%d%%, prospecting", per: 35 },
  { id: "hull", name: "Hull Reinforcement", max: 4, base: 40, step: 44, desc: "hull and gear +%d%%", per: 25 },
  { id: "life", name: "Life Support", max: 4, base: 28, step: 30, desc: "oxygen +%d%%, slower wear", per: 30 },
  { id: "heat", name: "Ablative Shielding", max: 3, base: 44, step: 52, desc: "heat tolerance +%d%%", per: 22 },
  { id: "rcs", name: "Reaction Control", max: 3, base: 22, step: 26, desc: "turn authority +%d%%", per: 30 },
];

// Civilization sites. Home-site ones sit in the Kestra frame at x, z
// (metres from the landing pad); the rest are their own Sites.
export interface SiteRow {
  id: string;
  name: string;
  body: string;
  kind: string;
  desc: string;
  home?: [number, number];
  lat?: number;
  lon?: number;
  radius?: number;
  public?: boolean; // shared after first contact
}
// The prototype's offsets around Kestra (east, north), scaled to 0.6 and
// centred on the quarter at (190, 40); north is -z.
export const kestra = (east: number, north: number): [number, number] => [190 + east * 0.6, 40 - north * 0.6];
export const SITES: SiteRow[] = [
  { id: "kestra", name: "Kestra Reach", body: "Tethys", kind: "settlement", home: [190, 40], desc: "A Concord-era reed and stone river settlement built across older canal foundations." },
  { id: "kestra_pad", name: "Kestra Landing Field", body: "Tethys", kind: "landing", home: [0, 0], desc: "A marked landing field outside the inhabited floodwall." },
  { id: "kestra_market", name: "Kestra Reed Market", body: "Tethys", kind: "market", home: kestra(110, -80), desc: "A working market and repair yard. Most activity has nothing to do with the expedition." },
  { id: "meridian_house", name: "Meridian House", body: "Tethys", kind: "research", home: kestra(520, 340), desc: "A modern research annex cataloguing historical observations of the Kneeling Arrays." },
  { id: "old_vey", name: "Old Vey Gate", body: "Tethys", kind: "archaeology", home: kestra(-1020, -580), desc: "River Kingdom masonry buried beneath later floodworks." },
  { id: "darsa_delta", name: "Darsa Delta", body: "Tethys", kind: "settlement", lat: 52.6, lon: 68.4, radius: 650, public: true, desc: "A tidal canal settlement whose civic identity is built around fisheries, water law and communal floodworks." },
  { id: "meridian_spur", name: "Meridian Spur", body: "Tethys", kind: "settlement", lat: 71.6, lon: -125, radius: 650, public: true, desc: "An upland observatory settlement where Meridian Age astronomy remains part of ordinary civic life." },
  { id: "ossuary_archive", name: "Civic Archive Nine", body: "Ossuary", kind: "archaeology", lat: 41.3, lon: -152, radius: 450, desc: "A collapsed archive complex from the Long Retreat." },
  { id: "ossuary_transit", name: "Retreat Causeway", body: "Ossuary", kind: "archaeology", lat: 44.4, lon: -148.8, radius: 450, desc: "A migration causeway pointing away from the old industrial basin." },
  { id: "hollow_enclave", name: "The Third Mooring", body: "Hollow", kind: "settlement", lat: -47.3, lon: 62.3, radius: 650, desc: "A pressure-adapted settlement held in the dense air by buoyant towers and acoustic anchors." },
];

// Evidence: [id, site, name, era, language, gain, RP, protected, movable, east, north, text]
export type EvidenceRow = [string, string, string, string, string, number, number, boolean, boolean, number, number, string];
export const EVIDENCE: EvidenceRow[] = [
  ["te_calendar", "old_vey", "Flood Calendar Stone", "Reed Settlement Age", "talari", 9, 9, true, false, -55, 25, "A weathered flood calendar uses a star symbol beside a direction matching the Kneeling Array. The carving predates the River Kingdoms."],
  ["te_gate_layer", "old_vey", "Vey Gate Foundation", "River Kingdom Period", "talari", 5, 12, true, false, 0, 0, "Three construction phases share one foundation. The oldest gate was aligned around a pre-existing black foundation that local builders never cut. It answers a carrier wave from Vell."],
  ["te_war_mural", "old_vey", "Basin War Mural", "Basin Wars", "talari", 8, 10, true, false, 85, 70, "A damaged mural calls the same Meridian ruler both 'river unifier' and, in a later overpaint, 'breaker of the north locks.'"],
  ["te_burial_mask", "old_vey", "River Kingdom Burial Mask", "River Kingdom Period", "talari", 6, 10, true, true, -92, -75, "A funerary mask remains where it was placed. The scanner flags living cultural ownership and burial protection."],
  ["te_ledger", "meridian_house", "Meridian Bearing Ledger", "Meridian Age", "talari", 12, 12, true, false, 22, 18, "Centuries of hand-copied measurements show the Kneeling Arrays have pointed at the same apparently empty sky despite precession and calendar reform."],
  ["te_array_notes", "meridian_house", "Modern Array Survey Notes", "Concord Era", "talari", 8, 9, false, false, -35, 44, "Modern researchers confirm the Arrays are older than every datable Talari construction layer. No accepted institution claims their builders were Talari."],
  ["te_oral", "kestra", "Oral-History Listening Post", "Concord Era", "talari", 11, 9, true, false, -120, 145, "Recorded elders disagree about the Arrays: taboo graves, astronomical instruments, or 'stars that learned to kneel.' The contradictions are preserved rather than reconciled."],
  ["te_memorial", "kestra", "Concord Memorial Wall", "Concord Era", "talari", 7, 7, true, false, 160, 155, "Names from both sides of the Basin Wars are written together. Several families appear beneath conflicting descriptions of the same final battle."],
  ["os_registry", "ossuary_archive", "Atmospheric Works Registry", "Atmospheric Works", "ossuary", 15, 14, false, false, -35, 40, "A civic registry records planetary climate infrastructure built millennia after the nearby Pale Signal foundations were already classified as 'pre-civic unknowns.'"],
  ["os_factory", "ossuary_archive", "Kiln Republic Seal", "Kiln Republics", "ossuary", 10, 11, false, false, 60, -20, "The seal depicts local furnaces with familiar slag channels. Its industrial language is visibly unrelated to the seamless geometry of the Silent Foundry."],
  ["os_migration", "ossuary_transit", "Long Retreat Marker", "Long Retreat", "ossuary", 14, 13, false, false, 20, -45, "Population counts fall with each successive marker. The route leads toward sealed habitats, not toward the Silent Foundry."],
  ["os_last", "ossuary_transit", "Final Transit Broadcast", "Silence", "ossuary", 18, 16, false, false, -75, 35, "The final surviving broadcast is logistical, not apocalyptic: water allocations, berth numbers, a delayed convoy. Then the record stops."],
  ["ho_anchor", "hollow_enclave", "Mooring Resonator", "First Moorings", "hollow", 15, 13, true, false, -120, 65, "The structure stores a repeating pressure pattern: place, lineage, depth, and a warning not to confuse the older Choir with the builders of the enclave."],
  ["ho_memory", "hollow_enclave", "Drift Memory Column", "Drift Memory", "hollow", 16, 14, true, false, 75, -110, "A layered acoustic memory describes generations before permanent settlements, when navigation existed as inherited songs rather than maps."],
  ["ho_compact", "hollow_enclave", "Choir Compact", "Choir Compacts", "hollow", 17, 15, true, false, 395, 215, "Several clades agree to preserve the Drowned Choir even though none claim to understand its makers. The pact is legal, historical and religious at once."],
  ["ho_frequency", "hollow_enclave", "Frequency Concordance", "Present Resonance", "hollow", 20, 17, false, false, 320, 170, "A modern resonance table contains an interval matching the seventh Pale Signal fragment. Local scholars treat the match as evidence, not revelation."],
];

export const INVESTIGATIONS = [
  { id: "tethys_array", title: "Tethys: The Inherited Sky", rp: 50, ids: ["te_calendar", "te_gate_layer", "te_war_mural", "te_ledger", "te_oral", "te_array_notes"],
    text: "Evidence across five historical eras agrees on one point while disagreeing about almost everything else: the Kneeling Arrays are older than Talari civilization. Myth, war propaganda, astronomy and modern survey all inherited the same mystery." },
  { id: "ossuary_fall", title: "Ossuary: A Civilization After the Builders", rp: 55, ids: ["os_registry", "os_migration", "os_factory", "os_last"],
    text: "The extinct Ossuary civilization built cities, climate works and migration routes beside structures it already considered ancient. Its disappearance and the Pale Signal are not the same event." },
  { id: "hollow_resonance", title: "Hollow: The Choir Compact", rp: 60, ids: ["ho_anchor", "ho_memory", "ho_compact", "ho_frequency"],
    text: "The Resonant Clades preserve the Drowned Choir as inherited unknown technology. Their modern frequency science intersects the Pale Signal, but their own records explicitly deny authorship." },
];

// NPCs: id, name, role, institution, site, home/work/market (east, north), line.
export interface NpcRow {
  id: string;
  name: string;
  role: string;
  inst: string;
  site: string;
  home: [number, number];
  work: [number, number];
  market: [number, number];
  line: string;
}
const npc = (id: string, name: string, role: string, inst: string, home: [number, number], work: [number, number], market: [number, number], line: string, site = "kestra"): NpcRow => ({ id, name, role, inst, site, home, work, market, line });
export const NPCS: NpcRow[] = [
  npc("ena_vey", "Ena Vey", "historian", "meridian", [-190, -120], [520, 330], [70, -50], "The oldest honest answer is that the Arrays were already old when our oldest dated stones were new."),
  npc("tal_ossin", "Tal Ossin", "dockwarden", "concord", [-120, -230], [-260, 60], [120, -90], "Your ship is welcome on the marked field. In the houses, engine wash is not a philosophical question."),
  npc("maru_sen", "Maru Sen", "reedwright", "commons", [110, -210], [145, -70], [95, -40], "Every flood leaves a different town. We build knowing the river gets a vote."),
  npc("ila_nareth", "Ila Nareth", "preservation officer", "preservation", [-40, 220], [-950, -520], [40, 15], "Document first. Ownership does not disappear because an object is old and interesting."),
  npc("osen_kai", "Osen Kai", "teacher", "commons", [210, 160], [-40, 120], [110, -25], "Children learn five eras. Adults spend the rest of their lives arguing about where one era ends."),
  npc("veyra_tol", "Veyra Tol", "astronomer", "meridian", [-260, 70], [550, 350], [80, -20], "Every dish tracks one empty coordinate. Empty is an observation, not an explanation."),
  npc("aran_mei", "Aran Mei", "fisher", "commons", [250, -110], [310, -250], [120, -65], "The scholars call it precession. My grandmother called it proof the sky can remember."),
  npc("sen_ivar", "Sen Ivar", "surveyor", "concord", [-310, 140], [-360, 80], [70, -30], "Concord maps distinguish unknown, disputed, protected and dangerous. 'Unowned' is not one of the categories."),
  npc("kela_ru", "Kela Ru", "archivist", "meridian", [30, 260], [500, 300], [40, -40], "Copies disagree. That is useful. Agreement can be evidence; disagreement can be history."),
  npc("ro_talen", "Ro Talen", "boatwright", "commons", [340, 60], [250, -190], [130, -40], "The River Kings are romantic when their taxes are not arriving by boat."),
  npc("mev_sara", "Mev Sara", "medic", "concord", [-70, -300], [-170, -30], [80, -20], "Breathable does not mean harmless. Pollen, spores, river fever. Keep your filters until you know the season."),
  npc("jani_orel", "Jani Orel", "student", "meridian", [190, 240], [480, 320], [65, -10], "If the Arrays are not ours, then our history begins inside someone else's unfinished experiment. I hate that idea."),
  npc("tor_alen", "Tor Alen", "market keeper", "commons", [280, -30], [105, -70], [105, -70], "You brought ore, samples, stories. All three have prices, but not the same kind."),
  npc("sela_von", "Sela Von", "memorial keeper", "preservation", [-180, 250], [155, 150], [30, 0], "The wall keeps both names for the final battle because choosing one would restart it."),
  npc("ir_tovan", "Ir Tovan", "radio operator", "concord", [-250, -180], [-330, 135], [75, -45], "We heard your capsule before we saw it. The question was whether you were lost, dangerous, or both."),
  npc("ava_keth", "Ava Keth", "array scholar", "preservation", [-120, 300], [510, 365], [20, -15], "People worshipped the Arrays, dismantled them, defended them, measured them. None of those acts made them ours."),
  npc("dara_vess", "Dara Vess", "water clerk", "commons", [-120, -80], [40, 40], [120, -30], "A floodwall is a promise to people downstream. Darsa law remembers every promise someone tried to forget.", "darsa_delta"),
  npc("noa_ter", "Noa Ter", "fisher", "commons", [90, -120], [220, -80], [40, 20], "We know the Array stories. Up here they are scholarship. In the delta they are weather, luck, and arguments with grandparents.", "darsa_delta"),
  npc("sari_ko", "Sari Ko", "canal engineer", "concord", [-180, 90], [-30, 140], [80, 10], "The River Kingdoms built for control. We build for failure modes. History is expensive engineering documentation.", "darsa_delta"),
  npc("ive_ran", "Ive Ran", "boat historian", "meridian", [160, 110], [70, 80], [20, -20], "Old trade songs preserve place names that vanished from official maps. Oral history is not less precise; it is precise about different things.", "darsa_delta"),
  npc("tela_mer", "Tela Mer", "observatory keeper", "meridian", [-120, -90], [40, 150], [100, 10], "Our oldest instruments were rebuilt so many times that the repairs became the artifact. Continuity can be a structure, not an object.", "meridian_spur"),
  npc("ovar_sel", "Ovar Sel", "student pilot", "concord", [110, -100], [-40, 130], [50, 30], "People from the basin think uplanders stare at stars. Mostly we argue about maintenance budgets, then stare at stars.", "meridian_spur"),
  npc("kemi_vor", "Kemi Vor", "array skeptic", "preservation", [-180, 70], [-60, 180], [20, 40], "An unexplained object does not become sacred by being old. It also does not become ours by being measurable.", "meridian_spur"),
  npc("ra_isen", "Ra Isen", "instrument maker", "commons", [180, 40], [130, 120], [70, 15], "Meridian prestige came from instruments, but the instruments came from workshops. History likes towers and forgets benches.", "meridian_spur"),
];

// The Resonant Clades of Hollow speak through resonators (their own language).
export const CLADES = [
  { id: "clade_first", name: "First Mooring Voice", role: "clade elder", inst: "hollow", at: [-60, 40] as [number, number], line: "We moor to the Choir's sound, not to its makers. We do not know its makers. Write that down twice." },
  { id: "clade_drift", name: "Drift Singer", role: "navigator", inst: "hollow", at: [90, -60] as [number, number], line: "Before towers, we sang our way between depths. The Choir was already singing when the first song was learned." },
  { id: "clade_exchange", name: "Exchange Keeper", role: "resonance scholar", inst: "hollow", at: [350, 160] as [number, number], line: "Your seventh fragment matches our oldest interval. A match is a question. Do not bring us an answer we did not ask for." },
];

// Survey Academy: [title, body] pages (from the prototype's TUTORIAL_PAGES).
export const ACADEMY: Array<[string, string]> = [
  ["START HERE", "1 Disembark: E while landed.\n2 Verify the atmosphere: look up into open sky and hold F until AIR VERIFIED.\n3 Scan one plant or mineral: the first scan identifies it, awards RP and collects some of its resource.\n4 Choose what you need: R cycles prospecting (fuel / ore / biomass) and marks the nearest deposit.\n5 Return and plan: board, open the System Board (TAB) and pick a route marked OK.\n6 Launch, transfer, brake, land: G engages the NAV autopilot to the target; any control input takes over."],
  ["RESOURCES", "VOLATILES are fuel feedstock. ORE repairs hull and components and can be assayed for RP. BIOMASS is analysed for RP.\nScanning identifies; E on a catalogued specimen harvests more of it.\nAboard ship (I): refine volatiles into propellant, analyse samples, repair.\nFuel sources: Tethys Clathrate Pocket / volatile ice, Cinder Sulphur Bloom, Vell Blue Ice Column, Hollow Abyssal Crystal."],
  ["SURVEY MAP", "M cycles the system map, the surface map of the world you're on, and off.\nThe minimap shows your ship, objectives, catalogued resources, wildlife and people.\nThe map is not omniscient: unknown ruins, unscanned life and undiscovered signal sites stay hidden until found."],
  ["LIFE SUPPORT", "O2 RESERVE drains only when the suit cannot use ambient air.\nSUIT INTEGRITY is physical damage from hazards: heat on Cinder, cold on Vell and Nemesis, toxins on Ossuary, pressure on Hollow.\nVITALS fall when the suit fails or oxygen runs out.\nA verified breathable atmosphere switches to AMBIENT INTAKE. H removes the helmet only where that's safe.\nRETURN MARGIN estimates whether you can still walk back to the ship."],
  ["FLIGHT", "W/S throttle, Shift full, X cut. Arrows or IJKL pitch and yaw (A/D yaw), Q/E roll.\nSpace/C lift and sink on the belly thrusters. T toggles STABILIZED and MANUAL. N cycles NAV modes: prograde, retrograde, target, autopilot.\nHeat builds when you fly fast in thick air: slow down or it damages the hull and engine."],
  ["NAV & TRAVEL", "TAB opens the System Board: every known body with its distance, closing speed and a route plan: OK, MARGINAL or INSUFFICIENT fuel.\n, and . choose the target; G engages the autopilot. It climbs out of the air, burns, coasts under time warp and brakes above the target.\nManual input always wins: touch the controls and the autopilot hands back."],
  ["LANDING", "Under 7 m/s down, slow sideways, level, and on gentle ground. The guidance line shows the last 150 m.\nRough landings damage the hull and wear the landing gear; worn gear tolerates less.\nLand on marked fields near settlements: engine wash over houses is an offence."],
  ["FUEL & REPAIRS", "Refine volatiles at the ship (I): 6 volatiles make 12 fuel.\nB releases the one-time emergency reserve below 35% fuel.\nOre repairs the hull and components; the Kestra workshop does a full service for ore and biomass.\nIf the ship is lost you are recovered to the last safe landing."],
  ["CIVILIZATIONS", "Talk (E) to learn the Talari language: names, pointing, patient correction. Evidence teaches it too.\nY opens the culture record: language, reputation with the Concord, Commons, Meridian and Preservation, contacts and evidence by era.\nProtected artifacts can be documented in place or taken. Taking them costs trust."],
  ["CONTROLS (PC)", "On foot: WASD, mouse look, E interact, hold F scan, H helmet, R prospect.\nPanels: J journal, U upgrades, I ship services, Y culture, TAB system board, M map, F1 controls, F2 this academy, F10 settings, P pause."],
  ["TOUCH", "The left stick walks or flies. Buttons: E interact, SCAN, UP/DOWN thrusters, THR+ full throttle, CUT, NAV, MAP, JRNL and MENU. Drag the view to look."],
  ["COMMON MISTAKES", "Leaving without fuel for the way back: check the System Board.\nWalking off on an airless world without watching RETURN MARGIN.\nHolding F at nothing: aim at a specimen, or straight up at open sky to sample the air.\nLanding in town."],
];
