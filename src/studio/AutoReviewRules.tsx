import { useEffect, useState } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import type { AutoReviewRule, AutoReviewScope, AutoReviewEffect } from "../shared/auto-review";

const SCOPE_LABELS: Record<AutoReviewScope, string> = {
  command: "Terminal commands (isolated computer)",
  prompt: "Starting a task",
  browser: "Browser actions",
};

export function AutoReviewRules() {
  const [rules, setRules] = useState<AutoReviewRule[]>([]);
  const [effect, setEffect] = useState<AutoReviewEffect>("require_approval");
  const [scope, setScope] = useState<AutoReviewScope>("command");
  const [pattern, setPattern] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    void fetch("/api/auto-review")
      .then((response) => response.json())
      .then((data) => setRules(Array.isArray(data?.rules) ? data.rules : []))
      .catch(() => setNotice("Rules could not be loaded. Try again."));
  }, []);
  const save = async () => {
    if (!pattern.trim() || busy) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/auto-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ effect, scope, pattern }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "That rule could not be saved.");
      setRules((current) => [data as AutoReviewRule, ...current]);
      setPattern("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "That rule could not be saved.");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/auto-review/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("That rule is already gone.");
      setRules((current) => current.filter((rule) => rule.id !== id));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "That rule could not be removed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auto-review-rules">
      <div className="auto-review-intro">
        <ShieldCheck size={15} />
        <span>
          <strong>Auto Review</strong>
          <small>
            Rules decided before actions run. <b>Require approval</b> always stops
            matching work for your decision. <b>Always allow</b> can skip one of
            OpenBot’s own review prompts for a narrowly matched isolated command;
            it never waives a detector or creates new permission. If both match,
            Require approval wins. Patterns are case-insensitive text with <code>*</code> as any run of characters.
          </small>
        </span>
      </div>
      <form
        className="auto-review-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <select aria-label="Rule effect" value={effect} onChange={(event) => setEffect(event.target.value as AutoReviewEffect)}>
          <option value="require_approval">Require approval</option>
          <option value="always_allow">Always allow (isolated commands only)</option>
        </select>
        <select aria-label="Rule scope" value={scope} onChange={(event) => setScope(event.target.value as AutoReviewScope)}>
          {(Object.keys(SCOPE_LABELS) as AutoReviewScope[]).map((key) => (
            <option key={key} value={key}>
              {SCOPE_LABELS[key]}
            </option>
          ))}
        </select>
        <input
          value={pattern}
          onChange={(event) => setPattern(event.target.value)}
          placeholder='e.g. require approval for "rm *" commands'
          aria-label="Matching pattern"
        />
        <button disabled={busy || !pattern.trim()} aria-label="Save rule">
          <Plus size={14} /> Add
        </button>
      </form>
      {notice && <p className="auto-review-notice">{notice}</p>}
      {rules.length ? (
        <ul className="auto-review-list">
          {rules.map((rule) => (
            <li key={rule.id}>
              <span className={`auto-review-effect ${rule.effect}`}>{rule.effect === "require_approval" ? "Review" : "Allow"}</span>
              <code>{rule.pattern}</code>
              <small>{SCOPE_LABELS[rule.scope]}</small>
              <button aria-label={`Delete rule ${rule.pattern}`} disabled={busy} onClick={() => void remove(rule.id)}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="quiet-copy">No rules yet. Ordinary checks still apply everywhere.</p>
      )}
    </div>
  );
}
