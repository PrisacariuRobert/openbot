import test from "node:test";
import assert from "node:assert/strict";
import { LiveViewHub, type LiveViewEvent, type LiveViewSource } from "./live-view.js";

type FakeFactory = {
  started: string[];
  stopped: string[];
  start: (botId: string, emit: (event: LiveViewEvent) => void) => Promise<LiveViewSource>;
  emitFrame: (botId: string, jpeg: string) => void;
  failNext: () => void;
};

function fakeFactory(): FakeFactory {
  const factory: FakeFactory = {
    started: [],
    stopped: [],
    failNext: () => {},
    emitFrame: () => {},
    start: () => Promise.resolve({ stop() {} }),
  };
  let failNext = false;
  const emitters = new Map<string, (event: LiveViewEvent) => void>();
  factory.failNext = () => { failNext = true; };
  factory.start = (botId, emit) => {
    if (failNext) {
      failNext = false;
      return Promise.reject(new Error("no screen"));
    }
    factory.started.push(botId);
    emitters.set(botId, emit);
    return Promise.resolve({ stop: () => factory.stopped.push(botId) });
  };
  factory.emitFrame = (botId, jpeg) => emitters.get(botId)?.({ type: "frame", jpeg });
  return factory;
}

test("one source per bot fans frames out to every viewer", async () => {
  const factory = fakeFactory();
  const hub = new LiveViewHub(factory.start);
  const first: LiveViewEvent[] = [];
  const second: LiveViewEvent[] = [];
  const viewerA = (event: LiveViewEvent) => first.push(event);
  const viewerB = (event: LiveViewEvent) => second.push(event);
  hub.subscribe("bot-1", viewerA);
  hub.subscribe("bot-1", viewerB);
  await Promise.resolve();
  assert.deepEqual(factory.started, ["bot-1"]);
  factory.emitFrame("bot-1", "frame-a");
  assert.deepEqual(first.map((event) => event.type), ["frame"]);
  assert.deepEqual(first, second);
  hub.unsubscribe("bot-1", viewerA);
  hub.unsubscribe("bot-1", viewerB);
  assert.deepEqual(factory.stopped, ["bot-1"]);
});

test("the source stops only when the last viewer leaves, and restarting opens a fresh source", async () => {
  const factory = fakeFactory();
  const hub = new LiveViewHub(factory.start);
  const seen: string[] = [];
  const viewerA = () => {};
  const viewerB = () => {};
  hub.subscribe("bot-1", viewerA);
  hub.subscribe("bot-1", viewerB);
  await Promise.resolve();
  hub.unsubscribe("bot-1", viewerA);
  assert.deepEqual(factory.stopped, []);
  hub.unsubscribe("bot-1", viewerB);
  assert.deepEqual(factory.stopped, ["bot-1"]);
  const collector = (event: LiveViewEvent) => { if (event.type === "frame") seen.push(event.jpeg); };
  hub.subscribe("bot-1", collector);
  await Promise.resolve();
  assert.equal(factory.started.length, 2);
  factory.emitFrame("bot-1", "after-restart");
  assert.deepEqual(seen, ["after-restart"]);
  hub.unsubscribe("bot-1", collector);
});

test("a viewer that throws cannot break the shared source or other viewers", async () => {
  const factory = fakeFactory();
  const hub = new LiveViewHub(factory.start);
  const seen: string[] = [];
  const broken = () => { throw new Error("broken viewer"); };
  const healthy = (event: LiveViewEvent) => { if (event.type === "frame") seen.push(event.jpeg); };
  hub.subscribe("bot-1", broken);
  hub.subscribe("bot-1", healthy);
  await Promise.resolve();
  factory.emitFrame("bot-1", "still-alive");
  assert.deepEqual(seen, ["still-alive"]);
  hub.unsubscribe("bot-1", broken);
  hub.unsubscribe("bot-1", healthy);
});

