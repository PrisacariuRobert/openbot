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

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "puzzlepiece.extension.fill").font(.system(size: 17, weight: .semibold)).foregroundStyle(DesktopTheme.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Apps & tools").font(.system(size: 17, weight: .bold, design: .rounded))
                    Text("Connect once, then choose what each teammate may use.")
                        .font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                }
                Spacer()
                Button { Task { await store.refreshConnectors() } } label: { Image(systemName: "arrow.clockwise") }
                    .buttonStyle(.bordered).controlSize(.small).disabled(store.isCheckingConnectors)
                Button("Done") { dismiss() }.buttonStyle(.bordered).controlSize(.small)
            }
            .padding(.horizontal, 18).padding(.vertical, 13).background(.ultraThinMaterial)
            Divider().opacity(0.55)

            ScrollView {
                VStack(alignment: .leading, spacing: 13) {
                    if let error = store.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 11.5, weight: .semibold, design: .rounded)).foregroundStyle(.orange)
                    }
                    if store.connectorStatus == nil && store.isCheckingConnectors {
                        ProgressView("Checking connected apps…").frame(maxWidth: .infinity).padding(.vertical, 90)
                    } else {
                        ForEach(store.connectorStatus?.catalog.filter { $0.availability != "next" } ?? []) { connector in
                            connectorCard(connector)
                        }
                    }
                    Text("Read access never implies permission to send, create, or update. Any supported external write still pauses for an exact approval preview.")
                        .font(.system(size: 10.5, weight: .medium, design: .rounded)).foregroundStyle(.secondary).padding(.top, 3)
                }
                .padding(20)
            }
        }
        .frame(width: 820, height: 700).background(DesktopTheme.paper)
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
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous).fill(connector.connected ? DesktopTheme.green.opacity(0.12) : DesktopTheme.purple.opacity(0.09))
                    Image(systemName: connectorSymbol(connector.id)).font(.system(size: 17, weight: .semibold)).foregroundStyle(connector.connected ? DesktopTheme.green : DesktopTheme.purple)
                }.frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 3) {
                    Text(connector.name).font(.system(size: 14.5, weight: .bold, design: .rounded))
                    Text(connector.description ?? connector.badge ?? "Connected app")
                        .font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer()
                if connector.connected {
                    Label("Ready", systemImage: "checkmark.circle.fill").font(.system(size: 10.5, weight: .bold, design: .rounded)).foregroundStyle(DesktopTheme.green)
                    if connector.writeRequiresApproval == true && connector.writeConnected == false {
                        Button("Reconnect") {
                            Task {
                                if let url = await store.beginConnectorConnection(connector.id) { NSWorkspace.shared.open(url) }
                            }
                        }
                        .buttonStyle(.borderedProminent).tint(DesktopTheme.purple).controlSize(.small).disabled(store.isCheckingConnectors)
                    }
                    if connector.id != "github" && connector.id != "google-drive" && connector.id != "google-calendar" {
                        Button(role: .destructive) { pendingDisconnect = connector } label: { Image(systemName: "xmark.circle") }
                            .buttonStyle(.bordered).controlSize(.small).help("Disconnect")
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

            if connector.connected {
                Divider().opacity(0.45)
                ForEach(store.state.bots) { bot in
                    HStack(spacing: 10) {
                        DesktopMascotView(bot: bot, size: 28).frame(width: 31, height: 31)
                        Text(bot.name).font(.system(size: 11.5, weight: .semibold, design: .rounded))
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
            }
        }
        .padding(14).background(.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(.black.opacity(0.055)))
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
