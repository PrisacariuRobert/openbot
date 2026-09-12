import SwiftUI

/// Studio capabilities that previously lived only on the web client:
/// full-text search, code projects, and workspace files. Same store, same
/// access rules — only the presentation is new here.

struct NativeSearchView: View {
    @ObservedObject var store: StudioStore
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField("Search conversations, work and files", text: $query)
                        .textInputAutocapitalization(.never)
                        .disableAutocorrection(true)
                        .submitLabel(.search)
                        .onSubmit { Task { await store.searchStudio(query) } }
                        .accessibilityIdentifier("native-search-field")
                    if !query.isEmpty {
                        Button { query = ""; store.clearSearch() } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                        }
                        .accessibilityLabel("Clear search")
                    }
                }
                .padding(.horizontal, 12).padding(.vertical, 10)
                .background(StudioPalette.surface, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .padding(12)
                if store.searchResults.isEmpty {
                    Spacer()
                    Text(query.isEmpty ? "Search across every conversation, result and file." : "Nothing matches “\(query)”.")
                        .font(.subheadline).foregroundStyle(StudioPalette.muted)
                        .multilineTextAlignment(.center).padding(24)
                    Spacer()
                } else {
                    List(store.searchResults) { result in
                        Button {
                            dismiss()
                            Task { await store.chooseThread(result.threadId) }
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(result.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                                Text(result.snippet).font(.footnote).foregroundStyle(StudioPalette.muted).lineLimit(2)
                                Text(result.subtitle).font(.caption).foregroundStyle(StudioPalette.muted).lineLimit(1)
                            }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .background(StudioPalette.paper)
            .navigationTitle("Search").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .tint(StudioPalette.ink)
        .onChange(of: query) { _, next in
            searchTask?.cancel()
            guard next.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2 else {
                if next.isEmpty { store.clearSearch() }
                return
            }
            searchTask = Task {
                try? await Task.sleep(for: .milliseconds(450))
                guard !Task.isCancelled else { return }
                await store.searchStudio(next)
            }
        }
        .onDisappear { searchTask?.cancel(); store.clearSearch() }
    }
}

struct NativeProjectsView: View {
    @ObservedObject var store: StudioStore
    @Environment(\.dismiss) private var dismiss
    @State private var confirmingDisconnect: StudioCodeProject?
    @State private var expandedProject: String?

    private func accessLevel(project: StudioCodeProject, botID: String) -> Int {
        guard let access = project.access.first(where: { $0.botId == botID }) else { return 0 }
        if access.canWrite && access.canRun { return 2 }
        return access.canRead ? 1 : 0
    }

    private func accessBinding(projectID: String, botID: String, level: Int) -> Binding<Int> {
        Binding(
            get: { level },
            set: { newLevel in
                let access = StudioCodeProjectAccess(botId: botID, canRead: newLevel > 0, canWrite: newLevel > 1, canRun: newLevel > 1)
                Task { await store.setCodeProjectAccess(projectID: projectID, botID: botID, access: access) }
            }
        )
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if let status = store.codeProjectsStatus, !status.projects.isEmpty {
                        section("Connected projects", subtitle: "Give every teammate exactly the access their role needs") {
                            ForEach(status.projects) { project in
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack(spacing: 10) {
                                        Image(systemName: project.gitRepository ? "chevron.left.forwardslash.chevron.right" : "folder")
                                            .frame(width: 30, height: 30)
                                            .background(StudioPalette.surface, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                                        VStack(alignment: .leading, spacing: 1) {
                                            Text(project.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                                            Text("\(project.projectKind)\(project.gitRepository ? " · Git" : "")")
                                                .font(.caption).foregroundStyle(StudioPalette.muted)
                                        }
                                        Spacer()
                                        Button { expandedProject = expandedProject == project.id ? nil : project.id } label: {
                                            Image(systemName: "person.2").foregroundStyle(.secondary)
                                        }
                                        .accessibilityLabel("Teammate access for \(project.name)")
                                        Button(role: .destructive) { confirmingDisconnect = project } label: {
                                            Image(systemName: "trash").foregroundStyle(.secondary)
                                        }
                                        .accessibilityLabel("Disconnect \(project.name)")
                                    }
                                    if expandedProject == project.id {
                                        ForEach(store.state.bots) { bot in
                                            HStack {
                                                Text(bot.name).font(.footnote).lineLimit(1)
                                                Spacer()
                                                Picker("\(bot.name) access", selection: accessBinding(projectID: project.id, botID: bot.id, level: accessLevel(project: project, botID: bot.id))) {
                                                    Text("None").tag(0)
                                                    Text("Read").tag(1)
                                                    Text("Code").tag(2)
                                                }
                                                .pickerStyle(.segmented)
                                                .frame(maxWidth: 190)
                                            }
                                        }
                                    }
                                }
                                .padding(12)
                                .background(StudioPalette.paper, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(StudioPalette.line))
                            }
                        }
                    }
                    if let suggestions = store.codeProjectsStatus?.suggestions, !suggestions.isEmpty {
                        section("Projects on this Mac", subtitle: "One tap shares the folder with every teammate") {
                            ForEach(suggestions.prefix(8)) { suggestion in
                                HStack(spacing: 10) {
                                    Image(systemName: "folder").foregroundStyle(.secondary)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(suggestion.name).font(.subheadline.weight(.semibold)).lineLimit(1)
                                        Text("\(suggestion.projectKind)\(suggestion.gitRepository ? " · Git" : "")")
                                            .font(.caption).foregroundStyle(StudioPalette.muted)
                                    }
                                    Spacer()
                                    Button {
                                        Task {
                                            await store.connectCodeProject(
                                                name: suggestion.name,
                                                rootPath: suggestion.rootPath,
                                                access: store.state.bots.map { StudioCodeProjectAccess(botId: $0.id, canRead: true, canWrite: true, canRun: true) }
                                            )
                                        }
                                    } label: { Image(systemName: "plus.circle.fill").font(.title3) }
                                    .accessibilityLabel("Connect \(suggestion.name)")
                                }
                                .padding(.vertical, 7)
                            }
                        }
                    }
                    if let edits = store.codeProjectsStatus?.edits, !edits.isEmpty {
                        section("Safety net", subtitle: "Restore an agent edit while it is still the newest version") {
                            ForEach(edits.prefix(8)) { edit in
                                HStack(spacing: 10) {
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text("\(edit.botName) updated \(edit.path)").font(.footnote.weight(.semibold)).lineLimit(1)
                                        Text(edit.operation).font(.caption).foregroundStyle(StudioPalette.muted).lineLimit(1)
                                    }
                                    Spacer()
                                    Button("Restore") { Task { await store.restoreCodeProjectEdit(edit.id) } }
                                        .font(.footnote.weight(.semibold))
                                }
                                .padding(.vertical, 6)
                            }
                        }
                    }
                    if store.codeProjectsStatus == nil {
                        Text("Loading projects…").foregroundStyle(StudioPalette.muted)
                    }
                }
                .padding(20)
            }
            .background(StudioPalette.paper)
            .navigationTitle("Projects").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task { await store.refreshCodeProjects() }
            .confirmationDialog(
                "Disconnect this project?",
                isPresented: Binding(get: { confirmingDisconnect != nil }, set: { if !$0 { confirmingDisconnect = nil } }),
                titleVisibility: .visible
            ) {
                Button("Disconnect", role: .destructive) {
                    if let project = confirmingDisconnect {
                        Task { await store.disconnectCodeProject(project.id) }
                    }
                    confirmingDisconnect = nil
                }
                Button("Cancel", role: .cancel) { confirmingDisconnect = nil }
            } message: {
                Text("No project files will be deleted.")
            }
        }
        .tint(StudioPalette.ink)
    }

    private func section<Content: View>(_ title: String, subtitle: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(subtitle).font(.footnote).foregroundStyle(StudioPalette.muted)
            }
            content()
        }
    }
}

