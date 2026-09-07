import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const required = [
  "macos/project.yml",
  "macos/OpenBotDesktop.xcodeproj/project.pbxproj",
  "macos/OpenBotDesktop/App/OpenBotDesktopApp.swift",
  "macos/OpenBotDesktop/Models/DesktopConnectionSession.swift",
  "macos/OpenBotDesktop/Models/DesktopRunnerController.swift",
  "macos/OpenBotDesktop/Models/DesktopNotifications.swift",
  "macos/OpenBotDesktop/Views/DesktopRootView.swift",
  "macos/OpenBotDesktop/Views/DesktopStudioView.swift",
  "macos/OpenBotDesktop/Views/DesktopConversationView.swift",
  "macos/OpenBotDesktop/Views/DesktopWorkView.swift",
  "macos/OpenBotDesktop/Views/DesktopBrowserControlView.swift",
  "macos/OpenBotDesktop/Views/DesktopAutomationsView.swift",
  "macos/OpenBotDesktop/Views/DesktopProvidersView.swift",
  "macos/OpenBotDesktop/Views/DesktopCodeProjectsView.swift",
  "macos/OpenBotDesktop/Views/DesktopPermissionsView.swift",
  "macos/OpenBotDesktop/Views/DesktopConnectorsView.swift",
  "macos/OpenBotDesktop/Views/DesktopSkillsView.swift",
  "macos/OpenBotDesktop/Views/DesktopTeachView.swift",
  "macos/OpenBotDesktop/Views/DesktopTeammatesView.swift",
  "macos/OpenBotDesktop/Views/DesktopFilesView.swift",
  "macos/OpenBotDesktop/Views/DesktopSearchView.swift",
  "macos/OpenBotDesktop/Views/DesktopMascotView.swift",
  "macos/OpenBotDesktop/Resources/Info.plist",
  "macos/OpenBotDesktopTests/OpenBotDesktopTests.swift",
  "macos/README.md",
  "scripts/package-macos-app.mjs",
  "ios/OpenBotMobile/Models/ConnectionAddress.swift",
  "ios/OpenBotMobile/Models/StudioAPIClient.swift",
  "ios/OpenBotMobile/Models/StudioModels.swift",
  "ios/OpenBotMobile/Models/StudioPalette.swift",
  "ios/OpenBotMobile/Models/StudioBrandMark.swift",
  "ios/OpenBotMobile/Models/StudioApprovalReviewModel.swift",
  "ios/OpenBotMobile/Views/StudioApprovalReview.swift",
  "ios/OpenBotMobile/Models/StudioStore.swift",
  "ios/OpenBotMobile/Security/KeychainStore.swift",
];

const missing = required.filter((file) => !existsSync(path.join(root, file)));
if (missing.length) throw new Error(`Missing macOS release files:\n${missing.join("\n")}`);

const project = readFileSync(path.join(root, "macos/project.yml"), "utf8");
const generatedProject = readFileSync(path.join(root, "macos/OpenBotDesktop.xcodeproj/project.pbxproj"), "utf8");
const plist = readFileSync(path.join(root, "macos/OpenBotDesktop/Resources/Info.plist"), "utf8");
const backgroundRunner = readFileSync(path.join(root, "scripts/background-runner.mjs"), "utf8");
const swift = required
  .filter((file) => file.endsWith(".swift") && !file.includes("Tests/"))
  .map((file) => readFileSync(path.join(root, file), "utf8"))
  .join("\n");

