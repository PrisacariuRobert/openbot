import SwiftUI
import UniformTypeIdentifiers
import QuickLook
import UIKit

struct StudioContainerView: View {
    @EnvironmentObject private var session: ConnectionSession
    @EnvironmentObject private var push: PushRegistration
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var store: StudioStore
    @StateObject private var network = NetworkMonitor()
    @State private var showingThreads = false
    @State private var showingWork = false
    @State private var showingLiveStudio = false
    @State private var showingSettings = false
    @State private var showingExtensions = false
    @State private var showingSettingsMenu = false
    @State private var showingAI = false
    @State private var showingAutomations = false
    @State private var showingConversation = false
    @State private var showingTeam = false
    @State private var showingDetails = false

    init(url: URL) {
        _store = StateObject(wrappedValue: StudioStore(serverURL: url))
    }

    var body: some View {
        NavigationStack {
            ZStack {
            VStack(spacing: 0) {
                StudioHeader(
                    title: store.activeThread?.title ?? "The studio",
                    bots: store.activeThread?.members(in: store.state.bots) ?? [],
                    isLive: network.isOnline && store.isLive,
                    isPrivateHome: store.state.runner?.deployment?.mode == "private_runner",
                    onThreads: {
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                        showingConversation = false
                    },
                    onWork: { showingWork = true },
                    onLiveStudio: { showingLiveStudio = true },
                    onSettings: { showingDetails = true }
                )
                Divider().opacity(0.55)
                if store.isLoading {
                    NativeLoadingView()
                } else {
                    NativeConversationView(store: store, onReviewActivity: { showingLiveStudio = true })
                }
            }
            .background(OpenBotTheme.paper.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .opacity(showingConversation ? 1 : 0).allowsHitTesting(showingConversation).accessibilityHidden(!showingConversation)
            if !showingConversation {
                NativeConversationList(store: store, onSelect: { id in
                    showingConversation = true
                    Task { await store.chooseThread(id) }
                }, onSettings: { showingSettingsMenu = true }, onTeam: { showingTeam = true }, onActivity: { showingLiveStudio = true })
                    .toolbar(.hidden, for: .navigationBar)
            }
            }
        }
        .task {
            await store.start()
            // The conversation is the app. Choosing an AI connection is a quiet
            // follow-up in the composer, not a boot gate.
            await openRequestedThread()
            await store.importSharedInbox()
        }
        .onDisappear { store.stop() }
        .onChange(of: store.needsAuthentication) { _, expired in
            if expired { session.sessionExpired() }
        }
        .onChange(of: session.requestedThreadID) { _, _ in
            Task { await openRequestedThread() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { store.stop(); return }
            guard phase == .active else { return }
            Task {
                await store.start()
                await store.importSharedInbox()
            }
        }
        .onChange(of: network.isOnline) { _, online in
            guard online, scenePhase == .active else { return }
            Task { await store.start() }
        }
        .sheet(isPresented: $showingThreads) {
            ThreadPickerView(store: store) { id in
                showingThreads = false
                Task { await store.chooseThread(id) }
            }
        }
        .sheet(isPresented: $showingWork) {
            NativeWorkView(store: store)
        }
        .sheet(isPresented: $showingLiveStudio) {
            NativeLiveStudioView(store: store) { threadID in
                showingLiveStudio = false
                showingConversation = true
                Task { await store.chooseThread(threadID) }
            }
        }
        .sheet(isPresented: $showingSettings) { ConnectionSettingsView() }
        .sheet(isPresented: $showingExtensions) { OpenExtensionsView(store: store) }
        .sheet(isPresented: $showingAI) { NativeAIChoiceView(store: store) }
        .sheet(isPresented: $showingAutomations) { ScheduledRoutinesView(store: store) }
        .sheet(isPresented: $showingSettingsMenu) { NativeSettingsCenter(store: store) }
        .sheet(isPresented: $showingTeam) { NativeTeamView(store: store) }
        .sheet(isPresented: $showingDetails) {
            NativeConversationDetails(store: store,
                onRoutines: { showingDetails = false; showingAutomations = true },
                onTeam: { showingDetails = false; showingTeam = true },
                onWork: { showingDetails = false; showingWork = true },
                onActivity: { showingDetails = false; showingLiveStudio = true })
        }
    }

    private func openRequestedThread() async {
        guard let threadID = session.requestedThreadID,
              store.state.threads.contains(where: { $0.id == threadID }) else { return }
        await store.chooseThread(threadID)
        showingConversation = true
        session.consumeRequestedThread()
    }
}

struct NativeAIChoiceView: View {
    @ObservedObject var store: StudioStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var providerID = ""
    @State private var model = ""
    @State private var attempt: StudioProviderLoginAttempt?
    @State private var code = ""
    @State private var adding = false
    @State private var useAPI = false
    @State private var selectedCatalog = ""
    @State private var apiName = ""
    @State private var apiURL = ""
    @State private var apiProtocol = "openai-compatible"
    @State private var apiModel = ""
    @State private var apiKey = ""

    private var chosen: StudioProviderInstance? { store.providerStatus?.instances.first { $0.id == providerID } }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text(adding ? "Choose how you want to connect." : "The AI your teammates work with.")
                        .font(.subheadline).foregroundStyle(StudioPalette.muted)
                    if adding {
                        Picker("Connection type", selection: $useAPI) {
                            Text("Account").tag(false); Text("API or local").tag(true)
                        }.pickerStyle(.segmented)
                        if useAPI { apiFields } else { accounts }
                    } else {
                        overview
                        DisclosureGroup("Models by teammate") { assignments.padding(.top, 16) }
                            .font(.system(size: 14))
                        if store.state.bots.contains(where: { ($0.providerInstanceId ?? "").isEmpty }) {
                            Text("Some teammates still need a model. Choose one in Models by teammate.")
                                .font(.footnote).foregroundStyle(StudioPalette.muted)
                        }
                    }
                    if let error = store.errorMessage { Text(error).font(.callout) }
                    Button("Refresh connections") { Task { await store.refreshProviders() } }
                        .font(.footnote).foregroundStyle(StudioPalette.muted).disabled(store.isCheckingProviders)
                }.padding(24)
            }.background(StudioPalette.paper)
                .navigationTitle(adding ? "Add a provider" : "AI providers").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button(adding ? "Back" : "Done") { if adding { adding = false } else { dismiss() } } }
                    if !adding { ToolbarItem(placement: .primaryAction) { Button { adding = true } label: { Image(systemName: "plus") }.accessibilityLabel("Add provider") } }
                }
        }.tint(StudioPalette.ink)
            .task { await store.refreshProviders() }
            .task(id: attempt?.id) {
                guard let id = attempt?.id, attempt?.status == "waiting" else { return }
                while !Task.isCancelled {
                    do { try await Task.sleep(for: .seconds(2)) } catch { return }
                    await store.refreshProviders()
                    if let updated = store.providerStatus?.loginAttempts.first(where: { $0.id == id }) {
                        attempt = updated
                        if updated.status != "waiting" { return }
                    }
                }
            }
    }

    @ViewBuilder private var overview: some View {
        let connections = store.providerStatus?.instances ?? []
        if connections.isEmpty {
            if store.isCheckingProviders { ProgressView("Checking your connections…") }
            else {
                Text("Choose the AI that works for you. Nothing is selected automatically.")
                    .font(.callout).foregroundStyle(StudioPalette.muted)
            }
        } else {
            VStack(spacing: 0) {
                ForEach(connections) { connection in
                    HStack(spacing: 16) {
                        StudioBrandMark(provider: connection.provider)
                        VStack(alignment: .leading, spacing: 5) {
                            Text(connection.name).font(.system(size: 16, weight: .medium))
                            Text(connection.connectionLabel)
                                .font(.system(size: 13)).foregroundStyle(StudioPalette.muted)
                        }
                        Spacer()
                        Image(systemName: connection.connected == true ? "checkmark" : "exclamationmark.circle")
                            .font(.system(size: 13)).foregroundStyle(StudioPalette.muted)
                    }.padding(.vertical, 22)
                        .overlay(alignment: .bottom) { Rectangle().fill(StudioPalette.line).frame(height: 1) }
                }
            }
        }
    }

    private var accounts: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(store.providerStatus?.catalog.filter { $0.id != "opencode" } ?? []) { entry in
                Button { selectedCatalog = entry.id } label: {
                    HStack(spacing: 16) {
                        StudioBrandMark(provider: entry.id)
                        VStack(alignment: .leading, spacing: 5) {
                            Text(entry.name).font(.system(size: 15, weight: .medium))
                            Text(entry.connected ? "Sign-in found" : entry.badge).font(.system(size: 12)).foregroundStyle(StudioPalette.muted)
                        }
                        Spacer()
                        Image(systemName: selectedCatalog == entry.id ? "checkmark.circle.fill" : "circle").font(.system(size: 19))
                    }.padding(14).background(selectedCatalog == entry.id ? StudioPalette.surface : .clear, in: RoundedRectangle(cornerRadius: 12))
                }.buttonStyle(.plain).accessibilityAddTraits(selectedCatalog == entry.id ? .isSelected : [])
            }
            if let entry = store.providerStatus?.catalog.first(where: { $0.id == selectedCatalog }) {
                Text(entry.description).font(.callout).foregroundStyle(StudioPalette.muted)
                if !entry.connected && entry.canConnect {
                    Button("Connect \(entry.name)") {
                        Task {
                            attempt = await store.beginProviderConnection(entry.id)
                            if let raw = attempt?.url, let url = URL(string: raw), url.scheme == "https" { openURL(url) }
                        }
                    }.buttonStyle(.borderedProminent).disabled(store.isCheckingProviders)
                } else if entry.connected {
                    Text("Sign-in found. Choose a model in Models by teammate.").font(.footnote).foregroundStyle(StudioPalette.muted)
                } else {
                    Text("Set up this provider’s runtime on your Mac, or use an API connection.").font(.footnote).foregroundStyle(StudioPalette.muted)
                }
            }
            if let attempt {
                Text(attempt.error ?? attempt.instructions).font(.footnote)
                if let raw = attempt.url, let url = URL(string: raw), url.scheme == "https" { Link("Reopen sign-in", destination: url) }
                if attempt.status == "waiting" && attempt.callbackMode == "code" {
                    TextField("Sign-in code", text: $code).textInputAutocapitalization(.never).autocorrectionDisabled().padding(14).studioOutline()
                    Button("Finish sign-in") {
                        Task { if await store.finishProviderConnection(attempt.id, code: code) { self.attempt = nil; code = ""; adding = false } }
                    }.disabled(code.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || store.isCheckingProviders)
                }
            }
            Text("Your subscription, provider rules, and usage limits still apply.")
                .font(.footnote).foregroundStyle(StudioPalette.muted)
        }
    }

    private var assignments: some View {
        VStack(alignment: .leading, spacing: 18) {
            Picker("Provider", selection: $providerID) {
                Text("Choose a provider").tag("")
                ForEach(store.providerStatus?.instances.filter { $0.connected == true } ?? []) { Text($0.name).tag($0.id) }
            }.onChange(of: providerID) { _, _ in model = "" }
            Picker("Model", selection: $model) {
                Text("Choose a model").tag("")
                ForEach(chosen?.models ?? [], id: \.self) { Text($0).tag($0) }
            }.disabled(chosen == nil)
            ForEach(store.state.bots) { bot in
                HStack {
                    Text(bot.name); Spacer()
                    Button("Use selected model") { Task { await store.setBotProvider(bot.id, providerInstanceID: providerID, model: model) } }
                        .disabled(model.isEmpty || chosen == nil || store.isCheckingProviders)
                }.font(.subheadline)
            }
            if store.state.bots.contains(where: { ($0.providerInstanceId ?? "").isEmpty }) {
                Button("Use for unconfigured teammates") { Task { await store.chooseInitialProvider(providerInstanceID: providerID, model: model) } }
                    .disabled(model.isEmpty || chosen == nil || store.isCheckingProviders)
            }
            Text("Other teammates keep their choices. OpenBot never silently switches providers.")
                .font(.footnote).foregroundStyle(StudioPalette.muted)
        }
    }

    private var apiFields: some View {
        VStack(alignment: .leading, spacing: 18) {
            TextField("Connection name", text: $apiName).padding(14).studioOutline()
            TextField("API address (https://…/v1)", text: $apiURL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled().padding(14).studioOutline()
            Picker("API format", selection: $apiProtocol) {
                Text("OpenAI compatible").tag("openai-compatible"); Text("OpenAI").tag("openai"); Text("Anthropic").tag("anthropic")
            }
            TextField("Exact model ID", text: $apiModel).textInputAutocapitalization(.never).autocorrectionDisabled().padding(14).studioOutline()
            SecureField("API key (optional for localhost)", text: $apiKey).textInputAutocapitalization(.never).autocorrectionDisabled().padding(14).studioOutline()
            Text("Localhost means the computer hosting OpenBot, not this iPhone.").font(.footnote).foregroundStyle(StudioPalette.muted)
            Button("Save connection") {
                Task {
                    if await store.saveAPIProvider(name: apiName, baseURL: apiURL, protocolName: apiProtocol, modelIDs: [apiModel], secret: apiKey.isEmpty ? nil : apiKey) {
                        apiKey = ""; adding = false
                    }
                }
            }.buttonStyle(.borderedProminent).disabled(apiName.isEmpty || apiURL.isEmpty || apiModel.isEmpty || store.isCheckingProviders)
        }
    }
}

