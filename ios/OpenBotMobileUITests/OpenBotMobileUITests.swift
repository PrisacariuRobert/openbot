import XCTest

@MainActor
final class OpenBotMobileUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
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
        if studioTitle.waitForExistence(timeout: 3) {
            app.buttons["Studio settings"].tap()
            let reconnectButton = app.buttons["Connect to another studio"]
            if !reconnectButton.waitForExistence(timeout: 2) {
                app.swipeUp()
            }
            XCTAssertTrue(reconnectButton.waitForExistence(timeout: 5))
            reconnectButton.tap()
        }

        let addressField = app.textFields["server-address"]
        XCTAssertTrue(addressField.waitForExistence(timeout: 8))
        replaceText(in: addressField, with: server)
        addressField.typeText("\n")

        let accessKeyField = app.secureTextFields["access-key"]
        XCTAssertTrue(accessKeyField.waitForExistence(timeout: 3))
        accessKeyField.typeText(accessKey)

        app.buttons["connect-studio"].tap()
        let didConnect = studioTitle.waitForExistence(timeout: 20)
        if !didConnect { XCTContext.runActivity(named: "Connection screen state") { _ in print(app.debugDescription) } }
        XCTAssertTrue(didConnect, "The native OpenBot conversation did not appear.")
        let messageField = app.textFields["native-message-field"]
        XCTAssertTrue(messageField.waitForExistence(timeout: 10), "The native message composer did not load.")
        XCTAssertTrue(app.buttons["Start voice capture"].exists, "The native voice action is missing from the composer.")
        app.buttons["Work"].tap()
        XCTAssertTrue(app.staticTexts["native-ready-made-work"].waitForExistence(timeout: 8), "The native ready-made Work surface did not load.")
        XCTAssertTrue(findText("Morning brief", in: app), "The native morning brief starter is missing.")
        XCTAssertTrue(findText("Prepare my next meeting", in: app), "The native meeting-prep starter is missing.")
        XCTAssertTrue(findText("Prepare my follow-ups", in: app), "The native inbox follow-up starter is missing.")
        let workScreenshot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        workScreenshot.name = "OpenBot native Work"
        workScreenshot.lifetime = .keepAlways
        add(workScreenshot)
        app.buttons["close-native-work"].tap()
        app.buttons["Live Studio"].tap()
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
