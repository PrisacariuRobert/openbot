import Foundation

struct StudioState: Decodable {
    var automationAlerts: [StudioAutomationAlert]? = nil
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

    /// The host sends both the selected conversation and a studio-wide snapshot.
    /// Never let selecting a quiet conversation hide another teammate's work.
    var allRuns: [StudioRun] {
        var seen = Set<String>()
        return ((studioRuns ?? []) + runs).filter { seen.insert($0.id).inserted }
    }

    var attentionItems: [StudioAttentionItem] {
        let runs = allRuns
        var items = (approvedActions ?? []).filter { $0.status == "uncertain" }.map { action in
            StudioAttentionItem(id: "action:\(action.id)", kind: .uncertainAction,
                title: action.actionLabel, detail: "Check whether this happened before continuing. It has not been repeated.",
                threadID: runs.first { $0.id == action.runId }?.threadId)
        }
        let needingRuns = runs.filter { ["awaiting_approval", "failed"].contains($0.status) }
        items += needingRuns.map { run in
            StudioAttentionItem(id: "run:\(run.id):\(run.status)", kind: .task,
                title: run.status == "failed" ? "\(run.botName) needs a hand" : "\(run.botName) needs your okay",
                detail: run.error ?? run.approvalReason ?? run.summary ?? "Open the conversation to review the next step.", threadID: run.threadId)
        }
        items += approvals.filter { approval in
            approval.status == "pending" && !needingRuns.contains { $0.id == approval.runId }
        }.map { approval in
            StudioAttentionItem(id: "approval:\(approval.id)", kind: .approval,
                title: "\(approval.botName) needs your okay", detail: approval.reason,
                threadID: runs.first { $0.id == approval.runId }?.threadId ?? bots.first { $0.id == approval.botId }?.threadId)
        }
        items += (automationAlerts ?? []).filter { $0.resolvedAt == nil }.map { alert in
            StudioAttentionItem(id: "automation:\(alert.id)", kind: .automation,
                title: alert.routineName, detail: alert.message,
                threadID: (routines ?? []).first { $0.id == alert.routineId }?.threadId)
        }
        var seen = Set<String>()
        return items.filter { seen.insert($0.id).inserted }
    }

    var attentionSignature: String { attentionItems.map(\.id).sorted().joined(separator: ",") }

    func failedRuns(in threadID: String) -> [StudioRun] {
        allRuns.filter { $0.threadId == threadID && $0.status == "failed" }
    }

    func failure(for message: StudioMessage) -> StudioRun? {
        guard message.senderType == "system", let id = message.runId else { return nil }
        return failedRuns(in: message.threadId).first { $0.id == id }
    }

    /// Older hosts may not have emitted a system message. Only put a recent
    /// orphan at the bottom; historical failures remain available in Activity.
    func unplacedFailures(in threadID: String) -> [StudioRun] {
        let conversation = messages.filter { $0.threadId == threadID }
        let represented = Set(conversation.filter { $0.senderType == "system" }.compactMap(\.runId))
        let latestUser = conversation.last { $0.senderType == "user" }?.createdAt
        return failedRuns(in: threadID).filter {
            !represented.contains($0.id) && (latestUser == nil || $0.startedAt == nil || $0.startedAt! >= latestUser!)
        }
    }
}

struct StudioAttentionItem: Identifiable, Hashable {
    enum Kind: String { case task, approval, automation, uncertainAction }
    let id: String
    let kind: Kind
    let title: String
    let detail: String
    let threadID: String?
}

struct StudioAutomationAlert: Decodable, Identifiable, Hashable {
    let id: String
    let routineId: String
    let routineName: String
    let message: String
    let resolvedAt: String?
}

struct StudioRoutine: Decodable, Identifiable, Hashable {
    var schedule: StudioRoutineSchedule? = nil
    var scheduleLabel: String? = nil
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
    var watchStatus: StudioPageWatchStatus? = nil
}

struct StudioRoutineSchedule: Codable, Hashable {
    var kind: String
    var timeZone: String?
    var time: String?
    var daysOfWeek: [Int]?
    var at: String?
    static let interval = StudioRoutineSchedule(kind: "interval")
    static var weekdays: StudioRoutineSchedule { StudioRoutineSchedule(kind: "calendar", timeZone: TimeZone.current.identifier, time: "08:00", daysOfWeek: [1, 2, 3, 4, 5]) }
}

struct StudioSchedulePreview: Decodable {
    let label: String
    let nextRuns: [String]
    let descriptions: [String]
    let policy: String
}

struct StudioPageWatchStatus: Decodable, Hashable {
    let state: String
    let checkedAt: String
    let nextCheckAt: String
    let checks: Int
    let unchangedChecks: Int
    let detail: String
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
    var pageUrl: String?
    var pageSelector: String?

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