private struct StudioHeader: View {
    let title: String
    let bots: [StudioBot]
    let isLive: Bool
    let isPrivateHome: Bool
    let onThreads: () -> Void
    let onWork: () -> Void
    let onLiveStudio: () -> Void
    let onSettings: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button(action: onThreads) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 17, weight: .medium))
                    .frame(width: 34, height: 40)
            }
            .accessibilityLabel("Open conversations")

            MascotStack(bots: bots).frame(width: bots.count > 1 ? 78 : 40, height: 42)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 17, weight: .semibold, design: .default))
                    .foregroundStyle(OpenBotTheme.ink)
                    .lineLimit(1)
                    .accessibilityIdentifier("studio-native-title")
                HStack(spacing: 5) {
                    Text(isLive ? (bots.count == 1 ? bots[0].role : "Your team, together") : "Reconnecting…")
                        .font(.system(size: 11.5, weight: .semibold, design: .default))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button(action: onSettings) {
                Image(systemName: "info.circle")
                    .font(.system(size: 18, weight: .bold))
                    .frame(width: 34, height: 40)
            }
            .accessibilityLabel("Conversation details")
        }
        .foregroundStyle(OpenBotTheme.ink)
        .padding(.horizontal, 10)
        .padding(.top, 6)
        .padding(.bottom, 8)
        .background(StudioPalette.paper)
    }
}

private struct NativeWorkView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.openURL) private var openURL
    @ObservedObject var store: StudioStore
    @State private var startingID: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 12) {
                        if dynamicTypeSize.isAccessibilitySize {
                            VStack(alignment: .leading, spacing: 12) {
                                workHeroCopy
                                workHeroMascots.frame(maxWidth: .infinity, alignment: .trailing)
                            }
                        } else {
                            HStack(alignment: .center, spacing: 14) {
                                workHeroCopy
                                Spacer(minLength: 0)
                                workHeroMascots
                            }
                        }
                    }
                    .padding(.vertical, 16)
                    Divider()

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Ready-made work")
                            .font(.title3.bold()).fontDesign(.rounded)
                            .accessibilityIdentifier("native-ready-made-work")
                        Text("Start here, then keep talking naturally in the team room.")
                            .font(.subheadline.weight(.medium)).fontDesign(.rounded)
                            .foregroundStyle(.secondary)
                    }

                    if let error = store.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.footnote.weight(.semibold)).fontDesign(.rounded)
                            .foregroundStyle(Color(white: 0.341))
                            .padding(12)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color(white: 0.925), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }

                    ForEach(StudioStarter.all) { starter in
                        workCard(starter)
                    }
                    WorkSourcesView(store: store)
                    RecipeLibraryView(store: store, onStarted: { dismiss() })
                    WorkFollowupsView(store: store)

                    if store.connectorStatus == nil {
                        HStack(spacing: 10) {
                            ProgressView().controlSize(.small).tint(OpenBotTheme.purple)
                            Text("Checking which apps are ready…")
                                .font(.system(size: 12, weight: .semibold, design: .default))
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 8)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.top, 14)
                .padding(.bottom, 28)
            }
            .background(OpenBotTheme.paper.ignoresSafeArea())
            .navigationTitle("Work")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("close-native-work")
                }
            }
            .task { await store.refreshConnectors() }
        }
    }

    private var workHeroCopy: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("A helpful place to start")
                .font(.title2.weight(.semibold))
                .foregroundStyle(OpenBotTheme.ink)
            Text("Choose a task for your team. You'll see what they find and review anything they want to send.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var workHeroMascots: some View {
        MascotStack(bots: store.state.bots)
            .scaleEffect(1.34)
            .frame(width: 108, height: 76)
            .clipped()
    }

    private func workCard(_ starter: StudioStarter) -> some View {
        let missing = missingServices(for: starter)
        let isReady = store.connectorStatus != nil && missing.isEmpty
        let recoveryURL = missing.compactMap { store.connectorStatus?.googleRecoveryURL(for: $0) }.first
        let canReconnect = store.connectorStatus?.canStartGoogleOAuth == true
        let canAct = isReady || recoveryURL != nil || canReconnect
        let statusLabel = isReady
            ? connectedLabel(for: starter)
            : recoveryURL != nil
                ? "Tap to turn on \(missing.map(serviceName).joined(separator: " + "))"
                : canReconnect
                    ? "Tap to add \(missing.map(serviceName).joined(separator: " + "))"
                    : missingLabel(missing)
        return NativeWorkCard(
            starter: starter,
            isReady: isReady,
            canAct: canAct,
            isStarting: startingID == starter.id,
            isBusy: startingID != nil,
            statusLabel: statusLabel
        ) {
            guard canAct, startingID == nil else { return }
            if let recoveryURL {
                openURL(recoveryURL)
                return
            }
            startingID = starter.id
            Task {
                if isReady {
                    if await store.startWorkflow(starter) { dismiss() }
                } else if let url = await store.beginGoogleConnection() {
                    openURL(url)
                }
                startingID = nil
            }
        }
    }

    private func missingServices(for starter: StudioStarter) -> [String] {
        guard let status = store.connectorStatus else { return starter.requiredServices }
        return status.missingSources(for: starter)
    }

    private func connectedLabel(for starter: StudioStarter) -> String {
        store.connectorStatus?.sourceLabel(for: starter) ?? "Checking available sources"
    }

    private func missingLabel(_ services: [String]) -> String {
        services.isEmpty ? "Ready" : "Finish Google setup for \(services.map(serviceName).joined(separator: " + ")) on your host"
    }

    private func serviceName(_ id: String) -> String {
        switch id {
        case "google-calendar": return "Calendar"
        case "google-drive": return "Drive"
        default: return "Gmail"
        }
    }
}

