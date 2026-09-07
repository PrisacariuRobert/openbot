import AppKit
import SwiftUI

struct DesktopStudioView: View {
    @EnvironmentObject private var session: DesktopConnectionSession
    @StateObject private var store: StudioStore
    @State private var columnVisibility: NavigationSplitViewVisibility = .all
    @State private var showingWork = false
    @State private var showingLive = false
    @State private var showingAutomations = false
    @State private var showingProviders = false
    @State private var showingCodeProjects = false
    @State private var showingPermissions = false
    @State private var showingConnectors = false
    @State private var showingSkills = false
    @State private var showingTeach = false
    @State private var showingTeammates = false
    @State private var showingFiles = false
    @State private var showingSearch = false
    @State private var showingInspector = false
    @State private var inspectorNext: (() -> Void)?
    @State private var showingSettings = false

    init(serverURL: URL, accessKey: String?) {
        _store = StateObject(wrappedValue: StudioStore(serverURL: serverURL, accessKey: accessKey))
    }

    var body: some View {
        managementSheets
    }

    private var studioSurface: some View {
        GeometryReader { geometry in
            HStack(spacing: 0) {
                NavigationSplitView(columnVisibility: $columnVisibility) {
                    DesktopSidebar(store: store)
                        .navigationSplitViewColumnWidth(min: 220, ideal: 250, max: 300)
                } detail: {
                    DesktopConversationView(store: store)
                        .navigationSplitViewColumnWidth(min: 440, ideal: 650)
                }
                .frame(minWidth: 660, maxWidth: .infinity)
                if showingInspector && geometry.size.width >= 1_200 {
                    Rectangle().fill(StudioPalette.line).frame(width: 1)
                    inspectorContent().frame(width: 310)
                }
            }
            .sheet(isPresented: Binding(get: { showingInspector && geometry.size.width < 1_200 }, set: { showingInspector = $0 }), onDismiss: {
                let next = inspectorNext
                inspectorNext = nil
                next?()
            }) {
                VStack(spacing: 0) {
                    HStack {
                        Text("Conversation details").font(.headline)
                        Spacer()
                        Button("Done") { showingInspector = false }.keyboardShortcut(.cancelAction)
                    }.padding(20)
                    Divider()
                    inspectorContent(compact: true)
                }
                .frame(width: 380, height: min(640, max(480, geometry.size.height - 40)))
                .background(StudioPalette.paper)
            }
        }
        .background(DesktopTheme.paper)
        .task {
            await store.start()
            // The conversation is the app. Choosing an AI connection is a
            // quiet follow-up in the composer, not a boot gate.
        }
        .onDisappear { store.stop() }
        .onChange(of: store.needsAuthentication) { _, expired in
            if expired { session.sessionExpired() }
        }
        .modifier(DesktopNotificationWatchers(showingWork: $showingWork, showingInspector: $showingInspector, showingLive: $showingLive, showingAutomations: $showingAutomations, showingProviders: $showingProviders, showingCodeProjects: $showingCodeProjects, showingPermissions: $showingPermissions, showingConnectors: $showingConnectors, showingSkills: $showingSkills, showingTeach: $showingTeach, showingTeammates: $showingTeammates, showingFiles: $showingFiles, showingSearch: $showingSearch))
        .onChange(of: attentionSignature) { previous, current in
            // Resolving one item must not re-notify about everything left over.
            guard !Set(current.split(separator: ",")).subtracting(Set(previous.split(separator: ","))).isEmpty else { return }
            Task { await DesktopNotifications.postAttention(count: attentionCount) }
        }
    }

    private func inspectorContent(compact: Bool = false) -> some View {
        DesktopInspectorView(store: store, showingWork: $showingWork, showingLive: $showingLive,
            showingAutomations: inspectorDestination($showingAutomations, compact: compact),
            showingProviders: $showingProviders, showingCodeProjects: $showingCodeProjects, showingPermissions: $showingPermissions,
            showingConnectors: $showingConnectors, showingSkills: $showingSkills,
            showingTeammates: inspectorDestination($showingTeammates, compact: compact), showingFiles: $showingFiles)
    }

