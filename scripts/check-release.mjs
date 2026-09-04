import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const packageLock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const database = readFileSync(new URL("../src/server/database.ts", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../src/server/runtime.ts", import.meta.url), "utf8");
const skillLibrary = readFileSync(new URL("../src/server/skill-library.ts", import.meta.url), "utf8");
const runner = readFileSync(new URL("../src/server/opencode.ts", import.meta.url), "utf8");
const backgroundService = readFileSync(new URL("../src/server/background-service.ts", import.meta.url), "utf8");
const deployment = readFileSync(new URL("../src/server/deployment.ts", import.meta.url), "utf8");
const authSecurity = readFileSync(new URL("../src/server/auth-security.ts", import.meta.url), "utf8");
const runnerCare = readFileSync(new URL("../src/server/runner-care.ts", import.meta.url), "utf8");
const externalHeartbeat = readFileSync(new URL("../src/server/external-heartbeat.ts", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../src/server/notifications.ts", import.meta.url), "utf8");
const apns = readFileSync(new URL("../src/server/apns.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("../src/server/index.ts", import.meta.url), "utf8");
const connectorManifests = readFileSync(new URL("../src/server/connectors.ts", import.meta.url), "utf8");
const connectorEvents = readFileSync(new URL("../src/server/connector-events.ts", import.meta.url), "utf8");
const connectorContract = readFileSync(new URL("../docs/CONNECTOR_CONTRACT.md", import.meta.url), "utf8");
const todoist = readFileSync(new URL("../src/server/todoist.ts", import.meta.url), "utf8");
const dropbox = readFileSync(new URL("../src/server/dropbox.ts", import.meta.url), "utf8");
const serviceWorker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const privateRunnerDockerfile = readFileSync(new URL("../deploy/private-runner/Dockerfile", import.meta.url), "utf8");
const privateRunnerCompose = readFileSync(new URL("../deploy/private-runner/docker-compose.yml", import.meta.url), "utf8");
const privateRunnerCaddy = readFileSync(new URL("../deploy/private-runner/Caddyfile", import.meta.url), "utf8");
const privateRunnerGuide = readFileSync(new URL("../deploy/private-runner/README.md", import.meta.url), "utf8");
const privateRunnerBackup = readFileSync(new URL("../deploy/private-runner/backup.sh", import.meta.url), "utf8");
const privateRunnerUpdate = readFileSync(new URL("../deploy/private-runner/update.sh", import.meta.url), "utf8");
const privateRunnerTransfer = readFileSync(new URL("../deploy/private-runner/home-transfer.mjs", import.meta.url), "utf8");
const privateRunnerExport = readFileSync(new URL("../deploy/private-runner/export-home.sh", import.meta.url), "utf8");
const privateRunnerImport = readFileSync(new URL("../deploy/private-runner/import-home.sh", import.meta.url), "utf8");
const verifyWorkflow = readFileSync(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8");
const nativeModels = readFileSync(new URL("../ios/OpenBotMobile/Models/StudioModels.swift", import.meta.url), "utf8");
const nativeStudio = readFileSync(new URL("../ios/OpenBotMobile/Views/StudioContainerView.swift", import.meta.url), "utf8");
const version = packageJson.version;
const failures = [];

if (packageLock.version !== version || packageLock.packages?.[""]?.version !== version) {
  failures.push(`package-lock.json must use version ${version}.`);
}
if (!readme.startsWith(`# OpenBot ${version}\n`)) {
  failures.push(`README.md must start with “# OpenBot ${version}”.`);
}
if (!readme.includes(`## What's new in ${version}\n`)) {
  failures.push(`README.md must contain “## What's new in ${version}”.`);
}
if (!connectorManifests.includes('service: "todoist"') || !connectorManifests.includes('service: "dropbox"') || !todoist.includes("oauth/register") || !dropbox.includes("files.content.read")) {
  failures.push("Todoist and read-only Dropbox must remain registered through the reviewed connector contract.");
}
if (!app.includes("room-cluster-motion") || !app.includes("mascot-presence") || !app.includes("mascot-body")) {
  failures.push("The shared studio must keep its independently animated mascot composition.");
}
if (app.includes('/mascots/') || app.includes('className="mascot-art"')) {
  failures.push("Mascots must remain code-drawn and recolorable rather than image-backed.");
}
if (!app.includes("MASCOT_COLORS") || !app.includes('type="color"') || !database.includes('patch.color ?? current.color')) {
  failures.push("Existing teammate appearance customization must remain editable and persistent.");
}
if (!styles.includes(".mascot-state-celebrating .mascot-eye") || !styles.includes("prefers-reduced-motion")) {
  failures.push("The web mascot system must keep celebration and reduced-motion states.");
}
if (!app.includes("function LiveStudioPanel") || !app.includes("function LiveBrowser") || !app.includes('panel === "live"')) {
  failures.push("The release must keep the Live Studio and visible owner browser takeover.");
}
if (!app.includes("function SearchPanel") || !database.includes("searchStudio(rawQuery") || !database.includes("toggleMessageReaction")) {
  failures.push("The release must keep studio-wide search, replies, and reactions.");
}
if (!database.includes("updateThread(id") || !database.includes("duplicateBot(id")) {
  failures.push("The release must keep persistent sections, pins, hide/restore, and safe teammate duplication.");
}
if (!styles.includes(".live-desk-grid") || !styles.includes(".studio-search-results") || !styles.includes(".conversation-organizer")) {
  failures.push("The Live Studio, search, and conversation organization surfaces must remain styled responsively.");
}
if (!database.includes("CREATE TABLE IF NOT EXISTS workflow_versions") || !database.includes("reviseWorkflowRecord") || !database.includes("listWorkflowVersions")) {
  failures.push("The Skill Library must keep immutable versions and non-destructive rollback support.");
}
if (!skillLibrary.includes('format: z.literal("openbot.skill")') || !skillLibrary.includes("createHash") || !skillLibrary.includes("skillSecretFindings")) {
  failures.push("Portable skills must keep their strict format, integrity check, and secret scanner.");
}
if (!runtime.includes("importTaughtWorkflow") || !runtime.includes("assignTaughtWorkflow") || !runtime.includes("rollbackTaughtWorkflow")) {
  failures.push("Portable skill import, teammate assignment, and rollback must remain connected to generated skill files.");
}
if (!app.includes("skill-owner-switcher") || !app.includes("Import reviewed skill") || !app.includes("Useful starters") || !styles.includes(".skill-template-grid")) {
  failures.push("The responsive Skill Library management experience is incomplete.");
}
if (!database.includes("CREATE TABLE IF NOT EXISTS runner_state") || !database.includes("claimNextQueuedRun") || !database.includes("recoverExpiredRuns")) {
  failures.push("The durable runner lease, exclusive claim, or restart recovery store is incomplete.");
}
if (!runner.includes("maintainLeadership") || !runner.includes("renewRunLeases") || !runner.includes("requeueWorkerRuns")) {
  failures.push("The model runner must keep exclusive leadership, renewable job leases, and graceful handoff.");
}
if (!backgroundService.includes("com.openbot.runner") || !backgroundService.includes("KeepAlive") || !backgroundService.includes("RunAtLoad")) {
  failures.push("The optional macOS background service is incomplete.");
}
if (!notifications.includes("sendNotification") || !database.includes("notification_outbox") || !serviceWorker.includes('addEventListener("push"')) {
  failures.push("Durable background notification delivery is incomplete.");
}
if (!notifications.includes("nativeStatus") || !apns.includes("api.push.apple.com") || !database.includes("native_push_devices") || !server.includes("/api/notifications/native")) {
  failures.push("Authenticated native APNs registration and durable delivery are incomplete.");
}
if (!server.includes("dispatchConnectorEvents") || !server.includes("todoist.activities") || !server.includes("dropbox.latestCursor") || !database.includes("automation_cursors")) {
  failures.push("Proactive Todoist and Dropbox event automation is incomplete.");
}
if (!server.includes('/api/connector-hooks/slack/') || !server.includes('/api/connector-hooks/notion/') || !connectorEvents.includes('verifySlackEventRequest') || !connectorEvents.includes('verifyNotionEventRequest')) {
  failures.push("Signed Slack and Notion event ingress is incomplete.");
}
if (!connectorManifests.includes('schemaVersion: 2') || !connectorManifests.includes('eventAuth: "provider_hmac"') || !connectorContract.includes("OpenBot Connector Contract v2") || !connectorContract.includes("does not download or execute arbitrary connector packages")) {
  failures.push("Connector manifest v2 or its reviewed admission boundary is incomplete.");
}
if (!app.includes('triggerType === "slack"') || !app.includes('triggerType === "notion"') || !styles.includes(".connector-event-setup")) {
  failures.push("Slack and Notion event setup must remain available in the responsive product UI.");
}
if (!dropbox.includes("code_challenge_method") || !dropbox.includes("code_verifier") || !dropbox.includes('body.set("client_id"')) {
  failures.push("Managed Dropbox OAuth must retain PKCE and public-client support.");
}
if (!app.includes("runner-card") || !styles.includes(".runner-presence") || !app.includes("Keep OpenBot running")) {
  failures.push("The user-facing runner health and one-click protection experience is incomplete.");
}
if (!deployment.includes('requestedMode === "private_runner"') || !deployment.includes('url.protocol !== "https:"') || !deployment.includes("path.isAbsolute") || !server.includes("deploymentCallbackUrl")) {
  failures.push("Private runner mode must fail closed and use its canonical HTTPS address for public callbacks.");
}
if (!server.includes('/api/healthz') || !server.includes('app.set("trust proxy", 1)') || !server.includes("loginGate") || !authSecurity.includes("maximumFailures")) {
  failures.push("Private-host health, proxy-aware Secure cookies, or login throttling is incomplete.");
}
if (!privateRunnerDockerfile.includes("USER node") || !privateRunnerDockerfile.includes("opencode-ai@") || !privateRunnerDockerfile.includes("chromium") || !privateRunnerCompose.includes("caddy:2.10.2-alpine") || !privateRunnerCompose.includes("/var/run/docker.sock") || privateRunnerCompose.includes('4311:4311')) {
  failures.push("The private runner must package its tools, run OpenBot without root, persist work, and keep the plain app port private.");
}
if (!packageJson.dependencies?.tsx || packageJson.devDependencies?.tsx || !privateRunnerDockerfile.includes("npm prune --omit=dev") || !verifyWorkflow.includes("Smoke test private runner image") || !verifyWorkflow.includes("/api/healthz") || !verifyWorkflow.includes("/api/runner/diagnostics") || !verifyWorkflow.includes('require("./package.json").version')) {
  failures.push("The pruned private-runner image must keep its TypeScript launcher and pass a real container startup smoke test in CI.");
}
if (!privateRunnerCaddy.includes("Strict-Transport-Security") || !privateRunnerCaddy.includes("X-Frame-Options") || !privateRunnerGuide.includes("dedicated server") || !privateRunnerGuide.includes("one authoritative data location")) {
  failures.push("The private-runner HTTPS and ownership guidance is incomplete.");
}
if (!app.includes("Private always-on home") || !styles.includes(".private-runner-guide") || !nativeModels.includes("StudioDeployment") || !nativeStudio.includes("PRIVATE ALWAYS-ON HOME")) {
  failures.push("Web and native apps must share the private-runner status and data-location experience.");
}
if (!server.includes('/api/runner/diagnostics') || !runnerCare.includes('statfsSync') || !runnerCare.includes('timeout: 5_000') || !runnerCare.includes('runner-maintenance.json') || !app.includes('runner-care-grid') || !app.includes('private-domain-field')) {
  failures.push("Authenticated private-home storage, backup, tool diagnostics, and guided setup are incomplete.");
}
if (!privateRunnerBackup.includes('lastBackupAt') || !privateRunnerBackup.includes('lastBackupBytes') || !privateRunnerBackup.includes('runner-maintenance.json') || !nativeModels.includes('StudioRunnerCare') || !nativeStudio.includes('checkRunnerCare')) {
  failures.push("Backup health receipts and matching native private-home care are incomplete.");
}
if (!privateRunnerUpdate.includes('backup.sh') || !privateRunnerUpdate.includes('merge-base --is-ancestor') || !privateRunnerUpdate.includes('status --porcelain') || !privateRunnerUpdate.includes('previous_image') || !privateRunnerUpdate.includes('wait_for_healthy') || privateRunnerUpdate.indexOf('backup.sh') > privateRunnerUpdate.indexOf('merge --ff-only')) {
  failures.push("Private-runner updates must refuse unsafe source state, back up before advancing, verify health, and retain automatic container recovery.");
}
if (!server.includes('/api/runner/diagnostics/alerts') || !app.includes('runner-health-alerts') || !nativeModels.includes('StudioRunnerHealthAlerts') || !nativeStudio.includes('setRunnerHealthAlerts')) {
  failures.push("Opt-in private-home health alerts must remain available on web and native clients.");
}
if (!server.includes('/api/runner/diagnostics/heartbeat') || !database.includes('this.vault.encrypt(url)') || !externalHeartbeat.includes('protocol !== "https:"') || !externalHeartbeat.includes('lookup(hostname') || !app.includes('runner-external-heartbeat') || !nativeModels.includes('StudioRunnerExternalHeartbeat') || !nativeStudio.includes('setExternalHeartbeat')) {
  failures.push("Opt-in outside-in private-home monitoring must keep encrypted storage, HTTPS/public-network validation, and matching web/native controls.");
}
if (!privateRunnerTransfer.includes('aes-256-gcm') || !privateRunnerTransfer.includes('scryptSync') || !privateRunnerTransfer.includes('setAAD') || !privateRunnerTransfer.includes('safeArchiveKinds') || !privateRunnerExport.includes('home-transfer.mjs export') || !privateRunnerImport.includes('backup.sh') || !privateRunnerImport.includes('wait_for_healthy') || !privateRunnerImport.includes('rollback')) {
  failures.push("Encrypted whole-home export/import must authenticate before extraction, constrain archive contents, back up before swapping, verify health, and retain rollback.");
}
if (!privateRunnerCompose.includes('/transfers:') || !app.includes('export-home.sh') || !app.includes('import-home.sh')) {
  failures.push("The private runner and web product must expose the reviewed encrypted home-transfer path.");
}
if (!app.includes("function StudioStartup") || !app.includes("Open the running studio") || !styles.includes(".splash-stage")) {
  failures.push("The friendly automatic startup-recovery experience is incomplete.");
}
if (!app.includes("oauth-setup-disclosure") || !styles.includes(".oauth-setup-disclosure")) {
  failures.push("Developer connector credentials must remain progressively disclosed instead of overwhelming the main app catalog.");
}

if (failures.length) {
  console.error(`Release documentation check failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log(`Release documentation matches OpenBot ${version}.`);
