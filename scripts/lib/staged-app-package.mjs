import { closeSync, cpSync, existsSync, lstatSync, mkdtempSync, openSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

// Build and validate a complete sibling app before changing the destination.
// In particular, a copy/signing failure must not strip the working app's seal.
export async function stageAppPackage(app, prepare, verify) {
  if (!path.isAbsolute(app) || !app.endsWith(".app") || !lstatSync(app).isDirectory() || lstatSync(app).isSymbolicLink()) {
    throw new Error("Choose a real, absolute .app directory, not a symbolic link.");
  }
  const lock = `${app}.packaging-lock`;
  const descriptor = openSync(lock, "wx", 0o600);
  let transaction;
  let originalMoved = false;
  let published = false;
  try {
    transaction = mkdtempSync(path.join(path.dirname(app), ".openbot-package-"));
    const staged = path.join(transaction, path.basename(app));
    const original = path.join(transaction, "previous.app");
    cpSync(app, staged, { recursive: true, preserveTimestamps: true, verbatimSymlinks: true });
    await prepare(staged);
    await verify(staged);
    renameSync(app, original);
    originalMoved = true;
    try {
      renameSync(staged, app);
      published = true;
    } catch (error) {
      // Keep the backup intact if another process occupies the destination.
      if (!existsSync(app)) {
        renameSync(original, app);
        originalMoved = false;
      }
      throw error;
    }
    return app;
  } finally {
    closeSync(descriptor);
    rmSync(lock);
    if (transaction && (!originalMoved || published)) rmSync(transaction, { recursive: true, force: true });
    else if (transaction) console.error(`The previous app is preserved at ${path.join(transaction, "previous.app")}. Restore it before retrying.`);
  }
}
