import SwiftUI

/// A failed task is not an active spinner or a successful message. Keep its
/// explanation in the conversation; reviewing never retries an external action.
struct StudioFailureNotice: View {
    let run: StudioRun
    let onReview: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("\(run.botName)'s task stopped", systemImage: "exclamationmark.bubble")
                .font(.subheadline.weight(.semibold))
            Text(run.failureDetail)
                .font(.subheadline).foregroundStyle(.secondary).textSelection(.enabled)
            Text("Review what happened before asking your teammate to continue. Completed or uncertain actions should not be repeated.")
                .font(.caption).foregroundStyle(.secondary)
            Button("Review activity", action: onReview)
                .buttonStyle(.bordered)
                .accessibilityIdentifier("failed-task-review-\(run.id)")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 14)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("failed-task-\(run.id)")
    }
}

/// Shared native review for Mac and iPhone. Unsupported or redacted actions
/// remain unapprovable; another client must not bypass incomplete review.
struct StudioApprovalReview: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    let approval: StudioApproval
    @StateObject private var review: StudioApprovalReviewModel
    @State private var signInBusy = false

    init(store: StudioStore, approval: StudioApproval) {
        self.store = store
        self.approval = approval
        _review = StateObject(wrappedValue: StudioApprovalReviewModel(
            approval: approval,
            load: { try await store.approvalPreview(approval.id) },
            decide: { try await store.decideReviewedApproval(approval.id, decision: $0, reviewFingerprint: $1) },
            changed: { await store.refreshApprovalState() }
        ))
    }

    private var stillPending: Bool {
        store.state.approvals.contains { $0.id == approval.id && $0.runId == approval.runId && $0.botId == approval.botId && $0.status == "pending" }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 7) {
                        Text("Requested by \(approval.botName)").font(.subheadline).foregroundStyle(.secondary)
                        Text(review.preview?.actionLabel ?? "Review the requested action")
                            .font(.title2.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                        if let reason = review.preview?.reason {
                            Text(reason).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    if review.busy && review.preview == nil { ProgressView("Loading full action…") }
                    if let preview = review.preview {
                        if let handoff = preview.browserSignIn, preview.canApprove, review.hasPendingPreview, stillPending {
                            StudioPrivateSignIn(store: store, approvalID: approval.id, siteOrigin: handoff.siteOrigin, disabled: review.busy || review.requiresRefresh || review.notice != nil,
                                busy: $signInBusy, reviewed: $review.reviewed)
                        }
                        ForEach(Array(preview.fields.enumerated()), id: \.offset) { _, field in
                            VStack(alignment: .leading, spacing: 7) {
                                Text(field.label).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                                Text(verbatim: field.value).font(.body).textSelection(.enabled)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .padding(15).background(StudioPalette.surface, in: RoundedRectangle(cornerRadius: 12))
                        }
                        if let limitation = preview.limitation {
                            Label(limitation, systemImage: "info.circle").font(.callout).fixedSize(horizontal: false, vertical: true)
                        }
                        if preview.canApprove && (preview.fields.isEmpty || !preview.hasReviewFingerprint) {
                            Text("The review is incomplete or out of date. Refresh its details before approving anything.")
                                .font(.callout).foregroundStyle(.secondary)
                        }
                        if preview.canApprove && preview.hasReviewFingerprint && preview.limitation == nil && !preview.fields.isEmpty && review.hasPendingPreview && stillPending {
                            Toggle(preview.browserSignIn == nil ? "I reviewed the full action above" : "I’ve finished signing in to the account I want to use", isOn: $review.reviewed)
                                .toggleStyle(.switch).disabled(review.busy || signInBusy || review.requiresRefresh)
                        }
                    }
                    if !stillPending && review.notice == nil {
                        Text("This request is no longer waiting in your studio. Refresh to check its status.").font(.callout)
                    }
                    if let notice = review.notice { Label(notice, systemImage: "info.circle").font(.callout) }
                    if let error = review.error { Label(error, systemImage: "exclamationmark.circle").font(.callout) }
                    VStack(alignment: .leading, spacing: 14) {
                        HStack {
                            Button("Decline") { Task { await review.submit("denied", stillPending: stillPending) } }
                                .disabled(!review.canDecline || !stillPending)
                            Spacer()
                            Button(review.preview?.browserSignIn == nil ? "Approve action" : "Continue task") { Task { await review.submit("approved", stillPending: stillPending) } }
                                .buttonStyle(.borderedProminent).tint(StudioPalette.accent)
                                .foregroundStyle(StudioPalette.userInk)
                                .disabled(!review.canApprove || !stillPending || signInBusy)
                        }
                        Button("Refresh status") { Task { await review.refresh(); await store.refreshApprovalState() } }
                            .disabled(review.busy)
                    }
                    if review.busy && review.preview != nil { ProgressView("Checking the result…") }
                }.padding(24)
            }
            .background(StudioPalette.paper)
            .foregroundStyle(StudioPalette.ink)
            .navigationTitle("Review request")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.disabled(review.busy && review.preview != nil)
                }
            }
        }
        #if os(macOS)
        .frame(minWidth: 520, idealWidth: 590, maxWidth: 740, minHeight: 480, idealHeight: 650)
        #endif
        .interactiveDismissDisabled(review.busy && review.preview != nil)
        .task { await review.refresh() }
    }
}

