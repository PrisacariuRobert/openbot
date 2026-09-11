import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Runtime provenance for the serving process. Never hard-coded: the exact
 * launch/build records it via OPENBOT_SOURCE_COMMIT / OPENBOT_SOURCE_DIRTY /
 * OPENBOT_FRONTEND_BUILD_COMMIT, and the server falls back to reading its own
 * checkout (rootDir) and served distDir. Lets QA ask the running product
 * which source and build it actually is. */

export interface SourceIdentity {
  commit: string | null;
  dirty: boolean | null;
  method: "env" | "git" | "unknown";
}

const SHA = /^[0-9a-f]{7,40}$/;

export function resolveSourceIdentity(rootDir: string, env: NodeJS.ProcessEnv = process.env): SourceIdentity {
  const injected = (env.OPENBOT_SOURCE_COMMIT || "").trim().toLowerCase();
  if (SHA.test(injected)) {
    const dirtyRaw = (env.OPENBOT_SOURCE_DIRTY || "").trim().toLowerCase();
    return {
      commit: injected,
      dirty: dirtyRaw === "true" ? true : dirtyRaw === "false" ? false : null,
      method: "env",
    };
  }
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, timeout: 5_000, encoding: "utf8" }).trim().toLowerCase();
    if (!/^[0-9a-f]{40}$/.test(commit)) return { commit: null, dirty: null, method: "unknown" };
    let dirty: boolean | null = null;
    try {
      dirty = execFileSync("git", ["status", "--porcelain"], { cwd: rootDir, timeout: 5_000, encoding: "utf8" }).trim().length > 0;
    } catch { dirty = null; }
    return { commit, dirty, method: "git" };
  } catch {
    return { commit: null, dirty: null, method: "unknown" };
  }
}

export interface FrontendIdentity {
  commit: string | null;
  asset: string | null;
  assetSha256: string | null;
}

export function readFrontendIdentity(distDir: string, env: NodeJS.ProcessEnv = process.env): FrontendIdentity {
  const commitRaw = (env.OPENBOT_FRONTEND_BUILD_COMMIT || "").trim().toLowerCase();
  const commit = SHA.test(commitRaw) ? commitRaw : null;
  try {
    const html = readFileSync(path.join(distDir, "index.html"), "utf8");
    const asset = /assets\/main-[^"]+\.js/.exec(html)?.[0] || null;
    let assetSha256: string | null = null;
    if (asset) {
      try { assetSha256 = createHash("sha256").update(readFileSync(path.join(distDir, asset))).digest("hex"); } catch { assetSha256 = null; }
    }
    return { commit, asset, assetSha256 };
  } catch {
    return { commit, asset: null, assetSha256: null };
  }
}
