import assert from "node:assert/strict";
import test from "node:test";
import { watchStudioConnection, type AccessPhase } from "./studio-connection";

function setup() {
  let id = 0;
  const timers = new Map<number, { work: () => void; milliseconds: number }>();
  const phases: AccessPhase[] = [];
  const requests: Array<{ signal: AbortSignal; resolve: (response: {ok:boolean;status:number}) => void }> = [];
  const connection = watchStudioConnection({
    fetchState: (signal) => new Promise((resolve, reject) => {
      requests.push({signal,resolve});
      signal.addEventListener("abort", () => reject(new Error("Aborted")), {once:true});
    }),
    onPhase: (phase) => phases.push(phase),
    schedule: (work, milliseconds) => { const key = ++id; timers.set(key,{work,milliseconds}); return key; },
    cancel: (timer) => { timers.delete(timer as number); },
  });
  const fire = (milliseconds: number) => {
    const entry = [...timers].find(([, timer]) => timer.milliseconds === milliseconds)!;
    assert.ok(entry, `Expected a ${milliseconds}ms timer`);
    timers.delete(entry[0]); entry[1].work();
  };
  return { connection, requests, timers, phases, fire };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test("offline opening retries automatically and stops when the studio returns", async () => {
  const f = setup();
  f.requests[0]!.resolve({ok:false,status:503}); await flush();
  assert.deepEqual(f.phases,["offline"]);
  f.fire(2000); f.requests[1]!.resolve({ok:true,status:200}); await flush();
  assert.deepEqual(f.phases,["offline","ready"]);
  assert.equal(f.timers.size,0); f.connection.stop();
});
test("expired access never loops through automatic sign-in attempts", async () => {
  const f = setup();
  f.requests[0]!.resolve({ok:false,status:401}); await flush();
  assert.deepEqual(f.phases,["locked"]); assert.equal(f.timers.size,0);
  f.connection.wake(); assert.equal(f.requests.length,1); f.connection.stop();
});
test("locking invalidates an in-flight success; stopping removes timers and requests", async () => {
  const f = setup(); f.connection.lock();
  f.requests[0]!.resolve({ok:true,status:200}); await flush();
  assert.deepEqual(f.phases,["locked"]); assert.equal(f.requests[0]!.signal.aborted,true);
  f.connection.stop(); assert.equal(f.timers.size,0);
});
test("timeouts retry and repeated failures back off to thirty seconds", async () => {
  const f = setup(); f.fire(10000); await flush();
  assert.deepEqual(f.phases,["offline"]);
  for (const delay of [2000,5000,10000,30000,30000]) {
    f.fire(delay); f.requests.at(-1)!.resolve({ok:false,status:503}); await flush();
  }
  f.connection.stop(); assert.equal(f.timers.size,0);
});
