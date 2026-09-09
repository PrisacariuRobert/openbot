import { WorkingWorldContents } from "./02-WorkingWorld";
import { useCurrentFrame } from "remotion";
import { Check, Users } from "lucide-react";
import { Bubble, Mascot, ProductWindow, type Identity } from "./Product";
import { Appear, Caption, ContentHandoff, move, Rig, Stage } from "./Motion";
export function Team() {
  const f = useCurrentFrame();
  return (
    <Stage>
      <Rig
        scale={move(f, 0, 135, 0.8, 0.83)}
        x={move(f, 0, 135, -215, 0)}
        y={move(f, 0, 135, -150, -120)}
        tilt={move(f, 0, 135, -4, 0)}
      >
        <ProductWindow frame={f + 1200}>
          <ContentHandoff
            previous={<WorkingWorldContents />}
            previousFrame={719}
          >
            <TeamContents />
          </ContentHandoff>
        </ProductWindow>
        {/* Teammates travel into the shared answer, then become the small
            conversation identities. These are vector actors, not screen zooms. */}
        {f > 45 && f < 330 && (["Pixel", "Scout"] as Identity[]).map((name, i) => (
          <div key={name} style={{
            position: "absolute",
            left: move(f, 60 + i * 22, 150 + i * 22, 1480 + i * 150, 1130 - i * 195),
            top: 310 + i * 55 - Math.sin(Math.PI * move(f, 60, 195)) * 65,
            scale: move(f, 200 + i * 20, 290 + i * 20, 1, .16),
            translate: `${move(f, 200 + i * 20, 290 + i * 20, 0, -500 + i * 170)}px ${move(f, 200 + i * 20, 290 + i * 20, 0, -65 + i * 65)}px`,
            rotate: `${move(f, 60 + i * 22, 170 + i * 22, i ? 25 : -25, 0)}deg`,
            opacity: move(f, 45, 80) * move(f, 265 + i * 20, 310 + i * 20, 1, 0),
            pointerEvents: "none",
          }}><Mascot name={name} size={230} frame={f + i * 47} id={`flying-${name}`} /></div>
        ))}
      </Rig>
      <Caption from={155} until={600}>
        More minds.
        <br />
        One conversation.
      </Caption>
    </Stage>
  );
}

export function TeamContents() {
  const f = useCurrentFrame();
  return (
    <>
      <Bubble owner>Work together. Bring me one clear answer.</Bubble>
      <Appear at={65}>
        <div
          style={{
            display: "flex",
            gap: 13,
            alignItems: "center",
            color: "#737373",
            fontSize: 20,
          }}
        >
          <Users size={23} />
          Private team review
        </div>
      </Appear>
      <div style={{ display: "grid", gap: 14 }}>
        {(["Nova", "Pixel", "Scout"] as Identity[]).map((name, i) => (
          <Appear at={110 + i * 66} key={name}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                borderBottom: "1px solid #e6e6e6",
                padding: "10px 0 20px",
                fontSize: 22,
              }}
            >
              <Mascot name={name} size={45} frame={f} id={`team-${name}`} />
              <b style={{ width: 65, fontWeight: 550 }}>{name}</b>
              <span style={{ color: "#737373", flex: 1 }}>
                {
                  [
                    "Research & evidence",
                    "Project & implementation",
                    "Owners & follow-through",
                  ][i]
                }
              </span>
              <Check
                size={23}
                style={{ opacity: move(f, 330 + i * 35, 355 + i * 35) }}
              />
            </div>
          </Appear>
        ))}
      </div>
      <Appear at={405}>
        <Bubble>
          Research linked. Project reviewed. Next steps ready.
        </Bubble>
      </Appear>
    </>
  );
}
