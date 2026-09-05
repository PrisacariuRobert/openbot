import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct DesktopSkillsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    @State private var selectedTemplate: StudioSkillTemplate?
    @State private var editingSkill: StudioSkill?
    @State private var historySkill: StudioSkill?
    @State private var pendingDelete: StudioSkill?
    @State private var importBotID = ""
    @State private var showingImporter = false
    @State private var showingTeach = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "wand.and.stars").font(.system(size: 17, weight: .semibold)).foregroundStyle(DesktopTheme.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Skill Library").font(.system(size: 17, weight: .bold, design: .rounded))
                    Text("Portable, versioned ways of doing repeatable work.")
                        .font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                }
                Spacer()
                Button { showingTeach = true } label: { Label("Teach", systemImage: "eye.fill") }
                    .buttonStyle(.borderedProminent).tint(DesktopTheme.purple).controlSize(.small)
                Menu {
                    ForEach(store.state.bots) { bot in
                        Button("Import for \(bot.name)…") { importBotID = bot.id; showingImporter = true }
                    }
                } label: { Label("Import", systemImage: "square.and.arrow.down") }
                .buttonStyle(.bordered).controlSize(.small)
                Button("Done") { dismiss() }.buttonStyle(.bordered).controlSize(.small)
            }
            .padding(.horizontal, 18).padding(.vertical, 13).background(.ultraThinMaterial)
            Divider().opacity(0.55)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let error = store.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 11.5, weight: .semibold, design: .rounded)).foregroundStyle(.orange)
                    }
                    Text("Saved skills").font(.system(size: 14, weight: .bold, design: .rounded))
                    if store.skills.isEmpty && !store.isCheckingSkills {
                        Text("No saved skills yet. Install a transparent starter below or import an OpenBot skill package.")
                            .font(.system(size: 11.5, design: .rounded)).foregroundStyle(.secondary)
                    }
                    ForEach(store.skills) { skill in skillCard(skill) }

                    Divider().padding(.vertical, 3)
                    Text("Starter skills").font(.system(size: 14, weight: .bold, design: .rounded))
                    ForEach(store.skillTemplates) { template in templateCard(template) }

                    Text("Imported packages are size-limited, integrity-checked, and scanned by the runner. Assignment copies the skill instructions, never the original teammate's messages, memory, credentials, or browser profile.")
                        .font(.system(size: 10.5, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                }
                .padding(20)
            }
        }
        .frame(width: 780, height: 700).background(DesktopTheme.paper)
        .task { await store.refreshSkills() }
        .sheet(item: $editingSkill) { skill in DesktopSkillEditView(store: store, skill: skill) }
        .sheet(item: $historySkill) { skill in DesktopSkillHistoryView(store: store, skill: skill) }
        .sheet(item: $selectedTemplate) { template in DesktopSkillInstallView(store: store, template: template) }
        .sheet(isPresented: $showingTeach) { DesktopTeachView(store: store) }
        .fileImporter(isPresented: $showingImporter, allowedContentTypes: [.json], allowsMultipleSelection: false) { result in
            guard case .success(let urls) = result, let url = urls.first, !importBotID.isEmpty else { return }
            Task { _ = await store.importSkill(fileURL: url, botID: importBotID) }
        }
        .confirmationDialog(
            "Delete this skill?",
            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            titleVisibility: .visible
        ) {
            if let skill = pendingDelete {
                Button("Delete \(skill.name)", role: .destructive) {
                    pendingDelete = nil
                    Task { _ = await store.deleteSkill(skill.id) }
                }
            }
            Button("Cancel", role: .cancel) { pendingDelete = nil }
        } message: {
            Text("This removes the saved skill for its current teammate. Other assigned copies remain separate.")
        }
    }

    private func skillCard(_ skill: StudioSkill) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 11) {
                DesktopMascotView(bot: store.state.bots.first(where: { $0.id == skill.botId }) ?? fallbackBot(skill), size: 38).frame(width: 42, height: 42)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 7) {
                        Text(skill.name).font(.system(size: 14, weight: .bold, design: .rounded))
                        Text("v\(skill.version)").font(.system(size: 9, weight: .bold, design: .rounded)).foregroundStyle(DesktopTheme.purple)
                    }
                    Text("/\(skill.skillSlug) · \(skill.botName) · \(skill.stepCount) steps")
                        .font(.system(size: 10, design: .monospaced)).foregroundStyle(.secondary)
                    Text(skill.description).font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer()
                Menu {
                    Button("Edit") { editingSkill = skill }
                    Button("Version history") { historySkill = skill }
                    Button("Export to Downloads") {
                        Task { if let url = await store.exportSkill(skill) { NSWorkspace.shared.activateFileViewerSelecting([url]) } }
                    }
                    Menu("Assign a copy") {
                        ForEach(store.state.bots.filter { $0.id != skill.botId }) { bot in
                            Button(bot.name) { Task { _ = await store.assignSkill(skill.id, botID: bot.id) } }
                        }
                    }
                    Divider()
                    Button("Delete", role: .destructive) { pendingDelete = skill }
                } label: { Image(systemName: "ellipsis.circle") }
                .menuStyle(.borderlessButton).fixedSize()
            }
            HStack {
                Button("Copy /\(skill.skillSlug)") {
                    NSPasteboard.general.clearContents(); NSPasteboard.general.setString("/\(skill.skillSlug) ", forType: .string)
                }.buttonStyle(.bordered).controlSize(.small)
                if let url = URL(string: skill.startUrl), url.scheme == "https" {
                    Button("Starting page") { NSWorkspace.shared.open(url) }.buttonStyle(.borderless).controlSize(.small)
                }
            }
        }
        .padding(14).background(.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(.black.opacity(0.055)))
    }

    private func templateCard(_ template: StudioSkillTemplate) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "sparkles.rectangle.stack.fill").font(.system(size: 18)).foregroundStyle(DesktopTheme.purple).frame(width: 38, height: 38)
            VStack(alignment: .leading, spacing: 3) {
                Text(template.name).font(.system(size: 13.5, weight: .bold, design: .rounded))
                Text(template.description).font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer()
            Button("Install") { selectedTemplate = template }.buttonStyle(.borderedProminent).tint(DesktopTheme.purple).controlSize(.small)
        }
        .padding(13).background(.white.opacity(0.72), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(.black.opacity(0.05)))
    }

    private func fallbackBot(_ skill: StudioSkill) -> StudioBot {
        StudioBot(id: skill.botId, name: skill.botName, mascot: "orbit", color: "#6D5BD8", role: "Teammate", status: "ready", threadId: "", lastActiveAt: nil)
    }
}

