import assert from "node:assert/strict";
import test from "node:test";
import { guidedStage, missingSpecialists, startsGuidedRun, withoutWelcome } from "./first-run-steps.js";

test("the guided run resumes at the first step not yet done", () => {
  assert.equal(guidedStage({ connectionId: null, model: null }), "ai");
  assert.equal(guidedStage({ connectionId: "local-google", model: null }), "model");
  assert.equal(guidedStage({ connectionId: "local-google", model: "google/gemini-flash-lite-latest" }), "teammate");
});

test("the installer's welcome starts the guided run only in an empty studio, and always leaves the address", () => {
  assert.equal(startsGuidedRun("?welcome=installed", 0), true);
  assert.equal(startsGuidedRun("?welcome=installed", 1), false, "an update reopens the link; a studio with a team stays as it is");
  assert.equal(startsGuidedRun("?welcome=phone", 0), false);
  assert.equal(startsGuidedRun("", 0), false);
  assert.equal(withoutWelcome("http://127.0.0.1:4311/?welcome=installed"), "/");
  assert.equal(withoutWelcome("http://127.0.0.1:4311/?panel=team&welcome=installed#x"), "/?panel=team#x");
  assert.equal(withoutWelcome("http://127.0.0.1:4311/?welcome=phone"), null, "the phone welcome has its own handling");
  assert.equal(withoutWelcome("http://127.0.0.1:4311/"), null);
});

test("a specialist is offered only while nobody on the team has that role", () => {
  const specialists = [{ key: "researcher", role: "Researcher" }, { key: "writer", role: "Writer" }];
  assert.deepEqual(missingSpecialists(specialists, [{ role: "Chief of staff" }]).map((item) => item.key), ["researcher", "writer"]);
  assert.deepEqual(missingSpecialists(specialists, [{ role: "Chief of staff" }, { role: " researcher " }]).map((item) => item.key), ["writer"]);
  assert.deepEqual(missingSpecialists(specialists, [{ role: "Writer" }, { role: "Researcher" }]), []);
});