    /// Stored credentials are not evidence of a successful model request.
    var connectionLabel: String {
        guard connected == true else { return "Needs attention" }
        if authMode == "subscription" { return "Sign-in found" }
        return hasSecret ? "Connection saved" : "Connection found"
    }
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
    var currentAction: String? = nil
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

extension StudioThread {
    /// A custom room must never display teammates that are not its members.
    func members(in bots: [StudioBot]) -> [StudioBot] {
        if let botId { return bots.filter { $0.id == botId } }
        if id == "team-room" && botIds == nil { return bots }
        return (botIds ?? []).compactMap { id in bots.first { $0.id == id } }
    }
}

struct StudioSettings: Decodable, Hashable {
    let macAccessEnabled: Bool
}

struct StudioGroupInput: Encodable {
    let title: String
    let botIds: [String]

    init?(title: String, botIDs: [String]) {
        let title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let members = Array(Set(botIDs)).sorted()
        guard !title.isEmpty, title.utf16.count <= 48, (1...6).contains(members.count),
              members.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else { return nil }
        self.title = title
        self.botIds = members
    }
}

struct StudioThread: Decodable, Identifiable, Hashable {
    let id: String
    let title: String
    let kind: String
    let botId: String?
    var botIds: [String]? = nil
    let updatedAt: String
    var lastMessage: String? = nil
    var lastMessageAt: String? = nil
    var hidden: Bool? = nil
}

struct StudioMessage: Decodable, Identifiable, Hashable {
    var progressUpdates: [String]? = nil
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
    var kind: String? = nil
    var eventType: String? = nil
    var eventData: [String: String]? = nil

    private func event(_ key: String) -> String? { eventData?[key] ?? nil }

    var isEventCard: Bool { kind == "event" }
    var eventCardTitle: String {
        switch eventType {
        case "routine_created": return "Created Routine \(event("name") ?? body)"
        case "routine_run": return "\(event("name") ?? "Routine") started"
        case "handoff": return "\(event("fromName") ?? senderName) handed off to \(event("toName") ?? "a teammate")"
        case "teammate_message": return "\(event("fromName") ?? senderName) \(event("expectsReply") == "true" ? "asked" : "messaged") \(event("toName") ?? "a teammate")"
        default: return "Studio event"
        }
    }
    var eventCardDetail: String {
        switch eventType {
        case "routine_created": return "\(event("schedule") ?? "")\(event("enabled") == "false" ? " · Paused" : "")"
        case "routine_run": return "\(event("source") == "manual" ? "Test run" : "From \(event("source") ?? "schedule")")\(event("waiting") == "true" ? " · Needs your okay" : "")"
        case "handoff": return (event("task") ?? body).replacingOccurrences(of: "\n", with: " ")
        case "teammate_message": return event("expectsReply") == "true" ? "Waiting for their reply" : "Update shared"
        default: return body
        }
    }
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

struct StudioArtifact: Decodable, Identifiable, Hashable {
    let id: String
    let threadId: String
    let threadTitle: String
    let botName: String?
    let name: String
    let kind: String
    let size: Int
    let summary: String?
    let previewUrl: String?
    let url: String
    let revision: Int
    let revisions: Int
    let createdAt: String
}

struct StudioArtifactRevision: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let revision: Int
    let size: Int
    let createdAt: String
    let previewUrl: String?
    let url: String
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

struct StudioComputerLiveEvent: Decodable {
    let type: String
    let jpeg: String?
    let browser: String?
    let title: String?
}

struct StudioBrowserTakeoverResult: Decodable, Hashable {
    let url: String
    let title: String
    let screenshot: String?
}

struct StudioRun: Decodable, Identifiable, Hashable {
    var startedAt: String? = nil
    var activities: [StudioRunActivity]? = nil
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

    var failureDetail: String {
        let detail = error?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return detail.isEmpty ? "The task stopped before a finished result could be confirmed." : detail
    }
}

struct StudioRunActivity: Decodable, Hashable {
    let kind: String
    let label: String
    let detail: String?
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
    var localApps: StudioLocalApps? = nil

    func canTryRead(_ serviceID: String) -> Bool {
        isConnected(serviceID) || (localApps?.available == true && localApps?.enabled == true && localApps?.readServices.contains(serviceID) == true)
    }

    func missingSources(for starter: StudioStarter) -> [String] {
        if ["morning-brief", "weekly-review"].contains(starter.id) && starter.requiredServices.contains(where: { canTryRead($0) }) { return [] }
        return starter.requiredServices.filter { !canTryRead($0) }
    }

    func sourceLabel(for starter: StudioStarter) -> String {
        if starter.requiredServices.contains(where: { !isConnected($0) && canTryRead($0) }) {
            return "Try Mac apps · Automation permission checked when run"
        }
        return "Use connected sources · missing coverage stays visible"
    }

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

struct StudioLocalApps: Decodable, Hashable {
    let available: Bool
    let enabled: Bool
    let readServices: [String]
}

struct StudioConnectorCatalogEntry: Decodable, Identifiable, Hashable {
    let id: String
    let name: String
    let connected: Bool
    let description: String?
    let badge: String?
    let availability: String?
    let writeConnected: Bool?
    let writeRequiresApproval: Bool?
    let capabilities: [String]?

