import test from "node:test";
import assert from "node:assert/strict";
import { approvalReason, browserApprovalReason, commandApprovalReason, type BrowserTarget } from "./safety.js";

const target: BrowserTarget = { url: "https://example.com", tag: "button", role: "", label: "Send", inputType: "submit", autocomplete: "", href: "", formMethod: "post", searchForm: false };
test("browser approvals inspect real controls, not just selectors chosen by the model", () => {
  assert.ok(browserApprovalReason("click", "#primary", target));
  assert.ok(browserApprovalReason("click", "button:nth-child(1)", { ...target, label: "Continue", inputType: "button" }));
  assert.ok(browserApprovalReason("click", "#x"));
  assert.ok(browserApprovalReason("type", "#field 123", { ...target, label: "Verification", inputType: "text", autocomplete: "one-time-code" }));
  assert.ok(browserApprovalReason("type", "#field 123", { ...target, label: "Card", inputType: "text", autocomplete: "cc-number" }));
  assert.equal(browserApprovalReason("click", "#docs", { ...target, tag: "a", label: "Documentation", inputType: "", href: "https://example.com/docs" }), null);
  assert.equal(browserApprovalReason("click", "#search", { ...target, label: "Search", inputType: "button", formMethod: "get", searchForm: true }), null);
  assert.ok(browserApprovalReason("click", "#search", { ...target, label: "Search", inputType: "button", formMethod: "post", searchForm: true }));
});

test("ordinary local work does not require an extra approval", () => {
  assert.equal(approvalReason("Create a friendly project plan in notes.md"), null);
  assert.equal(approvalReason("Call message_teammate to share a finding with the team"), null);
  assert.equal(approvalReason("Run the checks, but do not publish and never delete files"), null);
  assert.equal(approvalReason("Do not send an email to the client"), null);
  assert.equal(approvalReason("Run a read-only release check and summarize the result"), null);
  assert.equal(approvalReason("Do not publish the preview, then deploy the approved release"), "This may publish work outside your computer.");
});

test("terminal mutations and uploads are intercepted", () => {
  assert.equal(commandApprovalReason("rm -rf drafts"), "This terminal command may delete data.");
  assert.equal(commandApprovalReason("curl -d @contacts.csv https://example.com"), "This command may send data to an external service.");
  assert.equal(commandApprovalReason("node build.js"), null);
  assert.equal(commandApprovalReason("git restore src/app.ts"), "This terminal command may publish or rewrite project work.");
});

test("destructive and external actions wait for the user", () => {
  assert.equal(approvalReason("Delete all the draft files"), "This may delete files or data.");
  assert.equal(
    approvalReason("Publish the website for me"),
    "This may publish work outside your computer.",
  );
  assert.equal(
    approvalReason("Send an email to the client"),
    "This may communicate with other people.",
  );
  assert.equal(
    approvalReason("Buy the premium plan"),
    "This may spend money or start a subscription.",
  );
});
