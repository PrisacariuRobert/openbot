import AppKit
import SwiftUI

struct DesktopWorkView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    @State private var startingID: String?

    var body: some View {
        VStack(spacing: 0) {
            sheetHeader("Put your team to work", subtitle: "Start a source-backed job, then keep talking naturally in the team room.", icon: "sparkles")
            Divider().opacity(0.55)
            ScrollView {
                VStack(alignment: .leading, spacing: 13) {
                    if let error = store.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundStyle(.orange)
                    }
                    ForEach(StudioStarter.all) { starter in
                        workCard(starter)
                    }
                    Text("Every starter saves a report, keeps source coverage visible, and leaves outgoing changes for approval.")
                        .font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                        .padding(.top, 3)
                }
                .padding(20)
            }
        }
        .frame(width: 620, height: 590)
        .background(DesktopTheme.paper)
        .task { await store.refreshConnectors() }
    }

    private func workCard(_ starter: StudioStarter) -> some View {
        let missing = missingServices(for: starter)
        let ready = store.connectorStatus != nil && missing.isEmpty
        let recoveryURL = missing.compactMap { store.connectorStatus?.googleRecoveryURL(for: $0) }.first
        let canConnect = store.connectorStatus?.canStartGoogleOAuth == true
        let canAct = ready || recoveryURL != nil || canConnect
        let status = ready
            ? "Ready with \(starter.requiredServices.map(serviceName).joined(separator: ", "))"
            : recoveryURL != nil
                ? "Turn on \(missing.map(serviceName).joined(separator: " + "))"
                : canConnect
                    ? "Connect \(missing.map(serviceName).joined(separator: " + "))"
                    : "Finish connector setup on your OpenBot host"

        return Button {
            guard startingID == nil, canAct else { return }
            if let recoveryURL { NSWorkspace.shared.open(recoveryURL); return }
            startingID = starter.id
            Task {
                if ready {
                    if await store.startWorkflow(starter) { dismiss() }
                } else if let url = await store.beginGoogleConnection() {
                    NSWorkspace.shared.open(url)
                }
                startingID = nil
            }
        } label: {
            HStack(alignment: .top, spacing: 13) {
                ZStack {
                    RoundedRectangle(cornerRadius: 13, style: .continuous).fill(DesktopTheme.purple.opacity(0.10))
                    Image(systemName: starter.systemImage).font(.system(size: 18, weight: .semibold)).foregroundStyle(DesktopTheme.purple)
                }
                .frame(width: 46, height: 46)
                VStack(alignment: .leading, spacing: 5) {
                    Text(starter.title).font(.system(size: 15, weight: .bold, design: .rounded)).foregroundStyle(DesktopTheme.ink)
                    Text(starter.summary).font(.system(size: 12.5, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                    Text(starter.detail).font(.system(size: 11, design: .rounded)).foregroundStyle(.secondary).lineLimit(2)
                    Label(status, systemImage: ready ? "checkmark.circle.fill" : "link.badge.plus")
                        .font(.system(size: 10.5, weight: .semibold, design: .rounded))
                        .foregroundStyle(ready ? DesktopTheme.green : .orange)
                }
                Spacer(minLength: 8)
                if startingID == starter.id { ProgressView().controlSize(.small) }
                else { Image(systemName: "arrow.up.right").foregroundStyle(.secondary) }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.white.opacity(ready ? 0.90 : 0.68), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(ready ? DesktopTheme.purple.opacity(0.14) : .black.opacity(0.06)))
        }
        .buttonStyle(.plain)
        .disabled(!canAct || startingID != nil)
    }

    private func missingServices(for starter: StudioStarter) -> [String] {
        guard let status = store.connectorStatus else { return starter.requiredServices }
        return starter.requiredServices.filter { !status.isConnected($0) }
    }

    private func serviceName(_ id: String) -> String {
        switch id {
        case "google-calendar": return "Calendar"
        case "google-drive": return "Drive"
        default: return "Gmail"
        }
    }

    private func sheetHeader(_ title: String, subtitle: String, icon: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 17, weight: .semibold)).foregroundStyle(DesktopTheme.purple)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 17, weight: .bold, design: .rounded))
                Text(subtitle).font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
            }
            Spacer()
            Button("Done") { dismiss() }.buttonStyle(.bordered).controlSize(.small)
        }
        .padding(.horizontal, 18).padding(.vertical, 13).background(.ultraThinMaterial)
    }
}

