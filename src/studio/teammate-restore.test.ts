import assert from "node:assert/strict";
import test from "node:test";
import { createTeammateRestoreCoordinator, type TeammateRestoreState } from "./teammate-restore";

test("teammate restore is single-flight and reports the pending target", async () => {
  const coordinator = createTeammateRestoreCoordinator();
  const states: TeammateRestoreState[] = [];
  let finish!: () => void;
  let requests = 0;
  const onRestore = async () => {
    requests += 1;
    await new Promise<void>((resolve) => { finish = resolve; });
  };

  const first = coordinator.restore({ id: "nova", name: "Nova" }, onRestore, (state) => states.push(state));
  const duplicate = await coordinator.restore({ id: "nova", name: "Nova" }, onRestore, (state) => states.push(state));

  assert.equal(duplicate, false);
  assert.equal(requests, 1);
  assert.deepEqual(states, [{ botId: "nova", error: "" }]);
  finish();
  assert.equal(await first, true);
  assert.deepEqual(states.at(-1), { botId: null, error: "" });
});

test("teammate restore surfaces a rejection and permits a retry", async () => {
  const coordinator = createTeammateRestoreCoordinator();
  const states: TeammateRestoreState[] = [];
  let requests = 0;
  const restore = async () => {
    requests += 1;
    if (requests === 1) throw new Error("Retire or raise the limit before restoring.");
  };
  const bot = { id: "pixel", name: "Pixel" };

  assert.equal(await coordinator.restore(bot, restore, (state) => states.push(state)), false);
  assert.deepEqual(states.at(-1), { botId: null, error: "Retire or raise the limit before restoring." });
  assert.equal(await coordinator.restore(bot, restore, (state) => states.push(state)), true);
  assert.equal(requests, 2);
  assert.deepEqual(states.at(-1), { botId: null, error: "" });
});