private struct DesktopSkillHistoryView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    let skill: StudioSkill
    @State private var versions: [StudioSkillVersion] = []
    @State private var loading = true
    @State private var pendingRestore: StudioSkillVersion?

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "clock.arrow.circlepath").foregroundStyle(DesktopTheme.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(skill.name) history").font(.system(size: 17, weight: .bold, design: .rounded))
                    Text("Restoring creates a new version, so the current setup is not lost.")
                        .font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary)
                }
                Spacer()
                Button("Done") { dismiss() }.buttonStyle(.bordered).controlSize(.small)
            }
            .padding(.horizontal, 18).padding(.vertical, 13).background(.ultraThinMaterial)
            Divider().opacity(0.55)

            if loading {
                ProgressView("Loading saved versions…").frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if versions.isEmpty {
                ContentUnavailableView("No saved versions", systemImage: "clock", description: Text("Edit this skill to create another retained version."))
            } else {
                ScrollView {
                    VStack(spacing: 10) {
                        ForEach(versions) { version in
                            HStack(alignment: .top, spacing: 12) {
                                Text("v\(version.version)")
                                    .font(.system(size: 11, weight: .bold, design: .rounded)).foregroundStyle(DesktopTheme.purple)
                                    .frame(width: 42).padding(.vertical, 5).background(DesktopTheme.purple.opacity(0.09), in: Capsule())
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(version.name).font(.system(size: 13, weight: .bold, design: .rounded))
                                    Text("\(version.stepCount) steps · \(formatted(version.createdAt))")
                                        .font(.system(size: 9.5, design: .rounded)).foregroundStyle(.secondary)
                                    Text(version.description).font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(2)
                                }
                                Spacer()
                                if version.version == skill.version {
                                    Text("Current").font(.system(size: 10, weight: .semibold, design: .rounded)).foregroundStyle(DesktopTheme.green)
                                } else {
                                    Button("Restore") { pendingRestore = version }.buttonStyle(.bordered).controlSize(.small)
                                }
                            }
                            .padding(13).background(.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(.black.opacity(0.05)))
                        }
                    }
                    .padding(18)
                }
            }
        }
        .frame(width: 590, height: 540).background(DesktopTheme.paper)
        .task { await loadVersions() }
        .confirmationDialog(
            "Restore this saved version?",
            isPresented: Binding(get: { pendingRestore != nil }, set: { if !$0 { pendingRestore = nil } }),
            titleVisibility: .visible
        ) {
            if let version = pendingRestore {
                Button("Restore version \(version.version)") {
                    pendingRestore = nil
                    Task {
                        if await store.rollbackSkill(skill.id, version: version.version) {
                            await loadVersions()
                        }
                    }
                }
            }
            Button("Cancel", role: .cancel) { pendingRestore = nil }
        } message: {
            Text("OpenBot will copy this saved setup into a new current version. Existing history remains available.")
        }
    }

    private func loadVersions() async {
        loading = true
        versions = await store.skillVersions(skill.id) ?? []
        loading = false
    }

    private func formatted(_ raw: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: raw) else { return raw }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}

