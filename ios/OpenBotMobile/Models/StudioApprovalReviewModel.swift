import Combine
import Foundation

/// Exact, allowlisted server preview. Never decode the stored action object.
struct StudioApprovalPreview: Decodable, Equatable {
    struct BrowserSignIn: Decodable, Equatable {
        let botId: String
        let siteOrigin: String
    }
    struct Field: Decodable, Equatable {
        let label: String
        let value: String
    }
    let approvalId: String
    let runId: String
    let status: String
    let actionLabel: String
    let reason: String
    let canApprove: Bool
    let limitation: String?
    let fields: [Field]
    let reviewFingerprint: String?
    var browserSignIn: BrowserSignIn? = nil

    var hasReviewFingerprint: Bool {
        reviewFingerprint?.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
    }

    func matches(_ approval: StudioApproval) -> Bool {
        approvalId == approval.id && runId == approval.runId
    }
}

struct StudioSignInScreen: Decodable {
    let siteOrigin: String
    let screenshot: String?
}

struct StudioSignInControl: Encodable {
    let operation: String
    var x: Double? = nil
    var y: Double? = nil
    var value: String? = nil
    var replace: Bool? = nil
    var key: String? = nil
}

enum StudioApprovalDecisionError: Error {
    case changed
    case invalidPreview
}

/// All write attempts are single-flight. Any uncertain response requires a
/// fresh server read and another explicit review; no decision is retried here.
@MainActor
final class StudioApprovalReviewModel: ObservableObject {
    @Published private(set) var preview: StudioApprovalPreview?
    @Published private(set) var busy = false
    @Published private(set) var error: String?
    @Published private(set) var notice: String?
    @Published private(set) var requiresRefresh = true
    @Published var reviewed = false

    let approval: StudioApproval
    private let load: () async throws -> StudioApprovalPreview
    private let decide: (String, String?) async throws -> StudioApproval
    private let changed: () async -> Void

    init(approval: StudioApproval, load: @escaping () async throws -> StudioApprovalPreview,
         decide: @escaping (String, String?) async throws -> StudioApproval, changed: @escaping () async -> Void) {
        self.approval = approval
        self.load = load
        self.decide = decide
        self.changed = changed
    }

    var hasPendingPreview: Bool {
        preview?.matches(approval) == true && preview?.status == "pending" && approval.status == "pending"
    }
    var canDecline: Bool { !busy && !requiresRefresh && hasPendingPreview }
    var canApprove: Bool {
        canDecline && preview?.canApprove == true && preview?.limitation == nil &&
            !(preview?.fields.isEmpty ?? true) && preview?.hasReviewFingerprint == true && reviewed
    }

    func refresh() async {
        guard !busy else { return }
        busy = true
        reviewed = false
        error = nil
        notice = nil
        preview = nil
        requiresRefresh = true
        defer { busy = false }
        do {
            let result = try await load()
            guard result.matches(approval) else { throw StudioApprovalDecisionError.invalidPreview }
            preview = result
            requiresRefresh = false
            if result.status != "pending" { notice = "This request is no longer waiting for a decision." }
        } catch {
            self.error = "Couldn’t load the full action. Refresh its details before making a decision."
        }
    }

    func submit(_ decision: String, stillPending: Bool) async {
        guard stillPending && ["approved", "denied"].contains(decision),
              decision == "approved" ? canApprove : canDecline else { return }
        busy = true
        requiresRefresh = true
        error = nil
        notice = nil
        defer { busy = false }
        do {
            let result = try await decide(decision, decision == "approved" ? preview?.reviewFingerprint : nil)
            guard result.id == approval.id && result.runId == approval.runId &&
                  result.botId == approval.botId && result.status == decision else {
                throw StudioApprovalDecisionError.invalidPreview
            }
            reviewed = false
            notice = decision == "approved"
                ? "Your approval was recorded. Check the conversation for the result; approval does not mean the action has finished."
                : "Your decision was recorded. This request was declined."
            await changed()
        } catch StudioApprovalDecisionError.changed {
            reviewed = false
            notice = "This request changed before the decision was recorded. Refresh to check its current status."
            await changed()
        } catch {
            reviewed = false
            self.error = "We couldn’t confirm the result. Your first request may already have reached OpenBot. Refresh its status before another decision."
            await changed()
        }
    }
}