if (!project.includes(`MARKETING_VERSION: ${packageJson.version}`)) throw new Error(`The macOS marketing version is not ${packageJson.version}.`);
const buildNumber = project.match(/CURRENT_PROJECT_VERSION:\s*(\d+)/)?.[1];
if (!buildNumber || !generatedProject.includes(`CURRENT_PROJECT_VERSION = ${buildNumber};`) || !generatedProject.includes(`MARKETING_VERSION = ${packageJson.version};`)) {
  throw new Error("The generated macOS project version is out of sync with project.yml and package.json.");
}
if (!project.includes("app.openbot.desktop") || !plist.includes("NSAllowsLocalNetworking") || !plist.includes("<string>openbot</string>")) {
  throw new Error("The native macOS bundle identity, local-network declaration, or safe connection deep link is missing.");
}
if (!swift.includes("NSWindow(") || !swift.includes("NSHostingController") || !swift.includes("NavigationSplitView")) {
  throw new Error("The macOS app must keep a native AppKit/SwiftUI window and desktop navigation.");
}
if (swift.includes("WebKit") || swift.includes("WKWebView") || swift.includes("StudioWebView")) {
  throw new Error("The macOS experience must remain native rather than embedding the web app.");
}
if (swift.includes(".preferredColorScheme(.light)")) throw new Error("The Mac app must respect system appearance rather than force light mode.");
if (!swift.includes("StudioStore(serverURL: serverURL, accessKey: accessKey)") || !swift.includes("clientAccessKey") || !swift.includes("app.openbot.desktop")) {
  throw new Error("The macOS authenticated API session or dedicated Keychain identity is incomplete.");
}
if (!swift.includes("connectToThisMac") || !swift.includes('url.appending(path: "api/access")') || !swift.includes("ConnectionAddress.isLoopback")) {
  throw new Error("The Mac app must keep its loopback-only one-click local pairing path.");
}
if (!swift.includes("DesktopRunnerController") || !swift.includes("ensureLocalRunner") || !swift.includes('resourceURL?.appending(path: "OpenBotRuntime")') || !swift.includes("try child.run()")) {
  throw new Error("The native Mac app must be able to start its packaged private runner without Terminal.");
}
const macPackage = readFileSync(path.join(root, "scripts/package-macos-app.mjs"), "utf8");
if (!macPackage.includes('"OpenBotRuntime"') || !macPackage.includes("process.execPath") || !macPackage.includes('"--verify", "--deep", "--strict"')) {
  throw new Error("The macOS package must include its Node runner and verify the final app signature.");
}
if (!swift.includes("UNUserNotificationCenter") || !swift.includes("postAttention") || !swift.includes("Notify me when OpenBot needs a decision")) {
  throw new Error("The native Mac attention-notification path is incomplete.");
}
if (!swift.includes("DesktopWorkView") || !swift.includes("DesktopLiveView") || !swift.includes("Action history") || !swift.includes("resolveApprovedAction")) {
  throw new Error("Native work, live supervision, or crash-recovery controls are incomplete.");
}
if (!swift.includes("setBackgroundProtection") || !swift.includes("Protect this Mac")) {
  throw new Error("The native Mac app must expose existing runner background protection.");
}
if (!backgroundRunner.includes("detached: true") || !backgroundRunner.includes("process.kill(-child.pid") || !backgroundRunner.includes("const deadline = setTimeout")) {
  throw new Error("The background runner must stop the complete server process group during upgrades and restarts.");
}
if (!swift.includes("DesktopAutomationsView") || !swift.includes("saveRoutine") || !swift.includes("setRoutineEnabled") || !swift.includes("deleteRoutine") || !swift.includes("rotateRoutineSecret") || !swift.includes("Run this routine now?")) {
  throw new Error("Native automation creation, editing, deletion, secret rotation, pause/resume, or confirmed run-now controls are incomplete.");
}
if (!["Google Calendar", "GitHub", "Signed webhook", "Todoist", "Dropbox", "Slack", "Notion"].every((label) => swift.includes(label))) {
  throw new Error("Native connected-app automation triggers are incomplete.");
}
if (!swift.includes("DesktopProvidersView") || !swift.includes("beginProviderConnection") || !swift.includes("finishProviderConnection") || !swift.includes("saveAPIProvider") || !swift.includes("deleteAPIProvider")) {
  throw new Error("Native subscription, API, or local-model connection controls are incomplete.");
}
if (!swift.includes('case "connections", "providers"') || !swift.includes("openBotShowProviders")) {
  throw new Error("Native AI connections must remain addressable from the app lifecycle.");
}
if (!swift.includes("DesktopCodeProjectsView") || !swift.includes("connectCodeProject") || !swift.includes("setCodeProjectAccess") || !swift.includes("disconnectCodeProject") || !swift.includes("reviewCodeProject") || !swift.includes("restoreCodeProjectEdit")) {
  throw new Error("Native code-project connection and teammate access controls are incomplete.");
}
if (!swift.includes('case "projects", "code-projects"') || !swift.includes("openBotShowCodeProjects")) {
  throw new Error("Native code projects must remain addressable from the app lifecycle.");
}
if (!swift.includes("DesktopPermissionsView") || !swift.includes("setMacAccessEnabled") || !swift.includes("setBotCapabilities")) {
  throw new Error("Native Mac, computer, and browser capability controls are incomplete.");
}
if (!swift.includes("setBotProvider") || !swift.includes("Teammate models")) {
  throw new Error("Native provider-to-teammate assignment is incomplete.");
}
if (!swift.includes("DesktopConnectorsView") || !swift.includes("beginConnectorConnection") || !swift.includes("setConnectorAccess") || !swift.includes("disconnectConnector")) {
  throw new Error("Native app connection and teammate permission controls are incomplete.");
}
if (!swift.includes('case "connectors", "apps"') || !swift.includes("openBotShowConnectors")) {
  throw new Error("Native apps and tools must remain addressable from the app lifecycle.");
}
if (!swift.includes("DesktopSkillsView") || !swift.includes("installSkillTemplate") || !swift.includes("assignSkill") || !swift.includes("importSkill") || !swift.includes("exportSkill") || !swift.includes("skillVersions") || !swift.includes("rollbackSkill") || !swift.includes("deleteSkill")) {
  throw new Error("Native portable skill administration is incomplete.");
}
if (!swift.includes('case "skills"') || !swift.includes("openBotShowSkills")) {
  throw new Error("Native Skill Library must remain addressable from the app lifecycle.");
}
if (!swift.includes("DesktopTeachView") || !swift.includes("startTeaching") || !swift.includes("stopTeaching") || !swift.includes("teachingClick") || !swift.includes("Private keyboard")) {
  throw new Error("Native browser skill teaching and private takeover controls are incomplete.");
}
if (!swift.includes("DesktopBrowserControlView") || !swift.includes("openBrowser") || !swift.includes("browserClick") || !swift.includes("Control browser")) {
  throw new Error("Native live browser preview and takeover controls are incomplete.");
}
if (!swift.includes('case "teach"') || !swift.includes("openBotShowTeach")) {
  throw new Error("Native skill teaching must remain addressable from the app lifecycle.");
}
if (!swift.includes("DesktopTeammatesView") || !swift.includes("saveBot") || !swift.includes("duplicateBot") || !swift.includes("Weekly token budget") || !swift.includes("ColorPicker")) {
  throw new Error("Native teammate creation, duplication, personality, mascot, model, and budget controls are incomplete.");
}
if (!swift.includes('case "teammates", "bots"') || !swift.includes("openBotShowTeammates")) {
  throw new Error("Native teammate administration must remain addressable from the app lifecycle.");
}
if (!swift.includes("DesktopFilesView") || !swift.includes("workspaceFiles") || !swift.includes("openWorkspaceFile") || !swift.includes("selected teammate's private workspace")) {
  throw new Error("Native read-only teammate workspace browsing is incomplete.");
}
if (!swift.includes('case "files", "workspace"') || !swift.includes("openBotShowFiles")) {
  throw new Error("Native workspace files must remain addressable from the app lifecycle.");
}
if (!swift.includes("DesktopSearchView") || !swift.includes("searchStudio") || !swift.includes("opens the original conversation")) {
  throw new Error("Native private studio search is incomplete.");
}
if (!swift.includes('case "search"') || !swift.includes("openBotShowSearch")) {
  throw new Error("Native studio search must remain addressable from the app lifecycle.");
}
if (!swift.includes('case "automations"') || !swift.includes("openBotShowAutomations")) {
  throw new Error("Native work, live, and automation destinations must remain addressable from the app lifecycle.");
}
if (!swift.includes("fileImporter") || !swift.includes("saveDraft") || !swift.includes("keyboardShortcut(.return, modifiers: [.command])")) {
  throw new Error("Native attachments, draft continuity, or keyboard sending are incomplete.");
}
if (!swift.includes("toggleMessageReaction") || !swift.includes("Replying to") || !swift.includes('Menu("React")')) {
  throw new Error("Native conversation replies and reactions are incomplete.");
}
if (!swift.includes("writeConnected") || !swift.includes('Button("Reconnect")') || !swift.includes("connectorSupportsWrite")) {
  throw new Error("Native Google creation grants must stay scope-aware and reconnectable.");
}
if (!swift.includes("accessibilityReduceMotion") || !swift.includes("StudioCharacter") || swift.includes('Image("Mascot')) {
  throw new Error("Native desktop mascots must remain code-drawn, animated, and reduced-motion aware.");
}
if (/access[_ -]?key\s*[=:]\s*["'][A-Za-z0-9_-]{12,}/i.test(swift)) throw new Error("A possible access key was embedded in macOS source.");

console.log("macOS source-contract checks passed. This validates native structure and release invariants; Xcode build and tests are separate gates.");
