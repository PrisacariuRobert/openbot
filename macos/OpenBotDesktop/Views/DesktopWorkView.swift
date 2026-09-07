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
                            .font(.system(size: 12, weight: .semibold, design: .default)).foregroundStyle(Color.primary)
                    }
                    ForEach(StudioStarter.all) { starter in
                        workCard(starter)
                    }
                    WorkSourcesView(store: store)
                    RecipeLibraryView(store: store, onStarted: { dismiss() })
                    WorkFollowupsView(store: store)
                    Text("Every starter saves a report, keeps source coverage visible, and leaves outgoing changes for approval.")
                        .font(.system(size: 11, weight: .medium, design: .default)).foregroundStyle(.secondary)
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
            ? store.connectorStatus?.sourceLabel(for: starter) ?? "Checking sources"
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
                    Text(starter.title).font(.system(size: 15, weight: .bold, design: .default)).foregroundStyle(DesktopTheme.ink)
                    Text(starter.summary).font(.system(size: 12.5, weight: .medium, design: .default)).foregroundStyle(.secondary)
                    Text(starter.detail).font(.system(size: 11, design: .default)).foregroundStyle(.secondary).lineLimit(2)
                    Label(status, systemImage: ready ? "checkmark.circle.fill" : "link.badge.plus")
                        .font(.system(size: 10.5, weight: .semibold, design: .default))
                        .foregroundStyle(ready ? DesktopTheme.green : Color.primary)
                }
                Spacer(minLength: 8)
                if startingID == starter.id { ProgressView().controlSize(.small) }
                else { Image(systemName: "arrow.up.right").foregroundStyle(.secondary) }
            }
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(StudioPalette.surface.opacity(ready ? 1 : 0.7), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(ready ? DesktopTheme.purple.opacity(0.14) : .black.opacity(0.06)))
        }
        .buttonStyle(.plain)
        .disabled(!canAct || startingID != nil)
    }

    private func missingServices(for starter: StudioStarter) -> [String] {
        guard let status = store.connectorStatus else { return starter.requiredServices }
        return status.missingSources(for: starter)
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
                Text(title).font(.system(size: 17, weight: .bold, design: .default))
                Text(subtitle).font(.system(size: 11, weight: .medium, design: .default)).foregroundStyle(.secondary)
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
    @State private var showingRoutines = false
    @State private var showingTeam = false
    @State private var showingBackground = false

    private var runs: [StudioRun] { store.state.allRuns }
    private var uncertain: [StudioApprovedAction] { (store.state.approvedActions ?? []).filter { $0.status == "uncertain" } }
    private var working: [StudioRun] { runs.filter { ["queued", "running", "awaiting_approval", "waiting_for_teammate"].contains($0.status) } }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 7) {
                    Text("Activity").font(.system(size: 22, weight: .semibold))
                    Text(store.isLive ? "What needs you. What’s moving forward." : "Reconnecting to your studio…")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                }
                Spacer()
                Button("Done") { dismiss() }.buttonStyle(DesktopActionButtonStyle()).keyboardShortcut(.cancelAction)
            }.padding(28)

            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    if !store.state.attentionItems.isEmpty || !uncertain.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            sectionHeading("Needs you", count: store.state.attentionItems.count)
                            ForEach(uncertain) { action in
                                VStack(alignment: .leading, spacing: 10) {
                                    Text(action.actionLabel).font(.system(size: 14, weight: .medium))
                                    Text("This may have completed before the connection stopped. Check the result before continuing; OpenBot has not repeated it.")
                                        .font(.system(size: 12)).foregroundStyle(.secondary)
                                    HStack(spacing: 10) {
                                        Button("It happened") { Task { await store.resolveApprovedAction(action, completed: true) } }
                                            .buttonStyle(DesktopActionButtonStyle())
                                        Button("It didn’t") { Task { await store.resolveApprovedAction(action, completed: false) } }
                                            .buttonStyle(DesktopActionButtonStyle())
                                    }
                                }.padding(.vertical, 18)
                                Divider()
                            }
                            ForEach(store.state.attentionItems.filter { $0.kind != .uncertainAction }) { item in
                                HStack(alignment: .top, spacing: 14) {
                                    Image(systemName: item.kind == .automation ? "calendar" : "exclamationmark.bubble")
                                        .font(.system(size: 17)).frame(width: 22).padding(.top, 2)
                                    VStack(alignment: .leading, spacing: 7) {
                                        Text(item.title).font(.system(size: 14, weight: .medium))
                                        Text(item.detail).font(.system(size: 12)).foregroundStyle(.secondary)
                                            .fixedSize(horizontal: false, vertical: true)
                                        if item.kind == .automation {
                                            Button("Review routine") { showingRoutines = true }.buttonStyle(.plain).underline()
                                        } else if let threadID = item.threadID, store.state.threads.contains(where: { $0.id == threadID }) {
                                            Button("Open conversation") { Task { await store.chooseThread(threadID); dismiss() } }
                                                .buttonStyle(.plain).underline()
                                        } else {
                                            Text("Conversation unavailable").foregroundStyle(.secondary)
                                        }
                                    }.font(.system(size: 12)).frame(maxWidth: .infinity, alignment: .leading)
                                }.padding(.vertical, 18)
                                Divider()
                            }
                        }.accessibilityIdentifier("desktop-attention-items")
                    }
                    if !working.isEmpty {
                        VStack(alignment: .leading, spacing: 0) {
                            sectionHeading("In progress", count: working.count)
                            ForEach(working) { run in
                                HStack(spacing: 12) {
                                    if let bot = store.state.bots.first(where: { $0.id == run.botId }) {
                                        DesktopMascotView(bot: bot, size: 34).frame(width: 40)
                                    }
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(run.botName).font(.system(size: 14, weight: .medium))
                                        Text(run.partialText ?? run.approvalReason ?? run.status.desktopLiveStatus)
                                            .font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(2)
                                    }.frame(maxWidth: .infinity, alignment: .leading)
                                    Button("Open") { Task { await store.chooseThread(run.threadId); dismiss() } }
                                        .buttonStyle(DesktopActionButtonStyle())
                                }.padding(.vertical, 18)
                                Divider()
                            }
                        }
                    }
                    if store.state.attentionItems.isEmpty && uncertain.isEmpty && working.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Image(systemName: "checkmark").font(.system(size: 24, weight: .light)).padding(.bottom, 8)
                            Text("You’re all caught up.").font(.system(size: 22, weight: .semibold))
                            Text("New requests and work in progress will appear here.").font(.system(size: 13)).foregroundStyle(.secondary)
                        }.padding(.vertical, 28)
                    }
                    DisclosureGroup("Your team", isExpanded: $showingTeam) {
                        VStack(spacing: 0) {
                            ForEach(store.state.bots) { bot in
                                HStack(spacing: 12) {
                                    DesktopMascotView(bot: bot, size: 34).frame(width: 40)
                                    Text(bot.name).font(.system(size: 13, weight: .medium))
                                    Spacer()
                                    Text(working.first(where: { $0.botId == bot.id })?.status.desktopLiveStatus ?? "Available")
                                        .font(.system(size: 12)).foregroundStyle(.secondary)
                                    if bot.browserEnabled == true {
                                        Button("Control browser") { browserBot = bot }.buttonStyle(DesktopActionButtonStyle())
                                    }
                                }.padding(.vertical, 14)
                                Divider()
                            }
                        }.padding(.top, 8)
                    }.font(.system(size: 13, weight: .medium))

                    if store.state.runner?.deployment?.mode != "private_runner" {
                        DisclosureGroup("Run in the background", isExpanded: $showingBackground) {
                            VStack(alignment: .leading, spacing: 12) {
                                Text(store.state.runner?.backgroundServiceDetail ?? "Start OpenBot at login and restart it after an unexpected stop.")
                                    .font(.system(size: 12)).foregroundStyle(.secondary)
                                if canManageBackgroundProtection {
                                    if store.state.runner?.backgroundService == "installed" {
                                        Button("Turn off background protection") { confirmingProtectionRemoval = true }
                                            .buttonStyle(DesktopActionButtonStyle())
                                    } else {
                                        Button("Protect this Mac") { Task { await store.setBackgroundProtection(true) } }
                                            .buttonStyle(DesktopActionButtonStyle())
                                    }
                                } else {
                                    Text("Change this on the Mac running OpenBot.").font(.system(size: 12)).foregroundStyle(.secondary)
                                }
                            }.padding(.top, 12)
                        }.font(.system(size: 13, weight: .medium))
                    }
                    if let error = store.errorMessage {
                        Text(error).font(.callout).foregroundStyle(.secondary).textSelection(.enabled)
                    }
                }.padding(.horizontal, 28).padding(.bottom, 28)
            }
        }
        .frame(width: 620, height: 580).background(StudioPalette.paper)
        .confirmationDialog("Turn off background protection?", isPresented: $confirmingProtectionRemoval, titleVisibility: .visible) {
            Button("Turn off", role: .destructive) { Task { await store.setBackgroundProtection(false) } }
            Button("Cancel", role: .cancel) { }
        } message: {
            Text("Saved work stays in place, but this Mac will not automatically restart OpenBot after it stops.")
        }
        .sheet(item: $browserBot) { bot in DesktopBrowserControlView(store: store, bot: bot) }
        .sheet(isPresented: $showingRoutines) { DesktopAutomationsView(store: store) }
    }

    private func sectionHeading(_ title: String, count: Int) -> some View {
        HStack {
            Text(title).font(.system(size: 13, weight: .semibold))
            Spacer()
            Text("\(count)").font(.system(size: 12)).foregroundStyle(.secondary)
        }.padding(.bottom, 4)
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
