/** "Something useful in 3 minutes" is only a promise until it's timed. The
 * first-run timeline notes when a new studio was opened, found an AI, made
 * its team and first did something useful. It stays on this Mac: nothing is
 * sent anywhere. A studio that already had teammates when this arrived is
 * left out, since its first minutes are long gone. */

export const FIRST_RUN_STEPS = [
  { step: "opened", label: "Opened Sidemates" },
  { step: "ai_ready", label: "Found an AI" },
  { step: "team_ready", label: "Team ready" },
  { step: "first_job", label: "First job started" },
  { step: "first_list", label: "First list of what's waiting" },
  { step: "first_answer", label: "First finished job" },
] as const;

export type FirstRunStep = typeof FIRST_RUN_STEPS[number]["step"];
export type FirstRunTimeline = { skipped?: true } & Partial<Record<FirstRunStep, string>>;
export type FirstRunFacts = { aiReady: boolean; teammates: boolean; jobStarted: boolean; listReady: boolean; jobFinished: boolean };
export type FirstRunSummary = {
  recorded: boolean;
  steps: Array<{ step: FirstRunStep; label: string; at: string; afterSeconds: number }>;
  /** Seconds from opening to the first list or finished job, whichever came first. */
  usefulAfterSeconds: number | null;
};

const FACT_STEPS: Array<[keyof FirstRunFacts, FirstRunStep]> = [["aiReady", "ai_ready"], ["teammates", "team_ready"], ["jobStarted", "first_job"], ["listReady", "first_list"], ["jobFinished", "first_answer"]];

export class FirstRunClock {
  private timeline: FirstRunTimeline | null;
  constructor(private readonly store: { read: () => FirstRunTimeline | null; write: (timeline: FirstRunTimeline) => void }, private readonly now: () => Date = () => new Date()) {
    this.timeline = store.read();
  }

  private finished(): boolean {
    return Boolean(this.timeline?.skipped || FIRST_RUN_STEPS.every(({ step }) => this.timeline?.[step]));
  }

  /** Called with what the studio looks like now; only first times are kept. */
  observe(facts: FirstRunFacts) {
    if (this.finished()) return;
    if (!this.timeline) {
      this.timeline = facts.teammates ? { skipped: true } : { opened: this.now().toISOString() };
      this.store.write(this.timeline);
      if (this.timeline.skipped) return;
    }
    const at = this.now().toISOString();
    let changed = false;
    for (const [fact, step] of FACT_STEPS) if (facts[fact] && !this.timeline[step]) { this.timeline[step] = at; changed = true; }
    if (changed) this.store.write(this.timeline);
  }

  /** For steps the studio state can't see, like starting the first look. */
  mark(step: FirstRunStep) {
    if (!this.timeline || this.finished() || this.timeline[step]) return;
    this.timeline[step] = this.now().toISOString();
    this.store.write(this.timeline);
  }

  summary(): FirstRunSummary {
    const timeline = this.timeline;
    if (!timeline?.opened || timeline.skipped) return { recorded: false, steps: [], usefulAfterSeconds: null };
    const start = Date.parse(timeline.opened);
    const steps = FIRST_RUN_STEPS.flatMap(({ step, label }) => timeline[step] ? [{ step, label, at: timeline[step]!, afterSeconds: Math.max(0, Math.round((Date.parse(timeline[step]!) - start) / 1000)) }] : []);
    const useful = steps.filter((item) => item.step === "first_list" || item.step === "first_answer").map((item) => item.afterSeconds);
    return { recorded: true, steps, usefulAfterSeconds: useful.length ? Math.min(...useful) : null };
  }
}
