import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { LockKeyhole, ArrowUpRight, Folder, MousePointer2 } from "lucide-react";
import { Brand } from "../components";
import { Chrome, Set, smooth, clamp, Caption } from "./shared";

export const Browser = () => {
  const frame = useCurrentFrame();
  return (
    <Set>
      <Interactive.Div
        name="Fly into the private browser"
        style={{
          position: "absolute",
          left: 310,
          top: 115,
          rotate: `y ${interpolate(frame, [0, 68, 252, 300], [40, -4, -4, -30], smooth)}deg`,
          scale: interpolate(
            frame,
            [0, 80, 238, 300],
            [1.7, 1, 1, 1.7],
            smooth,
          ),
          translate: `${interpolate(frame, [0, 68], [1400, 0], smooth)}px 0`,
        }}
      >
        <Chrome label="Nova’s private browser">
          <div style={{ padding: "56px 64px" }}>
            <div
              style={{
                display: "flex",
                gap: 35,
                alignItems: "center",
                marginBottom: 50,
              }}
            >
              {[
                "gmail",
                "googlecalendar",
                "googledrive",
                "slack",
                "notion",
              ].map((id) => (
                <Brand key={id} id={id} size={48} />
              ))}
              <Folder size={48} />
            </div>
            <div
              style={{
                fontSize: 97,
                lineHeight: 1.01,
                letterSpacing: "-.06em",
                fontWeight: 570,
              }}
            >
              Where your
              <br />
              work lives.
            </div>
            <div style={{ marginTop: 48, display: "flex", gap: 16 }}>
              {["Launch notes", "Team calendar", "Project files"].map(
                (label, i) => (
                  <div
                    key={label}
                    style={{
                      padding: 24,
                      borderTop: "1px solid #ddd",
                      width: 350,
                      fontSize: 26,
                      translate: `0 ${interpolate(frame, [140 + i * 15, 170 + i * 15], [150, 0], smooth)}px`,
                      opacity: interpolate(
                        frame,
                        [140 + i * 15, 160 + i * 15],
                        [0, 1],
                        clamp,
                      ),
                    }}
                  >
                    {label}
                    <ArrowUpRight size={22} style={{ float: "right" }} />
                  </div>
                ),
              )}
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: interpolate(
                frame,
                [0, 25, 105, 134],
                [1, 1, 1, 0],
                clamp,
              ),
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                textAlign: "center",
                translate: `0 ${interpolate(frame, [105, 140], [0, -180], smooth)}px`,
              }}
            >
              <LockKeyhole size={74} />
              <div
                style={{
                  fontSize: 67,
                  fontWeight: 580,
                  letterSpacing: "-.05em",
                  marginTop: 35,
                }}
              >
                Sign in yourself.
              </div>
              <div style={{ fontSize: 29, color: "#777", marginTop: 20 }}>
                Your teammate waits.
              </div>
              <div
                style={{
                  fontSize: 24,
                  background: "#111",
                  color: "white",
                  borderRadius: 50,
                  padding: "18px 27px",
                  display: "inline-block",
                  marginTop: 45,
                }}
              >
                Continue task
              </div>
            </div>
          </div>
          <MousePointer2
            fill="#111"
            size={40}
            style={{
              position: "absolute",
              left: 850,
              top: 610,
              translate: `${interpolate(frame, [55, 105], [200, -120], smooth)}px ${interpolate(frame, [55, 105], [80, -90], smooth)}px`,
              opacity: interpolate(
                frame,
                [0, 45, 107, 120],
                [0, 1, 1, 0],
                clamp,
              ),
            }}
          />
        </Chrome>
      </Interactive.Div>
      <Caption>
        Signed-in websites. Connected tools. Allowed Mac apps & files.
      </Caption>
    </Set>
  );
};
