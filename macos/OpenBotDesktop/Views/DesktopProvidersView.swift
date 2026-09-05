import AppKit
import SwiftUI

struct DesktopProvidersView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    @State private var mode = ProviderMode.accounts
    @State private var activeAttempt: StudioProviderLoginAttempt?
    @State private var signInCode = ""
    @State private var showingAPIForm = false
    @State private var editingAPIProvider: StudioProviderInstance?
    @State private var pendingDeleteAPIProvider: StudioProviderInstance?

    private enum ProviderMode: String, CaseIterable, Identifiable {
        case accounts = "Accounts & subscriptions"
        case api = "API & local models"
        var id: String { rawValue }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "cpu.fill").font(.system(size: 17, weight: .semibold)).foregroundStyle(DesktopTheme.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text("AI connections").font(.system(size: 17, weight: .bold, design: .rounded))
                    Text("Bring an account, API key, or a model running on your computer.")
                        .font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                }
                Spacer()
                Button { Task { await store.refreshProviders() } } label: { Image(systemName: "arrow.clockwise") }
                    .buttonStyle(.bordered).controlSize(.small).disabled(store.isCheckingProviders)
                Button("Done") { dismiss() }.buttonStyle(.bordered).controlSize(.small)
            }
            .padding(.horizontal, 18).padding(.vertical, 13).background(.ultraThinMaterial)
            Divider().opacity(0.55)

            Picker("Connection type", selection: $mode) {
                ForEach(ProviderMode.allCases) { item in Text(item.rawValue).tag(item) }
            }
            .pickerStyle(.segmented).padding(.horizontal, 20).padding(.top, 18)

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let error = store.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 11.5, weight: .semibold, design: .rounded)).foregroundStyle(.orange)
                    }
                    if store.providerStatus == nil && store.isCheckingProviders {
                        ProgressView("Checking your connections…").frame(maxWidth: .infinity).padding(.vertical, 80)
                    } else if mode == .accounts {
                        accounts
                    } else {
                        apiConnections
                    }
                    if store.providerStatus != nil {
                        Divider().padding(.vertical, 4)
                        teammateAssignments
                    }
                }
                .padding(20)
            }
        }
        .frame(width: 760, height: 660)
        .background(DesktopTheme.paper)
        .task { await store.refreshProviders() }
        .sheet(isPresented: $showingAPIForm) { DesktopAPIProviderForm(store: store) }
        .sheet(item: $editingAPIProvider) { provider in DesktopAPIProviderForm(store: store, existing: provider) }
        .confirmationDialog(
            "Remove this model connection?",
            isPresented: Binding(get: { pendingDeleteAPIProvider != nil }, set: { if !$0 { pendingDeleteAPIProvider = nil } }),
            titleVisibility: .visible
        ) {
            if let provider = pendingDeleteAPIProvider {
                Button("Remove \(provider.name)", role: .destructive) {
                    pendingDeleteAPIProvider = nil
                    Task { _ = await store.deleteAPIProvider(provider.id) }
                }
            }
            Button("Cancel", role: .cancel) { pendingDeleteAPIProvider = nil }
        } message: {
            Text("The saved endpoint and encrypted key will be removed. OpenBot refuses this action while any teammate still uses the connection.")
        }
        .task(id: activeAttempt?.id) {
            guard activeAttempt?.status == "waiting" else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2))
                await store.refreshProviders()
                if let refreshed = currentAttempt { activeAttempt = refreshed }
                if currentAttempt?.status != "waiting" { return }
            }
        }
    }

    private var currentAttempt: StudioProviderLoginAttempt? {
        guard let activeAttempt else { return nil }
        return store.providerStatus?.loginAttempts.first(where: { $0.id == activeAttempt.id }) ?? activeAttempt
    }

    @ViewBuilder private var accounts: some View {
        if let status = store.providerStatus {
            ForEach(status.catalog.filter { $0.id != "opencode" }) { provider in
                providerRow(provider)
            }
            if let attempt = currentAttempt, attempt.status != "connected" {
                VStack(alignment: .leading, spacing: 9) {
                    Label(attempt.status == "failed" ? "Sign-in wasn’t completed" : "Finish signing in", systemImage: attempt.status == "failed" ? "exclamationmark.circle.fill" : "person.crop.circle.badge.clock")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                    Text(attempt.error ?? attempt.instructions)
                        .font(.system(size: 11.5, design: .rounded)).foregroundStyle(.secondary)
                    if let rawURL = attempt.url, let url = URL(string: rawURL), url.scheme == "https" {
                        Button("Open sign-in page") { NSWorkspace.shared.open(url) }.buttonStyle(.bordered)
                    }
                    if attempt.status == "waiting", attempt.callbackMode == "code" {
                        HStack {
                            TextField("Paste sign-in code", text: $signInCode).textFieldStyle(.roundedBorder)
                            Button("Finish") {
                                let clean = signInCode.trimmingCharacters(in: .whitespacesAndNewlines)
                                Task {
                                    if await store.finishProviderConnection(attempt.id, code: clean) {
                                        signInCode = ""
                                        activeAttempt = nil
                                    }
                                }
                            }
                            .buttonStyle(.borderedProminent).tint(DesktopTheme.purple)
                            .disabled(signInCode.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isCheckingProviders)
                        }
                    }
                }
                .padding(14).background(DesktopTheme.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            }
            Text("OpenBot uses the provider runtime installed on the computer hosting your private runner. Your plan, provider rules, and usage limits still apply.")
                .font(.system(size: 10.5, weight: .medium, design: .rounded)).foregroundStyle(.secondary).padding(.top, 3)
        } else if !store.isCheckingProviders {
            Text("OpenBot could not read provider status.").foregroundStyle(.secondary)
        }
    }

    private func providerRow(_ provider: StudioProviderCatalogEntry) -> some View {
        HStack(spacing: 13) {
            ZStack {
                RoundedRectangle(cornerRadius: 13, style: .continuous).fill(provider.connected ? DesktopTheme.green.opacity(0.12) : DesktopTheme.purple.opacity(0.09))
                Image(systemName: providerSymbol(provider.id)).font(.system(size: 18, weight: .semibold)).foregroundStyle(provider.connected ? DesktopTheme.green : DesktopTheme.purple)
            }.frame(width: 46, height: 46)
            VStack(alignment: .leading, spacing: 4) {
                Text(provider.name).font(.system(size: 14.5, weight: .bold, design: .rounded))
                Text(provider.connected ? "Ready on this host" : provider.installed ? provider.badge : "Provider runtime needs setup")
                    .font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                Text(provider.description).font(.system(size: 10.5, design: .rounded)).foregroundStyle(.tertiary).lineLimit(2)
            }
            Spacer(minLength: 12)
            if provider.connected {
                Label("Ready", systemImage: "checkmark.circle.fill").font(.system(size: 11, weight: .bold, design: .rounded)).foregroundStyle(DesktopTheme.green)
            } else if provider.canConnect {
                Button("Connect") {
                    Task {
                        guard let attempt = await store.beginProviderConnection(provider.id) else { return }
                        activeAttempt = attempt
                        if let rawURL = attempt.url, let url = URL(string: rawURL), url.scheme == "https" { NSWorkspace.shared.open(url) }
                    }
                }
                .buttonStyle(.borderedProminent).tint(DesktopTheme.purple).controlSize(.small)
                .disabled(store.isCheckingProviders)
            } else {
                Text(provider.installed ? "Setup needed" : "Install runtime")
                    .font(.system(size: 10.5, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
            }
        }
        .padding(14).background(.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(.black.opacity(0.055)))
    }

    @ViewBuilder private var apiConnections: some View {
        if let saved = store.providerStatus?.instances.filter({ $0.authMode == "api_key" }), !saved.isEmpty {
            ForEach(saved) { provider in
                HStack(spacing: 13) {
                    Image(systemName: "server.rack").font(.system(size: 18, weight: .semibold)).foregroundStyle(DesktopTheme.purple).frame(width: 42, height: 42)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(provider.name).font(.system(size: 14, weight: .bold, design: .rounded))
                        Text(provider.apiConfig?.baseUrl ?? "API-key connection").font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(1)
                        Text("\(provider.apiConfig?.modelIds.count ?? provider.models?.count ?? 0) models · key stored by your private runner")
                            .font(.system(size: 9.5, design: .rounded)).foregroundStyle(.tertiary)
                    }
                    Spacer()
                    Menu {
                        Button("Edit") { editingAPIProvider = provider }
                        Divider()
                        Button("Remove", role: .destructive) { pendingDeleteAPIProvider = provider }
                    } label: { Image(systemName: "ellipsis.circle") }
                    .menuStyle(.borderlessButton).fixedSize()
                }
                .padding(14).background(.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(.black.opacity(0.055)))
            }
        }
        Button { showingAPIForm = true } label: { Label("Add API or local model", systemImage: "plus") }
            .buttonStyle(.borderedProminent).tint(DesktopTheme.purple)
        Text("Hosted services require an API key. Localhost connections can run without one and always refer to the computer hosting OpenBot.")
            .font(.system(size: 10.5, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
    }

    private func providerSymbol(_ id: String) -> String {
        switch id {
        case "claude": return "c.square.fill"
        case "openai": return "circle.hexagongrid.fill"
        case "github-copilot": return "chevron.left.forwardslash.chevron.right"
        case "gitlab": return "point.3.filled.connected.trianglepath.dotted"
        case "xai": return "xmark"
        default: return "sparkles"
        }
    }

    private var teammateAssignments: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Teammate models").font(.system(size: 14, weight: .bold, design: .rounded))
            Text("Every teammate can use a different connection and model.")
                .font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary)
            ForEach(store.state.bots) { bot in
                HStack(spacing: 9) {
                    DesktopMascotView(bot: bot, size: 30).frame(width: 33, height: 33)
                    Text(bot.name).font(.system(size: 12, weight: .semibold, design: .rounded)).frame(width: 82, alignment: .leading)
                    Picker("Connection for \(bot.name)", selection: Binding(
                        get: { bot.providerInstanceId ?? "" },
                        set: { connectionID in
                            guard let connection = store.providerStatus?.instances.first(where: { $0.id == connectionID }),
                                  let model = connection.defaultModel ?? connection.models?.first else { return }
                            Task { await store.setBotProvider(bot.id, providerInstanceID: connectionID, model: model) }
                        }
                    )) {
                        Text("Choose connection").tag("")
                        ForEach(store.providerStatus?.instances.filter { !($0.models ?? []).isEmpty } ?? []) { connection in
                            Text(connection.name).tag(connection.id)
                        }
                    }
                    .labelsHidden().frame(width: 190).disabled(store.isCheckingProviders)

                    let selectedConnection = store.providerStatus?.instances.first(where: { $0.id == bot.providerInstanceId })
                    Picker("Model for \(bot.name)", selection: Binding(
                        get: { bot.model ?? "" },
                        set: { model in
                            guard let connectionID = bot.providerInstanceId, !model.isEmpty else { return }
                            Task { await store.setBotProvider(bot.id, providerInstanceID: connectionID, model: model) }
                        }
                    )) {
                        ForEach(selectedConnection?.models ?? [], id: \.self) { model in Text(modelLabel(model)).tag(model) }
                    }
                    .labelsHidden().frame(maxWidth: .infinity).disabled(selectedConnection == nil || store.isCheckingProviders)
                }
            }
        }
        .padding(14).background(.white.opacity(0.72), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(.black.opacity(0.055)))
    }

    private func modelLabel(_ model: String) -> String {
        model.split(separator: "/").last.map(String.init) ?? model
    }
}

