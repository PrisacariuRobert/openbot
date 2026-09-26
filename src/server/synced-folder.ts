import { existsSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** A live SQLite database with a write-ahead log must not sit in a folder a
 * sync service copies while it changes: iCloud and friends create conflict
 * copies ("openbot 2.sqlite-wal") and can restore a stale half of the pair.
 * Returns the service's name when `dir` is inside one, otherwise null. */
export function syncedFolderProvider(dir: string, home = os.homedir(), exists: (candidate: string) => boolean = existsSync): string | null {
  let resolved = path.resolve(dir);
  try { resolved = realpathSync(resolved); } catch { /* not created yet: judge the requested path */ }
  const inside = (root: string) => resolved === root || resolved.startsWith(root + path.sep);
  const iCloudRoot = path.join(home, "Library", "Mobile Documents");
  if (inside(iCloudRoot)) return "iCloud Drive";
  // "Desktop & Documents Folders" keeps the real folders in place and links
  // them from iCloud Drive; the link is how macOS marks them as synced.
  for (const folder of ["Desktop", "Documents"]) {
    if (inside(path.join(home, folder)) && exists(path.join(iCloudRoot, "com~apple~CloudDocs", folder))) return "iCloud Drive";
  }
  const cloudStorage = path.join(home, "Library", "CloudStorage");
  if (inside(cloudStorage)) {
    const provider = path.relative(cloudStorage, resolved).split(path.sep)[0] || "";
    return /^dropbox/i.test(provider) ? "Dropbox" : /^onedrive/i.test(provider) ? "OneDrive" : /^google/i.test(provider) ? "Google Drive" : "a cloud-sync folder";
  }
  if (inside(path.join(home, "Dropbox"))) return "Dropbox";
  return null;
}

export function syncedFolderWarning(dir: string, provider: string): string {
  return `OpenBot's data folder (${dir}) is inside ${provider}. Syncing a live database can create conflict copies and corrupt your studio. Move the data folder somewhere that is not synced (for example ~/Library/Application Support/OpenBot), or set OPENBOT_DATA_DIR, then restart.`;
}
