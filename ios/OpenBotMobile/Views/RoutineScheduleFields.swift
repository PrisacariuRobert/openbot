import SwiftUI

// Mac and iPhone use the same controls and the host's schedule preview. Do not
// recalculate future occurrences with each device's different calendar rules.
struct RoutineScheduleFields: View {
    @ObservedObject var store: StudioStore
    @Binding var schedule: StudioRoutineSchedule
    @Binding var valid: Bool
    let intervalMinutes: Int
    let routineID: String?
    let enabled: Bool
    var compact = false
    @State private var preview: StudioSchedulePreview?
    @State private var error: String?
    private let days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    private var requestID: String { "\(schedule)|\(intervalMinutes)|\(routineID ?? "")|\(enabled)" }
    private var zone: TimeZone { TimeZone(identifier: schedule.timeZone ?? "UTC") ?? .gmt }
    private var repeatChoice: String {
        guard schedule.kind == "calendar" else { return schedule.kind }
        if schedule.daysOfWeek == [1, 2, 3, 4, 5] { return "weekdays" }
        return schedule.daysOfWeek?.count == 7 ? "daily" : "custom"
    }
    private var onceDate: Binding<Date> {
        Binding(get: {
            let format = ISO8601DateFormatter()
            format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return format.date(from: schedule.at ?? "") ?? ISO8601DateFormatter().date(from: schedule.at ?? "") ?? Date().addingTimeInterval(3600)
        }, set: { schedule.at = ISO8601DateFormatter().string(from: $0) })
    }

    private var repeatOptions: [(String, String)] { [("once", "Just once"), ("daily", "Every day"), ("weekdays", "Every weekday"), ("custom", "Choose days…"), ("interval", "On an interval")] }

