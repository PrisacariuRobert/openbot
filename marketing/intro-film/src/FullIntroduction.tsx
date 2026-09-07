import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import type { CalculateMetadataFunction } from "remotion";
import { FullOpening } from "./full/01-Opening";
import { YourTeam } from "./full/02-YourTeam";
import { Apps } from "./full/03-Apps";
import { TeamStory } from "./story/02-Team";
import { Work } from "./full/05-Work";
import { Routines } from "./full/06-Routines";
import { Extend } from "./full/07-Extend";
import { Control } from "./full/08-Control";
import { ContinuityStory } from "./story/05-Continuity";
import { OpenEnding } from "./full/10-Open";

type Chapter = {
  id: string;
  audio: string;
  lead: number;
  voiceFrames: number;
  durationInFrames: number;
  from: number;
  text: string;
};
type Props = { chapters: Chapter[] };
export const fullIntroductionMetadata: CalculateMetadataFunction<
  Props
> = async () => {
  const response = await fetch(staticFile("audio/full-timing.json"));
  if (!response.ok)
    throw new Error("Generate the full narration and run prepare:full first.");
  const data = (await response.json()) as {
    chapters: Chapter[];
    durationInFrames: number;
  };
  if (
    data.chapters.length !== 10 ||
    data.chapters.some((c) => !c.audio || c.durationInFrames <= c.voiceFrames)
  )
    throw new Error("Incomplete full-introduction audio timing.");
  return {
    durationInFrames: data.durationInFrames,
    props: { chapters: data.chapters },
  };
};
export const FullIntroduction = ({ chapters }: Props) => (
  <AbsoluteFill>
    <Audio src={staticFile("audio/openbot-full-score.wav")} volume={0.34} />
    <TransitionSeries>
      {chapters.map((chapter, i) => (
        <TransitionSeries.Sequence
          key={chapter.id}
          durationInFrames={chapter.durationInFrames}
          name={chapter.id}
        >
          <Sequence name="Aiden narration" from={chapter.lead} layout="none">
            <Audio src={staticFile(chapter.audio)} volume={0.85} />
          </Sequence>
          {i === 0 && <FullOpening />}
          {i === 1 && <YourTeam duration={chapter.durationInFrames} />}
          {i === 2 && <Apps duration={chapter.durationInFrames} />}
          {i === 3 && <TeamStory />}
          {i === 4 && <Work duration={chapter.durationInFrames} />}
          {i === 5 && <Routines duration={chapter.durationInFrames} />}
          {i === 6 && <Extend duration={chapter.durationInFrames} />}
          {i === 7 && <Control duration={chapter.durationInFrames} />}
          {i === 8 && <ContinuityStory />}
          {i === 9 && <OpenEnding duration={chapter.durationInFrames} />}
        </TransitionSeries.Sequence>
      ))}
    </TransitionSeries>
  </AbsoluteFill>
);
