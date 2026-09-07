import { useEffect, useReducer, useRef } from "react";
import type { StudioDraft } from "../shared/types";
import { ConversationDrafts, type DraftCapture } from "./conversation-drafts";

async function saveDraft(threadId: string, body: string): Promise<StudioDraft> {
  const response = await fetch(`/api/drafts/${encodeURIComponent(threadId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, source: "web" }),
  });
  if (!response.ok) throw new Error("Couldn’t save your draft. Your text is still here. Try again.");
  return response.json();
}

/** Pass state.draft after fetching /api/state. It must match threadId before it
 * is applied. Keep this hook mounted above conversation content to retain all
 * pending drafts across navigation. Capture before send; clearSent after success.
 */
export function useConversationDraft(threadId: string, remote?: StudioDraft) {
  const store = useRef<ConversationDrafts | null>(null);
  if (!store.current) store.current = new ConversationDrafts(saveDraft);
  const drafts = store.current;
  const [, render] = useReducer((version: number) => version + 1, 0);
  useEffect(() => drafts.subscribe(render), [drafts]);
  useEffect(() => {
    if (remote?.threadId === threadId) drafts.receive(remote);
  }, [drafts, threadId, remote?.threadId, remote?.body, remote?.source, remote?.updatedAt]);
  useEffect(() => {
    const preserve = (event: BeforeUnloadEvent) => {
      if (!drafts.hasUnsaved()) return;
      drafts.flushAll();
      event.preventDefault();
      event.returnValue = "";
    };
    const saveWhenHidden = () => { if (document.visibilityState === "hidden") drafts.flushAll(); };
    window.addEventListener("beforeunload", preserve);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.removeEventListener("beforeunload", preserve);
      document.removeEventListener("visibilitychange", saveWhenHidden);
      drafts.flushAll();
    };
  }, [drafts]);
  return {
    ...drafts.view(threadId),
    setBody: (body: string) => drafts.edit(threadId, body),
    capture: () => drafts.capture(threadId),
    clearSent: (capture: DraftCapture) => drafts.clearSent(capture),
    useRemote: () => drafts.resolve(threadId, "remote"),
    keepLocal: () => drafts.resolve(threadId, "local"),
    saveNow: () => drafts.flush(threadId),
  };
}
