import { AbsoluteFill, Interactive, useCurrentFrame } from "remotion";
import { ArrowLeft, Ellipsis } from "lucide-react";
import { Character, type Person } from "./Character";
import {
  Button,
  Camera,
  Composer,
  Field,
  File,
  Inspector,
  Message,
  Shell,
  Sheet,
  tween,
} from "./UI";

export function Continuity() {
  const f = useCurrentFrame();
  const traveling = tween(f, 155, 245);
  const outro = tween(f, 365, 425);
  return (
    <AbsoluteFill
      style={{
        background: "#fafafa",
        fontFamily: "Inter",
        color: "#191919",
        overflow: "hidden",
      }}
    >
      <div style={{ opacity: 1 - outro }}>
        <Camera
          zoom={1.03 - traveling * 0.29}
          x={-traveling * 235}
          y={traveling * 40}
          rotate={-traveling * 2}
        >
          <Shell inspector={<Inspector />}>
            <Message user>Do this every Friday at 9.</Message>
            <Message>
              The same process, ready for next week.
              <br />
              I’ll reuse the importer and ask before sending.
            </Message>
            <File
              title="Friday client review"
              meta="Fridays at 9:00 · Europe/Brussels"
            />
          </Shell>
          {f < 155 && (
            <Sheet
              title="Make it a routine"
              footer={
                <Button done={f > 111}>
                  {f > 111 ? "Routine saved" : "Create routine"}
                </Button>
              }
            >
              <Field label="What">
                Prepare the client review, budget and email.
              </Field>
              <Field label="When">Every Friday · 09:00</Field>
              <Field label="Time zone">Europe/Brussels</Field>
              <Field label="Sending">Ask me first</Field>
            </Sheet>
          )}
        </Camera>
      </div>
      {f > 170 && (
        <Interactive.Div
          name="Same conversation / iPhone handoff"
          style={{
            position: "absolute",
            left: 1320,
            top: 100,
            width: 412,
            height: 832,
            border: "9px solid #202020",
            borderRadius: 64,
            background: "white",
            boxShadow: "0 30px 70px #0002",
            overflow: "hidden",
            translate: `${tween(f, 170, 248, 520, 0)}px ${tween(f, 365, 425, 0, 110)}px`,
            rotate: `${tween(f, 170, 248, 12, 0)}deg`,
            opacity: 1 - outro,
          }}
        >
          <div
            style={{
              height: 50,
              textAlign: "left",
              paddingLeft: 27,
              paddingTop: 12,
              fontSize: 15,
              fontWeight: 600,
            }}
          >
            9:41
            <div
              style={{
                position: "absolute",
                left: 130,
                top: 10,
                borderRadius: 20,
                width: 135,
                height: 27,
                background: "#151515",
              }}
            />
          </div>
          <div
            style={{
              display: "flex",
              padding: "16px 18px",
              alignItems: "center",
              gap: 8,
              borderBottom: "1px solid #e9e9e9",
            }}
          >
            <ArrowLeft size={20} />
            <Character size={40} />
            <span style={{ fontWeight: 600, fontSize: 20 }}>Nova</span>
            <Ellipsis size={24} style={{ marginLeft: "auto" }} />
          </div>
          <div style={{ padding: "26px 22px", fontSize: 21, lineHeight: 1.5 }}>
            <div
              style={{
                fontSize: 13,
                color: "#696969",
                textAlign: "center",
                marginBottom: 27,
              }}
            >
              Next Friday, 9:12
            </div>
            <Message>
              Your next client review is ready. I reused the importer and
              checked the new receipts.
            </Message>
            <File title="Client review.pdf" meta="Updated this morning" />
            <File title="Budget.csv" meta="Ready to review" />
            <div style={{ fontSize: 18, marginTop: 28 }}>
              Your email is waiting for approval.
            </div>
          </div>
          <div
            style={{ position: "absolute", bottom: 32, left: 18, right: 18 }}
          >
            <Composer />
          </div>
        </Interactive.Div>
      )}
      {f > 360 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            opacity: outro,
          }}
        >
          <div
            style={{
              display: "flex",
              height: 205,
              alignItems: "center",
              gap: 2,
            }}
          >
            {(
              ["Orbit", "Milo", "Nova", "Fern", "Pebble", "Sunny"] as Person[]
            ).map((name, i) => (
              <div
                key={name}
                style={{
                  translate: `0 ${tween(f, 370 + i * 6, 426 + i * 6, 130, 0)}px`,
                  rotate: `${tween(f, 370 + i * 6, 440 + i * 6, (i - 2.5) * 12, 0)}deg`,
                }}
              >
                <Character name={name} size={145} />
              </div>
            ))}
          </div>
          <div
            style={{
              fontSize: 114,
              fontWeight: 650,
              letterSpacing: -6,
              lineHeight: 1.1,
            }}
          >
            OpenBot
          </div>
          <div style={{ fontSize: 37, letterSpacing: -0.9, marginTop: 24 }}>
            More than a conversation.
          </div>
          <div style={{ fontSize: 24, color: "#696969", marginTop: 42 }}>
            Your team. Your AI. Open source.
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
}
