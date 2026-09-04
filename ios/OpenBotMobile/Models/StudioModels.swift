import Foundation

struct StudioState: Decodable {
    let bots: [StudioBot]
    let threads: [StudioThread]
    let messages: [StudioMessage]
    let runs: [StudioRun]
    let studioRuns: [StudioRun]?
    let approvals: [StudioApproval]
    let workflows: [StudioWorkflow]
    let runner: StudioRunner?
    let draft: StudioDraft?
    let usage: StudioUsage
    let activeThreadId: String
}

struct StudioBot: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let mascot: String
    let color: String
    let role: String
    let status: String
    let threadId: String
    let lastActiveAt: String?
}

struct StudioThread: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let kind: String
    let botId: String?
    let updatedAt: String
}

struct StudioMessage: Decodable, Identifiable, Hashable {
    let id: String
    let threadId: String
    let senderType: String
    let senderId: String?
    let senderName: String
    let senderMascot: String?
    let senderColor: String?
    let body: String
    let createdAt: String
    let runId: String?
    let attachments: [StudioAttachment]
}

struct StudioAttachment: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let kind: String
    let size: Int
    let mime: String?
    let summary: String?
    let previewText: String?
}

struct StudioWorkflow: Decodable, Identifiable, Hashable {
    let id: String
    let botId: String
    let botName: String
    let name: String
    let skillSlug: String
    let description: String?
    let version: Int?
    let source: String?
}

struct StudioRun: Decodable, Identifiable, Hashable {
    let id: String
    let threadId: String
    let botId: String
    let botName: String
    let botMascot: String
    let botColor: String
    let attemptCount: Int
    let recoveredAt: String?
    let status: String
    let approvalReason: String?
    let partialText: String?
    let summary: String?
    let error: String?
}

struct StudioRunner: Decodable, Hashable {
    let status: String
    let mode: String
    let recoveredRuns: Int
    let queuedRuns: Int
    let runningRuns: Int
    let waitingRuns: Int
    let backgroundService: String
    let backgroundServiceDetail: String
    let deployment: StudioDeployment?
}

struct StudioDeployment: Decodable, Hashable {
    let mode: String
    let label: String
    let alwaysOn: Bool
    let publicUrl: String?
    let dataLocation: String
    let checks: [StudioDeploymentCheck]
}

struct StudioDeploymentCheck: Decodable, Hashable {
    let id: String
    let label: String
    let status: String
    let detail: String
}

struct StudioApproval: Decodable, Identifiable, Hashable {
    let id: String
    let runId: String
    let botId: String
    let botName: String
    let reason: String
    let actionLabel: String
    let status: String
}

struct StudioUsage: Decodable, Hashable {
    let totalTokens: Int
    let completedRuns: Int
    let activeRuns: Int
}

struct StudioDraft: Codable, Hashable {
    let threadId: String
    let body: String
    let source: String?
    let updatedAt: String?
}

struct StudioEvent: Decodable { let type: String }

extension StudioState {
    static let empty = StudioState(
        bots: [], threads: [], messages: [], runs: [], studioRuns: [], approvals: [], workflows: [], runner: nil,
        draft: nil,
        usage: StudioUsage(totalTokens: 0, completedRuns: 0, activeRuns: 0),
        activeThreadId: "team-room"
    )
}
