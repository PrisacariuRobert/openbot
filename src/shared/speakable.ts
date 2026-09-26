/** Markdown to something pleasant to hear: no symbols, no raw links. */
export function speakable(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " (there's code in the chat) ")
    // Headings and list items become sentences, so the voice pauses.
    .replace(/^(\s*(?:#{1,6}|[-*•]|\d+[.)])\s+.*?)([.!?:;])?\s*$/gm, (_line, body: string, end?: string) => `${body}${end || "."}`)
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "a link")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/[*_`>|~]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}
