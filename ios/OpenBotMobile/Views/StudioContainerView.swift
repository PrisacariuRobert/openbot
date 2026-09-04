import SwiftUI
import UniformTypeIdentifiers
import QuickLook

struct StudioContainerView: View {
    @EnvironmentObject private var session: ConnectionSession
    @EnvironmentObject private var push: PushRegistration
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var store: StudioStore
    @StateObject private var network = NetworkMonitor()
    @State private var showingThreads = false
    @State private var showingLiveStudio = false
    @State private var showingSettings = false

    init(url: URL) {
        _store = StateObject(wrappedValue: StudioStore(serverURL: url))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                StudioHeader(
                    title: store.activeThread?.title ?? "The studio",
                    bots: store.activeBot.map { [$0] } ?? store.state.bots,
                    isLive: network.isOnline && store.isLive,
                    isPrivateHome: store.state.runner?.deployment?.mode == "private_runner",
                    onThreads: { showingThreads = true },
                    onLiveStudio: { showingLiveStudio = true },
                    onSettings: { showingSettings = true }
                )
                Divider().opacity(0.55)
                if store.isLoading {
                    NativeLoadingView()
                } else {
                    NativeConversationView(store: store)
                }
            }
            .background(OpenBotTheme.paper.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
        .task {
            await store.start()
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
            guard phase == .active else { return }
            Task { await store.importSharedInbox() }
        }
        .sheet(isPresented: $showingThreads) {
            ThreadPickerView(store: store) { id in
                showingThreads = false
                Task { await store.chooseThread(id) }
            }
        }
        .sheet(isPresented: $showingLiveStudio) {
            NativeLiveStudioView(store: store) { threadID in
                showingLiveStudio = false
                Task { await store.chooseThread(threadID) }
            }
        }
        .sheet(isPresented: $showingSettings) { ConnectionSettingsView() }
    }

    private func openRequestedThread() async {
        guard let threadID = session.requestedThreadID,
              store.state.threads.contains(where: { $0.id == threadID }) else { return }
        await store.chooseThread(threadID)
        session.consumeRequestedThread()
    }
}

private struct StudioHeader: View {
    let title: String
    let bots: [StudioBot]
    let isLive: Bool
    let isPrivateHome: Bool
    let onThreads: () -> Void
    let onLiveStudio: () -> Void
    let onSettings: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button(action: onThreads) {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 17, weight: .medium))
                    .frame(width: 34, height: 40)
            }
            .accessibilityLabel("Open conversations")

            MascotStack(bots: bots).frame(width: bots.count > 1 ? 78 : 40, height: 42)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundStyle(OpenBotTheme.ink)
                    .lineLimit(1)
                    .accessibilityIdentifier("studio-native-title")
                HStack(spacing: 5) {
                    Circle().fill(isLive ? OpenBotTheme.green : .orange).frame(width: 7, height: 7)
                    Text(isLive ? (isPrivateHome ? "Live from your private home" : "Live on your Mac") : "Reconnecting…")
                        .font(.system(size: 11.5, weight: .semibold, design: .rounded))
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button(action: onLiveStudio) {
                Image(systemName: "rectangle.3.group")
                    .font(.system(size: 16, weight: .semibold))
                    .frame(width: 34, height: 40)
            }
            .accessibilityLabel("Live Studio")

            Button(action: onSettings) {
                Image(systemName: "ellipsis")
                    .font(.system(size: 18, weight: .bold))
                    .frame(width: 34, height: 40)
            }
            .accessibilityLabel("Studio settings")
        }
        .foregroundStyle(OpenBotTheme.ink)
        .padding(.horizontal, 10)
        .padding(.top, 3)
        .padding(.bottom, 5)
        .background(.ultraThinMaterial)
    }
}

private struct NativeConversationView: View {
    @ObservedObject var store: StudioStore

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 15) {
                    ConversationWelcome(bot: store.activeBot, bots: store.state.bots)
                    ForEach(store.state.messages) { message in
                        NativeMessageBubble(
                            message: message,
                            bot: message.senderId.flatMap { id in store.state.bots.first(where: { $0.id == id }) },
                            onOpenAttachment: { attachment in await store.download(attachment) }
                        )
                        .id(message.id)
                    }
                    ForEach(store.activeRuns) { run in
                        NativeRunCard(run: run, onApprove: { Task { await store.approve(run) } }, onCancel: { Task { await store.cancel(run) } })
                            .id("run-\(run.id)")
                    }
                    Color.clear.frame(height: 2).id("conversation-end")
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 16)
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
                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color(red: 0.14, green: 0.48, blue: 0.31))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 18).padding(.vertical, 8)
                            .background(Color(red: 0.90, green: 0.98, blue: 0.93))
                    }
                    if let error = store.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color(red: 0.68, green: 0.25, blue: 0.23))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 18).padding(.vertical, 8)
                            .background(Color(red: 1, green: 0.91, blue: 0.88))
                    }
                    NativeComposer(store: store)
                }
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
            Text(bot?.name ?? "Your studio")
                .font(.system(size: 19, weight: .bold, design: .rounded))
            Text(bot?.role ?? "Ask naturally. OpenBot picks the right teammate, or you can choose one before sending.")
                .font(.system(size: 12.5, weight: .medium, design: .rounded))
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .lineLimit(3)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 12).padding(.bottom, 22)
    }
}