    private func chooseRepeat(_ kind: String) {
        if ["daily", "weekdays", "custom"].contains(kind) {
            let previousTime = schedule.time ?? "08:00", previousZone = schedule.timeZone ?? TimeZone.current.identifier
            schedule = .weekdays; schedule.time = previousTime; schedule.timeZone = previousZone
            schedule.daysOfWeek = kind == "daily" ? Array(1...7) : kind == "weekdays" ? [1, 2, 3, 4, 5] : [1]
        } else if kind == "once" {
            schedule = StudioRoutineSchedule(kind: "once", timeZone: TimeZone.current.identifier, at: ISO8601DateFormatter().string(from: Date().addingTimeInterval(3600)))
        } else { schedule = .interval }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("When").font(.system(size: 12, weight: .medium))
                    Menu {
                        ForEach(repeatOptions, id: \.0) { kind, title in
                            Button { chooseRepeat(kind) } label: {
                                if repeatChoice == kind { Label(title, systemImage: "checkmark") } else { Text(title) }
                            }
                        }
                    } label: {
                        Text(repeatOptions.first(where: { $0.0 == repeatChoice })?.1 ?? "Choose days…")
                            .font(.system(size: 13))
                    }
                    .menuStyle(.borderlessButton).menuIndicator(.hidden)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(12).studioOutline(radius: 9)
                    .overlay(alignment: .trailing) {
                        Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold))
                            .padding(.trailing, 12).allowsHitTesting(false)
                    }.accessibilityLabel("Repeat")
                }.frame(maxWidth: .infinity, alignment: .leading)
                if schedule.kind == "calendar" {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("At · 24-hour").font(.system(size: 12, weight: .medium))
                        TextField("08:00", text: Binding(get: { schedule.time ?? "" }, set: { schedule.time = $0 }))
                            .textFieldStyle(.plain).font(.system(size: 13)).padding(12).studioOutline(radius: 9)
                            .accessibilityLabel("Time, 24-hour")
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            if schedule.kind == "calendar" {
                if repeatChoice == "custom" { HStack(spacing: 5) {
                    ForEach(1...7, id: \.self) { day in
                        let selected = (schedule.daysOfWeek ?? []).contains(day)
                        Button {
                            var values = schedule.daysOfWeek ?? []
                            if selected { values.removeAll { $0 == day } } else { values.append(day) }
                            schedule.daysOfWeek = values.sorted()
                        } label: {
                            Text(days[day - 1]).font(.system(size: 11, weight: .semibold))
                                .frame(maxWidth: .infinity).padding(.vertical, 11)
                                .background(selected ? Color.primary.opacity(0.10) : Color.gray.opacity(0.04), in: RoundedRectangle(cornerRadius: 9))
                        }.buttonStyle(.plain).accessibilityLabel(days[day - 1]).accessibilityAddTraits(selected ? .isSelected : [])
                    }
                } }
                if !compact {
                    RepeatingScheduleCalendar(days: schedule.daysOfWeek ?? [], zone: zone)
                }
            }
            if schedule.kind == "once" {
                if compact {
                    DatePicker("Run on", selection: onceDate, displayedComponents: [.date, .hourAndMinute])
                        .environment(\.timeZone, zone)
                } else {
                DatePicker("Date", selection: onceDate, displayedComponents: [.date]).datePickerStyle(.graphical).environment(\.timeZone, zone).tint(StudioPalette.accent)
                DatePicker("Time", selection: onceDate, displayedComponents: [.hourAndMinute]).environment(\.timeZone, zone)
                }
            }
            if schedule.kind != "interval" && !compact {
                DisclosureGroup("\((schedule.timeZone ?? "UTC").replacingOccurrences(of: "_", with: " ")) time") {
                    TextField("Europe/Brussels", text: Binding(get: { schedule.timeZone ?? "" }, set: { schedule.timeZone = $0 }))
                        .textFieldStyle(.roundedBorder).autocorrectionDisabled()
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                if let error { Text(error).foregroundStyle(Color.primary) }
                else if let preview {
                    if let next = preview.descriptions.first { Text("\(enabled ? "Next" : "Paused") · \(next)") }
                    if !compact && preview.descriptions.count > 1 { DisclosureGroup("Following runs") { ForEach(Array(preview.descriptions.dropFirst().enumerated()), id: \.offset) { _, date in Text(date) } } }
                } else { ProgressView("Checking run times…") }
                if !compact { Text(preview?.policy ?? "The schedule stays in its saved time zone, even when you travel.")
                    .foregroundStyle(.secondary).font(.caption).fixedSize(horizontal: false, vertical: true)
                }
            }.font(.system(size: 12)).foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            if compact {
                DisclosureGroup("Time zone & schedule details") {
                    VStack(alignment: .leading, spacing: 10) {
                        if schedule.kind != "interval" {
                            TextField("Time zone", text: Binding(get: { schedule.timeZone ?? "" }, set: { schedule.timeZone = $0 }))
                                .textFieldStyle(.plain).padding(12).studioOutline(radius: 9).autocorrectionDisabled()
                        }
                        if schedule.kind == "calendar" { RepeatingScheduleCalendar(days: schedule.daysOfWeek ?? [], zone: zone) }
                        if let preview {
                            ForEach(Array(preview.descriptions.dropFirst().enumerated()), id: \.offset) { _, date in Text(date) }
                            Text(preview.policy).foregroundStyle(.secondary)
                        }
                    }.padding(.top, 10)
                }.font(.system(size: 12))
            }
        }
        .task(id: requestID) {
            valid = false; preview = nil; error = nil
            do {
                try await Task.sleep(for: .milliseconds(200))
                let result = try await store.previewSchedule(schedule, intervalMinutes: intervalMinutes, routineID: routineID)
                guard !Task.isCancelled else { return }
                preview = result
                valid = !enabled || !result.nextRuns.isEmpty
                if !valid { error = "Choose a future date, or save this routine paused." }
            } catch {
                guard !Task.isCancelled else { return }
                self.error = error.localizedDescription
            }
        }
    }
}

