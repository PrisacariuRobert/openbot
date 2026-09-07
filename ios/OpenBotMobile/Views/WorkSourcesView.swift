import SwiftUI

struct WorkSourcesView: View {
    @ObservedObject var store: StudioStore
    @State private var botID = ""
    @State private var settings: StudioWorkSources?
    @State private var service = "slack"
    @State private var query = ""
    @State private var choices: StudioWorkSourceChoices?
    @State private var busy = false
    @State private var notice = ""

    var body: some View {
        DisclosureGroup("Make your brief yours") {
            VStack(alignment: .leading, spacing: 14) {
                Text("Choose up to two sources per app for each teammate’s morning brief and weekly review. Gmail and Calendar keep their existing read permissions. Nothing is sent or changed.")
                    .font(.footnote).foregroundStyle(.secondary)
                Picker("Teammate", selection: $botID) { ForEach(store.state.bots) { bot in Text(bot.name).tag(bot.id) } }.disabled(busy)
                if let value = settings {
                    Picker("Recent Slack context", selection: Binding(get: { settings?.lookbackHours ?? 24 }, set: { settings?.lookbackHours = $0; notice = "Unsaved changes" })) {
                        Text("Past day").tag(24); Text("Past three days").tag(72); Text("Past week").tag(168)
                    }.disabled(busy)
                    Text("Weekly reviews use seven days of Slack. Notion pages and open Todoist tasks show their current state, not an activity history. Reconfirm sources after reconnecting an account.")
                        .font(.caption).foregroundStyle(.secondary)
                    ForEach(value.selections, id: \.key) { entry in
                        HStack(alignment: .center, spacing: 12) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(entry.service.capitalized).font(.caption).foregroundStyle(.secondary)
                                Text(entry.label).font(.callout).fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 0)
                            Button("Remove") { toggle(entry) }.disabled(busy).accessibilityLabel("Remove \(entry.label)")
                        }.padding(10).background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
                    }
                    if value.selections.isEmpty { Text("No extra sources selected. Your teammate will not search these apps for a brief.").font(.footnote).foregroundStyle(.secondary) }
                    Picker("App", selection: $service) { Text("Slack").tag("slack"); Text("Notion").tag("notion"); Text("Todoist").tag("todoist") }
                        .disabled(busy).onChange(of: service) { _, _ in choices = nil; query = "" }
                    if service == "notion" { TextField("Find a shared page", text: $query).textFieldStyle(.roundedBorder).disabled(busy) }
                    Button(busy ? "Working…" : "Browse sources") {
                        busy = true; notice = ""
                        Task {
                            defer { busy = false }
                            do { choices = try await store.workSourceChoices(service: service, query: query) }
                            catch { choices = nil; notice = "Couldn’t list sources. Check this app’s connection and permissions in Apps & Tools." }
                        }
                    }.disabled(busy)
                    if let choices {
                        ForEach(choices.choices, id: \.key) { entry in
                            Toggle(entry.label, isOn: Binding(get: { settings?.selections.contains(where: { $0.service == entry.service && $0.id == entry.id }) == true }, set: { _ in toggle(entry) })).disabled(busy)
                        }
                        if choices.choices.isEmpty { Text("No shared sources returned.").font(.footnote).foregroundStyle(.secondary) }
                        if choices.limited { Text("A bounded list, not every source. For Notion, narrow the page name. Slack lists joined channels from the first page.").font(.caption).foregroundStyle(.secondary) }
                    }
                    Button("Save sources") {
                        guard let value = settings else { return }; busy = true
                        Task {
                            defer { busy = false }
                            do { settings = try await store.saveWorkSources(botID: botID, value: value); notice = "Saved. Future briefs will use these sources." }
                            catch { notice = "Couldn’t save. Give this teammate read access to the selected apps, then try again." }
                        }
                    }.buttonStyle(.borderedProminent).disabled(busy)
                } else { ProgressView().controlSize(.small) }
                if !notice.isEmpty { Text(notice).font(.footnote).foregroundStyle(.secondary).accessibilityAddTraits(.updatesFrequently) }
            }.padding(.top, 12)
        }
        .padding(16).background(.background.opacity(0.8), in: RoundedRectangle(cornerRadius: 18))
        .onAppear { if botID.isEmpty { botID = store.state.bots.first?.id ?? "" } }
        .task(id: botID) {
            guard !botID.isEmpty else { return }; let selected = botID
            settings = nil; choices = nil; notice = ""
            do { let value = try await store.workSources(botID: selected); if botID == selected { settings = value } }
            catch { if botID == selected { notice = "Couldn’t load sources. Check your studio connection." } }
        }
    }

    private func toggle(_ entry: StudioWorkSource) {
        guard var value = settings else { return }
        if value.selections.contains(where: { $0.key == entry.key }) { value.selections.removeAll { $0.key == entry.key } }
        else {
            guard value.selections.filter({ $0.service == entry.service }).count < 2 else { notice = "Choose up to two sources per app."; return }
            value.selections.append(entry)
        }
        settings = value; notice = "Unsaved changes"
    }
}

