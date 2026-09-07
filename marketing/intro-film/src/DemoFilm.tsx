import {
  AbsoluteFill,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import {
  Plus,
  Search,
  Settings,
  PanelRight,
  MoreHorizontal,
  FileText,
  ArrowUp,
} from "lucide-react";
import { Mascot } from "./components";
import { eased, linear } from "./demo/shared";
import { MeetDemo } from "./demo/01-Meet";
import { AskDemo } from "./demo/02-Ask";
import { AccessDemo } from "./demo/03-Access";
import { ConsultDemo } from "./demo/04-Consult";
import { ProposalDemo } from "./demo/05-Proposal";
import { BuildLoopDemo } from "./demo/06-BuildLoop";
import { DeliverDemo } from "./demo/07-Deliver";
import { SendDemo } from "./demo/08-Send";
import { ReuseDemo } from "./demo/09-Reuse";
import { ContinueDemo } from "./demo/10-Continue";

// One persistent application window. Scene cuts advance the same fictional task.
export const DemoFilm = () => {
  const frame = useCurrentFrame();
  const t = frame / 60;
  const teammates =
    t >= 23 ? ["Nova", "Milo", "Fern"] : t >= 6.6 ? ["Nova"] : [];
  return (
    <AbsoluteFill
      style={{
        background: "#ececec",
        fontFamily: "Inter",
        color: "#161616",
        overflow: "hidden",
      }}
    >
      <Audio src={staticFile("audio/openbot-workflow-demo.wav")} />
      <Interactive.Div
        name="What OpenBot is — above the actual walkthrough"
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          top: 72,
          textAlign: "center",
          fontSize: 50,
          fontWeight: 540,
          letterSpacing: "-.035em",
          opacity: interpolate(frame, [0, 135, 191], [1, 1, 0], linear),
        }}
      >
        OpenBot. Open-source AI teammates that do the work.
      </Interactive.Div>
      <Interactive.Div
        name="Continuous product camera"
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "960px 550px",
          scale: interpolate(
            frame,
            [
              0, 120, 300, 420, 480, 900, 960, 1740, 1800, 4020, 4080, 4440,
              4680, 4920,
            ],
            [
              0.78, 0.78, 1, 1, 1.07, 1.07, 1.08, 1.08, 1.1, 1.1, 1.05, 1.05,
              0.72, 0.72,
            ],
            eased,
          ),
          translate: `${interpolate(frame, [0, 300, 900, 960, 1740, 1800, 4020, 4080, 4440, 4680], [0, -20, -20, -15, -15, -20, -20, -15, -15, -210], eased)}px ${interpolate(frame, [0, 180, 330, 4440, 4680], [100, 100, -20, -20, -30], eased)}px`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 130,
            top: 90,
            width: 1660,
            height: 900,
            borderRadius: 24,
            border: "1px solid #ccc",
            overflow: "hidden",
            boxShadow: "0 22px 70px #0000001c",
            background: "white",
            display: "flex",
          }}
        >
          <div
            style={{
              width: 230,
              flexShrink: 0,
              background: "#f6f6f6",
              borderRight: "1px solid #e2e2e2",
              padding: "25px 18px",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 12,
                    height: 12,
                    background: "#c5c5c5",
                    borderRadius: 12,
                  }}
                />
              ))}
              <Plus size={25} style={{ marginLeft: "auto" }} />
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 600,
                letterSpacing: "-.04em",
                marginTop: 32,
              }}
            >
              OpenBot
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 20,
                color: "#999",
                padding: "17px 0",
                marginTop: 18,
              }}
            >
              <Search size={21} />
              Search
            </div>
            <div
              style={{
                fontSize: 17,
                color: "#999",
                marginTop: 26,
                marginBottom: 13,
              }}
            >
              Teammates
            </div>
            {teammates.map((name, i) => (
              <div
                key={name}
                style={{
                  padding: "15px 9px",
                  margin: "5px -5px",
                  borderRadius: 12,
                  background: i === 0 ? "#e8e8e8" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                }}
              >
                <Mascot kind={i} size={42} />
                <div style={{ fontSize: 22, fontWeight: 510 }}>
                  {name}
                  <div style={{ fontSize: 16, color: "#888", marginTop: 5 }}>
                    {i === 0
                      ? t >= 74
                        ? "Review ready"
                        : "Project teammate"
                      : i === 1
                        ? "Making the deck"
                        : "Checking costs"}
                  </div>
                </div>
              </div>
            ))}
            <div
              style={{
                position: "absolute",
                bottom: 28,
                left: 25,
                right: 25,
                display: "flex",
                gap: 13,
                alignItems: "center",
                fontSize: 21,
                color: "#777",
              }}
            >
              <Settings size={23} />
              Settings
            </div>
          </div>
          <div style={{ width: 1430, height: 900, position: "relative" }}>
            <div
              style={{
                height: 85,
                borderBottom: "1px solid #e5e5e5",
                padding: "0 34px",
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              {t >= 6.6 && <Mascot size={46} />}
              <div style={{ fontSize: 27, fontWeight: 570 }}>
                {t < 6.6 ? "New teammate" : "Nova"}
                <div
                  style={{
                    fontSize: 18,
                    color: "#888",
                    fontWeight: 400,
                    marginTop: 4,
                  }}
                >
                  {t < 7
                    ? "Your team starts here"
                    : t < 15
                      ? "Your project teammate"
                      : t < 74
                        ? "Friday client review"
                        : "Weekly client review"}
                </div>
              </div>
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  gap: 27,
                  color: "#777",
                }}
              >
                <Search size={25} />
                <PanelRight size={26} />
                <MoreHorizontal size={26} />
              </div>
            </div>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 85,
                bottom: 0,
                overflow: "hidden",
              }}
            >
              <TransitionSeries>
                <TransitionSeries.Sequence
                  name="01 Create a teammate and choose its AI"
                  durationInFrames={420}
                >
                  <MeetDemo />
                </TransitionSeries.Sequence>
                <TransitionSeries.Sequence
                  name="02 Ask for the client review"
                  durationInFrames={480}
                >
                  <AskDemo />
                </TransitionSeries.Sequence>
                <TransitionSeries.Sequence
                  name="03 Sign in and gather context"
                  durationInFrames={480}
                >
                  <AccessDemo />
                </TransitionSeries.Sequence>
                <TransitionSeries.Sequence
                  name="04 Teammates consult privately"
                  durationInFrames={360}
                >
                  <ConsultDemo />
                </TransitionSeries.Sequence>
                <TransitionSeries.Sequence
                  name="05 A missing capability becomes an approved plan"
                  durationInFrames={480}
                >
                  <ProposalDemo />
                </TransitionSeries.Sequence>
                <TransitionSeries.Sequence
                  name="06 Build test improve retest use"
                  durationInFrames={720}
                >
                  <BuildLoopDemo />
                </TransitionSeries.Sequence>
                <TransitionSeries.Sequence
                  name="07 Finish and open the work"
                  durationInFrames={600}
                >
                  <DeliverDemo />
                </TransitionSeries.Sequence>
                <TransitionSeries.Sequence
                  name="08 Review the exact email before sending"
                  durationInFrames={480}
                >
                  <SendDemo />
                </TransitionSeries.Sequence>
                <TransitionSeries.Sequence
                  name="09 Repeat the workflow with the saved tool"
                  durationInFrames={420}
                >
                  <ReuseDemo />
                </TransitionSeries.Sequence>
                <TransitionSeries.Sequence
                  name="10 The same conversation on your phone"
                  durationInFrames={480}
                >
                  <ContinueDemo />
                </TransitionSeries.Sequence>
              </TransitionSeries>
            </div>
          </div>
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="iPhone continues the very same review"
        style={{
          position: "absolute",
          left: 1390,
          top: 145,
          width: 356,
          height: 710,
          borderRadius: 49,
          border: "9px solid #202020",
          overflow: "hidden",
          background: "white",
          boxShadow: "10px 30px 55px #00000022",
          translate: `${interpolate(frame, [4440, 4690], [620, 0], eased)}px 0`,
          opacity: interpolate(frame, [4440, 4470], [0, 1], linear),
        }}
      >
        <div style={{ height: 48, display: "grid", placeItems: "center" }}>
          <div
            style={{
              background: "#111",
              width: 100,
              height: 23,
              borderRadius: 25,
            }}
          />
        </div>
        <div
          style={{
            display: "flex",
            gap: 13,
            padding: "17px 23px",
            alignItems: "center",
            borderBottom: "1px solid #eee",
          }}
        >
          <Mascot size={42} />
          <b style={{ fontSize: 24 }}>Nova</b>
        </div>
        <div style={{ padding: 25 }}>
          <div
            style={{
              fontSize: 18,
              color: "#999",
              textAlign: "center",
              marginBottom: 27,
            }}
          >
            Friday · 09:03
          </div>
          <div style={{ fontSize: 25, lineHeight: 1.35 }}>
            Your weekly client review is ready.
          </div>
          <div
            style={{
              display: "flex",
              gap: 13,
              alignItems: "center",
              background: "#f3f3f3",
              padding: 18,
              borderRadius: 15,
              marginTop: 28,
              fontSize: 21,
            }}
          >
            <FileText size={25} />
            Review pack
          </div>
          <div style={{ fontSize: 23, lineHeight: 1.4, marginTop: 25 }}>
            I reused the expense tool you approved.
          </div>
          <div
            style={{
              fontSize: 22,
              marginTop: 32,
              padding: "16px 20px",
              borderRadius: 30,
              background: "#151515",
              color: "white",
              display: "inline-block",
            }}
          >
            Review draft
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            left: 19,
            right: 19,
            bottom: 25,
            padding: 14,
            border: "1px solid #ddd",
            borderRadius: 30,
            display: "flex",
            alignItems: "center",
            fontSize: 20,
            color: "#aaa",
          }}
        >
          Message Nova
          <ArrowUp size={23} style={{ marginLeft: "auto" }} />
        </div>
      </Interactive.Div>
      <Interactive.Div
        name="Product identity stays beside the demonstration"
        style={{
          position: "absolute",
          left: 165,
          top: 858,
          opacity: interpolate(frame, [4600, 4700], [0, 1], linear),
          translate: `0 ${interpolate(frame, [4600, 4750], [45, 0], eased)}px`,
        }}
      >
        <div
          style={{ fontSize: 78, fontWeight: 620, letterSpacing: "-.045em" }}
        >
          OpenBot
        </div>
        <div style={{ fontSize: 34, color: "#777", marginTop: 14 }}>
          Your AI. A team that grows with your work.
        </div>
        <div style={{ fontSize: 23, color: "#888", marginTop: 20 }}>
          OPEN SOURCE · LOCAL FIRST
        </div>
      </Interactive.Div>
    </AbsoluteFill>
  );
};
