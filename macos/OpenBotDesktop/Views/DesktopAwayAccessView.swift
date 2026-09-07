import SwiftUI
import AppKit

private struct AwayDevice: Decodable, Identifiable {
    let id: String
    let name: String
    let revokedAt: Double?
}
private struct AwayReadiness: Decodable {
    let ready: Bool
    let detail: String
    let devices: [AwayDevice]
}
private struct AwayInvitation: Decodable {
    let qr: String
    let expiresAt: Double
    var image: NSImage? {
        guard let encoded = qr.split(separator: ",").last, let data = Data(base64Encoded: String(encoded)) else { return nil }
        return NSImage(data: data)
    }
}

struct DesktopAwayAccessView: View {
    @Environment(\.dismiss) private var dismiss
    let client: StudioAPIClient
    @State private var readiness: AwayReadiness?
    @State private var invitation: AwayInvitation?
    @State private var busy = false
    @State private var error: String?
    @State private var revoking: AwayDevice?

    var body: some View {
        VStack(spacing: 0) {
            HStack { Label("Away access", systemImage: "iphone").font(.headline); Spacer(); Button("Done") { dismiss() } }
                .padding(20)
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Text(readiness?.ready == true ? "Away access is ready" : "Your studio, wherever you are")
                        .font(.system(size: 26, weight: .bold, design: .default))
                    Text("Just OpenBot on your Mac and iPhone. No extra apps.").foregroundStyle(.secondary)
                    Label(readiness?.detail ?? "Checking the connection and access protection…", systemImage: readiness?.ready == true ? "checkmark.shield" : "globe")
                        .fixedSize(horizontal: false, vertical: true).padding(16).frame(maxWidth: .infinity, alignment: .leading)
                        .background(DesktopTheme.purple.opacity(0.06), in: RoundedRectangle(cornerRadius: 16))
                    if readiness?.ready == true {
                        if let invitation, let image = invitation.image {
                            TimelineView(.periodic(from: .now, by: 1)) { context in
                                let remaining = max(0, Int(invitation.expiresAt / 1000 - context.date.timeIntervalSince1970))
                                VStack(spacing: 12) {
                                    if remaining > 0 {
                                        Image(nsImage: image).interpolation(.none).resizable().frame(width: 240, height: 240)
                                        Text("In OpenBot on your iPhone, tap Scan my Mac’s QR code.").multilineTextAlignment(.center)
                                        Text("Single-use code · \(remaining / 60):\(String(format: "%02d", remaining % 60)) remaining").font(.caption).foregroundStyle(.secondary)
                                        Button("Hide and cancel code") { self.invitation = nil; Task { _ = try? await client.awayData("/pairing", method: "DELETE") } }
                                    } else {
                                        Text("This code expired. Show a new one when your phone is ready.")
                                        Button("Show a new QR code") { Task { await showCode() } }.disabled(busy)
                                    }
                                }.frame(maxWidth: .infinity)
                            }
                        } else {
                            Button { Task { await showCode() } } label: { Label("Connect my iPhone", systemImage: "qrcode") }
                                .buttonStyle(.borderedProminent).tint(DesktopTheme.purple).controlSize(.large).disabled(busy)
                        }
                    }
                    if busy { ProgressView().controlSize(.small) }
                    if let error { Text(error).foregroundStyle(Color.primary).fixedSize(horizontal: false, vertical: true) }
                    Text("Keep this Mac awake and online. A private always-on host can work while your Mac is off.")
                        .font(.callout).foregroundStyle(.secondary)
                    Button("Check again") { Task { await refresh() } }.disabled(busy)
                    ForEach(readiness?.devices.filter { $0.revokedAt == nil } ?? []) { device in
                        HStack { Label(device.name, systemImage: "iphone"); Spacer(); Button("Disconnect") { revoking = device } }
                    }
                }.padding(24)
            }
        }
        .frame(width: 550, height: 650).background(DesktopTheme.paper)
        .task { await refresh() }
        .confirmationDialog("Disconnect this phone?", isPresented: Binding(get: { revoking != nil }, set: { if !$0 { revoking = nil } })) {
            Button("Disconnect phone", role: .destructive) {
                guard let device = revoking else { return }
                Task {
                    do { _ = try await client.awayData("/devices/\(device.id)", method: "DELETE"); await refresh() }
                    catch { self.error = error.localizedDescription }
                }
            }
        } message: { Text("It will need a new QR code to use your studio again.") }
    }
    private func refresh() async {
        busy = true; error = nil
        defer { busy = false }
        do {
            readiness = try JSONDecoder().decode(AwayReadiness.self, from: await client.awayData())
            if readiness?.ready != true { invitation = nil }
        } catch { self.error = error.localizedDescription }
    }
    private func showCode() async {
        busy = true; error = nil
        defer { busy = false }
        do { invitation = try JSONDecoder().decode(AwayInvitation.self, from: await client.awayData("/pairing", method: "POST")) }
        catch { self.error = error.localizedDescription }
    }
}
