import { useCurrentFrame, interpolate } from "remotion";
import { LockKeyhole, Calendar, Mail, Folder, Check } from "lucide-react";
import { Brand } from "../components";
import {
  Bubble,
  Button,
  Split,
  Pointer,
  Row,
  Reveal,
  Status,
  linear,
} from "./shared";

export const AccessDemo = () => {
  const frame = useCurrentFrame();
  const signed = frame > 218;
  return (
    <Split
      title="Nova’s private browser"
      subtitle={
        signed
          ? "Client review · source material"
          : "Sign-in requested · teammate paused"
      }
      left={
        <>
          <Bubble user>Get Friday’s client review ready.</Bubble>
          <Bubble at={0.4}>
            I need you to sign in to Google first. I’ll wait here.
          </Bubble>
          <Reveal at={3.85}>
            <Status done>You continued the task.</Status>
          </Reveal>
          <Bubble at={4.5}>
            I found Friday’s meeting, the project notes and three expense
            exports.
          </Bubble>
        </>
      }
      right={
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 18,
              fontSize: 21,
              color: "#777",
              paddingBottom: 22,
              borderBottom: "1px solid #ddd",
            }}
          >
            <LockKeyhole size={21} />
            {signed
              ? "workspace.example.test/client-review"
              : "accounts.google.com"}
          </div>
          <div
            style={{
              position: "absolute",
              top: 210,
              left: 55,
              right: 55,
              opacity: signed ? 0 : 1,
              textAlign: "center",
            }}
          >
            <LockKeyhole size={55} />
            <h2
              style={{
                fontSize: 38,
                fontWeight: 580,
                letterSpacing: "-.03em",
                marginBottom: 13,
              }}
            >
              Sign in yourself.
            </h2>
            <p style={{ fontSize: 25, color: "#777", lineHeight: 1.45 }}>
              Passwords stay in the browser.
              <br />
              They don’t go into the conversation.
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                margin: "35px 0",
                gap: 15,
              }}
            >
              <Brand id="gmail" size={34} />
              <Brand id="googlecalendar" size={34} />
              <Brand id="googledrive" size={34} />
            </div>
            <Button>
              {frame > 180 ? (
                <>
                  <Check size={24} />
                  Continue task
                </>
              ) : (
                "Open sign-in"
              )}
            </Button>
          </div>
          <div
            style={{ opacity: interpolate(frame, [218, 240], [0, 1], linear) }}
          >
            <div
              style={{
                fontSize: 39,
                fontWeight: 580,
                letterSpacing: "-.03em",
                margin: "28px 0 13px",
              }}
            >
              Friday’s client review
            </div>
            <Row
              icon={<Calendar size={31} />}
              title="Client review"
              detail="Friday · 10:00 · 30 minutes"
            >
              <Check size={25} />
            </Row>
            <Row
              icon={<Mail size={31} />}
              title="Project decisions"
              detail="Recent conversation with the team"
            >
              <Check size={25} />
            </Row>
            <Row
              icon={<Folder size={31} />}
              title="Notes & expenses"
              detail="Project brief · 3 expense exports"
            >
              <Check size={25} />
            </Row>
            <div style={{ fontSize: 23, color: "#777", marginTop: 30 }}>
              3 sources checked. Nothing changed.
            </div>
          </div>
          <Pointer from={[620, 570]} to={[365, 641]} at={2.7} click={3.55} />
        </>
      }
    />
  );
};