private struct NativeMessageBubble: View {
    let message: StudioMessage
    let bot: StudioBot?
    let onOpenAttachment: (StudioAttachment) async -> URL?

    private var isUser: Bool { message.senderType == "user" }

    var body: some View {
        let bubbleShape = UnevenRoundedRectangle(
            topLeadingRadius: 18,
            bottomLeadingRadius: isUser ? 18 : 6,
            bottomTrailingRadius: isUser ? 6 : 18,
            topTrailingRadius: 18,
            style: .continuous
        )
        HStack(alignment: .bottom, spacing: 8) {
            if isUser { Spacer(minLength: 45) }
            if !isUser {
                BotMascotView(
                    colorHex: bot?.color ?? message.senderColor ?? "#6d5bd8",
                    variant: bot?.mascot ?? message.senderMascot ?? "blob",
                    status: bot?.status ?? "ready",
                    size: 30
                )
            }
            VStack(alignment: isUser ? .trailing : .leading, spacing: 5) {
                if !isUser {
                    Text(message.senderName)
                        .font(.system(size: 10.5, weight: .semibold, design: .rounded))
                        .foregroundStyle(.secondary)
                        .padding(.leading, 3)
                }
                Text(markdown: message.body)
                    .font(.system(size: 13.5, weight: .regular, design: .rounded))
                    .foregroundStyle(isUser ? .white : OpenBotTheme.ink)
                    .lineSpacing(1.4)
                    .textSelection(.enabled)
                    .padding(.horizontal, 12).padding(.vertical, 9)
                    .background(
                        isUser
                            ? AnyShapeStyle(LinearGradient(colors: [OpenBotTheme.messagePurpleStart, OpenBotTheme.messagePurpleEnd], startPoint: .topLeading, endPoint: .bottomTrailing))
                            : AnyShapeStyle(OpenBotTheme.botBubble),
                        in: bubbleShape
                    )
                    .overlay {
                        if !isUser {
                            bubbleShape.stroke(.black.opacity(0.035))
                        }
                    }
                if !message.attachments.isEmpty {
                    VStack(spacing: 6) {
                        ForEach(message.attachments) { attachment in
                            NativeAttachmentCard(attachment: attachment, onOpen: onOpenAttachment)
                        }
                    }
                }
                HStack(spacing: 8) {
                    Text(message.createdAt.openBotRelativeTime)
                    if !message.body.isEmpty {
                        ShareLink(item: message.body, subject: Text("From \(message.senderName)")) {
                            Image(systemName: "square.and.arrow.up")
                        }
                        .accessibilityLabel("Share message")
                    }
                }
                .font(.system(size: 9.5, weight: .regular, design: .rounded))
                .foregroundStyle(.tertiary)
            }
            if !isUser { Spacer(minLength: 28) }
        }
        .frame(maxWidth: .infinity)
    }
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
            .font(.system(size: 12, weight: .semibold, design: .rounded))
            .padding(8)
            .background(.white.opacity(0.82), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(OpenBotTheme.purple.opacity(0.1)))
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
    let onApprove: () -> Void
    let onCancel: () -> Void

