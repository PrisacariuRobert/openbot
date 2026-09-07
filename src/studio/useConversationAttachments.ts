import { useEffect, useState, useSyncExternalStore } from "react";
import { ConversationAttachmentDrafts } from "./conversation-attachment-drafts";

export function useConversationAttachments(threadId: string) {
  const [drafts] = useState(() => new ConversationAttachmentDrafts());
  const state = useSyncExternalStore(drafts.subscribe, () =>
    drafts.get(threadId),
  );
  useEffect(() => {
    void drafts.load(threadId);
    const refresh = () => {
      void drafts.load(threadId, true);
    };
    window.addEventListener("focus", refresh);
    return () => {
      drafts.cancelLoad(threadId);
      window.removeEventListener("focus", refresh);
    };
  }, [drafts, threadId]);
  return {
    ...state,
    add: (files: File[]) => drafts.add(threadId, files),
    remove: (id: string) => drafts.remove(threadId, id),
    clear: (target: string, ids: string[]) => drafts.clear(target, ids),
    retry: () => drafts.retry(threadId),
  };
}
