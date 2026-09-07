import AppKit
import SwiftUI

struct DesktopTeammatesView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    @State private var editingBot: StudioBot?
    @State private var showingEditor = false
    @State private var showingGroupEditor = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Your team").font(.system(size: 25, weight: .semibold))
                    Text("People to help with your work.")
                        .font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer()
                Button("New group", systemImage: "bubble.left.and.bubble.right") { showingGroupEditor = true }
                    .buttonStyle(.bordered).controlSize(.regular)
                    .disabled(store.state.bots.isEmpty)
                Button { editingBot = nil; showingEditor = true } label: { Label("New teammate", systemImage: "plus") }
                    .buttonStyle(.borderedProminent).tint(DesktopTheme.purple).controlSize(.regular)
                DesktopPanelCloseButton()
            }
            .padding(.horizontal, 38).padding(.top, 32).padding(.bottom, 22).background(StudioPalette.paper)

            ScrollView {
                VStack(alignment: .leading, spacing: 13) {
                    ForEach(store.state.bots) { bot in
                        HStack(spacing: 14) {
                            Button { editingBot = bot; showingEditor = true } label: {
                                HStack(spacing: 16) {
                                    DesktopMascotView(bot: bot, size: 46).frame(width: 48)
                                    VStack(alignment: .leading, spacing: 6) {
                                        Text(bot.name).font(.system(size: 14, weight: .semibold))
                                        Text(bot.role).font(.system(size: 12)).foregroundStyle(StudioPalette.muted)
                                    }
                                    Spacer()
                                    Image(systemName: "chevron.right").font(.system(size: 10)).foregroundStyle(StudioPalette.muted)
                                }.contentShape(Rectangle())
                            }.buttonStyle(.plain)
                            Menu {
                                Button("Duplicate teammate") { Task { _ = await store.duplicateBot(bot.id) } }
                            } label: { Image(systemName: "ellipsis") }.menuStyle(.borderlessButton).fixedSize().help("Teammate actions")
                        }
                        .padding(.vertical, 22)
                        .overlay(alignment: .bottom) { Rectangle().fill(StudioPalette.line).frame(height: 1) }
                    }

                    if let error = store.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 11.5, weight: .semibold, design: .default)).foregroundStyle(Color.primary)
                    }
                    Text("Duplicating creates an independent teammate with a separate conversation, workspace, browser profile, memory, skills, permissions, and future usage history.")
                        .font(.system(size: 10.5, weight: .medium, design: .default)).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 38).padding(.vertical, 18)
            }
        }
        .desktopPanelSize(width: 760, height: 650).background(DesktopTheme.paper)
        .task { await store.refreshProviders() }
        .onAppear { if store.state.bots.isEmpty { showingEditor = true } }
        .sheet(isPresented: $showingEditor, onDismiss: { editingBot = nil }) {
            DesktopTeammateEditorView(store: store, bot: editingBot)
        }
        .sheet(isPresented: $showingGroupEditor) { DesktopGroupEditor(store: store) }
    }
}

