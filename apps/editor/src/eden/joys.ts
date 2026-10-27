// The small things that make a life worth living and are hardly noticed: warm sun on the face, the smell of rain, a cool drink after work.
// Nothing here is a list of a million lines. A joy is a trigger (when it can happen) plus something noticed, a detail of it and a reaction,
// and the same trigger fits many contexts (season, hour, weather, company, what the person is doing), so the number of distinct moments is
// the product, and `countJoys()` works it out. A person's own taste (their seed) decides which they notice, and how much they appreciate them.
import type { Season } from "./earth";

export type Band = "dawn" | "morning" | "noon" | "afternoon" | "dusk" | "night";
export type Sky = "clear" | "rain" | "snow" | "fog" | "wind";
export type Company = "alone" | "one" | "group";
export type Doing = "eat" | "drink" | "rest" | "sleep" | "walk" | "work" | "talk" | "idle";

export interface JoyContext {
  season: Season;
  band: Band;
  sky: Sky;
  company: Company;
  doing: Doing;
  warm: boolean; // the fire or the sun is on them
}

interface Trigger {
  id: string;
  seasons?: Season[];
  bands?: Band[];
  skies?: Sky[];
  companies?: Company[];
  doings?: Doing[];
  needsWarm?: boolean;
  subjects: string[];
  details: string[];
  reactions: string[];
}

