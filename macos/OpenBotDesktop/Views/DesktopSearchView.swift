import SwiftUI

struct DesktopSearchView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    @State private var query = ""
    @State private var searchTask: Task<Void, Never>?
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 11) {
                Image(systemName: "magnifyingglass").font(.system(size: 18, weight: .semibold)).foregroundStyle(DesktopTheme.purple)
                TextField("Search messages, files, automations, skills and teammates", text: $query)
                    .textFieldStyle(.plain).font(.system(size: 15, design: .default)).focused($focused)
                if !query.isEmpty {
                    Button { query = "" } label: { Image(systemName: "xmark.circle.fill") }
                        .buttonStyle(.plain).foregroundStyle(.secondary)
                }
                Button("Done") { dismiss() }.buttonStyle(.bordered).controlSize(.small)
            }
            .padding(16).background(.ultraThinMaterial)
            Divider().opacity(0.55)

            Group {
                if query.trimmingCharacters(in: .whitespacesAndNewlines).count < 2 {
                    ContentUnavailableView("Find anything in your studio", systemImage: "magnifyingglass", description: Text("Try a project name, a phrase from a message, or a file name."))
                } else if store.isSearching && store.searchResults.isEmpty {
                    ProgressView("Looking across your private studio…")
                } else if store.searchResults.isEmpty {
                    ContentUnavailableView.search(text: query)
                } else {
                    List(store.searchResults, id: \.stableID) { result in
                        Button {
                            Task { await store.chooseThread(result.threadId); dismiss() }
                        } label: {
                            HStack(alignment: .top, spacing: 12) {
                                ZStack {
                                    RoundedRectangle(cornerRadius: 10, style: .continuous).fill(DesktopTheme.purple.opacity(0.10))
                                    Image(systemName: icon(result.kind)).foregroundStyle(DesktopTheme.purple)
                                }.frame(width: 38, height: 38)
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text(result.title).font(.system(size: 13, weight: .bold, design: .default)).lineLimit(1)
                                        Text(label(result.kind).uppercased()).font(.system(size: 8.5, weight: .bold, design: .default)).foregroundStyle(DesktopTheme.purple)
                                        Spacer()
                                        Text(result.createdAt.desktopSearchDate).font(.system(size: 9.5, design: .default)).foregroundStyle(.tertiary)
                                    }
                                    Text(result.subtitle).font(.system(size: 10, weight: .semibold, design: .default)).foregroundStyle(.secondary).lineLimit(1)
                                    Text(result.snippet).font(.system(size: 11.5, design: .default)).foregroundStyle(.secondary).lineLimit(2)
                                }
                                Image(systemName: "arrow.right").font(.system(size: 10, weight: .semibold)).foregroundStyle(.tertiary).padding(.top, 13)
                            }
                            .contentShape(Rectangle()).padding(.vertical, 5)
                        }.buttonStyle(.plain)
                    }.listStyle(.inset)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            Text("Search stays on your OpenBot host and opens the original conversation rather than making another copy.")
                .font(.system(size: 10, weight: .medium, design: .default)).foregroundStyle(.secondary)
                .padding(.horizontal, 18).padding(.vertical, 11).frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(width: 760, height: 620).background(DesktopTheme.paper)
        .onAppear { focused = true }
        .onDisappear { searchTask?.cancel(); store.clearSearch() }
        .onChange(of: query) { _, value in
            searchTask?.cancel()
            searchTask = Task {
                try? await Task.sleep(for: .milliseconds(220))
                guard !Task.isCancelled else { return }
                await store.searchStudio(value)
            }
        }
    }

    private func icon(_ kind: String) -> String {
        switch kind {
        case "file": return "doc.text.fill"
        case "routine": return "clock.arrow.trianglehead.counterclockwise.rotate.90"
        case "skill": return "wand.and.stars"
        case "teammate": return "person.fill"
        default: return "bubble.left.fill"
        }
    }

    private func label(_ kind: String) -> String { kind == "routine" ? "Automation" : kind.capitalized }
}

private extension String {
    var desktopSearchDate: String {
        let precise = ISO8601DateFormatter()
        precise.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = precise.date(from: self) ?? ISO8601DateFormatter().date(from: self)
        guard let date else { return "" }
        let formatter = RelativeDateTimeFormatter(); formatter.unitsStyle = .short
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}
