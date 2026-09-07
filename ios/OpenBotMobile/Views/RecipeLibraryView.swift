import SwiftUI
import UniformTypeIdentifiers

private struct LibraryRecipe: Decodable, Identifiable {
    let id: String, title: String, summary: String, output: String, limit: String
    let version: Int
    let requirements: [String]
    let workKind: String?
}
private struct RecipePreferences: Codable { var detail = "concise"; var includeDrafts = false }
private struct RecipeSettingsFile: Codable {
    let format: String, recipeId: String, digest: String
    let formatVersion: Int, recipeVersion: Int
    let preferences: RecipePreferences
}
private struct RecipeState: Decodable {
    struct Saved: Decodable { let recipeId: String; let preferences: RecipePreferences }
    let recipes: [LibraryRecipe]; let saved: [Saved]
}
private struct RecipePreview: Decodable { let recipe: LibraryRecipe; let bundle: RecipeSettingsFile; let notice: String }
private struct RecipeExampleResult: Decodable { let markdown: String; let checks: [String]; let fixture: Bool; let providerUsed: Bool }
private struct RecipePrepared: Decodable { let botId: String; let prompt: String; let expectedWorkKind: String? }
private struct RecipeDocument: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws {
        guard let contents = configuration.file.regularFileContents, contents.count <= 16_384 else { throw CocoaError(.fileReadTooLarge) }
        data = contents
    }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}
struct RecipeLibraryView: View {
    @ObservedObject var store: StudioStore
    var onStarted: () -> Void = {}
    @State private var botID = ""
    @State private var selectedID = "morning-brief"
    @State private var library: RecipeState?
    @State private var preferences = RecipePreferences()
    @State private var example: RecipeExampleResult?
    @State private var preview: RecipePreview?
    @State private var busy = false
    @State private var notice = ""
    @State private var importing = false
    @State private var exporting = false
    @State private var document: RecipeDocument?
    private var selected: LibraryRecipe? { library?.recipes.first { $0.id == selectedID } }

