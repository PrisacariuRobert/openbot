import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { AbsoluteFill, staticFile } from "remotion";
import { Arrival } from "./studio-film/01-Arrival";
import { Connected } from "./studio-film/02-Connected";
import { Team } from "./studio-film/03-Team";
import { Build } from "./studio-film/04-Build";
import { Delivery } from "./studio-film/05-Delivery";
import { Continuity } from "./studio-film/06-Continuity";

// Original, fictional product choreography. No owner-account capture or narration.
export function StudioFilm() {
  return (
    <AbsoluteFill>
      <Audio src={staticFile("audio/openbot-studio-motion.wav")} />
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="01 / Meet your teammate"
          durationInFrames={480}
        >
          <Arrival />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence
          name="02 / Your working world"
          durationInFrames={720}
        >
          <Connected />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence
          name="03 / Private teamwork"
          durationInFrames={600}
        >
          <Team />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence
          name="04 / Build the missing piece"
          durationInFrames={720}
        >
          <Build />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence
          name="05 / Work you can use"
          durationInFrames={720}
        >
          <Delivery />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence
          name="06 / A conversation that continues"
          durationInFrames={600}
        >
          <Continuity />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
}
