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
    let routines: [StudioRoutine]?
    let runner: StudioRunner?
    let draft: StudioDraft?
    let settings: StudioSettings?
    let usage: StudioUsage
    let activeThreadId: String
}

struct StudioRoutine: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let botId: String
    let botName: String
    let threadId: String
    let prompt: String
    let intervalMinutes: Int
    let triggerType: String
    let triggerConfig: StudioRoutineTriggerConfig?
    let hasWebhookSecret: Bool?
    let enabled: Bool
    let nextRunAt: String?
    let lastRunAt: String?
    let lastStatus: String
    let runCount: Int
    let consecutiveFailures: Int
    let lastError: String?
    let pausedReason: String?
}

struct StudioRoutineTriggerConfig: Codable, Hashable {
    var eventName: String?
    var githubEvent: String?
    var githubAction: String?
    var repository: String?
    var titleContains: String?
    var minutesBefore: Int?
    var todoistEvent: String?
    var dropboxPath: String?
    var slackEvent: String?
    var slackChannel: String?
    var notionEvent: String?
    var notionEntityId: String?

    static let empty = StudioRoutineTriggerConfig()
}

struct StudioRoutineSaveResult: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let triggerType: String
    let webhook: StudioWebhookCredentials?
}

struct StudioWebhookCredentials: Decodable, Hashable {
    let url: String
    let secret: String
}

struct StudioProviderStatus: Decodable, Hashable {
    let connected: Bool
    let cliAvailable: Bool
    let version: String?
    let defaultModel: String
    let models: [String]
    let note: String
    let instances: [StudioProviderInstance]
    let catalog: [StudioProviderCatalogEntry]
    let loginAttempts: [StudioProviderLoginAttempt]
}

struct StudioProviderCatalogEntry: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let shortName: String
    let description: String
    let badge: String
    let connected: Bool
    let installed: Bool
    let canConnect: Bool
    let connectionId: String?
    let models: [String]
    let note: String
}

struct StudioProviderLoginAttempt: Decodable, Identifiable, Hashable {
    let id: String
    let providerId: String
    let status: String
    let url: String?
    let callbackMode: String?
    let instructions: String
    let error: String?
}

struct StudioProviderInstance: Decodable, Identifiable, Hashable {
    let id: String
    let provider: String
    let name: String
    let authMode: String
    let runtime: String
    let hasSecret: Bool
    let apiConfig: StudioAPIConnectionConfig?
    let connected: Bool?
    let models: [String]?
    let defaultModel: String?
    let note: String?
}

struct StudioAPIConnectionConfig: Codable, Hashable {
    let baseUrl: String
    let `protocol`: String
    let modelIds: [String]
}

struct StudioCodeProjectsStatus: Decodable, Hashable {
    let projects: [StudioCodeProject]
    let suggestions: [StudioCodeProjectSuggestion]
    let edits: [StudioCodeProjectEdit]?
    let workspaces: [StudioCodeTaskWorkspace]?
}

struct StudioCodeProject: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let rootPath: String
    let gitRepository: Bool
    let projectKind: String
    let remoteUrl: String?
    let defaultBranch: String?
    let managedClone: Bool
    let access: [StudioCodeProjectAccess]
}

struct StudioCodeProjectAccess: Codable, Hashable {
    let botId: String
    let canRead: Bool
    let canWrite: Bool
    let canRun: Bool
}

struct StudioCodeProjectSuggestion: Decodable, Identifiable, Hashable {
    let name: String
    let rootPath: String
    let gitRepository: Bool
    let projectKind: String
    var id: String { rootPath }
}

struct StudioCodeProjectEdit: Decodable, Identifiable, Hashable {
    let id: String
    let projectId: String
    let botId: String
    let botName: String
    let path: String
    let operation: String
    let additions: Int
    let deletions: Int
    let workspaceRunId: String?
    let reversible: Bool
    let restoredAt: String?
    let createdAt: String
}

