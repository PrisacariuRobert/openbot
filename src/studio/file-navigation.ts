import type { WorkspaceFile } from "../shared/types";

/** One-level folder drill-down over flattened workspace listings (U04c).
 * The server returns every path flattened; the list shows a single level
 * so folders behave like folders instead of dead buttons. Pure. */
export function visibleWorkspaceFiles(files: WorkspaceFile[], prefix: string): WorkspaceFile[] {
  const base = prefix && !prefix.endsWith("/") ? `${prefix}/` : prefix;
  return files.filter((file) => {
    if (base && !file.path.startsWith(base)) return false;
    if (file.path === base.slice(0, -1)) return false;
    return !file.path.slice(base.length).includes("/");
  });
}

/** Breadcrumb segments for a prefix like "a/b/". Pure. */
export function prefixCrumbs(prefix: string): string[] {
  return prefix.split("/").filter(Boolean);
}