// This is a weekday-pattern preview, not a second scheduling engine. The host
// below confirms actual future runs and its daylight-saving policy.
private struct RepeatingScheduleCalendar: View {
    let days: [Int]
    let zone: TimeZone
    @State private var offset = 0
    private var calendar: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = zone; c.firstWeekday = 2; return c }
    private var month: Date { calendar.date(byAdding: .month, value: offset, to: calendar.dateInterval(of: .month, for: Date())!.start)! }
    private var start: Date {
        let weekday = (calendar.component(.weekday, from: month) + 5) % 7
        return calendar.date(byAdding: .day, value: -weekday, to: month)!
    }
    private func label(_ date: Date, template: String) -> String {
        let format = DateFormatter(); format.timeZone = zone; format.setLocalizedDateFormatFromTemplate(template)
        return format.string(from: date)
    }
    var body: some View {
        VStack(spacing: 14) {
            HStack {
                Text(label(month, template: "MMMM yyyy")).font(.headline)
                Spacer()
                Button("Today") { offset = 0 }.font(.caption)
                Button { offset -= 1 } label: { Image(systemName: "chevron.left") }.accessibilityLabel("Previous month")
                Button { offset += 1 } label: { Image(systemName: "chevron.right") }.accessibilityLabel("Next month")
            }.buttonStyle(.plain)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 6) {
                ForEach(Array(["M", "T", "W", "T", "F", "S", "S"].enumerated()), id: \.offset) { _, day in Text(day).font(.caption2).foregroundStyle(.secondary) }
                ForEach(0..<42) { index in
                    let date = calendar.date(byAdding: .day, value: index, to: start)!
                    let weekday = (calendar.component(.weekday, from: date) + 5) % 7 + 1
                    let repeats = days.contains(weekday)
                    VStack(spacing: 3) {
                        Text("\(calendar.component(.day, from: date))").font(.system(size: 14, weight: calendar.isDateInToday(date) ? .bold : .regular))
                        Circle().fill(repeats ? Color.primary : .clear).frame(width: 3, height: 3)
                    }.frame(maxWidth: .infinity).frame(height: 34)
                        .opacity(calendar.isDate(date, equalTo: month, toGranularity: .month) ? 1 : 0.35)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel(label(date, template: "EEEE d MMMM yyyy") + (repeats ? ", repeating day" : ""))
                }
            }
            Text("Dots show the weekdays this task repeats.").font(.caption).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading)
        }.padding(.vertical, 14)
    }
}

#if os(iOS)
struct ScheduledRoutinesView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    @State private var showingEditor = false
    @State private var editing: StudioRoutine?
    @State private var pendingRun: StudioRoutine?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    Text("The little things, taken care of.").font(.subheadline).foregroundStyle(StudioPalette.muted).padding(.bottom, 24)
                    if let error = store.errorMessage { Text(error).font(.callout).padding(.bottom, 20) }
                    ForEach(store.routines) { routine in
                        HStack(spacing: 14) {
                            Image(systemName: routine.triggerType == "schedule" ? "clock" : "bolt.horizontal").frame(width: 26)
                            VStack(alignment: .leading, spacing: 6) {
                                Text(routine.name).font(.system(size: 16, weight: .medium))
                                Text("\(routine.botName) · \(routine.scheduleLabel ?? routine.triggerType.capitalized)")
                                    .font(.system(size: 13)).foregroundStyle(StudioPalette.muted)
                                if let error = routine.lastError { Text(error).font(.caption) }
                            }
                            Spacer()
                            Menu {
                                if routine.triggerType == "schedule" { Button("Edit routine") { editing = routine; showingEditor = true } }
                                Button(routine.enabled ? "Pause routine" : "Resume routine") { Task { await store.setRoutineEnabled(routine, enabled: !routine.enabled) } }
                                Button("Run now…") { pendingRun = routine }
                            } label: { Image(systemName: "ellipsis").frame(width: 36, height: 44) }
                                .accessibilityLabel("Actions for \(routine.name)")
                        }.padding(.vertical, 22).overlay(alignment: .bottom) { Rectangle().fill(StudioPalette.line).frame(height: 1) }
                    }
                    if store.routines.isEmpty {
                        Text("Nothing scheduled yet. Create a routine for something you want taken care of regularly.")
                            .font(.callout).foregroundStyle(StudioPalette.muted).padding(.vertical, 32)
                    }
                }.padding(24)
            }.background(StudioPalette.paper)
            .navigationTitle("Routines").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .primaryAction) { Button { editing = nil; showingEditor = true } label: { Image(systemName: "plus") }.accessibilityLabel("New routine") }
            }
            .sheet(isPresented: $showingEditor) { PhoneRoutineEditor(store: store, routine: editing) }
            .confirmationDialog("Run this routine now? It can perform real work using its existing permissions.", isPresented: Binding(get: { pendingRun != nil }, set: { if !$0 { pendingRun = nil } }), titleVisibility: .visible) {
                if let routine = pendingRun { Button("Run now") { Task { await store.runRoutineNow(routine) }; pendingRun = nil } }
            }
        }
    }
}

