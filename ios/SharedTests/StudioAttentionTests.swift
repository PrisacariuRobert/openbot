import Foundation
import XCTest
@testable import OpenBot

final class StudioAttentionTests: XCTestCase {
    func testFinalMessageAndOptionalProgressRemainSeparate() throws {
        let data = Data(#"{"id":"result","threadId":"thread","senderType":"bot","senderName":"Nova","body":"The result is ready.","createdAt":"2026-09-06T12:00:00Z","attachments":[],"progressUpdates":["Checking the file."]}"#.utf8)
        let message = try JSONDecoder().decode(StudioMessage.self, from: data)
        XCTAssertEqual(message.body, "The result is ready.")
        XCTAssertEqual(message.progressUpdates, ["Checking the file."])
    }
    private func state(_ fields: [String: Any] = [:]) throws -> StudioState {
        let base: [String: Any] = ["bots": [], "threads": [], "messages": [], "runs": [], "approvals": [], "workflows": [],
            "usage": ["totalTokens": 0, "completedRuns": 0, "activeRuns": 0], "activeThreadId": "quiet-thread"]
        return try JSONDecoder().decode(StudioState.self, from: JSONSerialization.data(withJSONObject: base.merging(fields) { _, new in new }))
    }

    private func run(_ id: String, _ status: String) -> [String: Any] {
        ["id": id, "threadId": "busy-thread", "botId": "bot", "botName": "Nova", "botMascot": "nova",
         "botColor": "#6757d9", "attemptCount": 1, "status": status]
    }

    private func approval(_ id: String, _ runID: String, _ status: String = "pending") -> [String: Any] {
        ["id": id, "runId": runID, "botId": "bot", "botName": "Nova", "reason": "Review the proposed action", "actionLabel": "Send", "status": status]
    }

    func testOlderHostWithoutGlobalRunsOrAlertsStillDecodes() throws {
        let value = try state(["runs": [run("one", "failed")]])
        XCTAssertNil(value.automationAlerts)
        XCTAssertEqual(value.attentionItems.count, 1)
        XCTAssertTrue(try state().attentionItems.isEmpty)
    }

    func testFailureInAnotherConversationStaysVisibleAndSnapshotsDeduplicate() throws {
        let value = try state(["studioRuns": [run("one", "failed"), run("two", "running")], "runs": [run("one", "running")]])
        XCTAssertEqual(value.allRuns.count, 2)
        XCTAssertEqual(value.allRuns.first?.status, "failed")
        XCTAssertEqual(value.attentionItems.first?.threadID, "busy-thread")
        XCTAssertEqual(value.attentionItems.first?.title, "Nova needs a hand")
    }

    func testApprovalIsNotCountedTwiceAndOnlyPendingOrphansAppear() throws {
        let value = try state(["runs": [run("one", "awaiting_approval")], "approvals": [
            approval("matching", "one"), approval("orphan", "missing"), approval("approved", "done", "approved"), approval("denied", "done", "denied")]])
        XCTAssertEqual(value.attentionItems.map(\.id), ["run:one:awaiting_approval", "approval:orphan"])
        XCTAssertNil(value.attentionItems.last?.threadID, "Do not send an orphan to an unrelated conversation")
    }

    func testConversationFailuresAreScopedDeduplicatedAndNotActiveOrCancelledWork() throws {
        let failure = run("one", "failed").merging(["error": "  Connection interrupted  "]) { _, new in new }
        let value = try state(["studioRuns": [failure, run("two", "running"), run("three", "cancelled")], "runs": [failure]])
        XCTAssertTrue(value.failedRuns(in: "quiet-thread").isEmpty)
        XCTAssertEqual(value.failedRuns(in: "busy-thread").map(\.id), ["one"])
        XCTAssertEqual(value.failedRuns(in: "busy-thread").first?.failureDetail, "Connection interrupted")
        let missingError = try state(["runs": [run("missing", "failed")]])
        XCTAssertEqual(missingError.failedRuns(in: "busy-thread").first?.failureDetail, "The task stopped before a finished result could be confirmed.")
    }

    func testUncertainActionsAndUnresolvedRoutineAlertsAreRetained() throws {
        let alert: [String: Any] = ["id": "alert", "routineId": "routine", "routineName": "Morning plan", "message": "Sign-in expired"]
        let action: [String: Any] = ["id": "action", "approvalId": "approval", "runId": "one", "botId": "bot", "botName": "Nova", "actionType": "send", "actionLabel": "Send reply", "status": "uncertain", "attemptCount": 1, "createdAt": "2026-09-06T09:00:00Z"]
        let value = try state(["runs": [run("one", "completed")], "approvedActions": [action], "automationAlerts": [alert, alert, alert.merging(["id": "resolved", "resolvedAt": "2026-09-06T10:00:00Z"]) { _, new in new }]])
        XCTAssertEqual(value.attentionItems.map(\.kind), [.uncertainAction, .automation])
        XCTAssertEqual(value.attentionItems.first?.threadID, "busy-thread")
    }

    func testSignatureIsStableAcrossOrderingButChangesWithStatus() throws {
        let a = try state(["runs": [run("a", "failed"), run("b", "awaiting_approval")]])
        let b = try state(["runs": [run("b", "awaiting_approval"), run("a", "failed")]])
        let recovered = try state(["runs": [run("b", "awaiting_approval"), run("a", "completed")]])
        XCTAssertEqual(a.attentionSignature, b.attentionSignature)
        XCTAssertNotEqual(a.attentionSignature, recovered.attentionSignature)
        XCTAssertEqual(recovered.attentionItems.count, 1)
    }

    func testConnectionLabelsDoNotClaimTaskReadinessOrWriteAccess() throws {
        let base: [String: Any] = ["id": "test", "provider": "test", "name": "Test", "authMode": "subscription", "runtime": "test", "hasSecret": false, "connected": true]
        let provider = try JSONDecoder().decode(StudioProviderInstance.self, from: JSONSerialization.data(withJSONObject: base))
        XCTAssertEqual(provider.connectionLabel, "Sign-in found")
        let saved = try JSONDecoder().decode(StudioProviderInstance.self, from: JSONSerialization.data(withJSONObject: base.merging(["authMode": "api_key", "hasSecret": true]) { _, new in new }))
        XCTAssertEqual(saved.connectionLabel, "Connection saved")
        let app = try JSONDecoder().decode(StudioConnectorCatalogEntry.self, from: Data(#"{"id":"mail","name":"Mail","connected":true,"writeRequiresApproval":true,"writeConnected":false}"#.utf8))
        XCTAssertEqual(app.connectionLabel, "Read access connected")
    }
}
