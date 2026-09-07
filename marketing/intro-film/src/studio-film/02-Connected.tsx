import { useCurrentFrame } from "remotion";
import { Check, LockKeyhole, Mail, CalendarDays, Folder } from "lucide-react";
import {
  Button,
  Camera,
  Field,
  Message,
  Reveal,
  Shell,
  Sheet,
  tween,
  WorkLine,
} from "./UI";

export function Connected() {
  const f = useCurrentFrame();
  const prompt =
    "Prepare Friday’s client review. Update the deck and budget. Draft the email.";
  const typed = prompt.slice(0, Math.floor(tween(f, 0, 82, 0, prompt.length)));
  return (
    <Camera
      zoom={
        1.65 -
        tween(f, 90, 138, 0, 0.2) -
        tween(f, 329, 375, 0, 0.27) +
        tween(f, 495, 548, 0, 0.27)
      }
      x={-200 + tween(f, 329, 375, 0, 200) - tween(f, 495, 548, 0, 200)}
      y={
        -600 +
        tween(f, 90, 138, 0, 640) -
        tween(f, 329, 375, 0, 40) +
        tween(f, 495, 548, 0, 40)
      }
    >
      <Shell team={false} active={f > 105} draft={f < 105 ? typed : ""}>
        {f >= 105 && (
          <Message user at={105}>
            {prompt}
          </Message>
        )}
        <Message at={165}>
          I’ll gather the context, check the numbers and bring everything back
          here for your review.
        </Message>
        {f < 505 && (
          <Reveal at={238}>
            <WorkLine>Needs your sign-in</WorkLine>
            <div
              style={{
                borderLeft: "2px solid #ddd",
                paddingLeft: 20,
                marginBottom: 20,
              }}
            >
              Sign in to Google in my private browser.
              <br />
              <span style={{ fontSize: 19, color: "#696969" }}>
                Passwords stay out of our conversation.
              </span>
            </div>
            <Button>Open browser</Button>
          </Reveal>
        )}
        {f > 505 && (
          <Message at={505}>
            You’re connected. I can now use this session.
          </Message>
        )}
        {f > 565 && (
          <Reveal at={565}>
            <div
              style={{
                display: "flex",
                gap: 28,
                borderTop: "1px solid #e9e9e9",
                paddingTop: 18,
              }}
            >
              {[
                [Mail, "Email"],
                [CalendarDays, "Calendar"],
                [Folder, "Project files"],
              ].map(([Icon, title]) => {
                const I = Icon as typeof Mail;
                return (
                  <div
                    key={String(title)}
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      fontSize: 19,
                    }}
                  >
                    <I size={21} />
                    {String(title)}
                    <Check size={16} />
                  </div>
                );
              })}
            </div>
          </Reveal>
        )}
      </Shell>
      {f > 340 && f < 502 && (
        <div style={{ opacity: tween(f, 340, 365) * tween(f, 484, 502, 1, 0) }}>
          <Sheet
            title="Nova’s computer"
            footer={
              <Button done={f > 463}>
                {f > 463 ? "Continue task" : "I’ve signed in"}
              </Button>
            }
          >
            <div
              style={{
                height: 280,
                background: "#fafafa",
                border: "1px solid #e9e9e9",
                borderRadius: 12,
                padding: 30,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: "#696969",
                  fontSize: 18,
                }}
              >
                <LockKeyhole size={18} />
                accounts.google.com
              </div>
              <div style={{ marginTop: 52, fontSize: 30, fontWeight: 570 }}>
                Your browser session.
              </div>
              <div style={{ fontSize: 22, marginTop: 12, color: "#696969" }}>
                Signed in as alex@example.test
              </div>
            </div>
            <Field label="Privacy">
              Only Nova’s private browser keeps this sign-in.
            </Field>
          </Sheet>
        </div>
      )}
    </Camera>
  );
}
