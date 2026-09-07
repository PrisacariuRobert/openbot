import XCTest
import SwiftUI
@testable import OpenBot

final class ConnectionAddressTests: XCTestCase {
    func testPhoneUsesTheSameBundledBrandMarksAsMac() {
        for name in ["opencode", "openai", "claude", "github", "gitlab", "gmail", "google-calendar", "google-drive", "slack", "notion", "todoist", "dropbox"] {
            let asset = StudioBrandMark.assetName(for: name)
            XCTAssertNotNil(asset, name)
            XCTAssertNotNil(asset.flatMap { UIImage(named: $0) }, "Missing bundled logo for \(name)")
        }
        XCTAssertEqual(StudioBrandMark.assetName(for: "ChatGPT / OpenAI"), "Brand-openai")
        XCTAssertNil(StudioBrandMark.assetName(for: "unknown-service"))
    }
    func testNativeApprovalBrowserLinkPreservesRelayAndNeverCarriesSecrets() throws {
        let url = try XCTUnwrap(URL(string: "https://person:password@relay.example/s/studio-one?accessKey=secret#private"))
        let client = StudioAPIClient(baseURL: url, accessKey: "test-key")
        let link = client.fullApprovalReviewURL(threadID: "thread-1")
        let parts = try XCTUnwrap(URLComponents(url: link, resolvingAgainstBaseURL: false))
        XCTAssertEqual(parts.path, "/s/studio-one/")
        XCTAssertNil(parts.user)
        XCTAssertNil(parts.password)
        XCTAssertNil(parts.fragment)
        XCTAssertEqual(parts.queryItems, [URLQueryItem(name: "panel", value: "live"), URLQueryItem(name: "thread", value: "thread-1")])
        XCTAssertFalse(link.absoluteString.contains("secret"))
    }

    private func pendingApproval(_ status: String = "pending") -> StudioApproval {
        StudioApproval(id: "approval-1", runId: "run-1", botId: "bot-1", botName: "Nova", reason: "Please review", actionLabel: "Start task", status: status)
    }

    private func approvalPreview(status: String = "pending", canApprove: Bool = true, limitation: String? = nil, fields: Bool = true, id: String = "approval-1", fingerprint: String? = String(repeating: "a", count: 64)) -> StudioApprovalPreview {
        StudioApprovalPreview(approvalId: id, runId: "run-1", status: status, actionLabel: "Start task", reason: "Please review", canApprove: canApprove, limitation: limitation, fields: fields ? [.init(label: "Task to start", value: "Read the project and prepare a plan. Do not edit files.")] : [], reviewFingerprint: fingerprint)
    }

    @MainActor
    func testNativeApprovalRequiresBoundFullPendingReview() async {
        var calls = 0
        let model = StudioApprovalReviewModel(approval: pendingApproval(), load: { self.approvalPreview() }, decide: { _, fingerprint in XCTAssertEqual(fingerprint, String(repeating: "a", count: 64)); calls += 1; return self.pendingApproval("approved") }, changed: {})
        await model.refresh()
        XCTAssertTrue(model.canDecline)
        XCTAssertFalse(model.canApprove)
        await model.submit("approved", stillPending: true)
        XCTAssertEqual(calls, 0)
        model.reviewed = true
        XCTAssertTrue(model.canApprove)
        await model.submit("approved", stillPending: false)
        XCTAssertEqual(calls, 0)
        await model.submit("approved", stillPending: true)
        XCTAssertEqual(calls, 1)
        XCTAssertTrue(model.requiresRefresh)
        XCTAssertTrue(model.notice?.contains("does not mean the action has finished") == true)
    }

    @MainActor
    func testNativeApprovalRejectsUnsupportedMaskedEmptyMismatchedAndStalePreviews() async {
        let cases = [approvalPreview(canApprove: false), approvalPreview(limitation: "Credential hidden"), approvalPreview(fields: false), approvalPreview(id: "another-approval"), approvalPreview(status: "approved"), approvalPreview(fingerprint: nil), approvalPreview(fingerprint: "wrong")]
        for fixture in cases {
            var calls = 0
            let model = StudioApprovalReviewModel(approval: pendingApproval(), load: { fixture }, decide: { _, _ in calls += 1; return self.pendingApproval("approved") }, changed: {})
            await model.refresh()
            model.reviewed = true
            XCTAssertFalse(model.canApprove)
            await model.submit("approved", stillPending: true)
            XCTAssertEqual(calls, 0)
        }
    }

