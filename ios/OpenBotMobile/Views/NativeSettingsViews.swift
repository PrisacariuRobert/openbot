import SwiftUI
import QuickLook
import UIKit

/// Conversation-first entry point. This list uses saved threads, not seeded personas.
struct NativeConversationList: View {
    @ObservedObject var store: StudioStore
    let onSelect: (String) -> Void
    let onSettings: () -> Void
    let onTeam: () -> Void
    let onActivity: () -> Void
    @State private var query = ""

    private var threads: [StudioThread] {
        store.state.threads.filter {
            $0.isVisibleConversation(in: store.state.bots) && (query.isEmpty || $0.title.localizedCaseInsensitiveContains(query) || ($0.lastMessage?.localizedCaseInsensitiveContains(query) ?? false))
        }.sorted { ($0.lastMessageAt ?? $0.updatedAt) > ($1.lastMessageAt ?? $1.updatedAt) }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("OpenBot").font(.system(size: 28, weight: .semibold)).accessibilityIdentifier("native-conversation-list-title")
                Spacer()
                Button(action: onTeam) { Image(systemName: "square.and.pencil").frame(width: 44, height: 44) }
                    .accessibilityLabel("New conversation")
            }.padding(.horizontal, 24).padding(.top, 12).padding(.bottom, 18)
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(StudioPalette.muted)
                TextField("Search", text: $query).textFieldStyle(.plain).accessibilityIdentifier("native-conversation-search")
            }.font(.system(size: 15)).padding(12).studioOutline(radius: 10).padding(.horizontal, 24).padding(.bottom, 18)
            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(threads) { thread in
                        Button { onSelect(thread.id) } label: {
                            HStack(spacing: 12) {
                                NativeThreadIdentity(store: store, thread: thread, size: 42).frame(width: 46)
                                VStack(alignment: .leading, spacing: 6) {
                                    let run = store.activeRuns.first { $0.threadId == thread.id }
                                    let needsAttention = store.state.attentionItems.contains { $0.threadID == thread.id }
                                    HStack {
                                        Text(thread.title).font(.system(size: 16, weight: .semibold)).lineLimit(1)
                                        Spacer(minLength: 8)
                                        if needsAttention {
                                            Label("Needs you", systemImage: "exclamationmark.circle.fill")
                                                .font(.system(size: 10, weight: .semibold)).foregroundStyle(OpenBotTheme.purple)
                                                .lineLimit(1).fixedSize().accessibilityLabel("Needs your attention")
                                        } else if let run {
                                            Label(run.status == "awaiting_approval" ? "Approval" : "Working", systemImage: run.status == "awaiting_approval" ? "checkmark.circle" : "ellipsis.circle")
                                                .font(.system(size: 10, weight: .semibold)).foregroundStyle(StudioPalette.muted)
                                                .lineLimit(1).fixedSize()
                                                .accessibilityLabel(run.status == "awaiting_approval" ? "Needs your approval" : "Working")
                                        }
                                        Text((thread.lastMessageAt ?? thread.updatedAt).openBotRelativeTime)
                                            .font(.system(size: 11)).foregroundStyle(StudioPalette.muted)
                                    }
                                    Text(thread.conversationPreview)
                                        .font(.system(size: 14)).foregroundStyle(StudioPalette.muted).lineLimit(2)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }.padding(.vertical, 19).contentShape(Rectangle())
                        }.buttonStyle(.plain).accessibilityIdentifier("native-thread-\(thread.id)")
                    }
                    if store.isLoading { ProgressView("Opening your conversations…").padding(.top, 60) }
                    else if threads.isEmpty {
                        ContentUnavailableView(query.isEmpty ? "Make room for a little help." : "No conversations found", systemImage: "bubble.left.and.bubble.right", description: Text(query.isEmpty ? "Create a teammate for something you want off your plate." : "Try another name or message."))
                        if query.isEmpty { Button("Create a teammate", action: onTeam).buttonStyle(.borderedProminent) }
                    }
                }.padding(.horizontal, 24)
            }
            if !store.state.attentionItems.isEmpty {
                Button(action: onActivity) {
                    HStack {
                        Label("Needs you", systemImage: "exclamationmark.bubble")
                        Spacer()
                        Text("\(store.state.attentionItems.count)").monospacedDigit()
                        Image(systemName: "chevron.right").font(.caption)
                    }.frame(minHeight: 44).contentShape(Rectangle())
                }.padding(.horizontal, 24).accessibilityIdentifier("native-needs-attention")
            }
            HStack {
                Button(action: onTeam) { Label("Your team", systemImage: "person.2") }
                Spacer()
                Button(action: onSettings) { Label("Settings", systemImage: "gearshape") }
            }.font(.system(size: 14)).foregroundStyle(StudioPalette.muted).padding(24)
        }
        .buttonStyle(.plain).tint(StudioPalette.ink).foregroundStyle(StudioPalette.ink)
        .background(StudioPalette.paper.ignoresSafeArea())
    }
}

