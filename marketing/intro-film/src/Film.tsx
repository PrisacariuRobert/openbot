import { Audio } from "@remotion/media";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { staticFile } from "remotion";
import { Hello } from "./scenes/01-Hello";
import { Matters } from "./scenes/02-Matters";
import { Team } from "./scenes/03-Team";
import { Choice } from "./scenes/04-Choice";
import { Apps } from "./scenes/05-Apps";
import { Delivery } from "./scenes/06-Delivery";
import { Routines } from "./scenes/07-Routines";
import { Control } from "./scenes/08-Control";
import { Reach } from "./scenes/09-Reach";
import { Open } from "./scenes/10-Open";

// 2520 scene frames minus nine 12-frame overlaps = 2412 frames / 80.4 s.
export const Film = () => (
  <>
    <Audio src={staticFile("audio/openbot-original-score.wav")} />
    <TransitionSeries>
      <TransitionSeries.Sequence name="A little help" durationInFrames={180}>
        <Hello />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 12 })}
      />
      <TransitionSeries.Sequence
        name="Work that matters"
        durationInFrames={180}
      >
        <Matters />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 12 })}
      />
      <TransitionSeries.Sequence name="One conversation" durationInFrames={300}>
        <Team />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 12 })}
      />
      <TransitionSeries.Sequence name="Your AI" durationInFrames={240}>
        <Choice />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 12 })}
      />
      <TransitionSeries.Sequence name="Where you work" durationInFrames={300}>
        <Apps />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 12 })}
      />
      <TransitionSeries.Sequence name="Delivered work" durationInFrames={240}>
        <Delivery />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 12 })}
      />
      <TransitionSeries.Sequence name="Routines" durationInFrames={240}>
        <Routines />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 12 })}
      />
      <TransitionSeries.Sequence
        name="You are in control"
        durationInFrames={240}
      >
        <Control />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 12 })}
      />
      <TransitionSeries.Sequence name="Mac and iPhone" durationInFrames={300}>
        <Reach />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={fade()}
        timing={linearTiming({ durationInFrames: 12 })}
      />
      <TransitionSeries.Sequence
        name="Open possibilities"
        durationInFrames={300}
      >
        <Open />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </>
);
