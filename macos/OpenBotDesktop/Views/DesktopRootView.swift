import SwiftUI

/// Matches the approved prototype: quiet outlined secondary actions and one
/// solid primary action, with a consistent hit area in every native sheet.
struct DesktopActionButtonStyle: ButtonStyle {
    var primary = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .medium))
            .padding(.horizontal, 17).frame(minHeight: 36)
            .foregroundStyle(primary ? StudioPalette.userInk : StudioPalette.ink)
            .background(primary ? StudioPalette.ink : StudioPalette.paper, in: Capsule())
            .overlay(Capsule().stroke(primary ? Color.clear : StudioPalette.line, lineWidth: 1))
            .opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.35)
            .contentShape(Capsule())
    }
}

struct DesktopRootView: View {
    @EnvironmentObject private var session: DesktopConnectionSession

    var body: some View {
        Group {
            if session.isAuthenticated, let serverURL = session.serverURL {
                DesktopStudioView(serverURL: serverURL, accessKey: session.clientAccessKey)
                    .id(serverURL)
            } else {
                DesktopConnectionView()
            }
        }
        // The AppKit window already enforces its minimum size. An additional
        // content minimum fights the inspector's available-width calculation.
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DesktopTheme.paper)
        .buttonBorderShape(.capsule)
    }
}

struct DesktopConnectionView: View {
    @EnvironmentObject private var session: DesktopConnectionSession
    @State private var address = ""
    @State private var accessKey = ""
    @State private var manualConnection = false
    @FocusState private var focus: Field?

    private enum Field { case address, accessKey }

    var body: some View {
        ZStack {
            DesktopTheme.paper.ignoresSafeArea()
            HStack(spacing: 58) {
                VStack(alignment: .leading, spacing: 20) {
                    sampleMascots
                    Text("A little help.\nA lot more done.")
                        .font(.system(size: 40, weight: .semibold))
                        .foregroundStyle(DesktopTheme.ink)
                        .tracking(-1.4)
                    Text("Your teammates are here to help with the everyday, the complicated and the things you haven't got to yet.")
                        .font(.system(size: 16, weight: .medium, design: .default))
                        .foregroundStyle(.secondary)
                        .lineSpacing(4)
                        .frame(maxWidth: 440, alignment: .leading)
                    Label("Your files stay under your control", systemImage: "lock.shield")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                }
                .frame(maxWidth: 470, alignment: .leading)

                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Open your studio")
                            .font(.system(size: 24, weight: .bold, design: .default))
                        Text("Pick up where you left off, right here on your Mac.")
                            .font(.system(size: 13, weight: .medium, design: .default))
                            .foregroundStyle(.secondary)
                    }
                    Button {
                        focus = nil
                        Task { await session.connectToThisMac() }
                    } label: {
                        Label("Open on this Mac", systemImage: "desktopcomputer")
                            .font(.system(size: 15, weight: .semibold))
                            .frame(maxWidth: .infinity, minHeight: 46)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(StudioPalette.userInk)
                    .background(StudioPalette.accent, in: RoundedRectangle(cornerRadius: 10))
                    .disabled(session.isConnecting)
                    if session.isConnecting { ProgressView("Opening your studio…").controlSize(.small) }
                    if let error = session.errorMessage, !manualConnection {
                        Text(error).font(.callout).foregroundStyle(Color.primary).fixedSize(horizontal: false, vertical: true)
                    }
                    DisclosureGroup("Connect to another computer", isExpanded: $manualConnection) {
                    VStack(alignment: .leading, spacing: 16) {
                    Text("Use the address and private access key from that computer's OpenBot settings.")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                    fieldLabel("Studio address", icon: "network")
                    TextField("http://127.0.0.1:4311", text: $address)
                        .textFieldStyle(.plain)
                        .focused($focus, equals: .address)
                        .onSubmit { focus = .accessKey }
                        .desktopField()
                    fieldLabel("Private access key", icon: "key.fill")
                    SecureField("Paste your private key", text: $accessKey)
                        .textFieldStyle(.plain)
                        .focused($focus, equals: .accessKey)
                        .onSubmit { connect() }
                        .desktopField()
                    if let error = session.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 12.5, weight: .semibold, design: .default))
                            .foregroundStyle(Color(white: 0.361))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Button(action: connect) {
                        HStack(spacing: 9) {
                            if session.isConnecting { ProgressView().controlSize(.small).tint(StudioPalette.userInk) }
                            else { Image(systemName: "arrow.up.right") }
                            Text(session.isConnecting ? "Connecting…" : "Open my studio")
                        }
                        .font(.system(size: 15, weight: .bold, design: .default))
                        .frame(maxWidth: .infinity, minHeight: 46)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(StudioPalette.userInk)
                    .background(DesktopTheme.purple, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .disabled(session.isConnecting)
                    }.padding(.top, 12)
                    }
                }
                .padding(25)
                .frame(width: 400)
                .background(StudioPalette.surface, in: RoundedRectangle(cornerRadius: 25, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 25, style: .continuous).stroke(StudioPalette.line))
            }
            .padding(48)
        }
        .onAppear {
            if address.isEmpty { address = session.suggestedAddress }
            if let url = URL(string: address), !ConnectionAddress.isLoopback(url) { manualConnection = true; focus = .accessKey }
        }
        .onChange(of: session.suggestedAddress) { _, value in
            if !value.isEmpty { address = value }
        }
    }

    private var sampleMascots: some View {
        let samples = [
            StudioBot(id: "sample-nova", name: "Nova", mascot: "nova", color: "#6D5BD8", role: "Researcher", status: "ready", threadId: "", lastActiveAt: nil),
            StudioBot(id: "sample-pixel", name: "Pixel", mascot: "blob", color: "#E75C83", role: "Maker", status: "ready", threadId: "", lastActiveAt: nil),
            StudioBot(id: "sample-scout", name: "Scout", mascot: "sprout", color: "#36AA82", role: "Operator", status: "ready", threadId: "", lastActiveAt: nil)
        ]
        return DesktopMascotStack(bots: samples, size: 78).frame(width: 190, height: 90)
    }

    private func fieldLabel(_ title: String, icon: String) -> some View {
        Label(title, systemImage: icon)
            .font(.system(size: 12.5, weight: .semibold, design: .default))
            .foregroundStyle(DesktopTheme.ink)
            .padding(.bottom, -10)
    }

    private func connect() {
        focus = nil
        Task { await session.connect(address: address, accessKey: accessKey) }
    }
}

