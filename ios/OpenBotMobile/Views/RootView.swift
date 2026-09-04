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
    }
}
