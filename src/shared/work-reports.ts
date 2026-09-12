// A source receipt proves what was fetched, not that a model's interpretation is true.
export type WorkKind = "morning" | "inbox" | "meeting" | "weekly";
export type WorkService = "gmail" | "google-calendar" | "google-drive" | "apple-mail" | "apple-calendar" | "slack" | "notion" | "todoist";
export interface WorkCoverage {
  service: WorkService;
  // complete/limited: the host fetched and bounded the data itself. browser:
  // no app connection — the teammate can read it in its own browser, and
  // anything cited from there stays teammate-reported, never host-verified.
  state: "complete" | "limited" | "unavailable" | "browser";
  count: number;
  detail: string;
  account?: string;
}
export interface WorkSource {
  ref: string;
  service: WorkService;
  title: string;
  url: string | null;
  text: string;
  truncated: boolean;
  from?: string;
  date?: string;
  replyState?: "received_last" | "sent_last" | "unknown";
  replyTo?: string | null;
  start?: string;
  end?: string;
  allDay?: boolean;
  sourceId?: string;
  scope?: string;
}
export interface WorkSnapshot {
  id: string;
  runId: string;
  botId: string;
  accountEmail: string;
  kind: WorkKind;
  fetchedAt: string;
  timeZone: string;
  contextRevision?: string;
  window: { from: string; until: string; mailQuery: string };
  coverage: WorkCoverage[];
  sources: WorkSource[];
}
export interface BrowserPageCitation {
  url: string;
  note: string;
}
export interface WorkReportInput {
  snapshotId: string;
  items: { priority: "now" | "soon" | "fyi"; text: string; sourceRefs: string[]; browserPages?: BrowserPageCitation[] }[];
  drafts: { sourceRef: string; body: string }[];
}
export interface WorkReport {
  snapshotId: string;
  savedAt: string;
  markdown: string;
  items: WorkReportInput["items"];
  drafts: { sourceRef: string; to: string; subject: string; body: string }[];
}
