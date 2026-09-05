import SwiftUI

struct DesktopAutomationsView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    @State private var showingCreate = false
    @State private var pendingRun: StudioRoutine?

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
                Button { showingCreate = true } label: { Label("New", systemImage: "plus") }
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
                            Button("Create routine") { showingCreate = true }
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
        .sheet(isPresented: $showingCreate) { DesktopRoutineCreateView(store: store) }
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
            }
        }
        .padding(14)
        .background(.white.opacity(0.78), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 17, style: .continuous).stroke(.black.opacity(0.055)))
    }

    private func routineSchedule(_ routine: StudioRoutine) -> String {
        guard routine.triggerType == "schedule" else { return routine.triggerType.capitalized }
        switch routine.intervalMinutes {
        case 60: return "Every hour"
        case 1_440: return "Every day"
        default: return "Every \(routine.intervalMinutes) minutes"
        }
    }
}

private struct DesktopRoutineCreateView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: StudioStore
    @State private var name = ""
    @State private var botID = ""
    @State private var intervalMinutes = 1_440
    @State private var prompt = ""
    @State private var saving = false

    private let intervals = [(5, "Every 5 minutes"), (15, "Every 15 minutes"), (60, "Every hour"), (1_440, "Every day")]

    var body: some View {
        VStack(alignment: .leading, spacing: 17) {
            VStack(alignment: .leading, spacing: 3) {
                Text("New routine").font(.system(size: 20, weight: .bold, design: .rounded))
                Text("Choose one owner and describe the finished result in normal language.")
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
                    Text("How often").font(.system(size: 11, weight: .semibold, design: .rounded))
                    Picker("How often", selection: $intervalMinutes) {
                        ForEach(intervals, id: \.0) { value, label in Text(label).tag(value) }
                    }.labelsHidden().frame(maxWidth: .infinity)
                }
            }
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
                Spacer()
                Button("Cancel") { dismiss() }.buttonStyle(.bordered)
                Button {
                    saving = true
                    Task {
                        let bot = store.state.bots.first(where: { $0.id == botID })
                        if let bot, await store.createScheduledRoutine(
                            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                            botID: bot.id,
                            threadID: bot.threadId,
                            prompt: prompt.trimmingCharacters(in: .whitespacesAndNewlines),
                            intervalMinutes: intervalMinutes
                        ) { dismiss() }
                        saving = false
                    }
                } label: {
                    if saving { ProgressView().controlSize(.small) }
                    else { Text("Create routine") }
                }
                .buttonStyle(.borderedProminent).tint(DesktopTheme.purple)
                .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || prompt.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || botID.isEmpty || saving)
            }
        }
        .padding(22).frame(width: 540, height: 520).background(DesktopTheme.paper)
        .onAppear { if botID.isEmpty { botID = store.state.bots.first?.id ?? "" } }
    }
}
