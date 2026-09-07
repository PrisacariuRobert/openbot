export type LiveViewEvent =
  | { type: "frame"; jpeg: string }
  | { type: "status"; browser: "ready" | "stopped" | "unavailable"; title?: string | null; currentUrl?: string | null }
  | { type: "ping" };

export type LiveViewSubscriber = (event: LiveViewEvent) => void;
export type LiveViewSource = { stop(): void };

/** Fans one frame source per bot out to any number of live viewers.
 *
 * A source is started when the first viewer subscribes and stopped when the
 * last one leaves, so watching a computer never keeps hardware or browsers
 * alive by itself. A slow or broken viewer is isolated: subscriber callbacks
 * are guarded, and the SSE route drops frames when its own buffer is full. */
export class LiveViewHub {
  private readonly subscribers = new Map<string, Set<LiveViewSubscriber>>();
  private readonly sources = new Map<string, LiveViewSource>();
  private readonly starting = new Map<string, Promise<void>>();

  constructor(private readonly startSource: (botId: string, emit: (event: LiveViewEvent) => void) => Promise<LiveViewSource>) {}

  subscribe(botId: string, subscriber: LiveViewSubscriber): void {
    let group = this.subscribers.get(botId);
    if (!group) {
      group = new Set();
      this.subscribers.set(botId, group);
    }
    group.add(subscriber);
    if (!this.sources.has(botId) && !this.starting.has(botId)) {
      const start = this.startSource(botId, (event) => this.emit(botId, event))
        .then((source) => {
          this.starting.delete(botId);
          // The last viewer may have left while the source was starting.
          if (this.subscribers.get(botId)?.size) this.sources.set(botId, source);
          else source.stop();
        })
        .catch(() => {
          this.starting.delete(botId);
          this.emit(botId, { type: "status", browser: "unavailable" });
          this.cleanup(botId);
        });
      this.starting.set(botId, start);
    }
  }

  unsubscribe(botId: string, subscriber: LiveViewSubscriber): void {
    const group = this.subscribers.get(botId);
    if (!group) return;
    group.delete(subscriber);
    if (!group.size) this.cleanup(botId);
  }

  private emit(botId: string, event: LiveViewEvent) {
    for (const subscriber of [...(this.subscribers.get(botId) || [])]) {
      try {
        subscriber(event);
      } catch {
        // One failed viewer must not take down the shared source.
      }
    }
  }

  private cleanup(botId: string) {
    this.subscribers.delete(botId);
    const source = this.sources.get(botId);
    if (source) {
      this.sources.delete(botId);
      source.stop();
    }
  }
}
