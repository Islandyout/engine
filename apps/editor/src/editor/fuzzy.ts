// Fuzzy matching for the editor's search boxes (models, components, games,
// commands) and the inspector's property filter. Case-insensitive; a match
// at the start of the text or of a word ranks above one inside a word, and
// a contiguous match above letters scattered through the text.

const wordStart = (text: string, i: number) => i === 0 || /[\s_\-./(]/.test(text[i - 1]!) || (/[a-z]/.test(text[i - 1]!) && /[A-Z]/.test(text[i]!));

// Past this many characters a text is prose, not a name.
const LONG_TEXT = 32;

// How well `query` matches `text`: higher is better, -1 is no match. An
// empty query matches everything equally (0).
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const lower = text.toLowerCase();
  // Every word of the query has to match somewhere.
  const words = q.split(/\s+/);
  if (words.length > 1) {
    let total = 0;
    for (const word of words) {
      const s = fuzzyScore(word, text);
      if (s < 0) return -1;
      total += s;
    }
    return total / words.length;
  }
  if (lower === q) return 1000;
  const at = lower.indexOf(q);
  if (at >= 0) {
    // Contiguous: best at the start, then at a word start, then inside.
    const start = at === 0 ? 300 : wordStart(text, at) ? 200 : 100;
    return start + 100 * (q.length / lower.length);
  }
  // Long text (a description, a sentence) matches only where the query
  // appears in it: letters scattered over a paragraph match almost anything.
  if (text.length > LONG_TEXT) return -1;
  // An acronym: every letter starts a word ("cc" for CharacterController),
  // ranked between a word-start match and one inside a word.
  const starts = [...text].map((_, k) => k).filter((k) => wordStart(text, k));
  let w = 0;
  for (const ch of q) {
    while (w < starts.length && lower[starts[w]!] !== ch) w++;
    if (w++ >= starts.length) {
      w = -1;
      break;
    }
  }
  if (w >= 0) return 150 + q.length;
  // Letters in order with gaps: scored by how many land on word starts and
  // how tightly they sit.
  let i = 0;
  let score = 0;
  let last = -1;
  for (const ch of q) {
    const found = lower.indexOf(ch, i);
    if (found < 0) return -1;
    score += wordStart(text, found) ? 8 : 1;
    if (last >= 0) score -= Math.min(found - last - 1, 5);
    last = found;
    i = found + 1;
  }
  return Math.max(1, score);
}

// The items matching `query`, best first (ties keep their original order).
export function fuzzyRank<T>(items: readonly T[], query: string, text: (item: T) => string | string[]): T[] {
  if (!query.trim()) return [...items];
  const scored: { item: T; score: number; order: number }[] = [];
  items.forEach((item, order) => {
    const texts = text(item);
    const score = Math.max(...(Array.isArray(texts) ? texts : [texts]).map((t) => fuzzyScore(query, t)));
    if (score >= 0) scored.push({ item, score, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map((s) => s.item);
}
