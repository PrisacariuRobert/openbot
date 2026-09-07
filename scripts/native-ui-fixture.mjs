// Disposable loopback-only native visual QA. No database, files, providers or tools.
import http from "node:http";

const key = "native-visual-fixture-only-0000000000000000";
const now = "2026-09-06T09:41:00.000Z";
const shapes = ["nova", "blob", "sprout", "orbit", "pebble", "sunny"];
const colors = ["#6757d9", "#d86889", "#299575", "#528ed1", "#687588", "#c28735"];
const names = ["Nova", "Milo", "Fern", "Orbit", "Pebble", "Sunny"];
const bots = shapes.map((mascot, index) => ({ id: `bot-${index}`, name: names[index], mascot, color: colors[index], role: index ? "Your personal teammate" : "Research and planning", status: "ready", threadId: `thread-${index}` }));
const threads = bots.map((bot, index) => ({ id: bot.threadId, title: bot.name, kind: "direct", botId: bot.id, updatedAt: now, lastMessage: index ? "Ready when you are." : "Your meeting brief is ready to review.", lastMessageAt: now }));
const attentionQA = process.argv.includes("--attention");
const studioRuns = attentionQA ? [{ id: "fixture-failed", threadId: threads[1].id, botId: bots[1].id, botName: bots[1].name, botMascot: bots[1].mascot, botColor: bots[1].color, attemptCount: 1, status: "failed", error: "The sample task stopped. Open the conversation to review it." }] : [];
const automationAlerts = attentionQA ? [{ id: "fixture-alert", routineId: "fixture-routine", routineName: "Sample routine", message: "The sample routine needs your attention.", resolvedAt: null }] : [];
const drafts = new Map();
const json = (response, status, body) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); response.end(JSON.stringify(body)); };
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/native-visual-fixture") return json(response, 200, { fixture: "openbot-native-visual-only", key, attention: attentionQA ? "included" : "none", progress: "included" });
  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    let body = ""; for await (const chunk of request) body += chunk;
    return json(response, JSON.parse(body).token === key ? 200 : 401, { ok: true });
  }
  if (request.headers.authorization !== `Bearer ${key}`) return json(response, 401, { error: "Synthetic fixture key required." });
  if (url.pathname === "/api/events") { response.writeHead(200, { "Content-Type": "text/event-stream" }); response.write(": fixture connected\n\n"); return; }
  if (url.pathname === "/api/connectors") return json(response, 200, { catalog: [] });
  if (url.pathname === "/api/provider") return json(response, 200, { connected: false, cliAvailable: false, defaultModel: "", models: [], note: "Synthetic visual fixture; no provider or tools are installed.", instances: [], catalog: [], loginAttempts: [] });
  if (url.pathname.startsWith("/api/drafts/") && request.method === "PUT") {
    let body = ""; for await (const chunk of request) body += chunk;
    const threadId = decodeURIComponent(url.pathname.split("/").pop());
    const draft = { threadId, body: JSON.parse(body).body, source: "ios", updatedAt: new Date().toISOString() };
    drafts.set(threadId, draft); return json(response, 200, draft);
  }
  if (url.pathname === "/api/state") {
    const thread = threads.find((item) => item.id === url.searchParams.get("threadId")) ?? threads[0];
    const bot = bots.find((item) => item.id === thread.botId);
    const message = (id, senderType, body) => ({ id, threadId: thread.id, senderType, senderId: senderType === "bot" ? bot.id : null, senderName: senderType === "bot" ? bot.name : "You", body, createdAt: now, attachments: [], progressUpdates: senderType === "bot" ? ["I’m checking the sample notes you provided."] : [] });
    return json(response, 200, { bots, threads, messages: [message("user-1", "user", "Help me prepare for tomorrow’s design review."), message("bot-1", "bot", "I’ve brought the key decisions together.\n\n**For tomorrow**\n- Review the simplified onboarding.\n- Confirm the three changes we want to test.\n- Keep time for open questions.\n\nThe brief is ready whenever you are.")], runs: studioRuns.filter(run => run.threadId === thread.id), studioRuns, automationAlerts, approvals: [], workflows: [], draft: drafts.get(thread.id) ?? { threadId: thread.id, body: "", source: null, updatedAt: null }, usage: { totalTokens: 0, completedRuns: 1, activeRuns: 0 }, activeThreadId: thread.id });
  }
  // A visual fixture must never execute or pretend to execute an action.
  return json(response, 405, { error: "This read-only visual fixture does not execute actions." });
});
server.listen(0, "127.0.0.1", () => console.log(`http://127.0.0.1:${server.address().port}`));
process.on("SIGTERM", () => { server.closeAllConnections(); server.close(); });
