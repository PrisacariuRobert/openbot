import SwiftUI

struct DesktopMascotView: View {
    let bot: StudioBot
    var size: CGFloat = 42

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var floating = false
    @State private var blinking = false

    private var color: Color { Color(openBotHex: bot.color) }
    private var presence: Color {
        switch bot.status {
        case "failed": return .red
        case "waiting": return .orange
        case "working": return DesktopTheme.purple
        case "offline": return .gray
        default: return DesktopTheme.green
        }
    }

    var body: some View {
        ZStack {
            Ellipse()
                .fill(color.opacity(0.18))
                .frame(width: size * 0.62, height: size * 0.10)
                .blur(radius: size * 0.035)
                .offset(y: size * 0.39)

            if !["blob", "pebble", "sprout"].contains(bot.mascot) {
                Capsule().fill(color.opacity(0.9))
                    .frame(width: max(1.5, size * 0.026), height: size * 0.18)
                    .offset(y: -size * 0.36)
                Circle().fill(color)
                    .overlay(Circle().fill(.white.opacity(0.32)).padding(size * 0.018))
                    .frame(width: size * 0.115, height: size * 0.115)
                    .offset(y: -size * 0.46)
            }

            ears
            characterBody

            Circle().fill(presence)
                .frame(width: size * 0.18, height: size * 0.18)
                .overlay(Circle().stroke(.white, lineWidth: max(1.5, size * 0.04)))
                .offset(x: size * 0.35, y: size * 0.31)
        }
        .frame(width: size, height: size)
        .offset(y: floating ? -1.8 : 1)
        .rotationEffect(.degrees(bot.status == "working" ? (floating ? 1.2 : -1.2) : 0))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(bot.name), \(bot.status)")
        .task {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: bot.status == "working" ? 0.75 : 1.75).repeatForever(autoreverses: true)) {
                floating = true
            }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(Double.random(in: 2.4...5.4)))
                withAnimation(.easeInOut(duration: 0.08)) { blinking = true }
                try? await Task.sleep(for: .milliseconds(120))
                withAnimation(.easeInOut(duration: 0.10)) { blinking = false }
            }
        }
    }

    @ViewBuilder private var ears: some View {
        if bot.mascot == "sprout" {
            RoundedRectangle(cornerRadius: size * 0.08, style: .continuous)
                .fill(color).frame(width: size * 0.25, height: size * 0.18)
                .rotationEffect(.degrees(-34)).offset(x: -size * 0.13, y: -size * 0.35)
            RoundedRectangle(cornerRadius: size * 0.08, style: .continuous)
                .fill(color).frame(width: size * 0.25, height: size * 0.18)
                .rotationEffect(.degrees(34)).offset(x: size * 0.13, y: -size * 0.35)
        } else if bot.mascot == "nova" || bot.mascot == "sunny" {
            RoundedRectangle(cornerRadius: size * 0.05, style: .continuous)
                .fill(color).frame(width: size * 0.20, height: size * 0.20)
                .rotationEffect(.degrees(43)).offset(x: -size * 0.34, y: -size * 0.12)
            RoundedRectangle(cornerRadius: size * 0.05, style: .continuous)
                .fill(color).frame(width: size * 0.20, height: size * 0.20)
                .rotationEffect(.degrees(43)).offset(x: size * 0.34, y: -size * 0.12)
        }
    }

    private var characterBody: some View {
        let width = bot.mascot == "blob" || bot.mascot == "pebble" ? size * 0.90 : size * 0.84
        let height = bot.mascot == "sprout" ? size * 0.72 : size * 0.80
        return ZStack {
            RoundedRectangle(cornerRadius: width * (bot.mascot == "sunny" ? 0.50 : 0.32), style: .continuous)
                .fill(color)
            RoundedRectangle(cornerRadius: width * (bot.mascot == "sunny" ? 0.50 : 0.32), style: .continuous)
                .fill(LinearGradient(colors: [.white.opacity(0.50), .clear, .black.opacity(0.14)], startPoint: .topLeading, endPoint: .bottomTrailing))
            Ellipse().fill(.white.opacity(0.20))
                .frame(width: width * 0.48, height: height * 0.28)
                .rotationEffect(.degrees(-18))
                .offset(x: -width * 0.17, y: -height * 0.26)
            HStack(spacing: size * 0.09) {
                eye
                eye
            }
            .offset(y: -height * 0.08)
            MascotSmile(frowning: bot.status == "failed")
                .stroke(DesktopTheme.ink.opacity(0.75), style: StrokeStyle(lineWidth: max(1, size * 0.016), lineCap: .round))
                .frame(width: size * 0.12, height: size * 0.06)
                .offset(y: height * 0.14)
        }
        .frame(width: width, height: height)
        .offset(y: bot.mascot == "sprout" ? size * 0.06 : size * 0.03)
        .shadow(color: color.opacity(0.22), radius: size * 0.11, y: size * 0.06)
    }

    private var eye: some View {
        Capsule().fill(DesktopTheme.ink)
            .frame(width: size * (blinking ? 0.105 : 0.075), height: blinking ? max(1.3, size * 0.022) : size * 0.105)
    }
}

struct DesktopMascotStack: View {
    let bots: [StudioBot]
    var size: CGFloat = 42

    var body: some View {
        HStack(spacing: -size * 0.30) {
            ForEach(Array(bots.prefix(3).enumerated()), id: \.element.id) { index, bot in
                DesktopMascotView(bot: bot, size: size)
                    .offset(y: index == 1 ? size * 0.05 : 0)
                    .zIndex(Double(3 - index))
            }
        }
    }
}

private struct MascotSmile: Shape {
    let frowning: Bool

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let edge = frowning ? rect.maxY * 0.82 : rect.minY + rect.height * 0.18
        path.move(to: CGPoint(x: rect.minX, y: edge))
        path.addQuadCurve(
            to: CGPoint(x: rect.maxX, y: edge),
            control: CGPoint(x: rect.midX, y: frowning ? rect.minY : rect.maxY)
        )
        return path
    }
}

private extension Color {
    init(openBotHex value: String) {
        let clean = value.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var number: UInt64 = 0
        Scanner(string: clean).scanHexInt64(&number)
        guard clean.count == 6 else { self = DesktopTheme.purple; return }
        self.init(
            red: Double((number >> 16) & 0xff) / 255,
            green: Double((number >> 8) & 0xff) / 255,
            blue: Double(number & 0xff) / 255
        )
    }
}
