import AppKit
import SwiftUI

@main
@MainActor
final class OpenBotDesktopApplication: NSObject, NSApplicationDelegate {
    let session = DesktopConnectionSession()
    private var window: NSWindow?
    private var settingsWindow: NSWindow?

    static func main() {
        let application = NSApplication.shared
        let delegate = OpenBotDesktopApplication()
        application.delegate = delegate
        application.setActivationPolicy(.regular)
        application.finishLaunching()
        delegate.openMainWindow()
        application.activate(ignoringOtherApps: true)
        withExtendedLifetime(delegate) { application.run() }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        openMainWindow()
    }

    private func openMainWindow() {
        if let window {
            window.makeKeyAndOrderFront(nil)
            return
        }
        installMainMenu()
        let content = DesktopRootView()
            .environmentObject(session)
            .tint(DesktopTheme.purple)
            .task { await self.session.restore() }
        let controller = NSHostingController(rootView: content)
        // NSWindow owns the size limits. Automatic SwiftUI ideal/minimum size
        // propagation can oscillate with the split view and scroll geometry at
        // compact widths, repeatedly invalidating AppKit's constraints.
        controller.sizingOptions = []
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1_180, height: 760),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "OpenBot"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.toolbarStyle = .unified
        window.minSize = NSSize(width: 1_080, height: 640)
        window.contentViewController = controller
        #if DEBUG
        let preview = ProcessInfo.processInfo.environment
        let isolatedPreview = preview["OPENBOT_NATIVE_PREVIEW_KEY"] != nil
            && preview["OPENBOT_NATIVE_PREVIEW_SERVER"].flatMap { try? ConnectionAddress.normalized($0) }.map(ConnectionAddress.isLoopback) == true
        if isolatedPreview {
            // Keep synthetic visual checks out of the owner's saved geometry
            // and appearance. No preview override is compiled into Release.
            window.appearance = NSAppearance(named: preview["OPENBOT_NATIVE_PREVIEW_APPEARANCE"] == "dark" ? .darkAqua : .aqua)
            if preview["OPENBOT_NATIVE_PREVIEW_SIZE"] == "compact" {
                window.setContentSize(NSSize(width: 1_080, height: 640))
            }
        } else { window.setFrameAutosaveName("OpenBotMainWindow") }
        #else
        window.setFrameAutosaveName("OpenBotMainWindow")
        #endif
        if window.frame.width < 1_080 {
            let available = window.screen?.visibleFrame ?? NSScreen.main?.visibleFrame
            let width = min(1_180, available?.width ?? 1_180)
            let height = min(760, available?.height ?? 760)
            window.setContentSize(NSSize(width: width, height: height))
        }
        window.center()
        self.window = window
        applicationUnhideAndPresent(window)
    }

    private func applicationUnhideAndPresent(_ window: NSWindow) {
        NSApp.unhide(nil)
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        NSApp.activate(ignoringOtherApps: true)
        NSRunningApplication.current.activate(options: [.activateAllWindows])
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { window?.makeKeyAndOrderFront(nil) }
        return true
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        if let url = urls.first {
            switch url.host?.lowercased() {
            case "work": NotificationCenter.default.post(name: .openBotShowWork, object: nil)
            case "live": NotificationCenter.default.post(name: .openBotShowLive, object: nil)
            case "automations": NotificationCenter.default.post(name: .openBotShowAutomations, object: nil)
            case "connections", "providers": NotificationCenter.default.post(name: .openBotShowProviders, object: nil)
            case "projects", "code-projects": NotificationCenter.default.post(name: .openBotShowCodeProjects, object: nil)
            case "access", "permissions": NotificationCenter.default.post(name: .openBotShowPermissions, object: nil)
            case "connectors", "apps": NotificationCenter.default.post(name: .openBotShowConnectors, object: nil)
            case "skills": NotificationCenter.default.post(name: .openBotShowSkills, object: nil)
            case "teach": NotificationCenter.default.post(name: .openBotShowTeach, object: nil)
            case "teammates", "bots": NotificationCenter.default.post(name: .openBotShowTeammates, object: nil)
            case "files", "workspace": NotificationCenter.default.post(name: .openBotShowFiles, object: nil)
            case "search": NotificationCenter.default.post(name: .openBotShowSearch, object: nil)
            default: session.handleDeepLink(url)
            }
        }
        window?.makeKeyAndOrderFront(nil)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    @objc private func showSettings() {
        if session.isAuthenticated {
            window?.makeKeyAndOrderFront(nil)
            NotificationCenter.default.post(name: .openBotShowSettings, object: nil)
            return
        }
        if let settingsWindow {
            settingsWindow.makeKeyAndOrderFront(nil)
        } else {
            let controller = NSHostingController(
                rootView: DesktopSettingsView().environmentObject(session).frame(width: 470)
            )
            let settingsWindow = NSWindow(contentViewController: controller)
            settingsWindow.title = "OpenBot Settings"
            settingsWindow.styleMask = [.titled, .closable]
            settingsWindow.setContentSize(NSSize(width: 470, height: 260))
            settingsWindow.center()
            settingsWindow.makeKeyAndOrderFront(nil)
            self.settingsWindow = settingsWindow
        }
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func focusComposer() {
        window?.makeKeyAndOrderFront(nil)
        NotificationCenter.default.post(name: .openBotFocusComposer, object: nil)
    }

    @objc private func showWork() {
        window?.makeKeyAndOrderFront(nil)
        NotificationCenter.default.post(name: .openBotShowWork, object: nil)
    }

    @objc private func showLive() {
        window?.makeKeyAndOrderFront(nil)
        NotificationCenter.default.post(name: .openBotShowLive, object: nil)
    }

    @objc private func showAutomations() {
        window?.makeKeyAndOrderFront(nil)
        NotificationCenter.default.post(name: .openBotShowAutomations, object: nil)
    }

    @objc private func showProviders() {
        window?.makeKeyAndOrderFront(nil)
        NotificationCenter.default.post(name: .openBotShowProviders, object: nil)
    }

    @objc private func showCodeProjects() {
        window?.makeKeyAndOrderFront(nil)
        NotificationCenter.default.post(name: .openBotShowCodeProjects, object: nil)
    }

    @objc private func showPermissions() {
        window?.makeKeyAndOrderFront(nil)
        NotificationCenter.default.post(name: .openBotShowPermissions, object: nil)
    }

    @objc private func showConnectors() {
        window?.makeKeyAndOrderFront(nil)
        NotificationCenter.default.post(name: .openBotShowConnectors, object: nil)
    }

    @objc private func showSkills() {
        window?.makeKeyAndOrderFront(nil)
        NotificationCenter.default.post(name: .openBotShowSkills, object: nil)
    }

    @objc private func showTeach() {
        window?.makeKeyAndOrderFront(nil)
        NotificationCenter.default.post(name: .openBotShowTeach, object: nil)
    }

    @objc private func showTeammates() {
        window?.makeKeyAndOrderFront(nil)
        NotificationCenter.default.post(name: .openBotShowTeammates, object: nil)
    }

    @objc private func showFiles() {
        window?.makeKeyAndOrderFront(nil)
        NotificationCenter.default.post(name: .openBotShowFiles, object: nil)
    }

    @objc private func showSearch() {
        window?.makeKeyAndOrderFront(nil)
        NotificationCenter.default.post(name: .openBotShowSearch, object: nil)
    }

    private func installMainMenu() {
        let mainMenu = NSMenu()

        let applicationItem = NSMenuItem()
        let applicationMenu = NSMenu()
        applicationMenu.addItem(withTitle: "About OpenBot", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        applicationMenu.addItem(.separator())
        let settings = NSMenuItem(title: "Settings…", action: #selector(showSettings), keyEquivalent: ",")
        settings.target = self
        applicationMenu.addItem(settings)
        applicationMenu.addItem(.separator())
        applicationMenu.addItem(withTitle: "Hide OpenBot", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        applicationMenu.addItem(withTitle: "Quit OpenBot", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        applicationItem.submenu = applicationMenu
        mainMenu.addItem(applicationItem)

        let editItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu
        mainMenu.addItem(editItem)

        let studioItem = NSMenuItem()
        let studioMenu = NSMenu(title: "Studio")
        let search = NSMenuItem(title: "Search Studio…", action: #selector(showSearch), keyEquivalent: "f")
        search.target = self
        studioMenu.addItem(search)
        let focus = NSMenuItem(title: "Focus Message", action: #selector(focusComposer), keyEquivalent: "k")
        focus.target = self
        studioMenu.addItem(focus)
        let work = NSMenuItem(title: "Work", action: #selector(showWork), keyEquivalent: "W")
        work.target = self
        studioMenu.addItem(work)
        let live = NSMenuItem(title: "Live Studio", action: #selector(showLive), keyEquivalent: "L")
        live.target = self
        studioMenu.addItem(live)
        let automations = NSMenuItem(title: "Automations", action: #selector(showAutomations), keyEquivalent: "A")
        automations.target = self
        studioMenu.addItem(automations)
        let providers = NSMenuItem(title: "AI Connections", action: #selector(showProviders), keyEquivalent: "P")
        providers.target = self
        studioMenu.addItem(providers)
        let projects = NSMenuItem(title: "Code Projects", action: #selector(showCodeProjects), keyEquivalent: "G")
        projects.target = self
        studioMenu.addItem(projects)
        let permissions = NSMenuItem(title: "Access & Capabilities", action: #selector(showPermissions), keyEquivalent: "E")
        permissions.target = self
        studioMenu.addItem(permissions)
        let connectors = NSMenuItem(title: "Apps & Tools", action: #selector(showConnectors), keyEquivalent: "T")
        connectors.target = self
        studioMenu.addItem(connectors)
        let skills = NSMenuItem(title: "Skill Library", action: #selector(showSkills), keyEquivalent: "S")
        skills.target = self
        studioMenu.addItem(skills)
        let teach = NSMenuItem(title: "Teach a Skill", action: #selector(showTeach), keyEquivalent: "D")
        teach.target = self
        studioMenu.addItem(teach)
        let teammates = NSMenuItem(title: "Teammates", action: #selector(showTeammates), keyEquivalent: "B")
        teammates.target = self
        studioMenu.addItem(teammates)
        let files = NSMenuItem(title: "Workspace Files", action: #selector(showFiles), keyEquivalent: "F")
        files.target = self
        studioMenu.addItem(files)
        studioItem.submenu = studioMenu
        mainMenu.addItem(studioItem)

        let windowItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenu.addItem(.separator())
        windowMenu.addItem(withTitle: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        windowItem.submenu = windowMenu
        mainMenu.addItem(windowItem)
        NSApp.windowsMenu = windowMenu
        NSApp.mainMenu = mainMenu
    }
}

extension Notification.Name {
    static let openBotShowSettings = Notification.Name("app.openbot.show-settings")
    static let openBotFocusComposer = Notification.Name("app.openbot.focus-composer")
    static let openBotShowInspector = Notification.Name("app.openbot.show-inspector")
    static let openBotShowWork = Notification.Name("app.openbot.show-work")
    static let openBotShowLive = Notification.Name("app.openbot.show-live")
    static let openBotShowAutomations = Notification.Name("app.openbot.show-automations")
    static let openBotShowProviders = Notification.Name("app.openbot.show-providers")
    static let openBotShowCodeProjects = Notification.Name("app.openbot.show-code-projects")
    static let openBotShowPermissions = Notification.Name("app.openbot.show-permissions")
    static let openBotShowConnectors = Notification.Name("app.openbot.show-connectors")
    static let openBotShowSkills = Notification.Name("app.openbot.show-skills")
    static let openBotShowTeach = Notification.Name("app.openbot.show-teach")
    static let openBotShowTeammates = Notification.Name("app.openbot.show-teammates")
    static let openBotShowFiles = Notification.Name("app.openbot.show-files")
    static let openBotShowSearch = Notification.Name("app.openbot.show-search")
}

enum DesktopTheme {
    static let purple = StudioPalette.accent // Legacy name; interface accent, not mascot color.
    static let ink = StudioPalette.ink
    static let paper = StudioPalette.paper
    static let green = StudioPalette.green
    static let botBubble = StudioPalette.surface
    static let userBubble = StudioPalette.userBubble
}
