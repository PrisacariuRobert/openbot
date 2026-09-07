export interface WorkFollowupSuggestion {
  id: string;
  snapshotId: string;
  itemIndex: number;
  botId: string;
  text: string;
  priority: "now" | "soon" | "fyi";
  sources: { ref: string; title: string; url: string | null }[];
  capturedAt: string;
}
export interface WorkFollowup extends WorkFollowupSuggestion {
  status: "open" | "done" | "dismissed";
  trackedAt: string;
  updatedAt: string;
}
export interface WorkSuggestionDigest { createdAt: string; items: WorkFollowupSuggestion[] }
export interface WorkFollowupStatus { suggestions: WorkFollowupSuggestion[]; tracked: WorkFollowup[]; digestEnabled: boolean; digest: WorkSuggestionDigest | null }
