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
                Image(systemName: "clock.arrow.trianglehead.counterclockwise.rotate.90")
                    .font(.system(size: 17, weight: .semibold)).foregroundStyle(DesktopTheme.purple)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Automations").font(.system(size: 17, weight: .bold, design: .rounded))
                    Text("Repeat dependable work without keeping a browser tab open.")
                        .font(.system(size: 11, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                }
                Spacer()
                Button { editingRoutine = nil; showingCreate = true } label: { Label("New", systemImage: "plus") }
                    .buttonStyle(.borderedProminent).tint(DesktopTheme.purple).controlSize(.small)
                Button("Done") { dismiss() }.buttonStyle(.bordered).controlSize(.small)
            }
            .padding(.horizontal, 18).padding(.vertical, 13).background(.ultraThinMaterial)
            Divider().opacity(0.55)

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if let error = store.errorMessage {
                        Label(error, systemImage: "exclamationmark.circle.fill")
                            .font(.system(size: 11.5, weight: .semibold, design: .rounded)).foregroundStyle(.orange)
                    }
                    if store.routines.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "clock.badge.plus").font(.system(size: 28)).foregroundStyle(DesktopTheme.purple)
                            Text("Nothing is scheduled yet").font(.system(size: 16, weight: .bold, design: .rounded))
                            Text("Create a routine for one teammate. Every real action still follows the normal approval rules.")
                                .font(.system(size: 11.5, design: .rounded)).foregroundStyle(.secondary).multilineTextAlignment(.center)
                                .frame(maxWidth: 360)
                            Button("Create routine") { editingRoutine = nil; showingCreate = true }
                                .buttonStyle(.borderedProminent).tint(DesktopTheme.purple)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 70)
                    } else {
                        ForEach(store.routines) { routine in routineCard(routine) }
                    }
                    Text("Run now can perform the routine's real work. OpenBot asks for confirmation here and still applies every approval boundary inside the task.")
                        .font(.system(size: 10.5, weight: .medium, design: .rounded)).foregroundStyle(.secondary)
                        .padding(.top, 3)
                }
                .padding(20)
            }
        }
        .frame(width: 720, height: 640)
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
        HStack(alignment: .top, spacing: 13) {
            ZStack {
                RoundedRectangle(cornerRadius: 13, style: .continuous)
                    .fill(routine.enabled ? DesktopTheme.purple.opacity(0.10) : Color.black.opacity(0.04))
                Image(systemName: routine.triggerType == "schedule" ? "clock.fill" : "bolt.horizontal.fill")
                    .font(.system(size: 17, weight: .semibold)).foregroundStyle(routine.enabled ? DesktopTheme.purple : .secondary)
            }
            .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 7) {
                    Text(routine.name).font(.system(size: 14.5, weight: .bold, design: .rounded))
                    Text(routine.enabled ? "ON" : "PAUSED")
                        .font(.system(size: 8.5, weight: .bold, design: .rounded))
                        .foregroundStyle(routine.enabled ? DesktopTheme.green : .secondary)
                }
                Text("\(routine.botName) · \(routineSchedule(routine))")
                    .font(.system(size: 11, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
                Text(routine.prompt).font(.system(size: 11.5, design: .rounded)).foregroundStyle(.secondary).lineLimit(2)
                HStack(spacing: 9) {
                    Label(routine.lastStatus.capitalized, systemImage: routine.lastStatus == "failed" ? "exclamationmark.circle.fill" : "checkmark.circle")
                    Text(routine.runCount == 1 ? "1 run" : "\(routine.runCount) runs")
                    if routine.consecutiveFailures > 0 { Text("\(routine.consecutiveFailures) recent failures").foregroundStyle(.orange) }
                }
                .font(.system(size: 9.5, weight: .medium, design: .rounded)).foregroundStyle(.tertiary)
            }
            Spacer(minLength: 10)
            VStack(alignment: .trailing, spacing: 9) {
                Toggle("", isOn: Binding(
                    get: { routine.enabled },
                    set: { enabled in Task { await store.setRoutineEnabled(routine, enabled: enabled) } }
                ))
                .labelsHidden().toggleStyle(.switch).controlSize(.small)
                Button("Run now") { pendingRun = routine }
                    .buttonStyle(.bordered).controlSize(.small)
                Menu {
                    Button("Edit") { editingRoutine = routine; showingCreate = true }
                    if ["webhook", "github"].contains(routine.triggerType) {
                        Button("Replace signing secret") {
                            Task { if let result = await store.rotateRoutineSecret(routine) { hookResult = result } }
                        }
                    }
                    Divider()
                    Button("Delete", role: .destructive) { pendingDelete = routine }
                } label: { Image(systemName: "ellipsis.circle") }
                .menuStyle(.borderlessButton).fixedSize()
            }
        }
        .padding(14)
        .background(.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(.black.opacity(0.055)))
    }

    private func routineSchedule(_ routine: StudioRoutine) -> String {
        guard routine.triggerType == "schedule" else {
            switch routine.triggerType {
            case "github": return "GitHub event"
            case "webhook": return "Signed webhook"
            case "calendar": return "Calendar event"
            case "todoist": return "Todoist activity"
            case "dropbox": return "Dropbox change"
            case "slack": return "Slack event"
            case "notion": return "Notion event"
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
    @State private var saving = false

    private let schedules = [("5", "Every 5 minutes"), ("15", "Every 15 minutes"), ("60", "Every hour"), ("1440", "Every day"), ("10080", "Every week"), ("custom", "Custom")]
    private let triggers = [("schedule", "Schedule"), ("calendar", "Google Calendar"), ("github", "GitHub"), ("webhook", "Signed webhook"), ("todoist", "Todoist"), ("dropbox", "Dropbox"), ("slack", "Slack"), ("notion", "Notion")]

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
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 17) {
            VStack(alignment: .leading, spacing: 3) {
                Text(routine == nil ? "New automation" : "Edit automation").font(.system(size: 20, weight: .bold, design: .rounded))
                Text("Choose one owner, one clear trigger, and describe the finished result in normal language.")
                    .font(.system(size: 11.5, design: .rounded)).foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text("Name").font(.system(size: 11, weight: .semibold, design: .rounded))
                TextField("Daily priorities", text: $name).textFieldStyle(.roundedBorder)
            }
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Teammate").font(.system(size: 11, weight: .semibold, design: .rounded))
                    Picker("Teammate", selection: $botID) {
                        ForEach(store.state.bots) { bot in Text("\(bot.name) · \(bot.role)").tag(bot.id) }
                    }.labelsHidden().frame(maxWidth: .infinity)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text("Starts when").font(.system(size: 11, weight: .semibold, design: .rounded))
                    Picker("Starts when", selection: $triggerType) {
                        ForEach(triggers, id: \.0) { value, label in Text(label).tag(value) }
                    }.labelsHidden().frame(maxWidth: .infinity)
                }
            }
            triggerFields
            VStack(alignment: .leading, spacing: 6) {
                Text("What should happen?").font(.system(size: 11, weight: .semibold, design: .rounded))
                TextEditor(text: $prompt)
                    .font(.system(size: 13, design: .rounded)).frame(minHeight: 120)
                    .padding(7).background(.white, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(.black.opacity(0.10)))
            }
            if let error = store.errorMessage {
                Label(error, systemImage: "exclamationmark.circle.fill")
                    .font(.system(size: 11, weight: .semibold, design: .rounded)).foregroundStyle(.orange)
            }
            HStack {
                Toggle("Enabled", isOn: $enabled).toggleStyle(.switch).controlSize(.small)
                Spacer()
                Button("Cancel") { dismiss() }.buttonStyle(.bordered)
                Button {
                    saving = true
                    Task {
                        let bot = store.state.bots.first(where: { $0.id == botID })
                        if let bot, let result = await store.saveRoutine(
                            id: routine?.id,
                            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                            botID: bot.id,
                            threadID: bot.threadId,
                            prompt: prompt.trimmingCharacters(in: .whitespacesAndNewlines),
                            intervalMinutes: triggerType == "schedule" ? intervalMinutes : 1_440,
                            enabled: enabled,
                            triggerType: triggerType,
                            triggerConfig: triggerConfig
                        ) { onSaved(result); dismiss() }
                        saving = false
                    }
                } label: {
                    if saving { ProgressView().controlSize(.small) }
                    else { Text(routine == nil ? "Create automation" : "Save changes") }
                }
                .buttonStyle(.borderedProminent).tint(DesktopTheme.purple)
                .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || botID.isEmpty || saving)
            }
        }
        .padding(22).frame(width: 600, height: 660).background(DesktopTheme.paper)
        .onAppear { if botID.isEmpty { botID = store.state.bots.first?.id ?? "" } }
    }

    @ViewBuilder private var triggerFields: some View {
        switch triggerType {
        case "schedule":
            HStack(spacing: 12) {
                fieldLabel("How often") { Picker("How often", selection: $schedule) { ForEach(schedules, id: \.0) { value, label in Text(label).tag(value) } }.labelsHidden() }
                if schedule == "custom" {
                    fieldLabel("Minutes (5–43,200)") { TextField("120", value: $customMinutes, format: .number).textFieldStyle(.roundedBorder) }
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
            Text(title).font(.system(size: 11, weight: .semibold, design: .rounded))
            content()
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    private var intervalMinutes: Int { schedule == "custom" ? customMinutes : Int(schedule) ?? 1_440 }
    private var triggerConfig: StudioRoutineTriggerConfig {
        switch triggerType {
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
                .font(.system(size: 20, weight: .bold, design: .rounded)).foregroundStyle(DesktopTheme.purple)
            Text("Copy these now. The secret is shown only after creation or replacement and is never returned in the normal automation list.")
                .font(.system(size: 11.5, design: .rounded)).foregroundStyle(.secondary)
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
            Text(label).font(.system(size: 10.5, weight: .semibold, design: .rounded)).foregroundStyle(.secondary)
            HStack {
                Text(value).font(.system(size: 10.5, design: .monospaced)).lineLimit(2).textSelection(.enabled)
                Spacer()
                Button("Copy") { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(value, forType: .string) }
                    .buttonStyle(.bordered).controlSize(.small)
            }
            .padding(10).background(.white.opacity(0.80), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
        }
    }
}
