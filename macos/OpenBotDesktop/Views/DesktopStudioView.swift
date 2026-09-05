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

    init(serverURL: URL, accessKey: String?) {
        _store = StateObject(wrappedValue: StudioStore(serverURL: serverURL, accessKey: accessKey))
    }

    var body: some View {
        managementSheets
    }

    private var studioSurface: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            DesktopSidebar(store: store)
                .navigationSplitViewColumnWidth(min: 210, ideal: 235, max: 285)
        } content: {
            DesktopConversationView(store: store)
                .navigationSplitViewColumnWidth(min: 440, ideal: 650)
        } detail: {
            DesktopInspectorView(store: store, showingWork: $showingWork, showingLive: $showingLive, showingAutomations: $showingAutomations, showingProviders: $showingProviders, showingCodeProjects: $showingCodeProjects, showingPermissions: $showingPermissions, showingConnectors: $showingConnectors, showingSkills: $showingSkills, showingTeammates: $showingTeammates, showingFiles: $showingFiles)
                .navigationSplitViewColumnWidth(min: 270, ideal: 310, max: 390)
        }
        .background(DesktopTheme.paper)
        .task { await store.start() }
        .onDisappear { store.stop() }
        .onChange(of: store.needsAuthentication) { _, expired in
            if expired { session.sessionExpired() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .openBotShowWork)) { _ in showingWork = true }
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
        .onChange(of: attentionSignature) { _, _ in
            Task { await DesktopNotifications.postAttention(count: attentionCount) }
        }
    }

    private var primarySheets: some View {
        studioSurface
        .sheet(isPresented: $showingWork) { DesktopWorkView(store: store) }
        .sheet(isPresented: $showingLive) {
            DesktopLiveView(store: store, canManageBackgroundProtection: ConnectionAddress.isLoopback(storeServerURL))
        }
        .sheet(isPresented: $showingAutomations) { DesktopAutomationsView(store: store) }
        .sheet(isPresented: $showingProviders) { DesktopProvidersView(store: store) }
        .sheet(isPresented: $showingCodeProjects) {
            DesktopCodeProjectsView(store: store, canChooseLocalFolders: ConnectionAddress.isLoopback(storeServerURL))
        }
        .sheet(isPresented: $showingPermissions) { DesktopPermissionsView(store: store) }
    }

    private var managementSheets: some View {
        primarySheets
        .sheet(isPresented: $showingConnectors) { DesktopConnectorsView(store: store) }
        .sheet(isPresented: $showingSkills) { DesktopSkillsView(store: store) }
        .sheet(isPresented: $showingTeach) { DesktopTeachView(store: store) }
        .sheet(isPresented: $showingTeammates) { DesktopTeammatesView(store: store) }
        .sheet(isPresented: $showingFiles) { DesktopFilesView(store: store) }
        .sheet(isPresented: $showingSearch) { DesktopSearchView(store: store) }
    }

    private var storeServerURL: URL {
        session.serverURL ?? URL(string: "http://127.0.0.1:4311")!
    }

    private var attentionCount: Int {
        store.state.approvals.count + (store.state.approvedActions ?? []).filter { $0.status == "uncertain" }.count
    }

    private var attentionSignature: String {
        let approvals = store.state.approvals.map(\.id)
        let uncertain = (store.state.approvedActions ?? []).filter { $0.status == "uncertain" }.map(\.id)
        return (approvals + uncertain).sorted().joined(separator: ",")
    }
}

