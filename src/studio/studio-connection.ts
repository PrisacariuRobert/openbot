export type AccessPhase = "checking" | "ready" | "locked" | "offline";

/** One request at a time, no auth retries, and no stale response can reopen a
 * locked studio. Scheduling is injectable so recovery races can be tested. */
export function watchStudioConnection(options: {
  fetchState: (signal: AbortSignal) => Promise<{ ok: boolean; status: number }>;
  onPhase: (phase: AccessPhase) => void;
  schedule: (work: () => void, milliseconds: number) => unknown;
  cancel: (timer: unknown) => void;
}) {
  let generation = 0, failures = 0, disposed = false;
  let phase: AccessPhase = "checking";
  let retryTimer: unknown, deadline: unknown, abort: AbortController | undefined;
  const clear = () => {
    if (retryTimer !== undefined) options.cancel(retryTimer);
    if (deadline !== undefined) options.cancel(deadline);
    retryTimer = deadline = undefined;
    abort?.abort();
  };
  const show = (value: AccessPhase) => { phase = value; options.onPhase(value); };
  async function check() {
    if (disposed) return;
    const request = ++generation;
    clear();
    abort = new AbortController();
    const controller = abort;
    deadline = options.schedule(() => controller.abort(), 10_000);
    let next: AccessPhase;
    try {
      const response = await options.fetchState(controller.signal);
      next = response.ok ? "ready" : response.status === 401 ? "locked" : "offline";
    } catch { next = "offline"; }
    if (disposed || request !== generation) return;
    if (deadline !== undefined) options.cancel(deadline);
    deadline = undefined;
    show(next);
    if (next === "offline") {
      const delay = [2_000, 5_000, 10_000, 30_000][Math.min(failures++, 3)]!;
      retryTimer = options.schedule(() => { void check(); }, delay);
    } else failures = 0;
  }
  void check();
  return {
    retry: () => { failures = 0; void check(); },
    wake: () => { if (phase === "offline") { failures = 0; void check(); } },
    lock: () => { generation++; clear(); show("locked"); },
    stop: () => { disposed = true; generation++; clear(); },
  };
}
