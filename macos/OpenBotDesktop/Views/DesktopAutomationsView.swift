import SwiftUI

struct DesktopAutomationsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    @State private var showingCreate = false
    @State private var editingRoutine: StudioRoutine?
    @State private var pendingRun: StudioRoutine?
    @State private var pendingDelete: StudioRoutine?
    @State private var hookResult: StudioRoutineSaveResult?

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Routines").font(.system(size: 22, weight: .semibold))
                    Text("The little things, taken care of.")
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                }
                Spacer()
                Button { editingRoutine = nil; showingCreate = true } label: { Label("New", systemImage: "plus") }
                    .buttonStyle(DesktopActionButtonStyle(primary: true))
                DesktopPanelCloseButton()
            }
            .padding(.horizontal, 38).padding(.top, 32).padding(.bottom, 22).background(StudioPalette.paper)

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let error = store.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 11.5, weight: .semibold, design: .default)).foregroundStyle(Color.primary)
                    }
                    if store.routines.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "clock.badge.plus").font(.system(size: 28)).foregroundStyle(DesktopTheme.purple)
                            Text("Nothing is scheduled yet").font(.system(size: 16, weight: .bold, design: .default))
                            Text("Create a routine for one teammate. Every real action still follows the normal approval rules.")
                                .font(.system(size: 11.5, design: .default)).foregroundStyle(.secondary).multilineTextAlignment(.center)
                                .frame(maxWidth: 360)
                            Button("Create routine") { editingRoutine = nil; showingCreate = true }
                                .buttonStyle(DesktopActionButtonStyle(primary: true))
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 70)
                    } else {
                        ForEach(store.routines) { routine in routineCard(routine) }
                    }
                    Text("Run now can perform the routine's real work. OpenBot asks for confirmation here and still applies every approval boundary inside the task.")
                        .font(.system(size: 10.5, weight: .medium, design: .default)).foregroundStyle(.secondary)
                        .padding(.top, 3)
                }
                .padding(.horizontal, 38).padding(.vertical, 18)
            }
        }
        .desktopPanelSize(width: 720, height: 640)
        .background(DesktopTheme.paper)
        .sheet(isPresented: $showingCreate, onDismiss: { editingRoutine = nil }) {
            DesktopRoutineEditorView(store: store, routine: editingRoutine) { result in
                if result.webhook != nil { hookResult = result }
            }
        }
        .sheet(item: $hookResult) { result in DesktopWebhookCredentialsView(result: result) }
        .confirmationDialog(
            "Run this routine now?",
            isPresented: Binding(get: { pendingRun != nil }, set: { if !$0 { pendingRun = nil } }),
            titleVisibility: .visible
        ) {
            if let routine = pendingRun {
                Button("Run \(routine.name)") {
                    pendingRun = nil
                    Task { await store.runRoutineNow(routine) }
                }
            }
            Button("Cancel", role: .cancel) { pendingRun = nil }
        } message: {
            Text("This starts real work now and may create approval requests.")
        }
        .confirmationDialog(
            "Delete this automation?",
            isPresented: Binding(get: { pendingDelete != nil }, set: { if !$0 { pendingDelete = nil } }),
            titleVisibility: .visible
        ) {
            if let routine = pendingDelete {
                Button("Delete \(routine.name)", role: .destructive) {
                    pendingDelete = nil
                    Task { _ = await store.deleteRoutine(routine) }
                }
            }
            Button("Cancel", role: .cancel) { pendingDelete = nil }
        } message: {
            Text("Its saved configuration and event history will be removed. Finished conversations remain available.")
        }
    }

    private func routineCard(_ routine: StudioRoutine) -> some View {
        HStack(spacing: 14) {
            Image(systemName: routine.triggerType == "schedule" ? "clock" : "bolt.horizontal")
                .font(.system(size: 20, weight: .regular)).frame(width: 30)
                .foregroundStyle(StudioPalette.muted)
            Button { editingRoutine = routine; showingCreate = true } label: {
                VStack(alignment: .leading, spacing: 6) {
                    Text(routine.name).font(.system(size: 14, weight: .semibold))
                    Text("\(routine.botName) · \(routineSchedule(routine))")
                        .font(.system(size: 12)).foregroundStyle(StudioPalette.muted)
                    if routine.consecutiveFailures > 0 {
                        Label("Needs attention · \(routine.consecutiveFailures) failed runs", systemImage: "exclamationmark.circle")
                            .font(.system(size: 11)).foregroundStyle(StudioPalette.muted)
                    }
                }.frame(maxWidth: .infinity, alignment: .leading).contentShape(Rectangle())
            }.buttonStyle(.plain)
            Text(routine.enabled ? "On" : "Paused").font(.system(size: 11)).foregroundStyle(StudioPalette.muted)
            Menu {
                Button("Edit routine") { editingRoutine = routine; showingCreate = true }
                Button(routine.enabled ? "Pause" : "Resume") {
                    Task { await store.setRoutineEnabled(routine, enabled: !routine.enabled) }
                }
                Button(routine.triggerType == "webpage" ? "Check now" : "Run now") { pendingRun = routine }
                    .disabled(routine.triggerType == "webpage" && !routine.enabled)
                if ["webhook", "github"].contains(routine.triggerType) {
                    Button("Replace signing secret") {
                        Task { if let result = await store.rotateRoutineSecret(routine) { hookResult = result } }
                    }
                }
                Divider()
                Button("Delete", role: .destructive) { pendingDelete = routine }
            } label: { Image(systemName: "ellipsis").frame(width: 24, height: 28) }
                .menuStyle(.borderlessButton).fixedSize().help("Routine actions")
        }.padding(.vertical, 22)
            .overlay(alignment: .bottom) { Rectangle().fill(StudioPalette.line).frame(height: 1) }
    }

    private func routineSchedule(_ routine: StudioRoutine) -> String {
        if routine.triggerType == "schedule", let label = routine.scheduleLabel { return label }
        guard routine.triggerType == "schedule" else {
            switch routine.triggerType {
            case "github": return "GitHub event"
            case "webhook": return "Signed webhook"
            case "calendar": return "Calendar event"
            case "todoist": return "Todoist activity"
            case "dropbox": return "Dropbox change"
            case "slack": return "Slack event"
            case "notion": return "Notion event"
            case "webpage": return "Page changes · \(routine.triggerConfig?.pageUrl ?? "public page")"
            default: return routine.triggerType.capitalized
            }
        }
        switch routine.intervalMinutes {
        case 60: return "Every hour"
        case 1_440: return "Every day"
        default: return "Every \(routine.intervalMinutes) minutes"
        }
    }
}