private struct NativeWorkCard: View {
    let starter: StudioStarter
    let isReady: Bool
    let canAct: Bool
    let isStarting: Bool
    let isBusy: Bool
    let statusLabel: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                cardHeader
                Text(starter.detail)
                    .font(.footnote).fontDesign(.rounded)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                Label(statusLabel, systemImage: isReady ? "checkmark.circle.fill" : "link.badge.plus")
                    .font(.caption.bold()).fontDesign(.rounded)
                    .foregroundStyle(isReady ? OpenBotTheme.green : Color.primary)
            }
            .padding(15)
            .background(cardBackground, in: RoundedRectangle(cornerRadius: 21, style: .continuous))
            .overlay(cardBorder)
        }
        .buttonStyle(NativeWorkButtonStyle())
        .disabled(!canAct || isBusy)
        .opacity(isReady ? 1 : 0.82)
        .accessibilityHint(isReady ? "Starts this job in the team room" : statusLabel)
    }

    private var cardHeader: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(OpenBotTheme.purple.opacity(0.10))
                Image(systemName: starter.systemImage)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(OpenBotTheme.purple)
            }
            .frame(width: 46, height: 46)
            VStack(alignment: .leading, spacing: 4) {
                Text(starter.title)
                    .font(.headline).fontDesign(.rounded)
                    .foregroundStyle(OpenBotTheme.ink)
                    .multilineTextAlignment(.leading)
                Text(starter.summary)
                    .font(.subheadline.weight(.medium)).fontDesign(.rounded)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 4)
            if isStarting {
                ProgressView().controlSize(.small).tint(OpenBotTheme.purple)
            } else {
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(isReady ? OpenBotTheme.purple : Color.secondary)
            }
        }
    }

    private var cardBackground: Color {
        Color.white.opacity(isReady ? 0.93 : 0.70)
    }

    private var cardBorder: some View {
        RoundedRectangle(cornerRadius: 21, style: .continuous)
            .stroke(isReady ? OpenBotTheme.purple.opacity(0.12) : Color.black.opacity(0.06))
    }
}

private struct NativeWorkButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(configuration.isPressed ? 0.72 : 1)
    }
}

private struct NativeConversationView: View {
    @ObservedObject var store: StudioStore
    let onReviewActivity: () -> Void
    @State private var approvalForReview: StudioApproval?

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 10) {
                    if store.state.activeThreadId != store.selectedThreadID {
                        ProgressView("Loading conversation…").padding(.top, 32)
                    } else {
                    let messageList = store.state.messages.filter { $0.threadId == store.selectedThreadID }
                    if !messageList.contains(where: { $0.senderType == "user" }) {
                        ConversationWelcome(bot: store.activeBot, bots: store.state.bots)
                    }
                    ForEach(Array(messageList.enumerated()), id: \.element.id) { index, message in
                        let startsGroup = index == 0 || messageList[index - 1].senderId != message.senderId || messageList[index - 1].senderType == "system"
                        if let failure = store.state.failure(for: message) {
                            StudioFailureNotice(run: failure, onReview: onReviewActivity).id(message.id)
                        } else {
                        NativeMessageBubble(
                            message: message,
                            bot: message.senderId.flatMap { id in store.state.bots.first(where: { $0.id == id }) },
                            startsGroup: startsGroup,
                            showName: store.activeThread?.kind == "room",
                            onOpenAttachment: { attachment in await store.download(attachment) }
                        )
                        .id(message.id)
                        }
                    }
                    ForEach(store.activeRuns.filter { $0.threadId == store.selectedThreadID }) { run in
                        let approval = store.state.approvals.first { $0.runId == run.id && $0.botId == run.botId && $0.status == "pending" }
                        NativeRunCard(run: run, canReview: approval != nil, onReview: { approvalForReview = approval }, onCancel: { Task { await store.cancel(run) } })
                            .id("run-\(run.id)")
                    }
                    ForEach(store.state.unplacedFailures(in: store.selectedThreadID)) { run in
                        StudioFailureNotice(run: run, onReview: onReviewActivity)
                            .padding(.top, 12)
                            .id("failed-\(run.id)")
                    }
                    }
                    Color.clear.frame(height: 2).id("conversation-end")
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 26)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: store.state.messages.count) { _, _ in
                withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("conversation-end", anchor: .bottom) }
            }
            .onChange(of: store.activeRuns) { _, _ in
                withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo("conversation-end", anchor: .bottom) }
            }
            .task(id: store.isLoading) {
                guard !store.isLoading else { return }
                try? await Task.sleep(for: .milliseconds(120))
                proxy.scrollTo("conversation-end", anchor: .bottom)
            }
            .onChange(of: store.selectedThreadID) { _, _ in
                Task {
                    try? await Task.sleep(for: .milliseconds(120))
                    proxy.scrollTo("conversation-end", anchor: .bottom)
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    if let notice = store.shareNotice {
                        Label(notice, systemImage: "square.and.arrow.down.fill")
                            .font(.system(size: 12, weight: .semibold, design: .default))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 18).padding(.vertical, 8)
                            .background(StudioPalette.surface)
                    }
                    if let error = store.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 12, weight: .semibold, design: .default))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 18).padding(.vertical, 8)
                            .background(StudioPalette.surface)
                    }
                    NativeComposer(store: store)
                }
            }
            .sheet(item: $approvalForReview) { approval in
                StudioApprovalReview(store: store, approval: approval)
            }
        }
    }
}

private struct ConversationWelcome: View {
    let bot: StudioBot?
    let bots: [StudioBot]

