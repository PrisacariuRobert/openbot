import { Interactive } from "remotion";
import {
  ArrowUpRight,
  Check,
  Code2,
  FileText,
  Presentation,
} from "lucide-react";
import { Character, move, reveal, useTime, World } from "./shared";

export const LaunchDeck = () => (
  <div
    style={{
      height: "100%",
      background: "#101010",
      color: "white",
      padding: "62px 68px",
      overflow: "hidden",
      position: "relative",
    }}
  >
    <div style={{ fontSize: 22, letterSpacing: "0.12em", color: "#ababab" }}>
      FIELD NOTES / LAUNCH 01
    </div>
    <div
      style={{
        position: "absolute",
        left: 67,
        top: 225,
        zIndex: 2,
        fontSize: 117,
        fontWeight: 580,
        lineHeight: 1.04,
        letterSpacing: "-0.045em",
      }}
    >
      A good idea.
      <br />
      Out in the world.
    </div>
    <div
      style={{
        position: "absolute",
        left: 70,
        bottom: 64,
        fontSize: 30,
        color: "#aaa",
      }}
    >
      The story. The audience. The next move.
    </div>
    <div
      style={{
        position: "absolute",
        width: 640,
        height: 640,
        right: -210,
        top: 35,
        border: "1px solid #555",
        borderRadius: "50%",
        background:
          "radial-gradient(circle at 32% 25%, #f6f6f6, #a3a3a3 35%, #272727 70%, #101010)",
        boxShadow: "-24px 30px 70px #00000060",
      }}
    />
    <div
      style={{
        position: "absolute",
        right: 74,
        bottom: 60,
        border: "1px solid #555",
        borderRadius: 50,
        padding: "14px 22px",
        fontSize: 23,
      }}
    >
      01 — Strategy
    </div>
  </div>
);

export const LaunchSite = () => (
  <div
    style={{
      height: "100%",
      background: "#f7f7f5",
      color: "#111",
      overflow: "hidden",
    }}
  >
    <div
      style={{
        height: 70,
        padding: "0 26px",
        display: "flex",
        alignItems: "center",
        background: "white",
        borderBottom: "1px solid #ddd",
        gap: 10,
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 12,
            height: 12,
            background: "#ddd",
            borderRadius: 10,
          }}
        />
      ))}
      <div
        style={{
          background: "#f5f5f5",
          margin: "0 auto",
          width: 530,
          padding: "8px 20px",
          borderRadius: 10,
          color: "#777",
          fontSize: 20,
          textAlign: "center",
        }}
      >
        Local preview · launch-page
      </div>
    </div>
    <div
      style={{
        padding: "34px 65px",
        display: "flex",
        alignItems: "center",
        fontSize: 25,
        fontWeight: 600,
      }}
    >
      <span>Field Notes</span>
      <span style={{ marginLeft: "auto", fontSize: 20, fontWeight: 450 }}>
        The idea &nbsp;&nbsp;&nbsp;&nbsp; The story &nbsp;&nbsp;&nbsp;&nbsp;
        Join us ↗
      </span>
    </div>
    <div
      style={{
        margin: "87px 68px 0",
        fontSize: 100,
        lineHeight: 1.02,
        letterSpacing: "-0.045em",
        fontWeight: 550,
      }}
    >
      Small beginnings.
      <br />
      Bigger possibilities.
    </div>
    <div
      style={{
        margin: "30px 72px",
        width: 580,
        fontSize: 29,
        lineHeight: 1.4,
        color: "#686868",
      }}
    >
      A place for your next good idea.
      <br />
      Made to be shared.
    </div>
    <div
      style={{
        marginLeft: 72,
        display: "inline-flex",
        alignItems: "center",
        gap: 22,
        background: "#111",
        color: "white",
        padding: "19px 29px",
        borderRadius: 40,
        fontSize: 27,
      }}
    >
      Explore the idea <ArrowUpRight size={27} />
    </div>
    <div
      style={{
        position: "absolute",
        right: 55,
        bottom: 76,
        width: 390,
        height: 390,
        transform: "rotate(-9deg)",
        background: "linear-gradient(135deg, #fff, #dededb)",
        border: "1px solid #d3d3d0",
        borderRadius: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 32px 55px #0000000c",
      }}
    >
      <Character kind={1} size={265} />
    </div>
  </div>
);

