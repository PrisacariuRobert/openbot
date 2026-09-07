import {
  AbsoluteFill,
  Img,
  Interactive,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Check, ChevronDown } from "lucide-react";
import { Character } from "./Character";
import { Button, Camera, Field, Message, Shell, Sheet, tween } from "./UI";

export function Arrival() {
  const f = useCurrentFrame();
  const reveal = tween(f, 92, 162);
  return (
    <AbsoluteFill style={{ background: "#fafafa", fontFamily: "Inter" }}>
      <Camera zoom={tween(f, 92, 175, 1.52, 0.94)} y={tween(f, 92, 175, 40, 0)}>
        <div style={{ opacity: reveal }}>
          <Shell team={false}>
            <Message at={180}>
              Hi. I’m Nova.
              <br />
              What would you like to make happen?
            </Message>
          </Shell>
        </div>
        {f > 210 && (
          <div style={{ opacity: tween(f, 210, 232) }}>
            <Sheet
              title="Make Nova yours"
              footer={
                <Button done={f > 422}>
                  {f > 422 ? "Nova is ready" : "Create teammate"}
                </Button>
              }
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 24,
                  padding: "12px 0 20px",
                }}
              >
                <Character size={90} />
                <div style={{ fontSize: 30, fontWeight: 620 }}>
                  Nova
                  <div
                    style={{
                      fontSize: 20,
                      color: "#696969",
                      fontWeight: 400,
                      marginTop: 6,
                    }}
                  >
                    Research and planning
                  </div>
                </div>
              </div>
              <Field label="Your AI">
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <Img
                      src={staticFile("brands/openai.svg")}
                      style={{ width: 25, height: 25 }}
                    />
                    OpenAI
                  </span>
                  <ChevronDown size={22} />
                </div>
              </Field>
              <Field label="Appearance">
                <div style={{ display: "flex", gap: 18 }}>
                  {["#6757d9", "#d86889", "#299575", "#528ed1", "#687588"].map(
                    (c) => (
                      <div
                        key={c}
                        style={{
                          background: c,
                          borderRadius: "50%",
                          width: 28,
                          height: 28,
                          display: "grid",
                          placeItems: "center",
                          color: "white",
                        }}
                      >
                        {c === "#6757d9" && <Check size={17} />}
                      </div>
                    ),
                  )}
                </div>
              </Field>
              <div style={{ color: "#696969", fontSize: 19, marginTop: 23 }}>
                Your provider. Your choice.
              </div>
            </Sheet>
          </div>
        )}
      </Camera>
      {f < 164 && (
        <Interactive.Div
          name="Nova / macro-to-header match move"
          style={{
            position: "absolute",
            width: 620,
            height: 620,
            left: tween(f, 92, 162, 650, 181),
            top: tween(f, 92, 162, 130, -145),
            scale: tween(f, 92, 162, 1, 0.067),
            rotate: `${tween(f, 0, 78, -16, 0)}deg`,
            opacity: tween(f, 148, 164, 1, 0),
          }}
        >
          <Character size={620} gaze={tween(f, 35, 60, 0, 2)} />
        </Interactive.Div>
      )}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 700,
          width: "100%",
          textAlign: "center",
          fontSize: 70,
          fontWeight: 640,
          letterSpacing: -3,
          opacity: tween(f, 20, 45) * tween(f, 85, 111, 1, 0),
          translate: `0 ${tween(f, 20, 45, 30, 0)}px`,
        }}
      >
        Meet your next teammate.
      </div>
    </AbsoluteFill>
  );
}
