import { useEffect, useRef, useState } from "react";
import { BookOpen, Cable, Check, Download, LoaderCircle, Plus, Search, Trash2, Upload } from "lucide-react";
import type { Bot } from "../shared/types";
import type { CommunitySkill, McpConnection } from "../shared/extensions";
import type { PrivateMemory } from "../shared/private-memory";
import "./extensions-panel.css";

async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api/extensions${path}`, { method, headers: body === undefined ? {} : { "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not finish that request.");
  return result;
}
type Preview = Omit<CommunitySkill, "id" | "botIds" | "installedAt">;

export function ExtensionsPanel({ bots, skillsOnly = false, selectedBotId }: { bots: Bot[]; skillsOnly?: boolean; selectedBotId?: string }) {
  const [tab, setTab] = useState<"connections" | "skills" | "memory">(skillsOnly ? "skills" : "connections");
  const [state, setState] = useState<{ connections: McpConnection[]; skills: CommunitySkill[]; oauth?: { hostOnly: boolean } }>({ connections: [], skills: [] });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [localBotId, setBotId] = useState(bots[0]?.id || "");
  const botId = selectedBotId ?? localBotId;
  const [skillSearch, setSkillSearch] = useState("");
  const [name, setName] = useState(""), [url, setUrl] = useState(""), [token, setToken] = useState(""), [loopback, setLoopback] = useState(false);
  const [mode, setMode] = useState<"http" | "stdio">("http"); const [command, setCommand] = useState(""); const [argsText, setArgsText] = useState(""); const [envText, setEnvText] = useState("");
  const [source, setSource] = useState(""), [markdown, setMarkdown] = useState(""), [preview, setPreview] = useState<Preview | null>(null);
  const skillFile = useRef<HTMLInputElement>(null);
  const [memories, setMemories] = useState<PrivateMemory[]>([]), [memoryKey, setMemoryKey] = useState(""), [memoryText, setMemoryText] = useState("");
  const [memoryRevision, setMemoryRevision] = useState<string | undefined>(), [memoryExpiry, setMemoryExpiry] = useState("");
  useEffect(() => { setMemories([]); setMemoryKey(""); setMemoryText(""); setMemoryRevision(undefined); setMemoryExpiry(""); }, [botId]);
  const load = async () => setState(await request(""));
  useEffect(() => { void load().catch((error) => setError(String(error.message))); }, []);
  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("extensionSignIn");
    if (status === "ready") setNotice("Signed in. Check the connection, then choose which tools to share.");
    if (status === "retry") setError("Sign-in could not be verified. Try again from the connection below.");
    const refresh = () => void load().catch(() => undefined);
    window.addEventListener("focus", refresh); return () => window.removeEventListener("focus", refresh);
  }, []);
  useEffect(() => {
    let active = true;
    if (tab === "memory" && botId) void request<PrivateMemory[]>(`/memory/${encodeURIComponent(botId)}`).then((notes) => { if (active) setMemories(notes); }).catch((error) => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [tab, botId, notice]);
  const run = async (work: () => Promise<unknown>, message = "Saved.") => {
    setBusy(true); setError(""); setNotice("");
    try { await work(); await load(); setNotice(message); }
    catch (error) { setError(error instanceof Error ? error.message : "Could not finish that request."); }
    finally { setBusy(false); }
  };
  return <section className={`extensions-panel ${skillsOnly ? "included-library" : ""}`} aria-label="Open extensions">
    <header><div><span className="extension-eyebrow">Made to work your way</span><h3>{skillsOnly ? "Ready-to-use skills" : "Tools, skills & memory"}</h3><p>{skillsOnly ? "Useful methods, already here. Your teammates choose the right one for your task." : "Use an included skill, add an open connection, or correct what a teammate remembers."}</p></div><Cable size={24} aria-hidden="true" /></header>
    {!skillsOnly && <nav aria-label="Extension sections">{([['connections', 'Connections'], ['skills', 'Skills'], ['memory', 'Memory']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={tab === id} onClick={() => { setTab(id); setError(""); setNotice(""); }}>{label}</button>)}</nav>}
    {selectedBotId === undefined && <label className="extension-teammate">Teammate<select value={botId} onChange={(event) => { setBotId(event.target.value); }}>{bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label>}
    {error && <p role="alert" className="extension-error">{error}</p>}{notice && <p role="status" className="extension-notice"><Check size={16} />{notice}</p>}
    <fieldset disabled={busy || !botId}>
    {tab === "connections" && <>
      <p>Use a service’s own sign-in or access token, or run a community MCP server as a local command on the host. Browser sign-in works with MCP services that offer public-client registration. Other services may require their own integration. A local command server starts when this connection is used and can read the files it is given; choose those commands carefully.</p>
      {state.oauth?.hostOnly && <p>For this local studio, finish browser sign-in on the Mac running OpenBot. The phone can use the connection once you share its tools.</p>}
      {state.connections.map((connection) => <article className="extension-card" key={connection.id}>
        <div className="extension-card-heading"><div><h4>{connection.name}</h4><p>{connection.transport === "stdio" ? `stdio · ${connection.command} ${(connection.args || []).join(" ")}` : connection.url}</p><small>{connection.lastUsedAt ? "Used successfully · " : ""}{connection.checkedAt ? `${connection.tools.length} tools discovered · account access is checked when used` : "Saved · not checked yet"}{connection.transport === "stdio" ? " · local command" : ""}</small></div>
          <button type="button" aria-label={`Remove ${connection.name}`} onClick={() => { if (window.confirm(`Remove ${connection.name} and revoke every teammate's access?`)) void run(() => request(`/mcp/${connection.id}`, "DELETE"), "Connection removed. Access revoked."); }}><Trash2 size={16} /></button></div>
        <button type="button" onClick={() => void run(() => request(`/mcp/${connection.id}/check`, "POST"), "Tools checked. Review access below; changed tools lose their old permissions.")}><Search size={15} />Check connection</button>
        <button type="button" disabled={state.oauth?.hostOnly && !["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname)} onClick={() => {
          if ((connection.hasToken || connection.checkedAt) && !window.confirm("Sign in again? Existing credentials and teammate tool permissions will be cleared first.")) return;
          void run(async () => { const result = await request<{ url: string }>(`/mcp/${connection.id}/oauth`, "POST"); window.location.assign(result.url); }, "Opening the service’s sign-in…");
        }}>{connection.authMode === "oauth" ? "Sign in again" : "Sign in with this service"}</button>
        {connection.authMode === "oauth" && <button type="button" onClick={() => { if (window.confirm("Disconnect this sign-in and revoke all teammate tool access?")) void run(() => request(`/mcp/${connection.id}/oauth`, "DELETE"), "Disconnected. Tool access revoked."); }}>Disconnect sign-in</button>}
        {connection.tools.length > 0 && <details><summary>Choose tools for {bots.find((bot) => bot.id === botId)?.name}</summary><p>Start with “Ask each time.” Use “Read without asking” only for tools you have verified cannot change anything. Server labels are not a security guarantee.</p>
          {connection.tools.map((tool) => <div className="extension-tool" key={tool.name}><div><strong>{tool.name}</strong><p>{tool.description}</p><details><summary>Tool inputs</summary><pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre></details></div>
            <select aria-label={`${tool.name} access`} value={connection.grants[botId]?.[tool.name] || "off"} onChange={(event) => {
              const grants = { ...connection.grants[botId] };
              if (event.target.value === "off") delete grants[tool.name]; else grants[tool.name] = event.target.value as "ask" | "read";
              void run(() => request(`/mcp/${connection.id}/access`, "PATCH", { botId, grants }), "Access updated. Waiting calls will be rechecked.");
            }}><option value="off">Off</option><option value="ask">Ask each time</option><option value="read">Read without asking</option></select></div>)}
        </details>}
      </article>)}
      <details className="extension-add"><summary><Plus size={16} />Add a custom connection</summary>
        {mode === "stdio" && <div className="extension-starters">
          <small>Community starters from the open MCP catalog (modelcontextprotocol/servers, MIT · <a href="https://github.com/NousResearch/hermes-agent/tree/main/optional-mcps" target="_blank" rel="noreferrer">Hermes optional MCPs</a> list many services) — each pre-fills the form; review the command before saving:</small>
          {([["Filesystem tools", "Filesystem tools\nnpx\n-y\n@modelcontextprotocol/server-filesystem\n/some/folder"], ["Everything demo tools", "Everything demo tools\nnpx\n-y\n@modelcontextprotocol/server-everything"], ["Memory graph", "Memory graph\nnpx\n-y\n@modelcontextprotocol/server-memory"]] as const).map(([label, prefilled]) => (
            <button type="button" key={label} onClick={() => { const [starterName, starterCommand, ...rest] = prefilled.split("\n"); setName(name || starterName); setCommand(starterCommand); setArgsText(rest.join("\n")); }}>{label}</button>
          ))}
        </div>}
        <form onSubmit={(event) => {
          event.preventDefault();
          const args = argsText.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
          const env = Object.fromEntries(envText.split(/\r?\n/).map((line) => line.split("=", 2)).filter(([key, value]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test((key || "").trim()) && value !== undefined).map(([key, value]) => [key.trim(), value]));
          void run(async () => {
            await request("/mcp", "POST", mode === "stdio"
              ? { name, transport: "stdio", command, args, env }
              : { name, url, token, allowLoopback: loopback });
            setName(""); setUrl(""); setToken(""); setCommand(""); setArgsText(""); setEnvText("");
          }, "Connection saved. Check it, then choose which tools to share.");
        }}>
          <label>Name<input value={name} maxLength={80} required placeholder="My project tools" onChange={(event) => setName(event.target.value)} /></label>
          <label>Connection type<select value={mode} onChange={(event) => setMode(event.target.value === "stdio" ? "stdio" : "http")}>
            <option value="http">HTTP service (browser sign-in or token)</option>
            <option value="stdio">Local command (community MCP server)</option>
          </select></label>
          {mode === "http" ? <>
            <label>Service endpoint<input value={url} type="url" required placeholder="https://service.example/mcp" onChange={(event) => setUrl(event.target.value)} /></label>
            <label>Access token <small>optional · encrypted on your host</small><input value={token} type="password" autoComplete="new-password" onChange={(event) => setToken(event.target.value)} /></label>
            <label className="extension-check"><input type="checkbox" checked={loopback} onChange={(event) => setLoopback(event.target.checked)} />Allow a service on this host at 127.0.0.1</label>
          </> : <>
            <label>Command <small>plain executable path or name</small><input value={command} required maxLength={256} placeholder="npx" onChange={(event) => setCommand(event.target.value)} /></label>
            <label>Arguments <small>one per line</small><textarea rows={3} value={argsText} onChange={(event) => setArgsText(event.target.value)} placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/some/folder"} /></label>
            <label>Environment variables <small>one KEY=value per line</small><textarea rows={3} value={envText} onChange={(event) => setEnvText(event.target.value)} placeholder="SOME_KEY=some-value" /></label>
          </>}
          <button className="extension-primary" type="submit"><Plus size={16} />Save connection</button>
        </form>
      </details>
    </>}
    {tab === "skills" && <>
      <label className="app-search"><Search size={16} /><input type="search" aria-label="Find a skill" placeholder="Find a skill" value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} /></label>
      <p>Included skills are ready for every teammate, including new ones. Turn any off below. They add useful methods—not account access or new software. You can also review and add your own.</p>
      {state.skills.filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(skillSearch.toLowerCase())).map((skill) => <article className="extension-card" key={skill.id}><div className="extension-card-heading"><div><h4><BookOpen size={16} />{skill.name.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())}</h4><p>{skill.description}</p><small>{skill.bundled ? "Included · " : "Imported · "}{skill.license} · pinned {skill.digest.slice(0, 10)}</small></div><div className="extension-actions"><button type="button" aria-label={`Share ${skill.name}`} onClick={() => void run(async () => {
          const shared = await request<{ kind: string; version: number; name: string; bundle: { files: Record<string, string>; source: string } }>(`/skills/${skill.id}/share`);
          const url = URL.createObjectURL(new Blob([`${JSON.stringify(shared, null, 2)}\n`], { type: "application/json" }));
          const link = document.createElement("a");
          link.href = url; link.download = `${shared.name}.openbot-skill.json`;
          document.body.appendChild(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1_000);
        }, "Skill file downloaded. The importer reviews the exact bundle before installing.")}><Download size={16} /></button><button type="button" aria-label={`${skill.bundled ? "Disable" : "Remove"} ${skill.name}`} onClick={() => { if (window.confirm(skill.bundled ? `Disable ${skill.name} for current and future teammates? You can re-enable it for a teammate below.` : `Remove ${skill.name} from this studio?`)) void run(() => request(`/skills/${skill.id}`, "DELETE"), skill.bundled ? "Skill disabled. You can re-enable it for any teammate." : "Skill removed."); }}><Trash2 size={16} /></button></div></div>
        <label className="extension-check"><input type="checkbox" checked={skill.botIds.includes(botId)} onChange={(event) => void run(() => request(`/skills/${skill.id}/access`, "PATCH", { botIds: event.target.checked ? [...skill.botIds, botId] : skill.botIds.filter((id) => id !== botId) }), "Skill access updated.")} />Available to {bots.find((bot) => bot.id === botId)?.name}</label>
        <details><summary>Reviewed source & instructions</summary><p>{skill.source}</p><pre>{skill.instructions}</pre></details>
      </article>)}
      {skillSearch && !state.skills.some((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(skillSearch.toLowerCase())) && <p>No matching skills. Try another name.</p>}
      <details className="extension-add"><summary><Plus size={16} />Review a community skill</summary>
        <form onSubmit={(event) => { event.preventDefault(); void run(async () => setPreview(await request<Preview>("/skills/fetch", "POST", { url: source })), "Downloaded for review. Not installed yet."); }}><label>Raw SKILL.md address<input type="url" required value={source} placeholder="https://raw.githubusercontent.com/…/SKILL.md" onChange={(event) => { setSource(event.target.value); setPreview(null); }} /></label><button type="submit">Load from URL</button></form>
        <div className="extension-divider">or open a shared skill file</div>
        <input ref={skillFile} type="file" className="visually-hidden" accept=".json,application/json" onChange={(event) => {
          const file = event.target.files?.[0];
          if (skillFile.current) skillFile.current.value = "";
          if (!file) return;
          void run(async () => {
            if (file.size > 256_000) throw new Error("That skill file is too large. Choose one under 256 KB.");
            const shared = JSON.parse(await file.text()) as { kind?: unknown; bundle?: unknown };
            if (shared.kind !== "openbot-skill" || !shared.bundle) throw new Error("That file is not an OpenBot skill file.");
            setPreview(await request<Preview>("/skills/inspect", "POST", shared.bundle));
          }, "Shared skill loaded for review. Not installed yet.");
        }} />
        <button type="button" onClick={() => skillFile.current?.click()}><Upload size={15} />Open shared file</button>
        <div className="extension-divider">or paste a self-contained SKILL.md</div>
        <label>Skill contents<textarea rows={7} value={markdown} placeholder={'---\nname: meeting-review\ndescription: Review meeting notes\n---\nYour instructions…'} onChange={(event) => { setMarkdown(event.target.value); setPreview(null); }} /></label>
        <button type="button" disabled={!markdown.trim()} onClick={() => void run(async () => setPreview(await request<Preview>("/skills/inspect", "POST", { files: { "SKILL.md": markdown }, source: "Manually provided by the studio owner" })), "Ready to review. Not installed yet.")}>Review pasted skill</button>
        {preview && <div className="extension-review"><h4>{preview.name}</h4><p>{preview.description}</p><small>{preview.license} · {Object.keys(preview.files).length} files</small><ul>{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}{preview.blockers.map((blocker) => <li className="extension-error" key={blocker}>{blocker}</li>)}</ul><details><summary>Read the exact bundle</summary>{Object.entries(preview.files).map(([file, content]) => <div key={file}><h4>{file}</h4><pre>{content}</pre></div>)}</details><button type="button" className="extension-primary" disabled={preview.blockers.length > 0} onClick={() => void run(async () => { await request("/skills", "POST", { bundle: { files: preview.files, source: preview.source }, digest: preview.digest, botIds: [botId] }); setPreview(null); setMarkdown(""); }, "Reviewed skill installed for this teammate.")}>Approve & add skill</button></div>}
      </details>
    </>}
    {tab === "memory" && <>
      <p>Your corrections are protected. Task-learned notes expire after 30 days unless you change that here. Expired or conflicting notes are excluded from new-task context; past chats and running tasks are not erased.</p>
      {memories.length === 0 && <p className="extension-empty">No saved notes yet. Add a preference you want this teammate to remember.</p>}
      <button type="button" onClick={() => void run(async () => { setMemories(await request<PrivateMemory[]>(`/memory/${encodeURIComponent(botId)}`)); }, "Notes refreshed. Choose Edit for the latest version.")}>Refresh notes</button>
      {memories.map((note) => <article className="extension-card" key={note.key}><h4>{note.key}</h4><p>{note.content}</p><small>{note.source === "owner" ? "Set by you · protected" : note.source === "task" ? "Learned in a task" : "Older saved note · protected"}{note.expiresAt ? ` · ${note.expired ? "Expired" : "Expires"} ${new Date(note.expiresAt).toLocaleString()}` : " · No expiry"}{note.conflict ? " · Conflicting note: review before use" : ""}</small><div className="extension-actions"><button type="button" onClick={() => { setMemoryKey(note.key); setMemoryText(note.content); setMemoryRevision(note.revision); setMemoryExpiry(note.expiresAt ? new Date(Date.parse(note.expiresAt) - new Date(note.expiresAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""); }}>Edit</button><button type="button" onClick={() => void run(() => request(`/memory/${encodeURIComponent(botId)}`, "DELETE", { key: note.key, expectedRevision: note.revision }), "Memory removed from future tasks.")}><Trash2 size={15} />Forget</button></div></article>)}
      <form onSubmit={(event) => { event.preventDefault(); void run(async () => { await request(`/memory/${encodeURIComponent(botId)}`, "PATCH", { key: memoryKey, content: memoryText, ...(memoryRevision ? { expectedRevision: memoryRevision } : {}), expiresAt: memoryExpiry ? new Date(memoryExpiry).toISOString() : null }); setMemoryKey(""); setMemoryText(""); setMemoryRevision(undefined); setMemoryExpiry(""); }, "Memory saved. Future tasks will use the correction."); }}>
        <label>Note name<input value={memoryKey} maxLength={80} required disabled={Boolean(memoryRevision)} placeholder="Writing preference" onChange={(event) => setMemoryKey(event.target.value)} /></label><label>What should they remember?<textarea value={memoryText} rows={3} maxLength={1200} required placeholder="Use concise English and give dates in Belgian time." onChange={(event) => setMemoryText(event.target.value)} /></label><label>Keep until <small>optional · your local time; blank means no expiry</small><input type="datetime-local" value={memoryExpiry} onChange={(event) => setMemoryExpiry(event.target.value)} /></label><button className="extension-primary" type="submit">Save note</button><button type="button" onClick={() => { setMemoryKey(""); setMemoryText(""); setMemoryRevision(undefined); setMemoryExpiry(""); }}>Clear editor</button>
      </form>
    </>}
    </fieldset>{busy && <p role="status" className="extension-notice"><LoaderCircle size={16} className="spin" />Working…</p>}
  </section>;
}
