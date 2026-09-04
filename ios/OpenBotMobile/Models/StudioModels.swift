import Foundation

struct StudioState: Decodable {
    let bots: [StudioBot]
    let threads: [StudioThread]
    let messages: [StudioMessage]
    let runs: [StudioRun]
    let studioRuns: [StudioRun]?
    let approvals: [StudioApproval]
    let approvedActions: [StudioApprovedAction]?
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

struct StudioRunnerCare: Decodable, Hashable {
    let checkedAt: String
    let mode: String
    let version: String
    let uptimeSeconds: Int
    let publicUrl: String?
    let dataPath: String
    let overall: String
    let summary: String
    let checks: [StudioRunnerCareCheck]
    let alerts: StudioRunnerHealthAlerts
    let heartbeat: StudioRunnerExternalHeartbeat
}

struct StudioRunnerHealthAlerts: Decodable, Hashable {
    let enabled: Bool
    let intervalMinutes: Int
    let destinationCount: Int
    let deliveryReady: Bool
    let lastCheckedAt: String?
    let lastNotifiedAt: String?
    let lastStatus: String?
}

struct StudioRunnerExternalHeartbeat: Decodable, Hashable {
    let configured: Bool
    let enabled: Bool
    let intervalMinutes: Int
    let provider: String?
    let lastAttemptAt: String?
    let lastSuccessAt: String?
    let lastError: String?
}

struct StudioRunnerCareCheck: Decodable, Identifiable, Hashable {
    let id: String
    let label: String
    let status: String
    let value: String
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

struct StudioApprovedAction: Decodable, Identifiable, Hashable {
    let id: String
    let approvalId: String
    let runId: String
    let botId: String
    let botName: String
    let actionType: String
    let actionLabel: String
    let status: String
    let attemptCount: Int
    let resultSummary: String?
    let lastError: String?
    let createdAt: String
    let startedAt: String?
    let finishedAt: String?
    let reviewedAt: String?
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

struct StudioConnectorStatus: Decodable, Hashable {
    let catalog: [StudioConnectorCatalogEntry]
    let managedGoogleClient: Bool?
    let connection: StudioConnectorConnection?
    let googleApiRecoveries: [StudioGoogleApiRecovery]?

    func isConnected(_ serviceID: String) -> Bool {
        catalog.first(where: { $0.id == serviceID })?.connected == true
    }

    var canStartGoogleOAuth: Bool { managedGoogleClient == true || connection != nil }

    func googleRecoveryURL(for serviceID: String) -> URL? {
        guard let value = googleApiRecoveries?.first(where: { $0.service == serviceID })?.enableUrl,
              let url = URL(string: value), url.scheme?.lowercased() == "https" else { return nil }
        return url
    }
}

struct StudioConnectorCatalogEntry: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let connected: Bool
}

struct StudioConnectorConnection: Decodable, Hashable {
    let connected: Bool
}

struct StudioGoogleApiRecovery: Decodable, Hashable {
    let service: String
    let serviceName: String
    let enableUrl: String
}

struct StudioStarter: Identifiable, Hashable {
    let id: String
    let title: String
    let summary: String
    let detail: String
    let systemImage: String
    let requiredServices: [String]

    func prompt(timeZone: String) -> String {
        switch id {
        case "morning-brief":
            return "Prepare my morning brief for the next 24 hours in \(timeZone). Check my primary calendar and unread inbox conversations from the past seven days. Give me a short schedule and source-linked priorities, save a report, and tell me if anything could not be checked. Separate suggestions from facts. Do not send or change anything."
        case "meeting-prep":
            return "Use @calendar, @drive, and @gmail to prepare me for my next meeting. Deliver a short briefing with the event details, attendees, recent related documents, the latest relevant email thread, likely decisions, and five useful questions. Link every source, verify that the material is about the same meeting, and do not change anything."
        default:
            return "Prepare my inbox follow-ups in \(timeZone). Check inbox conversations from the past seven days. Suggest source-linked priorities and save useful reply drafts for me to review. Skip conversations I have already answered and flag any missing or shortened context. Save the report. Do not send or change anything."
        }
    }

    static let all: [StudioStarter] = [
        StudioStarter(
            id: "morning-brief",
            title: "Morning brief",
            summary: "Your next 24 hours, priorities, and source links",
            detail: "Reads Calendar and recent unread Gmail. Saves a report and never sends or changes anything.",
            systemImage: "sun.max.fill",
            requiredServices: ["gmail", "google-calendar"]
        ),
        StudioStarter(
            id: "meeting-prep",
            title: "Prepare my next meeting",
            summary: "A checked brief with context and useful questions",
            detail: "Matches Calendar, Drive, and Gmail sources before drawing conclusions.",
            systemImage: "person.2.fill",
            requiredServices: ["gmail", "google-drive", "google-calendar"]
        ),
        StudioStarter(
            id: "inbox-follow-ups",
            title: "Prepare my follow-ups",
            summary: "Priorities and reply drafts for your review",
            detail: "Reads recent inbox conversations, skips threads you answered, and leaves every draft unsent.",
            systemImage: "envelope.badge.fill",
            requiredServices: ["gmail"]
        )
    ]
}

extension StudioState {
    static let empty = StudioState(
        bots: [], threads: [], messages: [], runs: [], studioRuns: [], approvals: [], approvedActions: [], workflows: [], runner: nil,
        draft: nil,
        usage: StudioUsage(totalTokens: 0, completedRuns: 0, activeRuns: 0),
        activeThreadId: "team-room"
    )
}
