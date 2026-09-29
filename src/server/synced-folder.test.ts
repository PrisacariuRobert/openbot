import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { syncedFolderProvider, syncedFolderWarning } from "./synced-folder.js";

const home = "/Users/owner";
const iCloudLinks = new Set([path.join(home, "Library/Mobile Documents/com~apple~CloudDocs/Documents")]);
const exists = (candidate: string) => iCloudLinks.has(candidate);

test("flags data folders a sync service would copy while the database changes", () => {
  assert.equal(syncedFolderProvider(`${home}/Documents/openbot/.openbot`, home, exists), "iCloud Drive");
  assert.equal(syncedFolderProvider(`${home}/Library/Mobile Documents/com~apple~CloudDocs/studio`, home, exists), "iCloud Drive");
  assert.equal(syncedFolderProvider(`${home}/Library/CloudStorage/Dropbox/openbot`, home, exists), "Dropbox");
  assert.equal(syncedFolderProvider(`${home}/Library/CloudStorage/OneDrive-Personal/openbot`, home, exists), "OneDrive");
  assert.equal(syncedFolderProvider(`${home}/Dropbox/openbot`, home, exists), "Dropbox");
});

test("leaves unsynced folders alone, including Documents when iCloud does not sync it", () => {
  assert.equal(syncedFolderProvider(`${home}/Library/Application Support/OpenBot`, home, exists), null);
  assert.equal(syncedFolderProvider(`${home}/Developer/openbot/.openbot`, home, exists), null);
  assert.equal(syncedFolderProvider(`${home}/Desktop/openbot`, home, exists), null, "Desktop is not linked in this fixture");
  assert.equal(syncedFolderProvider(`${home}/Documents-archive/openbot`, home, exists), null, "a sibling prefix is not inside Documents");
  assert.equal(syncedFolderProvider(`${home}/Documents/openbot`, home, () => false), null);
});

test("the warning names the folder, the service and the way out", () => {
  const text = syncedFolderWarning("/x/.openbot", "iCloud Drive");
  assert.match(text, /\/x\/\.openbot/);
  assert.match(text, /iCloud Drive/);
  assert.match(text, /OPENBOT_DATA_DIR/);
});
