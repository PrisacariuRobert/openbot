import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct DesktopConversationView: View {
    @ObservedObject var store: StudioStore
    @State private var replyingTo: StudioMessage?
    @State private var approvalForReview: StudioApproval?
    @State private var followingConversation = true
    @State private var showingGroupEditor = false

    private var messages: [StudioMessage] {
        store.state.messages.filter { $0.threadId == store.selectedThreadID }
    }

    var body: some View {
        VStack(spacing: 0) {
            conversationHeader
            if store.isLoading {
                VStack(spacing: 14) {
                    DesktopMascotStack(bots: store.state.bots, size: 56).frame(height: 68)
                    ProgressView().controlSize(.small)
                    Text("Waking your studio…").font(.subheadline).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.state.bots.isEmpty {
                VStack(spacing: 14) {
                    Image(systemName: "bubble.left.and.bubble.right").font(.system(size: 36, weight: .ultraLight)).foregroundStyle(.secondary)
                    Text("Make room for a little help.").font(.title2.weight(.semibold))
                    Text("Create a teammate for something you want off your plate. Start with one; add more when you need them.")
                        .font(.body).foregroundStyle(.secondary).multilineTextAlignment(.center).frame(maxWidth: 360)
                    Button("Create your first teammate") { NotificationCenter.default.post(name: .openBotShowTeammates, object: nil) }
                        .buttonStyle(.borderedProminent).tint(StudioPalette.accent).controlSize(.large).padding(.top, 4)
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                conversation
            }
        }
        .background(DesktopTheme.paper)
        .sheet(item: $approvalForReview) { approval in
            StudioApprovalReview(store: store, approval: approval)
        }
        .sheet(isPresented: $showingGroupEditor) { DesktopGroupEditor(store: store, thread: store.activeThread) }
    }

    private var conversationHeader: some View {
        HStack(spacing: 12) {
            let members = store.activeThread?.members(in: store.state.bots) ?? []
            DesktopMascotStack(bots: store.activeBot.map { [$0] } ?? members, size: 36)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(store.activeThread?.title ?? "Conversations")
                    .font(.system(size: 14, weight: .semibold)).lineLimit(1)
                Text(store.isLive ? (store.activeBot?.role ?? "Your team, together") : "Reconnecting…")
                    .font(.system(size: 11)).foregroundStyle(StudioPalette.muted).lineLimit(1)
            }
            Spacer(minLength: 16)
            Menu {
                Button("Search messages", systemImage: "magnifyingglass") { NotificationCenter.default.post(name: .openBotShowSearch, object: nil) }
                if store.activeThread?.kind == "room", store.selectedThreadID != "team-room" {
                    Button("Edit group", systemImage: "person.2") { showingGroupEditor = true }
                }
                Divider()
                Button("Start a workflow") { NotificationCenter.default.post(name: .openBotShowWork, object: nil) }
                Button("Activity & approvals") { NotificationCenter.default.post(name: .openBotShowLive, object: nil) }
                Button("Routines") { NotificationCenter.default.post(name: .openBotShowAutomations, object: nil) }
            } label: { Image(systemName: "ellipsis").frame(width: 28, height: 28) }
                .menuStyle(.borderlessButton).fixedSize().help("Conversation actions")
            Button { NotificationCenter.default.post(name: .openBotShowInspector, object: nil) } label: {
                Image(systemName: "sidebar.right").frame(width: 28, height: 28)
            }.buttonStyle(.plain).keyboardShortcut("i", modifiers: [.command, .option])
                .help("Conversation details (⌥⌘I)").accessibilityLabel("Conversation details")
        }
        .padding(.horizontal, 30).frame(height: 78)
        .background(StudioPalette.paper)
        .overlay(alignment: .bottom) { Rectangle().fill(StudioPalette.line).frame(height: 1) }
    }

    private var conversation: some View {
        ScrollViewReader { proxy in
            VStack(spacing: 0) {
                GeometryReader { viewport in
                ScrollView {
                    let visible = messages
                    LazyVStack(spacing: 2) {
                        if store.state.activeThreadId == store.selectedThreadID && !visible.contains(where: { $0.senderType == "user" }) {
                            conversationWelcome
                        }
                        if store.state.activeThreadId != store.selectedThreadID { ProgressView("Opening conversation…").padding(25) }
                        ForEach(Array(visible.enumerated()), id: \.element.id) { index, message in
                            let previous = index == 0 ? nil : visible[index - 1]
                            let startsGroup = DesktopConversationPresentation.startsGroup(message, after: previous)
                            if DesktopConversationPresentation.showsTimestamp(message, after: previous) {
                                Text(DesktopConversationPresentation.timestamp(message.createdAt))
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundStyle(.secondary)
                                    .padding(.top, index == 0 ? 0 : 22).padding(.bottom, 12)
                            }
                            DesktopMessageBubble(
                                message: message,
                                bot: message.senderId.flatMap { id in store.state.bots.first(where: { $0.id == id }) },
                                startsGroup: startsGroup,
                                showName: store.activeThread?.kind == "room",
                                maximumWidth: min(540, max(220, viewport.size.width * 0.82 - 40)),
                                onOpenAttachment: { attachment in
                                    if let url = await store.download(attachment) { NSWorkspace.shared.open(url) }
                                },
                                onReply: { replyingTo = message },
                                onReaction: { emoji in Task { await store.toggleReaction(messageID: message.id, emoji: emoji) } }
                            )
                            .padding(.top, startsGroup ? 12 : 3)
                            .id(message.id)
                        }
                        ForEach(store.activeRuns.filter { $0.threadId == store.selectedThreadID }) { run in
                            DesktopRunCard(
                                run: run,
                                canReview: store.state.approvals.contains { $0.runId == run.id && $0.botId == run.botId && $0.status == "pending" },
                                onReview: {
                                    approvalForReview = store.state.approvals.first { $0.runId == run.id && $0.botId == run.botId && $0.status == "pending" }
                                },
                                onCancel: { Task { await store.cancel(run) } }
                            )
                            .id("run-\(run.id)")
                        }
                        ForEach(store.state.failedRuns(in: store.selectedThreadID)) { run in
                            StudioFailureNotice(run: run) {
                                NotificationCenter.default.post(name: .openBotShowLive, object: nil)
                            }
                            .padding(.top, 14)
                            .id("failed-\(run.id)")
                        }
                        Color.clear.frame(height: 1).id("conversation-end")
                            .background(GeometryReader { geometry in
                                Color.clear.preference(key: DesktopConversationEndKey.self,
                                    value: geometry.frame(in: .named("conversation-scroll")).maxY)
                            })
                    }
                    .frame(maxWidth: 680)
                    .frame(minHeight: max(0, viewport.size.height - 44), alignment: .top)
                    .padding(.horizontal, 38).padding(.top, 28).padding(.bottom, 24)
                    .frame(maxWidth: .infinity)
                }
                .coordinateSpace(name: "conversation-scroll")
                .defaultScrollAnchor(.bottom)
                .onPreferenceChange(DesktopConversationEndKey.self) { bottom in
                    followingConversation = bottom <= viewport.size.height + 60
                }
                .onChange(of: messages.last?.id) { _, _ in
                    if followingConversation { proxy.scrollTo("conversation-end", anchor: .bottom) }
                }
                .onChange(of: store.activeRuns) { _, _ in
                    if followingConversation { proxy.scrollTo("conversation-end", anchor: .bottom) }
                }
                .task(id: store.state.activeThreadId) {
                    guard store.state.activeThreadId == store.selectedThreadID else { return }
                    proxy.scrollTo("conversation-end", anchor: .bottom)
                }
                .overlay(alignment: .bottomTrailing) {
                    if !followingConversation && !messages.isEmpty {
                        Button {
                            followingConversation = true
                            withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo("conversation-end", anchor: .bottom) }
                        } label: {
                            Label("Latest messages", systemImage: "arrow.down")
                                .font(.callout.weight(.medium)).padding(.horizontal, 12).padding(.vertical, 8)
                                .background(.regularMaterial, in: Capsule())
                                .overlay(Capsule().strokeBorder(StudioPalette.line))
                        }
                        .buttonStyle(.plain).padding(16)
                    }
                }
                }
                DesktopComposer(store: store, replyingTo: $replyingTo)
            }
        }
    }

    private var conversationWelcome: some View {
        VStack(spacing: 12) {
            DesktopMascotStack(bots: store.activeBot.map { [$0] } ?? store.state.bots, size: 64)
                .frame(width: 170, height: 76)
            Text(store.activeBot?.name ?? "What would you like to work on?")
                .font(.largeTitle.weight(.semibold))
            Text(store.activeBot?.role ?? "Start with an idea, a question or something on your list. Your teammates will take it from here.")
                .font(.body)
                .foregroundStyle(.secondary).multilineTextAlignment(.center)
                .frame(maxWidth: 420)
        }
        .padding(.vertical, 72)
    }
}

private struct DesktopMessageBubble: View {
    let message: StudioMessage
    let bot: StudioBot?
    var startsGroup: Bool = true
    var showName: Bool = true
    var maximumWidth: CGFloat = 540
    let onOpenAttachment: (StudioAttachment) async -> Void
    let onReply: () -> Void
    let onReaction: (String) -> Void

    private var isUser: Bool { message.senderType == "user" }

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
        .padding(.vertical, 8)
        .frame(maxWidth: 420, alignment: .leading)
        .padding(.vertical, 4)
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

    var body: some View {
        Group {
            if message.isEventCard {
                eventCard
            } else if message.senderType == "system" {
                Text(message.body)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            } else if isUser {
                HStack(alignment: .bottom, spacing: 0) {
                    Spacer(minLength: 40)
                    VStack(alignment: .trailing, spacing: 6) {
                        messageBody
                        reactionsRow
                    }
                    .frame(maxWidth: maximumWidth, alignment: .trailing)
                }
            } else {
                HStack(alignment: .bottom, spacing: 8) {
                    if showName, let displayBot = bot ?? fallbackBot {
                        DesktopMascotView(bot: displayBot, size: 26)
                            .opacity(startsGroup ? 1 : 0)
                    }
                    VStack(alignment: .leading, spacing: 4) {
                        if showName && startsGroup {
                            Text(message.senderName)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        messageBody
                        reactionsRow
                    }
                    .frame(maxWidth: maximumWidth, alignment: .leading)
                    Spacer(minLength: 20)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .help("\(message.senderName) · \(message.createdAt.desktopTime)")
        .contextMenu {
            Button { onReply() } label: { Label("Reply", systemImage: "arrowshape.turn.up.left") }
            Menu("React") {
                ForEach(["👍", "❤️", "✅", "👀", "🎉"], id: \.self) { emoji in
                    Button(emoji) { onReaction(emoji) }
                }
            }
            Menu("Copy") {
                Button("Message") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(message.body, forType: .string) }
                Button("Time and sender") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString("\(message.senderName) · \(message.createdAt.desktopTime)", forType: .string) }
            }
        }
    }

    @ViewBuilder
    private var reactionsRow: some View {
        if let reactions = message.reactions, !reactions.isEmpty {
            HStack(spacing: 4) {
                ForEach(reactions) { reaction in
                    Button { onReaction(reaction.emoji) } label: {
                        Text("\(reaction.emoji) \(reaction.count)")
                            .font(.caption)
                            .padding(.horizontal, 7).padding(.vertical, 3)
                            .background(reaction.reactedByYou ? StudioPalette.ink.opacity(0.08) : StudioPalette.surface, in: Capsule())
                    }.buttonStyle(.plain)
                }
            }
        }
    }

    private var messageBody: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let reply = message.replyTo {
                HStack(spacing: 7) {
                    RoundedRectangle(cornerRadius: 1.5).fill(StudioPalette.ink.opacity(0.22))
                        .frame(width: 2, height: 22)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(reply.senderName).font(.caption2.weight(.semibold))
                        Text(reply.body).font(.caption).opacity(0.75).lineLimit(2)
                    }
                }
            }
            Text(markdown: message.body)
                .font(.system(size: 14))
                .textSelection(.enabled)
                .lineSpacing(5)
                .tint(isUser ? StudioPalette.userInk : StudioPalette.ink)
            ForEach(message.attachments) { attachment in
                Button {
                    Task { await onOpenAttachment(attachment) }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: attachment.kind.desktopAttachmentIcon)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(attachment.name).lineLimit(1)
                            Text(attachment.size.desktopFileSize).font(.caption2).opacity(0.7)
                        }
                        Spacer(minLength: 4)
                        Image(systemName: "arrow.down.circle")
                    }
                    .font(.caption)
                    .padding(14)
                    .frame(minWidth: 180, maxWidth: .infinity, alignment: .leading)
                    .background(isUser ? StudioPalette.userInk.opacity(0.1) : StudioPalette.paper, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(isUser ? StudioPalette.userInk.opacity(0.25) : StudioPalette.line))
                }
                .buttonStyle(.plain)
            }
            if !isUser, let updates = message.progressUpdates, !updates.isEmpty {
                DisclosureGroup("Work updates") {
                    VStack(alignment: .leading, spacing: 12) {
                        ForEach(Array(updates.enumerated()), id: \.offset) { _, update in
                            Text(markdown: update).textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }.padding(.top, 8)
                }.font(.system(size: 12)).foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, isUser ? 16 : 0).padding(.vertical, isUser ? 12 : 4)
        .background(isUser ? StudioPalette.userBubble : .clear,
                    in: RoundedRectangle(cornerRadius: 19, style: .continuous))
        .foregroundStyle(isUser ? StudioPalette.userInk : StudioPalette.ink)
    }

    private var fallbackBot: StudioBot? {
        guard !isUser else { return nil }
        return StudioBot(
            id: "sender-\(message.senderId ?? message.senderName)",
            name: message.senderName,
            mascot: message.senderMascot ?? "blob",
            color: message.senderColor ?? "#6D5BD8",
            role: "Teammate",
            status: "ready",
            threadId: message.threadId,
            lastActiveAt: message.createdAt
        )
    }
}

