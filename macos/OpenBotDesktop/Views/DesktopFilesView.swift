import SwiftUI

struct DesktopFilesView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    @State private var selectedBotID = ""
    @State private var search = ""

    private var selectedBot: StudioBot? { store.state.bots.first(where: { $0.id == selectedBotID }) }
    private var visibleFiles: [StudioWorkspaceFile] {
        let query = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return store.workspaceFiles }
        return store.workspaceFiles.filter { $0.path.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "folder.fill").font(.system(size: 17, weight: .semibold)).foregroundStyle(DesktopTheme.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Workspace files").font(.system(size: 17, weight: .bold, design: .rounded))
                    Text("Review the durable files a teammate created in its private workspace.")
                        .font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                }
                Spacer()
                Picker("Teammate", selection: $selectedBotID) {
                    ForEach(store.state.bots) { Text($0.name).tag($0.id) }
                }
                .labelsHidden().frame(width: 170)
                Button("Done") { dismiss() }.buttonStyle(.bordered).controlSize(.small)
            }
            .padding(.horizontal, 18).padding(.vertical, 13).background(.ultraThinMaterial)
            Divider().opacity(0.55)

            if let file = store.workspaceFileContent {
                filePreview(file)
            } else {
                fileBrowser
            }
        }
        .frame(width: 820, height: 680).background(DesktopTheme.paper)
        .task {
            if selectedBotID.isEmpty { selectedBotID = store.activeBot?.id ?? store.state.bots.first?.id ?? "" }
            if !selectedBotID.isEmpty { await store.refreshWorkspace(botID: selectedBotID) }
        }
        .onChange(of: selectedBotID) { _, value in
            search = ""
            Task { await store.refreshWorkspace(botID: value) }
        }
    }

    private var fileBrowser: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                TextField("Find a file", text: $search).textFieldStyle(.plain)
                if !search.isEmpty {
                    Button { search = "" } label: { Image(systemName: "xmark.circle.fill") }
                        .buttonStyle(.plain).foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 12).frame(height: 38)
            .background(.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(.black.opacity(0.07)))
            .padding(16)

            if store.isCheckingWorkspace && store.workspaceFiles.isEmpty {
                ProgressView("Opening \(selectedBot?.name ?? "the teammate")'s workspace…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if visibleFiles.isEmpty {
                ContentUnavailableView(
                    search.isEmpty ? "No workspace files yet" : "No matching files",
                    systemImage: search.isEmpty ? "folder" : "magnifyingglass",
                    description: Text(search.isEmpty ? "Files created during work will appear here." : "Try a different file name or path.")
                )
            } else {
                List(visibleFiles) { file in
                    Button {
                        guard file.kind == "file" else { return }
                        Task { await store.openWorkspaceFile(botID: selectedBotID, path: file.path) }
                    } label: {
                        HStack(spacing: 11) {
                            Image(systemName: file.kind == "directory" ? "folder.fill" : fileIcon(file.path))
                                .foregroundStyle(file.kind == "directory" ? DesktopTheme.purple.opacity(0.78) : .secondary)
                                .frame(width: 22)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(file.path).font(.system(size: 12.5, weight: file.kind == "directory" ? .semibold : .regular, design: .rounded))
                                    .lineLimit(1).truncationMode(.middle)
                                Text(file.kind == "directory" ? "Folder" : ByteCountFormatter.string(fromByteCount: Int64(file.size), countStyle: .file))
                                    .font(.system(size: 9.5, design: .rounded)).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if file.kind == "file" { Image(systemName: "chevron.right").font(.system(size: 10, weight: .semibold)).foregroundStyle(.tertiary) }
                        }
                        .contentShape(Rectangle()).padding(.vertical, 3)
                    }
                    .buttonStyle(.plain).disabled(file.kind != "file")
                }
                .listStyle(.inset)
            }

            if let error = store.errorMessage {
                Label(error, systemImage: "exclamationmark.circle.fill")
                    .font(.system(size: 11, weight: .semibold, design: .rounded)).foregroundStyle(.orange)
                    .padding(.horizontal, 18).padding(.bottom, 8)
            }
            Text("This view is read-only and limited to the selected teammate's private workspace. Hidden files, large files, and paths outside that workspace stay unavailable.")
                .font(.system(size: 10, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                .padding(.horizontal, 18).padding(.vertical, 11)
        }
    }

    private func filePreview(_ file: StudioWorkspaceFileContent) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Button { store.closeWorkspaceFile() } label: { Label("All files", systemImage: "chevron.left") }
                    .buttonStyle(.bordered).controlSize(.small)
                Image(systemName: fileIcon(file.path)).foregroundStyle(DesktopTheme.purple)
                Text(file.path).font(.system(size: 12, weight: .semibold, design: .rounded)).lineLimit(1).truncationMode(.middle)
                Spacer()
                Button { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(file.content, forType: .string) } label: {
                    Label("Copy text", systemImage: "doc.on.doc")
                }.buttonStyle(.bordered).controlSize(.small)
            }
            .padding(14)
            Divider().opacity(0.55)
            ScrollView([.vertical, .horizontal]) {
                Text(file.content.isEmpty ? "This file is empty." : file.content)
                    .font(.system(size: 11.5, design: .monospaced)).textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .topLeading).padding(18)
            }
            .background(.white.opacity(0.72))
        }
    }

    private func fileIcon(_ path: String) -> String {
        let ext = (path as NSString).pathExtension.lowercased()
        if ["md", "txt", "rtf"].contains(ext) { return "doc.text.fill" }
        if ["swift", "ts", "tsx", "js", "jsx", "py", "rs", "go", "java", "json", "yaml", "yml"].contains(ext) { return "chevron.left.forwardslash.chevron.right" }
        if ["png", "jpg", "jpeg", "gif", "webp", "svg"].contains(ext) { return "photo.fill" }
        if ["pdf"].contains(ext) { return "doc.richtext.fill" }
        return "doc.fill"
    }
}
