import Foundation

enum DesktopRunnerError: LocalizedError {
    case invalidExistingHome
    case missingRuntime
    case outdatedRuntime
    case outdatedRunner
    case startupFailed

    var errorDescription: String? {
        switch self {
        case .invalidExistingHome: return "The existing studio location could not be read. Open its original runner to keep using the same studio."
        case .missingRuntime: return "This development build has no bundled runner. Start the studio runner, or install a packaged OpenBot app."
        case .outdatedRuntime: return "This app contains an older runner. Install a freshly packaged OpenBot build. Your studio data has not been changed."
        case .outdatedRunner: return "Your studio is running another version. Finish any active work, then restart its runner with this OpenBot version. No tasks or data were changed."
        case .startupFailed: return "The local studio could not start. Check its connection and try again."
        }
    }
}

actor DesktopRunnerController {
    private var process: Process?
    static func requireMatchingVersion(_ runtimeVersion: String?, appVersion: String?, running: Bool = false) throws {
        guard let runtimeVersion, let appVersion, !runtimeVersion.isEmpty, runtimeVersion == appVersion else {
            throw running ? DesktopRunnerError.outdatedRunner : DesktopRunnerError.outdatedRuntime
        }
    }

    // Opening the app must preserve an existing studio and its service settings.
    static func dataDirectory(home: URL, service: [String: Any]?) throws -> URL {
        if let service {
            if let environment = service["EnvironmentVariables"] as? [String: String],
               let data = environment["OPENBOT_DATA_DIR"], data.hasPrefix("/") {
                return URL(filePath: data, directoryHint: .isDirectory)
            }
            if let arguments = service["ProgramArguments"] as? [String],
               arguments.count == 2, arguments[1].hasPrefix("/"),
               arguments[1].hasSuffix("/scripts/background-runner.mjs") {
                return URL(filePath: arguments[1]).deletingLastPathComponent().deletingLastPathComponent().appending(path: ".openbot", directoryHint: .isDirectory)
            }
            throw DesktopRunnerError.invalidExistingHome
        }
        return home.appending(path: "Library/Application Support/OpenBot/Data", directoryHint: .isDirectory)
    }

    func ensureLocalRunner() async throws {
        if try await isAwake() { return }
        if process?.isRunning != true {
            guard let runtime = Bundle.main.resourceURL?.appending(path: "OpenBotRuntime"),
                  FileManager.default.isExecutableFile(atPath: runtime.appending(path: "bin/node").path),
                  FileManager.default.fileExists(atPath: runtime.appending(path: "node_modules/tsx/dist/cli.mjs").path) else {
                throw DesktopRunnerError.missingRuntime
            }
            let manifest = try? JSONSerialization.jsonObject(with: Data(contentsOf: runtime.appending(path: "runtime-manifest.json"))) as? [String: Any]
            try Self.requireMatchingVersion(manifest?["version"] as? String, appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String)
            let files = FileManager.default
            let home = files.homeDirectoryForCurrentUser
            let plist = home.appending(path: "Library/LaunchAgents/com.openbot.runner.plist")
            var service: [String: Any]?
            if files.fileExists(atPath: plist.path) {
                guard let saved = try PropertyListSerialization.propertyList(from: Data(contentsOf: plist), format: nil) as? [String: Any] else {
                    throw DesktopRunnerError.invalidExistingHome
                }
                service = saved
            }
            let data = try Self.dataDirectory(home: home, service: service)
            // An existing configured home must exist; don't silently create a
            // blank studio if a disk or protected folder is unavailable.
            if service != nil && !files.fileExists(atPath: data.appending(path: "openbot.sqlite").path) {
                throw DesktopRunnerError.invalidExistingHome
            }
            try files.createDirectory(at: data, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let logs = data.appending(path: "logs", directoryHint: .isDirectory)
            try files.createDirectory(at: logs, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            let output = try logFile(logs.appending(path: "desktop-runner.log"))
            defer { try? output.close() }
            let child = Process()
            child.executableURL = runtime.appending(path: "bin/node")
            child.arguments = [runtime.appending(path: "scripts/background-runner.mjs").path]
            child.currentDirectoryURL = runtime
            var environment = ProcessInfo.processInfo.environment
            if let saved = service?["EnvironmentVariables"] as? [String: String] {
                environment.merge(saved) { _, existing in existing }
            }
            environment["NODE_ENV"] = "production"
            environment["OPENBOT_DATA_DIR"] = data.path
            environment["OPENBOT_PORT"] = "4311"
            environment["OPENBOT_BACKGROUND_SERVICE"] = nil
            environment["OPENBOT_HOST"] = service == nil ? "127.0.0.1" : (environment["OPENBOT_HOST"] ?? "127.0.0.1")
            child.environment = environment
            child.standardOutput = output
            child.standardError = output
            try child.run()
            process = child
        }
        for _ in 0..<40 {
            if try await isAwake() { return }
            if process?.isRunning == false { throw DesktopRunnerError.startupFailed }
            try await Task.sleep(for: .milliseconds(500))
        }
        throw DesktopRunnerError.startupFailed
    }

    private func logFile(_ url: URL) throws -> FileHandle {
        if !FileManager.default.fileExists(atPath: url.path) {
            guard FileManager.default.createFile(atPath: url.path, contents: nil, attributes: [.posixPermissions: 0o600]) else {
                throw DesktopRunnerError.startupFailed
            }
        }
        let handle = try FileHandle(forWritingTo: url)
        try handle.seekToEnd()
        return handle
    }

    private func isAwake() async throws -> Bool {
        var request = URLRequest(url: URL(string: "http://127.0.0.1:4311/api/healthz")!)
        request.timeoutInterval = 1
        request.cachePolicy = .reloadIgnoringLocalCacheData
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let health = try JSONDecoder().decode(Health.self, from: data)
            guard (response as? HTTPURLResponse)?.statusCode == 200 && health.ok && health.runner == "online" else { return false }
            try Self.requireMatchingVersion(health.version, appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String, running: true)
            return true
        } catch let error as DesktopRunnerError { throw error }
        catch { return false }
    }

    private struct Health: Decodable { let ok: Bool; let runner: String; let version: String? }
}
