import SwiftUI

struct ConnectionView: View {
    @EnvironmentObject private var session: ConnectionSession
    @State private var address = ""
    @State private var accessKey = ""
    @FocusState private var focusedField: Field?

    private enum Field { case address, key }

    var body: some View {
        ZStack {
            OpenBotTheme.paper.ignoresSafeArea()
            Circle().fill(OpenBotTheme.purple.opacity(0.12)).frame(width: 330).blur(radius: 4).offset(x: 170, y: -330)
            Circle().fill(Color.green.opacity(0.08)).frame(width: 260).blur(radius: 8).offset(x: -180, y: 360)
            ScrollView {
                VStack(spacing: 24) {
                    Spacer(minLength: 24)
                    MascotPairView().frame(height: 126)
                    VStack(spacing: 8) {
                        Text("Your studio, in your pocket.")
                            .font(.system(size: 31, weight: .bold, design: .rounded))
                            .foregroundStyle(OpenBotTheme.ink)
                            .multilineTextAlignment(.center)
                        Text("Connect to the OpenBot running on your Mac. Your conversations, teammates and approvals stay there.")
                            .font(.system(size: 15, weight: .regular, design: .rounded))
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .lineSpacing(3)
                    }
                    VStack(spacing: 14) {
                        fieldLabel("OpenBot address", icon: "network")
                        TextField("https://your-private-address", text: $address)
                            .textInputAutocapitalization(.never).keyboardType(.URL).autocorrectionDisabled()
                            .textContentType(.URL).focused($focusedField, equals: .address)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .key }
                            .accessibilityIdentifier("server-address")
                            .openBotField()
                        fieldLabel("Private access key", icon: "key.fill")
                        SecureField("Paste the key from your Mac", text: $accessKey)
                            .textContentType(.oneTimeCode).focused($focusedField, equals: .key)
                            .submitLabel(.go)
                            .onSubmit { connect() }
                            .privacySensitive()
                            .accessibilityIdentifier("access-key")
                            .openBotField()
                        if let error = session.errorMessage {
                            Label(error, systemImage: "exclamationmark.circle.fill")
                                .font(.system(size: 13, weight: .medium, design: .rounded))
                                .foregroundStyle(Color(red: 0.72, green: 0.30, blue: 0.28))
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        Button {
                            connect()
                        } label: {
                            HStack(spacing: 9) {
                                if session.isConnecting { ProgressView().tint(.white) }
                                else { Image(systemName: "arrow.up.right") }
                                Text(session.isConnecting ? "Connecting…" : "Open my studio")
                            }
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                            .frame(maxWidth: .infinity, minHeight: 54)
                        }
                        .buttonStyle(.plain).foregroundStyle(.white)
                        .accessibilityIdentifier("connect-studio")
                        .background(OpenBotTheme.purple, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .shadow(color: OpenBotTheme.purple.opacity(0.22), radius: 18, y: 8)
                        .disabled(session.isConnecting)
                    }
                    .padding(20)
                    .background(.white.opacity(0.9), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(.black.opacity(0.06)))
                    VStack(alignment: .leading, spacing: 10) {
                        reassurance("The access key is protected in this iPhone’s Keychain.", icon: "lock.shield.fill")
                        reassurance("With Tailscale on both devices, OpenBot works over cellular or any Wi-Fi.", icon: "globe.americas.fill")
                        reassurance("Other public addresses must use HTTPS; never expose the Mac’s plain port.", icon: "checkmark.shield.fill")
                        reassurance("Use your Mac, or choose a private always-on host that keeps working when it is off.", icon: "server.rack")
                    }
                    Spacer(minLength: 20)
                }
                .padding(.horizontal, 20)
            }
        }
        .onAppear { if address.isEmpty { address = session.suggestedAddress } }
        .onChange(of: session.suggestedAddress) { _, value in if !value.isEmpty { address = value } }
    }

    private func fieldLabel(_ title: String, icon: String) -> some View {
        Label(title, systemImage: icon)
            .font(.system(size: 13, weight: .semibold, design: .rounded))
            .foregroundStyle(OpenBotTheme.ink)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, -8)
    }

    private func connect() {
        focusedField = nil
        Task { await session.connect(address: address, accessKey: accessKey) }
    }

    private func reassurance(_ text: String, icon: String) -> some View {
        Label { Text(text).fixedSize(horizontal: false, vertical: true) } icon: { Image(systemName: icon).foregroundStyle(OpenBotTheme.green) }
            .font(.system(size: 12.5, weight: .medium, design: .rounded))
            .foregroundStyle(.secondary)
    }
}

private extension View {
    func openBotField() -> some View {
        self.font(.system(size: 15, weight: .medium, design: .rounded))
            .padding(.horizontal, 15).frame(minHeight: 52)
            .background(Color.black.opacity(0.035), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(Color.black.opacity(0.08)))
    }
}

struct MascotPairView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var floating = false

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 44, style: .continuous)
                .fill(LinearGradient(colors: [OpenBotTheme.purple.opacity(0.12), .white.opacity(0.2)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 244, height: 122)
            HStack(spacing: -17) {
                BotMascotView(colorHex: "#6D5BD8", variant: "nova", status: "ready", size: 70).zIndex(3)
                BotMascotView(colorHex: "#E75C83", variant: "blob", status: "ready", size: 70).offset(y: 4).zIndex(2)
                BotMascotView(colorHex: "#36AA82", variant: "sprout", status: "ready", size: 70).zIndex(1)
            }
                .frame(width: 176, height: 90)
                .offset(y: floating ? -2.5 : 2)
                .shadow(color: OpenBotTheme.purple.opacity(0.15), radius: 16, y: 8)
        }
        .task {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true)) { floating = true }
        }
    }
}
