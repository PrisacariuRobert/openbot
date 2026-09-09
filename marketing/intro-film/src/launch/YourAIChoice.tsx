import { useCurrentFrame } from "remotion";
import { Check } from "lucide-react";
import { DeliveryContents } from "./05-Delivery";
import { ContentHandoff, Caption, move, Rig, Stage } from "./Motion";
import { Mascot, ProductWindow, type Identity } from "./Product";

// Explain the freedom, not the setup form. These are supported connection paths,
// not a claim that every subscription includes access to every model.
export function YourAIContents() {
  const f = useCurrentFrame();
  return <>
    <h2 style={{ margin: "0 0 10px", fontSize: 42, fontWeight: 550, letterSpacing: "-.045em" }}>
      Different minds. Your choice.
    </h2>
    <div style={{ display: "grid", gap: 22, paddingTop: 10 }}>
      {(["Nova", "Pixel", "Scout"] as Identity[]).map((name, i) => {
        const at = 65 + i * 70;
        return <div key={name} style={{
          display: "flex", alignItems: "center", gap: 22,
          padding: "20px 22px", border: "1px solid #e8e8e8", borderRadius: 18,
          translate: `${move(f, at, at + 65, 170, 0)}px 0`,
          opacity: move(f, at, at + 30),
        }}>
          <div style={{ rotate: `${move(f, at, at + 75, -20, 0)}deg` }}>
            <Mascot name={name} size={72} frame={f + 3240} id={`ai-${name}`} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 23, fontWeight: 550, marginBottom: 7 }}>{name}</div>
            <div style={{ fontSize: 26, color: "#656565" }}>{["Your subscription", "Your API model", "Your local model"][i]}</div>
          </div>
          <Check size={27} style={{ opacity: move(f, at + 55, at + 75), scale: move(f, at + 55, at + 90, .65, 1) }} />
        </div>;
      })}
    </div>
  </>;
}

export function YourAI() {
  const f = useCurrentFrame();
  return <Stage>
    <Rig scale={move(f, 0, 120, .78, .88)} x={move(f, 0, 120, -245, -70)} y={move(f, 0, 120, -165, -125)}>
      <ProductWindow frame={f + 3240}>
        <ContentHandoff previous={<DeliveryContents />} previousFrame={719}>
          <YourAIContents />
        </ContentHandoff>
      </ProductWindow>
    </Rig>
    <Caption from={85} until={475}>Bring your subscriptions.<br />Choose your models.</Caption>
    <div style={{ position: "absolute", bottom: 22, left: 135, color: "#666", fontSize: 22,
      opacity: move(f, 110, 145) * move(f, 450, 478, 1, 0) }}>
      Supported providers and plans. Their terms and limits apply.
    </div>
  </Stage>;
}