test("a failed source start reports unavailable, cleans up, and allows a later retry", async () => {
  const factory = fakeFactory();
  const hub = new LiveViewHub(factory.start);
  factory.failNext();
  const events: LiveViewEvent[] = [];
  const viewer = (event: LiveViewEvent) => events.push(event);
  hub.subscribe("bot-1", viewer);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(events, [{ type: "status", browser: "unavailable" }]);
  assert.deepEqual(factory.started, []);
  hub.unsubscribe("bot-1", viewer);
  const revived: LiveViewEvent[] = [];
  hub.subscribe("bot-1", (event) => revived.push(event));
  await Promise.resolve();
  factory.emitFrame("bot-1", "recovered");
  assert.deepEqual(revived.map((event) => event.type), ["frame"]);
  const revivedViewer = (event: LiveViewEvent) => revived.push(event);
  hub.unsubscribe("bot-1", revivedViewer);
});

test("a viewer leaving while the source is still starting prevents a leaked source", async () => {
  let release: ((source: LiveViewSource) => void) | undefined;
  let stopped = false;
  const hub = new LiveViewHub(() => new Promise<LiveViewSource>((resolve) => { release = resolve; }).then((source) => source ?? { stop: () => { stopped = true; } }));
  const viewer = () => {};
  hub.subscribe("bot-1", viewer);
  hub.unsubscribe("bot-1", viewer);
  release?.({ stop: () => { stopped = true; } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(stopped, true);
});

test("a late viewer immediately receives the idle screen; offline and ended sessions discard it", async () => {
  let emit!: (event: LiveViewEvent) => void;
  let starts = 0, stops = 0;
  const hub = new LiveViewHub(async (_id, callback) => { starts++; emit = callback; return { stop() { stops++; } }; });
  const first = () => {}, seen: LiveViewEvent[] = [];
  hub.subscribe("nova", first); await Promise.resolve();
  const ready = { type: "status", browser: "ready", title: "Fixture inbox" } as const;
  emit(ready); emit({ type: "frame", jpeg: "old" }); emit({ type: "frame", jpeg: "current" });
  const late = (event: LiveViewEvent) => seen.push(event);
  hub.subscribe("nova", late);
  assert.equal(starts, 1);
  assert.deepEqual(seen, [ready, { type: "frame", jpeg: "current" }]);
  emit({ type: "status", browser: "unavailable" });
  emit({ type: "frame", jpeg: "late-offline-frame" });
  const offline: LiveViewEvent[] = [], third = (event: LiveViewEvent) => offline.push(event);
  hub.subscribe("nova", third);
  assert.deepEqual(offline, [{ type: "status", browser: "unavailable" }]);
  for (const viewer of [first, late, third]) hub.unsubscribe("nova", viewer);
  assert.equal(stops, 1);
  const reopened: LiveViewEvent[] = [], fourth = (event: LiveViewEvent) => reopened.push(event);
  hub.subscribe("nova", fourth); await Promise.resolve();
  assert.deepEqual(reopened, [], "A new session must not reuse private frames from its predecessor");
  hub.unsubscribe("nova", fourth);
});

test("a retired source cannot emit into, stop or fail a replacement session", async () => {
  const pending: Array<{ emit: (event: LiveViewEvent) => void; resolve: (source: LiveViewSource) => void; reject: (error: Error) => void }> = [];
  const hub = new LiveViewHub((_id, emit) => new Promise((resolve, reject) => pending.push({ emit, resolve, reject })));
  const first = () => {}, seen: LiveViewEvent[] = [], second = (event: LiveViewEvent) => seen.push(event);
  hub.subscribe("nova", first); hub.unsubscribe("nova", first); hub.subscribe("nova", second);
  pending[0]!.emit({ type: "frame", jpeg: "private-old-frame" });
  pending[0]!.reject(new Error("old failure"));
  await new Promise(resolve => setTimeout(resolve, 0));
  pending[1]!.emit({ type: "frame", jpeg: "new-frame" });
  let stopped = 0;
  pending[1]!.resolve({ stop() { stopped++; } }); await Promise.resolve();
  assert.deepEqual(seen, [{ type: "frame", jpeg: "new-frame" }]);
  hub.unsubscribe("nova", second); assert.equal(stopped, 1);
});