struct StudioCodeTaskWorkspace: Decodable, Identifiable, Hashable {
    let runId: String
    let projectId: String
    let projectName: String
    let botId: String
    let botName: String
    let branch: String
    let rootPath: String
    let status: String
    let createdAt: String
    let updatedAt: String
    var id: String { runId }
}

struct StudioCodeProjectReview: Decodable, Hashable {
    let projectId: String
    let gitRepository: Bool
    let branch: String?
    let defaultBranch: String?
    let remoteUrl: String?
    let workspace: StudioCodeTaskWorkspace?
    let changes: [String]
    let diff: String
    let truncated: Bool
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
    var providerInstanceId: String? = nil
    var model: String? = nil
    var computerEnabled: Bool? = nil
    var browserEnabled: Bool? = nil
    var macAccessEnabled: Bool? = nil
    var emoji: String? = nil
    var instructions: String? = nil
    var weeklyTokenBudget: Int? = nil
    var tokensUsedThisWeek: Int? = nil
}

struct StudioSettings: Decodable, Hashable {
    let macAccessEnabled: Bool
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
    var replyTo: StudioMessageReplyPreview? = nil
    var reactions: [StudioMessageReaction]? = nil
}

struct StudioMessageReplyPreview: Decodable, Hashable {
    let id: String
    let senderName: String
    let body: String
}

struct StudioMessageReaction: Decodable, Identifiable, Hashable {
    let emoji: String
    let count: Int
    let reactedByYou: Bool

    var id: String { emoji }
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

struct StudioWorkspaceFile: Decodable, Identifiable, Hashable {
    let path: String
    let size: Int
    let modifiedAt: String
    let kind: String

    var id: String { path }
}

struct StudioWorkspaceFileContent: Decodable, Hashable {
    let path: String
    let content: String
}

struct StudioSearchResult: Decodable, Identifiable, Hashable {
    let id: String
    let kind: String
    let title: String
    let subtitle: String
    let snippet: String
    let threadId: String
    let botId: String?
    let createdAt: String

    var stableID: String { "\(kind)-\(id)" }
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

struct StudioSkill: Decodable, Identifiable, Hashable {
    let id: String
    let botId: String
    let botName: String
    let name: String
    let skillSlug: String
    let description: String
    let instructions: String
    let startUrl: String
    let stepCount: Int
    let version: Int
    let source: String
    let createdAt: String
    let updatedAt: String
}

struct StudioSkillVersion: Decodable, Identifiable, Hashable {
    let id: String
    let workflowId: String
    let version: Int
    let name: String
    let description: String
    let instructions: String
    let startUrl: String
    let stepCount: Int
    let createdAt: String
}

struct StudioSkillTemplate: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let description: String
    let instructions: String
    let startUrl: String
    let category: String
    let stepCount: Int
}

struct StudioTeachingStatus: Decodable, Hashable {
    let recording: Bool
    let name: String?
    let stepCount: Int
}

struct StudioComputerStatus: Decodable, Hashable {
    let botId: String
    let container: String
    let browser: String
    let currentUrl: String?
    let title: String?
    let screenshot: String?
    let updatedAt: String
}

struct StudioBrowserTakeoverResult: Decodable, Hashable {
    let url: String
    let title: String
    let screenshot: String?
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
    let access: [StudioBotConnectorAccess]?
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
    let description: String?
    let badge: String?
    let availability: String?
    let writeRequiresApproval: Bool?
    let capabilities: [String]?
}

struct StudioBotConnectorAccess: Decodable, Hashable {
    let botId: String
    let connectorId: String
    let service: String
    let canRead: Bool
    let canSend: Bool
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
        bots: [], threads: [], messages: [], runs: [], studioRuns: [], approvals: [], approvedActions: [], workflows: [], routines: [], runner: nil,
        draft: nil, settings: nil,
        usage: StudioUsage(totalTokens: 0, completedRuns: 0, activeRuns: 0),
        activeThreadId: "team-room"
    )
}
