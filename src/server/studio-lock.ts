import { openSync, readFileSync, closeSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";

export interface StudioLock {
  acquired: boolean;
  holder: { pid: number; port: number | null } | null;
  release(): void;
}

/** One OpenBot server per data directory. A second boot must stop instead of
 * silently sharing the database: two servers would both claim jobs and each
 * would reject the other's runtime tool tokens ("Internal tool access
 * denied."). A lock left behind by a crashed process is detected as stale and
 * replaced. */
export function acquireStudioLock(dataDir: string, port: number, livePid: (pid: number) => boolean = defaultLivePid): StudioLock {
  const lockPath = path.join(dataDir, "openbot.lock");
  const release = () => {
    try {
      const recorded = readLock();
      if (recorded && recorded.pid === process.pid) unlinkSync(lockPath);
    } catch {}
  };
  const readLock = (): { pid: number; port: number | null } | null => {
    try {
      const [pidRaw, portRaw] = readFileSync(lockPath, "utf8").trim().split(" ");
      const pid = Number(pidRaw);
      if (!Number.isFinite(pid) || pid <= 0) return null;
      return { pid, port: portRaw && /^\d+$/.test(portRaw) ? Number(portRaw) : null };
    } catch {
      return null;
    }
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const holder = readLock();
    if (holder && holder.pid !== process.pid && livePid(holder.pid)) return { acquired: false, holder, release };
    try {
      const fd = openSync(lockPath, "wx");
      try {
        writeSync(fd, `${process.pid} ${port}\n`);
      } finally {
        closeSync(fd);
      }
      return { acquired: true, holder: null, release };
    } catch {
      // Lost the race or a stale file is in the way; the stale file is removed below and one retry follows.
      try {
        const stale = readLock();
        if (!stale || !livePid(stale.pid)) unlinkSync(lockPath);
      } catch {}
    }
  }
  return { acquired: false, holder: readLock(), release };
}

function defaultLivePid(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
