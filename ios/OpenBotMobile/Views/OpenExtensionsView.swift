import SwiftUI

private struct WorkflowCheckStatus: Decodable {
    let ready: Bool, reviewedInputs: Int, message: String
    let checks: [WorkflowCheckResult]
}
private struct WorkflowCheckResult: Decodable, Identifiable {
    let runId: String, input: String, expected: String, status: String, result: String
    let current: Bool, toolCount: Int
    let verdict: String?, error: String?
    var id: String { runId }
}

struct WorkflowChecksView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    let botID: String
    @State private var workflows: [StudioSkill] = []
    @State private var workflowID = ""
    @State private var status: WorkflowCheckStatus?
    @State private var input = ""
    @State private var expected = ""
    @State private var confirmed = false
    @State private var busy = false
    @State private var reviewed: Set<String> = []
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Check before scheduling") {
                    if workflows.isEmpty { Text("Teach or install a saved skill for this teammate first.") }
                    else {
                        Picker("Saved skill", selection: $workflowID) { ForEach(workflows) { skill in Text(skill.name).tag(skill.id) } }
                        Text(status?.message ?? "Loading checks…").font(.callout)
                        Button("Refresh checks") { Task { await perform { try await load() } } }
                    }
                    if busy { ProgressView() }
                    if let error { Text(error).foregroundStyle(Color.primary) }
                }
                if !workflowID.isEmpty {
                    Section("Try a different example") {
                        Text("Checks are real tasks using this teammate's selected model, budget and normal approval rules. Never enter passwords here.").font(.callout).foregroundStyle(.secondary)
                        TextField("Test input", text: $input, axis: .vertical).lineLimit(3...6)
                        TextField("What should the result show?", text: $expected, axis: .vertical).lineLimit(3...6)
                        Toggle("Start a real check using this teammate's model and tools", isOn: $confirmed)
                        Button("Run this check") { Task { await perform {
                            try await send("", ["input": input, "expected": expected, "confirmed": true]); input = ""; confirmed = false
                        } } }.disabled(!confirmed || input.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 || expected.trimmingCharacters(in: .whitespacesAndNewlines).count < 3 || input.count > 2000 || expected.count > 2000)
                    }
                    ForEach((status?.checks ?? []).reversed()) { check in
                        Section(check.input) {
                            Text(!check.current ? "Older version or expired check" : check.verdict.map { "Your review: \($0)" } ?? check.status.replacingOccurrences(of: "_", with: " ")).font(.caption)
                            Text("Expected: \(check.expected)")
                            if !check.result.isEmpty {
                                DisclosureGroup("Review the result") {
                                    Text(check.result).textSelection(.enabled)
                                    Text("Open the teammate's conversation to inspect source links and the work behind this result.").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            if let error = check.error { Text(error).foregroundStyle(Color.primary) }
                            if check.current && check.verdict == nil && ["completed", "failed", "cancelled"].contains(check.status) {
                                Toggle("I compared the result and its sources with the expected outcome", isOn: Binding(get: { reviewed.contains(check.id) }, set: { if $0 { reviewed.insert(check.id) } else { reviewed.remove(check.id) } }))
                                Button("Matches expected result") { review(check, verdict: "passed") }.disabled(!reviewed.contains(check.id) || check.status != "completed" || check.result.isEmpty || check.toolCount == 0)
                                Button("Needs fixing") { review(check, verdict: "failed") }.disabled(!reviewed.contains(check.id))
                            }
                        }
                    }
                    Section { Text("Two different reviewed examples are valid for 30 days for this version and setup. Changes need fresh checks. This does not grant permission to send, publish or delete.").font(.caption).foregroundStyle(.secondary) }
                }
            }
            .formStyle(.grouped).disabled(busy)
            .navigationTitle("Saved skill checks")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        #if os(macOS)
        .frame(width: 640, height: 700)
        #endif
        .task { await perform {
            workflows = try JSONDecoder().decode([StudioSkill].self, from: await store.extensionData("/workflows")).filter { $0.botId == botID }
            workflowID = workflows.first?.id ?? ""
        } }
        .task(id: workflowID) { status = nil; reviewed = []; if !workflowID.isEmpty { await perform { try await load() } } }
    }
    @MainActor private func perform(_ work: () async throws -> Void) async {
        busy = true; error = nil; defer { busy = false }
        do { try await work() } catch { self.error = error.localizedDescription }
    }
    @MainActor private func load() async throws {
        let id = workflowID
        let next = try JSONDecoder().decode(WorkflowCheckStatus.self, from: await store.extensionData("/workflows/\(id)/checks"))
        if workflowID == id { status = next }
    }
    @MainActor private func send(_ suffix: String, _ body: [String: Any]) async throws {
        let id = workflowID
        let next = try JSONDecoder().decode(WorkflowCheckStatus.self, from: await store.extensionData("/workflows/\(id)/checks\(suffix)", method: "POST", body: JSONSerialization.data(withJSONObject: body)))
        if workflowID == id { status = next }
    }
    private func review(_ check: WorkflowCheckResult, verdict: String) {
        Task { await perform { try await send("/\(check.runId)/review", ["verdict": verdict, "reviewedResult": true]) } }
    }
}