struct DesktopLiveView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    let canManageBackgroundProtection: Bool
    @State private var confirmingProtectionRemoval = false
    @State private var browserBot: StudioBot?

    private var runs: [StudioRun] { store.state.studioRuns ?? store.state.runs }
    private var uncertain: [StudioApprovedAction] { (store.state.approvedActions ?? []).filter { $0.status == "uncertain" } }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "rectangle.3.group").font(.system(size: 17, weight: .semibold)).foregroundStyle(DesktopTheme.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Live Studio").font(.system(size: 17, weight: .bold, design: .rounded))
                    Text("Watch work, approve the next move, and recover interrupted actions safely.")
                        .font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                }
                Spacer()
                Button("Done") { dismiss() }.buttonStyle(.bordered).controlSize(.small)
            }
            .padding(.horizontal, 18).padding(.vertical, 13).background(.ultraThinMaterial)
            Divider().opacity(0.55)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 18) {
                        DesktopMascotStack(bots: store.state.bots, size: 70).frame(width: 190, height: 86)
                        VStack(alignment: .leading, spacing: 5) {
                            Label(store.isLive ? "STUDIO CONNECTED" : "RECONNECTING", systemImage: "circle.fill")
                                .font(.system(size: 9.5, weight: .bold, design: .rounded)).foregroundStyle(store.isLive ? DesktopTheme.green : .orange)
                            Text(store.state.usage.activeRuns > 0 ? "Your team is moving work forward" : "Your team is ready")
                                .font(.system(size: 23, weight: .bold, design: .rounded))
                            Text(store.state.runner?.backgroundServiceDetail ?? "OpenBot keeps the work queue durable on its host.")
                                .font(.system(size: 11.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(3)
                        }
                    }
                    .padding(18).frame(maxWidth: .infinity, alignment: .leading)
                    .background(.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 20, style: .continuous))

                    HStack(spacing: 10) {
                        liveStat(store.state.usage.activeRuns, "working now", "sparkles")
                        liveStat(store.state.approvals.count + uncertain.count, "need you", "hand.raised.fill")
                        liveStat(store.state.usage.completedRuns, "finished", "checkmark.circle.fill")
                    }

                    if store.state.runner?.deployment?.mode != "private_runner" && canManageBackgroundProtection {
                        HStack(spacing: 12) {
                            Image(systemName: store.state.runner?.backgroundService == "installed" ? "shield.checkered" : "moon.stars.fill")
                                .font(.system(size: 19, weight: .semibold)).foregroundStyle(DesktopTheme.purple)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(store.state.runner?.backgroundService == "installed" ? "Background protection is on" : "Keep OpenBot running")
                                    .font(.system(size: 13, weight: .bold, design: .rounded))
                                Text(store.state.runner?.backgroundServiceDetail ?? "Start OpenBot at login and restart it after an unexpected stop.")
                                    .font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(2)
                            }
                            Spacer()
                            if store.state.runner?.backgroundService == "installed" {
                                Button("Turn off") { confirmingProtectionRemoval = true }.buttonStyle(.bordered)
                            } else {
                                Button("Protect this Mac") { Task { await store.setBackgroundProtection(true) } }
                                    .buttonStyle(.borderedProminent).tint(DesktopTheme.purple)
                            }
                        }
                        .controlSize(.small).padding(14)
                        .background(.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(.black.opacity(0.055)))
                    } else if store.state.runner?.deployment?.mode != "private_runner" {
                        Label("Background protection can be changed only from the Mac running OpenBot.", systemImage: "desktopcomputer")
                            .font(.system(size: 11, weight: .medium, design: .rounded))
                            .foregroundStyle(.secondary)
                    }

                    if !uncertain.isEmpty {
                        VStack(alignment: .leading, spacing: 11) {
                            Label("Check before OpenBot continues", systemImage: "exclamationmark.arrow.triangle.2.circlepath")
                                .font(.system(size: 14, weight: .bold, design: .rounded)).foregroundStyle(.orange)
                            ForEach(uncertain) { action in
                                HStack(spacing: 12) {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(action.actionLabel).font(.system(size: 12.5, weight: .semibold, design: .rounded))
                                        Text("This may have completed during a restart. It was not repeated.")
                                            .font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Button("It happened") { Task { await store.resolveApprovedAction(action, completed: true) } }
                                        .buttonStyle(.borderedProminent).tint(DesktopTheme.green)
                                    Button("It didn’t") { Task { await store.resolveApprovedAction(action, completed: false) } }
                                        .buttonStyle(.bordered)
                                }
                                .controlSize(.small).padding(11)
                                .background(.white.opacity(0.72), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                            }
                        }
                        .padding(15).background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
                    }

                    VStack(alignment: .leading, spacing: 11) {
                        Text("Teammates").font(.system(size: 14, weight: .bold, design: .rounded))
                        ForEach(store.state.bots) { bot in
                            let run = runs.first(where: { $0.botId == bot.id && ["queued", "running", "awaiting_approval", "waiting_for_teammate"].contains($0.status) })
                            HStack(spacing: 11) {
                                DesktopMascotView(bot: bot, size: 41)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(bot.name).font(.system(size: 12.5, weight: .bold, design: .rounded))
                                    Text(run?.partialText ?? run?.approvalReason ?? (run == nil ? "Ready for a new task" : "Working through the next step"))
                                        .font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(2)
                                }
                                Spacer()
                                Text(run?.status.desktopLiveStatus ?? bot.status.capitalized)
                                    .font(.system(size: 9.5, weight: .semibold, design: .rounded))
                                    .padding(.horizontal, 8).padding(.vertical, 4)
                                    .background(DesktopTheme.purple.opacity(0.08), in: Capsule())
                                if bot.browserEnabled == true {
                                    Button("Control browser") { browserBot = bot }
                                        .buttonStyle(.bordered).controlSize(.small)
                                }
                            }
                            .padding(11).background(.white.opacity(0.72), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                    }
                }
                .padding(20)
            }
        }
        .frame(width: 720, height: 640)
        .background(DesktopTheme.paper)
        .confirmationDialog("Turn off background protection?", isPresented: $confirmingProtectionRemoval, titleVisibility: .visible) {
            Button("Turn off", role: .destructive) { Task { await store.setBackgroundProtection(false) } }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("Saved work stays in place, but this Mac will not automatically restart OpenBot after it stops.")
        }
        .sheet(item: $browserBot) { bot in DesktopBrowserControlView(store: store, bot: bot) }
    }

    private func liveStat(_ value: Int, _ label: String, _ icon: String) -> some View {
        HStack(spacing: 9) {
            Image(systemName: icon).foregroundStyle(DesktopTheme.purple)
            VStack(alignment: .leading, spacing: 1) {
                Text("\(value)").font(.system(size: 17, weight: .bold, design: .rounded))
                Text(label).font(.system(size: 10, design: .rounded)).foregroundStyle(.secondary)
            }
        }
        .padding(11).frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.80), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(.black.opacity(0.05)))
    }
}

private extension String {
    var desktopLiveStatus: String {
        switch self {
        case "awaiting_approval": return "Needs approval"
        case "waiting_for_teammate": return "Consulting"
        case "running": return "Working"
        case "queued": return "Queued"
        default: return replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
}
