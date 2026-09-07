// Discovery is not an access check. A wording mismatch must not tell an agent
// that an installed/granted capability does not exist. Return a ranked bounded
// fallback and explicitly distinguish it from a matching result.
export function rankExtensions<T>(items: T[], query: string, describe: (item: T) => string) {
  const normalize = (text: string) => text.toLowerCase().replace(/[_-]/g, " ");
  const words = [...new Set(normalize(query).match(/[\p{L}\p{N}]{2,}/gu) || [])].slice(0, 12);
  const ranked = items.map((item, index) => {
    const text = normalize(describe(item));
    return { item, index, score: words.filter((word) => text.includes(word)).length };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
  return { items: ranked.map(({ item }) => item), matched: !words.length || ranked.some(({ score }) => score > 0) };
}