    private func inspectorDestination(_ destination: Binding<Bool>, compact: Bool) -> Binding<Bool> {
        guard compact else { return destination }
        return Binding(get: { destination.wrappedValue }, set: { value in
            if value {
                // Present the destination after the compact details sheet is
                // dismissed, never two competing sheets or a timed delay.
                inspectorNext = { destination.wrappedValue = true }
                showingInspector = false
            } else { destination.wrappedValue = false }
        })
    }

    private var primarySheets: some View {
        workSheets
            .sheet(isPresented: $showingCodeProjects) {
                DesktopCodeProjectsView(store: store, canChooseLocalFolders: ConnectionAddress.isLoopback(storeServerURL))
            }
            .sheet(isPresented: $showingPermissions) { DesktopPermissionsView(store: store) }
    }

    private var workSheets: some View {
        studioSurface
            .sheet(isPresented: $showingWork) { DesktopWorkView(store: store) }
            .sheet(isPresented: $showingLive) {
                DesktopLiveView(store: store, canManageBackgroundProtection: ConnectionAddress.isLoopback(storeServerURL))
            }
            .sheet(isPresented: $showingAutomations) { DesktopAutomationsView(store: store) }
            .sheet(isPresented: $showingProviders) { DesktopProvidersView(store: store) }
    }

    private var managementSheets: some View {
        managedSheets
            .sheet(isPresented: $showingSettings) { DesktopSettingsCenter(store: store) }
            .onReceive(NotificationCenter.default.publisher(for: .openBotShowSettings)) { _ in showingSettings = true }
            .sheet(isPresented: $showingFiles) { DesktopFilesView(store: store) }
            .sheet(isPresented: $showingSearch) { DesktopSearchView(store: store) }
    }

    private var managedSheets: some View {
        primarySheets
            .sheet(isPresented: $showingConnectors) { DesktopConnectorsView(store: store) }
            .sheet(isPresented: $showingSkills) { DesktopSkillsView(store: store) }
            .sheet(isPresented: $showingTeach) { DesktopTeachView(store: store) }
            .sheet(isPresented: $showingTeammates) { DesktopTeammatesView(store: store) }
    }

    private var storeServerURL: URL {
        session.serverURL ?? URL(string: "http://127.0.0.1:4311")!
    }

    private var attentionCount: Int {
        store.state.attentionItems.count
    }

    private var attentionSignature: String {
        store.state.attentionSignature
    }
}

private struct DesktopSidebar: View {
    @ObservedObject var store: StudioStore
    @State private var query = ""

