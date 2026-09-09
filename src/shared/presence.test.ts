import test from "node:test";
import assert from "node:assert/strict";
import { activeNowBots } from "./presence.js";

test("the active-now strip shows working and celebrating teammates, never waiting ones", () => {
  const bots = [
    { id: "nova", name: "Nova", status: "working" as const },
    { id: "pixel", name: "Pixel", status: "celebrating" as const },
    { id: "scout", name: "Scout", status: "waiting" as const },
    { id: "sage", name: "Sage", status: "ready" as const },
    { id: "ash", name: "Ash", status: "failed" as const },
  ];
  assert.deepEqual(activeNowBots(bots).map((bot) => bot.id), ["nova", "pixel"]);
  assert.deepEqual(activeNowBots([]), []);
});
