import SwiftUI
import UIKit

struct NativeTeamView: View {
    @ObservedObject var store: StudioStore
    @Environment(\.dismiss) private var dismiss
    @State private var editing: StudioBot?
    @State private var showingEditor = false
    @State private var showingGroup = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("A little personality. A lot of help.").font(.subheadline).foregroundStyle(StudioPalette.muted).padding(.bottom, 24)
                    ForEach(store.state.bots) { bot in
                        Button { editing = bot; showingEditor = true } label: {
                            HStack(spacing: 16) {
                                StudioCharacter(colorHex: bot.color, variant: bot.mascot, status: bot.status, size: 48, seed: bot.id)
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(bot.name).font(.system(size: 16, weight: .semibold))
                                    Text(bot.role).font(.system(size: 14)).foregroundStyle(StudioPalette.muted)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(StudioPalette.muted)
                            }.padding(.vertical, 20).contentShape(Rectangle())
                        }.buttonStyle(.plain).overlay(alignment: .bottom) { Rectangle().fill(StudioPalette.line).frame(height: 1) }
                    }
                    Button("New project room", systemImage: "person.2") { showingGroup = true }
                        .padding(.top, 28).disabled(store.state.bots.isEmpty)
                    if let error = store.errorMessage { Text(error).font(.callout).padding(.top, 20) }
                }.padding(24)
            }.background(StudioPalette.paper).navigationTitle("Your team").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                    ToolbarItem(placement: .primaryAction) { Button { editing = nil; showingEditor = true } label: { Image(systemName: "plus") }.accessibilityLabel("New teammate") }
                }
        }.tint(StudioPalette.ink)
            .sheet(isPresented: $showingEditor) { NativeTeammateEditor(store: store, bot: editing) }
            .sheet(isPresented: $showingGroup) { NativeGroupEditor(store: store) }
    }
}

private struct NativeTeammateEditor: View {
    @ObservedObject var store: StudioStore
    let bot: StudioBot?
    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var role: String
    @State private var instructions: String
    @State private var mascot: String
    @State private var color: Color
    @State private var provider: String
    @State private var model: String
    @State private var computer: Bool
    @State private var browser: Bool
    @State private var budget: Int
    @State private var saving = false
    @State private var showingAI = false