    var body: some View {
        VStack(spacing: 9) {
            MascotStack(bots: bot.map { [$0] } ?? bots, large: true)
                .frame(height: 90)
            Text(bot?.name ?? "What would you like to work on?")
                .font(.title2.weight(.semibold))
            Text(bot?.role ?? "Start with an idea, a question or something on your list. Your teammates will take it from here.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 12).padding(.bottom, 22)
    }
}

private struct NativeMessageBubble: View {
    let message: StudioMessage
    let bot: StudioBot?
    var startsGroup: Bool = true
    var showName: Bool = false
    let onOpenAttachment: (StudioAttachment) async -> URL?

    private var isUser: Bool { message.senderType == "user" }

    var body: some View {
        if message.isEventCard {
            eventCard
        } else {
        let bubbleShape = UnevenRoundedRectangle(
            topLeadingRadius: startsGroup ? 18 : 10,
            bottomLeadingRadius: isUser ? 10 : 6,
            bottomTrailingRadius: isUser ? 10 : 18,
            topTrailingRadius: startsGroup ? 18 : 10,
            style: .continuous
        )
        HStack(alignment: .top, spacing: 8) {
            if isUser { Spacer(minLength: 45) }
            if !isUser && showName {
                BotMascotView(
                    colorHex: bot?.color ?? message.senderColor ?? "#6d5bd8",
                    variant: bot?.mascot ?? message.senderMascot ?? "blob",
                    status: bot?.status ?? "ready",
                    size: 30
                )
                .opacity(startsGroup ? 1 : 0)
                .offset(y: startsGroup ? 0 : -startsGroupOffset)
            }
            VStack(alignment: isUser ? .trailing : .leading, spacing: 4) {
                if !isUser && showName && startsGroup {
                    Text(message.senderName)
                        .font(.system(size: 10.5, weight: .semibold, design: .default))
                        .foregroundStyle(.secondary)
                        .padding(.leading, 3)
                }
                Text(markdown: message.body)
                    .font(.body)
                    .foregroundStyle(isUser ? StudioPalette.userInk : OpenBotTheme.ink)
                    .lineSpacing(5)
                    .textSelection(.enabled)
                    .padding(.horizontal, isUser ? 16 : 0).padding(.vertical, isUser ? 12 : 4)
                    .background(
                        isUser
                            ? AnyShapeStyle(OpenBotTheme.userBubble)
                            : AnyShapeStyle(Color.clear),
                        in: bubbleShape
                    )
                if !message.attachments.isEmpty {
                    VStack(spacing: 6) {
                        ForEach(message.attachments) { attachment in
                            NativeAttachmentCard(attachment: attachment, onOpen: onOpenAttachment)
                        }
                    }
                }
                if !isUser, let updates = message.progressUpdates, !updates.isEmpty {
                    DisclosureGroup("Work updates") {
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(Array(updates.enumerated()), id: \.offset) { _, update in
                                Text(markdown: update).textSelection(.enabled)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }.padding(.top, 8)
                    }.font(.subheadline).foregroundStyle(.secondary).padding(.vertical, 8)
                }
                if startsGroup { HStack(spacing: 8) {
                    Text(message.createdAt.openBotRelativeTime)
                }
                .font(.caption2)
                .foregroundStyle(StudioPalette.muted)
                }
            }
            if !isUser { Spacer(minLength: 28) }
        }
        .frame(maxWidth: .infinity)
        .contextMenu { ShareLink(item: message.body) { Label("Share message", systemImage: "square.and.arrow.up") } }
        }
    }

    private var eventCard: some View {
        HStack(alignment: .firstTextBaseline, spacing: 9) {
            Image(systemName: eventSymbol)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(message.eventCardTitle).font(.system(size: 12.5, weight: .semibold))
                if !message.eventCardDetail.isEmpty {
                    Text(message.eventCardDetail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
        }
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var eventSymbol: String {
        switch message.eventType {
        case "routine_created": return "clock"
        case "routine_run": return "bolt"
        case "handoff": return "arrow.left.arrow.right"
        case "teammate_message": return "bubble.left"
        default: return "sparkle"
        }
    }

    /// Keeps consecutive bubbles of one speaker visually attached without
    /// moving the message's own top edge.
    private var startsGroupOffset: CGFloat { 2 }
}

private struct NativeAttachmentCard: View {
    let attachment: StudioAttachment
    let onOpen: (StudioAttachment) async -> URL?
    @State private var previewURL: URL?
    @State private var isLoading = false

    var body: some View {
        Button {
            guard !isLoading else { return }
            isLoading = true
            Task {
                previewURL = await onOpen(attachment)
                isLoading = false
            }
        } label: {
            HStack(spacing: 9) {
                ZStack {
                    RoundedRectangle(cornerRadius: 9, style: .continuous).fill(OpenBotTheme.purple.opacity(0.1))
                    if isLoading { ProgressView().controlSize(.mini).tint(OpenBotTheme.purple) }
                    else { Image(systemName: attachment.kind.openBotAttachmentIcon).foregroundStyle(OpenBotTheme.purple) }
                }
                .frame(width: 34, height: 34)
                VStack(alignment: .leading, spacing: 2) {
                    Text(attachment.name).lineLimit(1).foregroundStyle(OpenBotTheme.ink)
                    Text(attachment.summary?.isEmpty == false ? attachment.summary! : attachment.size.openBotFileSize)
                        .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                Image(systemName: "eye").font(.system(size: 11, weight: .bold)).foregroundStyle(OpenBotTheme.purple)
            }
            .font(.system(size: 12, weight: .semibold, design: .default))
            .padding(14).studioOutline()
        }
        .buttonStyle(.plain)
        .quickLookPreview($previewURL)
        .contextMenu {
            if let previewURL { ShareLink(item: previewURL) { Label("Share file", systemImage: "square.and.arrow.up") } }
        }
    }
}

private struct NativeRunCard: View {
    let run: StudioRun
    let canReview: Bool
    let onReview: () -> Void
    let onCancel: () -> Void

    private var waitingForApproval: Bool { run.status == "awaiting_approval" }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 9) {
                BotMascotView(colorHex: run.botColor, variant: run.botMascot, status: run.status == "running" ? "working" : "waiting", size: 34)
                VStack(alignment: .leading, spacing: 2) {
                    Text(run.botName).font(.system(size: 13, weight: .bold, design: .default))
                    Label(run.status.openBotRunLabel, systemImage: waitingForApproval ? "hand.raised.fill" : "sparkles")
                        .font(.system(size: 11, weight: .semibold, design: .default))
                        .foregroundStyle(waitingForApproval ? Color.primary : OpenBotTheme.purple)
                }
                Spacer()
                if !waitingForApproval { ProgressView().controlSize(.small).tint(OpenBotTheme.purple) }
            }
            if let text = run.partialText, !text.isEmpty {
                Text(markdown: text)
                    .font(.system(size: 13.5, design: .default))
                    .foregroundStyle(.secondary)
                    .lineLimit(5)
            } else if let reason = run.approvalReason, !reason.isEmpty {
                Text(reason)
                    .font(.system(size: 13.5, design: .default))
                    .foregroundStyle(.secondary)
            } else if let activity = run.activities?.last(where: { ["tool", "message", "status"].contains($0.kind) }) {
                Text(activity.kind == "message" ? activity.detail ?? activity.label : activity.label)
                    .font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
            }
            HStack {
                if waitingForApproval {
                    Button("Stop task", action: onCancel).buttonStyle(.bordered)
                    Button("Review request", action: onReview).buttonStyle(.borderedProminent).tint(OpenBotTheme.purple)
                        .disabled(!canReview)
                } else {
                    Button("Stop", action: onCancel).font(.system(size: 12, weight: .semibold, design: .default)).foregroundStyle(.secondary)
                }
            }
            if waitingForApproval && !canReview {
                Text("The full request is not available yet. Reconnect to review it before approving.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(StudioPalette.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(OpenBotTheme.purple.opacity(0.12)))
    }
}

private struct NativeComposer: View {
    @ObservedObject var store: StudioStore
    @StateObject private var voice = VoiceCapture()
    @State private var draft = ""
    @State private var voiceDraftPrefix = ""
    @State private var targetBotID: String?
    @State private var pendingFiles: [URL] = []
    @State private var showingFiles = false
    @State private var draftSaveTask: Task<Void, Never>?
    @State private var appliedDraftRevision: String?
    @State private var appliedDraftBody: String?
    @State private var localDrafts: [String: String] = [:]
    @State private var localFiles: [String: [URL]] = [:]
    @State private var composerThreadID: String?
    @State private var sendingDrafts: [String: String] = [:]
    @State private var showingAI = false
    @State private var preparingSend = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if store.needsProviderChoice {
                Button { showingAI = true } label: {
                    Label("Choose your AI connection so teammates can work", systemImage: "sparkles")
                        .font(.system(size: 11, weight: .semibold, design: .default))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 12).padding(.vertical, 9)
                        .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityHint("Opens the AI connection chooser")
            }
            if voice.isListening {
                HStack(spacing: 10) {
                    ZStack {
                        Circle().fill(Color.primary.opacity(0.12))
                        Image(systemName: "waveform")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(Color.primary)
                            .symbolEffect(.variableColor.iterative, options: .repeating)
                    }
                    .frame(width: 32, height: 32)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Listening…")
                            .font(.system(size: 12, weight: .bold, design: .default))
                        Text("OpenBot doesn’t save the recording. Review the text before sending.")
                            .font(.system(size: 10.5, weight: .medium, design: .default))
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 4)
                    Button("Done") { voice.finish() }
                        .font(.system(size: 11, weight: .bold, design: .default))
                        .foregroundStyle(Color.primary)
                        .padding(.horizontal, 10).padding(.vertical, 7)
                        .background(Color.primary.opacity(0.1), in: Capsule())
                }
                .padding(.horizontal, 10).padding(.vertical, 8)
                .background(StudioPalette.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.primary.opacity(0.12)))
                .transition(.move(edge: .bottom).combined(with: .opacity))
            } else if let voiceError = voice.errorMessage {
                HStack(spacing: 8) {
                    Image(systemName: "mic.slash.fill").foregroundStyle(Color.primary)
                    Text(voiceError)
                        .font(.system(size: 10.5, weight: .semibold, design: .default))
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 4)
                    Button { voice.clearError() } label: { Image(systemName: "xmark") }
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 10).padding(.vertical, 8)
                .background(Color.primary.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            if store.activeThread?.kind == "room" {
                Menu {
                    Button("Auto-pick the best teammate") { targetBotID = nil }
                    ForEach(store.state.bots) { bot in
                        Button(bot.name) { targetBotID = bot.id }
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "at")
                        Text(targetBotID.flatMap { id in store.state.bots.first(where: { $0.id == id })?.name } ?? "Auto-pick a teammate")
                        Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold))
                    }
                    .font(.system(size: 11.5, weight: .bold, design: .default))
                    .foregroundStyle(OpenBotTheme.purple)
                    .padding(.horizontal, 10).padding(.vertical, 7)
                    .background(OpenBotTheme.purple.opacity(0.09), in: Capsule())
                }
            }
            if store.activeDraft.source == "web", !draft.isEmpty, draft == store.activeDraft.body {
                Label("Continued from your Mac", systemImage: "macbook.and.iphone")
                    .font(.system(size: 10.5, weight: .semibold, design: .default))
                    .foregroundStyle(OpenBotTheme.green)
                    .padding(.horizontal, 4)
            }
            if !pendingFiles.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 7) {
                        ForEach(pendingFiles, id: \.self) { file in
                            HStack(spacing: 5) {
                                Image(systemName: "doc.fill")
                                Text(file.lastPathComponent).lineLimit(1)
                                Button { pendingFiles.removeAll(where: { $0 == file }) } label: { Image(systemName: "xmark.circle.fill") }
                            }
                            .font(.system(size: 10.5, weight: .semibold, design: .default))
                            .padding(.horizontal, 9).padding(.vertical, 6)
                            .background(StudioPalette.surface, in: Capsule())
                        }
                    }
                }
            }
            HStack(alignment: .center, spacing: 4) {
                Menu {
                    Button("Attach files", systemImage: "paperclip") { showingFiles = true }
                    Menu("Choose a teammate", systemImage: "person.crop.circle") {
                        Button("Auto-pick") { targetBotID = nil }
                        ForEach(store.state.bots) { bot in Button(bot.name) { targetBotID = bot.id } }
                    }
                    Menu("Use a learned skill", systemImage: "wand.and.sparkles") {
                        if store.state.workflows.isEmpty { Text("No learned skills yet") }
                        ForEach(store.state.workflows) { workflow in
                            Button("\(workflow.name) · \(workflow.botName) · v\(workflow.version ?? 1)") {
                                draft += "\(draft.isEmpty ? "" : "\n")/\(workflow.skillSlug) "
                                focused = true
                            }
                        }
                    }
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 20, weight: .regular))
                        .frame(width: 44, height: 44)
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel("Message options")

                TextField("Message \(store.activeBot?.name ?? "the studio")", text: $draft,
                          prompt: Text("Message \(store.activeBot?.name ?? "the studio")").foregroundColor(StudioPalette.muted), axis: .vertical)
                    .font(.body)
                    .frame(minHeight: 44, alignment: .center)
                    .lineLimit(1...5)
                    .focused($focused)
                    .submitLabel(.send)
                    .onSubmit { send() }
                    .accessibilityIdentifier("native-message-field")

                Button {
                    if voice.isListening {
                        voice.finish()
                    } else {
                        voiceDraftPrefix = draft
                        Task { await voice.start() }
                    }
                } label: {
                    Image(systemName: voice.isListening ? "stop.fill" : "mic.fill")
                        .font(.system(size: voice.isListening ? 13 : 16, weight: .bold))
                        .frame(width: 44, height: 44)
                        .foregroundStyle(voice.isListening ? StudioPalette.userInk : OpenBotTheme.lavender)
                        .background(voice.isListening ? Color.primary : Color.clear, in: Circle())
                }
                .accessibilityLabel(voice.isListening ? "Stop voice capture" : "Start voice capture")

                Button(action: send) {
                    Group {
                        if store.isSending { ProgressView().tint(StudioPalette.userInk) }
                        else { Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold)) }
                    }
                    .frame(width: 44, height: 44)
                    .foregroundStyle(StudioPalette.userInk)
                    .background(
                        draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && pendingFiles.isEmpty
                            ? AnyShapeStyle(Color.gray.opacity(0.35))
                            : AnyShapeStyle(LinearGradient(colors: [OpenBotTheme.messagePurpleStart, OpenBotTheme.messagePurpleEnd], startPoint: .topLeading, endPoint: .bottomTrailing)),
                        in: Circle()
                    )
                }
                .disabled(preparingSend || store.isSending || (draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && pendingFiles.isEmpty))
                .accessibilityIdentifier("native-send-message")
            }
            .padding(.horizontal, 6).padding(.vertical, 6)
            .background(StudioPalette.paper, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(StudioPalette.line))
        }
        .padding(.horizontal, 12).padding(.top, 9).padding(.bottom, 7)
        .background(StudioPalette.paper)
        .animation(.easeOut(duration: 0.2), value: voice.isListening)
        .onChange(of: store.selectedThreadID) { old, next in
            draftSaveTask?.cancel()
            let previous = draft
            let wasEdited = localDrafts[old] != nil
            if wasEdited || !previous.isEmpty { localDrafts[old] = previous }
            localFiles[old] = pendingFiles
            if wasEdited && sendingDrafts[old] != previous { Task { await store.saveDraft(previous, threadID: old) } }
            composerThreadID = next
            appliedDraftBody = localDrafts[next] ?? ""
            draft = localDrafts[next] ?? ""
            pendingFiles = localFiles[next] ?? []
            targetBotID = nil
            voice.cancel()
        }
        .onChange(of: voice.transcript) { _, words in
            let cleanWords = words.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanWords.isEmpty else { return }
            let prefix = voiceDraftPrefix.trimmingCharacters(in: .whitespacesAndNewlines)
            draft = prefix.isEmpty ? cleanWords : "\(prefix) \(cleanWords)"
        }
        .onAppear { composerThreadID = store.selectedThreadID; applySharedDraft(force: true) }
        .onChange(of: store.activeDraft.threadId) { _, _ in applySharedDraft(force: true) }
        .onChange(of: store.activeDraft.updatedAt) { _, _ in applySharedDraft() }
        .onChange(of: draft) { _, next in
            if appliedDraftBody == next { appliedDraftBody = nil; return }
            let destination = composerThreadID ?? store.selectedThreadID
            localDrafts[destination] = next
            draftSaveTask?.cancel()
            draftSaveTask = Task {
                try? await Task.sleep(for: .milliseconds(650))
                guard !Task.isCancelled else { return }
                await store.saveDraft(next, threadID: destination)
            }
        }
        .onDisappear {
            draftSaveTask?.cancel()
            let destination = composerThreadID ?? store.selectedThreadID
            let value = draft
            if localDrafts[destination] != nil && sendingDrafts[destination] != value { Task { await store.saveDraft(value, threadID: destination) } }
            voice.cancel()
        }
        .fileImporter(isPresented: $showingFiles, allowedContentTypes: [.content, .data], allowsMultipleSelection: true) { result in
            if case .success(let files) = result {
                pendingFiles = Array(files.prefix(max(0, 6 - pendingFiles.count))) + pendingFiles
                pendingFiles = Array(pendingFiles.prefix(6))
            }
        }
        .sheet(isPresented: $showingAI) { NativeAIChoiceView(store: store) }
    }

    private func send() {
        guard !store.isSending, !preparingSend else { return }
        // No AI yet: sending would only fail on the host. Open the chooser now.
        if store.needsProviderChoice { showingAI = true; return }
        let destination = composerThreadID ?? store.selectedThreadID
        let recipient = targetBotID
        preparingSend = true
        focused = false
        voice.finish()
        Task {
            // Commit pending keyboard composition/autocorrection before taking
            // the outgoing snapshot. Prevent double taps during that handoff.
            await Task.yield()
            defer { preparingSend = false; sendingDrafts[destination] = nil }
            guard store.selectedThreadID == destination else { return }
            let message = draft
            let files = pendingFiles
            draftSaveTask?.cancel()
            sendingDrafts[destination] = message
            if await store.send(message, targetBotID: recipient, files: files, threadID: destination) {
                if localDrafts[destination] == message { localDrafts[destination] = "" }
                localFiles[destination]?.removeAll { files.contains($0) }
                if store.selectedThreadID == destination {
                    if draft == message { draft = "" }
                    pendingFiles.removeAll { files.contains($0) }
                    localDrafts[destination] = draft
                    draftSaveTask?.cancel()
                }
                // Sending clears the host draft. Re-save any newer typing that
                // may already have autosaved while this message was in flight.
                await store.saveDraft(localDrafts[destination] ?? "", threadID: destination)
            }
        }
    }

    private func applySharedDraft(force: Bool = false) {
        let shared = store.activeDraft
        guard shared.threadId == store.selectedThreadID else { return }
        guard localDrafts[shared.threadId] == nil else { return }
        guard force || (shared.source == "web" && shared.updatedAt != appliedDraftRevision) else { return }
        draftSaveTask?.cancel()
        appliedDraftRevision = shared.updatedAt
        guard draft != shared.body else { return }
        appliedDraftBody = shared.body
        draft = shared.body
    }
}