private struct DesktopRunCard: View {
    let run: StudioRun
    let canReview: Bool
    let onReview: () -> Void
    let onCancel: () -> Void

    private var waiting: Bool { run.status == "awaiting_approval" }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            let bot = StudioBot(id: run.botId, name: run.botName, mascot: run.botMascot, color: run.botColor, role: "Teammate", status: waiting ? "waiting" : "working", threadId: run.threadId, lastActiveAt: nil)
            DesktopMascotView(bot: bot, size: 28)
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    Text(run.botName).font(.subheadline.weight(.medium))
                    Text(run.status.desktopConversationRunLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if !waiting { ProgressView().controlSize(.mini) }
                }
                Text(markdown: run.partialText ?? run.approvalReason ?? "Working through the next step")
                    .font(.subheadline).foregroundStyle(.secondary).lineLimit(5)
                HStack {
                    if waiting {
                        Button("Stop task", action: onCancel).buttonStyle(.bordered)
                        Button("Review request", action: onReview).buttonStyle(.borderedProminent).tint(StudioPalette.accent).disabled(!canReview)
                    } else {
                        Button("Stop", action: onCancel).buttonStyle(.borderless).foregroundStyle(.secondary)
                    }
                }
                .controlSize(.small)
                if waiting && !canReview {
                    Text("Waiting for the full request before you can review it.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
        .padding(.top, 10)
        .frame(maxWidth: 640, alignment: .leading)
    }
}

private struct DesktopComposer: View {
    @ObservedObject var store: StudioStore
    @Binding var replyingTo: StudioMessage?
    @State private var drafts: [String: String] = [:]
    @State private var lastRemoteBodies: [String: String] = [:]
    @State private var targets: [String: String] = [:]
    @State private var filesByThread: [String: [URL]] = [:]
    @State private var choosingFiles = false
    @State private var fileThreadID: String?
    @State private var saveTasks: [String: Task<Void, Never>] = [:]
    @FocusState private var focused: Bool

