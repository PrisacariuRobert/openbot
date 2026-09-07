import SwiftUI

@main
struct OpenBotMobileApp: App {
    @UIApplicationDelegateAdaptor(OpenBotAppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var session = ConnectionSession()
    @StateObject private var push = PushRegistration.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .environmentObject(push)
                .tint(OpenBotTheme.purple)
                .onOpenURL { session.handleDeepLink($0) }
                .task {
                    await session.restore()
                    await push.restore()
                    await session.registerPushDevice(push.deviceToken)
                }
                .onChange(of: push.deviceToken) { _, token in
                    Task { await session.registerPushDevice(token) }
                }
                .onChange(of: session.isAuthenticated) { _, connected in
                    if connected { Task { await session.registerPushDevice(push.deviceToken) } }
                }
                .onReceive(NotificationCenter.default.publisher(for: .openBotNotificationOpened)) { notification in
                    if let path = notification.object as? String { session.handleNotificationPath(path) }
                }
                .onChange(of: scenePhase) { _, phase in
                    guard phase == .active else { return }
                    Task {
                        await session.refreshIfNeeded()
                        await session.registerPushDevice(push.deviceToken)
                    }
                }
        }
    }
}

enum OpenBotTheme {
    static let purple = StudioPalette.accent // Legacy name; interface accent, not mascot color.
    static let ink = StudioPalette.ink
    static let paper = StudioPalette.paper
    static let green = StudioPalette.green
    static let botBubble = StudioPalette.surface
    static let userBubble = StudioPalette.userBubble
    static let messagePurpleStart = StudioPalette.accent
    static let messagePurpleEnd = StudioPalette.accent
    static let lavender = StudioPalette.accent
}
