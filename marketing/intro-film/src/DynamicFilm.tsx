import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { staticFile } from "remotion";
import { Birth } from "./dynamic/01-Birth";
import { Conversation } from "./dynamic/02-Conversation";
import { Orbit } from "./dynamic/03-Orbit";
import { Work } from "./dynamic/04-Work";
import { Rhythm } from "./dynamic/05-Rhythm";
import { Approval } from "./dynamic/06-Approval";
import { Continuity } from "./dynamic/07-Continuity";
import { Signature } from "./dynamic/08-Signature";

// Physical match cuts belong to the choreography: no slideshow dissolves.
export const DynamicFilm = () => (
  <>
    <Audio src={staticFile("audio/openbot-dynamic-score.wav")} />
    <TransitionSeries>
      <TransitionSeries.Sequence
        name="Macro mascot reveal"
        durationInFrames={300}
      >
        <Birth />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="Into the conversation"
        durationInFrames={420}
      >
        <Conversation />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence name="AI in orbit" durationInFrames={420}>
        <Orbit />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="Apps become delivered work"
        durationInFrames={480}
      >
        <Work />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="The rhythm of a week"
        durationInFrames={360}
      >
        <Rhythm />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="The human decision"
        durationInFrames={300}
      >
        <Approval />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="Through Mac and iPhone"
        durationInFrames={420}
      >
        <Continuity />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="OpenBot signature"
        durationInFrames={420}
      >
        <Signature />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </>
);