    private var draft: String { drafts[store.selectedThreadID] ?? "" }
    private var files: [URL] { filesByThread[store.selectedThreadID] ?? [] }
    private var targetBotID: String? { targets[store.selectedThreadID] }
    private var draftBinding: Binding<String> {
        Binding(get: { draft }, set: { updateDraft($0, threadID: store.selectedThreadID) })
    }

    var body: some View {
        VStack(spacing: 8) {
            if store.activeThread?.kind == "room", targetBotID != nil {
                HStack(spacing: 6) {
                    Text("To \(targetName)").font(.caption).foregroundStyle(.secondary)
                    Button { targets[store.selectedThreadID] = nil } label: { Image(systemName: "xmark.circle.fill") }
                        .buttonStyle(.plain).foregroundStyle(.secondary).help("Let the team choose")
                    Spacer()
                }
                .padding(.horizontal, 16)
            }
            VStack(alignment: .leading, spacing: 8) {
                if let reply = replyingTo {
                    HStack(spacing: 8) {
                        Image(systemName: "arrowshape.turn.up.left")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: 1) {
                            Text("Replying to \(reply.senderName)").font(.caption.weight(.semibold))
                            Text(reply.body).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer()
                        Button { replyingTo = nil } label: { Image(systemName: "xmark.circle.fill") }.buttonStyle(.plain).foregroundStyle(.tertiary)
                    }
                }
                if !files.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(files, id: \.self) { file in
                                HStack(spacing: 5) {
                                    Image(systemName: "doc")
                                    Text(file.lastPathComponent).lineLimit(1)
                                    Button { filesByThread[store.selectedThreadID]?.removeAll { $0 == file } } label: { Image(systemName: "xmark.circle.fill") }
                                        .buttonStyle(.plain).help("Remove \(file.lastPathComponent)")
                                }
                                .font(.caption)
                                .padding(.horizontal, 8).padding(.vertical, 5)
                                .background(StudioPalette.surface, in: Capsule())
                            }
                        }
                    }
                }
                HStack(alignment: .center, spacing: 8) {
                    Button { fileThreadID = store.selectedThreadID; choosingFiles = true } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 15, weight: .medium))
                            .frame(width: 28, height: 28)
                    }
                    .buttonStyle(.plain).foregroundStyle(.secondary).help("Attach files")
                    .accessibilityLabel("Attach files")
                    .disabled(store.isSending)
                    if store.activeThread?.kind == "room" {
                        Menu {
                            Button("Your team") { targets[store.selectedThreadID] = nil }
                            Divider()
                            ForEach(store.state.bots) { bot in Button(bot.name) { targets[store.selectedThreadID] = bot.id } }
                        } label: {
                            Image(systemName: "at")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(targetBotID == nil ? .secondary : StudioPalette.ink)
                                .frame(width: 22, height: 28)
                        }
                        .menuIndicator(.hidden)
                        .buttonStyle(.plain)
                        .help(targetName)
                    }
                    TextField("Message \(store.activeThread?.title ?? "your team")", text: draftBinding, axis: .vertical)
                        .textFieldStyle(.plain)
                        .font(.system(size: 14))
                        .lineLimit(1...6)
                        .focused($focused)
                        .onSubmit { if canSend { send() } }
                        .accessibilityLabel("Message \(store.activeThread?.title ?? "your team")")
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Button { send() } label: {
                        if store.isSending { ProgressView().controlSize(.small).tint(StudioPalette.userInk) }
                        else { Image(systemName: "arrow.up").font(.system(size: 12, weight: .bold)) }
                    }
                    .buttonStyle(.plain).foregroundStyle(StudioPalette.userInk)
                    .frame(width: 28, height: 28)
                    .background(canSend ? StudioPalette.accent : StudioPalette.ink.opacity(0.18), in: Circle())
                    .disabled(!canSend)
                    .keyboardShortcut(.return, modifiers: [.command])
                    .help("Send (⌘Return)")
                    .accessibilityLabel("Send message")
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 7)
            .background(StudioPalette.paper, in: RoundedRectangle(cornerRadius: 23, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 23, style: .continuous).strokeBorder(StudioPalette.line))
            if let error = store.errorMessage {
                Label(error, systemImage: "exclamationmark.circle")
                    .font(.caption).foregroundStyle(.secondary).textSelection(.enabled)
            } else if !hasModel {
                Button { NotificationCenter.default.post(name: .openBotShowProviders, object: nil) } label: {
                    Label("Choose an AI connection so this teammate can work", systemImage: "sparkles")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: 680)
        .padding(.horizontal, 38).padding(.top, 14).padding(.bottom, 26)
        .frame(maxWidth: .infinity)
        .background(DesktopTheme.paper)
        .onReceive(NotificationCenter.default.publisher(for: .openBotFocusComposer)) { _ in focused = true }
        .onAppear { applyRemoteDraft() }
        .onChange(of: store.selectedThreadID) { _, _ in replyingTo = nil; applyRemoteDraft() }
        .onChange(of: store.activeDraft.updatedAt) { _, _ in applyRemoteDraft() }
        .fileImporter(isPresented: $choosingFiles, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            if case .success(let selected) = result {
                let targetThread = fileThreadID ?? store.selectedThreadID
                let previous = filesByThread[targetThread] ?? []
                let combined = previous + selected.filter { !previous.contains($0) }
                if combined.count > 6 { store.errorMessage = "Choose up to six files for one message." }
                else { filesByThread[targetThread] = combined }
            }
        }
    }

    private var targetName: String {
        targetBotID.flatMap { id in store.state.bots.first(where: { $0.id == id })?.name } ?? "Your team"
    }
    private var hasModel: Bool {
        let candidates = store.activeBot.map { [$0] } ?? store.state.bots.filter { targetBotID == nil || $0.id == targetBotID }
        return candidates.contains { !($0.providerInstanceId ?? "").isEmpty && !($0.model ?? "").isEmpty }
    }
    private var canSend: Bool { (!draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !files.isEmpty) && !store.isSending && store.state.activeThreadId == store.selectedThreadID }

    private func applyRemoteDraft() {
        let remote = store.activeDraft
        guard remote.threadId == store.selectedThreadID else { return }
        if drafts[remote.threadId] == nil || drafts[remote.threadId] == lastRemoteBodies[remote.threadId] {
            drafts[remote.threadId] = remote.body
        }
        lastRemoteBodies[remote.threadId] = remote.body
    }

    private func updateDraft(_ value: String, threadID: String) {
        drafts[threadID] = value
        saveTasks[threadID]?.cancel()
        saveTasks[threadID] = Task {
            try? await Task.sleep(for: .milliseconds(650))
            guard !Task.isCancelled else { return }
            await store.saveDraft(value, threadID: threadID)
        }
    }

    private func send() {
        let body = draft
        let attachments = files
        let replyID = replyingTo?.id
        let targetThreadID = store.selectedThreadID
        let selectedBot = targetBotID
        // No AI yet: sending would only fail on the host. Open the chooser now.
        guard hasModel else { NotificationCenter.default.post(name: .openBotShowProviders, object: nil); return }
        saveTasks[targetThreadID]?.cancel()
        Task {
            if await store.send(body, targetBotID: selectedBot, files: attachments, replyToID: replyID, threadID: targetThreadID) {
                // Sending clears the server draft. Re-save any newer typing
                // as well, even if its earlier autosave beat that clear.
                updateDraft(drafts[targetThreadID] == body ? "" : drafts[targetThreadID] ?? "", threadID: targetThreadID)
                filesByThread[targetThreadID]?.removeAll { attachments.contains($0) }
                if store.selectedThreadID == targetThreadID && replyingTo?.id == replyID { replyingTo = nil }
            } else if drafts[targetThreadID] == body {
                updateDraft(body, threadID: targetThreadID)
            }
        }
    }
}

