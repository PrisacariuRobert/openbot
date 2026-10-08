import { useState } from "react";
import type { CommunitySkill } from "../shared/extensions";
import type { FileDiff, SkillFlag } from "../shared/skill-trust";
import "./skill-trust.css";

/** Task T4: the lines worth reading before adding or updating a skill. */
export function SkillFlags({ flags }: { flags: SkillFlag[] }) {
  if (!flags.length) return <p className="skill-flags-none">Nothing in it sends data out, downloads code or asks the teammate to hide things.</p>;
  return (
    <div className="skill-flags" role="group" aria-label="Lines to read before adding">
      <strong>{flags.length} {flags.length === 1 ? "line" : "lines"} to read first</strong>
      <ul>
        {flags.map((flag, index) => (
          <li key={index} className={flag.blocks ? "blocks" : undefined}>
            <span>{flag.reason}{flag.blocks ? " It can't be added." : ""}</span>
            <code>{flag.file}, line {flag.line}: {flag.text}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface UpdateCheck {
  available: boolean; reason?: string; upToDate?: boolean;
  preview?: { files: Record<string, string>; source: string; digest: string; blockers: string[]; flags: SkillFlag[] };
  diff?: FileDiff[]; scriptsChanged?: boolean;
}

/** Scripts stay off until the owner turns them on, and an update shows exactly what changes. */
export function SkillTrustControls({ skill, botName, request, run }: {
  skill: CommunitySkill; botName: string;
  request: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  run: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [check, setCheck] = useState<UpdateCheck | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const scripts = skill.scripts ?? [];
  const fromWeb = /^https:\/\//.test(skill.source);
  if (skill.bundled) return null;
  return (
    <div className="skill-trust">
      {skill.tampered && <p role="alert" className="skill-trust-alert">This skill's files changed since you added it, so teammates can't use it. Remove it and add it again.</p>}
      {scripts.length > 0 && !skill.tampered && (
        <div className="skill-trust-row">
          <span>{scripts.length} {scripts.length === 1 ? "script" : "scripts"} · <strong>{skill.scriptsEnabled ? "on" : "off"}</strong>{skill.scriptsEnabled ? ". They run only in a teammate's own computer, never on your Mac." : ". Teammates can't read or run them."}</span>
          <button type="button" className="skill-action-btn" onClick={() => {
            const enabled = !skill.scriptsEnabled;
            if (enabled && !window.confirm(`Turn on ${scripts.length === 1 ? "this skill's script" : `this skill's ${scripts.length} scripts`}?\n\n${scripts.join("\n")}\n\nThey run only in a teammate's own computer (its container), never on your Mac, and each command still follows the approval rules. Read them first under "Read the scripts".`)) return;
            void run(() => request(`/skills/${skill.id}/scripts`, "PATCH", { enabled, digest: skill.digest }), enabled ? "Scripts turned on." : "Scripts turned off.");
          }}>{skill.scriptsEnabled ? "Turn scripts off" : "Turn scripts on"}</button>
        </div>
      )}
      {scripts.length > 0 && (
        <details className="skill-trust-scripts">
          <summary>Read the scripts</summary>
          {scripts.map((file) => <div key={file}><h6>{file}</h6><pre>{skill.files[file]}</pre></div>)}
        </details>
      )}
      {fromWeb && !skill.tampered && (
        <div className="skill-trust-row">
          <span>Pinned to the version you reviewed. Updates are never installed on their own.</span>
          <button type="button" className="skill-action-btn" disabled={checking} onClick={() => {
            setChecking(true); setError(""); setCheck(null);
            request<UpdateCheck>(`/skills/${skill.id}/check-update`, "POST", {})
              .then(setCheck)
              .catch((cause) => setError(cause instanceof Error ? cause.message : "The source couldn't be checked."))
              .finally(() => setChecking(false));
          }}>{checking ? "Checking…" : "Check for an update"}</button>
        </div>
      )}
      {error && <p role="alert" className="skill-trust-alert">{error}</p>}
      {check && (check.upToDate ? <p role="status" className="skill-trust-ok">Up to date: the source matches the version you reviewed.</p>
        : !check.available ? <p role="status">{check.reason}</p>
          : check.preview && check.diff && (
            <section className="skill-update" aria-label="What the update changes">
              <h6>What the update changes</h6>
              {check.diff.map((file) => (
                <details key={file.file} open={check.diff!.length <= 3}>
                  <summary>{file.file} <span>{file.status === "added" ? "new file" : file.status === "removed" ? "removed" : `+${file.added} −${file.removed}`}</span></summary>
                  <pre>{file.lines.map((line, index) => <span key={index} className={`diff-${line.kind}`}>{line.kind === "added" ? "+ " : line.kind === "removed" ? "− " : "  "}{line.text}{"\n"}</span>)}</pre>
                </details>
              ))}
              <SkillFlags flags={check.preview.flags} />
              {check.scriptsChanged && skill.scriptsEnabled && <p>Its scripts change, so they'll be turned off until you turn them on again.</p>}
              {check.preview.blockers.length > 0
                ? <p role="alert" className="skill-trust-alert">{check.preview.blockers[0]} The update can't be installed.</p>
                : <button type="button" className="button-primary" onClick={() => void run(async () => {
                  await request(`/skills/${skill.id}/update`, "POST", { bundle: { files: check.preview!.files, source: check.preview!.source }, digest: check.preview!.digest });
                  setCheck(null);
                }, `Updated for ${botName} and everyone else using it.`)}>Update to this version</button>}
            </section>
          ))}
    </div>
  );
}