private struct DesktopSidebar: View {
    @ObservedObject var store: StudioStore

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 9, style: .continuous).fill(DesktopTheme.purple)
                    Image(systemName: "sparkles").foregroundStyle(.white).font(.system(size: 14, weight: .bold))
                }
                .frame(width: 31, height: 31)
                VStack(alignment: .leading, spacing: 0) {
                    Text("OpenBot").font(.system(size: 16, weight: .bold, design: .rounded))
                    Text("local-first studio").font(.system(size: 9.5, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(.horizontal, 14).padding(.vertical, 13)

            List {
                Section("Together") {
                    ForEach(store.state.threads.filter { $0.kind == "room" }) { thread in
                        sidebarRow(thread)
                    }
                }
                Section("Teammates") {
                    ForEach(store.state.threads.filter { $0.kind == "direct" }) { thread in
                        sidebarRow(thread)
                    }
                }
            }
            .listStyle(.sidebar)

            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 7) {
                    Circle().fill(store.isLive ? DesktopTheme.green : .orange).frame(width: 7, height: 7)
                    Text(store.isLive ? "Studio connected" : "Reconnecting…")
                        .font(.system(size: 11.5, weight: .semibold, design: .rounded))
                }
                Text(store.state.runner?.deployment?.mode == "private_runner" ? "Private always-on home" : "Runner on this Mac")
                    .font(.system(size: 10.5, weight: .medium, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(13)
            .background(.thinMaterial)
        }
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private func sidebarRow(_ thread: StudioThread) -> some View {
        let bots: [StudioBot] = thread.kind == "room"
            ? store.state.bots
            : thread.botId.flatMap { id in store.state.bots.first(where: { $0.id == id }).map { [$0] } } ?? []
        return Button {
            Task { await store.chooseThread(thread.id) }
        } label: {
            HStack(spacing: 10) {
                DesktopMascotStack(bots: bots, size: 34).frame(width: thread.kind == "room" ? 68 : 36, height: 38)
                VStack(alignment: .leading, spacing: 2) {
                    Text(thread.title).font(.system(size: 13, weight: .semibold, design: .rounded)).lineLimit(1)
                    Text(thread.kind == "room" ? "Everyone together" : bots.first?.role ?? "Teammate")
                        .font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.vertical, 3)
        .listRowBackground(store.selectedThreadID == thread.id ? DesktopTheme.purple.opacity(0.09) : Color.clear)
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

    private var activeRuns: [StudioRun] { store.activeRuns }
    private var uncertain: [StudioApprovedAction] {
        (store.state.approvedActions ?? []).filter { $0.status == "uncertain" }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 11) {
                    DesktopMascotStack(bots: store.activeBot.map { [$0] } ?? store.state.bots, size: 46)
                        .frame(width: 95, height: 54, alignment: .leading)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(store.activeThread?.title ?? "The studio")
                            .font(.system(size: 16, weight: .bold, design: .rounded)).lineLimit(1)
                        Text(store.activeBot?.role ?? "Shared team room")
                            .font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                    }
                }

                HStack(spacing: 8) {
                    inspectorStat(store.state.usage.activeRuns, "working", "sparkles")
                    inspectorStat(store.state.approvals.count + uncertain.count, "attention", "hand.raised.fill")
                }

                HStack(spacing: 8) {
                    Button { showingWork = true } label: { Label("Start work", systemImage: "sparkles") }
                        .buttonStyle(.borderedProminent).tint(DesktopTheme.purple)
                    Button { showingLive = true } label: { Label("Live", systemImage: "rectangle.3.group") }
                        .buttonStyle(.bordered)
                }
                .controlSize(.regular)

                Button { showingAutomations = true } label: {
                    HStack {
                        Label("Automations", systemImage: "clock.arrow.trianglehead.counterclockwise.rotate.90")
                        Spacer()
                        Text("\(store.routines.filter(\.enabled).count) on")
                            .font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.bordered).controlSize(.regular)

                Button { showingProviders = true } label: {
                    HStack {
                        Label("AI connections", systemImage: "cpu")
                        Spacer()
                        Text(store.providerStatus.map { "\($0.instances.count) ready" } ?? "Manage")
                            .font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.bordered).controlSize(.regular)

                Button { showingCodeProjects = true } label: {
                    HStack {
                        Label("Code projects", systemImage: "chevron.left.forwardslash.chevron.right")
                        Spacer()
                        Text(store.codeProjectsStatus.map { "\($0.projects.count) connected" } ?? "Manage")
                            .font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.bordered).controlSize(.regular)

                Button { showingPermissions = true } label: {
                    HStack {
                        Label("Access & capabilities", systemImage: "checkmark.shield")
                        Spacer()
                        Text(store.state.settings?.macAccessEnabled == true ? "Mac on" : "Review")
                            .font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.bordered).controlSize(.regular)

                Button { showingConnectors = true } label: {
                    HStack {
                        Label("Apps & tools", systemImage: "puzzlepiece.extension")
                        Spacer()
                        Text(store.connectorStatus.map { "\($0.catalog.filter(\.connected).count) ready" } ?? "Manage")
                            .font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.bordered).controlSize(.regular)

                Button { showingSkills = true } label: {
                    HStack {
                        Label("Skill Library", systemImage: "wand.and.stars")
                        Spacer()
                        Text(store.skills.isEmpty ? "Manage" : "\(store.skills.count) saved")
                            .font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.bordered).controlSize(.regular)

                Button { showingTeammates = true } label: {
                    HStack {
                        Label("Teammates", systemImage: "person.3.fill")
                        Spacer()
                        Text("\(store.state.bots.count) configured")
                            .font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.bordered).controlSize(.regular)

                Button { showingFiles = true } label: {
                    HStack {
                        Label("Workspace files", systemImage: "folder.fill")
                        Spacer()
                        Text("Review")
                            .font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.bordered).controlSize(.regular)

                if !uncertain.isEmpty {
                    inspectorSection("Check before continuing", icon: "exclamationmark.arrow.triangle.2.circlepath") {
                        ForEach(uncertain) { action in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(action.actionLabel).font(.system(size: 12, weight: .semibold, design: .rounded))
                                Text("This may have completed during a restart. OpenBot did not repeat it.")
                                    .font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary)
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
                                    Text(run.botName).font(.system(size: 12, weight: .bold, design: .rounded))
                                    Spacer()
                                    Text(run.status.desktopRunLabel)
                                        .font(.system(size: 9.5, weight: .semibold, design: .rounded)).foregroundStyle(DesktopTheme.purple)
                                }
                                Text(run.partialText ?? run.approvalReason ?? "Working through the next step")
                                    .font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(3)
                            }
                            .padding(10)
                            .background(.white.opacity(0.64), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                    }
                }

                if let actions = store.state.approvedActions, !actions.isEmpty {
                    inspectorSection("Action history", icon: "checkmark.shield.fill") {
                        ForEach(actions.prefix(6)) { action in
                            HStack(alignment: .top, spacing: 8) {
                                Image(systemName: action.status.desktopActionIcon)
                                    .foregroundStyle(action.status.desktopActionColor)
                                    .frame(width: 18)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(action.actionLabel).font(.system(size: 11, weight: .semibold, design: .rounded)).lineLimit(2)
                                    Text(action.status.desktopActionLabel).font(.system(size: 9.5, design: .rounded)).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                if let error = store.errorMessage {
                    Label(error, systemImage: "exclamationmark.circle.fill")
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                        .foregroundStyle(.orange)
                }
            }
            .padding(16)
        }
        .background(DesktopTheme.paper)
    }

    private func inspectorStat(_ value: Int, _ label: String, _ icon: String) -> some View {
        HStack(spacing: 7) {
            Image(systemName: icon).foregroundStyle(DesktopTheme.purple)
            VStack(alignment: .leading, spacing: 0) {
                Text("\(value)").font(.system(size: 15, weight: .bold, design: .rounded))
                Text(label).font(.system(size: 9.5, design: .rounded)).foregroundStyle(.secondary)
            }
        }
        .padding(9).frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.75), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(.black.opacity(0.055)))
    }

    private func inspectorSection<Content: View>(_ title: String, icon: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: icon).font(.system(size: 12.5, weight: .bold, design: .rounded))
            content()
        }
        .padding(12).frame(maxWidth: .infinity, alignment: .leading)
        .background(.white.opacity(0.72), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(.black.opacity(0.055)))
    }
}

private extension String {
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
        default: return .orange
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
