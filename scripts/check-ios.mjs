import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { appleMarketingVersion } from "./lib/release-version.mjs";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const required = [
  "ios/project.yml",
  "ios/OpenBotMobile.xcodeproj/project.pbxproj",
  "ios/OpenBotMobile/App/OpenBotMobileApp.swift",
  "ios/OpenBotMobile/Models/ConnectionAddress.swift",
  "ios/OpenBotMobile/Models/ConnectionSession.swift",
  "ios/OpenBotMobile/Models/PushRegistration.swift",
  "ios/OpenBotMobile/Models/StudioModels.swift",
  "ios/OpenBotMobile/Models/StudioAPIClient.swift",
  "ios/OpenBotMobile/Models/StudioStore.swift",
  "ios/OpenBotMobile/Models/StudioPalette.swift",
  "ios/OpenBotMobile/Models/StudioBrandMark.swift",
  "ios/OpenBotMobile/Models/StudioApprovalReviewModel.swift",
  "ios/OpenBotMobile/Models/VoiceCapture.swift",
  "ios/OpenBotMobile/Security/KeychainStore.swift",
  "ios/OpenBotMobile/Views/ConnectionView.swift",
  "ios/OpenBotMobile/Views/RootView.swift",
  "ios/OpenBotMobile/Views/PairingScannerView.swift",
  "ios/OpenBotMobile/Views/StudioContainerView.swift",
  "ios/OpenBotMobile/Views/NativeSettingsViews.swift",
  "ios/OpenBotMobile/Views/NativeTeamView.swift",
  "ios/OpenBotMobile/Views/StudioApprovalReview.swift",
  "ios/OpenBotMobile/Views/ComputerView.swift",
  "ios/OpenBotMobile/Resources/Info.plist",
  "ios/OpenBotMobile/Resources/PrivacyInfo.xcprivacy",
  "ios/OpenBotMobile/OpenBotMobile.entitlements",
  "ios/OpenBotShare/ShareViewController.swift",
  "ios/OpenBotShare/Info.plist",
  "ios/OpenBotShare/PrivacyInfo.xcprivacy",
  "ios/OpenBotShare/OpenBotShare.entitlements",
  "ios/Shared/OpenBotSharedInbox.swift",
  "ios/OpenBotMobile/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png",
  "ios/OpenBotMobileTests/ConnectionAddressTests.swift",
  "ios/OpenBotMobileUITests/OpenBotMobileUITests.swift",
];

const missing = required.filter((file) => !existsSync(path.join(root, file)));
if (missing.length) throw new Error(`Missing iOS release files:\n${missing.join("\n")}`);

