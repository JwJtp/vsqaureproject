// Pure helpers for knowledge chunking and lexical (BM25) retrieval. No server deps so it is testable.

export function chunkText(text: string, maxChars = 700, overlap = 120): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  if (!clean) return [];
  const paras = clean.split(/\n{2,}|(?<=[.!?।])\s+/);
  const chunks: string[] = [];
  let cur = "";
  for (const p of paras) {
    if ((cur + " " + p).length > maxChars && cur) {
      chunks.push(cur.trim());
      cur = cur.slice(Math.max(0, cur.length - overlap)) + " " + p;
    } else cur = cur ? cur + " " + p : p;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

const STOP = new Set(
  "a an the is are was were be to of in on for and or with at by from this that it as do does any your you we our i me my what which how when where can please tell about details".split(" "),
);

export function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

export interface Scored<T> {
  item: T;
  score: number;
}

/** BM25 ranking over a small in-memory corpus. */
export function bm25<T>(query: string, docs: T[], text: (d: T) => string, k1 = 1.4, b = 0.75): Scored<T>[] {
  const q = [...new Set(tokenize(query))];
  if (!q.length || !docs.length) return [];
  const toks = docs.map((d) => tokenize(text(d)));
  const avg = toks.reduce((s, t) => s + t.length, 0) / toks.length || 1;
  const df = new Map<string, number>();
  for (const t of toks) for (const w of new Set(t)) df.set(w, (df.get(w) ?? 0) + 1);
  const N = docs.length;
  return docs
    .map((item, i) => {
      const tf = new Map<string, number>();
      for (const w of toks[i]) tf.set(w, (tf.get(w) ?? 0) + 1);
      let score = 0;
      for (const w of q) {
        const f = tf.get(w);
        if (!f) continue;
        const idf = Math.log(1 + (N - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks[i].length) / avg)));
      }
      return { item, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b2) => b2.score - a.score);
}
