import { useCurrentFrame } from "remotion";
import { Check, ChevronDown, KeyRound, Monitor, UserRound } from "lucide-react";
import { DeliveryContents } from "./05-Delivery";
import { ContentHandoff, Caption, move, Rig, Stage } from "./Motion";
import { Mascot, ProductWindow, type Identity } from "./Product";

export function YourAIContents() {
  const f = useCurrentFrame();
  return (
    <>
      <div>
        <p style={{ margin: "0 0 12px", fontSize: 18, color: "#737373" }}>
          YOUR AI
        </p>
        <h2
          style={{
            margin: 0,
            fontSize: 40,
            letterSpacing: "-.045em",
            fontWeight: 550,
          }}
        >
          Bring what works for you.
        </h2>
      </div>
      <div
        style={{
          display: "flex",
          gap: 32,
          padding: "5px 0 24px",
          borderBottom: "1px solid #e8e8e8",
        }}
      >
        {[UserRound, KeyRound, Monitor].map((Icon, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 19,
            }}
          >
            <Icon size={21} />
            {["Subscriptions", "API keys", "Local models"][i]}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gap: 4 }}>
        {(["Nova", "Pixel", "Scout"] as Identity[]).map((name, i) => (
          <div
            key={name}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "22px 0",
              borderBottom: i < 2 ? "1px solid #ededed" : undefined,
            }}
          >
            <Mascot name={name} size={53} frame={f + 3240} id={`ai-${name}`} />
            <span style={{ fontSize: 24, fontWeight: 550, width: 100 }}>
              {name}
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 22,
                color: "#626262",
                display: "flex",
                gap: 20,
                alignItems: "center",
              }}
            >
              {
                [
                  "Your subscription model",
                  "Your API model",
                  "Your local model",
                ][i]
              }
              <ChevronDown size={19} />
            </span>
            <Check
              size={22}
              style={{ opacity: move(f, 110 + i * 70, 135 + i * 70) }}
            />
          </div>
        ))}
      </div>
      <p style={{ fontSize: 19, color: "#737373", margin: 0 }}>
        Choose a provider and model for each teammate.
      </p>
    </>
  );
}

export function YourAI() {
  const f = useCurrentFrame();
  return (
    <Stage>
      <Rig
        scale={move(f, 0, 120, 0.78, 0.88)}
        x={move(f, 0, 120, -245, -70)}
        y={move(f, 0, 120, -165, -125)}
      >
        <ProductWindow frame={f + 3240}>
          <ContentHandoff previous={<DeliveryContents />} previousFrame={719}>
            <YourAIContents />
          </ContentHandoff>
        </ProductWindow>
      </Rig>
      <Caption from={85} until={475}>
        Bring your subscriptions.
        <br />
        Choose your models.
      </Caption>
      <div
        style={{
          position: "absolute",
          bottom: 22,
          left: 135,
          color: "#666",
          fontSize: 22,
          opacity: move(f, 110, 145) * move(f, 450, 478, 1, 0),
        }}
      >
        Supported providers and plans. Their terms and limits apply.
      </div>
    </Stage>
  );
}
