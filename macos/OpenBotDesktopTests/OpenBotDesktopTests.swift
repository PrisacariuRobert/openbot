import Foundation
import AppKit
import XCTest
@testable import OpenBot

final class OpenBotDesktopTests: XCTestCase {
    func testRoomIdentityShowsOnlyActualMembersAndKeepsTheWholeTeamRoom() {
        let bots = ["nova", "pixel", "scout"].map { StudioBot(id: $0, name: $0, mascot: "blob", color: "#7768CD", role: "Partner", status: "ready", threadId: $0, lastActiveAt: nil) }
        let custom = StudioThread(id: "group", title: "Launch", kind: "room", botId: nil, botIds: ["pixel", "nova"], updatedAt: "")
        XCTAssertEqual(custom.members(in: bots).map(\.id), ["pixel", "nova"])
        let whole = StudioThread(id: "team-room", title: "Together", kind: "room", botId: nil, updatedAt: "")
        XCTAssertEqual(whole.members(in: bots).count, 3)
        let direct = StudioThread(id: "nova", title: "Nova", kind: "direct", botId: "nova", updatedAt: "")
        XCTAssertEqual(direct.members(in: bots).map(\.id), ["nova"])
    }
    func testBrandMarksUseBundledServiceArtworkAndHonestFallbacks() {
        for name in ["opencode", "openai", "claude", "github", "gitlab", "gmail", "google-calendar", "google-drive", "slack", "notion", "todoist", "dropbox"] {
            let asset = StudioBrandMark.assetName(for: name)
            XCTAssertNotNil(asset, name)
            XCTAssertNotNil(asset.flatMap { NSImage(named: $0) }, "Missing bundled logo for \(name)")
        }
        XCTAssertEqual(StudioBrandMark.assetName(for: "ChatGPT / OpenAI"), "Brand-openai")
        XCTAssertEqual(StudioBrandMark.assetName(for: "github-copilot"), "Brand-github")
        XCTAssertNil(StudioBrandMark.assetName(for: "unknown-service"))
    }
    func testCancelledSettingsLoadsDoNotBecomeMisleadingActionErrors() {
        XCTAssertTrue(StudioAPIError.isCancelledRequest(CancellationError()))
        XCTAssertTrue(StudioAPIError.isCancelledRequest(URLError(.cancelled)))
        XCTAssertFalse(StudioAPIError.isCancelledRequest(URLError(.notConnectedToInternet)))
        XCTAssertFalse(StudioAPIError.isCancelledRequest(StudioAPIError.unauthorized))
        XCTAssertFalse(StudioAPIError.isCancelledRequest(StudioAPIError.server("Action failed")))
    }
    func testSettingsKeepsEveryExistingManagementDestination() {
        XCTAssertEqual(Set(DesktopSettingsSection.allCases.map(\.rawValue)), Set([
            "AI providers", "Your team", "Connected apps", "Routines", "Skills", "Teach a skill",
            "Code projects", "Files", "Artifacts", "Permissions", "You & devices"
        ]))
        XCTAssertTrue(DesktopSettingsSection.allCases.allSatisfy { !$0.icon.isEmpty })
    }

