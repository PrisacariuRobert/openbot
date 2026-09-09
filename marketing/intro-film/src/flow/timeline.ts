// One clock drives both the pointer and UI state. Every navigation has a visible
// click; task progress is the only state allowed to advance without one.
export const DURATION = 3600;
export type Thread = "The studio" | "Nova" | "Pixel" | "Scout" | "Iris";
export type Panel =
  | "browser"
  | "approval"
  | "file"
  | "workspace"
  | "routines"
  | "newRoutine"
  | "settings"
  | "ai"
  | "create";
export const targets = {
  nova: [124, 337],
  studio: [124, 259],
  pixel: [125, 415],
  send: [1362, 827],
  computer: [1332, 64],
  close: [1390, 126],
  browserTab: [1242, 200],
  review: [771, 579],
  approve: [1284, 800],
  artifact: [657, 532],
  workspace: [117, 786],
  workspaceSettings: [1113, 558],
  routines: [1100, 451],
  newRoutine: [1291, 210],
  repeat: [1120, 457],
  weekdays: [1108, 567],
  saveRoutine: [1283, 800],
  settings: [239, 840],
  yourAI: [1084, 293],
  model: [1246, 491],
  chooseModel: [1151, 590],
  saveAI: [1284, 800],
  add: [236, 194],
  shape: [1105, 542],
  create: [1284, 800],
  name: [1110, 342],
  role: [1105, 437],
  createModel: [1140, 665],
  createModelChoice: [1140, 720],
} as const;
type Target = keyof typeof targets;
type Event = {
  at: number;
  target: Target;
  thread?: Thread;
  panel?: Panel | null;
  action?: string;
};
export const events: readonly Event[] = [
  { at: 150, target: "nova", thread: "Nova" },
  { at: 300, target: "send", action: "sendLaunch" },
  { at: 420, target: "computer", panel: "browser" },
  { at: 570, target: "browserTab", action: "openNotes" },
  { at: 710, target: "close", panel: null },
  { at: 770, target: "studio", thread: "The studio" },
  { at: 930, target: "pixel", thread: "Pixel" },
  { at: 1110, target: "review", panel: "approval" },
  { at: 1260, target: "approve", action: "approveTool" },
  { at: 1410, target: "close", panel: null },
  { at: 1540, target: "artifact", panel: "file" },
  { at: 1720, target: "close", panel: null },
  { at: 1810, target: "workspace", panel: "workspace" },
  { at: 1870, target: "workspaceSettings", panel: "settings" },
  { at: 1930, target: "routines", panel: "routines" },
  { at: 1970, target: "newRoutine", panel: "newRoutine" },
  { at: 2040, target: "repeat", action: "openRepeat" },
  { at: 2100, target: "weekdays", action: "chooseWeekdays" },
  { at: 2170, target: "saveRoutine", panel: "routines", action: "saveRoutine" },
  { at: 2230, target: "close", panel: null },
  { at: 2320, target: "settings", panel: "settings" },
  { at: 2390, target: "yourAI", panel: "ai" },
  { at: 2480, target: "model", action: "openModels" },
  { at: 2560, target: "chooseModel", action: "chooseModel" },
  { at: 2640, target: "saveAI", action: "saveAI" },
  { at: 2700, target: "close", panel: null },
  { at: 2820, target: "add", panel: "create" },
  { at: 2850, target: "name", action: "focusName" },
  { at: 2920, target: "role", action: "focusRole" },
  { at: 2970, target: "shape", action: "chooseShape" },
  { at: 3010, target: "createModel", action: "openCreateModel" },
  { at: 3040, target: "createModelChoice", action: "chooseCreateModel" },
  {
    at: 3070,
    target: "create",
    panel: null,
    thread: "Iris",
    action: "createTeammate",
  },
  { at: 3220, target: "send", action: "sendIris" },
];
export const happened = (frame: number, action: string) =>
  events.some((e) => e.action === action && frame >= e.at);
export const actionAt = (action: string) =>
  events.find((e) => e.action === action)!.at;
export function stateAt(frame: number) {
  let thread: Thread = "The studio";
  let threadAt = 0;
  let panel: Panel | null = null;
  let priorPanel: Panel | null = null;
  let panelAt = 0;
  for (const event of events) {
    if (event.at > frame) break;
    if (event.thread) {
      thread = event.thread;
      threadAt = event.at;
    }
    if (event.panel !== undefined) {
      priorPanel = panel;
      panel = event.panel;
      panelAt = event.at;
    }
  }
  return {
    thread,
    threadAt,
    panel,
    priorPanel,
    panelAt,
    created: happened(frame, "createTeammate"),
    approved: happened(frame, "approveTool"),
    routineSaved: happened(frame, "saveRoutine"),
    aiSaved: happened(frame, "saveAI"),
  };
}
export function typed(frame: number, start: number, end: number, text: string) {
  return text.slice(
    0,
    Math.floor(
      Math.min(1, Math.max(0, (frame - start) / (end - start))) * text.length,
    ),
  );
}
export function draftAt(f: number) {
  if (f >= 150 && f < 300)
    return typed(f, 185, 277, "Turn our launch notes into a plan we can use.");
  if (f >= 3070 && f < 3220)
    return typed(
      f,
      3100,
      3185,
      "Iris, help us make the next launch even better.",
    );
  return "";
}
