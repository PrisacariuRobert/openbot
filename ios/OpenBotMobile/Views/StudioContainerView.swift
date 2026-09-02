import SwiftUI

struct StudioContainerView: View {
    @EnvironmentObject private var session: ConnectionSession
    @StateObject private var network = NetworkMonitor()
    @State private var showingSettings = false
    let url: URL

    var body: some View {
        NavigationStack {
            ZStack(alignment: .top) {
                StudioWebView(url: url, onSessionExpired: session.webSessionExpired)
                    .ignoresSafeArea(edges: .bottom)
                if !network.isOnline {
                    Label("You’re offline — your studio will reconnect automatically", systemImage: "wifi.slash")
                        .font(.system(size: 12, weight: .semibold, design: .rounded))
                        .padding(.horizontal, 13).padding(.vertical, 9)
                        .foregroundStyle(.white).background(.black.opacity(0.82), in: Capsule())
                        .padding(.top, 8).transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .navigationTitle("OpenBot")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    HStack(spacing: 6) {
                        Circle().fill(network.isOnline ? OpenBotTheme.green : .orange).frame(width: 8, height: 8)
                        Text(network.isOnline ? "Live" : "Offline").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingSettings = true } label: { Image(systemName: "gearshape.fill") }
                        .accessibilityLabel("Connection settings")
                }
            }
            .sheet(isPresented: $showingSettings) { ConnectionSettingsView() }
        }
        .animation(.snappy, value: network.isOnline)
    }
}

private struct ConnectionSettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: ConnectionSession

    var body: some View {
        NavigationStack {
            List {
                Section("Connected studio") {
                    Label(session.displayAddress, systemImage: "lock.shield.fill")
                        .font(.system(.subheadline, design: .rounded))
                    Label("The private access key is stored only in this iPhone’s Keychain.", systemImage: "iphone.gen3")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section {
                    Button("Reconnect with another studio") { session.disconnect(keepAddress: false); dismiss() }
                    Button("Forget this access key", role: .destructive) { session.disconnect(); dismiss() }
                }
            }
            .navigationTitle("Connection")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium])
    }
}