private struct NativeLiveStudioView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: ConnectionSession
    @EnvironmentObject private var push: PushRegistration
    @ObservedObject var store: StudioStore
    @State private var heartbeatAddress = ""
    @State private var editingHeartbeat = false
    @State private var computerBot: StudioBot?
    let onSelect: (String) -> Void

    private var runs: [StudioRun] { store.state.allRuns }
    private var attention: [StudioAttentionItem] { store.state.attentionItems.filter { $0.kind != .uncertainAction } }
    private var approvedActions: [StudioApprovedAction] { store.state.approvedActions ?? [] }
    private var uncertainActions: [StudioApprovedAction] { approvedActions.filter { $0.status == "uncertain" } }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 10) {
                        Label(store.state.runner?.deployment?.mode == "private_runner" ? "PRIVATE ALWAYS-ON HOME" : store.state.runner?.backgroundService == "installed" ? "BACKGROUND PROTECTION ACTIVE" : "LIVE FROM YOUR MAC", systemImage: "circle.fill")
                            .font(.system(size: 10, weight: .bold, design: .default))
                            .foregroundStyle(.secondary)
                        Text(!store.state.attentionItems.isEmpty ? "Needs your attention" : store.state.usage.activeRuns > 0 ? "In progress" : "All quiet for now")
                            .font(.system(size: 24, weight: .semibold, design: .default))
                            .foregroundStyle(.primary)
                        Text("Current tasks and requests for your approval appear here.")
                            .font(.system(size: 13, weight: .medium, design: .default))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 12)

                    HStack(spacing: 8) {
                        liveStat(value: store.state.usage.activeRuns, label: "working", icon: "sparkles")
                        liveStat(value: store.state.attentionItems.count, label: "attention", icon: "hand.raised.fill")
                        liveStat(value: store.state.usage.completedRuns, label: "finished", icon: "checkmark.circle.fill")
                    }

                    ForEach(runs.filter { ["queued", "running", "waiting_for_teammate"].contains($0.status) }) { run in
                        Button { onSelect(run.threadId) } label: {
                            HStack(alignment: .top, spacing: 13) {
                                BotMascotView(colorHex: run.botColor, variant: run.botMascot, status: run.status, size: 38)
                                VStack(alignment: .leading, spacing: 6) {
                                    Text("\(run.botName) · \(run.status.openBotRunLabel)").font(.subheadline.weight(.semibold))
                                    Text(liveRunDescription(run)).font(.subheadline).foregroundStyle(.secondary).lineLimit(4)
                                    Text("Open conversation").font(.caption)
                                }.frame(maxWidth: .infinity, alignment: .leading)
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
                            }.padding(.vertical, 14)
                        }.buttonStyle(.plain)
                        Divider()
                    }

                    if let runner = store.state.runner {
                        NativeRunnerSection(
                            runner: runner,
                            store: store,
                            session: session,
                            push: push,
                            heartbeatAddress: $heartbeatAddress,
                            editingHeartbeat: $editingHeartbeat
                        )
                    }

                    if !attention.isEmpty || !uncertainActions.isEmpty {
                        NativeAttentionSection(
                            attention: attention,
                            uncertainActions: uncertainActions,
                            store: store,
                            onSelect: onSelect
                        )
                    }

                    if !approvedActions.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Action history")
                                        .font(.system(size: 17, weight: .bold, design: .default))
                                    Text("Every approved command, post, email and update leaves a durable receipt.")
                                        .font(.system(size: 10.5, design: .default)).foregroundStyle(.secondary)
                                }
                                Spacer()
                                Label("Recorded", systemImage: "checkmark.shield.fill")
                                    .font(.system(size: 9, weight: .bold, design: .default))
                                    .foregroundStyle(OpenBotTheme.green)
                            }
                            VStack(spacing: 0) {
                                ForEach(Array(approvedActions.prefix(8).enumerated()), id: \.element.id) { index, action in
                                    let completed = ["completed", "confirmed_completed"].contains(action.status)
                                    let working = ["prepared", "running"].contains(action.status)
                                    HStack(spacing: 10) {
                                        Image(systemName: completed ? "checkmark.circle.fill" : working ? "clock.arrow.circlepath" : "exclamationmark.circle.fill")
                                            .foregroundStyle(completed ? OpenBotTheme.green : working ? OpenBotTheme.purple : Color.primary)
                                            .font(.system(size: 17, weight: .semibold))
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(action.actionLabel)
                                                .font(.system(size: 11.5, weight: .bold, design: .default)).lineLimit(1)
                                            Text(action.status == "confirmed_not_completed" ? "Confirmed not completed — a fresh approval is required" : completed ? "Completed once and recorded" : action.status == "failed" ? action.lastError ?? "The action failed" : action.status == "uncertain" ? "Waiting for you to confirm what happened" : "Approved and safely queued")
                                                .font(.system(size: 9.5, design: .default)).foregroundStyle(.secondary).lineLimit(2)
                                        }
                                        Spacer(minLength: 4)
                                        Text((action.finishedAt ?? action.createdAt).openBotRelativeTime)
                                            .font(.system(size: 8.5, weight: .medium, design: .default)).foregroundStyle(.tertiary)
                                    }
                                    .padding(11)
                                    if index < min(approvedActions.count, 8) - 1 { Divider().padding(.leading, 38) }
                                }
                            }
                            .background(Color.white.opacity(0.88), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(.black.opacity(0.055)))
                        }
                    }

                    DisclosureGroup("Teammates") {
                        ForEach(store.state.bots) { bot in
                            let run = runs.first(where: { $0.botId == bot.id })
                            Button { onSelect(bot.threadId) } label: {
                                HStack(spacing: 11) {
                                    BotMascotView(colorHex: bot.color, variant: bot.mascot, status: bot.status, size: 48)
                                    VStack(alignment: .leading, spacing: 4) {
                                        HStack {
                                            Text(bot.name).font(.system(size: 14, weight: .bold, design: .default))
                                            Text(bot.status.openBotRunLabel)
                                                .font(.system(size: 9, weight: .bold, design: .default))
                                                .foregroundStyle(OpenBotTheme.green)
                                                .padding(.horizontal, 7).padding(.vertical, 3)
                                                .background(OpenBotTheme.green.opacity(0.1), in: Capsule())
                                        }
                                        Text(run.map { liveRunDescription($0) } ?? "Ready for a new task")
                                            .font(.system(size: 11.5, design: .default)).foregroundStyle(.secondary).lineLimit(2)
                                    }
                                    Spacer(minLength: 4)
                                    Image(systemName: "chevron.right").font(.caption.bold()).foregroundStyle(.tertiary)
                                }
                                .padding(13)
                                .background(Color.white.opacity(0.88), in: RoundedRectangle(cornerRadius: 19, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 19, style: .continuous).stroke(.black.opacity(0.055)))
                            }
                            .buttonStyle(.plain)
                        }
                    }

                    DisclosureGroup("Teammate computers") {
                        ForEach(store.state.bots) { bot in
                            computerRow(bot)
                        }
                    }
                    .padding(.top, 2)
                }
                .padding(16)
            }
            .background(OpenBotTheme.paper)
            .navigationTitle("Activity")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .sheet(item: $computerBot) { bot in
            ComputerView(store: store, bot: bot)
        }
        .presentationDetents([.large])
    }

    private func computerRow(_ bot: StudioBot) -> some View {
        let detail = bot.browserEnabled == false
            ? "Browser is off for this teammate"
            : "Watch the screen live, then take control for private steps"
        return Button { computerBot = bot } label: {
            HStack(spacing: 11) {
                BotMascotView(colorHex: bot.color, variant: bot.mascot, status: bot.status, size: 40)
                VStack(alignment: .leading, spacing: 3) {
                    Text(bot.name).font(.system(size: 13, weight: .bold, design: .default))
                    Text(detail)
                        .font(.system(size: 10.5, design: .default)).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 4)
                Image(systemName: "display").font(.system(size: 15, weight: .semibold)).foregroundStyle(.secondary)
            }
            .padding(11)
            .background(Color.white.opacity(0.88), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(.black.opacity(0.055)))
        }
        .buttonStyle(.plain)
    }

    private func liveStat(value: Int, label: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Image(systemName: icon).foregroundStyle(OpenBotTheme.purple)
            Text("\(value)").font(.system(size: 18, weight: .bold, design: .default))
            Text(label).font(.system(size: 10, weight: .medium, design: .default)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(11)
        .background(Color.white.opacity(0.86), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
    }

    private func liveRunDescription(_ run: StudioRun) -> String {
        if run.status == "failed" { return run.error ?? "Needs a hand" }
        if run.status == "completed" { return run.summary ?? "Recently finished" }
        if run.status == "awaiting_approval" { return run.approvalReason ?? "Waiting for your okay" }
        if run.recoveredAt != nil { return "Resumed safely after OpenBot restarted" }
        return run.partialText ?? run.summary ?? run.status.openBotRunLabel
    }
}

private struct ThreadPickerView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    let onSelect: (String) -> Void
    @State private var query = ""

    private var conversations: [StudioThread] {
        store.state.threads.filter {
            $0.hidden != true && (query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) || ($0.lastMessage?.localizedCaseInsensitiveContains(query) ?? false))
        }
    }

    var body: some View {
        NavigationStack {
            List {
                if conversations.contains(where: { $0.kind == "room" }) {
                Section("Together") {
                    ForEach(conversations.filter { $0.kind == "room" }) { thread in
                        threadButton(thread, bots: store.state.bots)
                    }
                }
                }
                if conversations.contains(where: { $0.kind == "direct" }) {
                Section("Your teammates") {
                    ForEach(conversations.filter { $0.kind == "direct" }) { thread in
                        let bots = thread.botId.flatMap { id in store.state.bots.first(where: { $0.id == id }).map { [$0] } } ?? []
                        threadButton(thread, bots: bots)
                    }
                }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(StudioPalette.paper)
            .searchable(text: $query, prompt: "Search conversations")
            .overlay {
                if conversations.isEmpty {
                    ContentUnavailableView(query.isEmpty ? "Your conversations will appear here" : "No conversations found", systemImage: "bubble.left.and.bubble.right", description: Text(query.isEmpty ? "Create a teammate on your Mac to get started." : "Try another name or message."))
                }
            }
            .navigationTitle("Conversations")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.large])
    }

    private func threadButton(_ thread: StudioThread, bots: [StudioBot]) -> some View {
        Button { onSelect(thread.id) } label: {
            HStack(spacing: 12) {
                MascotStack(bots: bots).frame(width: 62, height: 48)
                VStack(alignment: .leading, spacing: 5) {
                    Text(thread.title).font(.system(size: 16, weight: .semibold))
                    let live = bots.first(where: { ["working", "waiting"].contains($0.status) && $0.currentAction != nil })
                    Text(live?.currentAction ?? thread.lastMessage?.replacingOccurrences(of: "\n", with: " ") ?? (thread.kind == "room" ? "Everyone together" : bots.first?.role ?? "Teammate"))
                        .font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                        .italic(live != nil)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 8) {
                    Text((thread.lastMessageAt ?? thread.updatedAt).openBotRelativeTime)
                        .font(.caption2).foregroundStyle(.secondary).lineLimit(1)
                    if thread.id == store.selectedThreadID { Image(systemName: "checkmark").font(.caption.weight(.semibold)) }
                }
            }
            .foregroundStyle(OpenBotTheme.ink)
            .padding(.vertical, 10)
        }
        .listRowBackground(thread.id == store.selectedThreadID ? StudioPalette.surface : StudioPalette.paper)
    }
}

