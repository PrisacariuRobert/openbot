import SwiftUI

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
        .frame(minWidth: 900, minHeight: 600)
        .background(DesktopTheme.paper)
    }
}

struct DesktopConnectionView: View {
    @EnvironmentObject private var session: DesktopConnectionSession
    @State private var address = ""
    @State private var accessKey = ""
    @FocusState private var focus: Field?

    private enum Field { case address, accessKey }

    var body: some View {
        ZStack {
            DesktopTheme.paper.ignoresSafeArea()
            Circle().fill(DesktopTheme.purple.opacity(0.10)).frame(width: 520).blur(radius: 18).offset(x: 390, y: -310)
            Circle().fill(DesktopTheme.green.opacity(0.07)).frame(width: 410).blur(radius: 24).offset(x: -420, y: 330)
            HStack(spacing: 58) {
                VStack(alignment: .leading, spacing: 20) {
                    sampleMascots
                    Text("Your AI team,\nready on this Mac.")
                        .font(.system(size: 44, weight: .bold, design: .rounded))
                        .foregroundStyle(DesktopTheme.ink)
                        .tracking(-1.4)
                    Text("A native window for conversations, files, approvals and live work. The private runner stays in your control.")
                        .font(.system(size: 16, weight: .medium, design: .rounded))
                        .foregroundStyle(.secondary)
                        .lineSpacing(4)
                        .frame(maxWidth: 440, alignment: .leading)
                    Label("No browser tab required", systemImage: "macwindow")
                    Label("Works with this Mac or a private always-on host", systemImage: "server.rack")
                    Label("Your access key is stored in macOS Keychain", systemImage: "lock.shield.fill")
                }
                .frame(maxWidth: 470, alignment: .leading)

                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Open your studio")
                            .font(.system(size: 24, weight: .bold, design: .rounded))
                        Text("Use the private address and access key shown by your OpenBot home.")
                            .font(.system(size: 13, weight: .medium, design: .rounded))
                            .foregroundStyle(.secondary)
                    }
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
                            .font(.system(size: 12.5, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color(red: 0.70, green: 0.27, blue: 0.25))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Button(action: connect) {
                        HStack(spacing: 9) {
                            if session.isConnecting { ProgressView().controlSize(.small).tint(.white) }
                            else { Image(systemName: "arrow.up.right") }
                            Text(session.isConnecting ? "Connecting…" : "Open my studio")
                        }
                        .font(.system(size: 15, weight: .bold, design: .rounded))
                        .frame(maxWidth: .infinity, minHeight: 46)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.white)
                    .background(DesktopTheme.purple, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .disabled(session.isConnecting)
                    Button {
                        focus = nil
                        Task { await session.connectToThisMac() }
                    } label: {
                        Label("Use OpenBot on this Mac", systemImage: "desktopcomputer")
                            .font(.system(size: 13, weight: .semibold, design: .rounded))
                            .frame(maxWidth: .infinity, minHeight: 36)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(DesktopTheme.purple)
                    .background(DesktopTheme.purple.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .disabled(session.isConnecting)
                }
                .padding(25)
                .frame(width: 400)
                .background(.white.opacity(0.88), in: RoundedRectangle(cornerRadius: 25, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 25, style: .continuous).stroke(.black.opacity(0.07)))
                .shadow(color: .black.opacity(0.06), radius: 24, y: 12)
            }
            .padding(48)
        }
        .onAppear {
            if address.isEmpty { address = session.suggestedAddress }
            focus = .accessKey
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
            .font(.system(size: 12.5, weight: .semibold, design: .rounded))
            .foregroundStyle(DesktopTheme.ink)
            .padding(.bottom, -10)
    }

    private func connect() {
        focus = nil
        Task { await session.connect(address: address, accessKey: accessKey) }
    }
}

struct DesktopSettingsView: View {
    @EnvironmentObject private var session: DesktopConnectionSession
    @AppStorage(DesktopNotifications.enabledKey) private var notificationsEnabled = false
    @State private var notificationMessage: String?

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
            Section {
                Button("Forget this studio", role: .destructive) { session.disconnect(forgetAddress: true) }
            }
        }
        .formStyle(.grouped)
        .padding(.vertical, 8)
    }
}

private extension View {
    func desktopField() -> some View {
        self.font(.system(size: 14, weight: .medium, design: .rounded))
            .padding(.horizontal, 13)
            .frame(height: 43)
            .background(Color.black.opacity(0.035), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Color.black.opacity(0.09)))
    }
}
