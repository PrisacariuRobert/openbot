/** Optional tool groups a teammate can have (task A7). Each tool's definition is
 * sent with every model step, so a teammate gets only the groups its job needs:
 * its template picks them, and the owner can change them. A teammate without a
 * choice (null) has every group, as before this setting existed. Web, Mac,
 * computer and connector tools keep their own switches. */

export const TOOL_GROUPS = [
  { id: "documents", label: "Documents and spreadsheets", detail: "Word files, spreadsheets and exact totals from CSV files", tools: ["document_export", "spreadsheet_export", "spreadsheet_inspect", "table_summary", "table_reconcile"] },
  { id: "routines", label: "Routines and reminders", detail: "Things that repeat or happen later", tools: ["routine_create", "routine_list", "routine_update", "routine_pause", "routine_resume", "routine_delete"] },
  { id: "teamwork", label: "Working with teammates", detail: "Asking a teammate, handing part of a job over, or suggesting a new specialist", tools: ["message_teammate", "handoff", "propose_teammate"] },
] as const;

export type ToolGroupId = (typeof TOOL_GROUPS)[number]["id"];
export const TOOL_GROUP_IDS = TOOL_GROUPS.map((group) => group.id) as ToolGroupId[];

/** Known ids only, once each, in the order above; null keeps every group. */
export function normalizeToolGroups(value: readonly string[] | null | undefined): ToolGroupId[] | null {
  if (value == null) return null;
  return TOOL_GROUP_IDS.filter((id) => value.includes(id));
}

/** The group a tool belongs to, if any. */
export function toolGroupOf(tool: string): ToolGroupId | null {
  return TOOL_GROUPS.find((group) => (group.tools as readonly string[]).includes(tool))?.id ?? null;
}

/** Whether this teammate's choice turns the tool off. */
export function toolTurnedOff(groups: readonly ToolGroupId[] | null, tool: string): boolean {
  const group = toolGroupOf(tool);
  return Boolean(groups && group && !groups.includes(group));
}
