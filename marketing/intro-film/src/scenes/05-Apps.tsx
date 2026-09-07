import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { LockKeyhole, Search, Globe, Check } from "lucide-react";
import { Stage, Brand, Mascot, Pill, Reveal, ease } from "../components";

export const Apps = () => {
  const frame = useCurrentFrame();
  const signedIn = frame >= 146;
  return (
    <Stage>
      <Interactive.Div
        name="Connected work headline"
        style={{
          position: "absolute",
          top: 88,
          width: 1920,
          textAlign: "center",
          fontSize: 100,
          fontWeight: 600,
          letterSpacing: -5,
          opacity: interpolate(frame, [0, 20], [0, 1], ease),
        }}
      >
        Works where you work.
      </Interactive.Div>
      <Interactive.Div
        name="Private browser"
        style={{
          position: "absolute",
          left: 174,
          top: 308,
          width: 970,
          height: 583,
          border: "1px solid #dedede",
          borderRadius: 24,
          overflow: "hidden",
          translate: `0 ${interpolate(frame, [15, 65], [140, 0], ease)}px`,
          opacity: interpolate(frame, [15, 36], [0, 1], ease),
        }}
      >
        <div
          style={{
            height: 67,
            borderBottom: "1px solid #e7e7e7",
            padding: "0 27px",
            display: "flex",
            alignItems: "center",
            gap: 17,
            color: "#777",
            fontSize: 19,
          }}
        >
          <Globe size={22} />
          <span>Nova’s private browser</span>
          <LockKeyhole size={20} style={{ marginLeft: "auto" }} />
        </div>
        {!signedIn ? (
          <div
            style={{
              height: 516,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexDirection: "column",
              gap: 26,
            }}
          >
            <Mascot size={120} />
            <div style={{ fontSize: 35, fontWeight: 600 }}>
              A quick hand with sign-in?
            </div>
            <div style={{ fontSize: 24, color: "#777" }}>
              You sign in. Your teammate waits.
            </div>
            <Pill primary>Open private browser</Pill>
          </div>
        ) : (
          <div
            style={{
              padding: 35,
              opacity: interpolate(frame, [146, 168], [0, 1], ease),
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                fontSize: 29,
                fontWeight: 600,
              }}
            >
              <Brand id="gmail" size={34} />
              Inbox
              <Search size={23} style={{ marginLeft: "auto" }} />
            </div>
            {[
              "Launch assets are ready",
              "Design review · final notes",
              "The next steps for our team",
            ].map((text, i) => (
              <div
                key={text}
                style={{
                  padding: "27px 0",
                  borderBottom: "1px solid #eee",
                  fontSize: 22,
                  display: "flex",
                  gap: 18,
                }}
              >
                <div
                  style={{
                    width: 35,
                    height: 35,
                    background: "#f0f0f0",
                    borderRadius: 30,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 15,
                  }}
                >
                  {["AL", "JT", "SR"][i]}
                </div>
                <div>
                  {text}
                  <div style={{ fontSize: 16, color: "#888", marginTop: 7 }}>
                    Sample launch workspace
                  </div>
                </div>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: 30,
                fontSize: 20,
              }}
            >
              <Check size={20} />
              Signed in. Ready to continue.
            </div>
          </div>
        )}
      </Interactive.Div>
      <Reveal
        at={50}
        name="Everyday apps"
        style={{ position: "absolute", left: 1245, top: 330, width: 500 }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 115px)",
            gap: 33,
            marginBottom: 64,
          }}
        >
          {[
            "gmail",
            "googlecalendar",
            "googledrive",
            "slack",
            "notion",
            "github",
          ].map((id, i) => (
            <div
              key={id}
              style={{
                height: 115,
                borderRadius: 26,
                border: "1px solid #e6e6e6",
                display: "grid",
                placeItems: "center",
                translate: `0 ${Math.sin(frame / 42 + i) * 5}px`,
              }}
            >
              <Brand id={id} size={46} />
            </div>
          ))}
        </div>
        <div
          style={{
            fontSize: 35,
            fontWeight: 550,
            lineHeight: 1.3,
            letterSpacing: -1,
          }}
        >
          Your apps.
          <br />
          Your signed-in sessions.
        </div>
        <div
          style={{
            fontSize: 24,
            color: "#777",
            marginTop: 22,
            lineHeight: 1.45,
          }}
        >
          Browser work, connected tools
          <br />
          and Mac-app access.
        </div>
      </Reveal>
    </Stage>
  );
};
