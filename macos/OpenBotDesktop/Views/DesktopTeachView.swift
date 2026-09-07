import AppKit
import SwiftUI

struct DesktopTeachView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    @State private var botID = ""
    @State private var skillName = ""
    @State private var startURL = "https://"
    @State private var privateEntry = ""
    @State private var savedSkill: StudioSkill?

    private var bot: StudioBot? { store.state.bots.first(where: { $0.id == botID }) }
    private var recording: Bool { store.teachingStatus?.recording == true }
    private var screenshot: NSImage? { store.browserComputer?.screenshot.flatMap(Self.image(from:)) }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: recording ? "record.circle.fill" : "eye.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(recording ? Color.primary : DesktopTheme.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text(recording ? "Teaching in progress" : "Teach a browser skill")
                        .font(.system(size: 17, weight: .bold, design: .default))
                    Text(recording ? "OpenBot is learning the meaningful steps you demonstrate." : "Show a teammate once, then reuse the reviewed workflow whenever you need it.")
                        .font(.system(size: 11, weight: .medium, design: .default)).foregroundStyle(.secondary)
                }
                Spacer()
                DesktopPanelCloseButton()
            }
            .padding(.horizontal, 32).padding(.top, 32).padding(.bottom, 24).background(StudioPalette.paper)
            Divider().opacity(0.55)

            if recording {
                recordingView
            } else {
                setupView
            }
        }
        .desktopPanelSize(width: 880, height: 720)
        .background(DesktopTheme.paper)
        .onAppear {
            if botID.isEmpty { botID = store.state.bots.first?.id ?? "" }
        }
        .onChange(of: botID) { _, id in
            savedSkill = nil
            Task { await store.refreshTeaching(botID: id, reportErrors: true) }
        }
        .task(id: botID) {
            guard !botID.isEmpty else { return }
            await store.refreshTeaching(botID: botID, reportErrors: true)
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(recording ? 1.4 : 3.0))
                if !Task.isCancelled { await store.refreshTeaching(botID: botID) }
            }
        }
    }

    private var setupView: some View {
        HStack(spacing: 32) {
            VStack(alignment: .leading, spacing: 16) {
                if let bot {
                    DesktopMascotView(bot: bot, size: 118).frame(width: 142, height: 126)
                    Text("Show \(bot.name) how you do it")
                        .font(.system(size: 27, weight: .bold, design: .default))
                    Text("A separate browser opens on the OpenBot host. Click through the task normally. Passwords and fields labelled as secrets are replaced with placeholders before the skill is saved.")
                        .font(.system(size: 13, weight: .medium, design: .default)).foregroundStyle(.secondary).lineSpacing(3)
                }
                Label("One browser profile per teammate", systemImage: "person.crop.circle.badge.checkmark")
                Label("Review, edit, export, or delete it later", systemImage: "checkmark.shield")
                Label("No chat history or credentials are copied", systemImage: "lock.fill")
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            VStack(alignment: .leading, spacing: 15) {
                Text("New skill").font(.system(size: 20, weight: .bold, design: .default))
                Picker("Teammate", selection: $botID) {
                    ForEach(store.state.bots) { Text("\($0.name) · \($0.role)").tag($0.id) }
                }
                .pickerStyle(.menu)

                VStack(alignment: .leading, spacing: 6) {
                    Text("What should it be called?").font(.system(size: 11.5, weight: .semibold, design: .default))
                    TextField("Update the weekly tracker", text: $skillName).textFieldStyle(.roundedBorder)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("Starting web page").font(.system(size: 11.5, weight: .semibold, design: .default))
                    TextField("https://example.com", text: $startURL).textFieldStyle(.roundedBorder)
                }
                if let savedSkill {
                    Label("/\(savedSkill.skillSlug) was saved for \(savedSkill.botName).", systemImage: "checkmark.circle.fill")
                        .font(.system(size: 11.5, weight: .semibold, design: .default)).foregroundStyle(DesktopTheme.green)
                }
                if let error = store.errorMessage {
                    Label(error, systemImage: "exclamationmark.circle.fill")
                        .font(.system(size: 11.5, weight: .semibold, design: .default)).foregroundStyle(Color.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Button {
                    Task {
                        savedSkill = nil
                        _ = await store.startTeaching(botID: botID, name: skillName, startURL: startURL)
                    }
                } label: {
                    HStack {
                        if store.isTeaching { ProgressView().controlSize(.small).tint(StudioPalette.userInk) }
                        else { Image(systemName: "eye.fill") }
                        Text(store.isTeaching ? "Opening teaching browser…" : "Start teaching")
                    }
                    .font(.system(size: 13.5, weight: .bold, design: .default))
                    .frame(maxWidth: .infinity, minHeight: 42)
                }
                .buttonStyle(.plain).foregroundStyle(StudioPalette.userInk)
                .background(DesktopTheme.purple, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .disabled(botID.isEmpty || skillName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !validStartURL || store.isTeaching)
            }
            .padding(22).frame(width: 370)
            .background(StudioPalette.surface, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(StudioPalette.line))
        }
        .padding(34)
    }

    private var recordingView: some View {
        VStack(spacing: 14) {
            HStack {
                if let bot {
                    DesktopMascotView(bot: StudioBot(
                        id: bot.id, name: bot.name, mascot: bot.mascot, color: bot.color, role: bot.role,
                        status: "working", threadId: bot.threadId, lastActiveAt: bot.lastActiveAt,
                        providerInstanceId: bot.providerInstanceId, model: bot.model,
                        computerEnabled: bot.computerEnabled, browserEnabled: bot.browserEnabled, macAccessEnabled: bot.macAccessEnabled
                    ), size: 42).frame(width: 48, height: 48)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(bot.name) is watching").font(.system(size: 14, weight: .bold, design: .default))
                        Text("\(store.teachingStatus?.stepCount ?? 0) meaningful actions captured")
                            .font(.system(size: 10.5, weight: .medium, design: .default)).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Text(store.browserComputer?.title ?? store.browserComputer?.currentUrl ?? "Teaching browser")
                    .font(.system(size: 10.5, design: .default)).foregroundStyle(.secondary).lineLimit(1).frame(maxWidth: 330)
                Button("Stop and save") {
                    Task {
                        if let skill = await store.stopTeaching(botID: botID) {
                            savedSkill = skill
                            skillName = ""
                        }
                    }
                }
                .buttonStyle(.borderedProminent).tint(DesktopTheme.green).disabled(store.isTeaching)
            }

            teachingScreen

            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Private keyboard", systemImage: "keyboard.badge.ellipsis")
                        .font(.system(size: 12, weight: .bold, design: .default))
                    Text("Choose a field on the preview, then type here. This text goes to the browser and is never put in chat.")
                        .font(.system(size: 10.5, design: .default)).foregroundStyle(.secondary)
                }.frame(width: 230, alignment: .leading)

                SecureField("Type into the selected field", text: $privateEntry)
                    .textFieldStyle(.roundedBorder).onSubmit { sendPrivateText(replace: false) }
                Button("Replace") { sendPrivateText(replace: true) }.disabled(privateEntry.isEmpty || store.isTeaching)
                Button("Type") { sendPrivateText(replace: false) }
                    .buttonStyle(.borderedProminent).tint(DesktopTheme.purple).disabled(privateEntry.isEmpty || store.isTeaching)
            }
            .controlSize(.small)

            HStack(spacing: 8) {
                Text("Keys").font(.system(size: 10.5, weight: .semibold, design: .default)).foregroundStyle(.secondary)
                ForEach(["Tab", "Enter", "Escape", "Backspace"], id: \.self) { key in
                    Button(key) { Task { await store.teachingKey(botID: botID, key: key) } }
                        .buttonStyle(.bordered).controlSize(.small).disabled(store.isTeaching)
                }
                Spacer()
                Label("Click the preview to control the teaching browser", systemImage: "cursorarrow.click.2")
                    .font(.system(size: 10.5, weight: .medium, design: .default)).foregroundStyle(.secondary)
            }

            if let error = store.errorMessage {
                Label(error, systemImage: "exclamationmark.circle.fill")
                    .font(.system(size: 11.5, weight: .semibold, design: .default)).foregroundStyle(Color.primary)
            }
        }
        .padding(18)
    }

    @ViewBuilder private var teachingScreen: some View {
        if let screenshot {
            GeometryReader { proxy in
                Image(nsImage: screenshot)
                    .resizable().interpolation(.medium).aspectRatio(1280.0 / 820.0, contentMode: .fit)
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .contentShape(Rectangle())
                    .gesture(DragGesture(minimumDistance: 0).onEnded { value in
                        let x = max(0, min(1280, value.location.x / max(1, proxy.size.width) * 1280))
                        let y = max(0, min(820, value.location.y / max(1, proxy.size.height) * 820))
                        Task { await store.teachingClick(botID: botID, x: x, y: y) }
                    })
                    .overlay(alignment: .bottomTrailing) {
                        if store.isTeaching { ProgressView().controlSize(.small).padding(9).background(.regularMaterial, in: Capsule()) }
                    }
            }
            .aspectRatio(1280.0 / 820.0, contentMode: .fit)
            .background(Color.black.opacity(0.88), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(StudioPalette.line))
        } else {
            VStack(spacing: 10) {
                ProgressView().controlSize(.large)
                Text("Opening the teaching browser…").font(.system(size: 13, weight: .bold, design: .default))
                Text("If the runner is on another computer, its screen will appear here automatically.")
                    .font(.system(size: 10.5, design: .default)).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .aspectRatio(1280.0 / 820.0, contentMode: .fit)
            .background(StudioPalette.surface, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        }
    }

    private var validStartURL: Bool {
        guard let url = URL(string: startURL), let scheme = url.scheme?.lowercased(), url.host != nil else { return false }
        return scheme == "https" || (scheme == "http" && ["localhost", "127.0.0.1"].contains(url.host?.lowercased() ?? ""))
    }

    private func sendPrivateText(replace: Bool) {
        guard !privateEntry.isEmpty else { return }
        let text = privateEntry
        privateEntry = ""
        Task { await store.teachingType(botID: botID, value: text, replace: replace) }
    }

    private static func image(from dataURL: String) -> NSImage? {
        guard dataURL.hasPrefix("data:image/"), let comma = dataURL.firstIndex(of: ",") else { return nil }
        let encoded = String(dataURL[dataURL.index(after: comma)...])
        guard let data = Data(base64Encoded: encoded) else { return nil }
        return NSImage(data: data)
    }
}
