import SwiftUI
import AVFoundation

struct PairingScannerView: UIViewControllerRepresentable {
    let onScan: (URL) -> Void
    func makeUIViewController(context: Context) -> PairingScannerController { PairingScannerController(onScan: onScan) }
    func updateUIViewController(_ controller: PairingScannerController, context: Context) {}
    static func dismantleUIViewController(_ controller: PairingScannerController, coordinator: ()) { controller.stop() }
}

final class PairingScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    private let capture = AVCaptureSession()
    private let queue = DispatchQueue(label: "app.openbot.pairing-camera")
    private var preview: AVCaptureVideoPreviewLayer?
    private let onScan: (URL) -> Void
    private var finished = false
    private let explanation = UILabel()

    init(onScan: @escaping (URL) -> Void) { self.onScan = onScan; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("Use init(onScan:)") }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        explanation.textColor = .white
        explanation.numberOfLines = 0
        explanation.textAlignment = .center
        explanation.text = "Point at the QR code in OpenBot on your Mac."
        explanation.accessibilityIdentifier = "pairing-camera-help"
        view.addSubview(explanation)
        Task { @MainActor in
            let allowed = await AVCaptureDevice.requestAccess(for: .video)
            guard allowed, !finished else {
                explanation.text = "Allow camera access in iPhone Settings to scan your Mac’s QR code. No images are saved."
                return
            }
            configure()
        }
    }
    private func configure() {
        guard let camera = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: camera), capture.canAddInput(input) else {
            explanation.text = "A camera is not available. You can also open a pairing link on this iPhone."
            return
        }
        capture.beginConfiguration()
        capture.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard capture.canAddOutput(output) else { capture.commitConfiguration(); return }
        capture.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.qr]
        capture.commitConfiguration()
        let layer = AVCaptureVideoPreviewLayer(session: capture)
        layer.videoGravity = .resizeAspectFill
        view.layer.insertSublayer(layer, at: 0)
        preview = layer
        view.setNeedsLayout()
        let capture = capture
        queue.async { capture.startRunning() }
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview?.frame = view.bounds
        explanation.frame = CGRect(x: 24, y: view.bounds.height - 145, width: view.bounds.width - 48, height: 100)
        explanation.backgroundColor = UIColor.black.withAlphaComponent(0.65)
        explanation.layer.cornerRadius = 16
        explanation.clipsToBounds = true
    }
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard !finished, let value = (objects.first as? AVMetadataMachineReadableCodeObject)?.stringValue, let url = URL(string: value) else { return }
        guard OpenBotDeepLink.pairingInvitation(from: url) != nil else { explanation.text = "That is not an OpenBot pairing code. Show a fresh QR code in OpenBot on your Mac."; return }
        stop()
        onScan(url)
    }
    func stop() { finished = true; let capture = capture; queue.async { capture.stopRunning() } }
}