struct ConnectionSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: ConnectionSession
    @EnvironmentObject private var push: PushRegistration

    var body: some View {
        NavigationStack {
            List {
                Section("Connected studio") {
                    Label(session.displayAddress, systemImage: "lock.shield.fill")
                        .font(.system(.subheadline, design: .default))
                    Label("The private key stays in this iPhone’s Keychain.", systemImage: "iphone.gen3")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("Notifications") {
                    Label(
                        session.nativePushReady ? "Native notifications are ready" : push.state == .denied ? "Notifications are off in iPhone Settings" : "Get results and approvals while OpenBot is closed",
                        systemImage: session.nativePushReady ? "bell.badge.fill" : "bell"
                    )
                    .foregroundStyle(session.nativePushReady ? OpenBotTheme.green : .primary)
                    if let message = session.nativePushMessage ?? push.errorMessage {
                        Text(message).font(.footnote).foregroundStyle(.secondary)
                    }
                    if push.state == .denied {
                        Button("Open iPhone Settings") { push.openSettings() }
                    } else if !push.isAuthorized {
                        Button("Turn on native notifications") {
                            Task {
                                await push.requestPermission()
                                await session.registerPushDevice(push.deviceToken)
                            }
                        }
                    } else if !session.nativePushReady {
                        Button("Check notification setup") { Task { await session.registerPushDevice(push.deviceToken) } }
                    }
                }
                Section {
                    Button("Connect to another studio") { session.disconnect(keepAddress: false); dismiss() }
                    Button("Forget this access key", role: .destructive) { session.disconnect(); dismiss() }
                }
            }
            .navigationTitle("OpenBot")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.large])
    }
}

