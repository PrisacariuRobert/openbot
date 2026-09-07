import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { ArrowUp, Plus, Check } from "lucide-react";
import { Mascot } from "../components";
import { Set, smooth, clamp } from "./shared";

const Chat = ({ phone = false }: { phone?: boolean }) => (
  <div
    style={{
      height: "100%",
      background: "#fcfcfc",
      color: "#111",
      padding: phone ? 28 : 40,
      display: "flex",
      flexDirection: "column",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 18,
        borderBottom: "1px solid #e5e5e5",
        paddingBottom: 23,
      }}
    >
      <Mascot size={phone ? 55 : 64} />
      <div>
        <b style={{ fontSize: phone ? 25 : 29 }}>Nova</b>
        <div style={{ fontSize: 17, color: "#888", marginTop: 4 }}>
          Your teammate
        </div>
      </div>
    </div>
    <div
      style={{
        marginTop: phone ? 50 : 70,
        background: "#111",
        color: "white",
        fontSize: phone ? 24 : 33,
        lineHeight: 1.3,
        padding: phone ? 24 : 30,
        borderRadius: 24,
        alignSelf: "flex-end",
        maxWidth: phone ? "100%" : "76%",
      }}
    >
      Take care of the launch.
    </div>
    <div style={{ fontSize: phone ? 24 : 33, lineHeight: 1.35, marginTop: 35 }}>
      The team has prepared the launch pack.
    </div>
    <div
      style={{
        marginTop: 25,
        padding: 25,
        background: "#eee",
        borderRadius: 18,
        fontSize: phone ? 22 : 28,
      }}
    >
      Launch pack <span style={{ float: "right" }}>↗</span>
    </div>
    <div style={{ fontSize: phone ? 20 : 25, color: "#777", marginTop: 20 }}>
      Ready for your review.
    </div>
    <div
      style={{
        marginTop: "auto",
        border: "1px solid #ddd",
        borderRadius: 50,
        padding: phone ? 17 : 22,
        fontSize: phone ? 20 : 25,
        color: "#aaa",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <Plus size={24} />
      Message Nova
      <ArrowUp size={25} style={{ marginLeft: "auto" }} />
    </div>
  </div>
);

export const Devices = () => {
  const frame = useCurrentFrame();
  return (
    <Set>
      <Interactive.Div
        name="Camera leaves the screen and finds both devices"
        style={{
          position: "absolute",
          left: 150,
          top: 155,
          width: 1620,
          height: 775,
          transformStyle: "preserve-3d",
          scale: interpolate(
            frame,
            [0, 105, 210, 300],
            [2.5, 1, 0.96, 0.92],
            smooth,
          ),
          rotate: `y ${interpolate(frame, [0, 110, 300], [-16, 4, 0], smooth)}deg`,
          translate: `${interpolate(frame, [0, 110], [340, 0], smooth)}px ${interpolate(frame, [0, 110], [-110, 0], smooth)}px`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 1200,
            height: 745,
            borderRadius: 28,
            border: "12px solid #262626",
            background: "#eee",
            boxShadow: "0 38px 65px #00000025",
            overflow: "hidden",
            display: "flex",
          }}
        >
          <div
            style={{
              width: 285,
              padding: 26,
              background: "#f1f1f1",
              flexShrink: 0,
              borderRight: "1px solid #ddd",
            }}
          >
            <div style={{ display: "flex", gap: 9, marginBottom: 50 }}>
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 12,
                    height: 12,
                    background: "#bbb",
                    borderRadius: 12,
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: 22, color: "#888", marginBottom: 28 }}>
              Search
            </div>
            {["Nova", "Milo", "Fern"].map((name, i) => (
              <div
                key={name}
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  fontSize: 24,
                  padding: "16px 0",
                  borderBottom: "1px solid #e2e2e2",
                }}
              >
                <Mascot kind={i} size={48} />
                {name}
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }}>
            <Chat />
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: -35,
            top: 747,
            width: 1270,
            height: 22,
            background: "linear-gradient(#ddd,#888)",
            borderRadius: "0 0 80% 80%",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 1190,
            top: 30,
            width: 383,
            height: 767,
            border: "10px solid #262626",
            borderRadius: 59,
            overflow: "hidden",
            background: "white",
            boxShadow: "20px 35px 55px #00000026",
            rotate: `y ${interpolate(frame, [65, 170], [35, -10], smooth)}deg`,
            translate: `${interpolate(frame, [65, 165], [550, 0], smooth)}px 0`,
          }}
        >
          <div
            style={{
              height: 52,
              background: "#fcfcfc",
              display: "grid",
              placeItems: "center",
            }}
          >
            <div
              style={{
                width: 112,
                height: 23,
                borderRadius: 25,
                background: "#111",
              }}
            />
          </div>
          <div style={{ height: 695 }}>
            <Chat phone />
          </div>
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="One conversation travels with you"
        style={{
          position: "absolute",
          left: interpolate(frame, [146, 208], [1030, 1350], smooth),
          top: interpolate(frame, [146, 180, 208], [680, 560, 705], smooth),
          background: "#111",
          color: "white",
          padding: "25px 35px",
          borderRadius: 60,
          display: "flex",
          alignItems: "center",
          gap: 20,
          fontSize: 30,
          scale: interpolate(frame, [134, 150, 210, 230], [0, 1, 1, 0], smooth),
        }}
      >
        <Check size={29} />
        Looks good.
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          left: 110,
          top: 70,
          fontSize: 58,
          fontWeight: 600,
          letterSpacing: "-.045em",
          opacity: interpolate(frame, [95, 135], [0, 1], clamp),
        }}
      >
        Same conversation. More freedom.
      </div>
    </Set>
  );
};