    var connectionLabel: String {
        guard connected else { return "Not connected" }
        if writeRequiresApproval == true && writeConnected == false { return "Read access connected" }
        return "Connected"
    }
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

    var expectedWorkKind: String? {
        switch id {
        case "morning-brief": return "morning"
        case "inbox-follow-ups": return "inbox"
        case "meeting-prep": return "meeting"
        case "weekly-review": return "weekly"
        default: return nil
        }
    }

    func prompt(timeZone: String) -> String {
        switch id {
        case "weekly-review":
            return "Prepare my weekly review in \(timeZone). Use work_collect with kind weekly and save with work_report. Combine recent inbox conversations, next week’s calendar and my selected Slack, Notion and Todoist sources. Focus on decisions, open actions and next steps with sources. Current pages and open tasks are not a history of completed work. Clearly identify missing coverage. Do not send or change anything."
        case "morning-brief":
            return "Prepare my morning brief for the next 24 hours in \(timeZone). Check my primary calendar and unread inbox conversations from the past seven days. Give me a short schedule and source-linked priorities, save a report, and tell me if anything could not be checked. Separate suggestions from facts. Do not send or change anything."
        case "meeting-prep":
            return "Prepare me for my next timed meeting in \(timeZone). Use the meeting source snapshot and save a source-linked report with event details, candidate related documents and email, suggested decisions, and useful questions. Verify relevance and flag uncertain matches or missing attendee information. Distinguish suggestions from facts. Do not send or change anything."
        default:
            return "Prepare my inbox follow-ups in \(timeZone). Check inbox conversations from the past seven days. Suggest source-linked priorities and save useful reply drafts for me to review. Skip conversations I have already answered and flag any missing or shortened context. Save the report. Do not send or change anything."
        }
    }

    static let all: [StudioStarter] = [
        StudioStarter(
            id: "morning-brief",
            title: "Morning brief",
            summary: "Your next 24 hours, priorities, and source links",
            detail: "Reads connected sources, with Mail/Calendar on your Mac as an enabled fallback. Saves a report; never sends or changes anything.",
            systemImage: "sun.max.fill",
            requiredServices: ["gmail", "google-calendar", "slack", "notion", "todoist"]
        ),
        StudioStarter(
            id: "meeting-prep",
            title: "Prepare my next meeting",
            summary: "A checked brief with context and useful questions",
            detail: "Starts with Calendar and adds available mail/document context. Mac-app fallback and missing coverage are labelled.",
            systemImage: "person.2.fill",
            requiredServices: ["google-calendar"]
        ),
        StudioStarter(
            id: "inbox-follow-ups",
            title: "Prepare my follow-ups",
            summary: "Priorities and reply drafts for your review",
            detail: "Reads recent inbox conversations, skips threads you answered, and leaves every draft unsent.",
            systemImage: "envelope.badge.fill",
            requiredServices: ["gmail"]
        ),
        StudioStarter(id: "weekly-review", title: "Weekly review", summary: "Open actions, decisions and next week’s priorities", detail: "Uses recent mail, upcoming calendar and your selected app sources. Shows partial coverage; never sends or changes anything.", systemImage: "calendar", requiredServices: ["gmail", "google-calendar", "slack", "notion", "todoist"])
    ]
}

struct StudioWorkSource: Codable, Hashable, Identifiable {
    let service: String
    let id: String
    let label: String
    var key: String { "\(service):\(id)" }
}
struct StudioWorkSources: Codable {
    var lookbackHours: Int
    var selections: [StudioWorkSource]
    let revision: Int
}
struct StudioWorkSourcesInput: Encodable {
    let lookbackHours: Int
    let selections: [StudioWorkSource]
}
struct StudioWorkSourceChoices: Decodable {
    let choices: [StudioWorkSource]
    let limited: Bool
}
struct StudioWorkFollowupSource: Decodable, Identifiable {
    let ref: String
    let title: String
    let url: String?
    var id: String { ref }
}
struct StudioWorkFollowup: Decodable, Identifiable {
    let id: String
    let snapshotId: String
    let itemIndex: Int
    let text: String
    let capturedAt: String
    let sources: [StudioWorkFollowupSource]
    let status: String?
}
struct StudioWorkFollowups: Decodable {
    let suggestions: [StudioWorkFollowup]
    let tracked: [StudioWorkFollowup]
    let digestEnabled: Bool?
    let digest: StudioWorkDigest?
}
struct StudioWorkDigest: Decodable { let createdAt: String; let items: [StudioWorkFollowup] }

extension StudioState {
    static let empty = StudioState(
        bots: [], threads: [], messages: [], runs: [], studioRuns: [], approvals: [], approvedActions: [], workflows: [], routines: [], runner: nil,
        draft: nil, settings: nil,
        usage: StudioUsage(totalTokens: 0, completedRuns: 0, activeRuns: 0),
        activeThreadId: "team-room"
    )
}
