import { Bubble, File, Composer } from "./shared";

export const ContinueDemo = () => (
  <div style={{ position: "absolute", inset: 0 }}>
    <div style={{ position: "absolute", left: 315, right: 145, top: 60 }}>
      <Bubble>
        Your weekly client review is ready. I reused the importer you approved.
      </Bubble>
      <File name="client-review.pdf" detail="This week’s deck" />
      <File name="review-budget.xlsx" detail="Updated costs · checked" />
      <Bubble at={1.2}>The draft email is waiting for your review.</Bubble>
    </div>
    <div
      style={{
        position: "absolute",
        left: 275,
        right: 110,
        bottom: 0,
        height: 110,
      }}
    >
      <Composer />
    </div>
  </div>
);
