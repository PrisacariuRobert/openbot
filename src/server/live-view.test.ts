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
