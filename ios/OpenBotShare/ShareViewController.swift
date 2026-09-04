import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let statusLabel = UILabel()
    private var started = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.97, green: 0.96, blue: 0.94, alpha: 1)

        let mascots = UIStackView()
        mascots.axis = .horizontal
        mascots.spacing = -8
        for color in [UIColor(red: 0.43, green: 0.36, blue: 0.86, alpha: 1), UIColor(red: 0.24, green: 0.69, blue: 0.50, alpha: 1)] {
            let mascot = makeMascot(color: color)
            mascots.addArrangedSubview(mascot)
        }

        let title = UILabel()
        title.text = "Send to OpenBot"
        title.font = .systemFont(ofSize: 21, weight: .bold)
        title.textAlignment = .center

        statusLabel.text = "Preparing this for your studio…"
        statusLabel.font = .systemFont(ofSize: 14, weight: .medium)
        statusLabel.textColor = .secondaryLabel
        statusLabel.numberOfLines = 3
        statusLabel.textAlignment = .center

        let stack = UIStackView(arrangedSubviews: [mascots, title, statusLabel])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 13
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -24),
            stack.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
        animateMascots(mascots)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !started else { return }
        started = true
        Task { await capture() }
    }

    @MainActor
    private func capture() async {
        var textParts: [String] = []
        var files: [OpenBotSharedPayload] = []
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        for item in items {
            if let attributed = item.attributedContentText?.string, !attributed.isEmpty { textParts.append(attributed) }
            for provider in item.attachments ?? [] where files.count < 6 {
                do {
                    if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier),
                       let value = try await load(provider, type: .fileURL), let url = value as? URL {
                        let accessed = url.startAccessingSecurityScopedResource()
                        defer { if accessed { url.stopAccessingSecurityScopedResource() } }
                        files.append(OpenBotSharedPayload(name: url.lastPathComponent, data: try boundedData(from: url)))
                    } else if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier),
                              let value = try await load(provider, type: .image) {
                        if let image = value as? UIImage, let data = image.jpegData(compressionQuality: 0.9) {
                            files.append(OpenBotSharedPayload(name: "Shared image.jpg", data: data))
                        } else if let url = value as? URL {
                            files.append(OpenBotSharedPayload(name: url.lastPathComponent, data: try boundedData(from: url)))
                        } else if let data = value as? Data {
                            files.append(OpenBotSharedPayload(name: "Shared image", data: data))
                        }
                    } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                              let value = try await load(provider, type: .url), let url = value as? URL {
                        textParts.append(url.absoluteString)
                    } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                              let value = try await load(provider, type: .plainText) {
                        if let text = value as? String { textParts.append(text) }
                        else if let text = value as? NSAttributedString { textParts.append(text.string) }
                    }
                } catch {
                    continue
                }
            }
        }

        let text = textParts.joined(separator: "\n\n").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty || !files.isEmpty else {
            finish(message: "Nothing shareable was found.", delay: 1.1)
            return
        }
        do {
            _ = try OpenBotSharedInbox.enqueue(text: text, files: files)
            finish(message: "Ready in OpenBot", delay: 0.75)
        } catch {
            finish(message: error.localizedDescription, delay: 1.3)
        }
    }

    private func load(_ provider: NSItemProvider, type: UTType) async throws -> NSSecureCoding? {
        try await withCheckedThrowingContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type.identifier, options: nil) { item, error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume(returning: item) }
            }
        }
    }

    private func boundedData(from url: URL) throws -> Data {
        let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
        guard size <= 25_000_000 else { throw ShareError.tooLarge }
        let data = try Data(contentsOf: url, options: .mappedIfSafe)
        guard data.count <= 25_000_000 else { throw ShareError.tooLarge }
        return data
    }

    private func makeMascot(color: UIColor) -> UIView {
        let mascot = UIView()
        mascot.backgroundColor = color
        mascot.layer.cornerRadius = 17
        mascot.layer.shadowColor = color.cgColor
        mascot.layer.shadowOpacity = 0.2
        mascot.layer.shadowRadius = 8
        mascot.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([mascot.widthAnchor.constraint(equalToConstant: 42), mascot.heightAnchor.constraint(equalToConstant: 36)])
        for offset in [-6.0, 6.0] {
            let eye = UIView()
            eye.backgroundColor = UIColor(red: 0.12, green: 0.11, blue: 0.16, alpha: 0.9)
            eye.layer.cornerRadius = 2
            eye.translatesAutoresizingMaskIntoConstraints = false
            mascot.addSubview(eye)
            NSLayoutConstraint.activate([
                eye.widthAnchor.constraint(equalToConstant: 4), eye.heightAnchor.constraint(equalToConstant: 7),
                eye.centerXAnchor.constraint(equalTo: mascot.centerXAnchor, constant: offset), eye.centerYAnchor.constraint(equalTo: mascot.centerYAnchor, constant: -1),
            ])
            eye.accessibilityIdentifier = "mascot-eye"
        }
        return mascot
    }

    private func animateMascots(_ stack: UIStackView) {
        guard !UIAccessibility.isReduceMotionEnabled else { return }
        for (index, mascot) in stack.arrangedSubviews.enumerated() {
            UIView.animate(withDuration: 1.1, delay: Double(index) * 0.18, options: [.autoreverse, .repeat, .allowUserInteraction]) {
                mascot.transform = CGAffineTransform(translationX: 0, y: index == 0 ? -3 : 2)
            }
        }
    }

    private func finish(message: String, delay: TimeInterval) {
        statusLabel.text = message
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
    }
}

private enum ShareError: Error { case tooLarge }
