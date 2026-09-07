import { Interactive } from "remotion";
import { Check, Laptop } from "lucide-react";
import { Brand } from "../components";
import { Character, move, reveal, useTime, World } from "./shared";

export const YoursStory = () => {
  const t = useTime();
  const choice = move(t, 1.1, 1.55);
  return (
    <World dark>
      <Interactive.Div
        name="AI choice without replacing the teammate"
        style={{
          position: "absolute",
          inset: 0,
          opacity: 1 - move(t, 2.8, 3.25),
          translate: `0 ${move(t, 2.8, 3.5, 0, -260)}px`,
        }}
      >
        <div style={{ position: "absolute", left: 170, top: 248 }}>
          <div
            style={{
              fontSize: 122,
              lineHeight: 1.02,
              letterSpacing: "-0.045em",
              fontWeight: 590,
            }}
          >
            Your teammate.
            <br />
            <span style={{ color: "#888" }}>Your choice of AI.</span>
          </div>
          <div style={{ marginTop: 41, fontSize: 29, color: "#aaa" }}>
            Subscriptions. API keys. Local models.
          </div>
        </div>
        <div style={{ position: "absolute", left: 1315, top: 113 }}>
          <Character size={210} />
        </div>
        <div style={{ position: "absolute", left: 1200, top: 365, width: 535 }}>
          <div
            style={{
              position: "absolute",
              top: choice * 121,
              left: 0,
              width: 535,
              height: 108,
              background: "white",
              borderRadius: 22,
            }}
          />
          {["OpenAI", "Claude", "Local model"].map((n, i) => (
            <div
              key={n}
              style={{
                position: "relative",
                height: 121,
                display: "flex",
                alignItems: "center",
                gap: 26,
                padding: "0 28px",
                color: (choice < 0.5 ? i === 0 : i === 1) ? "#111" : "#eee",
                fontSize: 37,
              }}
            >
              {i === 2 ? (
                <Laptop size={42} />
              ) : (
                <Brand
                  id={i === 0 ? "openai" : "claude"}
                  size={44}
                  dark={!(choice < 0.5 ? i === 0 : i === 1)}
                />
              )}
              {n}
              {(choice < 0.5 ? i === 0 : i === 1) && (
                <Check size={28} style={{ marginLeft: "auto" }} />
              )}
            </div>
          ))}
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="Source brackets open the platform"
        style={{
          position: "absolute",
          inset: 0,
          opacity: reveal(t, 3.05, 3.4) * (1 - move(t, 5.3, 5.8)),
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 193,
            left: move(t, 3.2, 4.1, 680, 108),
            fontSize: 350,
            lineHeight: 1,
            fontWeight: 220,
            color: "#535353",
          }}
        >
          {"{"}
        </div>
        <div
          style={{
            position: "absolute",
            top: 193,
            right: move(t, 3.2, 4.1, 680, 108),
            fontSize: 350,
            lineHeight: 1,
            fontWeight: 220,
            color: "#535353",
          }}
        >
          {"}"}
        </div>
        <div
          style={{
            position: "absolute",
            left: 275,
            right: 275,
            top: 308,
            textAlign: "center",
            opacity: reveal(t, 3.55, 4.1),
          }}
        >
          <div
            style={{
              fontSize: 140,
              fontWeight: 590,
              letterSpacing: "-0.045em",
            }}
          >
            Open by design.
          </div>
          <div style={{ marginTop: 45, fontSize: 39, color: "#aaa" }}>
            Skills. Memory. Voice. MCP. Your ideas.
          </div>
          <div style={{ marginTop: 70, fontSize: 26, color: "#888" }}>
            Local-first. Built to make your own.
          </div>
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="OpenBot final signature"
        style={{
          position: "absolute",
          inset: 0,
          background: "#fdfdfd",
          color: "#111",
          clipPath: `inset(${move(t, 5.45, 6.15, 100, 0)}% 0 0 0)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 674,
            top: 142,
            display: "flex",
            gap: 5,
          }}
        >
          {[0, 1, 2].map((kind) => (
            <div
              key={kind}
              style={{
                translate: `0 ${reveal(t, 5.8 + kind * 0.07, 6.65 + kind * 0.07, 85, 0)}px`,
                rotate: `${Math.sin(reveal(t, 5.8 + kind * 0.07, 6.65 + kind * 0.07) * Math.PI) * (kind - 1) * 13}deg`,
              }}
            >
              <Character kind={kind} size={188} />
            </div>
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 361,
            textAlign: "center",
            fontSize: 198,
            fontWeight: 630,
            letterSpacing: "-0.05em",
            opacity: reveal(t, 6.12, 6.55),
            translate: `0 ${reveal(t, 6.12, 6.75, 35, 0)}px`,
          }}
        >
          OpenBot
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 623,
            textAlign: "center",
            fontSize: 57,
            fontWeight: 470,
            letterSpacing: "-0.035em",
            opacity: reveal(t, 6.5, 7.03),
          }}
        >
          A little team. A lot more possible.
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 747,
            textAlign: "center",
            color: "#737373",
            fontSize: 31,
            opacity: reveal(t, 6.9, 7.35),
          }}
        >
          Open source. Yours to build on.
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 897,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 14,
            fontSize: 25,
            color: "#777",
            opacity: reveal(t, 7.1, 7.6),
          }}
        >
          <Brand id="github" size={25} /> github.com/PrisacariuRobert/openbot
        </div>
      </Interactive.Div>
    </World>
  );
};
