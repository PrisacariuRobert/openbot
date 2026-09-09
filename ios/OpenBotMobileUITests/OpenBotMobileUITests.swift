import XCTest

@MainActor
final class OpenBotMobileUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testSyntheticConversationVisualSmoke() async throws {
        guard (ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] ?? "").contains("Native Polish QA") else {
            throw XCTSkip("Use a disposable simulator named OpenBot Native Polish QA; never an owner device.")
        }
        let raw = ProcessInfo.processInfo.environment["OPENBOT_TEST_SERVER"] ?? ""
        guard let server = URL(string: raw), server.host == "127.0.0.1", server.port != nil else {
            throw XCTSkip("Start scripts/native-ui-fixture.mjs and use its loopback address on a disposable simulator.")
        }
        let (data, _) = try await URLSession.shared.data(from: server.appending(path: "native-visual-fixture"))
        let marker = try JSONSerialization.jsonObject(with: data) as? [String: String]
        guard marker?["fixture"] == "openbot-native-visual-only", let key = marker?["key"] else {
            throw XCTSkip("Not the synthetic visual fixture; refusing to connect.")
        }
        // Reset only this fixture's in-memory draft, after verifying its marker.
        var reset = URLRequest(url: server.appending(path: "api/drafts/thread-0"))
        reset.httpMethod = "PUT"
        reset.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        reset.setValue("application/json", forHTTPHeaderField: "Content-Type")
        reset.httpBody = Data(#"{"body":""}"#.utf8)
        let (_, resetResponse) = try await URLSession.shared.data(for: reset)
        XCTAssertEqual((resetResponse as? HTTPURLResponse)?.statusCode, 200)
        let app = XCUIApplication()
        // Argument-domain defaults apply only to this disposable test launch.
        app.launchArguments += ["-openbot.server.address", raw]
        app.launch()
        let listTitle = app.staticTexts["native-conversation-list-title"]
        if !listTitle.waitForExistence(timeout: 4) {
            let address = app.textFields["server-address"]
            if !address.exists { app.buttons["Advanced · connect manually"].tap() }
            XCTAssertTrue(address.waitForExistence(timeout: 5))
            replaceText(in: address, with: raw)
            address.typeText("\n")
            let access = app.secureTextFields["access-key"]
            XCTAssertTrue(access.waitForExistence(timeout: 3))
            access.typeText(key)
            app.buttons["connect-studio"].tap()
        }
        let connected = listTitle.waitForExistence(timeout: 12)
        if !connected { keepScreenshot("Synthetic connection failure") }
        XCTAssertTrue(connected, app.debugDescription)
        keepScreenshot("Approved direction — native conversation list")
        if marker?["attention"] == "included" {
            let attention = app.buttons["native-needs-attention"]
            XCTAssertTrue(attention.waitForExistence(timeout: 4))
            attention.tap()
            XCTAssertTrue(app.staticTexts["Milo needs a hand"].waitForExistence(timeout: 5))
            XCTAssertFalse(app.staticTexts["All quiet for now"].exists)
            keepScreenshot("Needs you — failed work from another conversation")
            app.buttons["Open conversation"].firstMatch.tap()
            XCTAssertTrue(app.buttons["Conversation details"].waitForExistence(timeout: 4))
            XCTAssertTrue(app.staticTexts["Milo"].exists)
            XCTAssertTrue(app.staticTexts["Milo's task stopped"].waitForExistence(timeout: 4))
            XCTAssertTrue(app.staticTexts["The sample task stopped. Open the conversation to review it."].exists)
            let failureReview = app.buttons["failed-task-review-fixture-failed"]
            if !failureReview.isHittable { app.swipeUp() }
            failureReview.tap()
            XCTAssertTrue(app.navigationBars["Activity"].waitForExistence(timeout: 4))
            app.navigationBars["Activity"].buttons["Done"].tap()
            app.buttons["Open conversations"].tap()
            attention.tap()
            let reviewRoutine = app.buttons["Review routine"]
            if !reviewRoutine.isHittable { app.swipeUp() }
            XCTAssertTrue(reviewRoutine.waitForExistence(timeout: 4))
            reviewRoutine.tap()
            XCTAssertTrue(app.navigationBars["Routines"].waitForExistence(timeout: 4))
            app.navigationBars["Routines"].buttons["Done"].tap()
            app.navigationBars["Activity"].buttons["Done"].tap()
            XCTAssertTrue(listTitle.waitForExistence(timeout: 4))
        }
        let nova = app.buttons.containing(.staticText, identifier: "Nova").firstMatch
        XCTAssertTrue(nova.waitForExistence(timeout: 4))
        nova.tap()
        XCTAssertTrue(app.staticTexts["Help me prepare for tomorrow’s design review."].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Message options"].exists)
        XCTAssertTrue(app.buttons["Start voice capture"].exists)
        if marker?["progress"] == "included" {
            let update = app.staticTexts["I’m checking the sample notes you provided."]
            XCTAssertFalse(update.exists)
            app.buttons["Work updates"].tap()
            XCTAssertTrue(update.waitForExistence(timeout: 3))
            app.buttons["Work updates"].tap()
            XCTAssertFalse(update.exists)
        }
        keepScreenshot("Approved direction — native conversation")

        // The draft must survive returning to the list and revisiting a thread.
        let message = app.textFields["native-message-field"]
        let controls = [app.buttons["Message options"], app.buttons["Start voice capture"], app.buttons["native-send-message"]]
        for control in controls {
            XCTAssertLessThan(abs(control.frame.midY - message.frame.midY), 3, "Composer controls must share one center line")
        }
        if marker?["sync"] == "included" {
            let syncMessage = "Sync check \(UUID().uuidString.prefix(8))"
            message.tap()
            message.typeText(syncMessage)
            let enteredSync = expectation(for: NSPredicate(format: "value == %@", syncMessage), evaluatedWith: message)
            await fulfillment(of: [enteredSync], timeout: 4)
            app.buttons["native-send-message"].tap()
            XCTAssertTrue(app.staticTexts[syncMessage].waitForExistence(timeout: 5))
            XCTAssertTrue(app.staticTexts["Checking the synthetic example"].waitForExistence(timeout: 5))
            keepScreenshot("Phone — sent message and working progress")
            XCUIDevice.shared.press(.home)
            app.activate()
            XCTAssertTrue(app.staticTexts["Synthetic sync check complete. No real task was run."].waitForExistence(timeout: 20))
            keepScreenshot("Phone — result after resuming without SSE events")
        }
        message.tap()
        message.typeText("Draft continuity check")
        // Distinguish keyboard delivery from draft persistence. Do not navigate
        // before the complete text has reached the native field.
        let entered = expectation(for: NSPredicate(format: "value == %@", "Draft continuity check"), evaluatedWith: message)
        await fulfillment(of: [entered], timeout: 4)
        app.buttons["Open conversations"].tap()
        XCTAssertTrue(listTitle.waitForExistence(timeout: 4))
        nova.tap()
        XCTAssertTrue(message.waitForExistence(timeout: 4))
        XCTAssertEqual(message.value as? String, "Draft continuity check")
        replaceText(in: message, with: "")
        app.buttons["Conversation details"].tap()
        XCTAssertTrue(app.navigationBars["Details"].waitForExistence(timeout: 4))
        XCTAssertTrue(app.buttons["Start a workflow"].exists)
        XCTAssertTrue(app.buttons["Add or manage routines"].exists)
        keepScreenshot("Approved direction — native conversation details")
        app.navigationBars["Details"].buttons["Done"].tap()
        app.buttons["Open conversations"].tap()

        app.buttons["Settings"].tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 4))
        for title in ["AI providers", "Connected apps", "Your team", "Routines", "You & devices"] {
            XCTAssertTrue(app.buttons[title].exists, "Missing settings destination: \(title)")
        }
        keepScreenshot("Approved direction — native settings")
        app.buttons["AI providers"].tap()
        XCTAssertTrue(app.navigationBars["AI providers"].waitForExistence(timeout: 4))
        app.buttons["Add provider"].tap()
        XCTAssertTrue(app.navigationBars["Add a provider"].waitForExistence(timeout: 4))
        keepScreenshot("Approved direction — native provider choice")
        app.buttons["Back"].tap()
        XCTAssertTrue(app.navigationBars["AI providers"].waitForExistence(timeout: 4))
        app.navigationBars["AI providers"].buttons["Done"].tap()

        app.buttons["Routines"].tap()
        XCTAssertTrue(app.navigationBars["Routines"].waitForExistence(timeout: 4))
        app.buttons["New routine"].tap()
        XCTAssertTrue(app.navigationBars["Make it a routine"].waitForExistence(timeout: 4))
        keepScreenshot("Approved direction — native routine editor")
        app.navigationBars["Make it a routine"].buttons["Cancel"].tap()
        app.navigationBars["Routines"].buttons["Done"].tap()
        app.navigationBars["Settings"].buttons["Done"].tap()

        let search = app.textFields["native-conversation-search"]
        search.tap()
        search.typeText("Fern")
        XCTAssertTrue(app.buttons.containing(.staticText, identifier: "Fern").firstMatch.waitForExistence(timeout: 3))
        XCTAssertFalse(app.buttons.containing(.staticText, identifier: "Nova").firstMatch.exists)
        keepScreenshot("Approved direction — native conversation search")
        app.terminate()
    }

    private func keepScreenshot(_ name: String) {
        let capture = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        capture.name = name
        capture.lifetime = .keepAlways
        add(capture)
    }

    func testConnectsToOwnerStudio() throws {
        let environment = ProcessInfo.processInfo.environment
            guard let server = environment["OPENBOT_TEST_SERVER"],
                  let accessKey = environment["OPENBOT_TEST_ACCESS_KEY"],
                  !server.isEmpty, !accessKey.isEmpty,
                  !server.hasPrefix("$("), !accessKey.hasPrefix("$(") else {
            throw XCTSkip("Set OPENBOT_TEST_SERVER and OPENBOT_TEST_ACCESS_KEY to run the live connection check.")
        }

        let app = XCUIApplication()
        app.launch()

        let studioTitle = app.staticTexts["studio-native-title"]
        let listTitle = app.staticTexts["native-conversation-list-title"]
        if studioTitle.waitForExistence(timeout: 2) { app.buttons["Open conversations"].tap() }
        if listTitle.waitForExistence(timeout: 3) {
            app.buttons["Settings"].tap()
            app.buttons["You & devices"].tap()
            let reconnectButton = app.buttons["Connect to another studio"]
            if !reconnectButton.waitForExistence(timeout: 2) {
                app.swipeUp()
            }
            XCTAssertTrue(reconnectButton.waitForExistence(timeout: 5))
            reconnectButton.tap()
        }

        let addressField = app.textFields["server-address"]
        if !addressField.exists { app.buttons["Advanced · connect manually"].tap() }
        XCTAssertTrue(addressField.waitForExistence(timeout: 8))
        replaceText(in: addressField, with: server)
        addressField.typeText("\n")

        let accessKeyField = app.secureTextFields["access-key"]
        XCTAssertTrue(accessKeyField.waitForExistence(timeout: 3))
        accessKeyField.typeText(accessKey)

        app.buttons["connect-studio"].tap()
        let didConnect = listTitle.waitForExistence(timeout: 20)
        if !didConnect { XCTContext.runActivity(named: "Connection screen state") { _ in print(app.debugDescription) } }
        XCTAssertTrue(didConnect, "The native OpenBot conversation list did not appear.")
        let thread = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "native-thread-")).firstMatch
        XCTAssertTrue(thread.waitForExistence(timeout: 10), "Create a teammate before running this owner pilot.")
        thread.tap()
        let messageField = app.textFields["native-message-field"]
        XCTAssertTrue(messageField.waitForExistence(timeout: 10), "The native message composer did not load.")
        XCTAssertTrue(app.buttons["Start voice capture"].exists, "The native voice action is missing from the composer.")
        app.buttons["Conversation details"].tap()
        app.buttons["Start a workflow"].tap()
        XCTAssertTrue(app.staticTexts["native-ready-made-work"].waitForExistence(timeout: 8), "The native ready-made Work surface did not load.")
        XCTAssertTrue(findText("Morning brief", in: app), "The native morning brief starter is missing.")
        XCTAssertTrue(findText("Prepare my next meeting", in: app), "The native meeting-prep starter is missing.")
        XCTAssertTrue(findText("Prepare my follow-ups", in: app), "The native inbox follow-up starter is missing.")
        let workScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        workScreenshot.name = "OpenBot native Work"
        workScreenshot.lifetime = .keepAlways
        add(workScreenshot)
        app.buttons["close-native-work"].tap()
        app.buttons["Conversation details"].tap()
        app.buttons["Activity & approvals"].tap()
        let teamReady = app.staticTexts["Your team is ready"].waitForExistence(timeout: 10)
        let teamWorking = app.staticTexts["Your team is moving work forward"].waitForExistence(timeout: teamReady ? 0 : 2)
        XCTAssertTrue(teamReady || teamWorking, "The native Live Studio surface did not load.")
        let privateHome = app.staticTexts["PRIVATE ALWAYS-ON HOME"].exists
        if privateHome {
            let heartbeatEnabled = app.staticTexts["Offline protection is checking in"].exists
            let heartbeatReadyToConfigure = app.staticTexts["Know if this whole home goes offline"].exists
            XCTAssertTrue(heartbeatEnabled || heartbeatReadyToConfigure, "The private-home heartbeat control did not load.")
            XCTAssertTrue(app.staticTexts["Move this home securely"].exists, "The native encrypted-transfer guidance did not load.")
        } else {
            XCTAssertTrue(app.staticTexts["Studio runner is awake"].exists, "The local runner status did not load.")
        }
        app.navigationBars["Activity"].buttons["Done"].tap()
        if let expectedDraft = environment["OPENBOT_TEST_DRAFT"], !expectedDraft.isEmpty {
            let continuedLabel = app.staticTexts["Continued from your Mac"]
            XCTAssertTrue(continuedLabel.waitForExistence(timeout: 10), "The Mac-to-iPhone handoff cue did not appear.")
            XCTAssertEqual(messageField.value as? String, expectedDraft, "The unfinished Mac message did not continue on iPhone.")
        }

        let screenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        screenshot.name = "OpenBot connected studio"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    private func replaceText(in field: XCUIElement, with text: String) {
        field.tap()
        if let currentText = field.value as? String, !currentText.isEmpty {
            field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: currentText.count))
        }
        field.typeText(text)
    }

    private func findText(_ label: String, in app: XCUIApplication) -> Bool {
        let text = app.staticTexts[label]
        if text.exists { return true }
        for _ in 0..<3 {
            app.swipeUp()
            if text.waitForExistence(timeout: 1) { return true }
        }
        return false
    }
}