private struct NativeAttentionSection: View {
    let attention: [StudioAttentionItem]
    let uncertainActions: [StudioApprovedAction]
    @ObservedObject var store: StudioStore
    let onSelect: (String) -> Void
    @State private var showingRoutines = false

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Needs your attention", systemImage: "bell.badge.fill")
                .font(.system(size: 14, weight: .bold, design: .default))
                .foregroundStyle(Color(white: 0.392))
            ForEach(uncertainActions) { action in
                NativeUncertainActionCard(action: action, store: store)
            }
            ForEach(attention) { item in
                VStack(alignment: .leading, spacing: 8) {
                    Text(item.title).font(.subheadline.weight(.semibold))
                    Text(item.detail).font(.subheadline).foregroundStyle(.secondary).lineLimit(3)
                    if item.kind == .automation {
                        Button("Review routine") { showingRoutines = true }.frame(minHeight: 44)
                    } else if let threadID = item.threadID, store.state.threads.contains(where: { $0.id == threadID }) {
                        Button("Open conversation") { onSelect(threadID) }.frame(minHeight: 44)
                    } else {
                        Text("Conversation unavailable").font(.footnote).foregroundStyle(.secondary)
                    }
                }.padding(.vertical, 6)
            }
        }
        .padding(14)
        .background(StudioPalette.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .sheet(isPresented: $showingRoutines) { ScheduledRoutinesView(store: store) }
    }
}

private struct NativeUncertainActionCard: View {
    let action: StudioApprovedAction
    @ObservedObject var store: StudioStore

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 9) {
                Image(systemName: "exclamationmark.arrow.triangle.2.circlepath")
                    .foregroundStyle(Color.primary)
                    .font(.system(size: 17, weight: .semibold))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Check before OpenBot continues")
                        .font(.system(size: 12, weight: .bold, design: .default))
                    Text("\(action.actionLabel) may have completed during a restart. OpenBot has not repeated it.")
                        .font(.system(size: 10.5, design: .default)).foregroundStyle(.secondary)
                }
            }
            HStack(spacing: 8) {
                Button("It happened") { Task { await store.resolveApprovedAction(action, completed: true) } }
                    .buttonStyle(.borderedProminent).tint(OpenBotTheme.green).controlSize(.small)
                Button("It didn’t happen") { Task { await store.resolveApprovedAction(action, completed: false) } }
                    .buttonStyle(.bordered).controlSize(.small)
            }
        }
        .padding(11)
        .background(Color.white.opacity(0.72), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
    }
}

private struct NativeRunnerSection: View {
    let runner: StudioRunner
    @ObservedObject var store: StudioStore
    let session: ConnectionSession
    let push: PushRegistration
    @Binding var heartbeatAddress: String
    @Binding var editingHeartbeat: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 11) {
                Image(systemName: runner.deployment?.mode == "private_runner" ? "server.rack" : runner.status == "online" ? "bolt.heart.fill" : "exclamationmark.arrow.triangle.2.circlepath")
                    .foregroundStyle(runner.status == "online" ? OpenBotTheme.green : Color.primary)
                    .font(.system(size: 19, weight: .semibold))
                VStack(alignment: .leading, spacing: 3) {
                    Text(runner.deployment?.mode == "private_runner" && runner.status == "online" ? "Your private home keeps working" : runner.status == "online" ? "Studio runner is awake" : "Studio runner needs a restart")
                        .font(.system(size: 13, weight: .bold, design: .default))
                    Text(runner.backgroundServiceDetail)
                        .font(.system(size: 10.5, design: .default)).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer(minLength: 4)
                Button(runner.deployment?.mode == "private_runner" ? "Home check" : "Check now") {
                    Task {
                        if runner.deployment?.mode == "private_runner" { await store.checkRunnerCare() }
                        else { await store.wakeRunner() }
                    }
                }
                    .buttonStyle(.bordered).controlSize(.small)
                    .disabled(store.isCheckingRunner)
            }
            if let deployment = runner.deployment, deployment.mode == "private_runner" {
                privateRunnerDetails(deployment)
            }
        }
        .padding(13)
        .background(Color.white.opacity(0.88), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(.black.opacity(0.055)))
        .task {
            if store.state.runner?.deployment?.mode == "private_runner", store.runnerCare == nil {
                await store.checkRunnerCare()
            }
        }
    }

    @ViewBuilder
    private func privateRunnerDetails(_ deployment: StudioDeployment) -> some View {
        HStack(spacing: 6) {
            ForEach(deployment.checks.prefix(3), id: \.id) { check in
                Label(check.label, systemImage: check.status == "ready" ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                    .font(.system(size: 8.5, weight: .semibold, design: .default))
                    .foregroundStyle(check.status == "ready" ? OpenBotTheme.green : Color.primary)
                    .lineLimit(1)
            }
        }
        if let care = store.runnerCare {
            NativeRunnerCareCard(
                care: care,
                store: store,
                session: session,
                push: push,
                heartbeatAddress: $heartbeatAddress,
                editingHeartbeat: $editingHeartbeat
            )
        }
    }
}

