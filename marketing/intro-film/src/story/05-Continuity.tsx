import { Interactive } from "remotion";
import {
  Character,
  ConversationScreen,
  move,
  reveal,
  useTime,
  World,
} from "./shared";

export const ContinuityStory = () => {
  const t = useTime();
  const pull = move(t, 0.15, 2.65);
  return (
    <World>
      <Interactive.Div
        name="Mac, revealed from the conversation"
        style={{
          position: "absolute",
          left: 129,
          top: 118,
          width: 1662,
          height: 956,
          transformOrigin: "50% 50%",
          transform: `translate(${-278 * pull}px, ${75 * pull}px) scale(${1 - pull * 0.365})`,
          opacity: reveal(t, 0, 0.35),
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "0 0 48px",
            background:
              "linear-gradient(125deg, #666, #181818 12%, #111 80%, #555)",
            borderRadius: 36,
            padding: 18,
            boxShadow: "0 2px 0 #999 inset, 0 35px 65px #00000012",
            border: "1px solid #888",
          }}
        >
          <div
            style={{
              height: "100%",
              display: "flex",
              overflow: "hidden",
              borderRadius: 21,
              background: "white",
            }}
          >
            <div
              style={{
                width: 348,
                padding: "39px 26px",
                background: "#f5f5f5",
                borderRight: "1px solid #e4e4e4",
              }}
            >
              <div style={{ display: "flex", gap: 9, marginBottom: 60 }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: 13,
                      height: 13,
                      borderRadius: 10,
                      background: "#bbb",
                    }}
                  />
                ))}
              </div>
              <div
                style={{ color: "#999", fontSize: 22, margin: "0 15px 27px" }}
              >
                Your conversations
              </div>
              {["Nova", "Milo", "Fern"].map((n, i) => (
                <div
                  key={n}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "20px 14px",
                    background: i === 0 ? "#e9e9e9" : undefined,
                    borderRadius: 17,
                    marginBottom: 10,
                  }}
                >
                  <Character kind={i} size={51} />
                  <div>
                    <div style={{ fontSize: 26, fontWeight: 550 }}>{n}</div>
                    <div style={{ fontSize: 18, color: "#888", marginTop: 4 }}>
                      {i === 0
                        ? "The launch pack is ready."
                        : "Ready when you are"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ flex: 1 }}>
              <ConversationScreen />
            </div>
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: 20,
            left: -56,
            right: -56,
            height: 30,
            background:
              "linear-gradient(#ddd, #c4c4c4 48%, #8e8e8e 52%, #dedede)",
            borderRadius: "3px 3px 70px 70px",
            borderBottom: "2px solid #999",
            boxShadow: "0 24px 28px #0000000c",
          }}
        >
          <div
            style={{
              width: 245,
              height: 10,
              borderRadius: "0 0 15px 15px",
              background: "#a8a8a8",
              margin: "0 auto",
            }}
          />
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="The phone catches the conversation"
        style={{
          position: "absolute",
          left: 1370,
          top: 232,
          width: 365,
          height: 746,
          borderRadius: 59,
          background:
            "linear-gradient(120deg, #8d8d8d, #202020 17%, #141414 80%, #666)",
          padding: 9,
          border: "2px solid #aaa",
          boxShadow: "0 24px 55px #00000018",
          translate: `${reveal(t, 1.5, 3.25, 460, 0)}px ${reveal(t, 1.5, 3.25, 80, 0)}px`,
          rotate: `${reveal(t, 1.5, 3.25, 12, -3)}deg`,
          opacity: reveal(t, 1.5, 2.3),
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: 48,
            overflow: "hidden",
            background: "white",
          }}
        >
          <div
            style={{
              position: "absolute",
              width: 112,
              height: 30,
              top: 11,
              left: 117,
              background: "#101010",
              borderRadius: 30,
              zIndex: 5,
            }}
          />
          <div
            style={{
              width: 420,
              height: 892,
              transform: "scale(0.822)",
              transformOrigin: "0 0",
            }}
          >
            <ConversationScreen phone sent={t > 4.3} />
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 8,
              left: 107,
              width: 132,
              height: 5,
              borderRadius: 5,
              background: "#111",
            }}
          />
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="The handoff, carried by a message"
        style={{
          position: "absolute",
          left: 1000,
          top: 698,
          background: "#111",
          color: "white",
          borderRadius: 38,
          padding: "18px 30px",
          fontSize: 27,
          whiteSpace: "nowrap",
          opacity: reveal(t, 2.9, 3.1) * (1 - move(t, 4, 4.3)),
          translate: `${move(t, 3.1, 4.3, 0, 450)}px ${-Math.sin(move(t, 3.1, 4.3) * Math.PI) * 195}px`,
          scale: move(t, 3.9, 4.3, 1, 0.65),
          boxShadow: "0 12px 30px #00000017",
        }}
      >
        Looks good. Send it.
      </Interactive.Div>
      <Interactive.Div
        name="Work travels with you"
        style={{
          position: "absolute",
          top: 75,
          left: 210,
          right: 200,
          fontSize: 80,
          lineHeight: 1.07,
          fontWeight: 610,
          letterSpacing: "-0.04em",
          opacity: reveal(t, 3.2, 4.05),
          translate: `0 ${reveal(t, 3.2, 4.05, -35, 0)}px`,
        }}
      >
        Leave the desk.
        <br />
        <span style={{ color: "#818181" }}>Keep the conversation.</span>
      </Interactive.Div>
      <Interactive.Div
        name="Platform note"
        style={{
          position: "absolute",
          left: 260,
          top: 923,
          fontSize: 26,
          color: "#666",
          opacity: reveal(t, 4.5, 5.15),
        }}
      >
        Mac + iPhone. One team.
      </Interactive.Div>
      <Interactive.Div
        name="Device bezel match cut"
        style={{
          position: "absolute",
          right: 0,
          top: 0,
          width: 1920,
          height: 1080,
          background: "#0c0c0d",
          clipPath: `inset(0 0 0 ${move(t, 7.3, 8, 100, 0)}%)`,
        }}
      />
    </World>
  );
};
