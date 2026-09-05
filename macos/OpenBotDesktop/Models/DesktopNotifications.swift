import AppKit
import Foundation
import UserNotifications

@MainActor
enum DesktopNotifications {
    static let enabledKey = "openbot.desktop.notifications.enabled"

    static func setEnabled(_ enabled: Bool) async -> Bool {
        guard enabled else {
            UserDefaults.standard.set(false, forKey: enabledKey)
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["openbot-attention"])
            return false
        }
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])) ?? false
        UserDefaults.standard.set(granted, forKey: enabledKey)
        return granted
    }

    static func postAttention(count: Int) async {
        guard count > 0,
              UserDefaults.standard.bool(forKey: enabledKey),
              !NSApplication.shared.isActive else { return }
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
        let content = UNMutableNotificationContent()
        content.title = "OpenBot needs your attention"
        content.body = count == 1
            ? "One approval or interrupted action is waiting for you."
            : "\(count) approvals or interrupted actions are waiting for you."
        content.sound = .default
        let request = UNNotificationRequest(identifier: "openbot-attention", content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
    }
}
