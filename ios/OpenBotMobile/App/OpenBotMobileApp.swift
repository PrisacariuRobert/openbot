import SwiftUI

@main
struct OpenBotMobileApp: App {
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var session = ConnectionSession()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .tint(OpenBotTheme.purple)
                .onOpenURL { session.handleDeepLink($0) }
                .task { await session.restore() }
                .onChange(of: scenePhase) { _, phase in
                    guard phase == .active else { return }
                    Task { await session.refreshIfNeeded() }
                }
        }
    }
}

enum OpenBotTheme {
    static let purple = Color(red: 0.40, green: 0.34, blue: 0.84)
    static let ink = Color(red: 0.14, green: 0.13, blue: 0.12)
    static let paper = Color(red: 0.97, green: 0.96, blue: 0.94)
    static let green = Color(red: 0.20, green: 0.61, blue: 0.42)
    static let botBubble = Color(red: 0.933, green: 0.925, blue: 0.91)
    static let messagePurpleStart = Color(red: 0.459, green: 0.396, blue: 0.882)
    static let messagePurpleEnd = Color(red: 0.384, green: 0.318, blue: 0.820)
    static let lavender = Color(red: 0.608, green: 0.549, blue: 0.925)
}