    func testGroupInputMatchesHostContractWithoutChangingMemberPermissions() throws {
        let input = try XCTUnwrap(StudioGroupInput(title: "  Launch team  ", botIDs: ["pixel", "nova", "pixel"]))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(input)) as? [String: Any])
        XCTAssertEqual(json["title"] as? String, "Launch team")
        XCTAssertEqual(json["botIds"] as? [String], ["nova", "pixel"])
        XCTAssertEqual(Set(json.keys), Set(["title", "botIds"]))
        XCTAssertNil(StudioGroupInput(title: " ", botIDs: ["nova"]))
        XCTAssertNil(StudioGroupInput(title: "Team", botIDs: []))
        XCTAssertNil(StudioGroupInput(title: "Team", botIDs: [" "]))
        XCTAssertNil(StudioGroupInput(title: "Team", botIDs: (0..<7).map(String.init)))
        XCTAssertNil(StudioGroupInput(title: String(repeating: "a", count: 49), botIDs: ["nova"]))
        XCTAssertNil(StudioGroupInput(title: String(repeating: "🤖", count: 25), botIDs: ["nova"]))
    }
    func testConversationListSearchesDirectChatsAndRoomsAndHidesHiddenThreads() {
        let threads = [
            StudioThread(id: "nova", title: "Nova", kind: "direct", botId: "bot", updatedAt: "2026-09-06T10:00:00Z", lastMessage: "Design review"),
            StudioThread(id: "room", title: "Launch", kind: "room", botId: nil, updatedAt: "2026-09-06T11:00:00Z", lastMessage: "Ready to review"),
            StudioThread(id: "hidden", title: "Review", kind: "direct", botId: nil, updatedAt: "2026-09-06T12:00:00Z", hidden: true)
        ]
        let bot = StudioBot(id: "bot", name: "Nova", mascot: "nova", color: "#6757d9", role: "Researcher", status: "ready", threadId: "nova", lastActiveAt: nil)
        XCTAssertEqual(DesktopConversationPresentation.conversations(threads, bots: [bot], matching: " REVIEW ").map(\.id), ["room", "nova"])
        XCTAssertEqual(DesktopConversationPresentation.conversations(threads, bots: [bot], matching: "researcher").map(\.id), ["nova"])
        XCTAssertTrue(DesktopConversationPresentation.conversations(threads, bots: [bot], matching: "no match").isEmpty)
        XCTAssertEqual(DesktopConversationPresentation.conversations(threads, bots: [bot], matching: " ").count, 2)
    }

    func testConversationOrderUsesLatestMessageAndStableTies() {
        let threads = [
            StudioThread(id: "z", title: "Z", kind: "room", botId: nil, updatedAt: "2026-09-06T12:00:00Z", lastMessageAt: "2026-09-01T12:00:00Z"),
            StudioThread(id: "b", title: "B", kind: "room", botId: nil, updatedAt: "2026-09-06T11:00:00.000Z"),
            StudioThread(id: "a", title: "A", kind: "room", botId: nil, updatedAt: "2026-09-06T11:00:00Z")
        ]
        XCTAssertEqual(DesktopConversationPresentation.conversations(threads, bots: [], matching: "").map(\.id), ["a", "b", "z"])
    }

    func testMessagesGroupOnlyForTheSameSpeakerAndNearbyTime() {
        let first = displayMessage(id: "one", at: "2026-09-06T10:00:00Z")
        XCTAssertTrue(DesktopConversationPresentation.startsGroup(first, after: nil))
        XCTAssertFalse(DesktopConversationPresentation.startsGroup(displayMessage(id: "two", at: "2026-09-06T10:01:00.000Z"), after: first))
        XCTAssertTrue(DesktopConversationPresentation.startsGroup(displayMessage(id: "late", at: "2026-09-06T10:06:00Z"), after: first))
        XCTAssertTrue(DesktopConversationPresentation.startsGroup(displayMessage(id: "system", at: "2026-09-06T10:01:00Z", type: "system"), after: first))
        XCTAssertTrue(DesktopConversationPresentation.startsGroup(displayMessage(id: "other", at: "2026-09-06T10:01:00Z", type: "user"), after: first))
        XCTAssertTrue(DesktopConversationPresentation.startsGroup(displayMessage(id: "invalid", at: "unknown"), after: first))
    }

    func testTimestampSeparatorsRespectGapsAndThreadBoundaries() {
        let first = displayMessage(id: "one", at: "2026-09-06T10:00:00Z")
        XCTAssertTrue(DesktopConversationPresentation.showsTimestamp(first, after: nil))
        XCTAssertFalse(DesktopConversationPresentation.showsTimestamp(displayMessage(id: "two", at: "2026-09-06T10:01:00Z"), after: first))
        XCTAssertTrue(DesktopConversationPresentation.showsTimestamp(displayMessage(id: "late", at: "2026-09-06T10:15:00Z"), after: first))
        XCTAssertTrue(DesktopConversationPresentation.showsTimestamp(displayMessage(id: "tomorrow", at: "2026-09-07T10:00:00Z"), after: first))
        XCTAssertTrue(DesktopConversationPresentation.showsTimestamp(displayMessage(id: "other", at: "2026-09-06T10:00:00Z", thread: "another"), after: first))
        XCTAssertEqual(DesktopConversationPresentation.timestamp("invalid"), "")
    }

    private func displayMessage(id: String, at: String, type: String = "bot", thread: String = "chat") -> StudioMessage {
        StudioMessage(id: id, threadId: thread, senderType: type, senderId: nil, senderName: type == "bot" ? "Nova" : "You", senderMascot: nil, senderColor: nil, body: "Hello", createdAt: at, runId: nil, attachments: [])
    }

    func testNativeAndRunnerVersionsMustMatchBeforeStartingOrReusingAStudio() throws {
        XCTAssertNoThrow(try DesktopRunnerController.requireMatchingVersion("0.37.0", appVersion: "0.37.0"))
        XCTAssertThrowsError(try DesktopRunnerController.requireMatchingVersion("0.36.0", appVersion: "0.37.0"))
        XCTAssertThrowsError(try DesktopRunnerController.requireMatchingVersion(nil, appVersion: "0.37.0", running: true))
    }
    func testCalendarScheduleAndServerPreviewRoundTrip() throws {
        let schedule = StudioRoutineSchedule(kind: "calendar", timeZone: "Europe/Brussels", time: "08:00", daysOfWeek: [1, 2, 3, 4, 5])
        XCTAssertEqual(try JSONDecoder().decode(StudioRoutineSchedule.self, from: JSONEncoder().encode(schedule)), schedule)
        let json = #"{"label":"Weekdays at 08:00 · Europe/Brussels","nextRuns":["2026-03-30T06:00:00.000Z"],"descriptions":["Mon 30 Mar 2026, 08:00 CEST"],"policy":"Catch up once"}"#
        let preview = try JSONDecoder().decode(StudioSchedulePreview.self, from: Data(json.utf8))
        XCTAssertEqual(preview.nextRuns, ["2026-03-30T06:00:00.000Z"])
        XCTAssertEqual(preview.descriptions, ["Mon 30 Mar 2026, 08:00 CEST"])
    }
    func testPageWatchStatusAndConfigurationDecodeWithoutRawSnapshot() throws {
        let data = Data(#"{"id":"watch","name":"Updates","botId":"nova","botName":"Nova","threadId":"bot-nova","prompt":"Summarize changes","intervalMinutes":15,"triggerType":"webpage","triggerConfig":{"pageUrl":"https://example.com/","pageSelector":"main"},"enabled":true,"lastStatus":"never","runCount":0,"consecutiveFailures":0,"watchStatus":{"state":"unchanged","checkedAt":"2026-09-05T12:00:00Z","nextCheckAt":"2026-09-05T12:15:00Z","checks":2,"unchangedChecks":1,"detail":"No model was used."}}"#.utf8)
        let routine = try JSONDecoder().decode(StudioRoutine.self, from: data)
        XCTAssertEqual(routine.triggerConfig?.pageSelector, "main")
        XCTAssertEqual(routine.watchStatus?.unchangedChecks, 1)
        XCTAssertEqual(routine.watchStatus?.state, "unchanged")
    }
    func testOnlyLoopbackPairingAvoidsPersistentKeyStorage() throws {
        XCTAssertFalse(DesktopConnectionSession.persistsAccessKey(for: try ConnectionAddress.normalized("http://127.0.0.1:4311")))
        XCTAssertFalse(DesktopConnectionSession.persistsAccessKey(for: try ConnectionAddress.normalized("http://localhost:4311")))
        XCTAssertTrue(DesktopConnectionSession.persistsAccessKey(for: try ConnectionAddress.normalized("http://100.94.155.13:4311")))
        XCTAssertTrue(DesktopConnectionSession.persistsAccessKey(for: try ConnectionAddress.normalized("https://studio.example.com")))
    }
    func testNativeStartersCarryTheirRequiredSavedReport() {
        XCTAssertEqual(StudioStarter.all.first { $0.id == "morning-brief" }?.expectedWorkKind, "morning")
        XCTAssertEqual(StudioStarter.all.first { $0.id == "inbox-follow-ups" }?.expectedWorkKind, "inbox")
        XCTAssertEqual(StudioStarter.all.first { $0.id == "meeting-prep" }?.expectedWorkKind, "meeting")
    }
    func testPackagedRunnerPreservesExistingDataAndRejectsUnknownServiceLayouts() throws {
        let home = URL(filePath: "/Users/Owner", directoryHint: .isDirectory)
        XCTAssertEqual(try DesktopRunnerController.dataDirectory(home: home, service: nil).path, "/Users/Owner/Library/Application Support/OpenBot/Data")
        XCTAssertEqual(try DesktopRunnerController.dataDirectory(home: home, service: ["EnvironmentVariables": ["OPENBOT_DATA_DIR": "/Volumes/Private/Studio"]]).path, "/Volumes/Private/Studio")
        XCTAssertEqual(try DesktopRunnerController.dataDirectory(home: home, service: ["ProgramArguments": ["/bin/node", "/Users/Owner/Documents/openbot/scripts/background-runner.mjs"]]).path, "/Users/Owner/Documents/openbot/.openbot")
        XCTAssertThrowsError(try DesktopRunnerController.dataDirectory(home: home, service: ["ProgramArguments": ["/bin/sh", "unknown-script"]]))
        XCTAssertThrowsError(try DesktopRunnerController.dataDirectory(home: home, service: ["EnvironmentVariables": ["OPENBOT_DATA_DIR": "relative"]]))
    }
    func testLocalAndPrivateAddressesNormalizeSafely() throws {
        let local = try ConnectionAddress.normalized("127.0.0.1:4311")
        XCTAssertEqual(local.absoluteString, "http://127.0.0.1:4311")
        XCTAssertTrue(ConnectionAddress.isLoopback(local))
        XCTAssertFalse(ConnectionAddress.isLoopback(try ConnectionAddress.normalized("192.168.1.20:4311")))
        XCTAssertEqual(try ConnectionAddress.normalized("openbot.example.com").absoluteString, "https://openbot.example.com")
        XCTAssertThrowsError(try ConnectionAddress.normalized("http://openbot.example.com"))
        XCTAssertThrowsError(try ConnectionAddress.normalized("https://user:secret@openbot.example.com"))
    }

    func testDesktopDecodesCrashSafeActionReceiptsWithoutPrivatePayload() throws {
        let json = """
        {
          "bots": [{
            "id": "nova", "name": "Nova", "mascot": "orbit", "color": "#6D5BD8", "role": "Researcher",
            "status": "ready", "threadId": "nova-thread", "lastActiveAt": null,
            "providerInstanceId": "provider-1", "model": "provider/model",
            "computerEnabled": true, "browserEnabled": false, "macAccessEnabled": true
          }], "threads": [], "messages": [], "runs": [], "studioRuns": [], "approvals": [],
          "approvedActions": [{
            "id": "action-1", "approvalId": "approval-1", "runId": "run-1", "botId": "nova", "botName": "Nova",
            "actionType": "gmail_send", "actionLabel": "Send approved follow-up", "status": "uncertain", "attemptCount": 1,
            "resultSummary": null, "lastError": null, "createdAt": "2026-09-05T00:00:00.000Z",
            "startedAt": "2026-09-05T00:00:01.000Z", "finishedAt": null, "reviewedAt": null
          }],
          "workflows": [],
          "routines": [{
            "id": "routine-1", "name": "Morning brief", "botId": "nova", "botName": "Nova",
            "threadId": "nova-thread", "prompt": "Prepare my brief", "intervalMinutes": 1440,
            "triggerType": "schedule", "enabled": true, "nextRunAt": null, "lastRunAt": null,
            "lastStatus": "never", "runCount": 0, "consecutiveFailures": 0, "lastError": null, "pausedReason": null
          }],
          "runner": null, "draft": null, "settings": {"macAccessEnabled": true},
          "usage": {"totalTokens": 0, "completedRuns": 0, "activeRuns": 0}, "activeThreadId": "team-room"
        }
        """
        let state = try JSONDecoder().decode(StudioState.self, from: Data(json.utf8))
        XCTAssertEqual(state.approvedActions?.first?.status, "uncertain")
        XCTAssertEqual(state.routines?.first?.name, "Morning brief")
        XCTAssertTrue(state.settings?.macAccessEnabled == true)
        XCTAssertEqual(state.bots.first?.providerInstanceId, "provider-1")
        XCTAssertTrue(state.bots.first?.computerEnabled == true)
        XCTAssertFalse(state.bots.first?.browserEnabled == true)
        XCTAssertFalse(json.contains("requestJson"))
    }

    func testOpenBotLinkCannotCarryASecret() {
        XCTAssertEqual(
            OpenBotDeepLink.serverAddress(from: URL(string: "openbot://connect?server=https%3A%2F%2Fstudio.example")!),
            "https://studio.example"
        )
        XCTAssertNil(OpenBotDeepLink.serverAddress(from: URL(string: "openbot://connect?server=https%3A%2F%2Fstudio.example&token=secret")!))
    }

    func testDesktopClientCanKeepALaunchCredentialOnlyInMemory() {
        let client = StudioAPIClient(baseURL: URL(string: "http://127.0.0.1:4311")!, accessKey: "ephemeral-test-key")
        XCTAssertEqual(client.sessionAccessKey, "ephemeral-test-key")
    }

    func testProviderStatusDecodesWithoutReturningSecrets() throws {
        let json = """
        {
          "connected": true, "cliAvailable": true, "version": "1.0.0", "defaultModel": "opencode/free",
          "models": ["opencode/free"], "note": "Ready",
          "instances": [{
            "id": "provider-1", "provider": "custom", "name": "Local models", "authMode": "api_key",
            "runtime": "opencode", "hasSecret": false, "apiConfig": {
              "baseUrl": "http://127.0.0.1:11434/v1", "protocol": "openai-compatible", "modelIds": ["qwen3:8b"]
            }, "connected": true, "models": ["openbot-provider-1/qwen3:8b"], "defaultModel": null, "note": "Saved"
          }],
          "catalog": [{
            "id": "openai", "name": "ChatGPT / OpenAI", "shortName": "OpenAI", "description": "Use your account.",
            "badge": "Subscription", "connected": true, "installed": true, "canConnect": true,
            "connectionId": "openai", "models": ["openai/gpt"], "note": "Ready"
          }],
          "loginAttempts": [{
            "id": "attempt-1", "providerId": "openai", "status": "waiting", "url": "https://example.com/sign-in",
            "callbackMode": "code", "instructions": "Finish sign-in", "error": null
          }]
        }
        """
        let status = try JSONDecoder().decode(StudioProviderStatus.self, from: Data(json.utf8))
        XCTAssertEqual(status.catalog.first?.shortName, "OpenAI")
        XCTAssertEqual(status.instances.first?.apiConfig?.modelIds, ["qwen3:8b"])
        XCTAssertEqual(status.loginAttempts.first?.callbackMode, "code")
        XCTAssertFalse(json.contains("secret"))
    }

    func testCodeProjectStatusDecodesExplicitTeammateGrants() throws {
        let json = """
        {
          "projects": [{
            "id": "project-1", "name": "OpenBot", "rootPath": "/Users/test/openbot", "gitRepository": true,
            "projectKind": "Node.js", "remoteUrl": "https://github.com/example/openbot", "defaultBranch": "main",
            "managedClone": false, "access": [{
              "botId": "pixel", "projectId": "project-1", "canRead": true, "canWrite": true, "canRun": true,
              "updatedAt": "2026-09-05T00:00:00.000Z"
            }]
          }],
          "edits": [{
            "id": "edit-1", "projectId": "project-1", "botId": "pixel", "botName": "Pixel", "path": "src/app.ts",
            "operation": "updated", "additions": 2, "deletions": 1, "workspaceRunId": "run-1", "reversible": true,
            "restoredAt": null, "createdAt": "2026-09-05T00:00:00.000Z"
          }],
          "workspaces": [{
            "runId": "run-1", "projectId": "project-1", "projectName": "OpenBot", "botId": "pixel", "botName": "Pixel",
            "branch": "openbot/test", "rootPath": "/tmp/worktree", "status": "active",
            "createdAt": "2026-09-05T00:00:00.000Z", "updatedAt": "2026-09-05T00:00:00.000Z"
          }], "reviews": [],
          "suggestions": [{"name": "Another project", "rootPath": "/Users/test/another", "gitRepository": true, "projectKind": "Git"}]
        }
        """
        let status = try JSONDecoder().decode(StudioCodeProjectsStatus.self, from: Data(json.utf8))
        XCTAssertEqual(status.projects.first?.name, "OpenBot")
        XCTAssertTrue(status.projects.first?.access.first?.canRun == true)
        XCTAssertEqual(status.suggestions.first?.id, "/Users/test/another")
        XCTAssertEqual(status.edits?.first?.path, "src/app.ts")
        XCTAssertEqual(status.workspaces?.first?.branch, "openbot/test")
    }

    func testConnectorCatalogDecodesSeparateReadAndWriteGrants() throws {
        let json = """
        {
          "catalog": [{
            "id": "gmail", "name": "Gmail", "connected": true, "description": "Mail", "badge": "Connected",
            "availability": "live", "writeConnected": true, "writeRequiresApproval": true, "capabilities": ["Read", "Approval-safe sending"]
          }],
          "access": [{
            "botId": "nova", "connectorId": "google-workspace", "service": "gmail", "canRead": true, "canSend": false
          }],
          "managedGoogleClient": true, "connection": {"connected": true}, "googleApiRecoveries": []
        }
        """
        let status = try JSONDecoder().decode(StudioConnectorStatus.self, from: Data(json.utf8))
        XCTAssertTrue(status.isConnected("gmail"))
        XCTAssertTrue(status.catalog.first?.writeConnected == true)
        XCTAssertTrue(status.access?.first?.canRead == true)
        XCTAssertFalse(status.access?.first?.canSend == true)
    }

    func testMacSourceFallbackIsAnAttemptNotAFakeConnectedAccount() throws {
        let json = """
        {"catalog":[],"localApps":{"available":true,"enabled":true,"readServices":["gmail","google-calendar"]}}
        """
        let status = try JSONDecoder().decode(StudioConnectorStatus.self, from: Data(json.utf8))
        XCTAssertFalse(status.isConnected("gmail"))
        XCTAssertTrue(status.canTryRead("gmail"))
        XCTAssertFalse(status.canTryRead("google-drive"))
        for starter in StudioStarter.all {
            XCTAssertTrue(status.missingSources(for: starter).isEmpty)
            XCTAssertTrue(status.sourceLabel(for: starter).contains("Automation permission"))
        }
        let unavailable = try JSONDecoder().decode(StudioConnectorStatus.self, from: Data("{\"catalog\":[],\"localApps\":{\"available\":false,\"enabled\":true,\"readServices\":[\"gmail\"]}}".utf8))
        XCTAssertFalse(unavailable.canTryRead("gmail"))
    }

    func testPortableSkillAndStarterDecodeForNativeLibrary() throws {
        let skillJSON = """
        {"id":"skill-1","botId":"nova","botName":"Nova","name":"Weekly review","skillSlug":"weekly-review",
        "description":"Review the week","instructions":"Open the dashboard and summarize it.","startUrl":"https://example.com",
        "stepCount":3,"version":2,"source":"taught","createdAt":"2026-09-05T00:00:00.000Z","updatedAt":"2026-09-05T00:00:00.000Z"}
        """
        let skill = try JSONDecoder().decode(StudioSkill.self, from: Data(skillJSON.utf8))
        XCTAssertEqual(skill.skillSlug, "weekly-review")
        XCTAssertEqual(skill.version, 2)

        let templateJSON = """
        {"id":"starter-1","name":"Research","description":"Collect sources","instructions":"Search carefully.",
        "startUrl":"https://example.com","category":"Research","stepCount":2}
        """
        let template = try JSONDecoder().decode(StudioSkillTemplate.self, from: Data(templateJSON.utf8))
        XCTAssertEqual(template.stepCount, 2)

        let versionJSON = """
        {"id":"version-1","workflowId":"skill-1","version":1,"name":"Weekly review",
        "description":"Review the week","instructions":"Summarize it.","startUrl":"https://example.com",
        "stepCount":3,"createdAt":"2026-09-05T00:00:00.000Z"}
        """
        let version = try JSONDecoder().decode(StudioSkillVersion.self, from: Data(versionJSON.utf8))
        XCTAssertEqual(version.workflowId, "skill-1")
        XCTAssertEqual(version.version, 1)
    }

    func testNativeTeachingStatusAndPrivateBrowserPreviewDecode() throws {
        let status = try JSONDecoder().decode(
            StudioTeachingStatus.self,
            from: Data(#"{"recording":true,"name":"Weekly tracker","stepCount":4}"#.utf8)
        )
        XCTAssertTrue(status.recording)
        XCTAssertEqual(status.name, "Weekly tracker")
        XCTAssertEqual(status.stepCount, 4)

        let computer = try JSONDecoder().decode(
            StudioComputerStatus.self,
            from: Data(#"{"botId":"nova","container":"stopped","browser":"ready","currentUrl":"https://example.com","title":"Example","screenshot":"data:image/jpeg;base64,YQ==","updatedAt":"2026-09-05T00:00:00.000Z"}"#.utf8)
        )
        XCTAssertEqual(computer.botId, "nova")
        XCTAssertEqual(computer.browser, "ready")
        XCTAssertTrue(computer.screenshot?.hasPrefix("data:image/jpeg") == true)
    }

    func testNativeAutomationDecodesEventFiltersAndOneTimeSecret() throws {
        let routineJSON = """
        {"id":"routine-1","name":"Issue triage","botId":"nova","botName":"Nova","threadId":"nova-thread",
        "prompt":"Triage the issue","intervalMinutes":1440,"triggerType":"github",
        "triggerConfig":{"githubEvent":"issues","githubAction":"opened","repository":"owner/repo"},
        "hasWebhookSecret":true,"enabled":true,"nextRunAt":null,"lastRunAt":null,"lastStatus":"never",
        "runCount":0,"consecutiveFailures":0,"lastError":null,"pausedReason":null}
        """
        let routine = try JSONDecoder().decode(StudioRoutine.self, from: Data(routineJSON.utf8))
        XCTAssertEqual(routine.triggerType, "github")
        XCTAssertEqual(routine.triggerConfig?.repository, "owner/repo")
        XCTAssertTrue(routine.hasWebhookSecret == true)

        let resultJSON = #"{"id":"routine-1","name":"Issue triage","triggerType":"github","webhook":{"url":"https://studio.example/api/automation-hooks/routine-1","secret":"one-time-test-secret"}}"#
        let result = try JSONDecoder().decode(StudioRoutineSaveResult.self, from: Data(resultJSON.utf8))
        XCTAssertEqual(result.webhook?.secret, "one-time-test-secret")
    }

    func testNativeWorkspaceFilesDecodeWithoutHostPaths() throws {
        let files = try JSONDecoder().decode(
            [StudioWorkspaceFile].self,
            from: Data(#"[{"path":"reports/weekly.md","size":612,"modifiedAt":"2026-09-05T00:00:00.000Z","kind":"file"},{"path":"reports","size":96,"modifiedAt":"2026-09-05T00:00:00.000Z","kind":"directory"}]"#.utf8)
        )
        XCTAssertEqual(files.first?.id, "reports/weekly.md")
        XCTAssertEqual(files.last?.kind, "directory")
        XCTAssertFalse(String(data: try JSONEncoder().encode(files.map(\.path)), encoding: .utf8)?.contains("/Users/") == true)

        let preview = try JSONDecoder().decode(
            StudioWorkspaceFileContent.self,
            from: Data(##"{"path":"reports/weekly.md","content":"# Weekly report"}"##.utf8)
        )
        XCTAssertEqual(preview.content, "# Weekly report")
    }

    func testNativeSearchResultKeepsOriginalConversationDestination() throws {
        let result = try JSONDecoder().decode(
            StudioSearchResult.self,
            from: Data(#"{"id":"message-1","kind":"message","title":"Nova","subtitle":"Research","snippet":"The launch brief is ready.","threadId":"bot-nova","botId":"nova","createdAt":"2026-09-05T00:00:00.000Z"}"#.utf8)
        )
        XCTAssertEqual(result.stableID, "message-message-1")
        XCTAssertEqual(result.threadId, "bot-nova")
        XCTAssertEqual(result.botId, "nova")
    }

    func testNativeMessageDecodesReplyContextAndReactions() throws {
        let json = ##"{"id":"message-2","threadId":"bot-nova","senderType":"bot","senderId":"nova","senderName":"Nova","senderMascot":"nova","senderColor":"#6D5BD8","body":"Here is the answer.","createdAt":"2026-09-05T00:00:00.000Z","runId":null,"attachments":[],"replyTo":{"id":"message-1","senderName":"You","body":"What changed?"},"reactions":[{"emoji":"✅","count":1,"reactedByYou":true}]}"##
        let message = try JSONDecoder().decode(StudioMessage.self, from: Data(json.utf8))
        XCTAssertEqual(message.replyTo?.body, "What changed?")
        XCTAssertEqual(message.reactions?.first?.emoji, "✅")
        XCTAssertTrue(message.reactions?.first?.reactedByYou == true)
    }
}
