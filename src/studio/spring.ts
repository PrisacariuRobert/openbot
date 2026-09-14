/** Apple-style spring physics for gesture-driven motion (rAF, no deps).
 *
 *  Think in the skill's designer parameters, converted to stiffness/damping:
 *  - response (seconds): how quickly it settles — NOT a duration.
 *  - dampingRatio: 1.0 = critically damped (no overshoot, the default);
 *    ~0.8 = a little bounce, only for momentum-driven releases.
 *
 *  Springs start from the live on-screen value with the finger's release
 *  velocity, so grabs mid-flight never jump and reversals never brick-wall.
 */
export interface SpringOptions {
  response?: number;
  dampingRatio?: number;
  settleDistance?: number;
  settleVelocity?: number;
}

export interface Spring {
  /** Retarget mid-flight from the current value + velocity. */
  start: (target: number, initialVelocity?: number) => void;
  stop: () => void;
  readonly value: number;
}

export function createSpring(
  from: number,
  onUpdate: (value: number) => void,
  options: SpringOptions = {},
): Spring {
  const {
    response = 0.32,
    dampingRatio = 1,
    settleDistance = 0.4,
    settleVelocity = 12,
  } = options;
  const omega = (2 * Math.PI) / Math.max(0.05, response);
  const stiffness = omega * omega;
  const damping = 2 * dampingRatio * omega;
  let value = from;
  let velocity = 0;
  let target = from;
  let frame = 0;
  let last = 0;

  const api: Spring = {
    start(next: number, initialVelocity = 0) {
      target = next;
      velocity = initialVelocity;
      if (frame) return; // already running: just retarget, keep blending
      last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
        last = now;
        // Semi-implicit Euler: stable for UI springs at display rates.
        const force = -stiffness * (value - target) - damping * velocity;
        velocity += force * dt;
        value += velocity * dt;
        onUpdate(value);
        if (
          Math.abs(value - target) < settleDistance &&
          Math.abs(velocity) < settleVelocity
        ) {
          value = target;
          velocity = 0;
          frame = 0;
          onUpdate(value);
          return;
        }
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    },
    stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      velocity = 0;
    },
    get value() {
      return value;
    },
  };
  return api;
}

/** Apple's rubber-band: progressive resistance past a boundary. */
export function rubberband(
  overshoot: number,
  dimension: number,
  constant = 0.55,
): number {
  if (overshoot === 0) return 0;
  return (
    (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot))
  );
}

/** Apple's momentum projection: where a flick is *going*, so callers can
 *  snap to the target nearest the projected point, not the release point.
 *  (Skill form with velocity in px/s is `(v/1000)·d/(1−d)`; with px/ms the
 *  /1000 cancels out.) */
export function projectMomentum(
  initialVelocityPxPerMs: number,
  decelerationRate = 0.998,
): number {
  return (
    (initialVelocityPxPerMs * decelerationRate) / (1 - decelerationRate)
  );
}