const project = readFileSync(path.join(root, "ios/project.yml"), "utf8");
const plist = readFileSync(path.join(root, "ios/OpenBotMobile/Resources/Info.plist"), "utf8");
const privacy = readFileSync(path.join(root, "ios/OpenBotMobile/Resources/PrivacyInfo.xcprivacy"), "utf8");
const entitlements = readFileSync(path.join(root, "ios/OpenBotMobile/OpenBotMobile.entitlements"), "utf8");
const sharePlist = readFileSync(path.join(root, "ios/OpenBotShare/Info.plist"), "utf8");
const swift = required.filter((file) => file.endsWith(".swift")).map((file) => readFileSync(path.join(root, file), "utf8")).join("\n");
const marketingVersion = appleMarketingVersion(packageJson.version);
if (project.match(/MARKETING_VERSION:\s*(\S+)/)?.[1] !== marketingVersion) throw new Error(`The iOS marketing version is not ${marketingVersion}.`);
const buildNumber = project.match(/CURRENT_PROJECT_VERSION:\s*(\d+)/)?.[1];
const generatedProject = readFileSync(path.join(root, "ios/OpenBotMobile.xcodeproj/project.pbxproj"), "utf8");
if (!buildNumber || !generatedProject.includes(`CURRENT_PROJECT_VERSION = ${buildNumber};`) || !generatedProject.includes(`MARKETING_VERSION = ${marketingVersion};`)) throw new Error("The generated iOS project version is out of sync with project.yml and package.json.");
if (!plist.includes("NSAllowsLocalNetworking") || !plist.includes("NSLocalNetworkUsageDescription")) throw new Error("The iOS app is missing its bounded local-network declaration.");
if (!plist.includes("NSMicrophoneUsageDescription") || !plist.includes("NSSpeechRecognitionUsageDescription")) throw new Error("The iOS app is missing its deliberate voice-capture permission descriptions.");
if (!plist.includes("<string>openbot</string>")) throw new Error("The safe OpenBot connection deep link is missing.");
if (!plist.includes("NSCameraUsageDescription") || !swift.includes("pairingInvitation(from:") || !swift.includes("connectByQR") || !swift.includes("ConnectionNoRedirect")) throw new Error("Secure native QR pairing is incomplete.");
if (!privacy.includes("NSPrivacyAccessedAPICategoryUserDefaults") || !privacy.includes("CA92.1") || !privacy.includes("<false/>")) throw new Error("The iOS privacy manifest is incomplete.");
if (!entitlements.includes("aps-environment") || !entitlements.includes("group.app.openbot.shared") || !project.includes("APS_ENVIRONMENT: production")) throw new Error("Native notification or shared-inbox entitlements are incomplete.");
if (!sharePlist.includes("com.apple.share-services") || !project.includes("target: OpenBotShare")) throw new Error("The native iOS Share extension is not embedded.");
if (!swift.includes("kSecAttrAccessibleWhenUnlockedThisDeviceOnly")) throw new Error("The iOS access key is not using the expected Keychain protection.");
if (!swift.includes("ConnectionAddress.normalized") || !swift.includes("Bearer \\(accessKey)") || !swift.includes("api/events")) throw new Error("The native authenticated API session is incomplete.");
if (!swift.includes("api/drafts") || !swift.includes("Continued from your Mac")) throw new Error("Native Mac/iPhone draft continuity is incomplete.");
if (!swift.includes("NativeLiveStudioView") || !swift.includes("onActivity: { showingDetails = false; showingLiveStudio = true }") || !swift.includes("action: onActivity") || !swift.includes("studioRuns")) throw new Error("The native Activity route to Live Studio is incomplete.");
if (!swift.includes("NativeWorkView") || !swift.includes('Button("Start a workflow", action: onWork)') || !swift.includes("onWork: { showingDetails = false; showingWork = true }") || !swift.includes("StudioStarter.all") || !swift.includes("api/connectors")) throw new Error("The native connector-aware Work surface is incomplete.");
if (!swift.includes("StudioApprovedAction") || !swift.includes("resolveApprovedAction") || !swift.includes("Action history") || !swift.includes("It didn’t happen")) throw new Error("Native approved-action history or restart reconciliation is incomplete.");
if (!swift.includes("workflow.version ?? 1") || !swift.includes("let source: String?")) throw new Error("Native skill invocation is missing portable skill metadata.");
if (!swift.includes("StudioRunner") || !swift.includes("wakeRunner") || !swift.includes("Resumed safely after OpenBot restarted")) throw new Error("Native background runner health and recovery are incomplete.");
if (!swift.includes("StudioDeployment") || !swift.includes("PRIVATE ALWAYS-ON HOME") || !swift.includes("server.rack")) throw new Error("Native private-runner location and status are incomplete.");
if (!swift.includes("StudioRunnerCare") || !swift.includes("checkRunnerCare") || !swift.includes('Button(runner.deployment?.mode == "private_runner" ? "Home check"')) throw new Error("Native private-home diagnostics are incomplete.");
if (!swift.includes("runner.deployment?.mode") || !swift.includes("NativeRunnerSection")) throw new Error("Native private-home location information is incomplete.");
if (!swift.includes("StudioRunnerHealthAlerts") || !swift.includes("setRunnerHealthAlerts") || !swift.includes("Health alerts are on")) throw new Error("Native private-home health alerts are incomplete.");
if (!swift.includes("StudioRunnerExternalHeartbeat") || !swift.includes("setExternalHeartbeat") || !swift.includes("Offline protection is checking in")) throw new Error("Native outside-in private-home monitoring is incomplete.");
if (!swift.includes("Move this home securely") || !swift.includes("export-home.sh") || !swift.includes("UIPasteboard.general.string")) throw new Error("Native encrypted home-transfer guidance is incomplete.");
if (!swift.includes("quickLookPreview") || !swift.includes("api/attachments/\\(attachment.id)") || !swift.includes("ShareLink")) throw new Error("Native authenticated artifact preview and sharing are incomplete.");
if (!swift.includes("registerForRemoteNotifications") || !swift.includes("api/notifications/native") || !swift.includes("OpenBotSharedInbox") || !swift.includes("importSharedInbox")) throw new Error("Native push registration or share-sheet ingestion is incomplete.");
if (!swift.includes("SFSpeechAudioBufferRecognitionRequest") || !swift.includes('accessibilityLabel(voice.isListening ? "Stop voice capture" : "Start voice capture")') || !swift.includes("supportsOnDeviceRecognition")) throw new Error("Native deliberate voice capture, editable transcription, or its composer action is incomplete.");
if (!swift.includes("accessibilityReduceMotion") || !swift.includes('"celebrating"') || !swift.includes("phaseSeed")) throw new Error("Native mascot motion, celebration, or reduced-motion support is incomplete.");
if (!swift.includes("StudioCharacter") || !swift.includes("baseColor") || swift.includes('Image("Mascot')) throw new Error("Native mascots must remain code-drawn and use each teammate's saved color.");
if (!swift.includes("StudioApprovalReviewModel") || !swift.includes("requiresRefresh") || !swift.includes("hasPendingPreview")) throw new Error("Native approvals must load and review a matching pending action before deciding.");
if (swift.includes("WKWebView") || swift.includes("StudioWebView")) throw new Error("The iPhone conversation experience must remain native SwiftUI, not a web view.");
if (swift.includes(".preferredColorScheme(.light)")) throw new Error("The iPhone app must respect system appearance rather than force light mode.");
if (/access[_ -]?key\s*[=:]\s*[\"'][A-Za-z0-9_-]{12,}/i.test(swift)) throw new Error("A possible access key was embedded in Swift source.");
const swiftFiles = required.filter((file) => file.endsWith(".swift")).map((file) => path.join(root, file));
const parse = spawnSync("swiftc", ["-frontend", "-parse", ...swiftFiles], { encoding: "utf8" });
if (!parse.error && parse.status !== 0) throw new Error(`Swift syntax validation failed:\n${parse.stderr || parse.stdout}`);
console.log("iOS source-contract checks passed. This checks file presence, source patterns and available Swift syntax parsing; it does not compile, exercise UI, or verify physical-device delivery.");