/// Owner-only screenshot control, never a web app wrapper or a chat message.
private struct StudioPrivateSignIn: View {
    @ObservedObject var store: StudioStore
    let approvalID: String
    let siteOrigin: String
    let disabled: Bool
    @Binding var busy: Bool
    @Binding var reviewed: Bool
    @State private var screen: StudioSignInScreen?
    @State private var privateText = ""
    @State private var error: String?

    private var screenshot: Image? {
        guard let encoded = screen?.screenshot?.split(separator: ",", maxSplits: 1).last,
              let data = Data(base64Encoded: String(encoded)) else { return nil }
        #if os(macOS)
        guard let image = NSImage(data: data) else { return nil }
        return Image(nsImage: image)
        #else
        guard let image = UIImage(data: data) else { return nil }
        return Image(uiImage: image)
        #endif
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Sign in privately").font(.headline)
            Text(siteOrigin).font(.callout.weight(.medium)).textSelection(.enabled)
            Text("Your teammate is paused. Text entered here goes to this browser, not to chat or the model.").font(.callout).foregroundStyle(.secondary)
            Button(screen == nil ? "Open sign-in" : "Refresh screen") { send(.init(operation: "view")) }.disabled(disabled || busy)
            if let screen {
                Text("Currently showing: \(screen.siteOrigin)").font(.caption).textSelection(.enabled)
                Text("Check the address before entering anything. The website may use a different sign-in provider.").font(.caption).foregroundStyle(.secondary)
                if let screenshot {
                    GeometryReader { geometry in
                        screenshot.resizable().aspectRatio(contentMode: .fit)
                            .contentShape(Rectangle())
                            .gesture(SpatialTapGesture().onEnded { event in
                                send(.init(operation: "click", x: min(1280, max(0, event.location.x / geometry.size.width * 1280)), y: min(820, max(0, event.location.y / geometry.size.height * 820))))
                            })
                            .accessibilityLabel("Private website screen. Use Tab below to choose a field.")
                    }.aspectRatio(1280.0 / 820.0, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 10))
                }
                SecureField("Text for the selected field", text: $privateText).textFieldStyle(.roundedBorder).disabled(disabled || busy)
                    .onSubmit { enterText() }
                Button("Enter text") { enterText() }.disabled(disabled || busy || privateText.isEmpty)
                HStack { ForEach(["Tab", "Enter", "Backspace", "Escape"], id: \.self) { key in
                    Button(key) { send(.init(operation: "key", key: key)) }.disabled(disabled || busy)
                } }
                Text("When the right account is visible, close any password prompts and continue your task below. Some websites and passkeys may not work in this browser.").font(.caption).foregroundStyle(.secondary)
            }
            if busy { ProgressView("Updating your private browser…") }
            if let error { Text(error).font(.callout).foregroundStyle(.secondary) }
        }.padding(16).background(StudioPalette.surface, in: RoundedRectangle(cornerRadius: 14))
    }

    private func enterText() {
        guard !privateText.isEmpty else { return }
        send(.init(operation: "type", value: String(privateText.prefix(4000)), replace: true))
    }

    private func send(_ control: StudioSignInControl) {
        guard !busy, !disabled else { return }
        busy = true; reviewed = false; privateText = ""; error = nil
        Task { @MainActor in
            defer { busy = false }
            do { screen = try await store.signInControl(approvalID, control: control) }
            catch {
                screen = nil
                self.error = "Couldn’t update sign-in. Refresh the screen and task status. Your last input may have reached the website; it wasn’t retried."
            }
        }
    }
}
