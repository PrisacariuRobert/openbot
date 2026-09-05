import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct DesktopConversationView: View {
    @ObservedObject var store: StudioStore
    @State private var replyingTo: StudioMessage?

    var body: some View {
        VStack(spacing: 0) {
            conversationHeader
            Divider().opacity(0.55)
            if store.isLoading {
                VStack(spacing: 14) {
                    DesktopMascotStack(bots: store.state.bots, size: 60).frame(height: 76)
                    ProgressView().controlSize(.small)
                    Text("Waking your studio…").font(.system(size: 13, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                conversation
            }
        }
        .background(DesktopTheme.paper)
    }

    private var conversationHeader: some View {
        HStack(spacing: 11) {
            DesktopMascotStack(bots: store.activeBot.map { [$0] } ?? store.state.bots, size: 39)
                .frame(width: store.activeBot == nil ? 82 : 42, height: 45)
            VStack(alignment: .leading, spacing: 2) {
                Text(store.activeThread?.title ?? "The studio")
                    .font(.system(size: 16, weight: .bold, design: .rounded)).lineLimit(1)
                HStack(spacing: 5) {
                    Circle().fill(store.isLive ? DesktopTheme.green : .orange).frame(width: 6, height: 6)
                    Text(store.isLive ? "Live" : "Reconnecting…")
                        .font(.system(size: 10.5, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                }
            }
            Spacer()
            HStack(spacing: 7) {
                Button { NotificationCenter.default.post(name: .openBotShowSearch, object: nil) } label: { Image(systemName: "magnifyingglass") }
                    .help("Search the studio (⌘F)")
                Button { NotificationCenter.default.post(name: .openBotShowWork, object: nil) } label: { Image(systemName: "sparkles") }
                    .help("Start work")
                Button { NotificationCenter.default.post(name: .openBotShowLive, object: nil) } label: { Image(systemName: "rectangle.3.group") }
                    .help("Live Studio")
            }
            .buttonStyle(.bordered).controlSize(.small)
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(.ultraThinMaterial)
    }

    private var conversation: some View {
        ScrollViewReader { proxy in
            VStack(spacing: 0) {
                ScrollView {
                    LazyVStack(spacing: 15) {
                        if store.state.messages.isEmpty {
                            conversationWelcome
                        }
                        ForEach(store.state.messages) { message in
                            DesktopMessageBubble(
                                message: message,
                                bot: message.senderId.flatMap { id in store.state.bots.first(where: { $0.id == id }) },
                                onOpenAttachment: { attachment in
                                    if let url = await store.download(attachment) { NSWorkspace.shared.open(url) }
                                },
                                onReply: { replyingTo = message },
                                onReaction: { emoji in Task { await store.toggleReaction(messageID: message.id, emoji: emoji) } }
                            )
                            .id(message.id)
                        }
                        ForEach(store.activeRuns) { run in
                            DesktopRunCard(
                                run: run,
                                onApprove: { Task { await store.approve(run) } },
                                onCancel: { Task { await store.cancel(run) } }
                            )
                            .id("run-\(run.id)")
                        }
                        Color.clear.frame(height: 1).id("conversation-end")
                    }
                    .frame(maxWidth: 760)
                    .padding(.horizontal, 22).padding(.vertical, 18)
                    .frame(maxWidth: .infinity)
                }
                .onChange(of: store.state.messages.count) { _, _ in
                    withAnimation(.easeOut(duration: 0.22)) { proxy.scrollTo("conversation-end", anchor: .bottom) }
                }
                .onChange(of: store.activeRuns) { _, _ in
                    withAnimation(.easeOut(duration: 0.22)) { proxy.scrollTo("conversation-end", anchor: .bottom) }
                }
                DesktopComposer(store: store, replyingTo: $replyingTo)
            }
        }
    }

    private var conversationWelcome: some View {
        VStack(spacing: 10) {
            DesktopMascotStack(bots: store.activeBot.map { [$0] } ?? store.state.bots, size: 72)
                .frame(width: 190, height: 86)
            Text(store.activeBot?.name ?? "Your studio")
                .font(.system(size: 22, weight: .bold, design: .rounded))
            Text(store.activeBot?.role ?? "Ask naturally. OpenBot picks the right teammate, or choose one before sending.")
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(.secondary).multilineTextAlignment(.center)
                .frame(maxWidth: 450)
        }
        .padding(.vertical, 46)
    }
}

private struct DesktopMessageBubble: View {
    let message: StudioMessage
    let bot: StudioBot?
    let onOpenAttachment: (StudioAttachment) async -> Void
    let onReply: () -> Void
    let onReaction: (String) -> Void

    private var isUser: Bool { message.senderType == "user" }

    var body: some View {
        HStack(alignment: .bottom, spacing: 9) {
            if isUser { Spacer(minLength: 100) }
            if !isUser, let displayBot = bot ?? fallbackBot {
                DesktopMascotView(bot: displayBot, size: 31)
            }
            VStack(alignment: isUser ? .trailing : .leading, spacing: 6) {
                if !isUser {
                    Text(message.senderName)
                        .font(.system(size: 10.5, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                }
                VStack(alignment: .leading, spacing: 8) {
                    if let reply = message.replyTo {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(reply.senderName).font(.system(size: 9.5, weight: .bold, design: .rounded))
                            Text(reply.body).font(.system(size: 10.5, design: .rounded)).lineLimit(2)
                        }
                        .padding(.horizontal, 9).padding(.vertical, 7).frame(maxWidth: .infinity, alignment: .leading)
                        .background((isUser ? Color.white : DesktopTheme.purple).opacity(0.13), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    Text(markdown: message.body)
                        .font(.system(size: 14, design: .rounded)).textSelection(.enabled)
                        .lineSpacing(2)
                    ForEach(message.attachments) { attachment in
                        Button {
                            Task { await onOpenAttachment(attachment) }
                        } label: {
                            HStack(spacing: 8) {
                                Image(systemName: attachment.kind.desktopAttachmentIcon)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(attachment.name).lineLimit(1)
                                    Text(attachment.size.desktopFileSize).font(.caption2).opacity(0.72)
                                }
                                Spacer(minLength: 4)
                                Image(systemName: "arrow.down.circle")
                            }
                            .font(.system(size: 11.5, weight: .semibold, design: .rounded))
                            .padding(9)
                            .frame(minWidth: 230)
                            .background(.white.opacity(0.35), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 13).padding(.vertical, 10)
                .background(
                    isUser
                        ? AnyShapeStyle(LinearGradient(colors: [Color(red: 0.45, green: 0.39, blue: 0.88), Color(red: 0.38, green: 0.32, blue: 0.82)], startPoint: .topLeading, endPoint: .bottomTrailing))
                        : AnyShapeStyle(DesktopTheme.botBubble),
                    in: RoundedRectangle(cornerRadius: 15, style: .continuous)
                )
                .foregroundStyle(isUser ? .white : DesktopTheme.ink)
                if let reactions = message.reactions, !reactions.isEmpty {
                    HStack(spacing: 5) {
                        ForEach(reactions) { reaction in
                            Button { onReaction(reaction.emoji) } label: {
                                Text("\(reaction.emoji) \(reaction.count)")
                                    .font(.system(size: 10.5, weight: .semibold, design: .rounded))
                                    .padding(.horizontal, 7).padding(.vertical, 3)
                                    .background(reaction.reactedByYou ? DesktopTheme.purple.opacity(0.13) : Color.black.opacity(0.045), in: Capsule())
                            }.buttonStyle(.plain)
                        }
                    }
                }
                Text(message.createdAt.desktopTime)
                    .font(.system(size: 9.5, design: .rounded)).foregroundStyle(.tertiary)
            }
            if !isUser { Spacer(minLength: 100) }
        }
        .frame(maxWidth: .infinity)
        .contextMenu {
            Button { onReply() } label: { Label("Reply", systemImage: "arrowshape.turn.up.left") }
            Menu("React") {
                ForEach(["👍", "❤️", "✅", "👀", "🎉"], id: \.self) { emoji in
                    Button(emoji) { onReaction(emoji) }
                }
            }
        }
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
    let onApprove: () -> Void
    let onCancel: () -> Void

    private var waiting: Bool { run.status == "awaiting_approval" }

    var body: some View {
        HStack(alignment: .top, spacing: 11) {
            let bot = StudioBot(id: run.botId, name: run.botName, mascot: run.botMascot, color: run.botColor, role: "Teammate", status: waiting ? "waiting" : "working", threadId: run.threadId, lastActiveAt: nil)
            DesktopMascotView(bot: bot, size: 38)
            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    Text(run.botName).font(.system(size: 12.5, weight: .bold, design: .rounded))
                    Text(run.status.desktopConversationRunLabel)
                        .font(.system(size: 9.5, weight: .semibold, design: .rounded))
                        .foregroundStyle(waiting ? .orange : DesktopTheme.purple)
                    Spacer()
                    if !waiting { ProgressView().controlSize(.mini) }
                }
                Text(markdown: run.partialText ?? run.approvalReason ?? "Working through the next step")
                    .font(.system(size: 12.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(6)
                HStack {
                    if waiting {
                        Button("Not now", action: onCancel).buttonStyle(.bordered)
                        Button("Approve", action: onApprove).buttonStyle(.borderedProminent).tint(DesktopTheme.purple)
                    } else {
                        Button("Stop", action: onCancel).buttonStyle(.borderless).foregroundStyle(.secondary)
                    }
                }
                .controlSize(.small)
            }
        }
        .padding(12)
        .frame(maxWidth: 620, alignment: .leading)
        .background(.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(DesktopTheme.purple.opacity(0.12)))
    }
}

private struct DesktopComposer: View {
    @ObservedObject var store: StudioStore
    @Binding var replyingTo: StudioMessage?
    @State private var draft = ""
    @State private var targetBotID: String?
    @State private var files: [URL] = []
    @State private var choosingFiles = false
    @State private var saveTask: Task<Void, Never>?
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            if let reply = replyingTo {
                HStack(spacing: 8) {
                    Image(systemName: "arrowshape.turn.up.left.fill").foregroundStyle(DesktopTheme.purple)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Replying to \(reply.senderName)").font(.system(size: 10.5, weight: .bold, design: .rounded))
                        Text(reply.body).font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                    Button { replyingTo = nil } label: { Image(systemName: "xmark.circle.fill") }.buttonStyle(.plain).foregroundStyle(.secondary)
                }
                .padding(.horizontal, 9).padding(.vertical, 6)
                .background(DesktopTheme.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            }
            if store.activeThread?.kind == "room" {
                Menu {
                    Button("Auto-pick the best teammate") { targetBotID = nil }
                    Divider()
                    ForEach(store.state.bots) { bot in Button(bot.name) { targetBotID = bot.id } }
                } label: {
                    Label(targetName, systemImage: "at")
                        .font(.system(size: 11, weight: .semibold, design: .rounded))
                        .foregroundStyle(DesktopTheme.purple)
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
            }
            if !files.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(files, id: \.self) { file in
                            HStack(spacing: 5) {
                                Image(systemName: "doc.fill")
                                Text(file.lastPathComponent).lineLimit(1)
                                Button { files.removeAll { $0 == file } } label: { Image(systemName: "xmark.circle.fill") }
                                    .buttonStyle(.plain)
                            }
                            .font(.system(size: 10.5, weight: .semibold, design: .rounded))
                            .padding(.horizontal, 8).padding(.vertical, 5)
                            .background(Color.black.opacity(0.04), in: Capsule())
                        }
                    }
                }
            }
            HStack(alignment: .bottom, spacing: 8) {
                Button { choosingFiles = true } label: { Image(systemName: "paperclip").frame(width: 28, height: 32) }
                    .buttonStyle(.plain).foregroundStyle(DesktopTheme.purple).help("Attach files")
                ZStack(alignment: .topLeading) {
                    if draft.isEmpty {
                        Text("Message \(store.activeThread?.title.lowercased() ?? "the studio")")
                            .font(.system(size: 13.5, design: .rounded)).foregroundStyle(.tertiary).padding(.top, 7).padding(.leading, 5)
                    }
                    TextEditor(text: $draft)
                        .font(.system(size: 13.5, design: .rounded))
                        .scrollContentBackground(.hidden)
                        .focused($focused)
                        .frame(minHeight: 34, maxHeight: 100)
                }
                Button { send() } label: {
                    if store.isSending { ProgressView().controlSize(.small).tint(.white) }
                    else { Image(systemName: "arrow.up").font(.system(size: 13, weight: .bold)) }
                }
                .buttonStyle(.plain).foregroundStyle(.white)
                .frame(width: 32, height: 32)
                .background(canSend ? DesktopTheme.purple : Color.gray.opacity(0.35), in: Circle())
                .disabled(!canSend)
                .keyboardShortcut(.return, modifiers: [.command])
                .help("Send (⌘Return)")
            }
            .padding(8)
            .background(.white.opacity(0.91), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(.black.opacity(0.09)))
        }
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 13)
        .background(.ultraThinMaterial)
        .onReceive(NotificationCenter.default.publisher(for: .openBotFocusComposer)) { _ in focused = true }
        .onAppear { applyRemoteDraft() }
        .onChange(of: store.selectedThreadID) { _, _ in applyRemoteDraft() }
        .onChange(of: store.activeDraft.updatedAt) { _, _ in applyRemoteDraft() }
        .onChange(of: draft) { _, value in
            saveTask?.cancel()
            saveTask = Task {
                try? await Task.sleep(for: .milliseconds(650))
                guard !Task.isCancelled else { return }
                await store.saveDraft(value)
            }
        }
        .fileImporter(isPresented: $choosingFiles, allowedContentTypes: [.item], allowsMultipleSelection: true) { result in
            if case .success(let selected) = result { files = Array(selected.prefix(6)) }
        }
    }

    private var targetName: String {
        targetBotID.flatMap { id in store.state.bots.first(where: { $0.id == id })?.name } ?? "Auto-pick a teammate"
    }
    private var canSend: Bool { (!draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !files.isEmpty) && !store.isSending }

    private func applyRemoteDraft() {
        let value = store.activeDraft.body
        if draft.isEmpty || draft == store.activeDraft.body { draft = value }
    }

    private func send() {
        let body = draft
        let attachments = files
        let replyID = replyingTo?.id
        draft = ""
        files = []
        replyingTo = nil
        Task {
            if !(await store.send(body, targetBotID: targetBotID, files: attachments, replyToID: replyID)) {
                draft = body
                files = attachments
                replyingTo = store.state.messages.first(where: { $0.id == replyID })
            }
        }
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
