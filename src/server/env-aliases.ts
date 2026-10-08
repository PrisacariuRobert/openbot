/** Maintainability slice M6: every OPENBOT_* setting can also be given as
 * SIDEMATES_*. Nothing existing changes: when both are set, the OPENBOT_
 * value is kept. Imported first by the server, and applied again after .env. */
export function applyEnvAliases(env: NodeJS.ProcessEnv = process.env): string[] {
  const conflicts: string[] = [];
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith("SIDEMATES_") || value === undefined || key.length <= "SIDEMATES_".length) continue;
    const legacy = `OPENBOT_${key.slice("SIDEMATES_".length)}`;
    if (env[legacy] === undefined) env[legacy] = value;
    else if (env[legacy] !== value) conflicts.push(key);
  }
  return conflicts;
}

applyEnvAliases();
