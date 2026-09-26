import test from "node:test";
import assert from "node:assert/strict";
import { shortcutPlist } from "./siri-shortcut.js";

test("the Siri shortcut asks, posts to this studio with its own key, and shows the answer", () => {
  const key = `obd_${"k".repeat(43)}`;
  const xml = shortcutPlist({ askUrl: "https://app.openbots.foundation/api/ask", deviceKey: key });
  for (const action of ["is.workflow.actions.ask", "is.workflow.actions.downloadurl", "is.workflow.actions.getvalueforkey", "is.workflow.actions.showresult"]) assert.ok(xml.includes(action), action);
  assert.ok(xml.includes("https://app.openbots.foundation/api/ask"));
  assert.ok(xml.includes(`Bearer ${key}`));
  assert.ok(xml.indexOf("is.workflow.actions.ask") < xml.indexOf("is.workflow.actions.downloadurl"), "asks first");
  assert.throws(() => shortcutPlist({ askUrl: "javascript:alert(1)", deviceKey: key }));
  assert.throws(() => shortcutPlist({ askUrl: "https://x.example/api/ask", deviceKey: "stolen-access-key" }), "only a device key goes in");
  assert.ok(!shortcutPlist({ askUrl: "https://x.example/api/ask?a=<b>&c", deviceKey: key }).includes("<b>&c"), "text is escaped");
});