    @MainActor
    func testOlderHostPreviewDecodesButOnlyDeclineIsAllowed() async throws {
        let data = Data(#"{"approvalId":"approval-1","runId":"run-1","status":"pending","actionLabel":"Start task","reason":"Review","canApprove":true,"limitation":null,"fields":[{"label":"Task","value":"Read a file"}]}"#.utf8)
        let preview = try JSONDecoder().decode(StudioApprovalPreview.self, from: data)
        XCTAssertNil(preview.reviewFingerprint)
        var calls = 0
        let model = StudioApprovalReviewModel(approval: pendingApproval(), load: { preview }, decide: { decision, fingerprint in
            XCTAssertEqual(decision, "denied")
            XCTAssertNil(fingerprint)
            calls += 1
            return self.pendingApproval("denied")
        }, changed: {})
        await model.refresh()
        model.reviewed = true
        XCTAssertFalse(model.canApprove)
        XCTAssertTrue(model.canDecline)
        await model.submit("denied", stillPending: true)
        XCTAssertEqual(calls, 1)
    }

    @MainActor
    func testNativeApprovalDoesNotRetryUncertainDecision() async {
        var calls = 0
        var changed = 0
        let model = StudioApprovalReviewModel(approval: pendingApproval(), load: { self.approvalPreview() }, decide: { _, _ in calls += 1; throw URLError(.networkConnectionLost) }, changed: { changed += 1 })
        await model.refresh()
        model.reviewed = true
        await model.submit("approved", stillPending: true)
        XCTAssertEqual(calls, 1)
        XCTAssertEqual(changed, 1)
        XCTAssertTrue(model.requiresRefresh)
        XCTAssertNotNil(model.error)
        XCTAssertNil(model.notice)
        model.reviewed = true
        await model.submit("approved", stillPending: true)
        XCTAssertEqual(calls, 1)
    }

    @MainActor
    func testNativeApprovalSingleFlightAndStaleDecision() async {
        var continuation: CheckedContinuation<StudioApproval, Error>?
        var calls = 0
        let started = expectation(description: "One decision is in flight")
        let model = StudioApprovalReviewModel(approval: pendingApproval(), load: { self.approvalPreview() }, decide: { _, _ in
            calls += 1
            return try await withCheckedThrowingContinuation { continuation = $0; started.fulfill() }
        }, changed: {})
        await model.refresh()
        model.reviewed = true
        let first = Task { await model.submit("approved", stillPending: true) }
        await fulfillment(of: [started], timeout: 2)
        XCTAssertTrue(model.busy)
        await model.submit("approved", stillPending: true)
        await model.submit("denied", stillPending: true)
        XCTAssertEqual(calls, 1)
        continuation?.resume(throwing: StudioApprovalDecisionError.changed)
        await first.value
        XCTAssertFalse(model.busy)
        XCTAssertTrue(model.requiresRefresh)
        XCTAssertTrue(model.notice?.contains("changed") == true)
        XCTAssertNil(model.error)
    }
    func testConversationPreviewDecodesWithoutBreakingOlderHosts() throws {
        let minimal = Data(#"{"id":"one","title":"A teammate","kind":"direct","botId":"bot","updatedAt":"2026-09-06T12:00:00Z"}"#.utf8)
        let old = try JSONDecoder().decode(StudioThread.self, from: minimal)
        XCTAssertNil(old.lastMessage)
        XCTAssertNil(old.hidden)
        let current = Data(#"{"id":"one","title":"A teammate","kind":"direct","botId":"bot","updatedAt":"2026-09-06T12:00:00Z","lastMessage":"The report is ready.","lastMessageAt":"2026-09-06T12:00:00Z","hidden":true}"#.utf8)
        let decoded = try JSONDecoder().decode(StudioThread.self, from: current)
        XCTAssertEqual(decoded.lastMessage, "The report is ready.")
        XCTAssertEqual(decoded.hidden, true)
    }

    @MainActor
    func testNativeCharactersRenderInBothAppearancesWithoutBitmaps() throws {
        let variants = ["nova", "blob", "sprout", "orbit", "pebble", "sunny"]
        XCTAssertEqual(Set(variants.map { StudioCharacter.silhouette($0).description }).count, 6)
        for variant in variants {
            XCTAssertTrue(CGRect(x: 0, y: 0, width: 100, height: 100).contains(StudioCharacter.silhouette(variant).boundingRect))
        }
        for scheme in [ColorScheme.light, .dark] {
            let content = VStack(spacing: 20) {
                HStack {
                    ForEach(variants, id: \.self) { variant in
                        VStack {
                            StudioCharacter(colorHex: "#6757d9", variant: variant, size: 84, seed: variant)
                            Text(variant).font(.caption).foregroundStyle(StudioPalette.ink)
                        }
                    }
                }
                Text("A clear, readable message").foregroundStyle(StudioPalette.userInk)
                    .padding().background(StudioPalette.userBubble, in: Capsule())
            }.padding(24).background(StudioPalette.paper)
                .environment(\.colorScheme, scheme)
            let renderer = ImageRenderer(content: content)
            renderer.scale = 2
            let rendered = try XCTUnwrap(renderer.uiImage)
            XCTAssertGreaterThan(rendered.size.width, 400)
            let attachment = XCTAttachment(image: rendered)
            attachment.name = "Native characters \(scheme)"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }
    func testCalendarScheduleAndServerPreviewRoundTrip() throws {
        let schedule = StudioRoutineSchedule(kind: "calendar", timeZone: "Europe/Brussels", time: "08:00", daysOfWeek: [1, 2, 3, 4, 5])
        XCTAssertEqual(try JSONDecoder().decode(StudioRoutineSchedule.self, from: JSONEncoder().encode(schedule)), schedule)
        let json = #"{"label":"Weekdays at 08:00 · Europe/Brussels","nextRuns":["2026-03-30T06:00:00.000Z"],"descriptions":["Mon 30 Mar 2026, 08:00 CEST"],"policy":"Catch up once"}"#
        let preview = try JSONDecoder().decode(StudioSchedulePreview.self, from: Data(json.utf8))
        XCTAssertEqual(preview.nextRuns, ["2026-03-30T06:00:00.000Z"])
        XCTAssertEqual(preview.descriptions, ["Mon 30 Mar 2026, 08:00 CEST"])
    }
    func testPageWatchConfigAndStatusAreCompatibleWithPhoneState() throws {
        let config = StudioRoutineTriggerConfig(pageUrl: "https://example.com/news", pageSelector: "#news")
        XCTAssertEqual(try JSONDecoder().decode(StudioRoutineTriggerConfig.self, from: JSONEncoder().encode(config)), config)
        let status = try JSONDecoder().decode(StudioPageWatchStatus.self, from: Data(#"{"state":"baseline","checkedAt":"2026-09-05T12:00:00Z","nextCheckAt":"2026-09-05T12:15:00Z","checks":1,"unchangedChecks":0,"detail":"First version saved."}"#.utf8))
        XCTAssertEqual(status.state, "baseline")
        XCTAssertEqual(status.unchangedChecks, 0)
    }
    func testPairingUsesOnlyHTTPSAndShortLivedFragment() {
        let ticket = String(repeating: "a", count: 43)
        let good = URL(string: "openbot://pair?server=https%3A%2F%2Fstudio.example.com#\(ticket)")!
        XCTAssertEqual(OpenBotDeepLink.pairingInvitation(from: good)?.ticket, ticket)
        for value in [
            "openbot://pair?server=http%3A%2F%2Fstudio.example.com#\(ticket)",
            "openbot://pair?server=https%3A%2F%2Fstudio.example.com&key=secret#\(ticket)",
            "openbot://pair?server=https%3A%2F%2Fstudio.example.com&server=https%3A%2F%2Fother.example#\(ticket)",
            "openbot://pair?server=https%3A%2F%2Fstudio.example.com#short",
            "openbot://pair?server=https%3A%2F%2Fuser%3Asecret%40studio.example.com#\(ticket)"
        ] { XCTAssertNil(OpenBotDeepLink.pairingInvitation(from: URL(string: value)!)) }
    }

    func testPrivateAddressChecksDoNotAcceptPublicLookalikes() {
        for value in ["http://fd.evil.example", "http://fc.evil.example", "http://10.evil.example", "http://127.1.evil.example", "http://192.168.evil.example"] {
            XCTAssertThrowsError(try ConnectionAddress.normalized(value))
        }
    }

    func testAddsHTTPSAndRejectsUnknownPaths() throws {
        let url = try ConnectionAddress.normalized("studio.example.com")
        XCTAssertEqual(url.absoluteString, "https://studio.example.com")
        XCTAssertThrowsError(try ConnectionAddress.normalized("studio.example.com/setup?q=secret"))
    }

    func testHostedRelayPathSurvivesPairingLoginFilesAndEvents() throws {
        let base = "https://pilot.onrender.com/s/" + String(repeating: "a", count: 24)
        let normalized = try ConnectionAddress.normalized(base + "/")
        XCTAssertEqual(normalized.absoluteString, base)
        for path in ["api/auth/pair", "api/auth/login", "api/events", "api/attachments/file-1"] {
            XCTAssertEqual(normalized.appending(path: path).absoluteString, base + "/" + path)
        }
        var link = URLComponents(string: "openbot://pair")!
        link.queryItems = [URLQueryItem(name: "server", value: base)]
        link.fragment = String(repeating: "b", count: 43)
        XCTAssertEqual(OpenBotDeepLink.pairingInvitation(from: link.url!)?.server.absoluteString, base)
        for suffix in ["/../", "/%2e%2e", "/extra", "/%252e%252e"] {
            XCTAssertThrowsError(try ConnectionAddress.normalized(base + suffix))
            link.queryItems = [URLQueryItem(name: "server", value: base + suffix)]
            XCTAssertNil(OpenBotDeepLink.pairingInvitation(from: link.url!))
        }
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
        XCTAssertEqual(StudioStarter.all.map(\.id), ["morning-brief", "meeting-prep", "inbox-follow-ups", "weekly-review"])

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