    private var waitingForApproval: Bool { run.status == "awaiting_approval" }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 9) {
                BotMascotView(colorHex: run.botColor, variant: run.botMascot, status: run.status == "running" ? "working" : "waiting", size: 34)
                VStack(alignment: .leading, spacing: 2) {
                    Text(run.botName).font(.system(size: 13, weight: .bold, design: .rounded))
                    Label(run.status.openBotRunLabel, systemImage: waitingForApproval ? "hand.raised.fill" : "sparkles")
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                        .foregroundStyle(waitingForApproval ? .orange : OpenBotTheme.purple)
                }
                Spacer()
                if !waitingForApproval { ProgressView().controlSize(.small).tint(OpenBotTheme.purple) }
            }
            if let text = run.partialText, !text.isEmpty {
                Text(markdown: text)
                    .font(.system(size: 13.5, design: .rounded))
                    .foregroundStyle(.secondary)
                    .lineLimit(5)
            } else if let reason = run.approvalReason, !reason.isEmpty {
                Text(reason)
                    .font(.system(size: 13.5, design: .rounded))
                    .foregroundStyle(.secondary)
            }
            HStack {
                if waitingForApproval {
                    Button("Not now", action: onCancel).buttonStyle(.bordered)
                    Button("Approve", action: onApprove).buttonStyle(.borderedProminent).tint(OpenBotTheme.purple)
                } else {
                    Button("Stop", action: onCancel).font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                }
            }
        }
        .padding(14)
        .background(Color.white.opacity(0.88), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
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
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if voice.isListening {
                HStack(spacing: 10) {
                    ZStack {
                        Circle().fill(Color.red.opacity(0.12))
                        Image(systemName: "waveform")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.red)
                            .symbolEffect(.variableColor.iterative, options: .repeating)
                    }
                    .frame(width: 32, height: 32)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Listening…")
                            .font(.system(size: 12, weight: .bold, design: .rounded))
                        Text("OpenBot doesn’t save the recording. Review the text before sending.")
                            .font(.system(size: 10.5, weight: .medium, design: .rounded))
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 4)
                    Button("Done") { voice.finish() }
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundStyle(.red)
                        .padding(.horizontal, 10).padding(.vertical, 7)
                        .background(Color.red.opacity(0.1), in: Capsule())
                }
                .padding(.horizontal, 10).padding(.vertical, 8)
                .background(.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color.red.opacity(0.12)))
                .transition(.move(edge: .bottom).combined(with: .opacity))
            } else if let voiceError = voice.errorMessage {
                HStack(spacing: 8) {
                    Image(systemName: "mic.slash.fill").foregroundStyle(.orange)
                    Text(voiceError)
                        .font(.system(size: 10.5, weight: .semibold, design: .rounded))
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 4)
                    Button { voice.clearError() } label: { Image(systemName: "xmark") }
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 10).padding(.vertical, 8)
                .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
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
                    .font(.system(size: 11.5, weight: .bold, design: .rounded))
                    .foregroundStyle(OpenBotTheme.purple)
                    .padding(.horizontal, 10).padding(.vertical, 7)
                    .background(OpenBotTheme.purple.opacity(0.09), in: Capsule())
                }
            }
            if store.activeDraft.source == "web", !draft.isEmpty, draft == store.activeDraft.body {
                Label("Continued from your Mac", systemImage: "macbook.and.iphone")
                    .font(.system(size: 10.5, weight: .semibold, design: .rounded))
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
                            .font(.system(size: 10.5, weight: .semibold, design: .rounded))
                            .padding(.horizontal, 9).padding(.vertical, 6)
                            .background(.white, in: Capsule())
                        }
                    }
                }
            }
            HStack(alignment: .bottom, spacing: 9) {
                Button { showingFiles = true } label: {
                    Image(systemName: "paperclip")
                        .font(.system(size: 18, weight: .semibold))
                        .frame(width: 32, height: 38)
                        .foregroundStyle(OpenBotTheme.lavender)
                }
                .accessibilityLabel("Attach files")

                Menu {
                    Button("Auto-pick") { targetBotID = nil }
                    ForEach(store.state.bots) { bot in Button(bot.name) { targetBotID = bot.id } }
                } label: {
                    Image(systemName: "at")
                        .font(.system(size: 17, weight: .semibold))
                        .frame(width: 25, height: 38)
                        .foregroundStyle(OpenBotTheme.purple)
                }
                .accessibilityLabel("Choose a teammate")

                Menu {
                    if store.state.workflows.isEmpty {
                        Text("No learned skills yet")
                    } else {
                        ForEach(store.state.workflows) { workflow in
                            Button("\(workflow.name) · \(workflow.botName) · v\(workflow.version ?? 1)") {
                                draft = "/\(workflow.skillSlug) "
                                focused = true
                            }
                        }
                    }
                } label: {
                    Image(systemName: "wand.and.sparkles")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(width: 25, height: 38)
                        .foregroundStyle(Color(red: 0.73, green: 0.28, blue: 0.58))
                }
                .accessibilityLabel("Choose a learned skill")

                TextField("Message \(store.activeBot?.name ?? "the studio")", text: $draft, axis: .vertical)
                    .font(.system(size: 14, weight: .regular, design: .rounded))
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
                        .frame(width: 34, height: 34)
                        .foregroundStyle(voice.isListening ? .white : OpenBotTheme.lavender)
                        .background(voice.isListening ? Color.red : Color.clear, in: Circle())
                }
                .accessibilityLabel(voice.isListening ? "Stop voice capture" : "Start voice capture")

                Button(action: send) {
                    Group {
                        if store.isSending { ProgressView().tint(.white) }
                        else { Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold)) }
                    }
                    .frame(width: 42, height: 42)
                    .foregroundStyle(.white)
                    .background(
                        draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            ? AnyShapeStyle(Color.gray.opacity(0.35))
                            : AnyShapeStyle(LinearGradient(colors: [OpenBotTheme.messagePurpleStart, OpenBotTheme.messagePurpleEnd], startPoint: .topLeading, endPoint: .bottomTrailing)),
                        in: Circle()
                    )
                }
                .disabled(store.isSending || (draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && pendingFiles.isEmpty))
                .accessibilityIdentifier("native-send-message")
            }
            .padding(.horizontal, 6).padding(.vertical, 6)
            .background(.white.opacity(0.96), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(.black.opacity(0.07)))
            .shadow(color: .black.opacity(0.06), radius: 14, y: 5)
        }
        .padding(.horizontal, 12).padding(.top, 9).padding(.bottom, 7)
        .background(.ultraThinMaterial)
        .animation(.easeOut(duration: 0.2), value: voice.isListening)
        .onChange(of: store.selectedThreadID) { _, _ in
            targetBotID = nil
            voice.cancel()
        }
        .onChange(of: voice.transcript) { _, words in
            let cleanWords = words.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanWords.isEmpty else { return }
            let prefix = voiceDraftPrefix.trimmingCharacters(in: .whitespacesAndNewlines)
            draft = prefix.isEmpty ? cleanWords : "\(prefix) \(cleanWords)"
        }
        .onAppear { applySharedDraft(force: true) }
        .onChange(of: store.activeDraft.threadId) { _, _ in applySharedDraft(force: true) }
        .onChange(of: store.activeDraft.updatedAt) { _, _ in applySharedDraft() }
        .onChange(of: draft) { _, next in
            if appliedDraftBody == next { appliedDraftBody = nil; return }
            draftSaveTask?.cancel()
            draftSaveTask = Task {
                try? await Task.sleep(for: .milliseconds(650))
                guard !Task.isCancelled else { return }
                await store.saveDraft(next)
            }
        }
        .onDisappear {
            draftSaveTask?.cancel()
            voice.cancel()
        }
        .fileImporter(isPresented: $showingFiles, allowedContentTypes: [.content, .data], allowsMultipleSelection: true) { result in
            if case .success(let files) = result {
                pendingFiles = Array(files.prefix(max(0, 6 - pendingFiles.count))) + pendingFiles
                pendingFiles = Array(pendingFiles.prefix(6))
            }
        }
    }

    private func send() {
        let message = draft
        voice.finish()
        Task {
            if await store.send(message, targetBotID: targetBotID, files: pendingFiles) {
                draft = ""
                pendingFiles = []
            }
        }
    }

    private func applySharedDraft(force: Bool = false) {
        let shared = store.activeDraft
        guard shared.threadId == store.selectedThreadID else { return }
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
    let onSelect: (String) -> Void

    private var runs: [StudioRun] { store.state.studioRuns ?? store.state.runs }
    private var attention: [StudioRun] { runs.filter { ["awaiting_approval", "failed"].contains($0.status) } }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 10) {
                        Label(store.state.runner?.deployment?.mode == "private_runner" ? "PRIVATE ALWAYS-ON HOME" : store.state.runner?.backgroundService == "installed" ? "BACKGROUND PROTECTION ACTIVE" : "LIVE FROM YOUR MAC", systemImage: "circle.fill")
                            .font(.system(size: 10, weight: .bold, design: .rounded))
                            .foregroundStyle(Color.white.opacity(0.78))
                        Text(store.state.usage.activeRuns > 0 ? "Your team is moving work forward" : "Your team is ready")
                            .font(.system(size: 24, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)
                        Text("Watch every teammate, handle anything that needs you, and trust interrupted work to resume from its saved checkpoint.")
                            .font(.system(size: 13, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.white.opacity(0.72))
                        MascotStack(bots: store.state.bots, large: true).frame(maxWidth: .infinity, minHeight: 82)
                    }
                    .padding(20)
                    .background(
                        LinearGradient(colors: [OpenBotTheme.messagePurpleStart, OpenBotTheme.messagePurpleEnd], startPoint: .topLeading, endPoint: .bottomTrailing),
                        in: RoundedRectangle(cornerRadius: 26, style: .continuous)
                    )

                    HStack(spacing: 8) {
                        liveStat(value: store.state.usage.activeRuns, label: "working", icon: "sparkles")
                        liveStat(value: attention.count, label: "attention", icon: "hand.raised.fill")
                        liveStat(value: store.state.usage.completedRuns, label: "finished", icon: "checkmark.circle.fill")
                    }

                    if let runner = store.state.runner {
                        VStack(alignment: .leading, spacing: 9) {
                            HStack(spacing: 11) {
                                Image(systemName: runner.deployment?.mode == "private_runner" ? "server.rack" : runner.status == "online" ? "bolt.heart.fill" : "exclamationmark.arrow.triangle.2.circlepath")
                                    .foregroundStyle(runner.status == "online" ? OpenBotTheme.green : .orange)
                                    .font(.system(size: 19, weight: .semibold))
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(runner.deployment?.mode == "private_runner" && runner.status == "online" ? "Your private home keeps working" : runner.status == "online" ? "Studio runner is awake" : "Studio runner needs a restart")
                                        .font(.system(size: 13, weight: .bold, design: .rounded))
                                    Text(runner.backgroundServiceDetail)
                                        .font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(2)
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
                                HStack(spacing: 6) {
                                    ForEach(deployment.checks.prefix(3), id: \.id) { check in
                                        Label(check.label, systemImage: check.status == "ready" ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                                            .font(.system(size: 8.5, weight: .semibold, design: .rounded))
                                            .foregroundStyle(check.status == "ready" ? OpenBotTheme.green : .orange)
                                            .lineLimit(1)
                                    }
                                }
                                if let care = store.runnerCare {
                                    VStack(alignment: .leading, spacing: 7) {
                                        HStack {
                                            Label(care.summary, systemImage: care.overall == "ready" ? "checkmark.shield.fill" : "exclamationmark.triangle.fill")
                                                .font(.system(size: 11, weight: .bold, design: .rounded))
                                                .foregroundStyle(care.overall == "ready" ? OpenBotTheme.green : .orange)
                                            Spacer()
                                            Text("v\(care.version)").font(.system(size: 9, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                                        }
                                        ForEach(care.checks) { check in
                                            HStack(spacing: 7) {
                                                Image(systemName: check.status == "ready" ? "checkmark.circle.fill" : "exclamationmark.circle.fill")
                                                    .foregroundStyle(check.status == "ready" ? OpenBotTheme.green : .orange)
                                                Text(check.label).font(.system(size: 10, weight: .semibold, design: .rounded))
                                                Spacer(minLength: 6)
                                                Text(check.value).font(.system(size: 9, design: .rounded)).foregroundStyle(.secondary).lineLimit(1)
                                            }
                                        }
                                        Divider().opacity(0.55)
                                        HStack(spacing: 8) {
                                            Image(systemName: care.alerts.enabled ? "bell.badge.fill" : "bell")
                                                .foregroundStyle(care.alerts.enabled ? OpenBotTheme.green : OpenBotTheme.purple)
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(care.alerts.enabled ? "Health alerts are on" : "Private-home health alerts")
                                                    .font(.system(size: 10, weight: .bold, design: .rounded))
                                                Text(care.alerts.enabled ? "Every \(care.alerts.intervalMinutes) min · \(care.alerts.destinationCount) ready device\(care.alerts.destinationCount == 1 ? "" : "s")" : "A quiet alert when this home needs you, and once when it recovers.")
                                                    .font(.system(size: 8.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(2)
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
                                        if let error = store.errorMessage {
                                            Text(error).font(.system(size: 8.5, design: .rounded)).foregroundStyle(.orange)
                                        }
                                    }
                                    .padding(10)
                                    .background(Color.black.opacity(0.025), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                }
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

                    if !attention.isEmpty {
                        VStack(alignment: .leading, spacing: 10) {
                            Label("Needs your attention", systemImage: "bell.badge.fill")
                                .font(.system(size: 14, weight: .bold, design: .rounded))
                                .foregroundStyle(Color(red: 0.55, green: 0.37, blue: 0.13))
                            ForEach(attention.prefix(5)) { run in
                                HStack(spacing: 10) {
                                    BotMascotView(colorHex: run.botColor, variant: run.botMascot, status: run.status == "failed" ? "failed" : "waiting", size: 38)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(run.status == "failed" ? "\(run.botName) needs a hand" : "\(run.botName) needs your okay")
                                            .font(.system(size: 12, weight: .bold, design: .rounded))
                                        Text(run.error ?? run.approvalReason ?? run.summary ?? "Open the conversation to continue.")
                                            .font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(2)
                                    }
                                    Spacer(minLength: 4)
                                    Button("Open") { onSelect(run.threadId) }
                                        .buttonStyle(.bordered).controlSize(.small)
                                }
                            }
                        }
                        .padding(14)
                        .background(Color(red: 1, green: 0.97, blue: 0.90), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Teammate desks")
                            .font(.system(size: 17, weight: .bold, design: .rounded))
                        ForEach(store.state.bots) { bot in
                            let run = runs.first(where: { $0.botId == bot.id })
                            Button { onSelect(bot.threadId) } label: {
                                HStack(spacing: 11) {
                                    BotMascotView(colorHex: bot.color, variant: bot.mascot, status: bot.status, size: 48)
                                    VStack(alignment: .leading, spacing: 4) {
                                        HStack {
                                            Text(bot.name).font(.system(size: 14, weight: .bold, design: .rounded))
                                            Text(bot.status.openBotRunLabel)
                                                .font(.system(size: 9, weight: .bold, design: .rounded))
                                                .foregroundStyle(OpenBotTheme.green)
                                                .padding(.horizontal, 7).padding(.vertical, 3)
                                                .background(OpenBotTheme.green.opacity(0.1), in: Capsule())
                                        }
                                        Text(run.map { liveRunDescription($0) } ?? "Ready for a new task")
                                            .font(.system(size: 11.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(2)
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
                }
                .padding(16)
            }
            .background(OpenBotTheme.paper)
            .navigationTitle("Live Studio")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.large])
    }

    private func liveStat(value: Int, label: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Image(systemName: icon).foregroundStyle(OpenBotTheme.purple)
            Text("\(value)").font(.system(size: 18, weight: .bold, design: .rounded))
            Text(label).font(.system(size: 10, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
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

    var body: some View {
        NavigationStack {
            List {
                Section("Together") {
                    ForEach(store.state.threads.filter { $0.kind == "room" }) { thread in
                        threadButton(thread, bots: store.state.bots)
                    }
                }
                Section("Your teammates") {
                    ForEach(store.state.threads.filter { $0.kind == "direct" }) { thread in
                        let bots = thread.botId.flatMap { id in store.state.bots.first(where: { $0.id == id }).map { [$0] } } ?? []
                        threadButton(thread, bots: bots)
                    }
                }
            }
            .navigationTitle("Conversations")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium, .large])
    }

    private func threadButton(_ thread: StudioThread, bots: [StudioBot]) -> some View {
        Button { onSelect(thread.id) } label: {
            HStack(spacing: 12) {
                MascotStack(bots: bots).frame(width: 62, height: 42)
                VStack(alignment: .leading, spacing: 2) {
                    Text(thread.title).font(.system(size: 15, weight: .bold, design: .rounded))
                    Text(thread.kind == "room" ? "Everyone together" : bots.first?.role ?? "Teammate")
                        .font(.system(size: 12, design: .rounded)).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                if thread.id == store.selectedThreadID { Image(systemName: "checkmark.circle.fill").foregroundStyle(OpenBotTheme.purple) }
            }
            .foregroundStyle(OpenBotTheme.ink)
            .padding(.vertical, 4)
        }
    }
}

private struct ConnectionSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: ConnectionSession
    @EnvironmentObject private var push: PushRegistration

    var body: some View {
        NavigationStack {
            List {
                Section("Connected studio") {
                    Label(session.displayAddress, systemImage: "lock.shield.fill")
                        .font(.system(.subheadline, design: .rounded))
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
        .presentationDetents([.medium])
    }
}

private struct NativeLoadingView: View {
    var body: some View {
        VStack(spacing: 16) {
            MascotPairView().frame(height: 126)
            ProgressView().tint(OpenBotTheme.purple)
            Text("Waking your studio…")
                .font(.system(size: 14, weight: .semibold, design: .rounded))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

private struct MascotStack: View {
    let bots: [StudioBot]
    var large = false

    var body: some View {
        HStack(spacing: large ? -17 : -12) {
            ForEach(Array(bots.prefix(3).enumerated()), id: \.element.id) { index, bot in
                BotMascotView(colorHex: bot.color, variant: bot.mascot, status: bot.status, size: large ? 70 : 34)
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var blinking = false
    @State private var floating = false

    private var motionDelay: Double {
        switch variant {
        case "nova", "orbit": return 0.08
        case "sprout", "sunny": return 0.42
        default: return 0.25
        }
    }

    private var motionDuration: Double {
        let variation = motionDelay * 0.7
        if status == "celebrating" { return 0.62 + variation }
        if status == "working" { return 0.72 + variation }
        return 1.65 + variation
    }

    private var movement: CGFloat {
        status == "celebrating" ? 4 : status == "working" ? 2.5 : status == "waiting" ? 1 : 1.5
    }

    private var baseColor: Color { Color(openBotHex: colorHex) }
    private var hasAntenna: Bool { !["blob", "pebble", "sprout"].contains(variant) }
    private var bodyWidth: CGFloat {
        switch variant {
        case "blob", "pebble": return size * 0.90
        case "sunny": return size * 0.70
        default: return size * 0.84
        }
    }
    private var bodyHeight: CGFloat {
        switch variant {
        case "sprout": return size * 0.73
        case "pebble": return size * 0.74
        case "sunny": return size * 0.70
        default: return size * 0.80
        }
    }
    private var bodyOffsetY: CGFloat {
        switch variant {
        case "sprout": return size * 0.065
        case "pebble": return size * 0.06
        default: return size * 0.03
        }
    }
    private var bodyCorner: CGFloat {
        switch variant {
        case "sunny": return bodyWidth * 0.50
        case "blob", "pebble": return bodyWidth * 0.38
        case "sprout": return bodyWidth * 0.36
        default: return bodyWidth * 0.30
        }
    }

    private var presenceColor: Color {
        switch status {
        case "failed": return .red
        case "waiting": return .orange
        case "working": return OpenBotTheme.purple
        case "offline": return .gray
        default: return OpenBotTheme.green
        }
    }

    var body: some View {
        ZStack {
            Ellipse()
                .fill(baseColor.opacity(0.24))
                .frame(width: size * 0.62, height: size * 0.09)
                .blur(radius: size * 0.045)
                .offset(y: size * 0.44)

            if hasAntenna { antenna }
            characterEars
            characterBody

            if status == "celebrating" {
                Text("✦")
                    .font(.system(size: size * 0.20, weight: .bold, design: .rounded))
                    .foregroundStyle(OpenBotTheme.lavender)
                    .scaleEffect(floating ? 1.2 : 0.65)
                    .offset(x: -size * 0.40, y: -size * 0.36)
                Text("·")
                    .font(.system(size: size * 0.27, weight: .bold, design: .rounded))
                    .foregroundStyle(OpenBotTheme.green)
                    .scaleEffect(floating ? 0.7 : 1.15)
                    .offset(x: size * 0.39, y: -size * 0.28)
            }

            Circle().fill(presenceColor)
                .frame(width: size * 0.18, height: size * 0.18)
                .overlay(Circle().stroke(.white, lineWidth: Swift.max(1.5, size * 0.045)))
                .offset(x: size * 0.36, y: size * 0.34)
        }
        .frame(width: size, height: size)
        .scaleEffect(status == "celebrating" ? (floating ? 1.04 : 0.98) : status == "waiting" && floating ? 0.98 : 1)
        .rotationEffect(.degrees(status == "working" || status == "celebrating" ? (floating ? 1.2 : -1.2) : 0))
        .offset(y: floating ? -movement : movement * 0.45)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Animated \(variant) teammate, \(status)")
        .task {
            guard !reduceMotion else { return }
            try? await Task.sleep(for: .milliseconds(Int(motionDelay * 1_000)))
            withAnimation(.easeInOut(duration: motionDuration).repeatForever(autoreverses: true)) { floating = true }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(Double.random(in: 2.2...5.2) * 1_000_000_000))
                withAnimation(.easeInOut(duration: 0.08)) { blinking = true }
                try? await Task.sleep(nanoseconds: 120_000_000)
                withAnimation(.easeInOut(duration: 0.1)) { blinking = false }
            }
        }
    }

    private var antenna: some View {
        ZStack {
            Capsule().fill(baseColor.opacity(0.88))
                .frame(width: Swift.max(1.5, size * 0.025), height: size * (variant == "sunny" ? 0.16 : 0.20))
            Circle().fill(baseColor)
                .overlay(Circle().fill(.white.opacity(0.30)).padding(size * 0.022))
                .overlay(Circle().stroke(.black.opacity(0.16), lineWidth: Swift.max(0.6, size * 0.012)))
                .frame(width: size * 0.12, height: size * 0.12)
                .offset(y: -size * 0.09)
        }
        .offset(y: -size * 0.39)
    }

    @ViewBuilder private var characterEars: some View {
        if variant == "sprout" {
            RoundedRectangle(cornerRadius: size * 0.10, style: .continuous)
                .fill(baseColor)
                .overlay(RoundedRectangle(cornerRadius: size * 0.10).fill(.white.opacity(0.15)))
                .frame(width: size * 0.26, height: size * 0.20)
                .rotationEffect(.degrees(-32)).offset(x: -size * 0.13, y: -size * 0.36)
            RoundedRectangle(cornerRadius: size * 0.10, style: .continuous)
                .fill(baseColor)
                .overlay(RoundedRectangle(cornerRadius: size * 0.10).fill(.white.opacity(0.15)))
                .frame(width: size * 0.26, height: size * 0.20)
                .rotationEffect(.degrees(32)).offset(x: size * 0.13, y: -size * 0.36)
        } else if variant == "nova" || variant == "sunny" {
            RoundedRectangle(cornerRadius: size * 0.055, style: .continuous)
                .fill(baseColor.opacity(0.94))
                .frame(width: size * (variant == "sunny" ? 0.18 : 0.21), height: size * (variant == "sunny" ? 0.18 : 0.21))
                .rotationEffect(.degrees(43)).offset(x: -size * 0.35, y: -size * 0.12)
            RoundedRectangle(cornerRadius: size * 0.055, style: .continuous)
                .fill(baseColor.opacity(0.94))
                .frame(width: size * (variant == "sunny" ? 0.18 : 0.21), height: size * (variant == "sunny" ? 0.18 : 0.21))
                .rotationEffect(.degrees(43)).offset(x: size * 0.35, y: -size * 0.12)
        }
    }

    private var characterBody: some View {
        ZStack {
            RoundedRectangle(cornerRadius: bodyCorner, style: .continuous)
                .fill(baseColor)
            RoundedRectangle(cornerRadius: bodyCorner, style: .continuous)
                .fill(LinearGradient(colors: [.white.opacity(0.52), .clear, .black.opacity(0.16)], startPoint: .topLeading, endPoint: .bottomTrailing))
            RoundedRectangle(cornerRadius: bodyCorner, style: .continuous)
                .stroke(.black.opacity(0.16), lineWidth: Swift.max(0.7, size * 0.01))
            Ellipse().fill(.white.opacity(0.22))
                .frame(width: bodyWidth * 0.50, height: bodyHeight * 0.30)
                .rotationEffect(.degrees(-18))
                .offset(x: -bodyWidth * 0.17, y: -bodyHeight * 0.27)

            HStack(spacing: size * 0.09) {
                mascotEye
                mascotEye
            }
            .offset(y: -bodyHeight * 0.075)

            Ellipse().fill(Color(red: 1.0, green: 0.67, blue: 0.71).opacity(0.28))
                .frame(width: size * 0.075, height: size * 0.028)
                .offset(x: -size * 0.20, y: bodyHeight * 0.08)
            Ellipse().fill(Color(red: 1.0, green: 0.67, blue: 0.71).opacity(0.28))
                .frame(width: size * 0.075, height: size * 0.028)
                .offset(x: size * 0.20, y: bodyHeight * 0.08)
            mascotMouth.offset(y: bodyHeight * 0.15)

            if variant == "nova" || variant == "sprout" || variant == "sunny" {
                Text(variant == "nova" ? "✦" : variant == "sprout" ? "⌁" : "•")
                    .font(.system(size: size * 0.13, weight: .bold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.62))
                    .offset(x: bodyWidth * 0.34, y: bodyHeight * 0.34)
            }
        }
        .frame(width: bodyWidth, height: bodyHeight)
        .offset(y: bodyOffsetY)
        .shadow(color: baseColor.opacity(0.24), radius: size * 0.12, y: size * 0.07)
    }

    private var mascotEye: some View {
        Capsule()
            .fill(OpenBotTheme.ink)
            .frame(width: size * (blinking || status == "celebrating" ? 0.105 : 0.075), height: blinking || status == "celebrating" ? Swift.max(1.4, size * 0.022) : size * 0.105)
            .animation(.easeInOut(duration: 0.09), value: blinking)
    }

    @ViewBuilder private var mascotMouth: some View {
        if status == "celebrating" {
            Capsule()
                .fill(OpenBotTheme.ink)
                .frame(width: size * 0.14, height: size * 0.105)
                .overlay(Capsule().fill(Color(red: 0.91, green: 0.47, blue: 0.57)).frame(height: size * 0.035).offset(y: size * 0.035).clipped())
        } else if status == "waiting" {
            Circle().stroke(OpenBotTheme.ink.opacity(0.75), lineWidth: Swift.max(1, size * 0.016))
                .frame(width: size * 0.07, height: size * 0.07)
        } else {
            MascotMouthShape(frowning: status == "failed")
                .stroke(OpenBotTheme.ink.opacity(0.78), style: StrokeStyle(lineWidth: Swift.max(1, size * 0.016), lineCap: .round))
                .frame(width: size * 0.12, height: size * 0.06)
        }
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

private extension String {
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
        display.timeStyle = .short
        display.dateStyle = .none
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
