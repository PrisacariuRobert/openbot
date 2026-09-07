import SwiftUI
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// Quiet Studio: shared by native Mac and iPhone. Keep in sync with design-tokens.
/// Teammate colors belong to the bot, never to the interface accent.
enum StudioPalette {
    static let accent = adaptive(light: 0x191919, dark: 0xF3F3F3)
    static let ink = adaptive(light: 0x191919, dark: 0xF3F3F3)
    static let muted = adaptive(light: 0x696969, dark: 0xAAAAAA)
    static let paper = adaptive(light: 0xFFFFFF, dark: 0x131313)
    static let sidebar = paper
    static let line = adaptive(light: 0xE9E9E9, dark: 0x323232)
    static let userBubble = adaptive(light: 0x191919, dark: 0xF3F3F3)
    static let userInk = adaptive(light: 0xFFFFFF, dark: 0x181818)
    static let surface = adaptive(light: 0xF4F4F4, dark: 0x252525)
    static let green = adaptive(light: 0x666666, dark: 0xAAAAAA) // Legacy status name; status also has a text label.

    private static func adaptive(light: UInt32, dark: UInt32) -> Color {
        #if os(iOS)
        return Color(uiColor: UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
        })
        #elseif os(macOS)
        return Color(nsColor: NSColor(name: nil) { appearance in
            let hex = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua ? dark : light
            return NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
        })
        #else
        return color(light)
        #endif
    }

    private static func color(_ hex: UInt32) -> Color {
        Color(.sRGB, red: Double((hex >> 16) & 255) / 255,
              green: Double((hex >> 8) & 255) / 255,
              blue: Double(hex & 255) / 255, opacity: 1)
    }
}

