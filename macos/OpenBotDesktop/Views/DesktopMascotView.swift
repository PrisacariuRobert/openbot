import SwiftUI

/// One vector character renderer on Mac and iPhone; appearance stays yours.
struct DesktopMascotView: View {
    let bot: StudioBot
    var size: CGFloat = 42

    var body: some View {
        StudioCharacter(colorHex: bot.color, variant: bot.mascot, status: bot.status, size: size, seed: bot.id)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(bot.name), \(bot.status)")
    }
}

struct DesktopMascotStack: View {
    let bots: [StudioBot]
    var size: CGFloat = 42

    var body: some View {
        HStack(spacing: -size * 0.20) {
            ForEach(Array(bots.prefix(3).enumerated()), id: \.element.id) { index, bot in
                DesktopMascotView(bot: bot, size: size)
                    .zIndex(Double(3 - index))
            }
        }
    }
}
