export interface ExecutionLimits {
  maxActiveMs: number;
  maxIdleMs: number;
  maxSteps: number;
  maxTokens: number;
  maxJobTokens: number;
  maxOutputBytes: number;
  terminationGraceMs: number;
}

export const DEFAULT_EXECUTION_LIMITS: Readonly<ExecutionLimits> =
  Object.freeze({
    maxActiveMs: 30 * 60_000,
    maxIdleMs: 5 * 60_000,
    maxSteps: 64,
    maxTokens: 100_000,
    maxJobTokens: 100_000,
    maxOutputBytes: 4 * 1024 * 1024,
    terminationGraceMs: 2_000,
  });

export function executionLimits(
  env: NodeJS.ProcessEnv = process.env,
): ExecutionLimits {
  const integer = (key: string, fallback: number, min: number, max: number) => {
    if (env[key] === undefined) return fallback;
    const value = Number(env[key]);
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(
        `${key} must be a whole number between ${min} and ${max}.`,
      );
    return value;
  };
  return {
    ...DEFAULT_EXECUTION_LIMITS,
    maxActiveMs: integer("OPENBOT_RUN_MAX_MINUTES", 30, 1, 240) * 60_000,
    maxIdleMs: integer("OPENBOT_RUN_IDLE_MINUTES", 5, 1, 30) * 60_000,
    maxSteps: integer("OPENBOT_RUN_MAX_STEPS", 64, 1, 512),
    maxTokens: integer("OPENBOT_RUN_MAX_TOKENS", 100_000, 1_000, 2_000_000),
    maxJobTokens: integer("OPENBOT_JOB_MAX_TOKENS", 100_000, 1_000, 2_000_000),
  };
}

export type ExecutionStop =
  | "time"
  | "idle"
  | "steps"
  | "tokens"
  | "job_budget"
  | "weekly_budget"
  | "output";
export const executionStopMessage: Record<ExecutionStop, string> = {
  job_budget: "This job reached its shared token limit, including teammate consultations and follow-ups. OpenBot stopped the remaining work. Your files and progress are kept for review.",
  time: "This task reached its time limit. Your saved files and progress are kept. Review them before asking for a smaller next step.",
  idle: "The model stopped making progress, so OpenBot stopped the run. Your saved work is kept. Check the connection before trying again.",
  steps:
    "This task reached its step limit. Your saved work is kept. Review the result so far and ask for a focused next step.",
  tokens:
    "This task reached its token limit. Your saved work is kept. Review it before starting another task.",
  weekly_budget:
    "This teammate reached the weekly token limit. Your saved work is kept. Review the budget in teammate settings before continuing.",
  output:
    "The model returned too much output, so OpenBot stopped the run. Your saved files are kept. Try a more focused request.",
};

// Uses a monotonic clock. Runtime progress events count; log chatter does not.
// Active time and steps are carried across approvals, consultations and restart.
export class ExecutionMeter {
  private readonly started: number;
  private lastProgress: number;
  private stepsSeen = new Set<string>();
  private stepCount: number;
  private bytes = 0;

  constructor(
    readonly limits: ExecutionLimits,
    private readonly previousMs = 0,
    previousSteps = 0,
    private readonly clock = () => performance.now(),
  ) {
    this.started = this.lastProgress = clock();
    this.stepCount = previousSteps;
  }

  get activeMs() {
    return this.previousMs + Math.max(0, this.clock() - this.started);
  }
  get steps() {
    return this.stepCount;
  }
  progress() {
    this.lastProgress = this.clock();
  }
  output(bytes: number) {
    this.bytes += Math.max(0, bytes);
  }

  event(event: Record<string, unknown>) {
    const part = event.part as Record<string, unknown> | undefined;
    const message = event.message as Record<string, unknown> | undefined;
    const step = event.type === "step_finish" || event.type === "assistant";
    if (!step) return;
    const id = part?.id ?? message?.id;
    const key = typeof id === "string" ? `${event.type}:${id}` : null;
    if (key && this.stepsSeen.has(key)) return;
    if (key) this.stepsSeen.add(key);
    this.stepCount += 1;
    this.progress();
  }

  reason(
    totalTokens: number,
    weeklyBudgetReached: boolean,
  ): ExecutionStop | null {
    if (this.activeMs >= this.limits.maxActiveMs) return "time";
    if (this.clock() - this.lastProgress >= this.limits.maxIdleMs)
      return "idle";
    if (this.bytes > this.limits.maxOutputBytes) return "output";
    if (weeklyBudgetReached) return "weekly_budget";
    if (totalTokens >= this.limits.maxTokens) return "tokens";
    if (this.steps >= this.limits.maxSteps) return "steps";
    return null;
  }
}
