/** Local, deterministic relevance ranking for a teammate's private memory and
 * past conversation text. No model, no network. This is keyword-ranked
 * retrieval: when the owner connects an embeddings endpoint, embeddings.ts
 * blends meaning similarity with these scores and falls back here on any
 * failure, so this ranking is always the safe baseline. */

const STOPWORDS = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is", "are", "was", "were", "be", "been", "it", "this", "that", "at", "as", "by", "from", "my", "you", "your", "i", "me", "we", "if", "then", "so", "do", "does", "did", "not", "but", "please", "can", "could", "would", "should", "will", "just", "about", "how", "what", "when", "where", "get", "put", "use", "make", "made"]);

function tokens(text: string) {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9']{1,}/g) || [])
    .map((word) => word.replace(/'/g, ""))
    .filter((word) => word.length >= 2 && !STOPWORDS.has(word));
}

function frequency(terms: string[], term: string) {
  let count = 0;
  for (const known of terms) if (known === term) count += 1;
  return count;
}

function tokensForQuery(raw: string) {
  const seen = new Set<string>();
  const queryWords = tokens(raw).slice(0, 12);
  return queryWords.filter((word) => {
    if (seen.has(word)) return false;
    seen.add(word);
    return true;
  });
}

export type Scored<T> = { item: T; score: number };

/** Rank candidates against a query: term overlap with rarity weighting,
 * phrase bonus, and an optional per-item weight (for key/title emphasis).
 * Zero-score items are dropped; ordering is deterministic (score, then position). */
export function rankTexts<T extends { text: string; weight?: number }>(
  query: string,
  items: T[],
  limit: number,
): Array<Scored<T>> {
  const queryTerms = tokensForQuery(query);
  if (!queryTerms.length) return [];
  const documentTerms = items.map((item) => tokens(item.text));
  const phrases: string[] = [];
  for (let index = 0; index < queryTerms.length - 1; index += 1) phrases.push(`${queryTerms[index]} ${queryTerms[index + 1]!}`);
  const scored: Array<Scored<T>> = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const terms = documentTerms[index]!;
    let score = 0;
    for (const term of queryTerms) {
      const documents = documentTerms.filter((candidate) => candidate.includes(term)).length;
      const idf = 1 / (1 + Math.max(documents - 1, 0) * 0.15);
      score += frequency(terms, term) * idf;
    }
    if (phrases.length && phrases.some((phrase) => item.text.toLowerCase().includes(phrase))) score *= 1.5;
    score *= item.weight ?? 1;
    if (score > 0) scored.push({ item, score: Math.round(score * 100) / 100 });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export type MemoryNote = { key: string; content: string };

export type RankedMemory<T extends MemoryNote> = T & { score: number };

/** Rank private memory notes by relevance to a query. A note missing one query
 * word is no longer hidden, unlike the previous all-words-must-appear filter:
 * a rare shared term can be the more meaningful match. */
export function rankMemories<T extends MemoryNote>(query: string, notes: T[], limit = 12): Array<RankedMemory<T>> {
  return rankTexts(
    query,
    notes.map((note) => ({ item: note, text: `${note.key}\n${note.content}`, weight: 1 })),
    limit,
  ).map(({ item, score }) => ({ ...item.item, score }));
}

/** Similarity check for consolidation proposals, never silent merges. */
export function nearDuplicateNote(query: string, notes: MemoryNote[]): MemoryNote | null {
  const queryTokens = new Set(tokens(query));
  if (queryTokens.size < 3) return null;
  for (const note of notes) {
    const noteTokens = new Set(tokens(`${note.key} ${note.content}`));
    if (!noteTokens.size) continue;
    const overlap = [...queryTokens].filter((token) => noteTokens.has(token)).length / Math.min(queryTokens.size, noteTokens.size);
    if (overlap >= 0.8) return note;
  }
  return null;
}