private struct PhoneRoutineEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    let routine: StudioRoutine?
    @State private var name: String
    @State private var prompt: String
    @State private var botID: String
    @State private var enabled: Bool
    @State private var schedule: StudioRoutineSchedule
    @State private var interval: Int
    @State private var valid = false
    @State private var saving = false

    init(store: StudioStore, routine: StudioRoutine?) {
        self.store = store; self.routine = routine
        _name = State(initialValue: routine?.name ?? "")
        _prompt = State(initialValue: routine?.prompt ?? "")
        _botID = State(initialValue: routine?.botId ?? store.activeBot?.id ?? store.state.bots.first?.id ?? "")
        _enabled = State(initialValue: routine?.enabled ?? true)
        _schedule = State(initialValue: routine?.schedule ?? (routine == nil ? .weekdays : .interval))
        _interval = State(initialValue: routine?.intervalMinutes ?? 1440)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("What should happen?").font(.subheadline.weight(.medium))
                    TextField("What should happen?", text: $prompt, axis: .vertical).lineLimit(3...8)
                        .padding(14).studioOutline()
                }
                VStack(alignment: .leading, spacing: 14) {
                    Text("When").font(.subheadline.weight(.medium))
                    RoutineScheduleFields(store: store, schedule: $schedule, valid: $valid, intervalMinutes: interval, routineID: routine?.id, enabled: enabled, compact: true)
                    if schedule.kind == "interval" { TextField("Minutes between runs", value: $interval, format: .number).keyboardType(.numberPad) }
                    Toggle("Run automatically", isOn: $enabled)
                }
                DisclosureGroup("Name & teammate") {
                    TextField("Name (optional)", text: $name).padding(12).studioOutline().padding(.top, 12)
                    Picker("Teammate", selection: $botID) { ForEach(store.state.bots) { Text($0.name).tag($0.id) } }.padding(.top, 12)
                }
                if let error = store.errorMessage { Section { Text(error).foregroundStyle(Color.primary) } }
            }.padding(24)
            }
            .background(StudioPalette.paper)
            .navigationTitle(routine == nil ? "Make it a routine" : "Edit routine")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save") {
                        saving = true
                        Task {
                            if let bot = store.state.bots.first(where: { $0.id == botID }),
                               await store.saveRoutine(id: routine?.id, name: name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? String(prompt.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80)) : name, botID: botID,
                                 threadID: routine?.botId == botID ? routine!.threadId : bot.threadId,
                                 prompt: prompt, intervalMinutes: interval, enabled: enabled,
                                 triggerType: "schedule", triggerConfig: .empty, schedule: schedule) != nil { dismiss() }
                            saving = false
                        }
                    }.disabled(!valid || saving || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || botID.isEmpty)
                }
            }
        }
    }
}
#endif