private struct NativeThreadIdentity: View {
    @ObservedObject var store: StudioStore
    let thread: StudioThread
    var size: CGFloat = 42
    private var members: [StudioBot] {
        thread.members(in: store.state.bots)
    }
    var body: some View {
        ZStack {
            ForEach(Array(members.prefix(3).enumerated()), id: \.element.id) { index, bot in
                StudioCharacter(colorHex: bot.color, variant: bot.mascot, status: bot.status, size: members.count > 1 ? size * 0.58 : size, seed: bot.id)
                    .offset(x: (CGFloat(index) - CGFloat(min(members.count, 3) - 1) / 2) * size * 0.22)
            }
            if members.isEmpty { Image(systemName: "person.2").font(.system(size: 24)).foregroundStyle(StudioPalette.muted) }
        }.frame(width: size, height: size).accessibilityHidden(true)
    }
}

struct NativeSettingsCenter: View {
    @ObservedObject var store: StudioStore
    @Environment(\.dismiss) private var dismiss
    @State private var destination: Destination?
    @State private var more = false
    private enum Destination: String, Identifiable {
        case providers, apps, team, routines, devices, skills
        var id: String { rawValue }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    row("AI providers", "sparkles", .providers)
                    row("Connected apps", "square.grid.2x2", .apps)
                    row("Your team", "person.2", .team)
                    row("Routines", "clock", .routines)
                    row("You & devices", "iphone.and.arrow.forward", .devices)
                    DisclosureGroup("More settings", isExpanded: $more) {
                        row("Skills & extensions", "books.vertical", .skills)
                        Text("Project folders and host permissions are managed on your Mac. Their existing grants still apply to work started here.")
                            .font(.footnote).foregroundStyle(StudioPalette.muted).padding(.vertical, 16)
                    }.font(.subheadline).padding(.top, 26)
                }.padding(24)
            }.background(StudioPalette.paper)
                .navigationTitle("Settings").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } } }
        }.tint(StudioPalette.ink)
            .sheet(item: $destination) { target in
                switch target {
                case .providers: NativeAIChoiceView(store: store)
                case .apps: NativeConnectedAppsView(store: store)
                case .team: NativeTeamView(store: store)
                case .routines: ScheduledRoutinesView(store: store)
                case .devices: ConnectionSettingsView()
                case .skills: OpenExtensionsView(store: store, section: 1)
                }
            }
    }
    private func row(_ title: String, _ symbol: String, _ target: Destination) -> some View {
        Button { destination = target } label: {
            HStack(spacing: 14) {
                Image(systemName: symbol).frame(width: 26)
                Text(title).frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right").font(.system(size: 11)).foregroundStyle(StudioPalette.muted)
            }.padding(.vertical, 21).contentShape(Rectangle())
        }.buttonStyle(.plain).overlay(alignment: .bottom) { Rectangle().fill(StudioPalette.line).frame(height: 1) }
    }
}

