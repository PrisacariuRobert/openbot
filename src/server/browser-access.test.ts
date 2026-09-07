import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { OpenBotDatabase } from "./testing/database.js";
import {
  browserAccessStatus,
  browserAccessText,
  browserNavigationBlock,
  browserServiceForUrl,
  browserWebsiteBlock,
} from "./browser-access.js";
import { BrowserManager } from "./runtime.js";
import { prepareWorkspace } from "./workspace.js";
import { macFallbackAllowed } from "./mac-productivity.js";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "openbot-browser-access-"));
  const db = new OpenBotDatabase(root);
  return {
    root,
    db,
    close: () => {
      db.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test("missing connectors offer an enabled browser without inventing a login or enabling tools", () => {
  const { db, close } = fixture();
  try {
    const bot = db.getBot("nova")!;
    const status = browserAccessStatus(db, bot, true);
    const gmail = status.services.find((route) => route.service === "gmail")!;
    assert.equal(gmail.connectorState, "not-connected");
    assert.equal(gmail.browserState, "available-unverified");
    assert.equal(gmail.preferred, "browser");
    assert.equal(status.loginState, "unverified");
    assert.equal(status.profileScope, "teammate");
    assert.equal(db.getBotConnectorAccess(bot.id), null);
    assert.equal(
      browserWebsiteBlock(db, bot.id, "https://mail.google.com/mail/u/0"),
      null,
    );
    const workspace = prepareWorkspace(db, bot);
    const config = JSON.parse(
      readFileSync(path.join(workspace, "opencode.json"), "utf8"),
    );
    assert.equal(config.tools.gmail_search, false);
    assert.equal(config.tools.browser_open, true);
    const text = browserAccessText(db, bot);
    assert.match(text, /Login and account identity are unverified/);
    assert.match(text, /owner takeover/);
    assert.match(text, /Never extract cookies/);
  } finally {
    close();
  }
});

test("an authorized structured connector is preferred; missing OAuth scope is not browser denial", () => {
  const { db, close } = fixture();
  try {
    const bot = db.getBot("nova")!;
    db.configureGoogleConnector({
      clientId: "fixture.apps.googleusercontent.com",
    });
    db.completeGoogleConnector({
      accessToken: "fixture-only",
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
      accountEmail: "fixture@example.com",
    });
    db.setBotConnectorAccess(bot.id, { canRead: true, canSend: false });
    db.setBotConnectorAccess(
      bot.id,
      { canRead: true, canSend: false },
      "google-calendar",
    );
    const status = browserAccessStatus(db, bot, true);
    assert.equal(
      status.services.find((route) => route.service === "gmail")?.preferred,
      "connector",
    );
    assert.equal(
      status.services.find((route) => route.service === "google-calendar")
        ?.connectorState,
      "needs-attention",
    );
    assert.equal(
      status.services.find((route) => route.service === "google-calendar")
        ?.preferred,
      "browser",
    );
    assert.equal(
      status.loginState,
      "unverified",
      "API sign-in is not proof of a browser session",
    );
    assert.doesNotMatch(JSON.stringify(status), /fixture-only|fixture@example/);
  } finally {
    close();
  }
});

test("explicit read denial overrides a disconnected connector, enabled browser and Mac fallback", async () => {
  const { db, close } = fixture();
  const browser = new BrowserManager(db);
  try {
    db.configureGoogleConnector({
      clientId: "fixture.apps.googleusercontent.com",
    });
    db.setBotConnectorAccess("nova", { canRead: false, canSend: false });
    db.updateStudioSettings({ macAccessEnabled: true });
    const bot = db.getBot("nova")!;
    const route = browserAccessStatus(db, bot, true).services.find(
      (entry) => entry.service === "gmail",
    )!;
    assert.equal(route.preferred, "none");
    assert.equal(route.browserState, "read-denied");
    assert.equal(macFallbackAllowed(db, "nova", "gmail", true), false);
    assert.match(
      browserNavigationBlock(db, "nova", [
        "https://example.test/redirect",
        "https://mail.google.com/",
        "https://accounts.google.com/signin",
      ]) || "",
      /reading is turned off/,
      "A service redirect into a shared login page does not bypass its denial",
    );
    assert.match(
      browserAccessText(db, bot),
      /reading was explicitly turned off/,
    );
    await assert.rejects(
      browser.open("nova", "https://mail.google.com/mail/u/0/"),
      /reading is turned off/,
    );
    assert.equal(
      browserWebsiteBlock(db, "pixel", "https://mail.google.com/mail/u/0/"),
      null,
      "Another teammate's permissions are separate, not implicitly copied",
    );
    db.setBotConnectorAccess("nova", { canRead: true, canSend: false });
    assert.equal(
      browserWebsiteBlock(db, "nova", "https://mail.google.com/mail/u/0/"),
      null,
    );
  } finally {
    await browser.close();
    close();
  }
});

test("known service classification handles subdomains, trailing dots and legacy Calendar without lookalikes", () => {
  assert.equal(
    browserServiceForUrl("https://mail.google.com/mail/")?.service,
    "gmail",
  );
  assert.equal(
    browserServiceForUrl("https://MAIL.GOOGLE.COM./mail/")?.service,
    "gmail",
  );
  assert.equal(
    browserServiceForUrl("https://workspace.slack.com/")?.service,
    "slack",
  );
  assert.equal(
    browserServiceForUrl("https://www.google.com/calendar/u/0")?.service,
    "google-calendar",
  );
  assert.equal(
    browserServiceForUrl("https://www.google.com/search?q=calendar"),
    null,
  );
  assert.equal(
    browserServiceForUrl("https://mail.google.com.attacker.example/"),
    null,
  );
  assert.equal(
    browserServiceForUrl(
      "https://attacker.example/?next=https://mail.google.com",
    ),
    null,
  );
  assert.equal(browserServiceForUrl("not a URL"), null);
});

test("disabled or missing browser runtime never becomes advertised as ready", () => {
  const { db, close } = fixture();
  try {
    const bot = db.updateBot("nova", { browserEnabled: false })!;
    assert.ok(
      browserAccessStatus(db, bot, true).services.every(
        (entry) => entry.browserState === "off" && entry.preferred === "none",
      ),
    );
    const enabled = db.updateBot("nova", { browserEnabled: true })!;
    assert.ok(
      browserAccessStatus(db, enabled, false).services.every(
        (entry) =>
          entry.browserState === "unavailable" && entry.preferred === "none",
      ),
    );
    assert.equal(
      browserAccessStatus(db, enabled).runtimeAvailable,
      null,
      "Unknown runtime is not reported as tested",
    );
  } finally {
    close();
  }
});
