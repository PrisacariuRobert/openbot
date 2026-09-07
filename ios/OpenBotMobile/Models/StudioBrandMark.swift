import SwiftUI

/// Bundled brand artwork, rendered in the interface's ink color. Unknown services
/// use their name's initial rather than a misleading logo for a different company.
struct StudioBrandMark: View {
    let provider: String
    var size: CGFloat = 26

    static func assetName(for provider: String) -> String? {
        let key = provider.lowercased().replacingOccurrences(of: " ", with: "")
        let brand: String?
        switch key {
        case "opencode": brand = "opencode"
        case "openai", "chatgpt", "codex", "chatgpt/openai": brand = "openai"
        case "claude", "anthropic": brand = "claude"
        case "github", "copilot", "github-copilot", "githubcopilot": brand = "github"
        case "gitlab", "gitlab-duo", "gitlabduo": brand = "gitlab"
        case "gmail", "google", "google-mail": brand = "gmail"
        case "calendar", "google-calendar", "googlecalendar": brand = "googlecalendar"
        case "drive", "google-drive", "googledrive": brand = "googledrive"
        case "slack", "notion", "todoist", "dropbox": brand = key
        default: brand = nil
        }
        return brand.map { "Brand-\($0)" }
    }

    var body: some View {
        Group {
            if let asset = Self.assetName(for: provider) {
                Image(asset).resizable().renderingMode(asset == "Brand-opencode" ? .original : .template).scaledToFit()
            } else {
                Text(String(provider.prefix(1)).uppercased())
                    .font(.system(size: size * 0.72, weight: .semibold))
            }
        }
        .foregroundStyle(StudioPalette.ink)
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct StudioOutline: ViewModifier {
    var radius: CGFloat = 12
    func body(content: Content) -> some View {
        content.background(StudioPalette.paper, in: RoundedRectangle(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).stroke(StudioPalette.line, lineWidth: 1))
    }
}

extension View {
    func studioOutline(radius: CGFloat = 12) -> some View { modifier(StudioOutline(radius: radius)) }
}