enum DesktopSettingsSection: String, CaseIterable, Identifiable {
    case providers = "AI providers"
    case teammates = "Your team"
    case connectors = "Connected apps"
    case routines = "Routines"
    case skills = "Skills"
    case teach = "Teach a skill"
    case projects = "Code projects"
    case files = "Files"
    case artifacts = "Artifacts"
    case permissions = "Permissions"
    case general = "You & devices"

    var id: String { rawValue }
    var icon: String {
        switch self {
        case .providers: return "cpu"
        case .teammates: return "person.2"
        case .connectors: return "puzzlepiece.extension"
        case .routines: return "calendar.badge.clock"
        case .skills: return "books.vertical"
        case .teach: return "hand.draw"
        case .projects: return "chevron.left.forwardslash.chevron.right"
        case .files: return "folder"
        case .artifacts: return "doc.badge.clock"
        case .permissions: return "lock.shield"
        case .general: return "gearshape"
        }
    }
}

/// One familiar settings destination, using the real feature views and store.
/// No duplicate forms or simulated connection state.
struct DesktopSettingsCenter: View {
    @ObservedObject var store: StudioStore
    @EnvironmentObject private var session: DesktopConnectionSession
    @Environment(\.dismiss) private var dismiss
    @State private var selection: DesktopSettingsSection = .providers
    @State private var showingMore = false

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                Text("Settings").font(.system(size: 18, weight: .semibold)).padding(.horizontal, 24).padding(.top, 32).padding(.bottom, 30)
                ScrollView {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach([DesktopSettingsSection.providers, .connectors, .teammates, .routines, .general]) { settingsRow($0) }
                        DisclosureGroup("More settings", isExpanded: $showingMore) {
                            VStack(spacing: 4) {
                                ForEach([DesktopSettingsSection.skills, .teach, .projects, .files, .artifacts, .permissions]) { settingsRow($0) }
                            }.padding(.top, 12)
                        }.font(.system(size: 12)).foregroundStyle(StudioPalette.muted).padding(.horizontal, 12).padding(.top, 24)
                    }.padding(.horizontal, 12)
                }
                Button { dismiss() } label: { Label("Back to conversations", systemImage: "arrow.left") }
                    .keyboardShortcut(.cancelAction).buttonStyle(.plain)
                    .font(.system(size: 12)).foregroundStyle(StudioPalette.muted).padding(24)
            }
            .frame(width: 230)
            .background(StudioPalette.sidebar)
            Divider()
            detail
                .environment(\.desktopSettingsEmbedded, true)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(width: 980, height: 660)
        .background(StudioPalette.paper)
        .tint(StudioPalette.accent)
        .buttonBorderShape(.capsule)
        .onChange(of: selection) { _, _ in store.errorMessage = nil }
    }

    private func settingsRow(_ section: DesktopSettingsSection) -> some View {
        Button { selection = section } label: {
            Label(section.rawValue, systemImage: section.icon)
                .font(.system(size: 13)).frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12).padding(.vertical, 12)
                .background(selection == section ? StudioPalette.surface : .clear, in: RoundedRectangle(cornerRadius: 8))
                .contentShape(Rectangle())
        }.buttonStyle(.plain).foregroundStyle(StudioPalette.ink)
            .accessibilityAddTraits(selection == section ? .isSelected : [])
    }

    @ViewBuilder private var detail: some View {
        switch selection {
        case .providers: DesktopProvidersView(store: store)
        case .teammates: DesktopTeammatesView(store: store)
        case .connectors: DesktopConnectorsView(store: store)
        case .routines: DesktopAutomationsView(store: store)
        case .skills: DesktopSkillsView(store: store)
        case .teach: DesktopTeachView(store: store)
        case .projects: DesktopCodeProjectsView(store: store, canChooseLocalFolders: session.serverURL.map(ConnectionAddress.isLoopback) ?? false)
        case .files: DesktopFilesView(store: store)
        case .artifacts: DesktopArtifactsView(store: store)
        case .permissions: DesktopPermissionsView(store: store)
        case .general: DesktopSettingsView()
        }
    }
}

