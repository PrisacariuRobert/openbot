import SwiftUI

struct RootView: View {
    @EnvironmentObject private var session: ConnectionSession

    var body: some View {
        Group {
            if session.isAuthenticated, let url = session.serverURL {
                StudioContainerView(url: url)
            } else {
                ConnectionView()
            }
        }
        .animation(.snappy(duration: 0.34), value: session.isAuthenticated)
        .sheet(item: $session.pairingInvitation) { invitation in
            VStack(spacing: 20) {
                Image(systemName: "iphone.and.arrow.forward").font(.system(size: 42)).foregroundStyle(OpenBotTheme.purple)
                Text("Connect to your studio?").font(.title2.bold())
                Text((invitation.server.host ?? "Your Mac") + invitation.server.path)
                    .font(.callout).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    .textSelection(.enabled)
                Text("Only continue if you scanned this code from your own OpenBot. This phone will be able to use your studio and approve work.")
                    .font(.callout).multilineTextAlignment(.center)
                Button("Connect my iPhone") {
                    session.pairingInvitation = nil
                    Task { await session.connectByQR(invitation) }
                }.buttonStyle(.borderedProminent).tint(OpenBotTheme.purple)
                Button("Cancel", role: .cancel) { session.pairingInvitation = nil }
            }.padding(28).presentationDetents([.medium])
        }
    }
}