    init(store: StudioStore, bot: StudioBot?) {
        self.store = store; self.bot = bot
        _name = State(initialValue: bot?.name ?? "")
        _role = State(initialValue: bot?.role ?? "")
        _instructions = State(initialValue: bot?.instructions ?? "")
        _mascot = State(initialValue: bot?.mascot ?? "blob")
        let hex = UInt32((bot?.color ?? "#7768CD").replacingOccurrences(of: "#", with: ""), radix: 16) ?? 0x7768CD
        _color = State(initialValue: Color(red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255))
        _provider = State(initialValue: bot?.providerInstanceId ?? "")
        _model = State(initialValue: bot?.model ?? "")
        _computer = State(initialValue: bot?.computerEnabled ?? false)
        _browser = State(initialValue: bot?.browserEnabled ?? false)
        _budget = State(initialValue: bot?.weeklyTokenBudget ?? 0)
    }
    private var colorHex: String {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        UIColor(color).getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return String(format: "#%02X%02X%02X", Int(red * 255), Int(green * 255), Int(blue * 255))
    }
    private var valid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !role.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !instructions.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !provider.isEmpty && !model.isEmpty && budget >= 0
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    StudioCharacter(colorHex: colorHex, variant: mascot, size: 88, seed: bot?.id ?? "preview")
                        .frame(maxWidth: .infinity).padding(.vertical, 10)
                    field("Name") { TextField("What should we call them?", text: $name) }
                    field("Role") { TextField("For example, project partner", text: $role) }
                    field("How should they help?") { TextField("Describe their purpose and how you like to work.", text: $instructions, axis: .vertical).lineLimit(3...7) }
                    HStack {
                        Picker("Shape", selection: $mascot) {
                            ForEach(["nova", "blob", "sprout", "orbit", "pebble", "sunny"], id: \.self) { Text($0.capitalized).tag($0) }
                        }
                        Spacer()
                        ColorPicker("Color", selection: $color, supportsOpacity: false).fixedSize()
                    }
                    DisclosureGroup("AI & permissions") {
                        VStack(alignment: .leading, spacing: 18) {
                            Picker("Provider", selection: $provider) {
                                Text("Choose a provider").tag("")
                                ForEach(store.providerStatus?.instances ?? []) { Text($0.name).tag($0.id) }
                            }.onChange(of: provider) { _, _ in model = "" }
                            Picker("Model", selection: $model) {
                                Text("Choose a model").tag("")
                                ForEach(store.providerStatus?.instances.first { $0.id == provider }?.models ?? [], id: \.self) { Text($0).tag($0) }
                            }
                            Button("Manage AI providers") { showingAI = true }
                            Toggle("Private browser", isOn: $browser)
                            Toggle("Private computer", isOn: $computer)
                            TextField("Weekly token budget", value: $budget, format: .number).keyboardType(.numberPad)
                            Text("A budget of 0 has no per-teammate cap. Account limits and approval rules still apply.").font(.caption).foregroundStyle(StudioPalette.muted)
                        }.padding(.top, 18)
                    }
                    if provider.isEmpty || model.isEmpty { Text("Choose an AI provider and model in AI & permissions before saving.").font(.footnote).foregroundStyle(StudioPalette.muted) }
                    if let error = store.errorMessage { Text(error).font(.callout) }
                }.padding(24)
            }.background(StudioPalette.paper)
                .navigationTitle(bot == nil ? "New teammate" : "Edit teammate").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
                    ToolbarItem(placement: .confirmationAction) {
                        Button(saving ? "Saving…" : "Save") {
                            saving = true
                            Task {
                                if await store.saveBot(id: bot?.id, name: name.trimmingCharacters(in: .whitespacesAndNewlines), emoji: bot?.emoji ?? "🤖", mascot: mascot, color: colorHex, role: role.trimmingCharacters(in: .whitespacesAndNewlines), instructions: instructions.trimmingCharacters(in: .whitespacesAndNewlines), providerInstanceID: provider, model: model, computerEnabled: computer, browserEnabled: browser, weeklyTokenBudget: budget) { dismiss() }
                                saving = false
                            }
                        }.disabled(!valid || saving)
                    }
                }
        }.tint(StudioPalette.ink).task { await store.refreshProviders() }
            .sheet(isPresented: $showingAI) { NativeAIChoiceView(store: store) }
    }
    private func field<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.system(size: 13, weight: .medium))
            content().textFieldStyle(.plain).padding(14).studioOutline()
        }
    }
}

private struct NativeGroupEditor: View {
    @ObservedObject var store: StudioStore
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var selected = Set<String>()
    @State private var saving = false
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    TextField("Room name", text: $name).padding(14).studioOutline()
                    Text("Bring up to six teammates together.").font(.subheadline).foregroundStyle(StudioPalette.muted)
                    ForEach(store.state.bots) { bot in
                        Button {
                            if selected.contains(bot.id) { selected.remove(bot.id) } else { selected.insert(bot.id) }
                        } label: {
                            HStack(spacing: 14) {
                                StudioCharacter(colorHex: bot.color, variant: bot.mascot, size: 38, seed: bot.id)
                                Text(bot.name); Spacer()
                                Image(systemName: selected.contains(bot.id) ? "checkmark.circle.fill" : "circle")
                            }.padding(.vertical, 8).contentShape(Rectangle())
                        }.buttonStyle(.plain).disabled(saving || (selected.count >= 6 && !selected.contains(bot.id)))
                            .accessibilityAddTraits(selected.contains(bot.id) ? .isSelected : [])
                    }
                    if let error = store.errorMessage { Text(error).font(.callout) }
                }.padding(24)
            }.background(StudioPalette.paper).navigationTitle("New project room").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Create") { saving = true; Task { if await store.saveGroup(title: name, botIDs: Array(selected)) { dismiss() }; saving = false } }
                            .disabled(saving || StudioGroupInput(title: name, botIDs: Array(selected)) == nil)
                    }
                }
        }.tint(StudioPalette.ink)
    }
}
