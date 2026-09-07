import SwiftUI

struct DesktopArtifactsView: View {
    @ObservedObject var store: StudioStore
    @State private var selected: StudioArtifact?

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "doc.badge.clock.fill").font(.system(size: 17, weight: .semibold)).foregroundStyle(DesktopTheme.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Artifacts").font(.system(size: 17, weight: .bold, design: .default))
                    Text("Finished work your teammates delivered — newest first, every revision kept.")
                        .font(.system(size: 11, weight: .medium, design: .default)).foregroundStyle(.secondary)
                }
                Spacer()
                DesktopPanelCloseButton()
            }
            .padding(.horizontal, 32).padding(.top, 32).padding(.bottom, 24).background(StudioPalette.paper)
            Divider().opacity(0.55)

            if let artifact = selected {
                revisionList(artifact)
            } else if store.isCheckingArtifacts && store.artifacts.isEmpty {
                ProgressView("Opening your artifacts…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if store.artifacts.isEmpty {
                ContentUnavailableView(
                    "No artifacts yet",
                    systemImage: "doc.badge.clock",
                    description: Text("Ask your team for a brief, report or plan — finished work lands here.")
                )
            } else {
                List(store.artifacts) { artifact in
                    Button {
                        selected = artifact
                        Task { await store.openArtifact(artifact) }
                    } label: {
                        HStack(spacing: 11) {
                            Image(systemName: artifactIcon(artifact.name, kind: artifact.kind))
                                .foregroundStyle(.secondary).frame(width: 22)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(artifact.name).font(.system(size: 12.5, design: .default)).lineLimit(1)
                                Text([artifact.botName, artifact.threadTitle, relativeDate(artifact.createdAt)].compactMap { $0 }.joined(separator: " · "))
                                    .font(.system(size: 9.5, design: .default)).foregroundStyle(.secondary).lineLimit(1)
                            }
                            Spacer()
                            if artifact.revisions > 1 {
                                Text("v\(artifact.revision)").font(.system(size: 9.5, weight: .semibold, design: .default)).foregroundStyle(.secondary)
                            }
                            Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold)).foregroundStyle(.tertiary)
                        }
                        .contentShape(Rectangle()).padding(.vertical, 3)
                    }
                    .buttonStyle(.plain)
                }
                .listStyle(.inset)
            }

            if let error = store.errorMessage {
                Label(error, systemImage: "exclamationmark.circle.fill")
                    .font(.system(size: 11, weight: .semibold, design: .default)).foregroundStyle(Color.primary)
                    .padding(.horizontal, 18).padding(.bottom, 8)
            }
        }
        .desktopPanelSize(width: 820, height: 680).background(DesktopTheme.paper)
        .task { await store.refreshArtifacts() }
    }

    private func revisionList(_ artifact: StudioArtifact) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Button { store.closeArtifact(); selected = nil } label: { Label("All artifacts", systemImage: "chevron.left") }
                    .buttonStyle(.bordered).controlSize(.small)
                Image(systemName: artifactIcon(artifact.name, kind: artifact.kind)).foregroundStyle(DesktopTheme.purple)
                Text(artifact.name).font(.system(size: 12, weight: .semibold, design: .default)).lineLimit(1).truncationMode(.middle)
                Spacer()
            }
            .padding(14)
            Divider().opacity(0.55)
            List(store.artifactRevisions) { revision in
                HStack(spacing: 11) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(revision.revision > 1 ? "Revision \(revision.revision)" : "First delivery")
                            .font(.system(size: 12.5, weight: .semibold, design: .default))
                        Text([relativeDate(revision.createdAt), ByteCountFormatter.string(fromByteCount: Int64(revision.size), countStyle: .file)].joined(separator: " · "))
                            .font(.system(size: 9.5, design: .default)).foregroundStyle(.secondary)
                    }
                    Spacer()
                    if let preview = revision.previewUrl, let url = store.previewURL(preview) {
                        Link("Preview", destination: url).font(.system(size: 11, weight: .medium)).buttonStyle(.plain)
                    }
                    if let url = store.previewURL(revision.url) {
                        Link("Open", destination: url).font(.system(size: 11, weight: .semibold)).buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 3)
            }
            .listStyle(.inset)
        }
    }

    private func relativeDate(_ value: String) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        guard let date = ISO8601DateFormatter().date(from: value) else { return value }
        return formatter.localizedString(for: date, relativeTo: Date())
    }

    private func artifactIcon(_ name: String, kind: String) -> String {
        if kind == "image" { return "photo.fill" }
        if kind == "spreadsheet" { return "tablecells.fill" }
        if kind == "archive" { return "doc.zipper" }
        let ext = (name as NSString).pathExtension.lowercased()
        if ["md", "txt", "rtf"].contains(ext) { return "doc.text.fill" }
        if ["png", "jpg", "jpeg", "gif", "webp", "svg"].contains(ext) { return "photo.fill" }
        return "doc.fill"
    }
}
