import { Interactive, interpolate } from "remotion";
import {
  ArrowUp,
  Folder,
  LockKeyhole,
  Monitor,
  MousePointer2,
} from "lucide-react";
import { Brand, Mascot } from "../components";
import { Shell, curve, enter, useShot } from "./shared";

export const Apps = ({ duration }: { duration: number }) => {
  const { p } = useShot(duration);
  return (
    <Shell>
      <Interactive.Div
        name="One launch request"
        style={{
          position: "absolute",
          left: 265,
          top: 290,
          width: 1390,
          translate: `0 ${interpolate(p, [0, 0.12, 0.26, 0.37], [100, 0, 0, -330], curve)}px`,
          opacity: 1 - enter(p, 0.35, 0.42),
        }}
      >
        <div style={{ fontSize: 30, color: "#777", marginBottom: 24 }}>
          MESSAGE FERN
        </div>
        <div
          style={{
            background: "#151515",
            color: "#fff",
            borderRadius: 56,
            padding: "54px 58px",
            fontSize: 69,
            letterSpacing: "-.035em",
            lineHeight: 1.2,
          }}
        >
          Help us get ready for launch.
          <br />
          Use the notes and files we have.
          <ArrowUp size={62} style={{ float: "right", marginTop: 20 }} />
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="The working browser"
        style={{
          position: "absolute",
          left: 175,
          top: 112,
          width: 1570,
          height: 850,
          background: "#fff",
          border: "2px solid #dcdcdc",
          borderRadius: 30,
          overflow: "hidden",
          scale: interpolate(p, [0.31, 0.42], [1.2, 1], curve),
          opacity: enter(p, 0.31, 0.37),
        }}
      >
        <div
          style={{
            height: 105,
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "0 36px",
            background: "#f6f6f6",
            borderBottom: "1px solid #ddd",
          }}
        >
          <Mascot size={60} kind={2} />
          <span style={{ fontSize: 28 }}>Fern’s private browser</span>
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 12,
              alignItems: "center",
              fontSize: 26,
              color: "#777",
            }}
          >
            <LockKeyhole size={25} />
            Your sign-in stays here
          </div>
        </div>
        <div style={{ display: "flex", height: 745 }}>
          <div
            style={{
              width: 400,
              borderRight: "1px solid #e8e8e8",
              padding: "42px 32px",
            }}
          >
            {[
              ["gmail", "Email"],
              ["googlecalendar", "Calendar"],
              ["googledrive", "Drive"],
              ["notion", "Notion"],
              ["slack", "Slack"],
            ].map(([id, label], i) => (
              <div
                key={id}
                style={{
                  height: 103,
                  display: "flex",
                  gap: 24,
                  alignItems: "center",
                  fontSize: 33,
                  opacity: enter(p, 0.34 + i * 0.025, 0.4 + i * 0.025),
                }}
              >
                <Brand id={id} size={37} />
                {label}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, padding: "62px 64px" }}>
            <div
              style={{
                fontSize: 55,
                fontWeight: 600,
                letterSpacing: "-.035em",
              }}
            >
              Launch notes
            </div>
            <div style={{ fontSize: 28, color: "#777", marginTop: 16 }}>
              Research, files and conversations in context.
            </div>
            {[
              "Customer feedback",
              "Product decisions",
              "Next week’s review",
            ].map((label, i) => (
              <div
                key={label}
                style={{
                  fontSize: 32,
                  padding: "35px 0",
                  borderBottom: "1px solid #e9e9e9",
                  opacity: enter(p, 0.38 + i * 0.03, 0.43 + i * 0.03),
                }}
              >
                {label}
              </div>
            ))}
            <div
              style={{
                display: "flex",
                gap: 34,
                fontSize: 28,
                color: "#777",
                marginTop: 50,
              }}
            >
              <span>
                <Monitor size={28} style={{ verticalAlign: "middle" }} /> Mac
                apps
              </span>
              <span>
                <Folder size={28} style={{ verticalAlign: "middle" }} /> Allowed
                files
              </span>
            </div>
          </div>
        </div>
        <Interactive.Div
          name="Private sign-in handoff"
          style={{
            position: "absolute",
            inset: 0,
            background: "#ffffffee",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: enter(p, 0.72, 0.79),
          }}
        >
          <div style={{ width: 980 }}>
            <LockKeyhole size={69} />
            <div
              style={{
                fontSize: 69,
                fontWeight: 600,
                letterSpacing: "-.04em",
                marginTop: 30,
              }}
            >
              A moment for you.
            </div>
            <div
              style={{
                fontSize: 37,
                color: "#777",
                lineHeight: 1.35,
                marginTop: 25,
              }}
            >
              Sign in privately.
              <br />
              Then your teammate picks up where it left off.
            </div>
            <div
              style={{
                marginTop: 45,
                display: "inline-flex",
                alignItems: "center",
                gap: 22,
                background: "#151515",
                color: "#fff",
                padding: "23px 32px",
                borderRadius: 50,
                fontSize: 33,
              }}
            >
              Open browser
              <MousePointer2 size={29} />
            </div>
          </div>
        </Interactive.Div>
      </Interactive.Div>
    </Shell>
  );
};
