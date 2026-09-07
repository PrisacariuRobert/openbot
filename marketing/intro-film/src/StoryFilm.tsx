import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { staticFile } from "remotion";
import { Ask } from "./story/01-Ask";
import { TeamStory } from "./story/02-Team";
import { ResultsStory } from "./story/03-Results";
import { DecisionStory } from "./story/04-Decision";
import { ContinuityStory } from "./story/05-Continuity";
import { YoursStory } from "./story/06-Yours";

export const StoryFilm = () => (
  <>
    <Audio src={staticFile("audio/openbot-story-score.wav")} />
    <TransitionSeries>
      <TransitionSeries.Sequence
        name="An idea becomes one ask"
        durationInFrames={360}
      >
        <Ask />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="Responsibility moves through the team"
        durationInFrames={480}
      >
        <TeamStory />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="Move through the finished work"
        durationInFrames={540}
      >
        <ResultsStory />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="A routine and a human decision"
        durationInFrames={420}
      >
        <DecisionStory />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="The conversation travels"
        durationInFrames={480}
      >
        <ContinuityStory />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        name="Your model, your platform"
        durationInFrames={540}
      >
        <YoursStory />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </>
);