struct NativeConversationDetails: View {
    @ObservedObject var store: StudioStore
    let onRoutines: () -> Void
    let onTeam: () -> Void
    let onWork: () -> Void
    let onActivity: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var previewURL: URL?
    @State private var computerBot: StudioBot?
    @State private var showingSearch = false
    @State private var showingProjects = false
    @State private var showingFiles = false
    private var runs: [StudioRun] { store.activeRuns.filter { $0.threadId == store.selectedThreadID } }
    private var files: [StudioAttachment] {
        var paths = Set<String>()
        return store.state.messages.filter { $0.threadId == store.selectedThreadID }.reversed()
            .flatMap(\.attachments).filter { paths.insert($0.id).inserted }
    }
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    if let thread = store.activeThread {
                        HStack(spacing: 16) {
                            NativeThreadIdentity(store: store, thread: thread, size: 54)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(thread.title).font(.title3.weight(.semibold))
                                Text(store.activeBot?.role ?? "Your team, together").font(.subheadline).foregroundStyle(StudioPalette.muted)
                            }
                        }
                    }
                    section("Current work") {
                        if runs.isEmpty { Text("No work is running right now.").foregroundStyle(StudioPalette.muted) }
                        ForEach(runs) { run in
                            Text(run.summary?.isEmpty == false ? run.summary! : run.botName)
                            Button(run.status == "awaiting_approval" ? "Review work" : "View progress", action: onActivity)
                        }
                        Button("Start a workflow", action: onWork)
                        Button("Activity & approvals", action: onActivity)
                    }
                    section("Routines") {
                        let routines = store.routines.filter { $0.threadId == store.selectedThreadID || $0.botId == store.activeBot?.id }
                        if routines.isEmpty { Text("Nothing scheduled yet.").foregroundStyle(StudioPalette.muted) }
                        ForEach(routines) { Text($0.name) }
                        Button("Add or manage routines", action: onRoutines)
                    }
                    section("Shared here") {
                        if files.isEmpty { Text("Files shared in this conversation will appear here.").foregroundStyle(StudioPalette.muted) }
                        ForEach(files) { file in
                            Button { Task { previewURL = await store.download(file) } } label: {
                                Label(file.name, systemImage: "doc.text").lineLimit(2).padding(.vertical, 5)
                            }
                        }
                    }
                    if let bot = store.activeBot {
                        section("Computer") { Button("Open \(bot.name)’s browser") { computerBot = bot } }
                    }
                    section("Studio") {
                        Button { showingSearch = true } label: { Label("Search everything", systemImage: "magnifyingglass") }
                        Button { showingProjects = true } label: { Label("Code projects", systemImage: "chevron.left.forwardslash.chevron.right") }
                        Button { showingFiles = true } label: { Label("Workspace & delivered files", systemImage: "folder") }
                    }
                    section("Teammate") { Button("Appearance & preferences", action: onTeam) }
                }.font(.system(size: 15)).padding(28)
            }.background(StudioPalette.paper).navigationTitle("Details").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }.tint(StudioPalette.ink).quickLookPreview($previewURL)
            .sheet(item: $computerBot) { bot in ComputerView(store: store, bot: bot) }
            .sheet(isPresented: $showingSearch) { NativeSearchView(store: store) }
            .sheet(isPresented: $showingProjects) { NativeProjectsView(store: store) }
            .sheet(isPresented: $showingFiles) { NativeFilesView(store: store) }
    }
    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title).font(.system(size: 13, weight: .semibold))
            content()
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.bottom, 25)
            .overlay(alignment: .bottom) { Rectangle().fill(StudioPalette.line).frame(height: 1) }
    }
}