private struct OpenExtensionState: Decodable {
    var connections: [OpenMCPConnection]
    var skills: [OpenCommunitySkill]
    var oauth: OpenOAuthSettings?
}
private struct OpenOAuthSettings: Decodable { let hostOnly: Bool }
private struct OpenMCPConnection: Decodable, Identifiable {
    let id: String, name: String, url: String
    let tools: [OpenMCPTool]
    let grants: [String: [String: String]]
    let checkedAt: String?
    let lastUsedAt: String?
    let authMode: String?
}
private struct OpenMCPTool: Decodable, Identifiable {
    let name: String, description: String
    var id: String { name }
}
private struct OpenCommunitySkill: Decodable, Identifiable {
    let id: String, name: String, description: String, instructions: String, source: String, license: String, digest: String
    let botIds: [String]
    let bundled: Bool?
}
private struct OpenSkillPreview: Decodable {
    let name: String, description: String, source: String, license: String, digest: String
    let files: [String: String]
    let warnings: [String], blockers: [String]
}
private struct OpenMemoryNote: Decodable, Identifiable {
    let key: String, content: String
    let revision: String
    let source: String
    let expiresAt: String?
    let expired: Bool
    let conflict: Bool
    var id: String { key }
}

struct OpenExtensionsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @ObservedObject var store: StudioStore
    @State var section = 0
    @State private var botID = ""
    @State private var state = OpenExtensionState(connections: [], skills: [])
    @State private var busy = false
    @State private var error: String?
    @State private var notice: String?
    @State private var name = ""
    @State private var endpoint = ""
    @State private var token = ""
    @State private var allowLocal = false
    @State private var source = ""
    @State private var markdown = ""
    @State private var preview: OpenSkillPreview?
    @State private var notes: [OpenMemoryNote] = []
    @State private var noteKey = ""
    @State private var noteText = ""
    @State private var noteRevision: String?
    @State private var noteExpires = false
    @State private var noteExpiryDate = Date().addingTimeInterval(30 * 86400)
    @State private var removal: String?
    @State private var signInID: String?
    @State private var showWorkflowChecks = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Section", selection: $section) {
                        Text("Connections").tag(0); Text("Skills").tag(1); Text("Memory").tag(2)
                    }.pickerStyle(.segmented)
                    Picker("Teammate", selection: $botID) {
                        ForEach(store.state.bots) { bot in Text(bot.name).tag(bot.id) }
                    }
                    if busy { ProgressView("Working…") }
                    if let error { Text(error).foregroundStyle(Color.primary).font(.callout) }
                    if let notice { Label(notice, systemImage: "checkmark.circle").foregroundStyle(.secondary).font(.callout) }
                }
                if section == 0 { connections }
                if section == 1 { skills }
                if section == 2 { memory }
            }
            .formStyle(.grouped)
            .disabled(busy)
            .navigationTitle("Tools, skills & memory")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .tint(Color(white: 0.380))
        .sheet(isPresented: $showWorkflowChecks) { WorkflowChecksView(store: store, botID: botID) }
        #if os(macOS)
        .frame(width: 700, height: 720)
        #endif
        .task { botID = store.state.bots.first?.id ?? ""; await perform { try await reload() } }
        .task(id: botID) { if !botID.isEmpty { await perform { try await reloadMemory() } } }
        .onChange(of: botID) { _, _ in notes = []; noteKey = ""; noteText = ""; noteRevision = nil; noteExpires = false }
        .confirmationDialog("Start a fresh sign-in? Existing credentials and tool permissions will be cleared first.", isPresented: Binding(get: { signInID != nil }, set: { if !$0 { signInID = nil } }), titleVisibility: .visible) {
            Button("Continue to sign-in") { if let id = signInID { Task { await signIn(id) } }; signInID = nil }
            Button("Cancel", role: .cancel) { signInID = nil }
        }
        .alert("Revoke access to this extension?", isPresented: Binding(get: { removal != nil }, set: { if !$0 { removal = nil } })) {
            Button("Revoke access", role: .destructive) { if let path = removal { Task { await perform { try await send(path, method: "DELETE"); try await reload(); notice = "Access revoked. Included skills can be enabled again below." } }; removal = nil } }
            Button("Cancel", role: .cancel) { removal = nil }
        } message: { Text("Imported extensions are removed. Included skills are disabled for current and future teammates; you can enable them again for a teammate.") }
    }

    private var connections: some View {
        Group {
            Section { Text("Use a service’s own sign-in or access token. Browser sign-in requires MCP public-client registration. Signing in again clears old credentials and tool permissions. Executable server commands are not supported.").font(.callout).foregroundStyle(.secondary) }
            ForEach(state.connections) { connection in
                Section(connection.name) {
                    Text(connection.url).font(.caption).textSelection(.enabled)
                    Text(connection.checkedAt == nil ? "Saved · not checked yet" : "Tools discovered · account access is checked when used").font(.caption).foregroundStyle(.secondary)
                    Button("Check connection") { Task { await perform { try await send("/mcp/\(connection.id)/check"); try await reload(); notice = "Checked. Changed tools lose their old grants." } } }
                    #if os(iOS)
                    if state.oauth?.hostOnly == true {
                        Text("Finish sign-in on the Mac running OpenBot, then share its tools here. This local callback cannot return to your Mac from a phone browser.").font(.caption).foregroundStyle(.secondary)
                    } else { Button(connection.authMode == "oauth" ? "Sign in again" : "Sign in with this service") { signInID = connection.id } }
                    #else
                    Button(connection.authMode == "oauth" ? "Sign in again" : "Sign in with this service") { signInID = connection.id }
                    #endif
                    if connection.authMode == "oauth" { Button("Disconnect sign-in", role: .destructive) { removal = "/mcp/\(connection.id)/oauth" } }
                    ForEach(connection.tools) { tool in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(tool.name).font(.headline)
                            Text(tool.description).font(.caption).foregroundStyle(.secondary)
                            Picker("Access", selection: Binding(get: { connection.grants[botID]?[tool.name] ?? "off" }, set: { mode in
                                var grants = connection.grants[botID] ?? [:]
                                if mode == "off" { grants.removeValue(forKey: tool.name) } else { grants[tool.name] = mode }
                                Task { await perform { try await send("/mcp/\(connection.id)/access", method: "PATCH", body: ["botId": botID, "grants": grants]); try await reload() } }
                            })) { Text("Off").tag("off"); Text("Ask each time").tag("ask"); Text("Read without asking").tag("read") }
                        }.padding(.vertical, 4)
                    }
                    Text("Use Read without asking only for tools you have verified cannot change anything. Server labels are not a security guarantee.").font(.caption).foregroundStyle(.secondary)
                    Button("Remove connection", role: .destructive) { removal = "/mcp/\(connection.id)" }
                }
            }
            Section("Add connection") {
                TextField("Name", text: $name)
                TextField("HTTPS endpoint", text: $endpoint)
                SecureField("Access token (optional)", text: $token)
                Toggle("Allow 127.0.0.1 on the studio host", isOn: $allowLocal)
                Button("Save connection") { Task { await perform { try await send("/mcp", body: ["name": name, "url": endpoint, "token": token, "allowLoopback": allowLocal]); token = ""; endpoint = ""; name = ""; try await reload(); notice = "Saved. Check it, then share individual tools." } } }.disabled(name.isEmpty || endpoint.isEmpty)
            }
        }
    }

    private var skills: some View {
        Group {
            Section("Before scheduling a saved skill") {
                Text("Check two different inputs and review the results. Changes to the skill or setup need fresh checks.").font(.callout).foregroundStyle(.secondary)
                Button("Check saved skills") { showWorkflowChecks = true }
            }
            Section("Ready-to-use skills") { Text("Included methods are available to every teammate automatically. Turn any off below. No software is installed and no account access is granted.").font(.callout).foregroundStyle(.secondary) }
            ForEach(state.skills) { skill in
                Section(skill.name.replacingOccurrences(of: "-", with: " ").capitalized) {
                    Text(skill.description).font(.callout)
                    Text("\(skill.bundled == true ? "Included" : "Imported") · \(skill.license) · pinned \(skill.digest.prefix(10))").font(.caption).foregroundStyle(.secondary)
                    Toggle("Available to this teammate", isOn: Binding(get: { skill.botIds.contains(botID) }, set: { enabled in
                        let ids = enabled ? Array(Set(skill.botIds + [botID])) : skill.botIds.filter { $0 != botID }
                        Task { await perform { try await send("/skills/\(skill.id)/access", method: "PATCH", body: ["botIds": ids]); try await reload() } }
                    }))
                    DisclosureGroup("Source & reviewed instructions") { Text(skill.source).font(.caption); Text(skill.instructions).font(.system(.caption, design: .monospaced)).textSelection(.enabled) }
                    Button(skill.bundled == true ? "Disable for everyone" : "Remove skill", role: .destructive) { removal = "/skills/\(skill.id)" }
                }
            }
            Section("Review a community skill") {
                Text("Portable SKILL.md instructions and text references only. Importing never installs scripts or grants account access.").font(.callout).foregroundStyle(.secondary)
                TextField("Raw HTTPS SKILL.md address", text: $source).onChange(of: source) { _, _ in preview = nil }
                Button("Load from URL") { Task { await perform { let data = try await store.extensionData("/skills/fetch", method: "POST", body: JSONSerialization.data(withJSONObject: ["url": source])); preview = try JSONDecoder().decode(OpenSkillPreview.self, from: data) } } }.disabled(source.isEmpty)
                Text("Or paste a self-contained SKILL.md").font(.caption).foregroundStyle(.secondary)
                TextEditor(text: $markdown).font(.system(.caption, design: .monospaced)).frame(minHeight: 120).onChange(of: markdown) { _, _ in preview = nil }
                Button("Review pasted skill") { Task { await perform { let data = try await store.extensionData("/skills/inspect", method: "POST", body: JSONSerialization.data(withJSONObject: ["source": "Manually provided by the studio owner", "files": ["SKILL.md": markdown]])); preview = try JSONDecoder().decode(OpenSkillPreview.self, from: data) } } }.disabled(markdown.isEmpty)
            }
            if let preview {
                Section("Review: \(preview.name)") {
                    Text(preview.description)
                    ForEach(preview.warnings, id: \.self) { Text($0).font(.caption).foregroundStyle(.secondary) }
                    ForEach(preview.blockers, id: \.self) { Text($0).font(.caption).foregroundStyle(Color.primary) }
                    ForEach(preview.files.keys.sorted(), id: \.self) { name in DisclosureGroup(name) { Text(preview.files[name] ?? "").font(.system(.caption, design: .monospaced)).textSelection(.enabled) } }
                    Button("Approve & add skill") { Task { await perform { try await send("/skills", body: ["bundle": ["source": preview.source, "files": preview.files], "digest": preview.digest, "botIds": [botID]]); self.preview = nil; markdown = ""; try await reload(); notice = "Reviewed skill installed." } } }.disabled(!preview.blockers.isEmpty)
                }
            }
        }
    }

    private var memory: some View {
        Group {
            Section { Text("Your corrections are protected. Task notes expire after 30 days by default. Expired or conflicting notes are left out of new-task context; past chats and running work are not erased.").font(.callout).foregroundStyle(.secondary)
                Button("Refresh notes") { Task { await perform { try await reloadMemory(); notice = "Refreshed. Choose Edit for the latest version." } } }
            }
            ForEach(notes) { note in
                Section(note.key) {
                    Text(note.content).font(.callout)
                    Text(note.source == "owner" ? "Set by you · protected" : note.source == "task" ? "Learned in a task" : "Older note · protected").font(.caption).foregroundStyle(.secondary)
                    if let date = memoryDate(note.expiresAt) { Text("\(note.expired ? "Expired" : "Expires") \(date.formatted())").font(.caption).foregroundStyle(.secondary) }
                    if note.conflict { Text("Conflicting note. Review before use.").font(.caption).foregroundStyle(Color.primary) }
                    HStack {
                        Button("Edit") { noteKey = note.key; noteText = note.content; noteRevision = note.revision; noteExpires = note.expiresAt != nil; noteExpiryDate = memoryDate(note.expiresAt) ?? Date().addingTimeInterval(30 * 86400) }
                        Button("Forget", role: .destructive) { Task { await perform { try await send("/memory/\(botID)", method: "DELETE", body: ["key": note.key, "expectedRevision": note.revision]); try await reloadMemory() } } }
                    }
                }
            }
            Section("Save a preference") {
                TextField("Note name", text: $noteKey).disabled(noteRevision != nil)
                TextEditor(text: $noteText).frame(minHeight: 80)
                Toggle("Expire this note", isOn: $noteExpires)
                if noteExpires { DatePicker("Keep until", selection: $noteExpiryDate) }
                Button("Save note") { Task { await perform {
                    var body: [String: Any] = ["key": noteKey, "content": noteText, "expiresAt": noteExpires ? ISO8601DateFormatter().string(from: noteExpiryDate) as Any : NSNull()]
                    if let revision = noteRevision { body["expectedRevision"] = revision }
                    try await send("/memory/\(botID)", method: "PATCH", body: body); noteKey = ""; noteText = ""; noteRevision = nil; noteExpires = false; try await reloadMemory(); notice = "Future tasks will use this correction."
                } } }.disabled(noteKey.isEmpty || noteText.isEmpty)
                Button("Clear editor") { noteKey = ""; noteText = ""; noteRevision = nil; noteExpires = false }
            }
        }
    }

    private func memoryDate(_ value: String?) -> Date? {
        guard let value else { return nil }
        let format = ISO8601DateFormatter(); format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return format.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
    @MainActor private func signIn(_ id: String) async {
        await perform {
            struct SignIn: Decodable { let url: URL }
            let result = try JSONDecoder().decode(SignIn.self, from: await store.extensionData("/mcp/\(id)/oauth", method: "POST", body: nil))
            openURL(result.url); try await reload(); notice = "Finish sign-in in your browser, then check this connection and choose tools to share."
        }
    }
    @MainActor private func perform(_ work: () async throws -> Void) async {
        busy = true; error = nil; notice = nil
        do { try await work() } catch { self.error = error.localizedDescription }
        busy = false
    }
    @MainActor private func reload() async throws { state = try JSONDecoder().decode(OpenExtensionState.self, from: await store.extensionData()) }
    @MainActor private func reloadMemory() async throws {
        let id = botID
        let result = try JSONDecoder().decode([OpenMemoryNote].self, from: await store.extensionData("/memory/\(id)"))
        if botID == id { notes = result }
    }
    @MainActor private func send(_ path: String, method: String = "POST", body: [String: Any]? = nil) async throws {
        _ = try await store.extensionData(path, method: method, body: body.map { try JSONSerialization.data(withJSONObject: $0) })
    }
}
