import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** "Hey Siri, Ask OpenBot": a signed Shortcut that asks for a request (spoken
 * through Siri or typed), sends it to this studio with its own device key,
 * and speaks the answer. The Mac signs it with its own `shortcuts` tool so
 * the iPhone imports it without any App Store app. */

type Plist = string | number | boolean | Plist[] | { [key: string]: Plist };

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function plist(value: Plist): string {
  if (typeof value === "string") return `<string>${escape(value)}</string>`;
  if (typeof value === "number") return Number.isInteger(value) ? `<integer>${value}</integer>` : `<real>${value}</real>`;
  if (typeof value === "boolean") return value ? "<true/>" : "<false/>";
  if (Array.isArray(value)) return `<array>${value.map(plist).join("")}</array>`;
  return `<dict>${Object.entries(value).map(([key, item]) => `<key>${escape(key)}</key>${plist(item)}`).join("")}</dict>`;
}

const text = (value: string): Plist => ({ Value: { string: value }, WFSerializationType: "WFTextTokenString" });
const variable = (uuid: string, name: string): Plist => ({ Value: { string: "￼", attachmentsByRange: { "{0, 1}": { OutputUUID: uuid, Type: "ActionOutput", OutputName: name } } }, WFSerializationType: "WFTextTokenString" });
const field = (key: string, value: Plist): Plist => ({ WFItemType: 0, WFKey: text(key), WFValue: value });

export function shortcutPlist(input: { askUrl: string; deviceKey: string; prompt?: string }): string {
  if (!/^https?:\/\//.test(input.askUrl)) throw new Error("The studio address must be http(s).");
  if (!/^obd_[A-Za-z0-9_-]{43}$/.test(input.deviceKey)) throw new Error("A device key is required.");
  const ask = randomUUID().toUpperCase(), fetched = randomUUID().toUpperCase(), answer = randomUUID().toUpperCase();
  const workflow: Plist = {
    WFWorkflowActions: [
      { WFWorkflowActionIdentifier: "is.workflow.actions.ask", WFWorkflowActionParameters: { UUID: ask, WFAskActionPrompt: input.prompt || "What should your team do?", WFInputType: "Text" } },
      { WFWorkflowActionIdentifier: "is.workflow.actions.downloadurl", WFWorkflowActionParameters: {
        UUID: fetched, WFURL: input.askUrl, WFHTTPMethod: "POST", WFHTTPBodyType: "JSON", ShowHeaders: true,
        WFHTTPHeaders: { Value: { WFDictionaryFieldValueItems: [field("Authorization", text(`Bearer ${input.deviceKey}`))] }, WFSerializationType: "WFDictionaryFieldValue" },
        WFJSONValues: { Value: { WFDictionaryFieldValueItems: [field("text", variable(ask, "Provided Input")), field("source", text("siri"))] }, WFSerializationType: "WFDictionaryFieldValue" },
      } },
      { WFWorkflowActionIdentifier: "is.workflow.actions.getvalueforkey", WFWorkflowActionParameters: { UUID: answer, WFDictionaryKey: "answer", WFInput: { Value: { OutputUUID: fetched, Type: "ActionOutput", OutputName: "Contents of URL" }, WFSerializationType: "WFTextTokenAttachment" } } },
      { WFWorkflowActionIdentifier: "is.workflow.actions.showresult", WFWorkflowActionParameters: { Text: variable(answer, "Dictionary Value") } },
    ],
    WFWorkflowClientVersion: "2605.0.5",
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowIcon: { WFWorkflowIconStartColor: 255, WFWorkflowIconGlyphNumber: 59511 },
    WFWorkflowTypes: ["WatchKit"],
    WFWorkflowInputContentItemClasses: [],
    WFWorkflowImportQuestions: [],
  };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">${plist(workflow)}</plist>\n`;
}

const run = (command: string, args: string[]) => new Promise<void>((resolve, reject) => {
  execFile(command, args, { timeout: 60_000 }, (error, _stdout, stderr) => error ? reject(new Error(String(stderr || error.message).trim().slice(0, 200))) : resolve());
});

/** Binary plist, signed for anyone to import. Needs macOS with Shortcuts. */
export async function signedShortcut(xml: string): Promise<Buffer> {
  if (process.platform !== "darwin") throw new Error("Siri shortcuts are made on a Mac.");
  const dir = mkdtempSync(path.join(tmpdir(), "openbot-siri-"));
  try {
    const source = path.join(dir, "source.plist"), unsigned = path.join(dir, "Ask OpenBot.shortcut"), signed = path.join(dir, "signed.shortcut");
    writeFileSync(source, xml, { mode: 0o600 });
    await run("plutil", ["-convert", "binary1", source, "-o", unsigned]);
    await run("shortcuts", ["sign", "--mode", "anyone", "--input", unsigned, "--output", signed]);
    return readFileSync(signed);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
