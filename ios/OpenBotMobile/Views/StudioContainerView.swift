import SwiftUI
import UniformTypeIdentifiers

struct StudioContainerView: View {
    @EnvironmentObject private var session: ConnectionSession
    @StateObject private var store: StudioStore
    @StateObject private var network = NetworkMonitor()
    @State private var showingThreads = false
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
                    onThreads: { showingThreads = true },
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
        .task { await store.start() }
        .onDisappear { store.stop() }
        .onChange(of: store.needsAuthentication) { _, expired in
            if expired { session.sessionExpired() }
        }
        .sheet(isPresented: $showingThreads) {
            ThreadPickerView(store: store) { id in
                showingThreads = false
                Task { await store.chooseThread(id) }
            }
        }
        .sheet(isPresented: $showingSettings) { ConnectionSettingsView() }
    }
}

private struct StudioHeader: View {
    let title: String
    let bots: [StudioBot]
    let isLive: Bool
    let onThreads: () -> Void
    let onSettings: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onThreads) {
                Image(systemName: "line.3.horizontal")
                    .font(.system(size: 17, weight: .medium))
                    .frame(width: 32, height: 40)
            }
            .accessibilityLabel("Open conversations")

            MascotStack(bots: bots).frame(width: bots.count > 1 ? 70 : 40, height: 42)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(OpenBotTheme.ink)
                    .lineLimit(1)
                    .accessibilityIdentifier("studio-native-title")
                HStack(spacing: 5) {
                    Circle().fill(isLive ? OpenBotTheme.green : .orange).frame(width: 7, height: 7)
                    Text(isLive ? "Live on your Mac" : "Reconnecting…")
                        .font(.system(size: 10.5, weight: .semibold, design: .rounded))
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button(action: onSettings) {
                Image(systemName: "ellipsis")
                    .font(.system(size: 18, weight: .bold))
                    .frame(width: 32, height: 40)
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
                            bot: message.senderId.flatMap { id in store.state.bots.first(where: { $0.id == id }) }
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
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
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
                        isUser ? AnyShapeStyle(OpenBotTheme.purple) : AnyShapeStyle(Color(red: 0.933, green: 0.925, blue: 0.91)),
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
                            HStack(spacing: 8) {
                                Image(systemName: attachment.kind.openBotAttachmentIcon)
                                    .foregroundStyle(OpenBotTheme.purple)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(attachment.name).lineLimit(1)
                                    Text(attachment.size.openBotFileSize).font(.caption2).foregroundStyle(.secondary)
                                }
                                Spacer()
                            }
                            .font(.system(size: 12, weight: .semibold, design: .rounded))
                            .padding(9)
                            .background(.white.opacity(0.75), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                    }
                }
                Text(message.createdAt.openBotRelativeTime)
                    .font(.system(size: 9.5, weight: .regular, design: .rounded))
                    .foregroundStyle(.tertiary)
            }
            if !isUser { Spacer(minLength: 28) }
        }
        .frame(maxWidth: .infinity)
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
    @State private var draft = ""
    @State private var targetBotID: String?
    @State private var pendingFiles: [URL] = []
    @State private var showingFiles = false
    @FocusState private var focused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
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
                        .foregroundStyle(.secondary)
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
                            Button("\(workflow.name) · \(workflow.botName)") {
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

                Button { focused = true } label: {
                    Image(systemName: "mic")
                        .font(.system(size: 17, weight: .medium))
                        .frame(width: 27, height: 38)
                        .foregroundStyle(.secondary)
                }
                .accessibilityLabel("Use iPhone dictation")

                Button(action: send) {
                    Group {
                        if store.isSending { ProgressView().tint(.white) }
                        else { Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold)) }
                    }
                    .frame(width: 42, height: 42)
                    .foregroundStyle(.white)
                    .background(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Color.gray.opacity(0.35) : OpenBotTheme.purple, in: Circle())
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
        .onChange(of: store.selectedThreadID) { _, _ in targetBotID = nil }
        .fileImporter(isPresented: $showingFiles, allowedContentTypes: [.content, .data], allowsMultipleSelection: true) { result in
            if case .success(let files) = result {
                pendingFiles = Array(files.prefix(max(0, 6 - pendingFiles.count))) + pendingFiles
                pendingFiles = Array(pendingFiles.prefix(6))
            }
        }
    }

    private func send() {
        let message = draft
        Task {
            if await store.send(message, targetBotID: targetBotID, files: pendingFiles) {
                draft = ""
                pendingFiles = []
            }
        }
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

    var body: some View {
        NavigationStack {
            List {
                Section("Connected studio") {
                    Label(session.displayAddress, systemImage: "lock.shield.fill")
                        .font(.system(.subheadline, design: .rounded))
                    Label("The private key stays in this iPhone’s Keychain.", systemImage: "iphone.gen3")
                        .font(.footnote).foregroundStyle(.secondary)
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

    private var isCoreStudio: Bool {
        let kinds = Set(bots.prefix(3).map(\.mascot))
        return bots.count >= 3 && kinds.contains("nova") && kinds.contains("blob") && kinds.contains("sprout")
    }

    var body: some View {
        Group {
            if isCoreStudio {
                Image("MascotStudio")
                    .resizable()
                    .scaledToFit()
                    .frame(width: large ? 176 : 78, height: large ? 88 : 42)
            } else {
                HStack(spacing: large ? -10 : -5) {
                    ForEach(Array(bots.prefix(3).enumerated()), id: \.element.id) { index, bot in
                        BotMascotView(colorHex: bot.color, variant: bot.mascot, status: bot.status, size: large ? 70 : 34)
                            .zIndex(Double(3 - index))
                    }
                }
            }
        }
    }
}

private struct BotMascotView: View {
    let colorHex: String
    let variant: String
    let status: String
    let size: CGFloat
    @State private var blinking = false
    @State private var floating = false

    private var assetName: String {
        switch variant {
        case "nova", "orbit": return "MascotNova"
        case "sprout", "sunny": return "MascotScout"
        default: return "MascotPixel"
        }
    }

    private var faceColor: Color {
        switch variant {
        case "nova", "orbit": return Color(red: 0.31, green: 0.08, blue: 0.60)
        case "sprout", "sunny": return Color(red: 0.00, green: 0.56, blue: 0.39)
        default: return Color(red: 0.88, green: 0.18, blue: 0.38)
        }
    }

    private var movement: CGFloat {
        status == "working" ? 2.5 : status == "waiting" ? 1 : 1.5
    }

    var body: some View {
        ZStack {
            Image(assetName)
                .resizable()
                .scaledToFit()
                .frame(width: size, height: size)
                .shadow(color: Color(openBotHex: colorHex).opacity(0.18), radius: size * 0.13, y: size * 0.08)

            if blinking {
                HStack(spacing: size * 0.13) {
                    blinkEye
                    blinkEye
                }
                .offset(y: -size * 0.035)
            }

            Circle().fill(status == "failed" ? .red : status == "waiting" ? .orange : status == "working" ? OpenBotTheme.purple : OpenBotTheme.green)
                .frame(width: size * 0.18, height: size * 0.18)
                .overlay(Circle().stroke(.white, lineWidth: Swift.max(1.5, size * 0.045)))
                .offset(x: size * 0.36, y: size * 0.34)
        }
        .frame(width: size, height: size)
        .scaleEffect(status == "waiting" && floating ? 0.98 : 1)
        .rotationEffect(.degrees(status == "working" ? (floating ? 1.2 : -1.2) : 0))
        .offset(y: floating ? -movement : movement * 0.45)
        .task {
            withAnimation(.easeInOut(duration: status == "working" ? 0.75 : 1.8).repeatForever(autoreverses: true)) { floating = true }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(Double.random(in: 2.2...5.2) * 1_000_000_000))
                withAnimation(.easeInOut(duration: 0.08)) { blinking = true }
                try? await Task.sleep(nanoseconds: 120_000_000)
                withAnimation(.easeInOut(duration: 0.1)) { blinking = false }
            }
        }
    }

    private var blinkEye: some View {
        ZStack {
            Ellipse().fill(faceColor).frame(width: size * 0.14, height: size * 0.15)
            Capsule().fill(OpenBotTheme.ink).frame(width: size * 0.11, height: Swift.max(1.2, size * 0.025))
        }
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
