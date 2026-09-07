import { Interactive } from "remotion";
import { Check, Repeat2 } from "lucide-react";
import { Character, move, reveal, useTime, World, Pack } from "./shared";

export const DecisionStory = () => {
  const t = useTime();
  const approve = move(t, 5.95, 6.17);
  return (
    <World>
      <Interactive.Div
        name="A useful routine"
        style={{
          position: "absolute",
          inset: 0,
          translate: `0 ${move(t, 2.65, 3.4, 0, -1180)}px`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 185,
            top: 148,
            fontSize: 107,
            fontWeight: 620,
            letterSpacing: "-0.045em",
            opacity: reveal(t, 0.12, 0.65),
          }}
        >
          Good work.
          <br />
          Worth repeating.
        </div>
        <div style={{ position: "absolute", right: 238, top: 142 }}>
          <Character kind={2} size={245} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 187,
            right: 187,
            top: 501,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          {["M", "T", "W", "T", "F"].map((day, i) => (
            <div
              key={i}
              style={{
                width: 260,
                paddingTop: 20,
                borderTop: "1px solid #ccc",
                opacity: reveal(t, 0.35 + i * 0.08, 0.9 + i * 0.08),
                translate: `0 ${reveal(t, 0.35 + i * 0.08, 1.05 + i * 0.08, 50, 0)}px`,
              }}
            >
              <div style={{ color: "#888", fontSize: 24 }}>{day}</div>
              <div
                style={{
                  fontSize: 112,
                  fontWeight: 540,
                  letterSpacing: "-0.04em",
                  marginTop: 28,
                }}
              >
                {7 + i}
              </div>
              <div style={{ fontSize: 24, color: "#777", marginTop: 23 }}>
                09:00
              </div>
              <div
                style={{
                  marginTop: 19,
                  opacity: reveal(t, 1.15 + i * 0.17, 1.37 + i * 0.17),
                }}
              >
                <Check size={30} />
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            left: 190,
            top: 883,
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: "#666",
            fontSize: 29,
          }}
        >
          <Repeat2 size={30} /> Teach it once. Make it a routine.
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="The work stops for you"
        style={{
          position: "absolute",
          inset: 0,
          background: "#0c0c0d",
          color: "white",
          translate: `0 ${move(t, 2.65, 3.4, 1080, 0)}px`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 154,
            top: 340,
            fontSize: 134,
            lineHeight: 1.02,
            fontWeight: 580,
            letterSpacing: "-0.045em",
          }}
        >
          Your team.
          <br />
          <span style={{ color: "#858585" }}>Your call.</span>
        </div>
        <div
          style={{
            position: "absolute",
            left: 165,
            top: 695,
            fontSize: 29,
            lineHeight: 1.4,
            color: "#aaa",
            width: 520,
          }}
        >
          Sensitive actions wait for your okay.
        </div>
        <div
          style={{
            position: "absolute",
            left: 925,
            top: 207,
            width: 790,
            height: 665,
            borderRadius: 36,
            background: "white",
            color: "#111",
            padding: "50px 48px",
            scale: reveal(t, 3.15, 3.95, 0.93, 1),
          }}
        >
          <div style={{ fontSize: 22, color: "#888" }}>
            NOVA NEEDS YOUR OKAY
          </div>
          <div
            style={{
              marginTop: 23,
              fontSize: 56,
              fontWeight: 600,
              letterSpacing: "-0.04em",
            }}
          >
            Share the launch pack?
          </div>
          <div
            style={{
              margin: "28px 0 34px",
              fontSize: 27,
              lineHeight: 1.45,
              color: "#777",
            }}
          >
            To the launch team · 3 recipients
            <br />
            The deck, website and plan. All together.
          </div>
          <Pack compact />
          <div
            style={{
              display: "flex",
              gap: 16,
              justifyContent: "flex-end",
              marginTop: 48,
              fontSize: 27,
            }}
          >
            <div
              style={{
                padding: "22px 30px",
                border: "1px solid #ddd",
                borderRadius: 45,
              }}
            >
              Keep draft
            </div>
            <div
              style={{
                padding: "22px 30px",
                borderRadius: 45,
                background: "#111",
                color: "white",
                minWidth: 235,
                textAlign: "center",
                scale: 1 - Math.sin(approve * Math.PI) * 0.065,
              }}
            >
              {approve < 0.8 ? (
                "Approve & send"
              ) : (
                <span
                  style={{
                    display: "inline-flex",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <Check size={27} /> Approved
                </span>
              )}
            </div>
          </div>
          <div
            style={{
              position: "absolute",
              right: 122,
              bottom: 105,
              width: 110,
              height: 110,
              border: "2px solid #555",
              borderRadius: "50%",
              opacity: Math.sin(approve * Math.PI) * 0.45,
              scale: 0.75 + approve * 0.85,
            }}
          />
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="White approval surface opens the next shot"
        style={{
          position: "absolute",
          left: 925,
          top: 207,
          width: 790,
          height: 665,
          borderRadius: 36,
          background: "white",
          opacity: reveal(t, 6.6, 6.72),
          scale: move(t, 6.6, 7, 1, 4.3),
        }}
      />
    </World>
  );
};
