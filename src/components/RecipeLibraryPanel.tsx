import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { BookOpen, Download, Play, Upload } from "lucide-react";
import type { Bot } from "../shared/types";
import { defaultRecipePreferences, type PortableRecipe, type RecipeExample, type RecipePreferences, type StarterRecipe } from "../shared/recipes";
import "./recipes.css";

type Library = { recipes: StarterRecipe[]; saved: { recipeId: string; preferences: RecipePreferences }[] };
export function RecipeLibraryPanel({ bots, request, onStart }: { bots: Bot[]; request: <T>(url: string, init?: RequestInit) => Promise<T>; onStart: (prompt: string, kind?: "morning" | "inbox" | "meeting" | "weekly", botId?: string) => Promise<void> }) {
  const [botId, setBotId] = useState(bots[0]?.id || ""), [library, setLibrary] = useState<Library | null>(null);
  const [selectedId, setSelectedId] = useState("morning-brief"), [preferences, setPreferences] = useState(defaultRecipePreferences);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(""), [example, setExample] = useState<RecipeExample | null>(null);
  const [preview, setPreview] = useState<{ recipe: StarterRecipe; bundle: PortableRecipe; notice: string } | null>(null);
  const selected = library?.recipes.find((entry) => entry.id === selectedId);
  useEffect(() => {
    let current = true; setLibrary(null); setPreview(null); setExample(null);
    if (botId) void request<Library>(`/api/recipes?botId=${encodeURIComponent(botId)}`).then((value) => { if (current) setLibrary(value); }).catch(() => { if (current) setNotice("Couldn’t load recipes. Reopen Apps & tools to retry."); });
    return () => { current = false; };
  }, [botId, request]);
  useEffect(() => { setPreferences(library?.saved.find((entry) => entry.recipeId === selectedId)?.preferences || defaultRecipePreferences); setExample(null); }, [library, selectedId]);
  const post = <T,>(path: string, body: unknown) => request<T>(`/api/recipes/${path}`, { method: "POST", body: JSON.stringify(body) });
  async function perform(work: () => Promise<void>) { setBusy(true); setNotice(""); try { await work(); } catch (error) { setNotice(error instanceof Error ? error.message : "This recipe couldn’t be opened. Try again."); } finally { setBusy(false); } }
  return <details className="recipe-library">
    <summary><BookOpen size={20} aria-hidden="true" /><span><strong>Recipes to make your own</strong><small>Six included workflows. Try sample data, then use your own connections.</small></span></summary>
    <div className="recipe-body">
      <div className="recipe-fields"><label>Teammate<select aria-label="Recipe teammate" disabled={busy} value={botId} onChange={(event) => setBotId(event.target.value)}>{bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label>
        <label>Recipe<select aria-label="Recipe" disabled={busy || !library} value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setPreview(null); setNotice(""); }}>{library?.recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.title}</option>)}</select></label></div>
      {selected && <article className="recipe-card"><h4>{selected.title}</h4><p>{selected.summary}</p><p><strong>You’ll need</strong></p><ul>{selected.requirements.map((item) => <li key={item}>{item}</li>)}</ul><p><strong>What you get:</strong> {selected.output}</p><p className="recipe-note">{selected.limit}</p>
        <div className="recipe-fields"><label>Answer length<select aria-label="Recipe answer length" disabled={busy} value={preferences.detail} onChange={(event) => setPreferences({ ...preferences, detail: event.target.value as RecipePreferences["detail"] })}><option value="concise">Concise</option><option value="expanded">More detail</option></select></label>
          {selected.workKind === "inbox" && <label className="recipe-toggle"><input type="checkbox" disabled={busy} checked={preferences.includeDrafts} onChange={(event) => setPreferences({ ...preferences, includeDrafts: event.target.checked })} />Include unsent reply drafts</label>}</div>
        <div className="recipe-actions"><button type="button" disabled={busy} onClick={() => void perform(async () => { setExample(await post<RecipeExample>("example", { recipeId: selected.id })); setNotice("Example checked using synthetic data. No model or personal account was used."); })}><Play size={15} />Try safe example</button>
          <button className="recipe-primary" type="button" disabled={busy} onClick={() => void perform(async () => { const prepared = await post<{ prompt: string; expectedWorkKind: StarterRecipe["workKind"]; botId: string }>("prepare", { botId, recipeId: selected.id, preferences, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }); await onStart(prepared.prompt, prepared.expectedWorkKind || undefined, prepared.botId); })}>{selected.workKind ? "Start with my sources" : "Set up in chat"}</button>
          <button type="button" disabled={busy} onClick={() => void perform(async () => { const bundle = await post<PortableRecipe>("export", { recipeId: selected.id, preferences }); await post("import", { botId, bundle }); setLibrary((current) => current ? { ...current, saved: [...current.saved.filter((entry) => entry.recipeId !== selected.id), { recipeId: selected.id, preferences: bundle.preferences }] } : current); const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = `${selected.id}.openbot-recipe.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice("Recipe settings saved and exported. No private data or account bindings are included."); })}><Download size={15} />Save & export settings</button></div>
      </article>}
      <p className="recipe-note">Safe examples test the workflow machinery with synthetic data and prewritten interpretations—not a provider’s reasoning. Starting with your sources uses your selected teammate and provider.</p>
      {example && <details className="recipe-result" open><summary>Example result · no model used</summary><ul>{example.checks.map((check) => <li key={check}>{check}</li>)}</ul><div className="recipe-markdown"><ReactMarkdown skipHtml>{example.markdown}</ReactMarkdown></div></details>}
      <label className="recipe-import"><span><Upload size={15} />Open recipe settings</span><input aria-label="Open recipe settings" type="file" accept="application/json,.json" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; void perform(async () => { if (file.size > 16384) throw new Error("Choose a recipe settings file smaller than 16 KB."); setPreview(await post("inspect", JSON.parse(await file.text()))); }); }} /></label>
      {preview && <div className="recipe-card"><h4>Import {preview.recipe.title}?</h4><p>{preview.notice}</p><p>Answer length: {preview.bundle.preferences.detail}. Drafts: {preview.bundle.preferences.includeDrafts ? "included where supported" : "off"}.</p><button type="button" disabled={busy} onClick={() => void perform(async () => { await post("import", { botId, bundle: preview.bundle }); setSelectedId(preview.recipe.id); setLibrary(await request<Library>(`/api/recipes?botId=${encodeURIComponent(botId)}`)); setPreview(null); setNotice("Settings imported for this teammate. Nothing has started and no permissions changed."); })}>Import for {bots.find((bot) => bot.id === botId)?.name}</button></div>}
      {(notice || busy) && <p role="status">{busy ? "Working…" : notice}</p>}
    </div>
  </details>;
}
