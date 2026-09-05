import AppKit
import SwiftUI

enum StudioProjectAccessLevel: String, CaseIterable, Identifiable {
    case none = "No access"
    case read = "Read only"
    case code = "Can code"
    var id: String { rawValue }

    func grant(botID: String) -> StudioCodeProjectAccess {
        StudioCodeProjectAccess(botId: botID, canRead: self != .none, canWrite: self == .code, canRun: self == .code)
    }

    static func from(_ grant: StudioCodeProjectAccess?) -> Self {
        guard grant?.canRead == true else { return .none }
        return grant?.canWrite == true && grant?.canRun == true ? .code : .read
    }
}

struct DesktopCodeProjectsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    let canChooseLocalFolders: Bool
    @State private var showingCreate = false
    @State private var pendingDisconnect: StudioCodeProject?
    @State private var showingReview = false
    @State private var pendingRestore: StudioCodeProjectEdit?

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "chevron.left.forwardslash.chevron.right").font(.system(size: 17, weight: .semibold)).foregroundStyle(DesktopTheme.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Code projects").font(.system(size: 17, weight: .bold, design: .rounded))
                    Text("Choose exactly where teammates may read, edit, and run checks.")
                        .font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                }
                Spacer()
                Button { showingCreate = true } label: { Label("Connect", systemImage: "plus") }
                    .buttonStyle(.borderedProminent).tint(DesktopTheme.purple).controlSize(.small)
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
                    if store.codeProjectsStatus == nil && store.isCheckingCodeProjects {
                        ProgressView("Checking connected projects…").frame(maxWidth: .infinity).padding(.vertical, 90)
                    } else if let projects = store.codeProjectsStatus?.projects, projects.isEmpty {
                        emptyState
                    } else {
                        ForEach(store.codeProjectsStatus?.projects ?? []) { project in projectCard(project) }
                    }
                    Text("OpenBot creates a separate Git worktree and branch for each coding task. Disconnecting access never deletes your project files.")
                        .font(.system(size: 10.5, weight: .medium, design: .rounded)).foregroundStyle(.secondary).padding(.top, 3)
                }
                .padding(20)
            }
        }
        .frame(width: 800, height: 680).background(DesktopTheme.paper)
        .task { await store.refreshCodeProjects() }
        .sheet(isPresented: $showingCreate) {
            DesktopCodeProjectCreateView(store: store, canChooseLocalFolders: canChooseLocalFolders)
        }
        .confirmationDialog(
            "Disconnect this project?",
            isPresented: Binding(get: { pendingDisconnect != nil }, set: { if !$0 { pendingDisconnect = nil } }),
            titleVisibility: .visible
        ) {
            if let project = pendingDisconnect {
                Button("Disconnect \(project.name)", role: .destructive) {
                    pendingDisconnect = nil
                    Task { _ = await store.disconnectCodeProject(project.id) }
                }
            }
            Button("Cancel", role: .cancel) { pendingDisconnect = nil }
        } message: {
            Text("OpenBot access will be removed. Your project folder and files stay untouched.")
        }
        .confirmationDialog(
            "Restore this file?",
            isPresented: Binding(get: { pendingRestore != nil }, set: { if !$0 { pendingRestore = nil } }),
            titleVisibility: .visible
        ) {
            if let edit = pendingRestore {
                Button("Restore \(edit.path)") {
                    pendingRestore = nil
                    Task { _ = await store.restoreCodeProjectEdit(edit.id) }
                }
            }
            Button("Cancel", role: .cancel) { pendingRestore = nil }
        } message: {
            Text("OpenBot restores only its recorded change and refuses if newer user work would be overwritten.")
        }
        .sheet(isPresented: $showingReview) {
            if let review = store.codeProjectReview { DesktopCodeReviewView(review: review) }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 11) {
            Image(systemName: "folder.badge.plus").font(.system(size: 30)).foregroundStyle(DesktopTheme.purple)
            Text("No code project is connected").font(.system(size: 16, weight: .bold, design: .rounded))
            Text("Connect a folder on the runner Mac, or clone a GitHub repository into OpenBot's managed project area.")
                .font(.system(size: 11.5, design: .rounded)).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 390)
            Button("Connect a project") { showingCreate = true }.buttonStyle(.borderedProminent).tint(DesktopTheme.purple)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 80)
    }

    private func projectCard(_ project: StudioCodeProject) -> some View {
        VStack(alignment: .leading, spacing: 13) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous).fill(DesktopTheme.purple.opacity(0.09))
                    Image(systemName: project.gitRepository ? "point.3.connected.trianglepath.dotted" : "folder.fill")
                        .font(.system(size: 17, weight: .semibold)).foregroundStyle(DesktopTheme.purple)
                }.frame(width: 43, height: 43)
                VStack(alignment: .leading, spacing: 3) {
                    Text(project.name).font(.system(size: 14.5, weight: .bold, design: .rounded))
                    Text(project.managedClone ? "OpenBot-managed clone" : project.gitRepository ? "Git repository" : "Local folder")
                        .font(.system(size: 10.5, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                    Text(project.rootPath).font(.system(size: 9.5, design: .monospaced)).foregroundStyle(.tertiary).lineLimit(1)
                }
                Spacer()
                if project.gitRepository {
                    Button {
                        Task { if await store.reviewCodeProject(project.id) { showingReview = true } }
                    } label: { Image(systemName: "doc.text.magnifyingglass") }
                    .buttonStyle(.bordered).controlSize(.small).help("Review current changes")
                }
                Button(role: .destructive) { pendingDisconnect = project } label: { Image(systemName: "trash") }
                    .buttonStyle(.bordered).controlSize(.small)
            }
            Divider().opacity(0.45)
            let workspaces = (store.codeProjectsStatus?.workspaces ?? []).filter { $0.projectId == project.id && $0.status != "archived" }
            if !workspaces.isEmpty {
                VStack(alignment: .leading, spacing: 7) {
                    Text("Agent workspaces").font(.system(size: 10.5, weight: .bold, design: .rounded)).foregroundStyle(.secondary)
                    ForEach(workspaces) { workspace in
                        Button {
                            Task { if await store.reviewCodeProject(project.id, runID: workspace.runId) { showingReview = true } }
                        } label: {
                            HStack {
                                Image(systemName: "arrow.triangle.branch")
                                Text(workspace.botName).fontWeight(.semibold)
                                Text(workspace.branch).foregroundStyle(.secondary).lineLimit(1)
                                Spacer()
                                Text(workspace.status.capitalized).foregroundStyle(.secondary)
                                Image(systemName: "chevron.right")
                            }
                            .font(.system(size: 10.5, design: .rounded))
                        }
                        .buttonStyle(.plain).padding(9).background(.black.opacity(0.025), in: RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
            ForEach(store.state.bots) { bot in
                HStack(spacing: 10) {
                    DesktopMascotView(bot: bot, size: 29).frame(width: 32, height: 32)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(bot.name).font(.system(size: 12, weight: .semibold, design: .rounded))
                        Text(bot.role).font(.system(size: 9.5, design: .rounded)).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Picker("Access for \(bot.name)", selection: Binding(
                        get: { StudioProjectAccessLevel.from(project.access.first(where: { $0.botId == bot.id })) },
                        set: { level in Task { await store.setCodeProjectAccess(projectID: project.id, botID: bot.id, access: level.grant(botID: bot.id)) } }
                    )) {
                        ForEach(StudioProjectAccessLevel.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .labelsHidden().frame(width: 135).disabled(store.isCheckingCodeProjects)
                }
            }
            let edits = (store.codeProjectsStatus?.edits ?? []).filter { $0.projectId == project.id && $0.reversible && $0.restoredAt == nil }.prefix(3)
            if !edits.isEmpty {
                Divider().opacity(0.45)
                VStack(alignment: .leading, spacing: 7) {
                    Text("Recoverable changes").font(.system(size: 10.5, weight: .bold, design: .rounded)).foregroundStyle(.secondary)
                    ForEach(Array(edits)) { edit in
                        HStack {
                            Text(edit.path).font(.system(size: 10.5, design: .monospaced)).lineLimit(1)
                            Spacer()
                            Text("+\(edit.additions) −\(edit.deletions)").font(.system(size: 9.5, design: .monospaced)).foregroundStyle(.secondary)
                            Button("Restore") { pendingRestore = edit }.buttonStyle(.bordered).controlSize(.mini)
                        }
                    }
                }
            }
        }
        .padding(15).background(.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(.black.opacity(0.055)))
    }
}

private struct DesktopCodeReviewView: View {
    @Environment(\.dismiss) private var dismiss
    let review: StudioCodeProjectReview

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "doc.text.magnifyingglass").foregroundStyle(DesktopTheme.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text(review.workspace.map { "\($0.botName)'s changes" } ?? "Project changes")
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                    Text(review.branch ?? review.defaultBranch ?? "Working tree")
                        .font(.system(size: 10.5, design: .monospaced)).foregroundStyle(.secondary)
                }
                Spacer()
                Text(review.changes.isEmpty ? "Clean" : "\(review.changes.count) changes")
                    .font(.system(size: 10.5, weight: .bold, design: .rounded)).foregroundStyle(review.changes.isEmpty ? DesktopTheme.green : .orange)
                Button("Done") { dismiss() }.buttonStyle(.bordered).controlSize(.small)
            }
            .padding(16).background(.ultraThinMaterial)
            Divider().opacity(0.55)
            if review.changes.isEmpty {
                VStack(spacing: 10) {
                    Image(systemName: "checkmark.circle.fill").font(.system(size: 30)).foregroundStyle(DesktopTheme.green)
                    Text("No tracked changes are waiting").font(.system(size: 15, weight: .bold, design: .rounded))
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                HSplitView {
                    List(review.changes, id: \.self) { change in Text(change).font(.system(size: 10.5, design: .monospaced)) }
                        .frame(minWidth: 220, idealWidth: 260)
                    ScrollView([.horizontal, .vertical]) {
                        Text(review.diff.isEmpty ? "No textual diff is available for these changes." : review.diff)
                            .font(.system(size: 11, design: .monospaced)).textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .topLeading).padding(14)
                    }
                    .background(Color(nsColor: .textBackgroundColor))
                }
            }
            if review.truncated {
                Text("The displayed diff was shortened. Review the project locally before publishing.")
                    .font(.system(size: 10.5, weight: .medium, design: .rounded)).foregroundStyle(.orange).padding(10)
            }
        }
        .frame(width: 880, height: 650).background(DesktopTheme.paper)
    }
}

