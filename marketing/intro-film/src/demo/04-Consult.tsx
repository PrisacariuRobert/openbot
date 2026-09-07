import { useCurrentFrame } from "remotion";
import { Mascot } from "../components";
import { Bubble, Reveal, Split, Row, Status } from "./shared";

export const ConsultDemo = () => {
  const frame = useCurrentFrame();
  return (
    <Split
      title="Working together"
      subtitle="Nova keeps this conversation coordinated"
      left={
        <>
          <Bubble>
            The context is ready. Milo is preparing the deck; Fern is checking
            the expenses.
          </Bubble>
          <Reveal at={2.4}>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                margin: "20px 0 35px 53px",
                fontSize: 23,
                color: "#777",
              }}
            >
              <Mascot size={35} />
              <Mascot kind={1} size={35} />
              <Mascot kind={2} size={35} /> Consulting privately
            </div>
          </Reveal>
          <Bubble at={4}>
            There’s one gap in the expense workflow. I have a plan for it.
          </Bubble>
        </>
      }
      right={
        <>
          <Row
            title="Nova"
            detail="Gather the context"
            icon={<Mascot size={62} />}
          />
          <Reveal at={0.5}>
            <Row
              title="Milo"
              detail="Build the review deck"
              icon={<Mascot kind={1} size={62} />}
            />
          </Reveal>
          <Reveal at={1.2}>
            <Row
              title="Fern"
              detail="Check the cost breakdown"
              icon={<Mascot kind={2} size={62} />}
            />
          </Reveal>
          <Reveal at={2.2}>
            <div
              style={{
                marginTop: 35,
                padding: "22px 26px",
                borderLeft: "2px solid #ccc",
                fontSize: 27,
                lineHeight: 1.4,
              }}
            >
              <span style={{ fontSize: 20, color: "#888" }}>FERN → NOVA</span>
              <div style={{ marginTop: 12 }}>
                These exports use different number formats. We need a small
                importer.
              </div>
            </div>
          </Reveal>
          <Status done={frame > 240}>
            {frame > 240
              ? "One issue returned to Nova"
              : "Teammates share findings here"}
          </Status>
        </>
      }
    />
  );
};
