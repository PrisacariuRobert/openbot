export type LiveViewEvent =
  | { type: "frame"; jpeg: string }
  | { type: "status"; browser: "ready" | "stopped" | "unavailable"; title?: string | null; currentUrl?: string | null }
  | { type: "ping" };

export type LiveViewSubscriber = (event: LiveViewEvent) => void;
export type LiveViewSource = { stop(): void };
type ViewSession = {
  subscribers: Set<LiveViewSubscriber>;
  source?: LiveViewSource;
  status?: Extract<LiveViewEvent, { type: "status" }>;
  frame?: Extract<LiveViewEvent, { type: "frame" }>;
};

/** Fans one frame source per bot out to any number of live viewers.
 *
 * A source is started when the first viewer subscribes and stopped when the
 * last one leaves, so watching a computer never keeps hardware or browsers
 * alive by itself. A slow or broken viewer is isolated: subscriber callbacks
 * are guarded, and the SSE route drops frames when its own buffer is full. */
export class LiveViewHub {
  private readonly sessions = new Map<string, ViewSession>();

  constructor(private readonly startSource: (botId: string, emit: (event: LiveViewEvent) => void) => Promise<LiveViewSource>) {}

  subscribe(botId: string, subscriber: LiveViewSubscriber): void {
    const existing = this.sessions.get(botId);
    if (existing) {
      if (existing.subscribers.has(subscriber)) return;
      existing.subscribers.add(subscriber);
      // CDP may not emit again on an idle page. A second viewer needs the
      // current status and last frame immediately, not the next animation.
      if (existing.status) this.deliver(subscriber, existing.status);
      if (existing.frame) this.deliver(subscriber, existing.frame);
    } else {
      const session: ViewSession = { subscribers: new Set([subscriber]) };
      this.sessions.set(botId, session);
      const start = () => {
        try { return this.startSource(botId, (event) => this.emit(botId, session, event)); }
        catch (error) { return Promise.reject(error); }
      };
      void start()
        .then((source) => {
          if (this.sessions.get(botId) === session) session.source = source;
          else source.stop();
        })
        .catch(() => {
          if (this.sessions.get(botId) !== session) return;
          this.emit(botId, session, { type: "status", browser: "unavailable" });
          this.cleanup(botId, session);
        });
    }
  }

  unsubscribe(botId: string, subscriber: LiveViewSubscriber): void {
    const session = this.sessions.get(botId);
    if (!session) return;
    session.subscribers.delete(subscriber);
    if (!session.subscribers.size) this.cleanup(botId, session);
  }

  close(): void {
    for (const [botId, session] of this.sessions) this.cleanup(botId, session);
  }

  private deliver(subscriber: LiveViewSubscriber, event: LiveViewEvent) {
    try { subscriber(event); } catch { /* A broken viewer cannot break the source. */ }
  }

  private emit(botId: string, session: ViewSession, event: LiveViewEvent) {
    if (this.sessions.get(botId) !== session) return;
    if (event.type === "status") {
      session.status = event;
      if (event.browser !== "ready") session.frame = undefined;
    } else if (event.type === "frame") {
      // Only the latest frame lives in memory, only while this session has
      // viewers. Never replay a closed/offline browser's private screen.
      if (session.status && session.status.browser !== "ready") return;
      session.frame = event;
    }
    for (const subscriber of [...session.subscribers]) this.deliver(subscriber, event);
  }

  private cleanup(botId: string, session: ViewSession) {
    if (this.sessions.get(botId) !== session) return;
    this.sessions.delete(botId);
    session.frame = undefined;
    session.source?.stop();
  }
}
