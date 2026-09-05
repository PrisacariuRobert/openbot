import Foundation
import XCTest
@testable import OpenBot

final class OpenBotDesktopTests: XCTestCase {
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
            "availability": "live", "writeRequiresApproval": true, "capabilities": ["Read", "Approval-safe sending"]
          }],
          "access": [{
            "botId": "nova", "connectorId": "google-workspace", "service": "gmail", "canRead": true, "canSend": false
          }],
          "managedGoogleClient": true, "connection": {"connected": true}, "googleApiRecoveries": []
        }
        """
        let status = try JSONDecoder().decode(StudioConnectorStatus.self, from: Data(json.utf8))
        XCTAssertTrue(status.isConnected("gmail"))
        XCTAssertTrue(status.access?.first?.canRead == true)
        XCTAssertFalse(status.access?.first?.canSend == true)
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
}
