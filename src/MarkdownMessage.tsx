import { Children, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Attachment } from "./shared/types";

function highlightMentions(children: ReactNode) {
  return Children.map(children, (child) => {
    if (typeof child !== "string") return child;
    return child.split(/(@[\p{L}\p{N}_-]+)/gu).map((part, index) => part.startsWith("@") ? <mark key={`${part}-${index}`}>{part}</mark> : part);
  });
}

export function MarkdownMessage({ body, attachments = [] }: { body: string; attachments?: Attachment[] }) {
  const attachmentHref = (href: string | undefined) => {
    if (!href || /^[a-z]+:\/\//i.test(href) || href.startsWith("/api/")) return href;
    let candidate = href.split(/[?#]/)[0]!.split("/").at(-1) || href;
    try { candidate = decodeURIComponent(candidate); } catch { /* keep the literal name */ }
    return attachments.find((attachment) => attachment.source === "artifact" && attachment.name === candidate)?.url || href;
  };
  return <ReactMarkdown skipHtml remarkPlugins={[remarkGfm]} components={{
    p: ({ children }) => <p>{highlightMentions(children)}</p>,
    li: ({ children }) => <li>{highlightMentions(children)}</li>,
    a: ({ href, children }) => <a href={attachmentHref(href)} target="_blank" rel="noreferrer">{children}</a>,
  }}>{body}</ReactMarkdown>;
}
