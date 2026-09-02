import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const required = [
  "ios/project.yml",
  "ios/OpenBotMobile.xcodeproj/project.pbxproj",
  "ios/OpenBotMobile/App/OpenBotMobileApp.swift",
  "ios/OpenBotMobile/Models/ConnectionAddress.swift",
  "ios/OpenBotMobile/Models/ConnectionSession.swift",
  "ios/OpenBotMobile/Models/StudioModels.swift",
  "ios/OpenBotMobile/Models/StudioAPIClient.swift",
  "ios/OpenBotMobile/Models/StudioStore.swift",
  "ios/OpenBotMobile/Security/KeychainStore.swift",
  "ios/OpenBotMobile/Views/ConnectionView.swift",
  "ios/OpenBotMobile/Views/StudioContainerView.swift",
  "ios/OpenBotMobile/Resources/Info.plist",
  "ios/OpenBotMobile/Resources/PrivacyInfo.xcprivacy",
  "ios/OpenBotMobile/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png",
  "ios/OpenBotMobile/Resources/Assets.xcassets/MascotStudio.imageset/mascot-studio.png",
  "ios/OpenBotMobile/Resources/Assets.xcassets/MascotNova.imageset/mascot-nova.png",
  "ios/OpenBotMobile/Resources/Assets.xcassets/MascotPixel.imageset/mascot-pixel.png",
  "ios/OpenBotMobile/Resources/Assets.xcassets/MascotScout.imageset/mascot-scout.png",
  "ios/OpenBotMobileTests/ConnectionAddressTests.swift",
  "ios/OpenBotMobileUITests/OpenBotMobileUITests.swift",
];

const missing = required.filter((file) => !existsSync(path.join(root, file)));
if (missing.length) throw new Error(`Missing iOS release files:\n${missing.join("\n")}`);

const project = readFileSync(path.join(root, "ios/project.yml"), "utf8");
const plist = readFileSync(path.join(root, "ios/OpenBotMobile/Resources/Info.plist"), "utf8");
const privacy = readFileSync(path.join(root, "ios/OpenBotMobile/Resources/PrivacyInfo.xcprivacy"), "utf8");
const swift = required.filter((file) => file.endsWith(".swift")).map((file) => readFileSync(path.join(root, file), "utf8")).join("\n");
if (!project.includes("MARKETING_VERSION: 0.17.1")) throw new Error("The iOS marketing version is not 0.17.1.");
if (!plist.includes("NSAllowsLocalNetworking") || !plist.includes("NSLocalNetworkUsageDescription")) throw new Error("The iOS app is missing its bounded local-network declaration.");
if (!plist.includes("<string>openbot</string>")) throw new Error("The safe OpenBot connection deep link is missing.");
if (!privacy.includes("NSPrivacyAccessedAPICategoryUserDefaults") || !privacy.includes("CA92.1") || !privacy.includes("<false/>")) throw new Error("The iOS privacy manifest is incomplete.");
if (!swift.includes("kSecAttrAccessibleWhenUnlockedThisDeviceOnly")) throw new Error("The iOS access key is not using the expected Keychain protection.");
if (!swift.includes("ConnectionAddress.normalized") || !swift.includes("Bearer \\(accessKey)") || !swift.includes("api/events")) throw new Error("The native authenticated API session is incomplete.");
if (swift.includes("WKWebView") || swift.includes("StudioWebView")) throw new Error("The iPhone conversation experience must remain native SwiftUI, not a web view.");
if (/access[_ -]?key\s*[=:]\s*[\"'][A-Za-z0-9_-]{12,}/i.test(swift)) throw new Error("A possible access key was embedded in Swift source.");
const swiftFiles = required.filter((file) => file.endsWith(".swift")).map((file) => path.join(root, file));
const parse = spawnSync("swiftc", ["-frontend", "-parse", ...swiftFiles], { encoding: "utf8" });
if (!parse.error && parse.status !== 0) throw new Error(`Swift syntax validation failed:\n${parse.stderr || parse.stdout}`);
console.log("Native SwiftUI studio, privacy declarations, Keychain storage, API streaming, and UI coverage are present.");
