import { SwitchRow } from "../studio/Settings";
import { TOOL_GROUPS, TOOL_GROUP_IDS, type ToolGroupId } from "../shared/tool-groups";

/** The teammate's optional tool groups (task A7). Fewer groups means a shorter
 * request to the AI on every step; the teammate is told what's off. */
export function ToolGroupRows({ value, onChange }: { value: ToolGroupId[]; onChange: (next: ToolGroupId[]) => void }) {
  return <>
    {TOOL_GROUPS.map((group) => (
      <SwitchRow
        key={group.id}
        title={group.label}
        description={group.detail}
        checked={value.includes(group.id)}
        onChange={(checked) => onChange(TOOL_GROUP_IDS.filter((id) => id === group.id ? checked : value.includes(id)))}
      />
    ))}
  </>;
}

/** What to save: null when every group is on, so a group added later starts on too. */
export function toolGroupsPatch(value: ToolGroupId[]): ToolGroupId[] | null {
  return TOOL_GROUP_IDS.every((id) => value.includes(id)) ? null : value;
}