private struct DesktopCodeProjectCreateView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    let canChooseLocalFolders: Bool
    @State private var mode = ProjectSource.local
    @State private var name = ""
    @State private var rootPath = ""
    @State private var repository = ""
    @State private var levels: [String: StudioProjectAccessLevel] = [:]

    private enum ProjectSource: String, CaseIterable, Identifiable {
        case local = "Folder on this Mac"
        case github = "GitHub repository"
        var id: String { rawValue }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Connect a code project").font(.system(size: 20, weight: .bold, design: .rounded))
            Picker("Source", selection: $mode) {
                Text(ProjectSource.local.rawValue).tag(ProjectSource.local)
                Text(ProjectSource.github.rawValue).tag(ProjectSource.github)
            }.pickerStyle(.segmented)

            if mode == .local {
                if canChooseLocalFolders {
                    HStack {
                        TextField("Project folder", text: $rootPath).textFieldStyle(.roundedBorder).disabled(true)
                        Button("Choose…") { chooseFolder() }.buttonStyle(.bordered)
                    }
                    TextField("Project name", text: $name).textFieldStyle(.roundedBorder)
                } else {
                    Label("This app is connected to a remote OpenBot home. Choose a folder on that host from its local app, or clone a GitHub repository here.", systemImage: "network")
                        .font(.system(size: 11.5, design: .rounded)).foregroundStyle(.secondary)
                }
            } else {
                TextField("https://github.com/owner/repository", text: $repository).textFieldStyle(.roundedBorder)
                Text("OpenBot clones this into its managed project area on the runner host.")
                    .font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary)
            }

            Text("Teammate access").font(.system(size: 12, weight: .bold, design: .rounded))
            ForEach(store.state.bots) { bot in
                HStack {
                    DesktopMascotView(bot: bot, size: 28).frame(width: 31, height: 31)
                    Text(bot.name).font(.system(size: 12, weight: .semibold, design: .rounded))
                    Spacer()
                    Picker("Access for \(bot.name)", selection: Binding(
                        get: { levels[bot.id] ?? .code },
                        set: { levels[bot.id] = $0 }
                    )) {
                        ForEach(StudioProjectAccessLevel.allCases) { Text($0.rawValue).tag($0) }
                    }.labelsHidden().frame(width: 135)
                }
            }
            Text("Can code includes reading files, editing in an isolated worktree, and running bounded checks. Publishing still requires review and approval.")
                .font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary)

            if let error = store.errorMessage {
                Label(error, systemImage: "exclamationmark.circle.fill").font(.system(size: 11, weight: .semibold, design: .rounded)).foregroundStyle(.orange)
            }
            Spacer()
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }.buttonStyle(.bordered)
                Button("Connect project") {
                    Task {
                        let access = store.state.bots.map { (levels[$0.id] ?? .code).grant(botID: $0.id) }
                        let completed = mode == .local
                            ? await store.connectCodeProject(name: cleanName, rootPath: rootPath, access: access)
                            : await store.cloneCodeProject(repository: cleanRepository, access: access)
                        if completed { dismiss() }
                    }
                }
                .buttonStyle(.borderedProminent).tint(DesktopTheme.purple).disabled(!canConnect || store.isCheckingCodeProjects)
            }
        }
        .padding(22).frame(width: 580, height: 590).background(DesktopTheme.paper)
        .onAppear {
            for bot in store.state.bots where levels[bot.id] == nil { levels[bot.id] = .code }
            if !canChooseLocalFolders { mode = .github }
        }
    }

    private var cleanName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var cleanRepository: String { repository.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canConnect: Bool {
        mode == .local ? canChooseLocalFolders && !cleanName.isEmpty && !rootPath.isEmpty : URL(string: cleanRepository)?.scheme == "https"
    }

    private func chooseFolder() {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        panel.prompt = "Choose project"
        guard panel.runModal() == .OK, let url = panel.url else { return }
        rootPath = url.path
        if cleanName.isEmpty { name = url.lastPathComponent }
    }
}
