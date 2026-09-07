import { interpolate, useCurrentFrame } from "remotion";
import {
  Bubble,
  Composer,
  Reveal,
  Status,
  eased,
  linear,
  Pointer,
} from "./shared";

export const reviewRequest =
  "Get Friday’s client review ready. Pull together the notes, timeline and costs.";
export const AskDemo = () => {
  const frame = useCurrentFrame();
  const draft = reviewRequest.slice(
    0,
    Math.max(
      0,
      Math.floor(
        interpolate(frame, [15, 171], [0, reviewRequest.length], linear),
      ),
    ),
  );
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          left: 330,
          top: 100,
          right: 160,
          opacity: interpolate(frame, [0, 135, 165], [1, 1, 0], linear),
        }}
      >
        <div style={{ fontSize: 47, fontWeight: 570, letterSpacing: "-.04em" }}>
          What would you like off your plate?
        </div>
        <div style={{ fontSize: 27, color: "#888", marginTop: 20 }}>
          Ask Nova as you would a teammate.
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 345,
          right: 155,
          top: 110,
          translate: `0 ${interpolate(frame, [186, 238], [150, 0], eased)}px`,
        }}
      >
        <Bubble user at={3.1}>
          {reviewRequest}
        </Bubble>
        <Bubble at={4.8}>
          I’ll gather the context, prepare the review deck and check the costs.
        </Bubble>
        <Reveal at={6.2}>
          <Status>I’ll bring in help for the deck and the numbers.</Status>
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 320,
          right: 120,
          bottom: 24,
          height: 125,
        }}
      >
        <Composer
          text={frame < 188 ? draft || "Message Nova" : "Message Nova"}
          focused={frame < 188}
        />
      </div>
      <Pointer from={[1160, 480]} to={[1200, 680]} at={2.4} click={3.1} />
    </div>
  );
};