private struct DesktopRoutineEditorView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    let routine: StudioRoutine?
    let onSaved: (StudioRoutineSaveResult) -> Void
    @State private var name: String
    @State private var botID: String
    @State private var schedule: String
    @State private var customMinutes: Int
    @State private var prompt: String
    @State private var triggerType: String
    @State private var enabled: Bool
    @State private var eventName: String
    @State private var githubEvent: String
    @State private var githubAction: String
    @State private var repository: String
    @State private var titleContains: String
    @State private var minutesBefore: Int
    @State private var todoistEvent: String
    @State private var dropboxPath: String
    @State private var slackEvent: String
    @State private var slackChannel: String
    @State private var notionEvent: String
    @State private var notionEntityID: String
    @State private var pageURL: String
    @State private var pageSelector: String
    @State private var saving = false
    @State private var clockSchedule: StudioRoutineSchedule
    @State private var scheduleValid = false
    @State private var showingTriggers = false

    private let schedules = [("5", "Every 5 minutes"), ("15", "Every 15 minutes"), ("60", "Every hour"), ("1440", "Every day"), ("10080", "Every week"), ("custom", "Custom")]
    private let triggers = [("schedule", "Schedule"), ("webpage", "Page changes"), ("calendar", "Google Calendar"), ("github", "GitHub"), ("webhook", "Signed webhook"), ("todoist", "Todoist"), ("dropbox", "Dropbox"), ("slack", "Slack"), ("notion", "Notion")]

    init(store: StudioStore, routine: StudioRoutine?, onSaved: @escaping (StudioRoutineSaveResult) -> Void) {
        self.store = store
        self.routine = routine
        self.onSaved = onSaved
        let config = routine?.triggerConfig ?? .empty
        let interval = routine?.intervalMinutes ?? 1_440
        _name = State(initialValue: routine?.name ?? "")
        _botID = State(initialValue: routine?.botId ?? "")
        _schedule = State(initialValue: [5, 15, 60, 1_440, 10_080].contains(interval) ? String(interval) : "custom")
        _customMinutes = State(initialValue: interval)
        _clockSchedule = State(initialValue: routine?.schedule ?? (routine == nil ? .weekdays : .interval))
        _prompt = State(initialValue: routine?.prompt ?? "")
        _triggerType = State(initialValue: routine?.triggerType ?? "schedule")
        _enabled = State(initialValue: routine?.enabled ?? true)
        _eventName = State(initialValue: config.eventName ?? "")
        _githubEvent = State(initialValue: config.githubEvent ?? "issues")
        _githubAction = State(initialValue: config.githubAction ?? "opened")
        _repository = State(initialValue: config.repository ?? "")
        _titleContains = State(initialValue: config.titleContains ?? "")
        _minutesBefore = State(initialValue: config.minutesBefore ?? 15)
        _todoistEvent = State(initialValue: config.todoistEvent ?? "any")
        _dropboxPath = State(initialValue: config.dropboxPath ?? "")
        _slackEvent = State(initialValue: config.slackEvent ?? "mention")
        _slackChannel = State(initialValue: config.slackChannel ?? "")
        _notionEvent = State(initialValue: config.notionEvent ?? "page_updated")
        _notionEntityID = State(initialValue: config.notionEntityId ?? "")
        _pageURL = State(initialValue: config.pageUrl ?? "")
        _pageSelector = State(initialValue: config.pageSelector ?? "")
    }

    var body: some View {
        VStack(spacing: 0) {
        VStack(alignment: .leading, spacing: 6) {
            Text(routine == nil ? "Make it a routine" : "Edit routine").font(.system(size: 22, weight: .semibold))
            Text("A little work, taken care of regularly.").font(.callout).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 28).padding(.top, 28).padding(.bottom, 24)
        ScrollView {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 8) {
                Text("What should happen?").font(.system(size: 12, weight: .medium))
                TextField("For example, prepare a plan for my day.", text: $prompt, axis: .vertical)
                    .textFieldStyle(.plain).lineLimit(3...7)
                    .font(.system(size: 13)).padding(12).studioOutline(radius: 9)
                    .accessibilityLabel("What should happen?")
            }
            triggerFields
            DisclosureGroup("Name & teammate") {
                TextField("Name (optional)", text: $name).textFieldStyle(.plain)
                    .padding(12).studioOutline().padding(.top, 10)
                HStack {
                    Text("Teammate").font(.callout.weight(.medium))
                    Spacer()
                    Picker("Teammate", selection: $botID) {
                        ForEach(store.state.bots) { bot in Text("\(bot.name) · \(bot.role)").tag(bot.id) }
                    }.labelsHidden().frame(maxWidth: 240)
                }.padding(.top, 12)
                Toggle("Run automatically", isOn: $enabled).toggleStyle(.switch).controlSize(.small).padding(.top, 14)
            }
            VStack(alignment: .leading, spacing: 14) {
                DisclosureGroup("Other triggers", isExpanded: $showingTriggers) {
                    Picker("Starts when", selection: $triggerType) {
                        ForEach(triggers, id: \.0) { value, label in Text(label).tag(value) }
                    }.padding(.top, 10)
                }
                .font(.system(size: 12))
            }
            if let error = store.errorMessage {
                Label(error, systemImage: "exclamationmark.circle.fill")
                    .font(.system(size: 11, weight: .semibold, design: .default)).foregroundStyle(Color.primary)
            }
        }.font(.system(size: 12)).padding(.horizontal, 28).padding(.bottom, 20)
        }
        Divider()
            HStack(spacing: 10) {
                Spacer()
                Button("Cancel") { dismiss() }.buttonStyle(DesktopActionButtonStyle()).keyboardShortcut(.cancelAction)
                Button {
                    saving = true
                    Task {
                        let bot = store.state.bots.first(where: { $0.id == botID })
                        if let bot, let result = await store.saveRoutine(
                            id: routine?.id,
                            name: name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? String(prompt.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80)) : name.trimmingCharacters(in: .whitespacesAndNewlines),
                            botID: bot.id,
                            threadID: routine?.botId == bot.id ? routine!.threadId : bot.threadId,
                            prompt: prompt.trimmingCharacters(in: .whitespacesAndNewlines),
                            intervalMinutes: ["schedule", "webpage"].contains(triggerType) ? intervalMinutes : 1_440,
                            enabled: enabled,
                            triggerType: triggerType,
                            triggerConfig: triggerConfig,
                            schedule: triggerType == "schedule" ? clockSchedule : .interval
                        ) { onSaved(result); dismiss() }
                        saving = false
                    }
                } label: {
                    if saving { ProgressView().controlSize(.small) }
                    else { Text(routine == nil ? "Create routine" : "Save changes") }
                }
                .buttonStyle(DesktopActionButtonStyle(primary: true))
                .disabled(prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || botID.isEmpty || saving || (triggerType == "schedule" && !scheduleValid) || (triggerType == "webpage" && (pageURL.isEmpty || intervalMinutes < 15 || intervalMinutes > 43_200)))
            }.padding(.horizontal, 28).padding(.vertical, 20)
        }.frame(width: 480, height: 550).background(DesktopTheme.paper)
        .buttonBorderShape(.capsule).controlSize(.regular)
        .onAppear {
            if botID.isEmpty { botID = store.activeBot?.id ?? store.state.bots.first?.id ?? "" }
            showingTriggers = triggerType != "schedule"
        }
    }

    @ViewBuilder private var triggerFields: some View {
        switch triggerType {
        case "webpage":
            fieldLabel("Public page or feed address") { TextField("https://example.com/changelog", text: $pageURL).textFieldStyle(.roundedBorder) }
            HStack(spacing: 12) {
                fieldLabel("Page section (optional)") { TextField("#updates, .news, or main", text: $pageSelector).textFieldStyle(.roundedBorder) }
                fieldLabel("Minutes between checks (15–43,200)") {
                    TextField("60", value: $customMinutes, format: .number).textFieldStyle(.roundedBorder)
                        .onAppear { schedule = "custom" }
                }
            }
            Text("The first check saves a baseline. Only changed text wakes your teammate. Public HTTPS pages and feeds only: no login, query strings, redirects, JavaScript or images.")
                .font(.system(size: 11, design: .default)).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
        case "schedule":
            RoutineScheduleFields(store: store, schedule: $clockSchedule, valid: $scheduleValid, intervalMinutes: intervalMinutes, routineID: routine?.id, enabled: enabled, compact: true)
            if clockSchedule.kind == "interval" {
            HStack(spacing: 12) {
                fieldLabel("How often") { Picker("How often", selection: $schedule) { ForEach(schedules, id: \.0) { value, label in Text(label).tag(value) } }.labelsHidden() }
                if schedule == "custom" {
                    fieldLabel("Minutes (5–43,200)") { TextField("120", value: $customMinutes, format: .number).textFieldStyle(.roundedBorder) }
                }
            }
            }
        case "calendar":
            HStack(spacing: 12) {
                fieldLabel("Event title contains") { TextField("Optional", text: $titleContains).textFieldStyle(.roundedBorder) }
                fieldLabel("Minutes before") { TextField("15", value: $minutesBefore, format: .number).textFieldStyle(.roundedBorder) }
            }
        case "github":
            HStack(spacing: 12) {
                fieldLabel("GitHub event") { TextField("issues", text: $githubEvent).textFieldStyle(.roundedBorder) }
                fieldLabel("Action") { TextField("opened", text: $githubAction).textFieldStyle(.roundedBorder) }
            }
            fieldLabel("Repository filter") { TextField("owner/repository (optional)", text: $repository).textFieldStyle(.roundedBorder) }
        case "webhook":
            fieldLabel("Event name") { TextField("Optional label for this signed event", text: $eventName).textFieldStyle(.roundedBorder) }
        case "todoist":
            fieldLabel("Todoist activity") { Picker("Todoist activity", selection: $todoistEvent) { ForEach(["any", "added", "updated", "completed"], id: \.self) { Text($0.capitalized).tag($0) } }.labelsHidden() }
        case "dropbox":
            fieldLabel("Watch path") { TextField("/Projects (optional)", text: $dropboxPath).textFieldStyle(.roundedBorder) }
        case "slack":
            HStack(spacing: 12) {
                fieldLabel("Slack event") { Picker("Slack event", selection: $slackEvent) { ForEach(["mention", "message", "reaction", "any"], id: \.self) { Text($0.capitalized).tag($0) } }.labelsHidden() }
                fieldLabel("Channel filter") { TextField("Optional channel ID", text: $slackChannel).textFieldStyle(.roundedBorder) }
            }
        case "notion":
            HStack(spacing: 12) {
                fieldLabel("Notion event") { Picker("Notion event", selection: $notionEvent) { ForEach(["page_updated", "page_created", "comment", "database", "any"], id: \.self) { Text($0.replacingOccurrences(of: "_", with: " ").capitalized).tag($0) } }.labelsHidden() }
                fieldLabel("Page or database filter") { TextField("Optional ID", text: $notionEntityID).textFieldStyle(.roundedBorder) }
            }
        default: EmptyView()
        }
    }

    private func fieldLabel<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title).font(.system(size: 11, weight: .semibold, design: .default))
            content()
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    private var intervalMinutes: Int { schedule == "custom" ? customMinutes : Int(schedule) ?? 1_440 }
    private var triggerConfig: StudioRoutineTriggerConfig {
        switch triggerType {
        case "webpage": return StudioRoutineTriggerConfig(pageUrl: clean(pageURL), pageSelector: clean(pageSelector))
        case "calendar": return StudioRoutineTriggerConfig(titleContains: clean(titleContains), minutesBefore: max(0, min(1_440, minutesBefore)))
        case "github": return StudioRoutineTriggerConfig(githubEvent: clean(githubEvent), githubAction: clean(githubAction), repository: clean(repository))
        case "webhook": return StudioRoutineTriggerConfig(eventName: clean(eventName))
        case "todoist": return StudioRoutineTriggerConfig(todoistEvent: todoistEvent)
        case "dropbox": return StudioRoutineTriggerConfig(dropboxPath: clean(dropboxPath))
        case "slack": return StudioRoutineTriggerConfig(slackEvent: slackEvent, slackChannel: clean(slackChannel))
        case "notion": return StudioRoutineTriggerConfig(notionEvent: notionEvent, notionEntityId: clean(notionEntityID))
        default: return .empty
        }
    }
    private func clean(_ value: String) -> String? {
        let cleaned = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? nil : cleaned
    }
}

