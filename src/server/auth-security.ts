type AttemptWindow = { failures: number; resetAt: number };

export class LoginAttemptGate {
  private readonly attempts = new Map<string, AttemptWindow>();

  constructor(
    private readonly maximumFailures = 8,
    private readonly windowMs = 15 * 60_000,
    private readonly maximumTrackedKeys = 4_096,
  ) {}

  check(key: string, at = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    const record = this.attempts.get(key);
    if (!record || record.resetAt <= at) {
      if (record) this.attempts.delete(key);
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (record.failures < this.maximumFailures) return { allowed: true, retryAfterSeconds: 0 };
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt - at) / 1_000)) };
  }

  failed(key: string, at = Date.now()): void {
    const record = this.attempts.get(key);
    if (record && record.resetAt > at) {
      record.failures += 1;
      return;
    }
    if (record) this.attempts.delete(key);
    if (this.attempts.size >= this.maximumTrackedKeys) {
      const oldestKey = this.attempts.keys().next().value as string | undefined;
      if (oldestKey) this.attempts.delete(oldestKey);
    }
    this.attempts.set(key, { failures: 1, resetAt: at + this.windowMs });
  }

  succeeded(key: string): void {
    this.attempts.delete(key);
  }
}