struct WorkFollowupsView: View {
    @ObservedObject var store: StudioStore
    @State private var pendingDigestChoice: Bool?
    @State private var data: StudioWorkFollowups?
    @State private var busy = false
    @State private var notice = ""
    @State private var history = false

    var body: some View {
        DisclosureGroup("Your follow-ups") {
            VStack(alignment: .leading, spacing: 14) {
                Text("Keep useful suggestions from a saved brief. Tracking is local: it does not send messages, create reminders or change Todoist. Sources are snapshots, not live facts.")
                    .font(.footnote).foregroundStyle(.secondary)
                Toggle("Show a daily suggestion digest here", isOn: Binding(get: { pendingDigestChoice ?? (data?.digestEnabled == true) }, set: { value in
                    pendingDigestChoice = value
                    busy = true
                    Task { defer { busy = false; pendingDigestChoice = nil }; do { try await store.updateWorkDigest(enabled: value); await refresh() } catch { notice = "Couldn’t update your digest preference." } }
                })).disabled(busy || data == nil)
                Text("Optional and in-app only. New briefs can prepare up to five suggestions, at most once every 24 hours. Exact repeats are remembered for 90 days. Nothing is sent or automatically tracked.").font(.caption).foregroundStyle(.secondary)
                if let digest = data?.digest, !digest.items.isEmpty {
                    Text("A few things worth considering").font(.headline)
                    Text("Prepared \(String(digest.createdAt.prefix(10))) from saved reports, not a fresh account check.").font(.caption).foregroundStyle(.secondary)
                    ForEach(digest.items) { item in followupRow(item, suggestion: true) }
                    Button("Dismiss digest") { busy = true; Task { defer { busy = false }; do { try await store.updateWorkDigest(enabled: nil); await refresh() } catch { notice = "Couldn’t dismiss the digest." } } }.disabled(busy)
                }
                ForEach((data?.tracked ?? []).filter { history || $0.status == "open" }) { item in
                    followupRow(item, suggestion: false)
                }
                if data?.tracked.contains(where: { $0.status == "open" }) != true { Text("No open follow-ups. Run a brief, then choose which suggestions to keep.").font(.footnote).foregroundStyle(.secondary) }
                if data?.tracked.contains(where: { $0.status != "open" }) == true { Toggle("Show finished items", isOn: $history) }
                if let data, !data.suggestions.isEmpty {
                    DisclosureGroup("Suggestions from recent briefs (\(data.suggestions.count))") {
                        VStack(spacing: 12) { ForEach(data.suggestions) { item in followupRow(item, suggestion: true) } }.padding(.top, 12)
                    }
                }
                if !notice.isEmpty { Text(notice).font(.footnote).foregroundStyle(.secondary) }
            }.padding(.top, 12)
        }.padding(16).background(.background.opacity(0.8), in: RoundedRectangle(cornerRadius: 18))
        .task { await refresh() }
    }
    private func followupRow(_ item: StudioWorkFollowup, suggestion: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(item.text).font(.callout).fixedSize(horizontal: false, vertical: true)
            Text("\(item.status?.capitalized ?? "Suggested") · source captured \(String(item.capturedAt.prefix(10)))").font(.caption).foregroundStyle(.secondary)
            ForEach(item.sources) { source in
                if let raw = source.url, let url = URL(string: raw), url.scheme == "https", url.user == nil, url.password == nil {
                    Link(source.title, destination: url).font(.caption)
                } else { Text(source.title).font(.caption).foregroundStyle(.secondary) }
            }
            HStack {
                Button(suggestion ? "Track this" : item.status == "open" ? "Mark done" : "Reopen") {
                    busy = true
                    Task {
                        defer { busy = false }
                        do {
                            if suggestion { try await store.trackFollowup(item) }
                            else { try await store.updateFollowup(item.id, status: item.status == "open" ? "done" : "open") }
                            await refresh()
                        } catch { notice = "Couldn’t save that change. Try again." }
                    }
                }.buttonStyle(.bordered).disabled(busy)
                if !suggestion && item.status == "open" {
                    Button("Dismiss") { busy = true; Task { defer { busy = false }; do { try await store.updateFollowup(item.id, status: "dismissed"); await refresh() } catch { notice = "Couldn’t save that change." } } }.disabled(busy)
                }
            }
        }.padding(12).frame(maxWidth: .infinity, alignment: .leading).background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
    }
    private func refresh() async {
        do { data = try await store.workFollowups(); notice = "" }
        catch { notice = "Couldn’t load follow-ups. Check your studio connection." }
    }
}
