import type { CSSProperties, ReactNode } from "react";
import { Img, staticFile } from "remotion";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Code2,
  FileText,
  Globe,
  Layers3,
  LockKeyhole,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { Mascot, type MascotShape } from "../launch/Product";
import { move } from "../launch/Motion";
import { Face, row } from "./FlowWindow";
import { happened, stateAt, typed, type Panel } from "./timeline";

const muted = "#858585";
const at = (top: number, extra: CSSProperties = {}): CSSProperties => ({
  position: "absolute",
  left: 36,
  right: 36,
  top,
  ...extra,
});
const titles: Record<Panel, string> = {
  browser: "Nova’s computer",
  approval: "Review plan",
  file: "Launch checklist.md",
  workspace: "Workspace",
  routines: "Routines",
  newRoutine: "Make it a routine",
  settings: "Settings",
  ai: "Your AI",
  create: "New teammate",
};
function Field({
  top,
  label,
  children,
}: {
  top: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <div style={at(top)}>
      <div style={{ fontSize: 15, fontWeight: 550, marginBottom: 12 }}>
        {label}
      </div>
      <div
        style={{
          ...row,
          height: 52,
          padding: "0 16px",
          border: "1px solid #dedede",
          borderRadius: 12,
          fontSize: 19,
        }}
      >
        {children}
      </div>
    </div>
  );
}
function Footer({
  children,
  done = false,
}: {
  children: ReactNode;
  done?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 67,
        left: 36,
        right: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: "1px solid #eee",
        paddingTop: 20,
      }}
    >
      <span style={{ fontSize: 14, color: muted }}>
        {done ? "Saved in your studio" : "You’re in control"}
      </span>
      <span
        style={{
          ...row,
          justifyContent: "center",
          height: 46,
          minWidth: 166,
          borderRadius: 25,
          background: done ? "#f0f0f0" : "#202020",
          color: done ? "#222" : "white",
          fontSize: 17,
          padding: "0 20px",
        }}
      >
        {done && <Check size={18} />} {children}
      </span>
    </div>
  );
}
function NavRow({
  top,
  icon,
  children,
  detail,
}: {
  top: number;
  icon: ReactNode;
  children: ReactNode;
  detail?: string;
}) {
  return (
    <div
      style={{
        ...at(top),
        ...row,
        height: 78,
        borderBottom: "1px solid #eee",
        fontSize: 20,
      }}
    >
      {icon}
      <span>
        {children}
        {detail && (
          <small
            style={{
              display: "block",
              fontSize: 14,
              color: muted,
              marginTop: 6,
            }}
          >
            {detail}
          </small>
        )}
      </span>
      <ChevronRight size={18} style={{ marginLeft: "auto", color: muted }} />
    </div>
  );
}
function Browser({ f }: { f: number }) {
  const notes = happened(f, "openNotes");
  return (
    <>
      <div
        style={{
          ...at(80),
          height: 570,
          border: "1px solid #e1e1e1",
          borderRadius: 13,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            ...row,
            height: 48,
            padding: "0 12px",
            background: "#f5f5f5",
            gap: 8,
            fontSize: 14,
          }}
        >
          {["Overview", "Launch notes"].map((text, i) => (
            <span
              key={text}
              style={{
                ...row,
                justifyContent: "center",
                flex: 1,
                height: 36,
                borderRadius: 8,
                background: notes === Boolean(i) ? "white" : undefined,
                boxShadow:
                  notes === Boolean(i) ? "0 1px 4px #0000000a" : undefined,
              }}
            >
              <Globe size={15} />
              {text}
              <X size={12} />
            </span>
          ))}
        </div>
        <div
          style={{
            ...row,
            height: 49,
            padding: "0 15px",
            borderBottom: "1px solid #eee",
            fontSize: 13,
            color: muted,
          }}
        >
          <ArrowLeft size={15} />
          <ArrowRight size={15} />
          <span
            style={{
              ...row,
              justifyContent: "center",
              flex: 1,
              height: 29,
              borderRadius: 6,
              background: "#f6f6f6",
            }}
          >
            <LockKeyhole size={12} />
            workspace.example / {notes ? "launch-notes" : "overview"}
          </span>
        </div>
        <div
          style={{
            padding: "28px 26px",
            opacity: notes ? move(f, 570, 590) : 1,
            translate: `0 ${notes ? move(f, 570, 601, 12, 0) : 0}px`,
          }}
        >
          <div
            style={{
              ...row,
              fontSize: 12,
              color: muted,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 31,
            }}
          >
            <Layers3 size={17} />
            Northstar / Product
          </div>
          <h2
            style={{
              fontSize: 32,
              letterSpacing: "-.04em",
              lineHeight: 1.16,
              fontWeight: 580,
              margin: "0 0 14px",
            }}
          >
            {notes ? "A better launch." : "One place for the work."}
          </h2>
          <p
            style={{
              fontSize: 17,
              lineHeight: 1.55,
              color: muted,
              margin: "0 0 28px",
            }}
          >
            {notes
              ? "What we learned. What we’ll build next."
              : "Research, decisions and the next big idea."}
          </p>
          {(notes
            ? [
                "Keep setup simple",
                "Make every action clear",
                "Give the team a checklist",
              ]
            : ["Launch notes", "Project milestones", "Customer research"]
          ).map((t, i) => (
            <div
              key={t}
              style={{
                ...row,
                padding: "18px 0",
                borderTop: "1px solid #eee",
                fontSize: 18,
                opacity: notes ? move(f, 575 + i * 20, 599 + i * 20) : 1,
              }}
            >
              <span style={{ fontSize: 13, color: muted }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {t}
            </div>
          ))}
        </div>
      </div>
      <div style={{ ...at(674), ...row, fontSize: 16, color: muted }}>
        {notes ? <Check size={19} /> : <Search size={19} />}{" "}
        {notes
          ? "Notes read. Ready to bring back to the team."
          : "Your teammate’s private browser."}
      </div>
    </>
  );
}
function Approval({ f }: { f: number }) {
  const approved = happened(f, "approveTool");
  return (
    <>
      <div style={{ ...at(89), ...row, fontSize: 15, color: muted }}>
        <ShieldCheck size={20} />
        Your approval
      </div>
      <h2
        style={{
          ...at(132),
          fontSize: 32,
          fontWeight: 580,
          letterSpacing: "-.04em",
          lineHeight: 1.15,
          margin: 0,
        }}
      >
        A small tool.
        <br />A clear boundary.
      </h2>
      <p
        style={{
          ...at(222),
          fontSize: 19,
          color: muted,
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        Turn the launch plan into a reusable checklist.
      </p>
      <NavRow
        top={302}
        icon={<Code2 size={25} />}
        detail="One new tool file in Pixel’s workspace"
      >
        launch-checklist.ts
      </NavRow>
      <div style={{ ...at(414), fontSize: 18, lineHeight: 1.8 }}>
        {[
          "Use your chosen coding model",
          "Write and test the tool",
          "Return a checklist you can inspect",
        ].map((t, i) => (
          <div key={t} style={{ ...row, marginBottom: 12 }}>
            <span style={{ fontSize: 14, color: muted, width: 24 }}>
              {i + 1}
            </span>
            {t}
          </div>
        ))}
      </div>
      {approved && (
        <div
          style={{
            ...at(580),
            fontSize: 16,
            color: muted,
            opacity: move(f, 1260, 1280),
          }}
        >
          <div style={{ ...row, marginBottom: 13 }}>
            {f >= 1380 ? <Check size={19} /> : <Code2 size={19} />}{" "}
            {f >= 1380
              ? "Tool built. Result checked."
              : "Pixel is building your tool…"}
          </div>
          <div style={{ height: 3, background: "#eee", borderRadius: 4 }}>
            <div
              style={{
                height: 3,
                background: "#333",
                borderRadius: 4,
                width: `${move(f, 1270, 1380) * 100}%`,
              }}
            />
          </div>
        </div>
      )}
      <Footer done={approved}>{approved ? "Approved" : "Approve plan"}</Footer>
    </>
  );
}
function FilePreview() {
  return (
    <>
      <div style={{ ...at(80), ...row, fontSize: 14, color: muted }}>
        <FileText size={19} />
        Markdown · 6 KB
        <span style={{ marginLeft: "auto" }}>Checked by Pixel</span>
      </div>
      <div
        style={{
          ...at(135),
          background: "#fafafa",
          border: "1px solid #e7e7e7",
          borderRadius: 13,
          padding: "34px 28px",
          height: 504,
        }}
      >
        <span style={{ fontSize: 12, color: muted, letterSpacing: 1.3 }}>
          NORTHSTAR / LAUNCH
        </span>
        <h2
          style={{
            fontSize: 33,
            letterSpacing: "-.04em",
            fontWeight: 580,
            margin: "27px 0 13px",
          }}
        >
          Ready for what’s next.
        </h2>
        <p
          style={{
            fontSize: 17,
            lineHeight: 1.6,
            color: muted,
            margin: "0 0 25px",
          }}
        >
          A practical checklist, built from the team’s notes.
        </p>
        {[
          "Confirm the onboarding path",
          "Review the release changes",
          "Test the first-run experience",
          "Share the final launch plan",
        ].map((t, i) => (
          <div
            key={t}
            style={{
              ...row,
              fontSize: 17,
              padding: "17px 0",
              borderBottom: "1px solid #e8e8e8",
              gap: 13,
            }}
          >
            <span
              style={{
                width: 17,
                height: 17,
                border: "1.5px solid #bbb",
                borderRadius: 4,
                flexShrink: 0,
              }}
            />
            {t}
            <span style={{ marginLeft: "auto", fontSize: 12, color: muted }}>
              {["Nova", "Pixel", "Pixel", "You"][i]}
            </span>
          </div>
        ))}
      </div>
      <div style={{ ...at(674), ...row, fontSize: 16, color: muted }}>
        <Check size={19} />
        Made by your team. Ready for your review.
      </div>
    </>
  );
}
function Routines({ f, create = false }: { f: number; create?: boolean }) {
  const saved = happened(f, "saveRoutine");
  const dropdown = happened(f, "openRepeat") && !happened(f, "chooseWeekdays");
  if (!create)
    return (
      <>
        <div
          style={{
            ...at(87),
            ...row,
            justifyContent: "space-between",
            height: 52,
          }}
        >
          <span style={{ fontSize: 18, color: muted }}>
            A little work, taken care of.
          </span>
          <span
            style={{
              ...row,
              height: 42,
              padding: "0 17px",
              borderRadius: 25,
              background: "#222",
              color: "white",
              fontSize: 16,
            }}
          >
            <Plus size={18} />
            New routine
          </span>
        </div>
        {saved ? (
          <div
            style={{
              ...at(175),
              ...row,
              padding: "25px 0",
              borderTop: "1px solid #eee",
              borderBottom: "1px solid #eee",
              opacity: move(f, 2170, 2195),
            }}
          >
            <Face name="Scout" frame={f} size={50} id="routine-scout" />
            <div style={{ fontSize: 20, fontWeight: 550 }}>
              Launch check-in
              <small
                style={{
                  display: "block",
                  fontWeight: 400,
                  fontSize: 15,
                  color: muted,
                  marginTop: 9,
                }}
              >
                Weekdays at 8:00 AM · Scout
              </small>
            </div>
            <Check size={21} style={{ marginLeft: "auto" }} />
          </div>
        ) : (
          <div style={{ ...at(246), textAlign: "center", color: muted }}>
            <CalendarDays size={54} strokeWidth={1.2} />
            <p style={{ fontSize: 21 }}>Make room for what matters.</p>
            <p style={{ fontSize: 16 }}>
              Let the little things look after themselves.
            </p>
          </div>
        )}
      </>
    );
  return (
    <>
      <div style={at(92)}>
        <p style={{ fontSize: 16, fontWeight: 550, margin: "0 0 15px" }}>
          What should happen?
        </p>
        <div
          style={{
            height: 116,
            padding: 18,
            border: "1px solid #ddd",
            borderRadius: 13,
            fontSize: 20,
            lineHeight: 1.55,
          }}
        >
          {typed(
            f,
            1970,
            2020,
            "Review the launch checklist and tell us what needs attention.",
          ) || <span style={{ color: muted }}>Describe the result…</span>}
        </div>
      </div>
      <div style={{ ...at(261), ...row, fontSize: 16, color: muted }}>
        <Face name="Scout" frame={f} size={29} id="routine-owner" />
        Scout
        <ChevronDown size={15} />
      </div>
      <Field top={309} label="When">
        <span>{happened(f, "chooseWeekdays") ? "Weekdays" : "Every day"}</span>
        <ChevronDown size={17} style={{ marginLeft: "auto" }} />
      </Field>
      <Field top={411} label="Time">
        <Clock3 size={20} />
        8:00 AM
        <span style={{ marginLeft: "auto", fontSize: 15, color: muted }}>
          Europe / Brussels
        </span>
      </Field>
      <div style={{ ...at(515), ...row, gap: 9 }}>
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span
            key={i}
            style={{
              display: "grid",
              placeItems: "center",
              height: 47,
              width: 55,
              borderRadius: 12,
              background:
                i < 5 || !happened(f, "chooseWeekdays") ? "#222" : "#f3f3f3",
              color: i < 5 || !happened(f, "chooseWeekdays") ? "white" : muted,
              fontSize: 17,
            }}
          >
            {d}
          </span>
        ))}
      </div>
      <div style={{ ...at(580), fontSize: 16, color: muted, lineHeight: 1.7 }}>
        Launch check-in
        <br />
        <span style={{ color: "#333" }}>
          A checked update, right in your conversation.
        </span>
      </div>
      {dropdown && (
        <div
          style={{
            position: "absolute",
            left: 36,
            right: 36,
            top: 397,
            padding: 8,
            border: "1px solid #ddd",
            borderRadius: 12,
            background: "white",
            boxShadow: "0 12px 35px #00000014",
            fontSize: 18,
          }}
        >
          {["Every day", "Weekdays", "Choose days…"].map((t, i) => (
            <div
              key={t}
              style={{
                ...row,
                height: 47,
                padding: "0 12px",
                background: i === 1 ? "#f3f3f3" : undefined,
                borderRadius: 7,
              }}
            >
              {t}
              {i === 0 && <Check size={16} style={{ marginLeft: "auto" }} />}
            </div>
          ))}
        </div>
      )}
      <Footer>Create routine</Footer>
    </>
  );
}
function AI({ f }: { f: number }) {
  const menu = happened(f, "openModels") && !happened(f, "chooseModel");
  return (
    <>
      <p style={{ ...at(83), fontSize: 21, lineHeight: 1.45, margin: 0 }}>
        Bring your subscriptions.
        <br />
        <span style={{ color: muted }}>
          Choose the models your team works with.
        </span>
      </p>
      {[
        { brand: "openai", name: "ChatGPT", meta: "Your subscription" },
        { brand: "claude", name: "Claude", meta: "Your API connection" },
      ].map((p, i) => (
        <div
          key={p.name}
          style={{
            ...at(176 + i * 85),
            ...row,
            height: 84,
            borderBottom: "1px solid #eee",
          }}
        >
          <Img
            src={staticFile(`brands/${p.brand}.svg`)}
            style={{ width: 31, height: 31, objectFit: "contain" }}
          />
          <span style={{ fontSize: 20 }}>
            {p.name}
            <small
              style={{
                display: "block",
                fontSize: 14,
                color: muted,
                marginTop: 5,
              }}
            >
              {p.meta}
            </small>
          </span>
          <Check size={20} style={{ marginLeft: "auto", color: muted }} />
        </div>
      ))}
      <div style={{ ...at(365), ...row, height: 60 }}>
        <Face name="Pixel" frame={f} size={42} id="ai-pixel" />
        <span style={{ fontSize: 18 }}>Pixel’s model</span>
        <span
          style={{
            ...row,
            marginLeft: "auto",
            padding: "13px 15px",
            background: "#f4f4f4",
            borderRadius: 10,
            fontSize: 17,
          }}
        >
          {happened(f, "chooseModel") ? "GPT-5.5" : "Choose model"}
          <ChevronDown size={16} />
        </span>
      </div>
      {menu && (
        <div
          style={{
            position: "absolute",
            left: 227,
            right: 36,
            top: 429,
            padding: 8,
            border: "1px solid #ddd",
            borderRadius: 12,
            background: "white",
            boxShadow: "0 12px 35px #00000012",
            fontSize: 17,
          }}
        >
          <div style={{ padding: "10px 12px", fontSize: 13, color: muted }}>
            YOUR CHATGPT CONNECTION
          </div>
          {["GPT-5.5", "GPT-5.4"].map((t, i) => (
            <div
              key={t}
              style={{
                height: 48,
                padding: "14px 12px",
                background: i === 0 ? "#f5f5f5" : undefined,
                borderRadius: 7,
              }}
            >
              {t}
            </div>
          ))}
        </div>
      )}
      <div style={{ ...at(583), fontSize: 16, lineHeight: 1.65, color: muted }}>
        Subscriptions, API keys or local models.
        <br />
        Supported providers and plans.
        <br />
        Their terms and usage limits apply.
      </div>
      <Footer done={happened(f, "saveAI")}>
        {happened(f, "saveAI") ? "Saved" : "Save changes"}
      </Footer>
    </>
  );
}
function Create({ f }: { f: number }) {
  const chosen = happened(f, "chooseShape");
  const model = happened(f, "chooseCreateModel");
  return (
    <>
      <div style={{ ...at(74), textAlign: "center" }}>
        <Mascot
          name="Nova"
          size={113}
          frame={f}
          shape={chosen ? "orbit" : "nova"}
          color="#5d85dd"
          label="Iris"
          id="create-preview"
        />
      </div>
      <Field top={198} label="Name">
        {typed(f, 2860, 2910, "Iris") || (
          <span style={{ color: muted }}>Give them a name</span>
        )}
      </Field>
      <Field top={293} label="What will they help with?">
        {typed(f, 2922, 2963, "Launch planning") || (
          <span style={{ color: muted }}>A role that’s yours</span>
        )}
      </Field>
      <div style={{ ...at(401), fontSize: 15, fontWeight: 550 }}>
        Make them your own
      </div>
      <div style={{ ...at(416), ...row, gap: 17 }}>
        {(
          [
            "nova",
            "blob",
            "orbit",
            "sprout",
            "pebble",
            "sunny",
          ] as MascotShape[]
        ).map((shape) => (
          <span
            key={shape}
            style={{
              width: 66,
              height: 65,
              display: "grid",
              placeItems: "center",
              borderRadius: 13,
              background:
                shape === (chosen ? "orbit" : "nova") ? "#eee" : undefined,
            }}
          >
            <Mascot
              size={51}
              shape={shape}
              color="#5d85dd"
              frame={f}
              id={`shape-${shape}`}
            />
          </span>
        ))}
      </div>
      <div style={{ ...at(499), ...row, gap: 16 }}>
        {["#6757d9", "#ee6c98", "#299575", "#5d85dd", "#e09d51"].map(
          (color) => (
            <span
              key={color}
              style={{
                width: 23,
                height: 23,
                background: color,
                borderRadius: "50%",
                outline: color === "#5d85dd" ? "1px solid #999" : undefined,
                outlineOffset: 4,
              }}
            />
          ),
        )}
      </div>
      <Field top={528} label="AI connection">
        <span>{model ? "ChatGPT · GPT-5.5" : "Choose your AI"}</span>
        <ChevronDown size={17} style={{ marginLeft: "auto" }} />
      </Field>
      {happened(f, "openCreateModel") && !model && (
        <div
          style={{
            ...at(599),
            ...row,
            height: 54,
            border: "1px solid #ddd",
            borderRadius: 10,
            background: "white",
            padding: "0 18px",
            boxShadow: "0 12px 30px #00000010",
            fontSize: 18,
          }}
        >
          <Img
            src={staticFile("brands/openai.svg")}
            style={{ width: 23, height: 23 }}
          />
          ChatGPT · GPT-5.5
        </div>
      )}
      <Footer>Create teammate</Footer>
    </>
  );
}
function Content({ kind, f }: { kind: Panel; f: number }) {
  if (kind === "browser") return <Browser f={f} />;
  if (kind === "approval") return <Approval f={f} />;
  if (kind === "file") return <FilePreview />;
  if (kind === "routines" || kind === "newRoutine")
    return <Routines f={f} create={kind === "newRoutine"} />;
  if (kind === "ai") return <AI f={f} />;
  if (kind === "create") return <Create f={f} />;
  if (kind === "workspace")
    return (
      <>
        <p style={{ ...at(92), fontSize: 18, color: muted }}>
          Everything your team is working on.
        </p>
        <NavRow top={142} icon={<Layers3 size={23} />}>
          Activity
        </NavRow>
        <NavRow top={221} icon={<CalendarDays size={23} />}>
          Schedule
        </NavRow>
        <NavRow top={300} icon={<FileText size={23} />}>
          Library
        </NavRow>
        <NavRow
          top={423}
          icon={<Settings2 size={23} />}
          detail="Connections, models and access"
        >
          Settings & AI connections
        </NavRow>
      </>
    );
  return (
    <>
      <p style={{ ...at(84), fontSize: 18, color: muted }}>
        Your team. Your connections. Your choices.
      </p>
      <NavRow
        top={158}
        icon={<Face name="The studio" frame={f} size={28} id="settings-ai" />}
        detail="Choose providers and models"
      >
        Your AI
      </NavRow>
      <NavRow top={237} icon={<Globe size={23} />} detail="Accounts and access">
        Apps & tools
      </NavRow>
      <NavRow
        top={316}
        icon={<CalendarDays size={23} />}
        detail="Work that repeats"
      >
        Routines
      </NavRow>
      <NavRow
        top={395}
        icon={<ShieldCheck size={23} />}
        detail="What your teammates can do"
      >
        Permissions & usage
      </NavRow>
    </>
  );
}
export function FlowPanels({ frame: f }: { frame: number }) {
  const state = stateAt(f);
  const kind =
    state.panel || (f < state.panelAt + 26 ? state.priorPanel : null);
  if (!kind) return null;
  const opening = state.panel !== null;
  const p = opening
    ? state.priorPanel
      ? 1
      : move(f, state.panelAt, state.panelAt + 32)
    : move(f, state.panelAt, state.panelAt + 26, 1, 0);
  const pageChange =
    opening && state.priorPanel
      ? move(f, state.panelAt, state.panelAt + 22)
      : 1;
  return (
    <>
      <div
        style={{
          position: "absolute",
          inset: "97px 0 0 274px",
          background: "#000",
          opacity: p * 0.035,
        }}
      />
      <section
        style={{
          position: "absolute",
          top: 96,
          right: 0,
          bottom: 0,
          width: 570,
          background: "white",
          borderLeft: "1px solid #e6e6e6",
          boxShadow: "-12px 0 40px #00000007",
          translate: `${(1 - p) * 570}px 0`,
          overflow: "hidden",
        }}
      >
        <header
          style={{
            ...row,
            height: 61,
            padding: "0 36px",
            borderBottom: "1px solid #eee",
            fontSize: 21,
            fontWeight: 550,
          }}
        >
          {titles[kind]}
          <X size={21} style={{ marginLeft: "auto" }} />
        </header>
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: pageChange,
            translate: `${(1 - pageChange) * 24}px 0`,
          }}
        >
          <Content kind={kind} f={f} />
        </div>
      </section>
    </>
  );
}
