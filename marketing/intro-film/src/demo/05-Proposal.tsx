import { useCurrentFrame } from "remotion";
import { Check, FileCode2 } from "lucide-react";
import { Bubble, Button, Pointer, Reveal, Row, Split, Status } from "./shared";

export const ProposalDemo = () => {
  const frame = useCurrentFrame();
  const approved = frame >= 388;
  return (
    <Split
      title="Review a new capability"
      subtitle="Friday client review · same task"
      left={
        <>
          <Bubble>
            The receipts use different number formats. I don’t have an importer
            for them yet.
          </Bubble>
          <Bubble at={1.3}>
            I can build a small tool for these files, test it, then continue
            your review.
          </Bubble>
          <Reveal at={3.2}>
            <Status>Nothing is built until you approve the plan.</Status>
          </Reveal>
          <Bubble at={6.7}>
            Approved. I’m continuing this task with your coding model.
          </Bubble>
        </>
      }
      right={
        <>
          <div
            style={{
              fontSize: 38,
              fontWeight: 590,
              letterSpacing: "-.035em",
              marginBottom: 24,
            }}
          >
            Build an expense importer?
          </div>
          <Row title="Read" detail="The three selected expense exports" />
          <Row
            title="Normalize"
            detail="Different column names and number formats"
          />
          <Row title="Save" detail="A reusable tool in Nova’s workspace" />
          <div
            style={{
              fontSize: 22,
              color: "#777",
              marginTop: 26,
              display: "flex",
              gap: 13,
              alignItems: "center",
            }}
          >
            <FileCode2 size={25} />
            .opencode/tools/import_expenses.ts
          </div>
          <div style={{ fontSize: 23, marginTop: 23 }}>
            Build with <b>your configured coding model</b>.
          </div>
          <div style={{ display: "flex", gap: 15, marginTop: 35 }}>
            <Button>
              {approved ? (
                <>
                  <Check size={25} />
                  Approved
                </>
              ) : (
                "Approve & build"
              )}
            </Button>
            {!approved && <Button secondary>Not now</Button>}
          </div>
          <Pointer from={[645, 630]} to={[155, 697]} at={5.7} click={6.45} />
        </>
      }
    />
  );
};