const T = (t: Trigger) => t;
export const TRIGGERS: Trigger[] = [
  T({ id: "sun", skies: ["clear"], bands: ["morning", "noon", "afternoon"], seasons: [0, 3, 1, 2],
    subjects: ["the sun on my face", "sunlight on my arms", "warmth on my back", "the light through the leaves", "a patch of sun on the grass", "the sun on the water", "light on my hands", "the sun on my shoulders"],
    details: ["after the cold", "slow and gentle", "just for a moment", "through a gap in the cloud", "as it climbed", "while I stood still", "and I lingered"],
    reactions: ["I closed my eyes", "I smiled without meaning to", "I felt easy", "it was enough", "I breathed deeply", "I forgot what I was hurrying to"] }),
  T({ id: "rain-smell", skies: ["rain"], seasons: [0, 1, 2, 3],
    subjects: ["the smell of rain on dry earth", "the sound of rain on leaves", "rain on my face", "the hush the rain brings", "puddles filling in the path", "the grass drinking", "the river getting louder", "the rain drumming on the shelter"],
    details: ["after a long dry spell", "soft and steady", "in the quiet", "all around me", "slowly", "with no wind"],
    reactions: ["I stopped to listen", "I felt the world settle", "I was glad of it", "I lifted my face to it", "I felt clean", "I was content to wait it out"] }),
  T({ id: "water", doings: ["drink"],
    subjects: ["the first cold mouthful", "clear water from the river", "water running over my hands", "a long drink", "the cool of the stream", "water that tasted of stone"],
    details: ["when I was parched", "after the walk", "on a warm day", "slowly", "with both hands", "kneeling at the bank"],
    reactions: ["it was the best thing in the world", "I felt new", "I sighed", "I could have wept", "I drank again", "I felt myself again"] }),
  T({ id: "food", doings: ["eat"],
    subjects: ["warm food", "ripe fruit", "fresh bread-like grain cakes", "a handful of berries", "fish from the fire", "roast meat", "sweet roots", "a nut cracked open"],
    details: ["when I was hungry", "still warm", "shared", "eaten slowly", "with salt-air from the river", "after a hard day"],
    reactions: ["it tasted of everything good", "I was grateful", "I savoured it", "I forgot my cares", "I licked my fingers", "I felt strong"] }),
  T({ id: "rest", doings: ["rest", "idle"],
    subjects: ["sitting down", "stretching my back", "lying in the grass", "leaning on a tree", "letting my legs go slack", "a long yawn", "resting my feet", "the quiet"],
    details: ["after work", "with nothing to do", "in the shade", "in the warm", "listening to birds", "watching clouds"],
    reactions: ["my body thanked me", "I was at peace", "I could feel myself loosen", "I wished it would last", "I almost slept", "I was happy to be still"] }),
  T({ id: "sleep", doings: ["sleep"], bands: ["night", "dawn", "dusk"],
    subjects: ["clean sleep", "a warm blanket of skins", "the dark and the quiet", "sleep coming easily", "dreaming", "waking rested"],
    details: ["by the fire", "under the roof", "with the rain outside", "with others near", "with the stars out", "without waking once"],
    reactions: ["I woke easy", "I felt safe", "I was thankful", "it was deep", "it was kind to me", "the day began well"] }),
  T({ id: "fire", needsWarm: true, bands: ["dusk", "night", "dawn"], seasons: [2, 3, 0],
    subjects: ["the fire's warmth", "the crackle of the fire", "faces lit by the fire", "sparks going up", "the smell of woodsmoke", "the shape of the flames", "ember glow", "a hot stone at my feet"],
    details: ["in the cold", "after dark", "with my hands held out", "while it burned low", "as the night closed in", "in good company"],
    reactions: ["I did not want to leave it", "it made the dark friendly", "I felt held", "I was warm to my bones", "I watched until my eyes were heavy", "I felt at home"] }),
  T({ id: "dawn", bands: ["dawn"], skies: ["clear", "fog"],
    subjects: ["the first light", "birdsong beginning", "dew on the grass", "mist on the river", "a pink sky", "the world waking", "the cool before sunrise", "the first sun on the hills"],
    details: ["before anyone else was up", "all gold", "very still", "slowly brightening", "as I walked", "from the doorway"],
    reactions: ["it felt like a gift", "I was glad to be awake", "I wanted to keep it", "I felt hopeful", "I took it in", "I thought: another day"] }),
  T({ id: "dusk", bands: ["dusk"], skies: ["clear", "wind"],
    subjects: ["the long shadows", "the sky turning orange", "the first star", "the fading light", "swallows overhead", "smoke rising straight", "the hills turning blue", "the day's end"],
    details: ["after the work was done", "while the air cooled", "as I walked home", "from the hill", "with the others", "quietly"],
    reactions: ["I felt the day was good", "I was sorry to see it go", "I felt calm", "I counted my blessings", "I was ready for rest", "I felt small and glad"] }),
  T({ id: "stars", bands: ["night"], skies: ["clear"],
    subjects: ["more stars than I could count", "the moon on the grass", "a falling star", "the river silver in the moonlight", "the owl calling", "the cold clean air", "the Milky road across the sky", "the whole sky turning"],
    details: ["away from the fire", "lying on my back", "in silence", "with someone beside me", "for a long while", "when I could not sleep"],
    reactions: ["I felt part of something large", "I forgot my troubles", "I wondered", "I felt tiny and unafraid", "I made a wish", "I could not look away"] }),
  T({ id: "snow", skies: ["snow"], seasons: [3],
    subjects: ["the first snow", "the hush of snowfall", "a white field without a mark", "snow on every branch", "my breath in the air", "footprints behind me", "snow squeaking underfoot", "the world made new"],
    details: ["before anyone walked in it", "soft and slow", "in the stillness", "all night", "glittering", "silently"],
    reactions: ["I laughed like a child", "I stood and stared", "I was glad of the fire after", "it was beautiful", "I felt quiet inside", "I did not want to spoil it"] }),
  T({ id: "wind", skies: ["wind"],
    subjects: ["wind in my hair", "grass bending in waves", "leaves turning silver", "the wind at my back", "clouds racing", "a kite of leaves", "the wind carrying seeds", "the trees roaring"],
    details: ["on the hill", "as I walked", "warm", "fresh", "after the heat", "from the river"],
    reactions: ["I felt alive", "I opened my arms", "I felt light", "I could have run", "it blew my worries away", "I grinned"] }),
  T({ id: "walk", doings: ["walk"], skies: ["clear", "wind", "fog"],
    subjects: ["the path under my feet", "the smell of cut grass", "wildflowers by the track", "a butterfly", "a view from the rise", "a stone warm from the sun", "a deer watching me", "bees working the flowers"],
    details: ["on an ordinary day", "unexpectedly", "right at my feet", "as I came over the rise", "going nowhere", "on my way home"],
    reactions: ["I stopped to look", "it made the walk worth it", "I took a moment", "I smiled", "I wanted someone to see it", "I felt lucky"] }),
  T({ id: "work", doings: ["work"],
    subjects: ["a job done well", "my hands knowing what to do", "the rhythm of the work", "a tool that fitted my hand", "the smell of fresh wood", "tired muscles", "something finished", "steady progress"],
    details: ["before noon", "without hurry", "with the sun warm", "alone with my thoughts", "singing under my breath", "with the work going well"],
    reactions: ["I felt useful", "I felt proud", "I lost track of time", "I felt capable", "I was satisfied", "I wanted to show someone"] }),
  T({ id: "friend", companies: ["one", "group"], doings: ["talk", "rest", "eat", "idle"],
    subjects: ["a shared joke", "someone's laughter", "being listened to", "a kind word", "a hand on my shoulder", "sitting close together", "a story told well", "an old memory shared"],
    details: ["without any reason", "over food", "in the firelight", "while the others slept", "after a hard day", "just because"],
    reactions: ["I felt less alone", "I felt I belonged", "I laughed till it hurt", "I felt known", "I felt warm inside", "I did not want it to end"] }),
  T({ id: "alone", companies: ["alone"], doings: ["rest", "idle", "walk"],
    subjects: ["my own company", "quiet to think in", "no one needing anything of me", "an unhurried hour", "the peace of being by myself", "thoughts drifting", "a hum I made up", "my own footsteps"],
    details: ["for once", "in the afternoon", "in the shade", "by the water", "at the edge of the wood", "in the stillness"],
    reactions: ["I felt free", "I felt whole", "I sighed with relief", "I enjoyed it", "I was glad of it", "I came back refreshed"] }),
  T({ id: "clean", doings: ["drink", "rest", "idle"], seasons: [0, 1, 2],
    subjects: ["washing my face", "cool water over my feet", "clean skin", "a bath in the river", "the sting of cold water", "hair drying in the sun", "washed hands", "fresh clothes"],
    details: ["after a dirty day", "in the warm", "at the bank", "before sleep", "with the sun on the water", "to wake myself"],
    reactions: ["I felt reborn", "I felt light", "I gasped and laughed", "I felt clean right through", "I felt ready for anything", "it was bliss"] }),
  T({ id: "season", seasons: [0], skies: ["clear", "rain", "wind"],
    subjects: ["the first green shoots", "blossom opening", "lambs and young calling", "new leaves", "birds building nests", "warm soil", "the sweetness of the air", "the days getting longer"],
    details: ["after the winter", "everywhere I looked", "overnight", "in the sun", "at the edge of the field", "like a promise"],
    reactions: ["I felt hope", "I felt the winter go out of me", "I wanted to plant everything", "I was glad to have lived to see it", "I felt young", "I sang"] }),
  T({ id: "harvest", seasons: [1, 2],
    subjects: ["a heavy branch of fruit", "ripe grain swaying", "full baskets", "the smell of apples", "the buzz of the orchard", "late sun on the stubble", "nuts falling", "a full store"],
    details: ["in the warm light", "after all the work", "in good time", "with plenty to spare", "with everyone helping", "at the turn of the year"],
    reactions: ["I felt rich", "I felt secure for the winter", "I was grateful", "I felt it had all been worth it", "I smiled at the sight", "I felt the year's work in my bones"] }),
  T({ id: "animal", skies: ["clear", "fog", "wind"], doings: ["walk", "idle", "rest", "work"],
    subjects: ["a heron standing in the shallows", "a hare sitting up", "a fox crossing the field", "a rabbit at the burrow", "ducks on the pond", "a hawk turning slowly", "a snail on a leaf", "a bat at dusk"],
    details: ["quite unafraid", "very near", "as if I were not there", "in the half-light", "so still", "for a long minute"],
    reactions: ["I held my breath", "I did not move", "I felt honoured", "I watched until it left", "it made my day", "I wanted to tell someone"] }),
  T({ id: "sound", skies: ["clear", "wind", "fog"],
    subjects: ["a bird I did not know", "the river's murmur", "frogs after rain", "crickets in the dusk", "someone humming", "a distant call", "the creak of the branches", "my own whistling"],
    details: ["from far off", "all at once", "in the quiet", "in the dark", "on the breeze", "close by"],
    reactions: ["I listened a long while", "I whistled back", "I felt soothed", "I sang along", "I tried to copy it", "it settled me"] }),
  T({ id: "touch", doings: ["rest", "idle", "talk", "work", "walk"],
    subjects: ["soft moss under my hand", "a smooth river stone", "warm bark", "cool clay", "the fur of a dog", "a child's hand in mine", "wool-soft grass", "a sun-warmed rock"],
    details: ["by chance", "as I passed", "without thinking", "for a long moment", "with my eyes shut", "gently"],
    reactions: ["I smiled", "I kept hold of it", "it comforted me", "I wondered at it", "I felt calm", "I did not want to let go"] }),
  T({ id: "smell", skies: ["clear", "rain", "fog", "wind"],
    subjects: ["wild herbs crushed underfoot", "pine in the warm", "smoke and roasting meat", "damp earth", "the sea-sweet river air", "new hay", "honey in the comb", "the first flowers"],
    details: ["on the breeze", "unexpectedly", "as I passed", "from far off", "sweet and strong", "that took me back"],
    reactions: ["I breathed it in", "it brought a memory back", "my mouth watered", "I stopped just to smell it", "I felt homesick for nothing", "I smiled"] }),
  T({ id: "play", companies: ["one", "group"], doings: ["idle", "rest", "walk", "talk"], bands: ["morning", "afternoon", "dusk"],
    subjects: ["a game of tag", "skipping stones", "a race to the tree", "a foolish dance", "a pile of leaves", "splashing in the shallows", "a snowball", "a made-up song"],
    details: ["with nothing at stake", "until we were out of breath", "like children", "in the sun", "for no reason", "and we laughed"],
    reactions: ["I felt twelve again", "I forgot to be careful", "I felt happy right through", "I wanted to do it again", "my sides hurt", "I felt light"] }),
  T({ id: "comfort-small", doings: ["rest", "sleep", "eat", "idle"], seasons: [3, 2],
    subjects: ["warm feet", "a dry shelter", "a full belly", "a heavy cloak", "a hot drink", "dry clothes", "a soft bed of bracken", "the end of the cold"],
    details: ["after being soaked", "when the wind howled outside", "at last", "after the long walk", "in the dark", "with the rain on the roof"],
    reactions: ["I did not know I could be so glad of so little", "I sighed", "I felt cared for", "I was thankful", "I felt snug", "I felt safe"] }),
];

