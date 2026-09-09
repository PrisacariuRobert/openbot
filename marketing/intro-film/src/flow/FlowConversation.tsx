import type { ReactNode } from "react";
import {
  Check,
  ChevronRight,
  Code2,
  FileText,
  ShieldCheck,
  Users,
} from "lucide-react";
import { move } from "../launch/Motion";
import { Bubble } from "../launch/Product";
import { Face, row } from "./FlowWindow";
import { stateAt, type Thread } from "./timeline";

function Reveal({
  f,
  at,
  children,
}: {
  f: number;
  at: number;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        opacity: move(f, at, at + 25),
        translate: `0 ${move(f, at, at + 30, 15, 0)}px`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {children}
    </div>
  );
}
function Sender({ name, f }: { name: Thread; f: number }) {
  return (
    <div style={{ ...row, fontSize: 15, color: "#777", marginBottom: 14 }}>
      <Face name={name} frame={f} size={29} id={`flow-sender-${name}`} />
      {name} · just now
    </div>
  );
}
export function FlowConversation({ frame: f }: { frame: number }) {
  const { thread, threadAt } = stateAt(f);
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 23,
        opacity: move(f, threadAt, threadAt + 18),
        translate: `${move(f, threadAt, threadAt + 25, 24, 0)}px 0`,
      }}
    >
      {thread === "Nova" && (
        <>
          <div
            style={{
              textAlign: "center",
              fontSize: 14,
              color: "#999",
              marginBottom: 8,
            }}
          >
            Today · 9:41 AM
          </div>
          {f < 300 ? (
            <div style={{ textAlign: "center", paddingTop: 65 }}>
              <Face name="Nova" size={115} frame={f} id="nova-empty" />
              <h2 style={{ fontSize: 30, fontWeight: 550 }}>
                What are we working on?
              </h2>
              <p style={{ fontSize: 19, color: "#888" }}>
                An idea is a good place to start.
              </p>
            </div>
          ) : (
            <>
              <Bubble owner>
                Turn our launch notes into a plan we can use.
              </Bubble>
              <Reveal f={f} at={338}>
                <Sender name="Nova" f={f} />
                <Bubble>
                  I’ll read the notes, bring in Pixel for the build, and keep
                  everything together.
                </Bubble>
              </Reveal>
              <Reveal f={f} at={625}>
                <div
                  style={{
                    ...row,
                    padding: 23,
                    border: "1px solid #e7e7e7",
                    borderRadius: 16,
                    fontSize: 20,
                  }}
                >
                  <FileText size={27} />
                  <span>
                    Launch notes
                    <small
                      style={{
                        display: "block",
                        fontSize: 15,
                        color: "#888",
                        marginTop: 5,
                      }}
                    >
                      Read in Nova’s browser
                    </small>
                  </span>
                  <Check size={21} style={{ marginLeft: "auto" }} />
                </div>
              </Reveal>
            </>
          )}
        </>
      )}
      {thread === "The studio" && (
        <>
          <div
            style={{
              textAlign: "center",
              fontSize: 14,
              color: "#999",
              marginBottom: 8,
            }}
          >
            A launch, coming together.
          </div>
          {f < 770 ? (
            <div style={{ margin: "80px auto", textAlign: "center" }}>
              <Face name="The studio" size={160} frame={f} id="studio-empty" />
              <h2 style={{ fontSize: 30, fontWeight: 550 }}>
                A little more possible.
              </h2>
            </div>
          ) : (
            <>
              <Sender name="Nova" f={f} />
              <Bubble>
                Research is ready. Pixel is checking the project. Scout will
                keep track of what comes next.
              </Bubble>
              <div style={{ display: "flex", gap: 15, margin: "13px 0" }}>
                {(["Nova", "Pixel", "Scout"] as Thread[]).map((n, i) => (
                  <Reveal f={f} at={780 + i * 25} key={n}>
                    <div
                      style={{
                        ...row,
                        padding: "18px 21px",
                        background: "#f6f6f6",
                        borderRadius: 16,
                      }}
                    >
                      <Face name={n} size={46} frame={f} id={`handoff-${n}`} />
                      <div style={{ fontSize: 17, fontWeight: 550 }}>
                        {n}
                        <small
                          style={{
                            display: "block",
                            fontSize: 14,
                            color: "#888",
                            fontWeight: 400,
                            marginTop: 6,
                          }}
                        >
                          {
                            [
                              "Notes reviewed",
                              "Project checked",
                              "Next steps linked",
                            ][i]
                          }
                        </small>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
              <div style={{ ...row, color: "#777", fontSize: 18 }}>
                <Users size={20} />
                Three teammates. One shared conversation.
              </div>
            </>
          )}
        </>
      )}
      {thread === "Pixel" && (
        <>
          <div style={{ textAlign: "center", fontSize: 14, color: "#999" }}>
            From your studio
          </div>
          <Bubble owner>Make a reusable launch checklist from the plan.</Bubble>
          <div>
            <Sender name="Pixel" f={f} />
            <Bubble>
              {f < 1380
                ? "I can build the missing tool. One file in my workspace, after you review the plan."
                : "Your checklist is ready. I created the tool, ran it, and checked the result."}
            </Bubble>
          </div>
          {f < 1380 ? (
            <div
              style={{
                border: "1px solid #ddd",
                borderRadius: 17,
                padding: 22,
                width: 540,
              }}
            >
              <div style={{ ...row, fontSize: 19, fontWeight: 550 }}>
                <ShieldCheck size={23} />A small tool. A clear boundary.
              </div>
              <div
                style={{
                  ...row,
                  justifyContent: "space-between",
                  marginTop: 19,
                  fontSize: 17,
                }}
              >
                <span style={{ color: "#888" }}>launch-checklist.ts</span>
                <span
                  style={{
                    background: "#222",
                    color: "white",
                    borderRadius: 25,
                    padding: "10px 18px",
                  }}
                >
                  Review plan{" "}
                  <ChevronRight size={15} style={{ verticalAlign: "middle" }} />
                </span>
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  border: "1px solid #e2e2e2",
                  borderRadius: 17,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    ...row,
                    height: 85,
                    padding: "0 24px",
                    fontSize: 21,
                  }}
                >
                  <FileText size={30} />
                  <div>
                    Launch checklist.md
                    <small
                      style={{
                        display: "block",
                        fontSize: 14,
                        color: "#888",
                        marginTop: 5,
                      }}
                    >
                      Open preview · 6 KB
                    </small>
                  </div>
                  <ChevronRight size={22} style={{ marginLeft: "auto" }} />
                </div>
                <div
                  style={{
                    ...row,
                    height: 51,
                    padding: "0 24px",
                    borderTop: "1px solid #eee",
                    fontSize: 16,
                    color: "#777",
                  }}
                >
                  <Code2 size={19} />
                  launch-checklist.ts
                  <Check size={18} style={{ marginLeft: "auto" }} />
                  Tested in the workspace
                </div>
              </div>
              <div style={{ ...row, fontSize: 17, color: "#777" }}>
                <Check size={20} />
                One checked result, ready for your review.
              </div>
            </>
          )}
        </>
      )}
      {thread === "Iris" && (
        <>
          <div style={{ textAlign: "center", paddingTop: 8 }}>
            <Face name="Iris" frame={f} size={115} id="new-iris" />
            <h2 style={{ fontSize: 29, fontWeight: 550, margin: "14px 0 8px" }}>
              Meet Iris.
            </h2>
            <p style={{ fontSize: 18, color: "#888", margin: 0 }}>
              Your launch teammate. Made by you.
            </p>
          </div>
          {f >= 3220 && (
            <Reveal f={f} at={3220}>
              <Bubble owner>
                Iris, help us make the next launch even better.
              </Bubble>
            </Reveal>
          )}
          {f >= 3260 && (
            <Reveal f={f} at={3260}>
              <Bubble>Let’s make it happen.</Bubble>
            </Reveal>
          )}
        </>
      )}
    </div>
  );
}