private struct DesktopSkillInstallView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    let template: StudioSkillTemplate
    @State private var botID = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text("Install \(template.name)").font(.system(size: 20, weight: .bold, design: .rounded))
            Text(template.description).font(.system(size: 11.5, design: .rounded)).foregroundStyle(.secondary)
            Picker("Teammate", selection: $botID) {
                ForEach(store.state.bots) { Text("\($0.name) · \($0.role)").tag($0.id) }
            }
            HStack { Spacer(); Button("Cancel") { dismiss() }; Button("Install") { Task { if await store.installSkillTemplate(template.id, botID: botID) { dismiss() } } }.buttonStyle(.borderedProminent).tint(DesktopTheme.purple).disabled(botID.isEmpty) }
        }
        .padding(22).frame(width: 470, height: 230).background(DesktopTheme.paper)
        .onAppear { botID = store.state.bots.first?.id ?? "" }
    }
}

private struct DesktopSkillEditView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    let skill: StudioSkill
    @State private var name: String
    @State private var description: String
    @State private var instructions: String
    @State private var startURL: String

    init(store: StudioStore, skill: StudioSkill) {
        self.store = store; self.skill = skill
        _name = State(initialValue: skill.name); _description = State(initialValue: skill.description)
        _instructions = State(initialValue: skill.instructions); _startURL = State(initialValue: skill.startUrl)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            Text("Edit skill").font(.system(size: 20, weight: .bold, design: .rounded))
            TextField("Name", text: $name).textFieldStyle(.roundedBorder)
            TextField("What this skill is for", text: $description).textFieldStyle(.roundedBorder)
            TextField("https://starting-page.example", text: $startURL).textFieldStyle(.roundedBorder)
            Text("Instructions").font(.system(size: 11, weight: .semibold, design: .rounded))
            TextEditor(text: $instructions).font(.system(size: 12, design: .rounded)).frame(minHeight: 180)
                .padding(7).background(.white, in: RoundedRectangle(cornerRadius: 9)).overlay(RoundedRectangle(cornerRadius: 9).stroke(.black.opacity(0.10)))
            Text("Saving creates a new retained version.").font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary)
            HStack { Spacer(); Button("Cancel") { dismiss() }; Button("Save new version") { Task { if await store.updateSkill(skill.id, name: cleanName, description: cleanDescription, instructions: cleanInstructions, startURL: cleanURL) { dismiss() } } }.buttonStyle(.borderedProminent).tint(DesktopTheme.purple).disabled(!canSave) }
        }
        .padding(22).frame(width: 600, height: 520).background(DesktopTheme.paper)
    }

    private var cleanName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var cleanDescription: String { description.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var cleanInstructions: String { instructions.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var cleanURL: String { startURL.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var canSave: Bool { !cleanName.isEmpty && !cleanDescription.isEmpty && !cleanInstructions.isEmpty && URL(string: cleanURL)?.scheme == "https" }
}