private struct DesktopAPIProviderForm: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    let existing: StudioProviderInstance?
    @State private var preset = APIPreset.openAI
    @State private var name = APIPreset.openAI.name
    @State private var baseURL = APIPreset.openAI.baseURL
    @State private var protocolName = APIPreset.openAI.protocolName
    @State private var modelIDs = ""
    @State private var secret = ""

    init(store: StudioStore, existing: StudioProviderInstance? = nil) {
        self.store = store
        self.existing = existing
        _preset = State(initialValue: existing == nil ? .openAI : .custom)
        _name = State(initialValue: existing?.name ?? APIPreset.openAI.name)
        _baseURL = State(initialValue: existing?.apiConfig?.baseUrl ?? APIPreset.openAI.baseURL)
        _protocolName = State(initialValue: existing?.apiConfig?.protocol ?? APIPreset.openAI.protocolName)
        _modelIDs = State(initialValue: existing?.apiConfig?.modelIds.joined(separator: "\n") ?? "")
    }

    private enum APIPreset: String, CaseIterable, Identifiable {
        case openAI = "OpenAI API"
        case anthropic = "Anthropic API"
        case openRouter = "OpenRouter"
        case ollama = "Ollama"
        case lmStudio = "LM Studio"
        case custom = "Other compatible provider"
        var id: String { rawValue }
        var name: String { rawValue }
        var baseURL: String {
            switch self {
            case .openAI: return "https://api.openai.com/v1"
            case .anthropic: return "https://api.anthropic.com/v1"
            case .openRouter: return "https://openrouter.ai/api/v1"
            case .ollama: return "http://127.0.0.1:11434/v1"
            case .lmStudio: return "http://127.0.0.1:1234/v1"
            case .custom: return ""
            }
        }
        var protocolName: String {
            switch self {
            case .openAI: return "openai"
            case .anthropic: return "anthropic"
            default: return "openai-compatible"
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 15) {
            Text(existing == nil ? "Add a model connection" : "Edit model connection").font(.system(size: 20, weight: .bold, design: .rounded))
            Text(existing == nil ? "The key goes directly to your private OpenBot runner and is never returned to this app." : "Leave the key empty to keep the encrypted key already stored by your runner.")
                .font(.system(size: 11.5, design: .rounded)).foregroundStyle(.secondary)
            field("Provider") {
                Picker("Provider", selection: $preset) { ForEach(APIPreset.allCases) { Text($0.rawValue).tag($0) } }
                    .labelsHidden().onChange(of: preset) { _, value in
                        name = value.name; baseURL = value.baseURL; protocolName = value.protocolName; modelIDs = ""; secret = ""
                    }
            }
            field("Connection name") { TextField("My model provider", text: $name).textFieldStyle(.roundedBorder) }
            field("API address") { TextField("https://provider.example/v1", text: $baseURL).textFieldStyle(.roundedBorder) }
            field("Protocol") {
                Picker("Protocol", selection: $protocolName) {
                    Text("OpenAI compatible").tag("openai-compatible")
                    Text("OpenAI").tag("openai")
                    Text("Anthropic").tag("anthropic")
                }.labelsHidden()
            }
            field("Exact model IDs") {
                TextEditor(text: $modelIDs).font(.system(size: 12, design: .monospaced)).frame(height: 70)
                    .padding(6).background(.white, in: RoundedRectangle(cornerRadius: 8)).overlay(RoundedRectangle(cornerRadius: 8).stroke(.black.opacity(0.10)))
            }
            field(isLocal ? "API key (optional for local models)" : "API key") { SecureField("Stored encrypted by OpenBot", text: $secret).textFieldStyle(.roundedBorder) }
            if let error = store.errorMessage {
                Label(error, systemImage: "exclamationmark.circle.fill").font(.system(size: 11, weight: .semibold, design: .rounded)).foregroundStyle(.orange)
            }
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }.buttonStyle(.bordered)
                Button(existing == nil ? "Save connection" : "Save changes") {
                    Task {
                        if await store.saveAPIProvider(id: existing?.id, name: cleanName, baseURL: cleanURL, protocolName: protocolName, modelIDs: parsedModels, secret: secret.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty) { dismiss() }
                    }
                }
                .buttonStyle(.borderedProminent).tint(DesktopTheme.purple)
                .disabled(!canSave || store.isCheckingProviders)
            }
        }
        .padding(22).frame(width: 560, height: 610).background(DesktopTheme.paper)
    }

    private var cleanName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var cleanURL: String { baseURL.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var parsedModels: [String] {
        var seen = Set<String>()
        return modelIDs.components(separatedBy: CharacterSet(charactersIn: ",\n"))
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && seen.insert($0).inserted }
    }
    private var isLocal: Bool { URL(string: cleanURL).map { ["localhost", "127.0.0.1", "::1"].contains($0.host ?? "") } == true }
    private var canSave: Bool {
        guard !cleanName.isEmpty, !parsedModels.isEmpty, let url = URL(string: cleanURL), url.user == nil, url.password == nil, url.query == nil, url.fragment == nil else { return false }
        let safeAddress = url.scheme == "https" || (url.scheme == "http" && isLocal)
        return safeAddress && (isLocal || existing?.hasSecret == true || !secret.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
    }

    private func field<Content: View>(_ label: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(label).font(.system(size: 11, weight: .semibold, design: .rounded))
            content()
        }
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
