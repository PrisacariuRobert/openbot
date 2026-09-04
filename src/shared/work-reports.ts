// A source receipt proves what was fetched, not that a model's interpretation is true.
export type WorkKind = "morning" | "inbox";
export type WorkService = "gmail" | "google-calendar";
export interface WorkCoverage {
  service: WorkService;
  state: "complete" | "limited" | "unavailable";
  count: number;
  detail: string;
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
}
export interface WorkSnapshot {
  id: string;
  runId: string;
  botId: string;
  accountEmail: string;
  kind: WorkKind;
  fetchedAt: string;
  timeZone: string;
  window: { from: string; until: string; mailQuery: string };
  coverage: WorkCoverage[];
  sources: WorkSource[];
}
export interface WorkReportInput {
  snapshotId: string;
  items: { priority: "now" | "soon" | "fyi"; text: string; sourceRefs: string[] }[];
  drafts: { sourceRef: string; body: string }[];
}
export interface WorkReport {
  snapshotId: string;
  savedAt: string;
  markdown: string;
  items: WorkReportInput["items"];
  drafts: { sourceRef: string; to: string; subject: string; body: string }[];
}
