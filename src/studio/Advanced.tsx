import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import "./advanced.css";

/** Apple-style progressive disclosure: core UI stays minimal, everything
 * beyond daily needs lives behind one quiet "Advanced" row that expands
 * inline. Painted styles only — no blur, filter or shadow. */
export function Advanced({
  title = "Advanced",
  summary,
  children,
}: {
  title?: string;
  summary?: string;
  children: ReactNode;
}) {
  return (
    <details className="advanced-disclosure">
      <summary>
        <span>
          {title}
          {summary && <small>{summary}</small>}
        </span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="advanced-content">{children}</div>
    </details>
  );
}
