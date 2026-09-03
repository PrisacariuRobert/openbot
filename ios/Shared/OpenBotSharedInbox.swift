import Foundation

struct OpenBotSharedItem: Codable, Identifiable, Hashable {
    let id: String
    let text: String
    let fileNames: [String]
    let createdAt: Date
}

struct OpenBotSharedPayload {
    let name: String
    let data: Data
}

enum OpenBotSharedInbox {
    static let appGroup = "group.app.openbot.shared"
    private static let manifestName = "OpenBotShareInbox.json"

    static func enqueue(text: String, files: [OpenBotSharedPayload]) throws -> OpenBotSharedItem {
        guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else {
            throw SharedInboxError.appGroupUnavailable
        }
        let id = UUID().uuidString.lowercased()
        let folder = root.appending(path: "SharedItems", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var storedNames: [String] = []
        for (index, payload) in files.prefix(6).enumerated() {
            guard payload.data.count <= 25_000_000 else { continue }
            let cleanName = safeName(payload.name.isEmpty ? "Shared item \(index + 1)" : payload.name)
            let relative = "SharedItems/\(id)-\(index)-\(cleanName)"
            try payload.data.write(to: root.appending(path: relative), options: .atomic)
            storedNames.append(relative)
        }
        let item = OpenBotSharedItem(id: id, text: String(text.prefix(20_000)), fileNames: storedNames, createdAt: Date())
        var expiredNames: [String] = []
        try updateManifest(root: root) { values in
            values.append(item)
            if values.count > 30 {
                expiredNames = values.prefix(values.count - 30).flatMap(\.fileNames)
            }
            values = Array(values.suffix(30))
        }
        for name in expiredNames { try? FileManager.default.removeItem(at: root.appending(path: name)) }
        return item
    }

    static func pending() -> [OpenBotSharedItem] {
        guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else { return [] }
        return (try? readManifest(root: root)) ?? []
    }

    static func fileURLs(for item: OpenBotSharedItem) -> [URL] {
        guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else { return [] }
        return item.fileNames.map { root.appending(path: $0) }.filter { FileManager.default.fileExists(atPath: $0.path) }
    }

    static func remove(_ item: OpenBotSharedItem) {
        guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup) else { return }
        try? updateManifest(root: root) { values in values.removeAll(where: { $0.id == item.id }) }
        for file in fileURLs(for: item) { try? FileManager.default.removeItem(at: file) }
    }

    private static func readManifest(root: URL) throws -> [OpenBotSharedItem] {
        let url = root.appending(path: manifestName)
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        var result: Result<[OpenBotSharedItem], Error>?
        var coordinationError: NSError?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) { coordinatedURL in
            result = Result { try JSONDecoder().decode([OpenBotSharedItem].self, from: Data(contentsOf: coordinatedURL)) }
        }
        if let coordinationError { throw coordinationError }
        return try result?.get() ?? []
    }

    private static func updateManifest(root: URL, mutate: (inout [OpenBotSharedItem]) -> Void) throws {
        let url = root.appending(path: manifestName)
        var result: Result<Void, Error>?
        var coordinationError: NSError?
        NSFileCoordinator().coordinate(writingItemAt: url, options: .forMerging, error: &coordinationError) { coordinatedURL in
            result = Result {
                var values: [OpenBotSharedItem] = []
                if FileManager.default.fileExists(atPath: coordinatedURL.path) {
                    values = (try? JSONDecoder().decode([OpenBotSharedItem].self, from: Data(contentsOf: coordinatedURL))) ?? []
                }
                mutate(&values)
                try JSONEncoder().encode(values).write(to: coordinatedURL, options: .atomic)
            }
        }
        if let coordinationError { throw coordinationError }
        try result?.get()
    }

    private static func safeName(_ value: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._- "))
        let cleaned = value.unicodeScalars.map { allowed.contains($0) ? Character(String($0)) : "_" }
        let result = String(cleaned).trimmingCharacters(in: CharacterSet(charactersIn: ". "))
        return String((result.isEmpty ? "Shared item" : result).prefix(120))
    }
}

enum SharedInboxError: LocalizedError {
    case appGroupUnavailable

    var errorDescription: String? {
        "OpenBot’s private share container is not available in this build."
    }
}
