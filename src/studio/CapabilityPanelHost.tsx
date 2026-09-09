import { useCallback, useEffect, useState } from "react";
import type { AppState, Bot, ConnectorStatus, ProviderLoginAttempt, ProviderStatus } from "../shared/types";
import { ProviderPanel } from "../components/ProviderPanel";
import { ExtensionsPanel } from "../components/ExtensionsPanel";
import { Character } from "./Character";
import { ChoiceMenu } from "./ChoiceMenu";
import { RunControls } from "./RunControls";
import { BotPanel, ArtifactsPanel, CodeProjectsPanel, ComputerPanel, ConnectorPanel, ControlPanel, FilesPanel, LiveStudioPanel, RemotePanel, RoutinesPanel, SearchPanel, TeachPanel, WorkReceipt } from "../CapabilityPanels";
import "./capability-panels.css";
import "./settings-pages.css";

import type { CapabilityPanel } from "./capability-navigation";
async function request<T = unknown>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Couldn’t save that change. Please try again.");
  return result as T;
}

/** Functional settings share Studio's dialog, palette and navigation. There is
 * no second app shell, separate conversation state or hidden legacy route. */
export function CapabilityPanelHost({ panel, state, threadId, onOpen, onThread, onChange }: {
  panel: CapabilityPanel; state: AppState; threadId: string;
  onOpen: (panel: CapabilityPanel) => void; onThread: (id: string) => void; onChange: () => void;
}) {
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [connections, setConnections] = useState<ConnectorStatus | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [chosenBot, setChosenBot] = useState(state.bots.find((bot) => bot.threadId === threadId)?.id || state.bots[0]?.id || "");
  const [reviewRunId, setReviewRunId] = useState<string | null>(null);
  const bot = state.bots.find((item) => item.id === chosenBot) || state.bots[0];
  const loadProvider = useCallback(async () => setProvider(await request<ProviderStatus>("/api/provider")), []);
  const loadConnections = useCallback(async () => setConnections(await request<ConnectorStatus>("/api/connectors")), []);
  useEffect(() => {
    setError(""); setNotice("");
    if (["provider", "bot"].includes(panel)) void loadProvider().catch((e: Error) => setError(e.message));
    if (["connectors", "bot"].includes(panel)) void loadConnections().catch((e: Error) => setError(e.message));
    if (panel !== "provider") return;
    const timer = setInterval(() => void loadProvider().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [panel, loadProvider, loadConnections]);
  async function change<T = unknown>(url: string, method = "POST", body?: unknown, message?: string): Promise<T> {
    const result = await request<T>(url, method, body); onChange(); if (message) setNotice(message); return result;
  }
  const saveBot = async (id: string, patch: Partial<Bot>) => { await change(`/api/bots/${encodeURIComponent(id)}`, "PATCH", patch); await loadProvider(); };
  const notifications = async () => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) { setNotice("Background notifications are unavailable in this browser."); return false; }
    if (await Notification.requestPermission() !== "granted") { setNotice("Notifications stayed off."); return false; }
    const registration = await navigator.serviceWorker.getRegistration() || await navigator.serviceWorker.register("/sw.js");
    const { publicKey } = await request<{ publicKey: string }>("/api/notifications/key");
    const encoded = publicKey.replace(/-/g, "+").replace(/_/g, "/");
    const key = Uint8Array.from(atob(encoded + "=".repeat((4 - encoded.length % 4) % 4)), (c) => c.charCodeAt(0));
    const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const saved = subscription.toJSON();
    if (!saved.endpoint || !saved.keys?.p256dh || !saved.keys.auth) throw new Error("This browser did not finish notification setup.");
    await request("/api/notifications/subscriptions", "POST", { endpoint: saved.endpoint, keys: saved.keys });
    localStorage.setItem("openbot_push_enabled", "1"); setNotice("Background notifications are on."); return true;
  };
  const reviewRun = [...state.runs, ...state.studioRuns].find((run) => run.id === reviewRunId);
  return <div className={`capabilities capability-${panel}`}>
    {error && <p className="panel-error" role="alert">{error}</p>}
    {notice && <p className="capability-notice" role="status">{notice}</p>}
    {["bot", "files", "computer", "teach"].includes(panel) && state.bots.length > 1 && <div className="capability-owner"><span>Teammate</span><ChoiceMenu label="Teammate" value={bot?.id || ""} choices={state.bots.map((item) => ({ value: item.id, label: item.name, detail: item.role }))} onChange={setChosenBot} /></div>}
    {["bot", "files", "computer", "teach"].includes(panel) && !bot && <p>Create a teammate first to use this feature.</p>}
    {panel === "provider" && <ProviderPanel provider={provider} bots={state.bots} mascot={(item) => <Character name={item.name} color={item.color} variant={item.mascot} size={36} />} modelLabel={(model) => model.split("/").at(-1) || model} onUpdateBot={saveBot}
      onChooseInitial={async (providerInstanceId, model) => { await change("/api/provider/choose", "POST", { providerInstanceId, model }, "Your AI choice is saved."); await loadProvider(); }}
      onAdd={async (input) => { await change("/api/providers", "POST", input); await loadProvider(); }}
      onConnect={(providerId) => request<ProviderLoginAttempt>("/api/provider/connect", "POST", { providerId })}
      onFinish={async (id, code) => { await request(`/api/provider/connect/${encodeURIComponent(id)}/callback`, "POST", { code }); await loadProvider(); }} />}
    {panel === "connectors" && <ConnectorPanel status={connections} bots={state.bots} onRefresh={loadConnections} onNotice={setNotice} onStartWorkflow={async (prompt, expectedWorkKind, botId) => {
      await change("/api/messages", "POST", { threadId: "team-room", body: prompt, expectedWorkKind, targetBotIds: botId ? [botId] : [], attachmentIds: [] }); onThread("team-room");
    }} />}
    {panel === "projects" && <CodeProjectsPanel bots={state.bots} onNotice={setNotice} />}
    {panel === "remote" && <RemotePanel bots={state.bots} runner={state.runner} installPrompt={null} onInstalled={() => {}} onNotice={setNotice} />}
    {panel === "bot" && bot && <BotPanel key={bot.id} bot={bot} thread={state.threads.find((item) => item.id === bot.threadId)!} provider={provider} apps={connections?.access} onSave={saveBot}
      onUpdateThread={async (patch) => { await change(`/api/threads/${encodeURIComponent(bot.threadId)}`, "PATCH", patch); }}
      onDuplicate={async () => { const copy = await change<Bot>(`/api/bots/${encodeURIComponent(bot.id)}/duplicate`); onThread(copy.threadId); }} onOpenTeach={() => onOpen("teach")}
      onRetire={async () => { const result = await change<{ stopped: number }>(`/api/bots/${encodeURIComponent(bot.id)}/retire`, "POST"); setNotice(result.stopped ? `${bot.name} retired. ${result.stopped} active task${result.stopped === 1 ? " was" : "s were"} stopped; history is preserved.` : `${bot.name} retired. History is preserved.`); onThread("team-room"); }} />}
    {panel === "files" && bot && <FilesPanel key={bot.id} bot={bot} />}
    {panel === "artifacts" && <ArtifactsPanel onOpenThread={onThread} />}
    {panel === "computer" && bot && <ComputerPanel key={bot.id} bot={bot} onTeach={() => onOpen("teach")} />}
    {panel === "teach" && <><p className="capability-notice">Teach through conversation: ask your teammate to “learn this workflow”, or type /learn followed by what you want to reuse. You review the instructions before they are saved.</p><ExtensionsPanel bots={state.bots} skillsOnly selectedBotId={bot?.id} />{bot && <details className="capability-disclosure"><summary>Your learned workflows</summary><TeachPanel key={bot.id} bot={bot} bots={state.bots} hideOwnerSwitcher onBotChange={setChosenBot} onNotice={setNotice} onUse={async (workflow) => {
      const owner = state.bots.find((item) => item.id === workflow.botId) || bot;
      await change("/api/messages", "POST", { threadId: owner.threadId, body: `/${workflow.skillSlug}`, targetBotIds: [owner.id], attachmentIds: [] }); onThread(owner.threadId);
    }} /></details>}</>}
    {panel === "control" && <ControlPanel state={state} onNotify={() => void notifications().catch((e: Error) => setError(e.message))} onOpenProvider={() => onOpen("provider")} onOpenRemote={() => onOpen("remote")} onOpenConnectors={() => onOpen("connectors")} onOpenProjects={() => onOpen("projects")} onOpenSkills={() => onOpen("teach")} onSetMacAccess={async (enabled) => { await change("/api/settings", "PATCH", { macAccessEnabled: enabled }); }} onSetSelfExtend={async (enabled) => { await change("/api/settings", "PATCH", { selfExtendEnabled: enabled }); }} onSetCodingModel={async (model) => { await change("/api/settings", "PATCH", { codingModel: model }); }} onSetEmbeddings={async (providerInstanceId, model) => { await change("/api/settings", "PATCH", { embeddingsProviderInstanceId: providerInstanceId, embeddingsModel: model }); }} onRecallDelegation={async (runId) => { await change(`/api/delegations/${encodeURIComponent(runId)}/recall`, "POST"); }} onSetMaxTeammates={async (max) => { await change("/api/settings", "PATCH", { maxTeammates: max }); }} onRestoreTeammate={async (id) => { await change(`/api/bots/${encodeURIComponent(id)}/restore`, "POST", undefined, "Teammate restored."); }} onSetYoloMode={async (enabled) => { await change("/api/settings", "PATCH", { yoloMode: enabled }); }} onImportTeammate={async (bundle) => await change<{ name: string; skills: number; routines: number } & { bot: Bot }>("/api/bots/import", "POST", bundle).then((result) => ({ name: result.bot.name, skills: result.skills, routines: result.routines }))} />}
    {panel === "routines" && <RoutinesPanel routines={state.routines} events={state.automationEvents} alerts={state.automationAlerts} runner={state.runner} bots={state.bots}
      onCreate={(input) => change("/api/routines", "POST", input, "Automation created.")}
      onUpdate={(routine, input) => change(`/api/routines/${routine.id}`, "PATCH", input, "Automation updated.")}
      onToggle={async (routine) => { await change(`/api/routines/${routine.id}`, "PATCH", { enabled: !routine.enabled }); }}
      onDelete={async (routine) => { await change(`/api/routines/${routine.id}`, "DELETE", undefined, "Automation removed. Past results were kept."); }}
      onRun={async (routine) => { await change(`/api/routines/${routine.id}/run`, "POST", { confirmed: true }, routine.triggerType === "webpage" ? "Page checked." : "Test run started."); }}
      onReplay={async (event) => { await change(`/api/automation-events/${event.id}/replay`); }}
      onRotateSecret={(routine) => change(`/api/routines/${routine.id}/rotate-secret`)}
      onResolveAlert={async (alert) => { await change(`/api/automation-alerts/${alert.id}/resolve`); }} onOpenResult={(routine) => onThread(routine.threadId)}
      onProtectRunner={async () => { await change("/api/runner/background"); }} onUnprotectRunner={async () => { await change("/api/runner/background", "DELETE"); }}
      onWakeRunner={async () => { await change("/api/runner/wake"); }} onEnableNotifications={notifications} />}
    {panel === "live" && <><LiveStudioPanel state={state} onOpenThread={onThread} onReview={setReviewRunId} onCancel={async (id) => { await change(`/api/runs/${id}/cancel`); }}
      onResolveAction={async (id, outcome) => { await change(`/api/approved-actions/${id}/resolve`, "POST", { outcome }); }}
      onUpdateThread={async (id, patch) => { await change(`/api/threads/${encodeURIComponent(id)}`, "PATCH", patch); }} onOpenControl={() => onOpen("control")} onNotice={setNotice} />
      {reviewRun && <section className="capability-review"><h3>Review request</h3><RunControls run={reviewRun} approval={state.approvals.find((item) => item.runId === reviewRun.id)} onChange={onChange} /><WorkReceipt runId={reviewRun.id} /></section>}</>}
    {panel === "search" && <SearchPanel initialQuery="" onOpenResult={(result) => onThread(result.threadId)} />}
  </div>;
}
