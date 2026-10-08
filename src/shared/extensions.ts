import type { SkillFlag } from "./skill-trust.js";
export interface ExtensionTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  digest: string;
}

export interface McpConnection {
  id: string;
  name: string;
  url: string;
  allowLoopback: boolean;
  /** stdio servers run a local command from the community MCP ecosystem; HTTP
   * connections stream to an HTTPS endpoint. Absent legacy value means HTTP. */
  transport?: "streamable-http" | "stdio";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  revision: string;
  hasToken: boolean;
  authMode?: "token" | "oauth";
  tools: ExtensionTool[];
  grants: Record<string, Record<string, "read" | "ask">>;
  checkedAt: string | null;
  lastUsedAt: string | null;
  enabled: boolean;
}

export interface CommunitySkill {
  bundled?: boolean;
  id: string;
  name: string;
  description: string;
  instructions: string;
  files: Record<string, string>;
  source: string;
  license: string;
  digest: string;
  warnings: string[];
  blockers: string[];
  botIds: string[];
  installedAt: string;
  updatedAt?: string;
  /** Task T4: lines worth reading (data sent out, code downloaded, hidden asks). */
  flags?: SkillFlag[];
  /** Script files, imported as text; they stay off until the owner turns them on. */
  scripts?: string[];
  scriptsEnabled?: boolean;
  /** The files no longer match the hash pinned when the owner reviewed them. */
  tampered?: boolean;
}
