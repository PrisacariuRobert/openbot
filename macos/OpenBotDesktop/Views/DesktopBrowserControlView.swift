import AppKit
import SwiftUI

struct DesktopBrowserControlView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    let bot: StudioBot
    @State private var address = "https://www.google.com/"
    @State private var privateEntry = ""

    private var status: StudioComputerStatus? {
        store.browserComputer?.botId == bot.id ? store.browserComputer : nil
    }
    private var screenshot: NSImage? { status?.screenshot.flatMap(Self.image(from:)) }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                DesktopMascotView(bot: bot, size: 38).frame(width: 43, height: 43)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(bot.name)’s browser").font(.system(size: 17, weight: .bold, design: .default))
                    Text("Guide the browser on the OpenBot host from this private window.")
                        .font(.system(size: 11, weight: .medium, design: .default)).foregroundStyle(.secondary)
                }
                Spacer()
                Label(status?.browser == "ready" ? "Connected" : "Ready on demand", systemImage: "circle.fill")
                    .font(.system(size: 9.5, weight: .bold, design: .default))
                    .foregroundStyle(status?.browser == "ready" ? DesktopTheme.green : .secondary)
                Button("Done") { dismiss() }.buttonStyle(.bordered).controlSize(.small)
            }
            .padding(.horizontal, 18).padding(.vertical, 12).background(.ultraThinMaterial)
            Divider().opacity(0.55)

            VStack(spacing: 13) {
                HStack(spacing: 8) {
                    Image(systemName: "globe").foregroundStyle(.secondary)
                    TextField("https://www.google.com/", text: $address)
                        .textFieldStyle(.plain).onSubmit { openAddress() }
                    Button {
                        openAddress()
                    } label: {
                        if store.isTeaching { ProgressView().controlSize(.small) }
                        else { Label("Open", systemImage: "arrow.up.right") }
                    }
                    .buttonStyle(.borderedProminent).tint(DesktopTheme.purple)
                    .disabled(!validAddress || store.isTeaching)
                }
                .padding(.horizontal, 12).frame(height: 42)
                .background(StudioPalette.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(StudioPalette.line))

                browserScreen

                HStack(alignment: .center, spacing: 10) {
                    Label("Private keyboard", systemImage: "lock.keyboard")
                        .font(.system(size: 11.5, weight: .bold, design: .default))
                    SecureField("Type into the selected field", text: $privateEntry)
                        .textFieldStyle(.roundedBorder).onSubmit { sendPrivateText(replace: false) }
                    Button("Replace") { sendPrivateText(replace: true) }
                        .disabled(privateEntry.isEmpty || store.isTeaching)
                    Button("Type") { sendPrivateText(replace: false) }
                        .buttonStyle(.borderedProminent).tint(DesktopTheme.purple)
                        .disabled(privateEntry.isEmpty || store.isTeaching)
                }
                .controlSize(.small)

                HStack(spacing: 8) {
                    Text("Keys").font(.system(size: 10.5, weight: .semibold, design: .default)).foregroundStyle(.secondary)
                    ForEach(["Tab", "Enter", "Escape", "Backspace"], id: \.self) { key in
                        Button(key) { Task { await store.browserKey(botID: bot.id, key: key) } }
                            .buttonStyle(.bordered).controlSize(.small).disabled(status?.browser != "ready" || store.isTeaching)
                    }
                    Spacer()
                    Text("Text sent through the private keyboard is not saved in chat or activity history.")
                        .font(.system(size: 9.5, design: .default)).foregroundStyle(.secondary)
                }

                if let error = store.errorMessage {
                    Label(error, systemImage: "exclamationmark.circle.fill")
                        .font(.system(size: 11.5, weight: .semibold, design: .default)).foregroundStyle(Color.primary)
                }
            }
            .padding(16)
        }
        .frame(width: 930, height: 720)
        .background(DesktopTheme.paper)
        .task {
            await store.refreshBrowser(botID: bot.id, reportErrors: true)
            if let current = status?.currentUrl { address = current }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1.5))
                if !Task.isCancelled { await store.refreshBrowser(botID: bot.id) }
            }
        }
        .onChange(of: status?.currentUrl) { _, value in
            if let value, !value.isEmpty { address = value }
        }
    }

    @ViewBuilder private var browserScreen: some View {
        if let screenshot {
            GeometryReader { proxy in
                Image(nsImage: screenshot)
                    .resizable().interpolation(.medium).aspectRatio(1280.0 / 820.0, contentMode: .fit)
                    .frame(width: proxy.size.width, height: proxy.size.height)
                    .contentShape(Rectangle())
                    .gesture(DragGesture(minimumDistance: 0).onEnded { value in
                        let x = max(0, min(1280, value.location.x / max(1, proxy.size.width) * 1280))
                        let y = max(0, min(820, value.location.y / max(1, proxy.size.height) * 820))
                        Task { await store.browserClick(botID: bot.id, x: x, y: y) }
                    })
                    .overlay(alignment: .bottomTrailing) {
                        Label("Click to control", systemImage: "cursorarrow.click.2")
                            .font(.system(size: 9.5, weight: .semibold, design: .default))
                            .padding(.horizontal, 9).padding(.vertical, 6).background(.regularMaterial, in: Capsule()).padding(9)
                    }
            }
            .aspectRatio(1280.0 / 820.0, contentMode: .fit)
            .background(Color.black.opacity(0.90), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(StudioPalette.line))
        } else {
            VStack(spacing: 11) {
                DesktopMascotView(bot: bot, size: 86).frame(width: 106, height: 94)
                Text("\(bot.name)’s browser is resting").font(.system(size: 17, weight: .bold, design: .default))
                Text("Open a page when you want to sign in, handle a private field, or guide the next step.")
                    .font(.system(size: 11, design: .default)).foregroundStyle(.secondary)
                Button("Start browser") { openAddress() }.buttonStyle(.borderedProminent).tint(DesktopTheme.purple)
                    .disabled(!validAddress || store.isTeaching)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .aspectRatio(1280.0 / 820.0, contentMode: .fit)
            .background(StudioPalette.surface, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(StudioPalette.line))
        }
    }

    private var validAddress: Bool {
        guard let url = URL(string: address), let scheme = url.scheme?.lowercased(), url.host != nil else { return false }
        return scheme == "https" || (scheme == "http" && ["localhost", "127.0.0.1"].contains(url.host?.lowercased() ?? ""))
    }

    private func openAddress() {
        guard validAddress else { return }
        Task { await store.openBrowser(botID: bot.id, url: address) }
    }

    private func sendPrivateText(replace: Bool) {
        guard !privateEntry.isEmpty else { return }
        let text = privateEntry
        privateEntry = ""
        Task { await store.browserType(botID: bot.id, value: text, replace: replace) }
    }

    private static func image(from dataURL: String) -> NSImage? {
        guard dataURL.hasPrefix("data:image/"), let comma = dataURL.firstIndex(of: ",") else { return nil }
        let encoded = String(dataURL[dataURL.index(after: comma)...])
        guard let data = Data(base64Encoded: encoded) else { return nil }
        return NSImage(data: data)
    }
}