private struct DesktopSettingsEmbeddedKey: EnvironmentKey {
    static let defaultValue = false
}

extension EnvironmentValues {
    var desktopSettingsEmbedded: Bool {
        get { self[DesktopSettingsEmbeddedKey.self] }
        set { self[DesktopSettingsEmbeddedKey.self] = newValue }
    }
}

private struct DesktopPanelSize: ViewModifier {
    @Environment(\.desktopSettingsEmbedded) private var embedded
    let width: CGFloat
    let height: CGFloat

    @ViewBuilder func body(content: Content) -> some View {
        if embedded {
            content.frame(idealWidth: width, maxWidth: .infinity, idealHeight: height, maxHeight: .infinity)
        } else {
            content.frame(width: width, height: height)
        }
    }
}

extension View {
    func desktopPanelSize(width: CGFloat, height: CGFloat) -> some View {
        modifier(DesktopPanelSize(width: width, height: height))
    }
}

struct DesktopPanelCloseButton: View {
    @Environment(\.desktopSettingsEmbedded) private var embedded
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        if !embedded { Button("Done") { dismiss() }.buttonStyle(DesktopActionButtonStyle()).keyboardShortcut(.cancelAction) }
    }
}

struct DesktopSettingsView: View {
    @EnvironmentObject private var session: DesktopConnectionSession
    @AppStorage(DesktopNotifications.enabledKey) private var notificationsEnabled = false
    @State private var notificationMessage: String?
    @State private var showingAwayAccess = false

    var body: some View {
        Form {
            Section("Connected studio") {
                LabeledContent("Address", value: session.displayAddress)
                Label("The private key is protected by macOS Keychain.", systemImage: "lock.shield.fill")
                    .foregroundStyle(.secondary)
            }
            Section("Attention") {
                Toggle("Notify me when OpenBot needs a decision", isOn: $notificationsEnabled)
                    .onChange(of: notificationsEnabled) { _, enabled in
                        Task {
                            let granted = await DesktopNotifications.setEnabled(enabled)
                            if enabled && !granted {
                                notificationsEnabled = false
                                notificationMessage = "Notifications are off in System Settings."
                            } else {
                                notificationMessage = nil
                            }
                        }
                    }
                if let notificationMessage {
                    Text(notificationMessage).foregroundStyle(.secondary)
                }
            }
            Section("Your iPhone") {
                Button { showingAwayAccess = true } label: { Label("Away access · connect with a QR code", systemImage: "qrcode") }
                Text("Only OpenBot on both devices. No extra networking apps.").foregroundStyle(.secondary)
            }
            Section {
                Button("Forget this studio", role: .destructive) { session.disconnect(forgetAddress: true) }
            }
        }
        .formStyle(.grouped)
        .padding(.vertical, 8)
        .sheet(isPresented: $showingAwayAccess) {
            if let url = session.serverURL {
                DesktopAwayAccessView(client: StudioAPIClient(baseURL: url, accessKey: session.clientAccessKey))
            }
        }
    }
}

private extension View {
    func desktopField() -> some View {
        self.font(.system(size: 14, weight: .medium, design: .default))
            .padding(.horizontal, 13)
            .frame(height: 43)
            .background(Color.black.opacity(0.035), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.black.opacity(0.09)))
    }
}