const BANDS: Band[] = ["dawn", "morning", "noon", "afternoon", "dusk", "night"];
const SKIES: Sky[] = ["clear", "rain", "snow", "fog", "wind"];
const COMPANIES: Company[] = ["alone", "one", "group"];
const DOINGS: Doing[] = ["eat", "drink", "rest", "sleep", "walk", "work", "talk", "idle"];
const SEASONS: Season[] = [0, 1, 2, 3];

const fits = (t: Trigger, c: JoyContext) =>
  (!t.seasons || t.seasons.includes(c.season)) && (!t.bands || t.bands.includes(c.band)) && (!t.skies || t.skies.includes(c.sky)) &&
  (!t.companies || t.companies.includes(c.company)) && (!t.doings || t.doings.includes(c.doing)) && (!t.needsWarm || c.warm);

/** Every context a trigger can happen in. */
export function contextsFor(t: Trigger): JoyContext[] {
  const out: JoyContext[] = [];
  for (const season of SEASONS) for (const band of BANDS) for (const sky of SKIES) for (const company of COMPANIES) for (const doing of DOINGS) for (const warm of [false, true]) {
    const c = { season, band, sky, company, doing, warm };
    if (fits(t, c)) out.push(c);
  }
  return out;
}

/** How many distinct small moments the catalogue can produce (each a trigger, a context, and a noticed thing, detail and reaction). */
export function countJoys(): number {
  let total = 0;
  for (const t of TRIGGERS) total += contextsFor(t).length * t.subjects.length * t.details.length * t.reactions.length;
  return total;
}

/** The triggers that can happen now. */
export function joysFor(c: JoyContext): Trigger[] {
  return TRIGGERS.filter((t) => fits(t, c));
}

/** One moment, picked by a number in [0,1) three times over (which thing, which detail, which reaction), as a sentence in the first person. */
export function joyText(t: Trigger, a: number, b: number, d: number): string {
  const pick = <X>(list: X[], r: number) => list[Math.min(list.length - 1, Math.floor(r * list.length))]!;
  const s = pick(t.subjects, a);
  return `${s[0]!.toUpperCase()}${s.slice(1)}, ${pick(t.details, b)}: ${pick(t.reactions, d)}.`;
}