private struct DesktopWebhookCredentialsView: View {
    @Environment(\.dismiss) private var dismiss
    let result: StudioRoutineSaveResult

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Signing details ready", systemImage: "key.fill")
                .font(.system(size: 20, weight: .bold, design: .default)).foregroundStyle(DesktopTheme.purple)
            Text("Copy these now. The secret is shown only after creation or replacement and is never returned in the normal automation list.")
                .font(.system(size: 11.5, design: .default)).foregroundStyle(.secondary)
            if let webhook = result.webhook {
                credential("Webhook address", webhook.url)
                credential("Signing secret", webhook.secret)
            }
            HStack { Spacer(); Button("Done") { dismiss() }.buttonStyle(.borderedProminent).tint(DesktopTheme.purple) }
        }
        .padding(22).frame(width: 610, height: 330).background(DesktopTheme.paper)
    }

    private func credential(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.system(size: 10.5, weight: .semibold, design: .default)).foregroundStyle(.secondary)
            HStack {
                Text(value).font(.system(size: 10.5, design: .monospaced)).lineLimit(2).textSelection(.enabled)
                Spacer()
                Button("Copy") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(value, forType: .string) }
                    .buttonStyle(.bordered).controlSize(.small)
            }
            .padding(10).background(StudioPalette.surface, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        }
    }
}