struct NativeConnectedAppsView: View {
    @ObservedObject var store: StudioStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var expanded: String?
    @State private var disconnect: StudioConnectorCatalogEntry?
    @State private var adding = false
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Give your team the tools they need.").font(.subheadline).foregroundStyle(StudioPalette.muted).padding(.bottom, 24)
                    ForEach(store.connectorStatus?.catalog.filter { $0.availability != "next" && (adding ? !$0.connected : $0.connected) } ?? []) { app in
                        VStack(alignment: .leading, spacing: 16) {
                            Button { expanded = expanded == app.id ? nil : app.id } label: {
                                HStack(spacing: 16) {
                                    StudioBrandMark(provider: app.id)
                                    VStack(alignment: .leading, spacing: 5) {
                                        Text(app.name).font(.system(size: 16, weight: .medium))
                                        Text(app.connectionLabel).font(.system(size: 13)).foregroundStyle(StudioPalette.muted)
                                    }
                                    Spacer()
                                    Image(systemName: expanded == app.id ? "chevron.down" : "chevron.right").font(.caption)
                                }.contentShape(Rectangle())
                            }.buttonStyle(.plain)
                            if expanded == app.id {
                                Text(app.description ?? "").font(.footnote).foregroundStyle(StudioPalette.muted)
                                if !app.connected || app.writeConnected == false {
                                    Button(app.connected ? "Reconnect for actions" : "Connect \(app.name)") {
                                        Task { if let url = await store.beginConnectorConnection(app.id) { openURL(url) } }
                                    }.buttonStyle(.borderedProminent).disabled(store.isCheckingConnectors)
                                }
                                if app.connected {
                                    ForEach(store.state.bots) { bot in
                                        Picker(bot.name, selection: Binding(get: {
                                            let access = store.connectorStatus?.access?.first { $0.botId == bot.id && $0.service == app.id }
                                            return access?.canRead == true ? (access?.canSend == true ? 2 : 1) : 0
                                        }, set: { level in
                                            Task { await store.setConnectorAccess(serviceID: app.id, botID: bot.id, canRead: level > 0, canSend: level == 2) }
                                        })) {
                                            Text("No access").tag(0); Text("Read only").tag(1)
                                            if app.writeRequiresApproval == true && app.writeConnected != false { Text("Read & act").tag(2) }
                                        }.disabled(store.isCheckingConnectors)
                                    }
                                    Text("Sending, publishing, and deleting still need your approval.").font(.caption).foregroundStyle(StudioPalette.muted)
                                    if !["github", "google-calendar", "google-drive"].contains(app.id) {
                                        Button("Disconnect", role: .destructive) { disconnect = app }
                                    }
                                }
                            }
                        }.padding(.vertical, 22).overlay(alignment: .bottom) { Rectangle().fill(StudioPalette.line).frame(height: 1) }
                    }
                    if let error = store.errorMessage { Text(error).font(.callout).padding(.top, 20) }
                    if store.isCheckingConnectors && store.connectorStatus == nil { ProgressView("Checking apps…") }
                }.padding(24)
            }.background(StudioPalette.paper).navigationTitle(adding ? "Add an app" : "Connected apps").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) { Button(adding ? "Back" : "Done") { if adding { adding = false } else { dismiss() } } }
                    if !adding { ToolbarItem(placement: .primaryAction) { Button { adding = true } label: { Image(systemName: "plus") }.accessibilityLabel("Add app") } }
                }
        }.tint(StudioPalette.ink).task { await store.refreshConnectors() }
            .refreshable { await store.refreshConnectors() }
            .confirmationDialog("Disconnect this app for every teammate?", isPresented: Binding(get: { disconnect != nil }, set: { if !$0 { disconnect = nil } }), titleVisibility: .visible) {
                if let app = disconnect { Button("Disconnect \(app.name)", role: .destructive) { Task { await store.disconnectConnector(app.id) }; disconnect = nil } }
            }
    }
}