/// A shared, code-drawn character for the real Mac and iPhone clients.
/// Shapes stay inside the 100-point design space; color belongs only to identity.
struct StudioCharacter: View {
    let colorHex: String
    var variant: String = "nova"
    var status: String = "ready"
    var size: CGFloat = 44
    var seed: String = ""
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var phaseSeed: Double {
        let value = (seed + variant + colorHex).utf8.reduce(UInt64(5381)) { ($0 &* 33) &+ UInt64($1) }
        return Double(value % 10_000) / 1000
    }
    private var baseColor: Color {
        let hex = UInt32(colorHex.trimmingCharacters(in: CharacterSet(charactersIn: "#")), radix: 16) ?? 0x7768CD
        return Color(.sRGB, red: Double((hex >> 16) & 255) / 255, green: Double((hex >> 8) & 255) / 255, blue: Double(hex & 255) / 255, opacity: 1)
    }
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 20.0, paused: reduceMotion)) { timeline in
            let time = reduceMotion ? 0 : timeline.date.timeIntervalSinceReferenceDate + phaseSeed * 13
            let blink = !reduceMotion && time.truncatingRemainder(dividingBy: 3.5 + phaseSeed / 4) < 0.12
            let busy = ["working", "running", "celebrating"].contains(status)
            Canvas { context, canvasSize in
                context.scaleBy(x: canvasSize.width / 100, y: canvasSize.height / 100)
                context.translateBy(x: 0, y: reduceMotion ? 0 : sin(time * (busy ? 2.5 : 1.35)) * (busy ? 1.6 : 0.8))
                draw(in: &context, blinking: blink)
            }
        }
        .frame(width: size, height: size)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(variant) teammate, \(status)")
    }

    private func draw(in context: inout GraphicsContext, blinking: Bool) {
        let color = baseColor
        let face = Color(.sRGB, red: 0.13, green: 0.14, blue: 0.18, opacity: 0.94)
        if variant == "nova" {
            context.fill(Path(roundedRect: CGRect(x: 13, y: 42, width: 13, height: 19), cornerRadius: 6), with: .color(color.opacity(0.85)))
            context.fill(Path(roundedRect: CGRect(x: 74, y: 42, width: 13, height: 19), cornerRadius: 6), with: .color(color.opacity(0.85)))
            context.fill(Path(roundedRect: CGRect(x: 48, y: 13, width: 4, height: 17), cornerRadius: 2), with: .color(color))
            context.fill(Path(ellipseIn: CGRect(x: 44, y: 9, width: 12, height: 12)), with: .color(color))
            context.fill(Path(ellipseIn: CGRect(x: 47, y: 11, width: 4, height: 4)), with: .color(.white.opacity(0.45)))
        } else if variant == "sprout" {
            var leaf = Path()
            leaf.move(to: CGPoint(x: 50, y: 34)); leaf.addQuadCurve(to: CGPoint(x: 34, y: 10), control: CGPoint(x: 24, y: 30)); leaf.addQuadCurve(to: CGPoint(x: 50, y: 34), control: CGPoint(x: 57, y: 9))
            leaf.move(to: CGPoint(x: 51, y: 33)); leaf.addQuadCurve(to: CGPoint(x: 68, y: 9), control: CGPoint(x: 50, y: 8)); leaf.addQuadCurve(to: CGPoint(x: 51, y: 33), control: CGPoint(x: 82, y: 27))
            context.fill(leaf, with: .color(color.opacity(0.85)))
        } else if variant == "orbit" {
            var ringContext = context
            ringContext.translateBy(x: 50, y: 56); ringContext.rotate(by: .degrees(-23))
            ringContext.stroke(Path(ellipseIn: CGRect(x: -43, y: -13, width: 86, height: 26)), with: .color(color.opacity(0.65)), lineWidth: 7)
        } else if variant == "sunny" {
            for index in 0..<10 {
                var ray = context
                ray.translateBy(x: 50, y: 51); ray.rotate(by: .degrees(Double(index) * 36))
                ray.fill(Path(roundedRect: CGRect(x: -2.5, y: -43, width: 5, height: 8), cornerRadius: 2.5), with: .color(color.opacity(0.86)))
            }
        }
        let silhouette = Self.silhouette(variant)
        context.fill(silhouette, with: .color(color))
        if variant == "orbit" {
            var front = Path(); front.move(to: CGPoint(x: 11, y: 66)); front.addCurve(to: CGPoint(x: 91, y: 38), control1: CGPoint(x: 28, y: 83), control2: CGPoint(x: 84, y: 65))
            context.stroke(front, with: .color(color.opacity(0.93)), style: StrokeStyle(lineWidth: 6, lineCap: .round))
            context.stroke(front, with: .color(.white.opacity(0.21)), style: StrokeStyle(lineWidth: 1, lineCap: .round))
        }
        let eyeHeight: CGFloat = blinking ? 2 : 8
        for x in [CGFloat(40), CGFloat(55)] {
            context.fill(Path(roundedRect: CGRect(x: x, y: 47 + (8 - eyeHeight) / 2, width: 5.5, height: eyeHeight), cornerRadius: 2.75), with: .color(face))
        }
        var mouth = Path()
        mouth.move(to: CGPoint(x: 45, y: status == "failed" ? 64 : 61))
        mouth.addQuadCurve(to: CGPoint(x: 55, y: status == "failed" ? 64 : 61), control: CGPoint(x: 50, y: status == "failed" ? 59 : 66))
        context.stroke(mouth, with: .color(face.opacity(0.8)), style: StrokeStyle(lineWidth: 1.8, lineCap: .round))
    }

    static func silhouette(_ variant: String) -> Path {
        switch variant {
        case "nova": return Path(roundedRect: CGRect(x: 20, y: 25, width: 60, height: 58), cornerRadius: 21)
        case "sprout": return Path(roundedRect: CGRect(x: 20, y: 31, width: 60, height: 53), cornerRadius: 24)
        case "blob": return Path(ellipseIn: CGRect(x: 18, y: 22, width: 64, height: 64))
        case "orbit": return Path(ellipseIn: CGRect(x: 21, y: 23, width: 59, height: 61))
        case "sunny":
            var path = Path()
            let points = (0..<20).map { index in
                let angle = Double(index) / 20 * Double.pi * 2
                let radius = index.isMultiple(of: 2) ? 32.0 : 28.0
                return CGPoint(x: 50 + cos(angle) * radius, y: 51 + sin(angle) * radius)
            }
            for index in points.indices {
                let point = points[index]
                let next = points[(index + 1) % points.count]
                if index == 0 {
                    let previous = points[points.count - 1]
                    path.move(to: CGPoint(x: (previous.x + point.x) / 2, y: (previous.y + point.y) / 2))
                }
                path.addQuadCurve(to: CGPoint(x: (point.x + next.x) / 2, y: (point.y + next.y) / 2), control: point)
            }
            path.closeSubpath(); return path
        default:
            var path = Path()
            path.move(to: CGPoint(x: 24, y: 39))
            path.addCurve(to: CGPoint(x: 61, y: 23), control1: CGPoint(x: 30, y: 20), control2: CGPoint(x: 51, y: 18))
            path.addCurve(to: CGPoint(x: 83, y: 65), control1: CGPoint(x: 81, y: 30), control2: CGPoint(x: 84, y: 46))
            path.addCurve(to: CGPoint(x: 51, y: 84), control1: CGPoint(x: 82, y: 81), control2: CGPoint(x: 67, y: 85))
            path.addCurve(to: CGPoint(x: 19, y: 68), control1: CGPoint(x: 30, y: 85), control2: CGPoint(x: 19, y: 81))
            path.addQuadCurve(to: CGPoint(x: 24, y: 39), control: CGPoint(x: 17, y: 49)); path.closeSubpath(); return path
        }
    }
}