struct DesktopGroupEditor: View {
    @ObservedObject var store: StudioStore
    var thread: StudioThread? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var selected = Set<String>()
    @State private var saving = false

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text(thread == nil ? "New group conversation" : "Edit group").font(.title2.weight(.semibold))
            Text("Bring teammates together around a project or a shared goal. Their existing tools and permissions stay unchanged.")
                .font(.callout).foregroundStyle(.secondary)
            TextField("Group name", text: $title).textFieldStyle(.plain)
                .padding(12).background(StudioPalette.surface, in: RoundedRectangle(cornerRadius: 12))
                .accessibilityLabel("Group name")
            Text("Teammates · \(selected.count) of 6").font(.callout.weight(.medium))
            ScrollView {
                VStack(spacing: 8) {
                    ForEach(store.state.bots) { bot in
                        Button {
                            if selected.contains(bot.id) { selected.remove(bot.id) } else { selected.insert(bot.id) }
                        } label: {
                            HStack(spacing: 10) {
                                DesktopMascotView(bot: bot, size: 40).accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(bot.name).font(.body.weight(.medium))
                                    Text(bot.role).font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: selected.contains(bot.id) ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 19)).foregroundStyle(selected.contains(bot.id) ? StudioPalette.ink : StudioPalette.muted)
                            }
                            .padding(12)
                            .background(selected.contains(bot.id) ? StudioPalette.surface : StudioPalette.paper,
                                        in: RoundedRectangle(cornerRadius: 16))
                            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(StudioPalette.line))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(bot.name), \(bot.role)")
                        .accessibilityValue(selected.contains(bot.id) ? "Included" : "Not included")
                        .accessibilityAddTraits(selected.contains(bot.id) ? .isSelected : [])
                        .disabled(saving || (selected.count >= 6 && !selected.contains(bot.id)))
                    }
                }
            }.frame(maxHeight: 280)
            if let error = store.errorMessage {
                Text(error).font(.callout).foregroundStyle(.secondary).textSelection(.enabled)
            }
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }.buttonStyle(.bordered).keyboardShortcut(.cancelAction).disabled(saving)
                Button(thread == nil ? "Create group" : "Save group") {
                    saving = true
                    Task {
                        if await store.saveGroup(id: thread?.id, title: title, botIDs: Array(selected)) { dismiss() }
                        saving = false
                    }
                }
                .buttonStyle(.borderedProminent).tint(StudioPalette.accent)
                .disabled(saving || StudioGroupInput(title: title, botIDs: Array(selected)) == nil)
            }
        }
        .padding(28).frame(width: 490)
        .background(StudioPalette.paper)
        .buttonBorderShape(.capsule).controlSize(.large)
        .onAppear {
            title = thread?.title ?? ""
            selected = Set(thread?.botIds ?? [])
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
    @State private var showingProviders = false

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
        _computerEnabled = State(initialValue: bot?.computerEnabled ?? false)
        _browserEnabled = State(initialValue: bot?.browserEnabled ?? false)
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
                        .font(.system(size: 20, weight: .bold, design: .default))
                    Text("Personality is guidance. Permissions and token limits are enforced separately.")
                        .font(.system(size: 10.5, design: .default)).foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(20).background(StudioPalette.paper)
            Divider().opacity(0.55)

            ScrollView {
                VStack(alignment: .leading, spacing: 15) {
                    HStack(spacing: 12) {
                        editorField("Name") { TextField("Nova", text: $name).textFieldStyle(.roundedBorder) }
                        editorField("Role") { TextField("Researcher", text: $role).textFieldStyle(.roundedBorder) }
                    }
                    editorField("How should this teammate work?") {
                        TextEditor(text: $instructions).font(.system(size: 12.5, design: .default)).frame(height: 105)
                            .padding(7).background(StudioPalette.paper, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(StudioPalette.line))
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
                                Text("Choose a provider").tag("")
                                ForEach(providers) { Text($0.name).tag($0.id) }
                            }.labelsHidden().onChange(of: providerID) { _, _ in model = "" }
                        }
                        editorField("Model") {
                            Picker("Model", selection: $model) {
                                Text("Choose a model").tag("")
                                ForEach(models, id: \.self) { Text($0).tag($0) }
                            }.labelsHidden()
                        }
                    }
                    Button(providers.isEmpty ? "Connect your AI to get started" : "Manage AI connections") { showingProviders = true }
                        .buttonStyle(.plain).font(.system(size: 12)).foregroundStyle(.secondary)

                    HStack(spacing: 20) {
                        Toggle("Private computer", isOn: $computerEnabled).toggleStyle(.switch)
                        Toggle("Private browser", isOn: $browserEnabled).toggleStyle(.switch)
                    }.controlSize(.small)
                    editorField("Weekly token budget") {
                        HStack {
                            TextField("0", value: $weeklyBudget, format: .number).textFieldStyle(.roundedBorder).frame(width: 150)
                            Text(weeklyBudget <= 0 ? "No per-teammate cap" : "Stops new work after \(max(0, weeklyBudget).formatted()) tokens this week")
                                .font(.system(size: 10.5, design: .default)).foregroundStyle(.secondary)
                        }
                    }

                    if let error = store.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 11.5, weight: .semibold, design: .default)).foregroundStyle(Color.primary)
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
        }
        .sheet(isPresented: $showingProviders) { DesktopProvidersView(store: store).environment(\.desktopSettingsEmbedded, false) }
    }

    private var valid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !role.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !instructions.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty &&
        !providerID.isEmpty && !model.isEmpty && weeklyBudget >= 0
    }

    private func editorField<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 11, weight: .semibold, design: .default))
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
