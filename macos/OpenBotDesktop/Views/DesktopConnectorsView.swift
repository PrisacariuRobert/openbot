import AppKit
import SwiftUI

enum StudioConnectorAccessLevel: String, CaseIterable, Identifiable {
    case none = "No access"
    case read = "Read only"
    case write = "Read & act"
    var id: String { rawValue }

    static func from(_ access: StudioBotConnectorAccess?) -> Self {
        guard access?.canRead == true else { return .none }
        return access?.canSend == true ? .write : .read
    }
}

struct DesktopConnectorsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    @State private var pendingDisconnect: StudioConnectorCatalogEntry?
    @State private var showingExtensions = false
    @State private var search = ""
    @State private var adding = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(adding ? "Add an app" : "Connected apps").font(.system(size: 25, weight: .semibold))
                    Text("Connect once, then choose what each teammate may use.")
                        .font(.system(size: 11, weight: .medium, design: .default)).foregroundStyle(.secondary)
                }
                Spacer()
                Menu {
                    Button("Open extensions") { showingExtensions = true }
                    Button("Refresh apps") { Task { await store.refreshConnectors() } }.disabled(store.isCheckingConnectors)
                } label: { Image(systemName: "ellipsis") }.menuStyle(.borderlessButton).fixedSize().help("App options")
                Button(adding ? "Back" : "Add app", systemImage: adding ? "arrow.left" : "plus") { adding.toggle(); search = "" }
                    .buttonStyle(.borderedProminent).tint(StudioPalette.ink)
                DesktopPanelCloseButton()
            }
            .padding(.horizontal, 38).padding(.top, 32).padding(.bottom, 22).background(StudioPalette.paper)

            ScrollView {
                VStack(alignment: .leading, spacing: 13) {
                    if adding { TextField("Find an app", text: $search).textFieldStyle(.plain).padding(12).studioOutline(radius: 9).accessibilityLabel("Find an app") }
                    if let error = store.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 11.5, weight: .semibold, design: .default)).foregroundStyle(Color.primary)
                    }
                    if store.connectorStatus == nil && store.isCheckingConnectors {
                        ProgressView("Checking connected apps…").frame(maxWidth: .infinity).padding(.vertical, 90)
                    } else {
                        ForEach(store.connectorStatus?.catalog.filter { $0.availability != "next" && (adding ? !$0.connected : $0.connected) && (search.isEmpty || $0.name.localizedCaseInsensitiveContains(search)) } ?? []) { connector in
                            connectorCard(connector)
                        }
                        if !adding && store.connectorStatus?.catalog.contains(where: { $0.connected }) != true {
                            Text("Connect an app when you need it. Your teammates only receive the access you choose.")
                                .font(.callout).foregroundStyle(StudioPalette.muted).padding(.vertical, 28)
                        }
                    }
                    Text("Read access never implies permission to send, create, or update. Any supported external write still pauses for an exact approval preview.")
                        .font(.system(size: 10.5, weight: .medium, design: .default)).foregroundStyle(.secondary).padding(.top, 3)
                }
                .padding(.horizontal, 38).padding(.vertical, 18)
            }
        }
        .desktopPanelSize(width: 820, height: 700).background(DesktopTheme.paper)
        .sheet(isPresented: $showingExtensions) { OpenExtensionsView(store: store) }
        .task { await store.refreshConnectors() }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                if !Task.isCancelled { await store.refreshConnectors() }
            }
        }
        .confirmationDialog(
            "Disconnect this app?",
            isPresented: Binding(get: { pendingDisconnect != nil }, set: { if !$0 { pendingDisconnect = nil } }),
            titleVisibility: .visible
        ) {
            if let connector = pendingDisconnect {
                Button("Disconnect \(connector.name)", role: .destructive) {
                    pendingDisconnect = nil
                    Task { await store.disconnectConnector(connector.id) }
                }
            }
            Button("Cancel", role: .cancel) { pendingDisconnect = nil }
        } message: {
            Text("Every teammate loses this app connection until you connect it again.")
        }
    }

    private func connectorCard(_ connector: StudioConnectorCatalogEntry) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                StudioBrandMark(provider: connector.id).frame(width: 36, height: 36)
                VStack(alignment: .leading, spacing: 3) {
                    Text(connector.name).font(.system(size: 14.5, weight: .bold, design: .default))
                    Text(connector.description ?? connector.badge ?? "Connected app")
                        .font(.system(size: 10.5, design: .default)).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer()
                if connector.connected {
                    Label(connector.connectionLabel, systemImage: "checkmark.circle").font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
                    if connector.writeRequiresApproval == true && connector.writeConnected == false {
                        Button("Reconnect") {
                            Task {
                                if let url = await store.beginConnectorConnection(connector.id) { NSWorkspace.shared.open(url) }
                            }
                        }
                        .buttonStyle(.borderedProminent).tint(DesktopTheme.purple).controlSize(.small).disabled(store.isCheckingConnectors)
                    }
                    if connector.id != "github" && connector.id != "google-drive" && connector.id != "google-calendar" {
                        Menu { Button("Disconnect", role: .destructive) { pendingDisconnect = connector } } label: { Image(systemName: "ellipsis") }
                            .menuStyle(.borderlessButton).fixedSize().help("App actions")
                    }
                } else {
                    Button("Connect") {
                        Task {
                            if let url = await store.beginConnectorConnection(connector.id) { NSWorkspace.shared.open(url) }
                        }
                    }
                    .buttonStyle(.borderedProminent).tint(DesktopTheme.purple).controlSize(.small).disabled(store.isCheckingConnectors)
                }
            }

            if connector.connected { DisclosureGroup("Teammate access") {
                Divider().opacity(0.45)
                ForEach(store.state.bots) { bot in
                    HStack(spacing: 10) {
                        DesktopMascotView(bot: bot, size: 28).frame(width: 31, height: 31)
                        Text(bot.name).font(.system(size: 11.5, weight: .semibold, design: .default))
                        Spacer()
                        Picker("\(connector.name) access for \(bot.name)", selection: Binding(
                            get: {
                                StudioConnectorAccessLevel.from(store.connectorStatus?.access?.first(where: { $0.botId == bot.id && $0.service == connector.id }))
                            },
                            set: { level in
                                let canWrite = connectorSupportsWrite(connector) && level == .write
                                Task { await store.setConnectorAccess(serviceID: connector.id, botID: bot.id, canRead: level != .none, canSend: canWrite) }
                            }
                        )) {
                            Text(StudioConnectorAccessLevel.none.rawValue).tag(StudioConnectorAccessLevel.none)
                            Text(StudioConnectorAccessLevel.read.rawValue).tag(StudioConnectorAccessLevel.read)
                            if connectorSupportsWrite(connector) && connector.writeConnected != false { Text(StudioConnectorAccessLevel.write.rawValue).tag(StudioConnectorAccessLevel.write) }
                        }
                        .labelsHidden().frame(width: 135).disabled(store.isCheckingConnectors)
                    }
                }
            } }
        }
        .padding(.vertical, 18)
        .overlay(alignment: .bottom) { Rectangle().fill(StudioPalette.line).frame(height: 1) }
    }

    private func connectorSupportsWrite(_ connector: StudioConnectorCatalogEntry) -> Bool {
        connector.writeRequiresApproval == true || ["gmail", "github", "slack", "notion", "todoist"].contains(connector.id)
    }

    private func connectorSymbol(_ id: String) -> String {
        switch id {
        case "gmail": return "envelope.fill"
        case "google-drive": return "externaldrive.connected.to.line.below.fill"
        case "google-calendar": return "calendar"
        case "slack": return "number"
        case "notion": return "doc.text.fill"
        case "github": return "chevron.left.forwardslash.chevron.right"
        case "todoist": return "checkmark.circle.fill"
        case "dropbox": return "shippingbox.fill"
        default: return "puzzlepiece.extension.fill"
        }
    }
}
