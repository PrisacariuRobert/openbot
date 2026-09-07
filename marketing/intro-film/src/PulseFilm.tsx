import { AbsoluteFill, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { Spark } from "./pulse/01-Spark";
import { Team } from "./pulse/02-Team";
import { Choice } from "./pulse/03-Choice";
import { Browser } from "./pulse/04-Browser";
import { Work } from "./pulse/05-Work";
import { Rhythm } from "./pulse/06-Rhythm";
import { Memory } from "./pulse/07-Memory";
import { Extend } from "./pulse/08-Extend";
import { Approval } from "./pulse/09-Approval";
import { Devices } from "./pulse/10-Devices";
import { Open } from "./pulse/11-Open";
import { Finale } from "./pulse/12-Finale";

// Picture-locked at 120 BPM. No narration and no narration-derived timing.
export const PulseFilm = () => (
  <AbsoluteFill>
    <Audio src={staticFile("audio/openbot-pulse.wav")} />
    <TransitionSeries>
      <TransitionSeries.Sequence name="01 / A request" durationInFrames={240}>
        <Spark />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="02 / The team takes it"
        durationInFrames={240}
      >
        <Team />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="03 / Choose your AI"
        durationInFrames={180}
      >
        <Choice />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="04 / Into your working world"
        durationInFrames={300}
      >
        <Browser />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="05 / Real kinds of output"
        durationInFrames={480}
      >
        <Work />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="06 / Work finds a rhythm"
        durationInFrames={240}
      >
        <Rhythm />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="07 / Your way of working"
        durationInFrames={180}
      >
        <Memory />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="08 / Extend the team"
        durationInFrames={240}
      >
        <Extend />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="09 / Your decision"
        durationInFrames={240}
      >
        <Approval />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="10 / A conversation that travels"
        durationInFrames={300}
      >
        <Devices />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="11 / An open platform"
        durationInFrames={240}
      >
        <Open />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence name="12 / More making" durationInFrames={360}>
        <Finale />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