export const LaunchPlan = () => (
  <div
    style={{
      height: "100%",
      background: "white",
      padding: "65px 75px",
      color: "#111",
    }}
  >
    <div
      style={{
        display: "flex",
        gap: 15,
        alignItems: "center",
        color: "#888",
        fontSize: 24,
      }}
    >
      <FileText size={26} /> Launch plan.md
    </div>
    <div
      style={{
        fontSize: 106,
        letterSpacing: "-0.04em",
        fontWeight: 620,
        marginTop: 56,
      }}
    >
      Ready for Monday.
    </div>
    <div style={{ fontSize: 30, marginTop: 20, color: "#777" }}>
      The right work. In the right order.
    </div>
    {[
      "Review the launch story",
      "Test the website",
      "Share the final pack",
    ].map((label, i) => (
      <div
        key={label}
        style={{
          marginTop: i ? 0 : 52,
          borderBottom: "1px solid #e4e4e4",
          padding: "29px 0",
          display: "flex",
          alignItems: "center",
          gap: 24,
          fontSize: 34,
        }}
      >
        <span style={{ width: 45, color: "#aaa", fontSize: 25 }}>0{i + 1}</span>
        <span style={{ flex: 1 }}>{label}</span>
        <span style={{ color: "#888", fontSize: 24 }}>
          {["Nova", "Milo", "You"][i]}
        </span>
        <Check size={26} />
      </div>
    ))}
    <div style={{ marginTop: 38, fontSize: 24, color: "#777" }}>
      Sources linked. Owners clear. Your approval comes next.
    </div>
  </div>
);

export const ResultsStory = () => {
  const t = useTime();
  const x =
    move(t, 2.1, 2.82, 0, 1600) +
    move(t, 4.12, 4.84, 0, 1600) -
    move(t, 6.3, 7.35, 0, 1600);
  const scale = move(t, 6.3, 7.4, 1, 0.345);
  const speedBlur =
    (Math.sin(move(t, 2.1, 2.82) * Math.PI) +
      Math.sin(move(t, 4.12, 4.84) * Math.PI)) *
    4;
  return (
    <World>
      <Interactive.Div
        name="Track through tangible work"
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "960px 540px",
          transform: `translateX(${-x * scale}px) scale(${scale})`,
          filter: `blur(${speedBlur}px)`,
        }}
      >
        {[
          <LaunchDeck key="deck" />,
          <LaunchSite key="site" />,
          <LaunchPlan key="plan" />,
        ].map((content, i) => (
          <Interactive.Div
            name={
              ["The launch deck", "The website project", "The delivery plan"][i]
            }
            key={i}
            style={{
              position: "absolute",
              left: 220 + i * 1600,
              top: 180,
              width: 1480,
              height: 830,
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid #d9d9d9",
              boxShadow: "0 20px 50px #00000010",
            }}
          >
            {content}
          </Interactive.Div>
        ))}
      </Interactive.Div>
      <Interactive.Div
        name="Result names"
        style={{
          position: "absolute",
          left: 223,
          top: 106,
          fontSize: 26,
          display: "flex",
          gap: 14,
          alignItems: "center",
          opacity: 1 - move(t, 6.3, 6.8),
        }}
      >
        {t < 2.45 ? (
          <Presentation size={28} />
        ) : t < 4.47 ? (
          <Code2 size={29} />
        ) : (
          <FileText size={27} />
        )}
        {t < 2.45
          ? "A deck you can present."
          : t < 4.47
            ? "A project you can build on."
            : "A plan you can put to work."}
      </Interactive.Div>
      <Interactive.Div
        name="Deliverable statement"
        style={{
          position: "absolute",
          top: 148,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 104,
          fontWeight: 620,
          letterSpacing: "-0.045em",
          opacity: reveal(t, 6.7, 7.4),
          translate: `0 ${reveal(t, 6.7, 7.45, 45, 0)}px`,
        }}
      >
        Not just an answer.
      </Interactive.Div>
      <Interactive.Div
        name="Work you can use"
        style={{
          position: "absolute",
          top: 305,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 53,
          fontWeight: 460,
          color: "#747474",
          opacity: reveal(t, 7.05, 7.65),
        }}
      >
        Work you can use.
      </Interactive.Div>
      <Interactive.Div
        name="Assembled pack"
        style={{
          position: "absolute",
          top: 850,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 31,
          opacity: reveal(t, 7.5, 8),
          color: "#666",
        }}
      >
        One launch pack. Ready for your review.
      </Interactive.Div>
      <Interactive.Div
        name="Paper carries the cut"
        style={{
          position: "absolute",
          inset: 0,
          background: "#fdfdfd",
          translate: `${move(t, 8.55, 9, 1920, 0)}px 0`,
        }}
      />
    </World>
  );
};
