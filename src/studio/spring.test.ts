import test from "node:test";
import assert from "node:assert/strict";
import { createSpring, projectMomentum, rubberband } from "./spring.js";

// rAF shim: run frames synchronously with fixed 16.7ms steps.
function withSyncRaf(run: (frames: number) => void): number {
  let now = 0;
  const box: { cb: FrameRequestCallback | null } = { cb: null };
  let count = 0;
  const realRaf = globalThis.requestAnimationFrame;
  const realCancel = globalThis.cancelAnimationFrame;
  const realNow = performance.now;
  (globalThis as Record<string, unknown>).requestAnimationFrame =
    (cb: FrameRequestCallback) => {
      box.cb = cb;
      return 1;
    };
  (globalThis as Record<string, unknown>).cancelAnimationFrame = () => {
    box.cb = null;
  };
  performance.now = () => now;
  try {
    run(0);
    while (count < 600) {
      const cb = box.cb;
      if (!cb) break;
      box.cb = null;
      count += 1;
      now += 16.7;
      cb(now);
    }
  } finally {
    globalThis.requestAnimationFrame = realRaf;
    globalThis.cancelAnimationFrame = realCancel;
    performance.now = realNow;
  }
  return count;
}

test("critically damped spring settles on target without overshoot", () => {
  const seen: number[] = [];
  let min = Infinity;
  withSyncRaf(() => {
    const spring = createSpring(0, (v) => {
      seen.push(v);
      if (v < min) min = v;
    });
    spring.start(-148, -2);
  });
  assert.ok(seen.length > 0 && seen.length < 600, "settles in finite frames");
  assert.equal(Math.round(seen[seen.length - 1]!), -148);
  assert.ok(min > -148.6, `no meaningful overshoot (min ${min})`);
});

test("retarget mid-flight blends instead of jumping", () => {
  const trace: number[] = [];
  let frames = 0;
  let now = 0;
  const box: { cb: FrameRequestCallback | null } = { cb: null };
  const realRaf = globalThis.requestAnimationFrame;
  const realNow = performance.now;
  (globalThis as Record<string, unknown>).requestAnimationFrame =
    (cb: FrameRequestCallback) => {
      box.cb = cb;
      return 1;
    };
  performance.now = () => now;
  try {
    const spring = createSpring(0, (v) => trace.push(v));
    spring.start(-148, 0);
    while (frames < 600) {
      const cb = box.cb;
      if (!cb) break;
      box.cb = null;
      frames += 1;
      now += 16.7;
      if (frames === 5) spring.start(0, 0);
      cb(now);
    }
  } finally {
    globalThis.requestAnimationFrame = realRaf;
    performance.now = realNow;
  }
  assert.equal(Math.round(trace[trace.length - 1]!), 0);
  for (let i = 1; i < trace.length; i += 1) {
    assert.ok(
      Math.abs(trace[i]! - trace[i - 1]!) < 40,
      `no jumps between frames (frame ${i})`,
    );
  }
});

test("rubberband resists progressively", () => {
  const a = rubberband(10, 148);
  const b = rubberband(60, 148);
  assert.ok(a > 0 && b > 0);
  assert.ok(b / 60 < a / 10, "marginal travel shrinks with overshoot");
  assert.equal(rubberband(0, 148), 0);
});

test("projectMomentum matches Apple's exponential-decay form", () => {
  // 1 px/ms flick with d=0.998 projects ~499px forward.
  assert.ok(Math.abs(projectMomentum(1) - 499) < 1);
  assert.equal(projectMomentum(0), 0);
  assert.ok(projectMomentum(-0.5) < 0);
});
