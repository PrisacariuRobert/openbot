import { Interactive, interpolate, useCurrentFrame } from "remotion";
import { ChevronLeft, Plus, Mic, Check } from "lucide-react";
import {
  Stage,
  Mascot,
  AppWindow,
  Bubble,
  Composer,
  FileRow,
  Reveal,
  ease,
} from "../components";

export const Reach = () => {
  const frame = useCurrentFrame();
  return (
    <Stage>
      <Interactive.Div
        name="Continuity headline"
        style={{
          position: "absolute",
          left: 130,
          top: 98,
          fontSize: 101,
          fontWeight: 600,
          letterSpacing: -5,
          opacity: interpolate(frame, [0, 20], [0, 1], ease),
        }}
      >
        Your team. Within reach.
      </Interactive.Div>
      <Interactive.Div
        name="Mac conversation"
        style={{
          position: "absolute",
          left: 130,
          top: 302,
          scale: 0.83,
          transformOrigin: "top left",
          translate: `${interpolate(frame, [0, 70], [-200, 0], ease)}px 0`,
          opacity: interpolate(frame, [0, 24], [0, 1], ease),
        }}
      >
        <AppWindow style={{ width: 1450, height: 765 }}>
          <div style={{ padding: 45 }}>
            <Bubble user style={{ marginLeft: 220 }}>
              How’s the launch looking?
            </Bubble>
            <Reveal at={52} style={{ marginTop: 50 }}>
              <Bubble>
                Everything is ready for your review.
                <br />
                I’ve kept the details together.
              </Bubble>
              <div style={{ marginTop: 18 }}>
                <FileRow title="Launch pack" detail="Updated just now" />
              </div>
            </Reveal>
          </div>
          <Composer voice />
        </AppWindow>
      </Interactive.Div>
      <Interactive.Div
        name="Phone continuation"
        style={{
          position: "absolute",
          left: 1318,
          top: 202,
          width: 423,
          height: 799,
          padding: 9,
          borderRadius: 62,
          background: "#202020",
          border: "2px solid #777",
          boxShadow: "0 22px 65px #00000013",
          translate: `0 ${interpolate(frame, [20, 80], [170, 0], ease)}px`,
          opacity: interpolate(frame, [20, 40], [0, 1], ease),
        }}
      >
        <div
          style={{
            borderRadius: 52,
            background: "#fff",
            height: "100%",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: 52,
              padding: "18px 27px",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            9:41
            <div
              style={{
                position: "absolute",
                top: 13,
                width: 105,
                height: 29,
                background: "#151515",
                left: 148,
                borderRadius: 30,
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "16px 20px",
              borderBottom: "1px solid #e8e8e8",
            }}
          >
            <ChevronLeft size={21} />
            <Mascot size={32} />
            <span style={{ fontSize: 22, fontWeight: 600 }}>Nova</span>
          </div>
          <Reveal at={100} style={{ padding: 20 }}>
            <Bubble style={{ fontSize: 19, padding: 19 }}>
              Everything is ready for your review.
            </Bubble>
            <div style={{ marginTop: 14 }}>
              <FileRow title="Launch pack" detail="Updated just now" />
            </div>
          </Reveal>
          <Reveal at={169} style={{ padding: "0 20px" }}>
            <Bubble user style={{ fontSize: 19, marginLeft: 67, padding: 19 }}>
              Looks great.
              <br />
              Let’s do it.
            </Bubble>
          </Reveal>
          <Reveal
            at={218}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              padding: "24px 25px",
              fontSize: 18,
              color: "#777",
            }}
          >
            <Check size={18} />
            I’ll take it from here.
          </Reveal>
          <div
            style={{
              position: "absolute",
              bottom: 40,
              left: 18,
              right: 18,
              height: 53,
              borderRadius: 28,
              border: "1px solid #ddd",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: 14,
              fontSize: 18,
              color: "#888",
            }}
          >
            <Plus size={21} />
            Message Nova
            <Mic size={20} style={{ marginLeft: "auto" }} />
          </div>
          <div
            style={{
              position: "absolute",
              bottom: 13,
              left: 137,
              width: 130,
              height: 5,
              borderRadius: 5,
              background: "#171717",
            }}
          />
        </div>
      </Interactive.Div>
    </Stage>
  );
};
