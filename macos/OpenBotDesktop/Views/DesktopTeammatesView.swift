import AppKit
import SwiftUI

struct DesktopTeammatesView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    @State private var editingBot: StudioBot?
    @State private var showingEditor = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "person.3.fill").font(.system(size: 17, weight: .semibold)).foregroundStyle(DesktopTheme.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Teammates").font(.system(size: 17, weight: .bold, design: .rounded))
                    Text("Give each teammate a clear job, model, budget, and only the tools it needs.")
                        .font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                }
                Spacer()
                Button { editingBot = nil; showingEditor = true } label: { Label("New teammate", systemImage: "plus") }
                    .buttonStyle(.borderedProminent).tint(DesktopTheme.purple).controlSize(.small)
                Button("Done") { dismiss() }.buttonStyle(.bordered).controlSize(.small)
            }
            .padding(.horizontal, 18).padding(.vertical, 13).background(.ultraThinMaterial)
            Divider().opacity(0.55)

            ScrollView {
                VStack(alignment: .leading, spacing: 13) {
                    ForEach(store.state.bots) { bot in
                        HStack(spacing: 14) {
                            DesktopMascotView(bot: bot, size: 58).frame(width: 69, height: 64)
                            VStack(alignment: .leading, spacing: 5) {
                                HStack(spacing: 8) {
                                    Text(bot.name).font(.system(size: 16, weight: .bold, design: .rounded))
                                    Text(bot.status.uppercased()).font(.system(size: 8.5, weight: .bold, design: .rounded))
                                        .foregroundStyle(bot.status == "ready" ? DesktopTheme.green : DesktopTheme.purple)
                                }
                                Text(bot.role).font(.system(size: 11.5, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                                Text(bot.model ?? "Choose an AI model")
                                    .font(.system(size: 9.5, design: .monospaced)).foregroundStyle(.secondary).lineLimit(1)
                                HStack(spacing: 10) {
                                    Label(bot.browserEnabled == true ? "Browser" : "No browser", systemImage: "globe")
                                    Label(bot.computerEnabled == true ? "Computer" : "No computer", systemImage: "terminal")
                                    let budget = bot.weeklyTokenBudget ?? 0
                                    Label(budget > 0 ? "\(budget.formatted()) / week" : "No token cap", systemImage: "gauge.with.dots.needle.33percent")
                                }
                                .font(.system(size: 9.5, weight: .medium, design: .rounded)).foregroundStyle(.tertiary)
                            }
                            Spacer()
                            Button("Edit") { editingBot = bot; showingEditor = true }.buttonStyle(.bordered)
                            Button {
                                Task { _ = await store.duplicateBot(bot.id) }
                            } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
                            .buttonStyle(.bordered)
                        }
                        .controlSize(.small).padding(14)
                        .background(.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(.black.opacity(0.055)))
                    }

                    if let error = store.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 11.5, weight: .semibold, design: .rounded)).foregroundStyle(.orange)
                    }
                    Text("Duplicating creates an independent teammate with a separate conversation, workspace, browser profile, memory, skills, permissions, and future usage history.")
                        .font(.system(size: 10.5, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                }
                .padding(20)
            }
        }
        .frame(width: 760, height: 650).background(DesktopTheme.paper)
        .task { await store.refreshProviders() }
        .sheet(isPresented: $showingEditor, onDismiss: { editingBot = nil }) {
            DesktopTeammateEditorView(store: store, bot: editingBot)
        }
    }
}

