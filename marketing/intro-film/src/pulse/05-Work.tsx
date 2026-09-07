import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { ArrowUpRight, Check, GitPullRequest } from "lucide-react";
import { Set, smooth, clamp, Chrome } from "./shared";

const Deck = () => (
  <div
    style={{
      height: "100%",
      background: "#0c0c0c",
      color: "white",
      padding: 70,
      position: "relative",
      overflow: "hidden",
    }}
  >
    <div style={{ fontSize: 23, letterSpacing: ".12em", color: "#aaa" }}>
      FIELD NOTES / LAUNCH 01
    </div>
    <div
      style={{
        fontSize: 118,
        letterSpacing: "-.065em",
        fontWeight: 600,
        lineHeight: 1.01,
        position: "relative",
        zIndex: 2,
        marginTop: 102,
      }}
    >
      A good idea.
      <br />
      Out in the world.
    </div>
    <div
      style={{
        position: "absolute",
        width: 560,
        height: 560,
        borderRadius: "50%",
        right: -120,
        top: 80,
        background:
          "radial-gradient(circle at 27% 21%, #fff, #aaa 30%, #3a3a3a 63%, #111 80%)",
        boxShadow: "-25px 40px 50px #000",
      }}
    />
    <div
      style={{ position: "absolute", bottom: 60, fontSize: 25, color: "#aaa" }}
    >
      The story. The audience. The next move.
    </div>
  </div>
);

const Sheet = () => (
  <div
    style={{ height: "100%", background: "white", padding: 60, color: "#111" }}
  >
    <div style={{ fontSize: 28, color: "#777" }}>Launch budget.xlsx</div>
    <div
      style={{
        fontSize: 90,
        fontWeight: 610,
        letterSpacing: "-.06em",
        margin: "24px 0 48px",
      }}
    >
      Every detail. In order.
    </div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.8fr 1fr 1fr",
        fontSize: 27,
      }}
    >
      {[
        "Deliverable",
        "Budget",
        "Owner",
        "Launch film",
        "€1,200",
        "Milo",
        "Landing page",
        "€800",
        "Fern",
        "Partner materials",
        "€450",
        "Nova",
        "Total",
        "€2,450",
        "",
      ].map((cell, i) => (
        <div
          key={i}
          style={{
            padding: "21px 20px",
            borderBottom: "1px solid #ddd",
            background: i < 3 ? "#f4f4f4" : "white",
            fontWeight: i < 3 || i > 11 ? 600 : 400,
          }}
        >
          {cell}
        </div>
      ))}
    </div>
  </div>
);

const Site = () => (
  <div
    style={{
      height: "100%",
      background: "#eee",
      color: "#111",
      padding: 65,
      position: "relative",
      overflow: "hidden",
    }}
  >
    <div
      style={{ display: "flex", justifyContent: "space-between", fontSize: 25 }}
    >
      <b>Field Notes</b>
      <span>Our story · Journal · Explore ↗</span>
    </div>
    <div
      style={{
        fontSize: 130,
        lineHeight: 0.96,
        letterSpacing: "-.08em",
        fontWeight: 580,
        position: "relative",
        zIndex: 2,
        marginTop: 100,
      }}
    >
      Made for
      <br />
      what’s next.
    </div>
    <div style={{ fontSize: 23, marginTop: 40 }}>
      A small idea. A much bigger beginning.
    </div>
    <div
      style={{
        position: "absolute",
        right: 75,
        top: 220,
        width: 370,
        height: 420,
        background: "#131313",
        borderRadius: "48% 48% 18% 18%",
        rotate: "-15deg",
      }}
    />
    <ArrowUpRight
      size={96}
      strokeWidth={1}
      color="white"
      style={{ position: "absolute", right: 160, top: 360 }}
    />
  </div>
);

export const Work = () => {
  const frame = useCurrentFrame();
  const shot = Math.min(3, Math.floor(frame / 120));
  const local = frame - shot * 120;
  return (
    <Set dark={shot === 0 || shot === 3}>
      <Interactive.Div
        name="Deliverable tracking shot"
        style={{
          position: "absolute",
          left: 300,
          top: 150,
          width: 1320,
          height: 740,
          perspective: 1600,
          rotate: `${interpolate(local, [0, 35, 90, 120], [shot % 2 ? 8 : -7, 0, 0, shot % 2 ? -4 : 4], smooth)}deg`,
          scale: interpolate(
            local,
            [0, 45, 95, 120],
            [1.45, 1, 1.03, 1.15],
            smooth,
          ),
          translate: `${interpolate(local, [0, 40, 100, 120], [shot % 2 ? -350 : 350, 0, 0, shot % 2 ? 160 : -160], smooth)}px 0`,
        }}
      >
        {[2, 1].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              background: shot === 0 ? "#292929" : "#ddd",
              border: "1px solid #888",
              borderRadius: 10,
              rotate: `${i * 5}deg`,
              translate: `${i * 27}px ${i * 22}px`,
              opacity: interpolate(
                local,
                [0, 34, 87, 112],
                [0, 0.7, 0.7, 0],
                clamp,
              ),
            }}
          />
        ))}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 25px 90px #00000040",
            rotate: `y ${interpolate(local, [0, 48, 93, 120], [shot % 2 ? -24 : 24, 0, 0, shot % 2 ? 16 : -16], smooth)}deg`,
          }}
        >
          {shot === 0 ? (
            <Deck />
          ) : shot === 1 ? (
            <Sheet />
          ) : shot === 2 ? (
            <Site />
          ) : (
            <Chrome
              dark
              label="launch-site · review changes"
              style={{ width: 1320, height: 740, borderRadius: 12 }}
            >
              <div style={{ padding: 65 }}>
                <div
                  style={{
                    fontSize: 62,
                    fontWeight: 600,
                    letterSpacing: "-.05em",
                    display: "flex",
                    alignItems: "center",
                    gap: 30,
                  }}
                >
                  <GitPullRequest size={65} />
                  Built. Tested. Ready to review.
                </div>
                <div
                  style={{
                    fontFamily: "monospace",
                    fontSize: 32,
                    lineHeight: 1.9,
                    color: "#aaa",
                    marginTop: 45,
                  }}
                >
                  + Add the launch page
                  <br />+ Improve mobile layout
                  <br />+ Test the checkout flow
                </div>
                <div
                  style={{
                    borderTop: "1px solid #444",
                    paddingTop: 30,
                    marginTop: 32,
                    fontSize: 30,
                    display: "flex",
                    alignItems: "center",
                    gap: 17,
                  }}
                >
                  <Check size={31} />
                  12 checks passed{" "}
                  <span style={{ color: "#888", marginLeft: "auto" }}>
                    Review changes ↗
                  </span>
                </div>
              </div>
            </Chrome>
          )}
        </div>
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          left: 110,
          bottom: 55,
          right: 110,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 28,
          color: shot === 0 || shot === 3 ? "#bbb" : "#666",
        }}
      >
        <span>
          {
            [
              "Presentations",
              "Spreadsheets",
              "Websites",
              "Project code & tests",
            ][shot]
          }
        </span>
        <span>0{shot + 1} / 04</span>
      </div>
    </Set>
  );
};
