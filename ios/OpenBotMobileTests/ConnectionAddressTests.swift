import XCTest
@testable import OpenBot

final class ConnectionAddressTests: XCTestCase {
    func testAddsHTTPSAndRemovesPaths() throws {
        let url = try ConnectionAddress.normalized("studio.example.com/setup?q=secret")
        XCTAssertEqual(url.absoluteString, "https://studio.example.com")
    }

    func testAllowsPrivateHTTPAddresses() throws {
        XCTAssertEqual(try ConnectionAddress.normalized("http://192.168.1.20:4311/").absoluteString, "http://192.168.1.20:4311")
        XCTAssertEqual(try ConnectionAddress.normalized("192.168.1.20:4311").absoluteString, "http://192.168.1.20:4311")
        XCTAssertEqual(try ConnectionAddress.normalized("http://100.80.10.2:4311").host, "100.80.10.2")
    }

    func testRejectsPlainHTTPOnThePublicInternet() {
        XCTAssertThrowsError(try ConnectionAddress.normalized("http://example.com")) { error in
            XCTAssertEqual(error as? ConnectionAddressError, .insecureRemote)
        }
    }

    func testConnectDeepLinkCarriesOnlyTheServerAddress() {
        let link = URL(string: "openbot://connect?server=https%3A%2F%2Fstudio.example.com")!
        XCTAssertEqual(OpenBotDeepLink.serverAddress(from: link), "https://studio.example.com")
        XCTAssertNil(OpenBotDeepLink.serverAddress(from: URL(string: "openbot://connect?key=never-put-secrets-here")!))
        XCTAssertNil(OpenBotDeepLink.serverAddress(from: URL(string: "openbot://connect?server=https%3A%2F%2Fstudio.example.com&key=never-put-secrets-here")!))
    }

    func testNativeWorkStartersKeepSourceAndSafetyRequirements() {
        XCTAssertEqual(StudioStarter.all.map(\.id), ["morning-brief", "meeting-prep", "inbox-follow-ups"])

        let morning = StudioStarter.all[0].prompt(timeZone: "Europe/Brussels")
        XCTAssertTrue(morning.contains("Europe/Brussels"))
        XCTAssertTrue(morning.contains("source-linked"))
        XCTAssertTrue(morning.contains("Do not send or change anything"))

        let followUps = StudioStarter.all[2].prompt(timeZone: "Europe/Brussels")
        XCTAssertTrue(followUps.contains("Skip conversations I have already answered"))
        XCTAssertTrue(followUps.contains("reply drafts for me to review"))
        XCTAssertTrue(followUps.contains("Do not send or change anything"))
    }

    func testNativeConnectorReadinessUsesLiveCatalog() throws {
        let data = Data(#"{"managedGoogleClient":false,"connection":{"connected":true},"googleApiRecoveries":[{"service":"google-calendar","serviceName":"Google Calendar","enableUrl":"https://console.cloud.google.com/apis/library/calendar-json.googleapis.com"}],"catalog":[{"id":"gmail","name":"Gmail","connected":true,"description":"Mail","badge":"Live","availability":"live","capabilities":[]},{"id":"google-calendar","name":"Google Calendar","connected":false,"description":"Calendar","badge":"Live","availability":"live","capabilities":[]}]}"#.utf8)
        let status = try JSONDecoder().decode(StudioConnectorStatus.self, from: data)
        XCTAssertTrue(status.isConnected("gmail"))
        XCTAssertFalse(status.isConnected("google-calendar"))
        XCTAssertFalse(status.isConnected("google-drive"))
        XCTAssertTrue(status.canStartGoogleOAuth)
        XCTAssertEqual(status.googleRecoveryURL(for: "google-calendar")?.host, "console.cloud.google.com")
    }

    func testNativeActionReceiptDecodesWithoutThePrivateRequestBody() throws {
        let data = Data(#"{"id":"action-1","approvalId":"approval-1","runId":"run-1","botId":"nova","botName":"Nova","actionType":"gmail_send","actionLabel":"Send approved email","status":"uncertain","attemptCount":1,"resultSummary":null,"lastError":"Restarted during delivery","createdAt":"2026-09-05T00:00:00.000Z","startedAt":"2026-09-05T00:00:01.000Z","finishedAt":"2026-09-05T00:00:02.000Z","reviewedAt":null}"#.utf8)
        let receipt = try JSONDecoder().decode(StudioApprovedAction.self, from: data)
        XCTAssertEqual(receipt.status, "uncertain")
        XCTAssertEqual(receipt.actionLabel, "Send approved email")
        XCTAssertEqual(receipt.attemptCount, 1)
        XCTAssertFalse(String(data: data, encoding: .utf8)!.contains("private body"))
    }
}
