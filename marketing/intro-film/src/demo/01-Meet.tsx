import { interpolate, useCurrentFrame } from "remotion";
import { Check, ChevronDown } from "lucide-react";
import { Brand, Mascot } from "../components";
import { Button, Pointer, eased, linear } from "./shared";

export const MeetDemo = () => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", inset: 0, background: "white" }}>
      <div
        style={{
          position: "absolute",
          left: 200,
          top: 125,
          width: 1010,
          display: "flex",
          gap: 55,
          alignItems: "flex-start",
        }}
      >
        <Mascot size={180} />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 47,
              fontWeight: 600,
              letterSpacing: "-.04em",
              marginTop: 15,
            }}
          >
            Make your first teammate.
          </div>
          <div style={{ fontSize: 26, color: "#777", marginTop: 14 }}>
            Give it a role. Choose the AI it works with.
          </div>
          <div style={{ fontSize: 24, marginTop: 35, color: "#888" }}>Name</div>
          <div
            style={{
              fontSize: 33,
              marginTop: 12,
              paddingBottom: 18,
              borderBottom: "1px solid #ddd",
            }}
          >
            Nova
          </div>
          <div style={{ fontSize: 24, marginTop: 24, color: "#888" }}>Role</div>
          <div
            style={{
              fontSize: 30,
              marginTop: 12,
              paddingBottom: 18,
              borderBottom: "1px solid #ddd",
            }}
          >
            Your project teammate
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 28,
              fontSize: 28,
            }}
          >
            Your AI{" "}
            <span style={{ display: "flex", alignItems: "center", gap: 15 }}>
              {frame > 255 ? (
                <>
                  <Brand id="openai" size={30} /> OpenAI
                </>
              ) : (
                "Choose a connection"
              )}
              <ChevronDown size={23} />
            </span>
          </div>
          <Button style={{ marginTop: 38, opacity: frame > 255 ? 1 : 0.35 }}>
            Create teammate
          </Button>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 800,
          top: 370,
          width: 445,
          padding: "8px 24px",
          background: "white",
          border: "1px solid #ddd",
          borderRadius: 20,
          boxShadow: "0 16px 45px #00000016",
          opacity: interpolate(
            frame,
            [138, 153, 253, 266],
            [0, 1, 1, 0],
            linear,
          ),
          translate: `0 ${interpolate(frame, [138, 170], [12, 0], eased)}px`,
        }}
      >
        {["openai", "claude", "opencode"].map((id, i) => (
          <div
            key={id}
            style={{
              display: "flex",
              gap: 18,
              alignItems: "center",
              fontSize: 27,
              padding: "20px 0",
              borderBottom: i < 2 ? "1px solid #eee" : undefined,
            }}
          >
            <Brand id={id} size={33} />
            {["OpenAI", "Claude", "OpenCode"][i]}
            {i === 0 && frame > 237 && (
              <Check size={26} style={{ marginLeft: "auto" }} />
            )}
          </div>
        ))}
      </div>
      <Pointer from={[1100, 600]} to={[1070, 482]} at={1.7} click={2.3} />
      <Pointer from={[1080, 486]} to={[1030, 408]} at={3.2} click={4.15} />
      <Pointer from={[1030, 415]} to={[610, 584]} at={5.3} click={6.2} />
    </div>
  );
};