    private var conversations: [StudioThread] {
        DesktopConversationPresentation.conversations(store.state.threads, bots: store.state.bots, matching: query)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text("OpenBot").font(.system(size: 18, weight: .semibold))
                Spacer()
                Button { NotificationCenter.default.post(name: .openBotShowTeammates, object: nil) } label: {
                    Image(systemName: "square.and.pencil").frame(width: 28, height: 28)
                }.buttonStyle(.plain).help("New conversation").accessibilityLabel("New conversation")
            }.padding(.horizontal, 20).padding(.top, 16).padding(.bottom, 22)
            HStack(spacing: 7) {
                Image(systemName: "magnifyingglass").foregroundStyle(StudioPalette.muted)
                TextField("Search", text: $query).textFieldStyle(.plain)
            }.font(.system(size: 12)).padding(9).studioOutline(radius: 8)
                .padding(.horizontal, 16).padding(.bottom, 16)
            ScrollView {
            LazyVStack(spacing: 3) {
            ForEach(conversations) { thread in
                Button { selection.wrappedValue = thread.id } label: {
                conversationRow(thread)
                    .padding(.horizontal, 10).padding(.vertical, 12)
                    .background(store.selectedThreadID == thread.id ? StudioPalette.surface : .clear, in: RoundedRectangle(cornerRadius: 10))
                    .contentShape(Rectangle())
                }.buttonStyle(.plain)
            }
            if conversations.isEmpty {
                Text(query.isEmpty ? "Your conversations will appear here." : "No matching conversations")
                    .font(.callout).foregroundStyle(.secondary).padding(.vertical, 12)
            }
            }.padding(.horizontal, 10)
            }
            VStack(alignment: .leading, spacing: 20) {
                    if !store.state.attentionItems.isEmpty {
                        Button { NotificationCenter.default.post(name: .openBotShowLive, object: nil) } label: {
                            HStack {
                                Label("Needs you", systemImage: "exclamationmark.bubble")
                                Spacer()
                                Text("\(store.state.attentionItems.count)").monospacedDigit()
                            }.contentShape(Rectangle())
                        }
                        .foregroundStyle(StudioPalette.ink)
                        .accessibilityIdentifier("desktop-needs-attention")
                    }
                    Button { NotificationCenter.default.post(name: .openBotShowTeammates, object: nil) } label: {
                        Label("Your team", systemImage: "person.2")
                    }
                    Button { NotificationCenter.default.post(name: .openBotShowSettings, object: nil) } label: {
                        Label("Settings", systemImage: "gearshape")
                    }
            }
            .buttonStyle(.plain).font(.system(size: 12, weight: .medium))
            .foregroundStyle(StudioPalette.muted).padding(.horizontal, 24).padding(.vertical, 25)
        }
        .background(StudioPalette.paper)
        .toolbar(removing: .sidebarToggle)
    }

    private var selection: Binding<String> {
        Binding(
            get: { store.selectedThreadID },
            set: { id in
                guard id != store.selectedThreadID else { return }
                Task { await store.chooseThread(id) }
            }
        )
    }

    private func conversationRow(_ thread: StudioThread) -> some View {
        let bot = store.state.bots.first { $0.id == thread.botId }
        let members = thread.members(in: store.state.bots)
        let run = store.activeRuns.first { $0.threadId == thread.id }
        let attention = store.state.attentionItems.first { $0.threadID == thread.id }
        return HStack(spacing: 10) {
            Group {
                if let bot {
                    DesktopMascotView(bot: bot, size: 36)
                } else {
                    // A room keeps its members' identities without spilling into the row gutter.
                    DesktopMascotStack(bots: members, size: 22)
                }
            }
            .frame(width: 40, height: 40)
            .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(thread.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                    Spacer(minLength: 8)
                    if let timestamp = thread.lastMessageAt {
                        Text(timestamp.desktopConversationDate)
                            .font(.system(size: 10)).foregroundStyle(.secondary)
                            .layoutPriority(1)
                    }
                }
                if let attention {
                    Label(attention.kind == .automation ? "Routine needs attention" : "Needs your attention", systemImage: "exclamationmark.bubble")
                        .font(.system(size: 12)).foregroundStyle(StudioPalette.ink).lineLimit(1)
                        .help(attention.title)
                } else if let run {
                    let action = store.state.bots.first { $0.id == run.botId }?.currentAction
                    Label(run.status == "awaiting_approval" ? "Needs your approval" : (action ?? "Working…"),
                          systemImage: run.status == "awaiting_approval" ? "hand.raised" : "ellipsis")
                        .font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                        .italic(run.status != "awaiting_approval" && action != nil)
                        .help(action ?? "Working on the current request")
                } else {
                    Text(thread.lastMessage?.replacingOccurrences(of: "\n", with: " ") ?? bot?.role ?? "Your team, together")
                        .font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(store.selectedThreadID == thread.id ? .isSelected : [])
    }
}

private struct DesktopInspectorView: View {
    @ObservedObject var store: StudioStore
    @Binding var showingWork: Bool
    @Binding var showingLive: Bool
    @Binding var showingAutomations: Bool
    @Binding var showingProviders: Bool
    @Binding var showingCodeProjects: Bool
    @Binding var showingPermissions: Bool
    @Binding var showingConnectors: Bool
    @Binding var showingSkills: Bool
    @Binding var showingTeammates: Bool
    @Binding var showingFiles: Bool
    @State private var browserBot: StudioBot?

    private var activeRuns: [StudioRun] { store.activeRuns.filter { $0.threadId == store.selectedThreadID } }
    private var conversationActions: [StudioApprovedAction] {
        let ids = Set((store.state.runs + (store.state.studioRuns ?? [])).filter { $0.threadId == store.selectedThreadID }.map(\.id))
        return (store.state.approvedActions ?? []).filter { ids.contains($0.runId) }
    }
    private var uncertain: [StudioApprovedAction] {
        conversationActions.filter { $0.status == "uncertain" }
    }
    private var conversationRoutines: [StudioRoutine] {
        store.routines.filter { routine in
            store.activeBot.map { routine.botId == $0.id } ?? (routine.threadId == store.selectedThreadID)
        }
    }
    private var computer: StudioComputerStatus? {
        guard let bot = store.activeBot, store.browserComputer?.botId == bot.id else { return nil }
        return store.browserComputer
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 14) {
                    DesktopMascotStack(bots: store.activeThread?.members(in: store.state.bots) ?? [], size: 46)
                        .fixedSize().frame(height: 54, alignment: .leading)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(store.activeThread?.title ?? "The studio")
                            .font(.system(size: 18, weight: .semibold)).fixedSize(horizontal: false, vertical: true)
                        Text(store.activeBot?.role ?? "Shared team room")
                            .font(.system(size: 12)).foregroundStyle(.secondary)
                    }
                }.padding(.bottom, 12)

                if let bot = store.activeBot { computerSection(bot) }

                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Routines").font(.system(size: 12, weight: .semibold))
                        Spacer()
                        Button { showingAutomations = true } label: { Image(systemName: "plus") }
                            .buttonStyle(.plain).help("Manage routines")
                    }
                    if conversationRoutines.isEmpty {
                        Text("Nothing scheduled yet. Ask your teammate to make something a routine.")
                            .font(.system(size: 12)).foregroundStyle(.secondary)
                    }
                    ForEach(conversationRoutines) { routine in
                        Button { showingAutomations = true } label: {
                            HStack(alignment: .top, spacing: 9) {
                                Image(systemName: routine.enabled ? "clock" : "pause.circle").foregroundStyle(.secondary)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(routine.name).font(.system(size: 12, weight: .medium))
                                    Text(routine.enabled ? (routine.scheduleLabel ?? "Waiting for its next trigger") : "Paused")
                                        .font(.system(size: 11)).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                            }.contentShape(Rectangle())
                        }.buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 8)

                Button { showingTeammates = true } label: {
                    HStack {
                        Text(store.activeBot == nil ? "Group & teammates" : "Teammate preferences")
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 10))
                    }.padding(.vertical, 10).contentShape(Rectangle())
                }.buttonStyle(.plain).font(.system(size: 12))
                Divider().overlay(StudioPalette.line)

                if !uncertain.isEmpty {
                    inspectorSection("Check before continuing", icon: "exclamationmark.arrow.triangle.2.circlepath") {
                        ForEach(uncertain) { action in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(action.actionLabel).font(.system(size: 12, weight: .semibold, design: .default))
                                Text("This may have completed during a restart. OpenBot did not repeat it.")
                                    .font(.system(size: 10.5, design: .default)).foregroundStyle(.secondary)
                                HStack {
                                    Button("It happened") { Task { await store.resolveApprovedAction(action, completed: true) } }
                                        .buttonStyle(.borderedProminent).tint(DesktopTheme.green)
                                    Button("It didn’t") { Task { await store.resolveApprovedAction(action, completed: false) } }
                                        .buttonStyle(.bordered)
                                }
                                .controlSize(.small)
                            }
                        }
                    }
                }

                if !activeRuns.isEmpty {
                    inspectorSection("Active work", icon: "bolt.fill") {
                        ForEach(activeRuns) { run in
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(run.botName).font(.system(size: 12, weight: .bold, design: .default))
                                    Spacer()
                                    Text(run.status.desktopRunLabel)
                                        .font(.system(size: 9.5, weight: .semibold, design: .default)).foregroundStyle(DesktopTheme.purple)
                                }
                                Text(run.partialText ?? run.approvalReason ?? "Working through the next step")
                                    .font(.system(size: 10.5, design: .default)).foregroundStyle(.secondary).lineLimit(3)
                            }
                            .padding(10)
                            .background(StudioPalette.surface, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                    }
                }

                let files = store.state.messages.filter { $0.threadId == store.selectedThreadID }.flatMap(\.attachments)
                inspectorSection("Shared here", icon: "doc.text") {
                    if files.isEmpty { Text("Files shared in this conversation will appear here.").font(.system(size: 12)).foregroundStyle(StudioPalette.muted) }
                    ForEach(Array(files.suffix(6).enumerated()), id: \.offset) { _, file in
                        Button { Task { if let url = await store.download(file) { NSWorkspace.shared.open(url) } } } label: {
                            HStack(spacing: 9) {
                                Image(systemName: "doc.text")
                                Text(file.name).lineLimit(2)
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right").font(.system(size: 9))
                            }.font(.system(size: 12)).padding(.vertical, 6).contentShape(Rectangle())
                        }.buttonStyle(.plain)
                    }
                }
                if !conversationActions.isEmpty {
                    inspectorSection("Action history", icon: "checkmark.shield.fill") {
                        ForEach(conversationActions.prefix(6)) { action in
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: action.status.desktopActionIcon)
                                    .foregroundStyle(action.status.desktopActionColor)
                                    .frame(width: 18)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(action.actionLabel).font(.system(size: 11, weight: .semibold, design: .default)).lineLimit(2)
                                    Text(action.status.desktopActionLabel).font(.system(size: 9.5, design: .default)).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                if let error = store.errorMessage {
                    Label(error, systemImage: "exclamationmark.circle.fill")
                        .font(.system(size: 11, weight: .semibold, design: .default))
                        .foregroundStyle(Color.primary)
                }
            }
            .padding(24)
        }
        .background(DesktopTheme.paper)
        .task(id: store.activeBot?.id) {
            if let bot = store.activeBot { await store.refreshBrowser(botID: bot.id) }
        }
        .sheet(item: $browserBot) { bot in DesktopBrowserControlView(store: store, bot: bot) }
    }

    private func computerSection(_ bot: StudioBot) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Text("Computer").font(.system(size: 12, weight: .semibold))
                Spacer()
                Button { Task { await store.refreshBrowser(botID: bot.id, reportErrors: true) } } label: {
                    Image(systemName: "arrow.clockwise")
                }.buttonStyle(.plain).help("Refresh computer snapshot")
            }
            Button { browserBot = bot } label: {
                Group {
                    if let source = computer?.screenshot,
                       let encoded = source.split(separator: ",", maxSplits: 1).last,
                       let data = Data(base64Encoded: String(encoded)), let image = NSImage(data: data) {
                        Image(nsImage: image).resizable().scaledToFit()
                    } else {
                        VStack(spacing: 9) {
                            Image(systemName: "desktopcomputer").font(.system(size: 29, weight: .ultraLight))
                            Text(computer?.browser == "ready" ? "Open browser controls" : "No browser open")
                                .font(.system(size: 12)).foregroundStyle(.secondary)
                        }.frame(maxWidth: .infinity, minHeight: 145)
                    }
                }
                .frame(maxWidth: .infinity)
                .background(StudioPalette.surface)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(StudioPalette.line))
            }.buttonStyle(.plain).help("Open \(bot.name)’s browser controls")
            Text(computer?.screenshot == nil ? "Opening controls does not grant new access." : "Latest snapshot · refresh to see changes")
                .font(.system(size: 10)).foregroundStyle(.secondary)
        }.padding(.vertical, 8)
    }

    private func inspectorStat(_ value: Int, _ label: String, _ icon: String) -> some View {
        HStack(spacing: 7) {
            Image(systemName: icon).foregroundStyle(DesktopTheme.purple)
            VStack(alignment: .leading, spacing: 0) {
                Text("\(value)").font(.system(size: 15, weight: .bold, design: .default))
                Text(label).font(.system(size: 9.5, design: .default)).foregroundStyle(.secondary)
            }
        }
        .padding(9).frame(maxWidth: .infinity, alignment: .leading)
        .background(StudioPalette.surface, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(StudioPalette.line))
    }

    private func inspectorSection<Content: View>(_ title: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: icon).font(.system(size: 12.5, weight: .bold, design: .default))
            content()
        }
        .padding(.vertical, 14).frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .bottom) { Rectangle().fill(StudioPalette.line).frame(height: 1) }
    }
}