private struct DesktopConversationEndKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

/// Display rules are independent of storage: search and grouping cannot change
/// conversations, grant access, or discard drafts.
enum DesktopConversationPresentation {
    static func date(_ value: String) -> Date? {
        let precise = ISO8601DateFormatter()
        precise.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return precise.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }

    static func conversations(_ threads: [StudioThread], bots: [StudioBot], matching query: String) -> [StudioThread] {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return threads.filter { thread in
            guard thread.hidden != true else { return false }
            let bot = bots.first { $0.id == thread.botId }
            let content = [thread.title, thread.lastMessage ?? "", bot?.name ?? "", bot?.role ?? ""].joined(separator: " ")
            return query.isEmpty || content.localizedCaseInsensitiveContains(query)
        }.sorted {
            let left = date($0.lastMessageAt ?? $0.updatedAt) ?? .distantPast
            let right = date($1.lastMessageAt ?? $1.updatedAt) ?? .distantPast
            return left == right ? $0.id < $1.id : left > right
        }
    }

    static func startsGroup(_ message: StudioMessage, after previous: StudioMessage?) -> Bool {
        guard let previous, message.threadId == previous.threadId,
              message.senderType != "system", previous.senderType != "system",
              message.senderType == previous.senderType,
              message.senderId == previous.senderId,
              message.senderName == previous.senderName,
              let now = date(message.createdAt), let before = date(previous.createdAt) else { return true }
        return now.timeIntervalSince(before) < 0 || now.timeIntervalSince(before) > 5 * 60
            || !Calendar.current.isDate(now, inSameDayAs: before)
    }