    var body: some View {
        DisclosureGroup("Recipes to make your own") {
            VStack(alignment: .leading, spacing: 14) {
                Text("Six included workflows. Try sample data, then use your own connections.").font(.footnote).foregroundStyle(.secondary)
                Picker("Teammate", selection: $botID) { ForEach(store.state.bots) { Text($0.name).tag($0.id) } }.disabled(busy)
                Picker("Recipe", selection: $selectedID) { ForEach(library?.recipes ?? []) { Text($0.title).tag($0.id) } }.disabled(busy || library == nil)
                if let recipe = selected { recipeCard(recipe) }
                Text("Safe examples use synthetic data and prewritten interpretations, not AI reasoning. Starting with your sources uses this teammate’s provider and existing permissions.").font(.caption).foregroundStyle(.secondary)
                if let example {
                    DisclosureGroup("Example result · no model used") {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(example.checks, id: \.self) { Label($0, systemImage: "checkmark.circle").font(.footnote).fixedSize(horizontal: false, vertical: true) }
                            Text(.init(example.markdown)).font(.footnote).textSelection(.enabled).fixedSize(horizontal: false, vertical: true)
                        }.padding(.top, 10)
                    }
                }
                Button("Open recipe settings", systemImage: "square.and.arrow.down") { importing = true }.disabled(busy)
                if let preview {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Import \(preview.recipe.title)?").font(.headline)
                        Text(preview.notice).font(.footnote).foregroundStyle(.secondary)
                        Text("Answer length: \(preview.bundle.preferences.detail). Reply drafts: \(preview.bundle.preferences.includeDrafts ? "included where supported" : "off").").font(.caption)
                        Button("Import for this teammate") { Task { await perform {
                            let payload: [String: Any] = ["botId": botID, "bundle": try JSONSerialization.jsonObject(with: JSONEncoder().encode(preview.bundle))]
                            _ = try await post("/import", payload)
                            selectedID = preview.recipe.id; try await reload(); self.preview = nil
                            notice = "Settings imported. Nothing started and no permissions changed."
                        } } }.disabled(busy)
                    }.padding(14).background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 14))
                }
                if !notice.isEmpty || busy { Text(busy ? "Working…" : notice).font(.footnote).foregroundStyle(.secondary).accessibilityAddTraits(.updatesFrequently) }
            }.padding(.top, 14)
        }
        .padding(16).background(.background.opacity(0.8), in: RoundedRectangle(cornerRadius: 18))
        .onAppear { if botID.isEmpty { botID = store.state.bots.first?.id ?? "" } }
        .task(id: botID) {
            guard !botID.isEmpty else { return }; let id = botID; library = nil; example = nil; preview = nil
            do { let value = try JSONDecoder().decode(RecipeState.self, from: await store.recipeData(botID: id)); if id == botID { library = value; loadPreferences() } }
            catch { if id == botID { notice = "Couldn’t load recipes. Check your studio connection." } }
        }
        .onChange(of: selectedID) { _, _ in loadPreferences(); example = nil; preview = nil }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            Task { await perform {
                let url = try result.get(), scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                guard size <= 16_384 else { throw CocoaError(.fileReadTooLarge) }
                let data = try Data(contentsOf: url); guard data.count <= 16_384 else { throw CocoaError(.fileReadTooLarge) }
                preview = try JSONDecoder().decode(RecipePreview.self, from: await store.recipeData("/inspect", method: "POST", body: data))
            } }
        }
        .fileExporter(isPresented: $exporting, document: document, contentType: .json, defaultFilename: "\(selectedID).openbot-recipe") { result in
            switch result { case .success: notice = "Recipe settings exported. No private data or account bindings are included."; case .failure: notice = "The export wasn’t saved. Your recipe settings are still here." }
        }
    }

    private func recipeCard(_ recipe: LibraryRecipe) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(recipe.title).font(.headline)
            Text(recipe.summary).font(.subheadline)
            Text("You’ll need").font(.footnote.bold())
            ForEach(recipe.requirements, id: \.self) { Text("• \($0)").font(.footnote).fixedSize(horizontal: false, vertical: true) }
            Text("What you get: \(recipe.output)").font(.footnote)
            Text(recipe.limit).font(.caption).foregroundStyle(.secondary)
            Picker("Answer length", selection: $preferences.detail) { Text("Concise").tag("concise"); Text("More detail").tag("expanded") }.disabled(busy)
            if recipe.workKind == "inbox" { Toggle("Include unsent reply drafts", isOn: $preferences.includeDrafts).font(.footnote).disabled(busy) }
            Button("Try safe example", systemImage: "play") { Task { await perform {
                let value = try JSONDecoder().decode(RecipeExampleResult.self, from: await post("/example", ["recipeId": recipe.id]))
                guard value.fixture && !value.providerUsed else { throw StudioAPIError.invalidResponse }
                example = value; notice = "Example checked. No model or personal account was used."
            } } }.disabled(busy)
            Button(recipe.workKind == nil ? "Set up in chat" : "Start with my sources") { Task { await perform {
                let prepared = try JSONDecoder().decode(RecipePrepared.self, from: await post("/prepare", ["botId": botID, "recipeId": recipe.id, "preferences": try JSONSerialization.jsonObject(with: JSONEncoder().encode(preferences)), "timeZone": TimeZone.current.identifier]))
                await store.chooseThread("team-room")
                if await store.send(prepared.prompt, targetBotID: prepared.botId, expectedWorkKind: prepared.expectedWorkKind) { onStarted() }
                else { notice = store.errorMessage ?? "The task didn’t start. Check this teammate’s provider and permissions." }
            } } }.buttonStyle(.borderedProminent).disabled(busy)
            Button("Save & export settings", systemImage: "square.and.arrow.up") { Task { await perform {
                let data = try await post("/export", ["recipeId": recipe.id, "preferences": try JSONSerialization.jsonObject(with: JSONEncoder().encode(preferences))])
                _ = try await post("/import", ["botId": botID, "bundle": try JSONSerialization.jsonObject(with: data)])
                try await reload()
                document = RecipeDocument(data: data); exporting = true
            } } }.disabled(busy)
        }.padding(14).frame(maxWidth: .infinity, alignment: .leading).background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 14))
    }
    private func loadPreferences() { preferences = library?.saved.first { $0.recipeId == selectedID }?.preferences ?? RecipePreferences() }
    @MainActor private func reload() async throws { library = try JSONDecoder().decode(RecipeState.self, from: await store.recipeData(botID: botID)); loadPreferences() }
    @MainActor private func post(_ path: String, _ body: [String: Any]) async throws -> Data { try await store.recipeData(path, method: "POST", body: JSONSerialization.data(withJSONObject: body)) }
    @MainActor private func perform(_ action: () async throws -> Void) async {
        guard !busy else { return }; busy = true; notice = ""
        defer { busy = false }
        do { try await action() } catch { notice = error.localizedDescription }
    }
}
