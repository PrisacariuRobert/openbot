import SwiftUI

/// Grok Bot "Agent Computer" style screen for one teammate: watch the browser
/// work live, then take control only for the steps that need a human — a
/// password, a code, a check. Control is explicit and never granted by
/// watching. Approvals and access limits still apply.
struct ComputerView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    let bot: StudioBot

    @State private var inControl = false
    @State private var entry = ""
    @State private var address = ""

    private var liveImage: UIImage? {
        store.browserLiveFrame.flatMap(UIImage.init(data:))
    }

    private var snapshotImage: UIImage? {
        guard let encoded = store.browserComputer?.screenshot?.split(separator: ",", maxSplits: 1).last,
              let data = Data(base64Encoded: String(encoded)) else { return nil }
        return UIImage(data: data)
    }

    private var isLive: Bool { store.browserLiveState == "ready" && store.browserLiveFrame != nil }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    controlBar
                    screenSection
                    keyboardSection
                    Text("Control reaches only \(bot.name)’s already-running browser, and only while Take control is on. Approvals and access limits still apply; watching does not grant anything.")
                        .font(.system(size: 10.5, design: .default))
                        .foregroundStyle(.secondary)
                }
                .padding(16)
            }
            .background(OpenBotTheme.paper)
            .navigationTitle("\(bot.name)’s computer")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.large])
        .task {
            await store.refreshBrowser(botID: bot.id)
            await store.startLiveView(botID: bot.id)
            while !Task.isCancelled && store.browserLiveState == "unavailable" && store.browserLiveFrame == nil {
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                await store.refreshBrowser(botID: bot.id)
            }
        }
        .onDisappear { store.stopLiveView() }
    }

    private var controlBar: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Button {
                    inControl.toggle()
                } label: {
                    Label(inControl ? "In control — tap to act" : "Take control", systemImage: inControl ? "hand.tap.fill" : "hand.tap")
                        .font(.system(size: 12, weight: .bold, design: .default))
                }
                .buttonStyle(.borderedProminent)
                .tint(inControl ? Color(white: 0.2) : OpenBotTheme.purple)
                Spacer()
                if isLive {
                    Label("Live", systemImage: "circle.fill")
                        .font(.system(size: 9, weight: .bold, design: .default))
                        .foregroundStyle(OpenBotTheme.green)
                }
            }
            HStack(spacing: 8) {
                Image(systemName: "globe")
                    .foregroundStyle(.secondary)
                    .font(.system(size: 12, weight: .semibold))
                TextField("Open a page in this browser", text: $address)
                    .font(.system(size: 12, design: .default))
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    .autocorrectionDisabled()
                Button("Open") {
                    let target = address
                    guard !target.isEmpty else { return }
                    address = ""
                    Task { await store.openBrowser(botID: bot.id, url: target) }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(address.isEmpty || store.isTeaching)
            }
            .padding(.horizontal, 11)
            .frame(height: 40)
            .background(Color.white.opacity(0.88), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(.black.opacity(0.055)))
        }
    }

    private var screenSection: some View {
        GeometryReader { geo in
            ZStack {
                if let image = liveImage ?? snapshotImage {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(width: geo.size.width, height: geo.size.height)
                        .contentShape(Rectangle())
                        .gesture(SpatialTapGesture().onEnded { value in
                            guard inControl else { return }
                            let x = Double(value.location.x / max(geo.size.width, 1) * 1280)
                            let y = Double(value.location.y / max(geo.size.height, 1) * 820)
                            Task { await store.browserClick(botID: bot.id, x: x, y: y) }
                        })
                    if store.isTeaching {
                        ProgressView("Working…").padding(8)
                            .background(Color.white.opacity(0.85), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                } else {
                    VStack(spacing: 10) {
                        Image(systemName: "display").font(.system(size: 26, weight: .light)).foregroundStyle(.secondary)
                        Text(store.browserComputer?.browser == "ready"
                                ? "Browser is open. Waiting for the first frame…"
                                : "No browser open right now. Open a page above to begin.")
                            .font(.system(size: 11.5, design: .default))
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .aspectRatio(1280.0 / 820.0, contentMode: .fit)
        .background(Color(white: 0.965), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(.black.opacity(0.055)))
    }

    private var statusLine: String {
        if isLive { return store.browserComputer?.title ?? store.browserComputer?.currentUrl ?? "Live view" }
        if store.browserLiveState == "unavailable" { return "Snapshot only · live stream unavailable" }
        return "Waiting for activity"
    }

    private var keyboardSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(statusLine)
                .font(.system(size: 10.5, design: .default))
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                Image(systemName: "keyboard")
                    .foregroundStyle(.secondary)
                    .font(.system(size: 13, weight: .semibold))
                SecureField("Type into the selected field", text: $entry)
                    .font(.system(size: 12, design: .default))
                    .autocorrectionDisabled(true)
                    .textInputAutocapitalization(.never)
                Button("Replace") {
                    let value = entry
                    entry = ""
                    Task { await store.browserType(botID: bot.id, value: value, replace: true) }
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .disabled(entry.isEmpty || !inControl)
                Button("Type") {
                    let value = entry
                    entry = ""
                    Task { await store.browserType(botID: bot.id, value: value, replace: false) }
                }
                .buttonStyle(.borderedProminent)
                .tint(OpenBotTheme.purple)
                .controlSize(.small)
                .disabled(entry.isEmpty || !inControl)
            }
            .padding(.horizontal, 11)
            .frame(height: 44)
            .background(Color.white.opacity(0.88), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(.black.opacity(0.055)))
            HStack(spacing: 8) {
                ForEach(["Tab", "Enter", "Escape", "Backspace"], id: \.self) { key in
                    Button(key) {
                        Task { await store.browserKey(botID: bot.id, key: key) }
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .disabled(!inControl)
                }
            }
        }
    }
}