struct NativeFilesView: View {
    @ObservedObject var store: StudioStore
    @Environment(\.dismiss) private var dismiss
    @State private var botID: String?
    @State private var previewContent: StudioWorkspaceFileContent?

    private var bot: StudioBot? {
        store.state.bots.first(where: { $0.id == botID }) ?? store.state.bots.first
    }

    var body: some View {
        NavigationStack {
            List {
                Section("Teammate workspace") {
                    Picker("Teammate", selection: Binding(get: { bot?.id ?? "" }, set: { botID = $0 })) {
                        ForEach(store.state.bots) { bot in Text(bot.name).tag(bot.id) }
                    }
                    if store.workspaceFiles.isEmpty {
                        Text("No workspace files yet.").foregroundStyle(StudioPalette.muted)
                    }
                    ForEach(store.workspaceFiles) { file in
                        Button {
                            if let bot { Task { await store.openWorkspaceFile(botID: bot.id, path: file.path) } }
                        } label: {
                            HStack {
                                Image(systemName: "doc.text").foregroundStyle(.secondary)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(file.path).font(.footnote).lineLimit(1)
                                    Text("\(file.kind) · \(file.size / 1024) KB").font(.caption).foregroundStyle(StudioPalette.muted)
                                }
                            }
                        }
                    }
                }
                Section("Delivered files") {
                    if store.artifacts.isEmpty {
                        Text("No delivered files yet.").foregroundStyle(StudioPalette.muted)
                    }
                    ForEach(store.artifacts) { artifact in
                        Button {
                            Task { await store.openArtifact(artifact) }
                        } label: {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(artifact.name).font(.footnote.weight(.semibold)).lineLimit(1)
                                Text([artifact.botName, artifact.summary].compactMap { $0 }.joined(separator: " · "))
                                    .font(.caption).foregroundStyle(StudioPalette.muted).lineLimit(2)
                            }
                        }
                    }
                    if !store.artifactRevisions.isEmpty {
                        ForEach(store.artifactRevisions) { revision in
                            Text("Revision \(revision.revision) · \(revision.size / 1024) KB · \(revision.createdAt)")
                                .font(.caption).foregroundStyle(StudioPalette.muted)
                        }
                    }
                }
            }
            .navigationTitle("Files").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task(id: bot?.id) {
                if let bot {
                    await store.refreshWorkspace(botID: bot.id)
                    if store.artifacts.isEmpty { await store.refreshArtifacts() }
                }
            }
            .sheet(isPresented: Binding(get: { store.workspaceFileContent != nil }, set: { if !$0 { store.closeWorkspaceFile() } })) {
                if let content = store.workspaceFileContent {
                    NavigationStack {
                        ScrollView { Text(content.content).font(.system(.footnote, design: .monospaced)).textSelection(.enabled).padding() }
                            .navigationTitle(content.path).navigationBarTitleDisplayMode(.inline)
                            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { store.closeWorkspaceFile() } } }
                    }
                }
            }
        }
        .tint(StudioPalette.ink)
    }
}
