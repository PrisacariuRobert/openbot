import type { CSSProperties, ReactNode } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Ellipsis,
  Layers3,
  Monitor,
  Plus,
  Search,
  Settings2,
  Users,
} from "lucide-react";
import { Mascot, Wordmark, type Identity } from "../launch/Product";
import { move } from "../launch/Motion";
import { draftAt, stateAt, type Thread } from "./timeline";

export const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
};
export function Face({
  name,
  frame,
  size = 43,
  id,
}: {
  name: Thread;
  frame: number;
  size?: number;
  id: string;
}) {
  const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "-");
  if (name === "The studio")
    return (
      <span
        style={{
          width: size,
          height: size,
          position: "relative",
          flexShrink: 0,
          display: "inline-block",
          verticalAlign: "middle",
        }}
      >
        {(["Nova", "Pixel", "Scout"] as Identity[]).map((n, i) => (
          <span
            key={n}
            style={{
              position: "absolute",
              left: i * size * 0.24,
              top: (i % 2) * 4,
            }}
          >
            <Mascot
              name={n}
              frame={frame + i * 20}
              size={size * 0.6}
              id={`${safeId}-${n}`}
            />
          </span>
        ))}
      </span>
    );
  return (
    <Mascot
      name={name === "Iris" ? "Nova" : name}
      shape={name === "Iris" ? "orbit" : undefined}
      color={name === "Iris" ? "#5d85dd" : undefined}
      label={name}
      frame={frame}
      size={size}
      id={safeId}
    />
  );
}
export function FlowWindow({
  frame: f,
  children,
  panel,
  pointer,
}: {
  frame: number;
  children: ReactNode;
  panel: ReactNode;
  pointer: ReactNode;
}) {
  const state = stateAt(f);
  const draft = draftAt(f);
  const names: Thread[] = [
    "The studio",
    "Nova",
    "Pixel",
    "Scout",
    ...(state.created ? ["Iris" as const] : []),
  ];
  const subtitle = (name: Thread) => {
    if (name === "The studio")
      return f >= 810 ? "One plan. Coming together." : "Your shared team room";
    if (name === "Nova")
      return f >= 700
        ? "Launch notes reviewed"
        : f >= 300
          ? "Reading the launch notes…"
          : "Research and planning";
    if (name === "Pixel")
      return f >= 1380
        ? "Your checklist is ready"
        : f >= 1260
          ? "Building your tool…"
          : f >= 850
            ? "A plan for your approval"
            : "Making ideas real";
    if (name === "Scout")
      return state.routineSaved
        ? "Next check-in · tomorrow, 8 AM"
        : "Keeping things moving";
    return f >= 3260 ? "Let’s make it happen." : "Your launch teammate";
  };
  return (
    <div
      style={{
        position: "relative",
        width: 1440,
        height: 890,
        overflow: "hidden",
        background: "white",
        border: "1px solid #dedede",
        borderRadius: 22,
        color: "#202020",
        boxShadow: "0 36px 95px #00000016, 0 3px 12px #00000006",
      }}
    >
      <div
        style={{
          ...row,
          height: 30,
          paddingLeft: 16,
          gap: 8,
          borderBottom: "1px solid #eee",
          fontSize: 12,
          color: "#999",
        }}
      >
        {[0, 1, 2].map((n) => (
          <i
            key={n}
            style={{
              width: 11,
              height: 11,
              borderRadius: "50%",
              background: "#d5d5d5",
            }}
          />
        ))}
        <span style={{ marginLeft: 10 }}>OpenBot</span>
      </div>
      <aside
        style={{
          position: "absolute",
          left: 0,
          top: 30,
          bottom: 0,
          width: 274,
          background: "#f7f7f7",
          borderRight: "1px solid #e9e9e9",
        }}
      >
        <div style={{ position: "absolute", left: 29, top: 33 }}>
          <Wordmark size={26} />
        </div>
        <div
          style={{
            ...row,
            position: "absolute",
            left: 20,
            right: 20,
            top: 91,
            height: 44,
            padding: "0 13px",
            background: "#eee",
            borderRadius: 10,
            fontSize: 16,
            color: "#777",
          }}
        >
          <Search size={18} />
          Search
        </div>
        <div
          style={{
            ...row,
            position: "absolute",
            left: 26,
            right: 27,
            top: 150,
            height: 28,
            fontSize: 14,
            color: "#777",
          }}
        >
          Conversations
          <Users size={16} style={{ marginLeft: "auto" }} />
          <Plus size={19} />
        </div>
        {names.map((name, i) => {
          const selected = state.thread === name;
          const p = name === "Iris" ? move(f, 3070, 3102) : 1;
          return (
            <div
              key={name}
              style={{
                ...row,
                position: "absolute",
                left: 12,
                right: 12,
                top: 190 + i * 78,
                height: 76,
                padding: "0 14px",
                borderRadius: 11,
                background: selected ? "#e8e8e8" : "transparent",
                opacity: p,
                translate: `${(1 - p) * -50}px 0`,
              }}
            >
              <Face
                name={name}
                size={45}
                frame={f + i * 30}
                id={`flow-sidebar-${name}`}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ ...row, fontSize: 17, fontWeight: 560, gap: 5 }}>
                  {name}
                  {name === "Pixel" && f >= 850 && f < 930 && (
                    <i
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 10,
                        background: "#222",
                        marginLeft: "auto",
                      }}
                    />
                  )}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    color: "#777",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    marginTop: 4,
                  }}
                >
                  {subtitle(name)}
                </div>
              </div>
            </div>
          );
        })}
        <div
          style={{
            position: "absolute",
            left: 21,
            right: 21,
            bottom: 94,
            height: 1,
            background: "#e2e2e2",
          }}
        />
        <div
          style={{
            ...row,
            position: "absolute",
            left: 21,
            right: 21,
            bottom: 46,
            height: 54,
            padding: "0 8px",
            fontSize: 17,
            borderRadius: 9,
            background: ["workspace", "routines", "newRoutine"].includes(
              state.panel || "",
            )
              ? "#e8e8e8"
              : undefined,
          }}
        >
          <Layers3 size={19} />
          Workspace
          {state.routineSaved && (
            <Check size={16} style={{ marginLeft: "auto" }} />
          )}
        </div>
        <div
          style={{
            ...row,
            position: "absolute",
            left: 29,
            right: 24,
            bottom: 31,
            fontSize: 13,
            color: "#777",
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              background: "#777",
              borderRadius: 10,
            }}
          />
          Studio connected
          <Settings2
            size={19}
            style={{
              marginLeft: "auto",
              color:
                state.panel === "settings" || state.panel === "ai"
                  ? "#111"
                  : "#777",
            }}
          />
        </div>
      </aside>
      <header
        style={{
          ...row,
          position: "absolute",
          top: 30,
          left: 274,
          right: 0,
          height: 67,
          padding: "0 28px",
          borderBottom: "1px solid #ececec",
          fontSize: 18,
          fontWeight: 550,
        }}
      >
        <Face name={state.thread} size={36} frame={f} id="flow-header" />
        {state.thread}
        <ChevronDown size={15} />
        <div style={{ ...row, marginLeft: "auto", gap: 25, color: "#777" }}>
          <Plus size={20} />
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 28,
              height: 32,
              borderRadius: 7,
              background: state.panel === "browser" ? "#e8e8e8" : undefined,
            }}
          >
            <Monitor size={21} />
          </span>
          <Ellipsis size={23} />
        </div>
      </header>
      <main
        style={{
          position: "absolute",
          left: 274,
          top: 97,
          right: 0,
          bottom: 165,
          overflow: "hidden",
          padding: "32px 65px",
        }}
      >
        {children}
      </main>
      <div
        style={{
          position: "absolute",
          left: 314,
          right: 40,
          bottom: 24,
          height: 137,
          border: "1px solid #e6e6e6",
          borderRadius: 22,
          padding: "21px 22px 16px",
          background: "white",
        }}
      >
        <div
          style={{
            fontSize: 20,
            color: draft ? "#222" : "#919191",
            height: 29,
          }}
        >
          {draft ||
            `Message ${state.thread === "The studio" ? "the studio" : state.thread}…`}
          {draft && f % 50 < 30 && (
            <span style={{ borderRight: "1.5px solid #333", marginLeft: 2 }} />
          )}
        </div>
        <div style={{ ...row, fontSize: 15, color: "#777", marginTop: 26 }}>
          <Plus size={22} />
          <Face name={state.thread} size={27} frame={f} id="flow-composer" />
          {state.thread}
          <ChevronDown size={14} />
          <span
            style={{
              marginLeft: "auto",
              width: 37,
              height: 37,
              borderRadius: "50%",
              background: draft ? "#202020" : "#d8d8d8",
              color: "white",
              display: "grid",
              placeItems: "center",
            }}
          >
            <ArrowUp size={23} />
          </span>
        </div>
      </div>
      {panel}
      {pointer}
    </div>
  );
}
