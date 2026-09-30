import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { AppleApps } from "./mac-apple-apps.js";
import { decodeWords, MacMail, MailAccessError, parseEmlx } from "./mac-mail-index.js";

const pdf = Buffer.from("%PDF-1.4 fake invoice bytes");
function emlx(message: string) { const body = Buffer.from(message.replace(/\n/g, "\r\n"), "utf8"); return Buffer.concat([Buffer.from(`${body.length}\n`), body, Buffer.from("<?xml version=\"1.0\"?><plist><dict/></plist>")]); }
const invoice = emlx(`From: Figma <billing@figma.com>
Subject: =?utf-8?B?WW91ciBGaWdtYSBpbnZvaWNlIOKAkyBTZXB0ZW1iZXI=?=
Date: Tue, 29 Sep 2026 08:00:00 +0000
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="b1"

--b1
Content-Type: multipart/alternative; boundary="b2"

--b2
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: quoted-printable

<p>Amount due: =E2=82=AC45.00</p><p>Due Friday</p>
--b2--
--b1
Content-Type: application/pdf; name="invoice.pdf"
Content-Disposition: attachment; filename*=utf-8''Figma%20invoice%20Sept.pdf
Content-Transfer-Encoding: base64

${pdf.toString("base64")}
--b1--
`);

test("parses subject words, HTML text and an RFC 2231 attachment name", () => {
  const parsed = parseEmlx(invoice);
  assert.equal(parsed.subject, "Your Figma invoice – September");
  assert.equal(parsed.from, "Figma <billing@figma.com>");
  assert.match(parsed.text, /Amount due: €45\.00\nDue Friday/);
  assert.deepEqual(parsed.attachments.map((item) => [item.name, item.size]), [["Figma invoice Sept.pdf", pdf.length]]);
  assert.equal(decodeWords("=?iso-8859-1?Q?Caf=E9_Wien?="), "Café Wien");
});

function mailbox() {
  const home = mkdtempSync(path.join(tmpdir(), "openbot-mail-"));
  const messages = path.join(home, "Library/Mail/V10/ACCOUNT/INBOX.mbox/UUID/Data/1/2/Messages");
  mkdirSync(messages, { recursive: true });
  const file = path.join(messages, "4242.emlx");
  writeFileSync(file, invoice);
  // A partial message whose attachment lives in Mail's Attachments folder.
  const partial = path.join(messages, "4343.partial.emlx");
  // As Mail stores it: an empty placeholder part named like the attachment.
  writeFileSync(partial, emlx("From: Hotel <desk@hotel.example>\nSubject: Booking\nDate: Mon, 28 Sep 2026 10:00:00 +0000\nContent-Type: multipart/mixed; boundary=\"p\"\n\n--p\nContent-Type: text/plain\n\nSee attached.\n--p\nContent-Type: application/pdf; name=\"booking.pdf\"\nContent-Disposition: attachment; filename=\"booking.pdf\"\nContent-Transfer-Encoding: base64\n\n\n--p--\n"));
  const attachments = path.join(home, "Library/Mail/V10/ACCOUNT/INBOX.mbox/UUID/Data/1/2/Attachments/4343/2");
  mkdirSync(attachments, { recursive: true });
  writeFileSync(path.join(attachments, "booking.pdf"), "booking-bytes");
  return { home, file, partial };
}

test("search reads Mail's newest files, matches any word, and never scripts Mail", async () => {
  const { home } = mailbox();
  const mail = new MacMail(home, "darwin");
  try {
    const result = await mail.search("figma \"receipt\"*", 3650, 5);
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0]!.id, "4242");
    assert.equal(result.messages[0]!.subject, "Your Figma invoice – September");
    assert.deepEqual(result.messages[0]!.attachments, [{ name: "Figma invoice Sept.pdf", size: pdf.length }]);
    assert.deepEqual((await mail.search("booking", 3650)).messages[0]!.attachments, [{ name: "booking.pdf", size: "booking-bytes".length }]);
    assert.equal((await mail.search("nothing-like-this", 3650)).matched, 0);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("attachments are saved as copies, inline or from Mail's Attachments folder, never overwriting", async () => {
  const { home } = mailbox();
  const apps = new AppleApps(async () => "", "darwin", new MacMail(home, "darwin"));
  try {
    const first = await apps.saveMailAttachment({ id: "4242", attachment: "Figma invoice Sept.pdf", folder: "Documents/Receipts" }, home);
    assert.equal(first.saved, path.join(home, "Documents/Receipts/Figma invoice Sept.pdf"));
    assert.deepEqual(readFileSync(first.saved), pdf);
    const second = await apps.saveMailAttachment({ id: "4242", attachment: "Figma invoice Sept.pdf", folder: "Documents/Receipts" }, home);
    assert.equal(path.basename(second.saved), "Figma invoice Sept 2.pdf");
    const separate = await apps.saveMailAttachment({ id: "4343", attachment: "booking.pdf", folder: "Documents/Trips" }, home);
    assert.equal(readFileSync(separate.saved, "utf8"), "booking-bytes");
    await assert.rejects(() => apps.saveMailAttachment({ id: "4242", attachment: "other.pdf", folder: "Documents" }, home), /Its attachments: Figma invoice Sept\.pdf/);
    await assert.rejects(() => apps.saveMailAttachment({ id: "4242", attachment: "Figma invoice Sept.pdf", folder: "../../etc" }, home));
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("without Full Disk Access, the owner is told exactly what to switch on", async () => {
  const home = mkdtempSync(path.join(tmpdir(), "openbot-nomail-"));
  try {
    const mail = new MacMail(home, "darwin");
    await assert.rejects(() => mail.search("invoice"), (error) => error instanceof MailAccessError && /Full Disk Access/.test(error.message));
  } finally { rmSync(home, { recursive: true, force: true }); }
});