    static func showsTimestamp(_ message: StudioMessage, after previous: StudioMessage?) -> Bool {
        guard let previous, message.threadId == previous.threadId,
              let now = date(message.createdAt), let before = date(previous.createdAt) else { return true }
        return now.timeIntervalSince(before) >= 15 * 60 || !Calendar.current.isDate(now, inSameDayAs: before)
    }

    static func timestamp(_ value: String) -> String {
        guard let date = date(value) else { return "" }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        formatter.doesRelativeDateFormatting = true
        return formatter.string(from: date)
    }
}

private extension Text {
    init(markdown: String) {
        if let attributed = try? AttributedString(markdown: markdown, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)) {
            self.init(attributed)
        } else { self.init(markdown) }
    }
}

private extension String {
    var desktopTime: String {
        let precise = ISO8601DateFormatter()
        precise.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = precise.date(from: self) ?? ISO8601DateFormatter().date(from: self)
        guard let date else { return "" }
        let formatter = DateFormatter(); formatter.timeStyle = .short; formatter.dateStyle = .none
        return formatter.string(from: date)
    }
    var desktopConversationRunLabel: String {
        switch self {
        case "awaiting_approval": return "Needs your okay"
        case "waiting_for_teammate": return "Consulting a teammate"
        case "queued": return "Getting ready"
        case "running": return "Working now"
        default: return replacingOccurrences(of: "_", with: " ").capitalized
        }
    }
    var desktopAttachmentIcon: String {
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
    var desktopFileSize: String {
        if self < 1_000_000 { return "\(Swift.max(1, self / 1_000)) KB" }
        return String(format: "%.1f MB", Double(self) / 1_000_000)
    }
}
