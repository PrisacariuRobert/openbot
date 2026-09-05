import SwiftUI

struct DesktopPermissionsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "checkmark.shield.fill").font(.system(size: 17, weight: .semibold)).foregroundStyle(DesktopTheme.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Access & capabilities").font(.system(size: 17, weight: .bold, design: .rounded))
                    Text("Turn on only the tools each teammate needs.")
                        .font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                }
                Spacer()
                Button("Done") { dismiss() }.buttonStyle(.bordered).controlSize(.small)
            }
            .padding(.horizontal, 18).padding(.vertical, 13).background(.ultraThinMaterial)
            Divider().opacity(0.55)

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 10) {
                        Toggle(isOn: Binding(
                            get: { store.state.settings?.macAccessEnabled ?? false },
                            set: { enabled in Task { await store.setMacAccessEnabled(enabled) } }
                        )) {
                            Label("Files and visible apps on this Mac", systemImage: "desktopcomputer")
                                .font(.system(size: 13.5, weight: .bold, design: .rounded))
                        }
                        .toggleStyle(.switch)
                        Text("This is a studio-wide gate. OpenBot can use only allowed home folders and visible Accessibility controls; destructive or external actions still require approval.")
                            .font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary)
                    }
                    .padding(14).background(DesktopTheme.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 16, style: .continuous))

                    ForEach(store.state.bots) { bot in
                        VStack(alignment: .leading, spacing: 11) {
                            HStack(spacing: 10) {
                                DesktopMascotView(bot: bot, size: 35).frame(width: 39, height: 39)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(bot.name).font(.system(size: 14, weight: .bold, design: .rounded))
                                    Text(bot.role).font(.system(size: 10.5, design: .rounded)).foregroundStyle(.secondary)
                                }
                            }
                            Toggle("Private terminal and project tools", isOn: Binding(
                                get: { bot.computerEnabled ?? false },
                                set: { enabled in Task { await store.setBotCapabilities(bot, computerEnabled: enabled) } }
                            ))
                            Toggle("Private browser profile", isOn: Binding(
                                get: { bot.browserEnabled ?? false },
                                set: { enabled in Task { await store.setBotCapabilities(bot, browserEnabled: enabled) } }
                            ))
                            HStack(spacing: 6) {
                                Image(systemName: store.state.settings?.macAccessEnabled == true ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(store.state.settings?.macAccessEnabled == true ? DesktopTheme.green : .secondary)
                                Text(store.state.settings?.macAccessEnabled == true ? "Mac access follows the studio-wide gate" : "Mac files and apps are off for everyone")
                            }
                            .font(.system(size: 10.5, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                        }
                        .toggleStyle(.switch)
                        .padding(14).background(.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(.black.opacity(0.055)))
                    }

                    if let error = store.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 11.5, weight: .semibold, design: .rounded)).foregroundStyle(.orange)
                    }
                    Text("Code-project access is managed separately so a teammate can use a private computer without automatically receiving every repository.")
                        .font(.system(size: 10.5, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                }
                .padding(20)
            }
        }
        .frame(width: 680, height: 650).background(DesktopTheme.paper)
    }
}
