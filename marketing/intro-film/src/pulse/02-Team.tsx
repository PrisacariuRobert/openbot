import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { Actor, Set, Title, Caption, smooth, clamp } from "./shared";

export const Team = () => {
  const frame = useCurrentFrame();
  return (
    <Set dark>
      <Title y={100} size={143}>
        One ask. A whole team.
      </Title>
      <Interactive.Div
        name="Consultation choreography"
        style={{
          position: "absolute",
          inset: 0,
          scale: interpolate(
            frame,
            [0, 35, 172, 240],
            [1.5, 1, 1, 0.68],
            smooth,
          ),
          rotate: `${interpolate(frame, [160, 240], [0, -9], smooth)}deg`,
        }}
      >
        <svg
          width="1920"
          height="1080"
          style={{
            position: "absolute",
            opacity: interpolate(
              frame,
              [20, 50, 180, 225],
              [0, 1, 1, 0],
              clamp,
            ),
          }}
        >
          <path
            d="M500 620 Q920 320 1410 620 M500 620 Q950 940 1410 620"
            stroke="#555"
            fill="none"
            strokeWidth="2"
            strokeDasharray="8 18"
          />
        </svg>
        {[0, 1, 2].map((kind) => (
          <div
            key={kind}
            style={{
              position: "absolute",
              left: interpolate(
                frame,
                [0, 62, 157, 219],
                [725, 260 + kind * 465, 260 + kind * 465, 265],
                smooth,
              ),
              top:
                430 +
                Math.sin(Math.min(1, frame / 62) * Math.PI) *
                  (kind === 1 ? -100 : 90),
              opacity:
                kind === 0
                  ? 1
                  : interpolate(frame, [7, 28, 166, 196], [0, 1, 1, 0], clamp),
            }}
          >
            <Actor
              kind={kind}
              size={kind === 0 ? 400 : 380}
              style={{
                position: "relative",
                rotate: `${Math.sin(frame / 32 + kind) * 7}deg`,
              }}
            />
            <div
              style={{
                textAlign: "center",
                fontSize: 29,
                color: "#aaa",
                opacity: interpolate(
                  frame,
                  [45, 65, 155, 181],
                  [0, 1, 1, 0],
                  clamp,
                ),
              }}
            >
              {["Research", "Make", "Check"][kind]}
            </div>
          </div>
        ))}
        <div
          style={{
            position: "absolute",
            left: interpolate(frame, [64, 140], [1430, 580], smooth),
            top:
              630 -
              Math.sin(Math.max(0, Math.min(1, (frame - 64) / 76)) * Math.PI) *
                150,
            width: 130,
            height: 86,
            borderRadius: 25,
            background: "#fff",
            opacity: interpolate(
              frame,
              [60, 70, 135, 143],
              [0, 1, 1, 0],
              clamp,
            ),
          }}
        />
      </Interactive.Div>
      <Interactive.Div
        name="One shared answer returns"
        style={{
          position: "absolute",
          left: 790,
          top: 486,
          width: 820,
          padding: "35px 42px",
          borderRadius: 30,
          background: "white",
          color: "#111",
          fontSize: 43,
          lineHeight: 1.25,
          fontWeight: 500,
          letterSpacing: "-.025em",
          scale: interpolate(frame, [177, 216], [0.8, 1], smooth),
          opacity: interpolate(frame, [177, 198], [0, 1], clamp),
        }}
      >
        The launch pack is
        <br />
        ready for your review.
      </Interactive.Div>
      <Caption dark>
        Teammates consult each other. One answer comes back.
      </Caption>
    </Set>
  );
};