private extension String {
    var desktopConversationDate: String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: self) ?? ISO8601DateFormatter().date(from: self) else { return "" }
        let formatter = DateFormatter()
        if Calendar.current.isDateInToday(date) { formatter.timeStyle = .short }
        else if Calendar.current.isDateInYesterday(date) { return "Yesterday" }
        else { formatter.dateFormat = "MMM d" }
        return formatter.string(from: date)
    }
    var desktopRunLabel: String {
        switch self {
        case "awaiting_approval": return "Needs approval"
        case "waiting_for_teammate": return "Consulting"
        case "queued": return "Queued"
        case "running": return "Working"
        default: return replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    var desktopActionIcon: String {
        switch self {
        case "completed", "confirmed_completed": return "checkmark.circle.fill"
        case "prepared", "running": return "clock.fill"
        default: return "exclamationmark.circle.fill"
        }
    }

    var desktopActionColor: Color {
        switch self {
        case "completed", "confirmed_completed": return DesktopTheme.green
        case "prepared", "running": return DesktopTheme.purple
        default: return Color.primary
        }
    }

    var desktopActionLabel: String {
        switch self {
        case "completed", "confirmed_completed": return "Completed once and recorded"
        case "uncertain": return "Waiting for your confirmation"
        case "failed": return "The approved action failed"
        case "confirmed_not_completed": return "Confirmed not completed"
        default: return "Approved and safely queued"
        }
    }
}

/// The notification surface for studio actions, split out of the giant view
/// chain so the type-checker stays fast.
private struct DesktopNotificationWatchers: ViewModifier {
    @Binding var showingWork: Bool
    @Binding var showingInspector: Bool
    @Binding var showingLive: Bool
    @Binding var showingAutomations: Bool
    @Binding var showingProviders: Bool
    @Binding var showingCodeProjects: Bool
    @Binding var showingPermissions: Bool
    @Binding var showingConnectors: Bool
    @Binding var showingSkills: Bool
    @Binding var showingTeach: Bool
    @Binding var showingTeammates: Bool
    @Binding var showingFiles: Bool
    @Binding var showingSearch: Bool

    func body(content: Content) -> some View {
        content
            .onReceive(NotificationCenter.default.publisher(for: .openBotShowWork)) { _ in showingWork = true }
            .onReceive(NotificationCenter.default.publisher(for: .openBotShowInspector)) { _ in showingInspector.toggle() }
            .onReceive(NotificationCenter.default.publisher(for: .openBotShowLive)) { _ in showingLive = true }
            .onReceive(NotificationCenter.default.publisher(for: .openBotShowAutomations)) { _ in showingAutomations = true }
            .onReceive(NotificationCenter.default.publisher(for: .openBotShowProviders)) { _ in showingProviders = true }
            .onReceive(NotificationCenter.default.publisher(for: .openBotShowCodeProjects)) { _ in showingCodeProjects = true }
            .onReceive(NotificationCenter.default.publisher(for: .openBotShowPermissions)) { _ in showingPermissions = true }
            .onReceive(NotificationCenter.default.publisher(for: .openBotShowConnectors)) { _ in showingConnectors = true }
            .onReceive(NotificationCenter.default.publisher(for: .openBotShowSkills)) { _ in showingSkills = true }
            .onReceive(NotificationCenter.default.publisher(for: .openBotShowTeach)) { _ in showingTeach = true }
            .onReceive(NotificationCenter.default.publisher(for: .openBotShowTeammates)) { _ in showingTeammates = true }
            .onReceive(NotificationCenter.default.publisher(for: .openBotShowFiles)) { _ in showingFiles = true }
            .onReceive(NotificationCenter.default.publisher(for: .openBotShowSearch)) { _ in showingSearch = true }
    }
}
