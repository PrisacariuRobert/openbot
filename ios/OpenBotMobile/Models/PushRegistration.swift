import Foundation
import UIKit
import UserNotifications

@MainActor
final class PushRegistration: ObservableObject {
    static let shared = PushRegistration()

    @Published private(set) var deviceToken: String?
    @Published private(set) var state: State = .unknown
    @Published private(set) var errorMessage: String?

    enum State: String {
        case unknown
        case available
        case denied
        case registered
        case failed
    }

    var isAuthorized: Bool { state == .available || state == .registered }

    func restore() async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        switch settings.authorizationStatus {
        case .authorized, .provisional, .ephemeral:
            state = .available
            UIApplication.shared.registerForRemoteNotifications()
        case .denied: state = .denied
        default: state = .unknown
        }
    }

    func requestPermission() async {
        do {
            let allowed = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
            state = allowed ? .available : .denied
            errorMessage = nil
            if allowed { UIApplication.shared.registerForRemoteNotifications() }
        } catch {
            state = .failed
            errorMessage = "iPhone could not enable notifications. Try again from Settings."
        }
    }

    func openSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    func received(deviceToken data: Data) {
        deviceToken = data.map { String(format: "%02x", $0) }.joined()
        state = .registered
        errorMessage = nil
    }

    func failed(_ error: Error) {
        state = .failed
        errorMessage = "Native notifications need a signed physical-device build with Push Notifications enabled."
    }
}

final class OpenBotAppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in PushRegistration.shared.received(deviceToken: deviceToken) }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        Task { @MainActor in PushRegistration.shared.failed(error) }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .list]
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard let path = response.notification.request.content.userInfo["url"] as? String else { return }
        await MainActor.run {
            NotificationCenter.default.post(name: .openBotNotificationOpened, object: path)
        }
    }
}

extension Notification.Name {
    static let openBotNotificationOpened = Notification.Name("OpenBotNotificationOpened")
}
