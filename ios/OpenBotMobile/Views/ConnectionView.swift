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
                            .openBotField()
                        fieldLabel("Private access key", icon: "key.fill")
                        SecureField("Paste the key from your Mac", text: $accessKey)
                            .textContentType(.password).focused($focusedField, equals: .key)
                            .openBotField()
                        if let error = session.errorMessage {
                            Label(error, systemImage: "exclamationmark.circle.fill")
                                .font(.system(size: 13, weight: .medium, design: .rounded))
                                .foregroundStyle(Color(red: 0.72, green: 0.30, blue: 0.28))
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        Button {
                            focusedField = nil
                            Task { await session.connect(address: address, accessKey: accessKey) }
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
                        .background(OpenBotTheme.purple, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .shadow(color: OpenBotTheme.purple.opacity(0.22), radius: 18, y: 8)
                        .disabled(session.isConnecting)
                    }
                    .padding(20)
                    .background(.white.opacity(0.9), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).stroke(.black.opacity(0.06)))
                    VStack(alignment: .leading, spacing: 10) {
                        reassurance("The access key is protected in this iPhone’s Keychain.", icon: "lock.shield.fill")
                        reassurance("Plain HTTP works only on private local addresses; remote addresses must use HTTPS.", icon: "checkmark.shield.fill")
                        reassurance("Your Mac remains the host and must be awake to do work.", icon: "macbook")
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

private struct MascotPairView: View {
    @State private var blinking = false
    @State private var floating = false

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 44, style: .continuous)
                .fill(LinearGradient(colors: [OpenBotTheme.purple.opacity(0.12), .white.opacity(0.2)], startPoint: .topLeading, endPoint: .bottomTrailing))
                .frame(width: 244, height: 122)
            mascot(color: OpenBotTheme.purple, ears: false).offset(x: -43, y: floating ? -3 : 1).rotationEffect(.degrees(-2))
            mascot(color: OpenBotTheme.green, ears: true).offset(x: 45, y: floating ? 2 : -2).rotationEffect(.degrees(2))
            Image(systemName: "sparkle").foregroundStyle(.white).offset(x: 15, y: -36)
        }
        .task {
            withAnimation(.easeInOut(duration: 1.8).repeatForever(autoreverses: true)) { floating = true }
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(Double.random(in: 2.3...4.8) * 1_000_000_000))
                withAnimation(.easeInOut(duration: 0.08)) { blinking = true }
                try? await Task.sleep(nanoseconds: 120_000_000)
                withAnimation(.easeInOut(duration: 0.1)) { blinking = false }
            }
        }
    }

    private func mascot(color: Color, ears: Bool) -> some View {
        ZStack {
            if ears {
                Capsule().fill(color.opacity(0.9)).frame(width: 24, height: 41).rotationEffect(.degrees(-28)).offset(x: -24, y: -36)
                Capsule().fill(color.opacity(0.9)).frame(width: 24, height: 41).rotationEffect(.degrees(28)).offset(x: 24, y: -36)
            }
            RoundedRectangle(cornerRadius: 27, style: .continuous)
                .fill(LinearGradient(colors: [color.opacity(0.78), color], startPoint: .top, endPoint: .bottom))
                .frame(width: 92, height: 78)
                .shadow(color: color.opacity(0.25), radius: 12, y: 7)
            HStack(spacing: 18) {
                Capsule().fill(OpenBotTheme.ink).frame(width: 8, height: blinking ? 2 : 12)
                Capsule().fill(OpenBotTheme.ink).frame(width: 8, height: blinking ? 2 : 12)
            }.offset(y: -5)
            Capsule().fill(OpenBotTheme.ink.opacity(0.72)).frame(width: 15, height: 3).offset(y: 16)
        }
    }
}