private struct NativeRunnerCareCard: View {
    let care: StudioRunnerCare
    @ObservedObject var store: StudioStore
    let session: ConnectionSession
    let push: PushRegistration
    @Binding var heartbeatAddress: String
    @Binding var editingHeartbeat: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack {
                Label(care.summary, systemImage: care.overall == "ready" ? "checkmark.shield.fill" : "exclamationmark.triangle.fill")
                    .font(.system(size: 11, weight: .bold, design: .default))
                    .foregroundStyle(care.overall == "ready" ? OpenBotTheme.green : Color.primary)
                Spacer()
                Text("v\(care.version)").font(.system(size: 9, weight: .semibold, design: .default)).foregroundStyle(.secondary)
            }
            ForEach(care.checks) { check in
                HStack(spacing: 7) {
                    Image(systemName: check.status == "ready" ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                        .foregroundStyle(check.status == "ready" ? OpenBotTheme.green : Color.primary)
                    Text(check.label).font(.system(size: 10, weight: .semibold, design: .default))
                    Spacer(minLength: 6)
                    Text(check.value).font(.system(size: 9, design: .default)).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            Divider().opacity(0.55)
            NativeAlertsRow(care: care, store: store, session: session, push: push)
            Divider().opacity(0.55)
            NativeHeartbeatRow(care: care, store: store, heartbeatAddress: $heartbeatAddress, editingHeartbeat: $editingHeartbeat)
            Divider().opacity(0.55)
            NativeRelocationRow(store: store)
            if let error = store.errorMessage {
                Text(error).font(.system(size: 8.5, design: .default)).foregroundStyle(Color.primary)
            }
        }
        .padding(10)
        .background(Color.black.opacity(0.025), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct NativeAlertsRow: View {
    let care: StudioRunnerCare
    @ObservedObject var store: StudioStore
    let session: ConnectionSession
    let push: PushRegistration

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: care.alerts.enabled ? "bell.badge.fill" : "bell")
                .foregroundStyle(care.alerts.enabled ? OpenBotTheme.green : OpenBotTheme.purple)
            VStack(alignment: .leading, spacing: 2) {
                Text(care.alerts.enabled ? "Health alerts are on" : "Private-home health alerts")
                    .font(.system(size: 10, weight: .bold, design: .default))
                Text(care.alerts.enabled ? "Every \(care.alerts.intervalMinutes) min · \(care.alerts.destinationCount) ready device\(care.alerts.destinationCount == 1 ? "" : "s")" : "A quiet alert when this home needs you, and once when it recovers.")
                    .font(.system(size: 8.5, design: .default)).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer(minLength: 4)
            Button(care.alerts.enabled ? "Turn off" : "Turn on") {
                Task {
                    if !care.alerts.enabled && !care.alerts.deliveryReady {
                        if !push.isAuthorized { await push.requestPermission() }
                        await session.registerPushDevice(push.deviceToken)
                        await store.checkRunnerCare()
                    }
                    await store.setRunnerHealthAlerts(!care.alerts.enabled)
                }
            }
            .buttonStyle(.borderedProminent).tint(care.alerts.enabled ? .gray : OpenBotTheme.purple).controlSize(.mini)
            .disabled(store.isCheckingRunner)
        }
    }
}

private struct NativeHeartbeatRow: View {
    let care: StudioRunnerCare
    @ObservedObject var store: StudioStore
    @Binding var heartbeatAddress: String
    @Binding var editingHeartbeat: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 8) {
                Image(systemName: care.heartbeat.enabled ? "wifi" : "wifi.slash")
                    .foregroundStyle(care.heartbeat.enabled ? OpenBotTheme.green : OpenBotTheme.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text(care.heartbeat.enabled ? "Offline protection is checking in" : "Know if this whole home goes offline")
                        .font(.system(size: 10, weight: .bold, design: .default))
                    Text(care.heartbeat.enabled ? "Every \(care.heartbeat.intervalMinutes) min · \(care.heartbeat.provider ?? "outside service")" : "Only an empty pulse leaves OpenBot. No files, prompts, or health details are sent.")
                        .font(.system(size: 8.5, design: .default)).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer(minLength: 4)
                if care.heartbeat.configured && !editingHeartbeat {
                    Button("Replace") { editingHeartbeat = true }.buttonStyle(.bordered).controlSize(.mini)
                }
                Button(care.heartbeat.enabled && !editingHeartbeat ? "Turn off" : care.heartbeat.configured && !editingHeartbeat ? "Turn on" : "Connect") {
                    Task {
                        let replacing = editingHeartbeat || !care.heartbeat.configured
                        await store.setExternalHeartbeat(care.heartbeat.enabled && !editingHeartbeat ? false : true, url: replacing ? heartbeatAddress.trimmingCharacters(in: .whitespacesAndNewlines) : nil)
                        if store.errorMessage == nil { heartbeatAddress = ""; editingHeartbeat = false }
                    }
                }
                .buttonStyle(.borderedProminent).tint(care.heartbeat.enabled && !editingHeartbeat ? .gray : OpenBotTheme.purple).controlSize(.mini)
                .disabled(store.isCheckingRunner)
            }
            if !care.heartbeat.configured || editingHeartbeat {
                TextField("https://heartbeat.example/your-private-id", text: $heartbeatAddress)
                    .font(.system(size: 9, design: .default)).textInputAutocapitalization(.never).keyboardType(.URL)
                    .padding(.horizontal, 9).frame(height: 32)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(.black.opacity(0.07)))
            }
            if let heartbeatError = care.heartbeat.lastError {
                Label(heartbeatError, systemImage: "exclamationmark.circle.fill")
                    .font(.system(size: 8.5, design: .default)).foregroundStyle(Color.primary)
            } else if care.heartbeat.lastSuccessAt != nil {
                Label("Latest check-in reached the outside service", systemImage: "checkmark.circle.fill")
                    .font(.system(size: 8.5, design: .default)).foregroundStyle(OpenBotTheme.green)
            }
        }
    }
}

private struct NativeRelocationRow: View {
    @ObservedObject var store: StudioStore

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Move this home securely", systemImage: "lock.shield.fill")
                .font(.system(size: 10, weight: .bold, design: .default)).foregroundStyle(OpenBotTheme.purple)
            Text("Create one passphrase-encrypted file containing the studio, subscriptions, browser state, and projects. Import verifies and stages it before replacing anything.")
                .font(.system(size: 8.5, design: .default)).foregroundStyle(.secondary)
            HStack {
                Text("./deploy/private-runner/export-home.sh").font(.system(size: 8, design: .monospaced)).lineLimit(1)
                Spacer()
                Button { UIPasteboard.general.string = "./deploy/private-runner/export-home.sh" } label: { Image(systemName: "doc.on.doc") }
                    .buttonStyle(.bordered).controlSize(.mini)
            }
        }
    }
}

private struct NativeLoadingView: View {
    var body: some View {
        VStack(spacing: 16) {
            MascotPairView().frame(height: 126)
            ProgressView().tint(OpenBotTheme.purple)
            Text("Waking your studio…")
                .font(.system(size: 14, weight: .semibold, design: .default))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct MascotStack: View {
    let bots: [StudioBot]
    var large = false

    var body: some View {
        HStack(spacing: large ? -17 : -20) {
            ForEach(Array(bots.prefix(3).enumerated()), id: \.element.id) { index, bot in
                BotMascotView(colorHex: bot.color, variant: bot.mascot, status: bot.status, size: large ? 70 : 40, seed: bot.id)
                    .offset(y: index == 1 ? (large ? 4 : 2) : 0)
                    .zIndex(Double(3 - index))
            }
        }
    }
}

struct BotMascotView: View {
    let colorHex: String
    let variant: String
    let status: String
    let size: CGFloat
    var seed: String = ""
    @State private var instanceSeed = UUID().uuidString

    var body: some View {
        StudioCharacter(colorHex: colorHex, variant: variant, status: status, size: size, seed: seed.isEmpty ? instanceSeed : seed)
    }
}

private struct MascotMouthShape: Shape {
    let frowning: Bool

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let edgeY = frowning ? rect.maxY * 0.82 : rect.minY + rect.height * 0.18
        let controlY = frowning ? rect.minY : rect.maxY
        path.move(to: CGPoint(x: rect.minX, y: edgeY))
        path.addQuadCurve(to: CGPoint(x: rect.maxX, y: edgeY), control: CGPoint(x: rect.midX, y: controlY))
        return path
    }
}

private extension Text {
    init(markdown: String) {
        if let attributed = try? AttributedString(markdown: markdown, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)) {
            self.init(attributed)
        } else {
            self.init(markdown)
        }
    }
}

private extension Color {
    init(openBotHex value: String) {
        let clean = value.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var number: UInt64 = 0
        Scanner(string: clean).scanHexInt64(&number)
        if clean.count == 6 {
            self.init(
                red: Double((number >> 16) & 0xff) / 255,
                green: Double((number >> 8) & 0xff) / 255,
                blue: Double(number & 0xff) / 255
            )
        } else {
            self = OpenBotTheme.purple
        }
    }
}

extension String {
    var openBotRunLabel: String {
        switch self {
        case "awaiting_approval": return "Needs your okay"
        case "waiting_for_teammate": return "Consulting a teammate"
        case "queued": return "Getting ready"
        case "running": return "Working now"
        default: return replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    var openBotRelativeTime: String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: self) ?? ISO8601DateFormatter().date(from: self)
        guard let date else { return "" }
        let display = DateFormatter()
        if Calendar.current.isDateInToday(date) { display.timeStyle = .short }
        else if Calendar.current.isDateInYesterday(date) { return "Yesterday" }
        else { display.dateFormat = "MMM d" }
        return display.string(from: date)
    }

    var openBotAttachmentIcon: String {
        switch self {
        case "image": return "photo.fill"
        case "audio": return "waveform"
        case "video": return "video.fill"
        case "spreadsheet": return "tablecells.fill"
        case "presentation": return "rectangle.on.rectangle.angled"
        case "archive": return "archivebox.fill"
        default: return "doc.text.fill"
        }
    }
}

private extension Int {
    var openBotFileSize: String {
        if self < 1_000_000 { return "\(Swift.max(1, self / 1_000)) KB" }
        return String(format: "%.1f MB", Double(self) / 1_000_000)
    }
}
