import SwiftUI

struct DesktopPermissionsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    @State private var expandedBotID: String?

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Permissions").font(.system(size: 20, weight: .semibold))
                    Text("You choose what your team can use.")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                }
                Spacer()
                DesktopPanelCloseButton()
            }
            .padding(.horizontal, 32).padding(.top, 32).padding(.bottom, 24).background(StudioPalette.paper)
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("On this Mac").font(.system(size: 13, weight: .semibold))
                        Toggle(isOn: Binding(
                            get: { store.state.settings?.macAccessEnabled ?? false },
                            set: { enabled in Task { await store.setMacAccessEnabled(enabled) } }
                        )) {
                            VStack(alignment: .leading, spacing: 5) {
                                Text("Files & apps").font(.system(size: 14, weight: .medium))
                                Text("Allow the team to use approved folders and Mac apps.")
                                    .font(.system(size: 12)).foregroundStyle(.secondary)
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .toggleStyle(.switch).controlSize(.small)
                        Text("Applies to every teammate. macOS may ask for permission. Sending, deleting and other sensitive actions still wait for your approval.")
                            .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                    Divider()
                    VStack(alignment: .leading, spacing: 0) {
                    Text("Private tools by teammate").font(.system(size: 13, weight: .semibold)).padding(.bottom, 10)
                    ForEach(store.state.bots) { bot in
                        VStack(alignment: .leading, spacing: 0) {
                            Button { expandedBotID = expandedBotID == bot.id ? nil : bot.id } label: {
                            HStack(spacing: 10) {
                                DesktopMascotView(bot: bot, size: 35).frame(width: 39, height: 39)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(bot.name).font(.system(size: 14, weight: .medium))
                                    Text(toolSummary(bot)).font(.system(size: 12)).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 16)
                                Image(systemName: expandedBotID == bot.id ? "chevron.down" : "chevron.right")
                                    .font(.system(size: 10, weight: .semibold)).foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 16).contentShape(Rectangle())
                            }.buttonStyle(.plain).accessibilityLabel("Permissions for \(bot.name)")
                            if expandedBotID == bot.id {
                            VStack(alignment: .leading, spacing: 18) {
                            Toggle("Terminal & projects", isOn: Binding(
                                get: { bot.computerEnabled ?? false },
                                set: { enabled in Task { await store.setBotCapabilities(bot, computerEnabled: enabled) } }
                            ))
                            Toggle("Private browser", isOn: Binding(
                                get: { bot.browserEnabled ?? false },
                                set: { enabled in Task { await store.setBotCapabilities(bot, browserEnabled: enabled) } }
                            ))
                            Text("A separate workspace and browser for \(bot.name). You grant access to individual code projects in Code projects.")
                                .font(.system(size: 12)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                            }.font(.system(size: 13)).toggleStyle(.switch).controlSize(.small)
                                .padding(.leading, 49).padding(.bottom, 20)
                            }
                            Divider()
                        }
                    }
                    if store.state.bots.isEmpty {
                        Text("Create a teammate to choose their private tools.").font(.callout).foregroundStyle(.secondary).padding(.vertical, 16)
                    }
                    }

                    if let error = store.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 11.5, weight: .semibold, design: .default)).foregroundStyle(Color.primary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 32).padding(.bottom, 32)
            }
        }
        .desktopPanelSize(width: 680, height: 650).background(DesktopTheme.paper)
    }

    private func toolSummary(_ bot: StudioBot) -> String {
        switch (bot.computerEnabled == true, bot.browserEnabled == true) {
        case (true, true): return "Terminal, projects and browser"
        case (true, false): return "Terminal and projects"
        case (false, true): return "Browser only"
        default: return "Private tools are off"
        }
    }
}