private struct DesktopTeammateEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    let bot: StudioBot?
    @State private var name: String
    @State private var role: String
    @State private var instructions: String
    @State private var mascot: String
    @State private var colorHex: String
    @State private var providerID: String
    @State private var model: String
    @State private var computerEnabled: Bool
    @State private var browserEnabled: Bool
    @State private var weeklyBudget: Int
    @State private var saving = false

    private let mascots = [("nova", "Orbit"), ("blob", "Blob"), ("sprout", "Sprout"), ("orbit", "Satellite"), ("pebble", "Pebble"), ("sunny", "Sunny")]
    private let colors = ["#6D5BD8", "#E75C83", "#36AA82", "#E18A45", "#3478C8", "#A85BB7"]

    init(store: StudioStore, bot: StudioBot?) {
        self.store = store
        self.bot = bot
        _name = State(initialValue: bot?.name ?? "")
        _role = State(initialValue: bot?.role ?? "")
        _instructions = State(initialValue: bot?.instructions ?? "")
        _mascot = State(initialValue: bot?.mascot ?? "nova")
        _colorHex = State(initialValue: bot?.color ?? "#6D5BD8")
        _providerID = State(initialValue: bot?.providerInstanceId ?? "")
        _model = State(initialValue: bot?.model ?? "")
        _computerEnabled = State(initialValue: bot?.computerEnabled ?? true)
        _browserEnabled = State(initialValue: bot?.browserEnabled ?? true)
        _weeklyBudget = State(initialValue: bot?.weeklyTokenBudget ?? 0)
    }

    private var providers: [StudioProviderInstance] { store.providerStatus?.instances.filter { $0.connected != false } ?? [] }
    private var selectedProvider: StudioProviderInstance? { providers.first(where: { $0.id == providerID }) }
    private var models: [String] {
        if let models = selectedProvider?.models, !models.isEmpty { return models }
        return selectedProvider?.defaultModel.map { [$0] } ?? []
    }
    private var previewBot: StudioBot {
        StudioBot(id: bot?.id ?? "preview", name: name.isEmpty ? "New teammate" : name, mascot: mascot, color: colorHex, role: role, status: "ready", threadId: "", lastActiveAt: nil)
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                DesktopMascotView(bot: previewBot, size: 54).frame(width: 64, height: 60)
                VStack(alignment: .leading, spacing: 2) {
                    Text(bot == nil ? "Create a teammate" : "Edit \(bot?.name ?? "teammate")")
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                    Text("Personality is guidance. Permissions and token limits are enforced separately.")
                        .font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(20).background(.ultraThinMaterial)
            Divider().opacity(0.55)

            ScrollView {
                VStack(alignment: .leading, spacing: 15) {
                    HStack(spacing: 12) {
                        editorField("Name") { TextField("Nova", text: $name).textFieldStyle(.roundedBorder) }
                        editorField("Role") { TextField("Researcher", text: $role).textFieldStyle(.roundedBorder) }
                    }
                    editorField("How should this teammate work?") {
                        TextEditor(text: $instructions).font(.system(size: 12.5, design: .rounded)).frame(height: 105)
                            .padding(7).background(.white, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(.black.opacity(0.10)))
                    }

                    HStack(spacing: 12) {
                        editorField("Character") { Picker("Character", selection: $mascot) { ForEach(mascots, id: \.0) { value, label in Text(label).tag(value) } }.labelsHidden() }
                        editorField("Color") {
                            HStack(spacing: 7) {
                                ForEach(colors, id: \.self) { color in
                                    Button { colorHex = color } label: {
                                        Circle().fill(Color(desktopHex: color)).frame(width: 19, height: 19)
                                            .overlay(Circle().stroke(.white, lineWidth: colorHex == color ? 3 : 0))
                                            .shadow(color: .black.opacity(0.15), radius: 1)
                                    }.buttonStyle(.plain)
                                }
                                ColorPicker("", selection: Binding(
                                    get: { Color(desktopHex: colorHex) },
                                    set: { colorHex = $0.desktopHex }
                                ), supportsOpacity: false).labelsHidden()
                            }
                        }
                    }

                    HStack(spacing: 12) {
                        editorField("AI connection") {
                            Picker("AI connection", selection: $providerID) {
                                ForEach(providers) { Text($0.name).tag($0.id) }
                            }.labelsHidden().onChange(of: providerID) { _, _ in chooseFirstModel() }
                        }
                        editorField("Model") {
                            Picker("Model", selection: $model) {
                                ForEach(models, id: \.self) { Text($0).tag($0) }
                            }.labelsHidden()
                        }
                    }

                    HStack(spacing: 20) {
                        Toggle("Private computer", isOn: $computerEnabled).toggleStyle(.switch)
                        Toggle("Private browser", isOn: $browserEnabled).toggleStyle(.switch)
                    }.controlSize(.small)
                    editorField("Weekly token budget") {
                        HStack {
                            TextField("0", value: $weeklyBudget, format: .number).textFieldStyle(.roundedBorder).frame(width: 150)
                            Text(weeklyBudget <= 0 ? "No per-teammate cap" : "Stops new work after \(max(0, weeklyBudget).formatted()) tokens this week")
                                .font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary)
                        }
                    }

                    if let error = store.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 11.5, weight: .semibold, design: .rounded)).foregroundStyle(.orange)
                    }
                }.padding(20)
            }

            Divider().opacity(0.55)
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }.buttonStyle(.bordered)
                Button {
                    saving = true
                    Task {
                        if await store.saveBot(
                            id: bot?.id,
                            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                            emoji: bot?.emoji ?? "🤖",
                            mascot: mascot,
                            color: colorHex,
                            role: role.trimmingCharacters(in: .whitespacesAndNewlines),
                            instructions: instructions.trimmingCharacters(in: .whitespacesAndNewlines),
                            providerInstanceID: providerID,
                            model: model,
                            computerEnabled: computerEnabled,
                            browserEnabled: browserEnabled,
                            weeklyTokenBudget: max(0, weeklyBudget)
                        ) { dismiss() }
                        saving = false
                    }
                } label: {
                    if saving { ProgressView().controlSize(.small) }
                    else { Text(bot == nil ? "Create teammate" : "Save changes") }
                }
                .buttonStyle(.borderedProminent).tint(DesktopTheme.purple)
                .disabled(!valid || saving)
            }.padding(16)
        }
        .frame(width: 690, height: 710).background(DesktopTheme.paper)
        .task {
            await store.refreshProviders()
            if providerID.isEmpty { providerID = providers.first?.id ?? "" }
            if model.isEmpty { chooseFirstModel() }
        }
    }

    private var valid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !role.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !instructions.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !providerID.isEmpty && !model.isEmpty && weeklyBudget >= 0
    }

    private func chooseFirstModel() {
        let provider = providers.first(where: { $0.id == providerID })
        let available = provider?.models.flatMap { $0.isEmpty ? nil : $0 } ?? provider?.defaultModel.map { [$0] } ?? []
        if !available.contains(model) { model = available.first ?? "" }
    }

    private func editorField<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 11, weight: .semibold, design: .rounded))
            content()
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

private extension Color {
    init(desktopHex hex: String) {
        let clean = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var value: UInt64 = 0
        Scanner(string: clean).scanHexInt64(&value)
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }

    var desktopHex: String {
        guard let color = NSColor(self).usingColorSpace(.sRGB) else { return "#6D5BD8" }
        return String(format: "#%02X%02X%02X", Int(color.redComponent * 255), Int(color.greenComponent * 255), Int(color.blueComponent * 255))
    }
}
