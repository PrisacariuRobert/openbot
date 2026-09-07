import "./index.css";
import { Composition, staticFile } from "remotion";
import { loadFont } from "@remotion/fonts";
import { Film } from "./Film";
import { DynamicFilm } from "./DynamicFilm";
import { StoryFilm } from "./StoryFilm";
import { VoiceDirection } from "./VoiceDirection";
import { FullIntroduction, fullIntroductionMetadata } from "./FullIntroduction";
import { PulseFilm } from "./PulseFilm";
import { DemoFilm } from "./DemoFilm";
import { StudioFilm } from "./StudioFilm";
import { Ask } from "./story/01-Ask";
import { TeamStory } from "./story/02-Team";
import { ResultsStory } from "./story/03-Results";
import { DecisionStory } from "./story/04-Decision";
import { ContinuityStory } from "./story/05-Continuity";
import { YoursStory } from "./story/06-Yours";
import { Birth } from "./dynamic/01-Birth";
import { Conversation } from "./dynamic/02-Conversation";
import { Orbit } from "./dynamic/03-Orbit";
import { Work } from "./dynamic/04-Work";
import { Rhythm } from "./dynamic/05-Rhythm";
import { Approval } from "./dynamic/06-Approval";
import { Continuity } from "./dynamic/07-Continuity";
import { Signature } from "./dynamic/08-Signature";
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

loadFont({
  family: "Inter",
  url: staticFile("fonts/InterVariable.woff2"),
  weight: "100 900",
  display: "block",
});

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="OpenBot-In-Motion"
        component={StudioFilm}
        durationInFrames={3840}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="OpenBot-See-It-Work"
        component={DemoFilm}
        durationInFrames={4920}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="OpenBot-Pulse-No-Voice"
        component={PulseFilm}
        durationInFrames={3240}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="OpenBot-Full-Introduction"
        component={FullIntroduction}
        calculateMetadata={fullIntroductionMetadata}
        defaultProps={{ chapters: [] }}
        durationInFrames={3100}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="OpenBot-Voice-Direction"
        component={VoiceDirection}
        durationInFrames={660}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="OpenBot-From-Idea"
        component={StoryFilm}
        durationInFrames={2820}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="Story-01-Ask"
        component={Ask}
        durationInFrames={360}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="Story-02-Team"
        component={TeamStory}
        durationInFrames={480}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="Story-03-Results"
        component={ResultsStory}
        durationInFrames={540}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="Story-04-Decision"
        component={DecisionStory}
        durationInFrames={420}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="Story-05-Continuity"
        component={ContinuityStory}
        durationInFrames={480}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="Story-06-Yours"
        component={YoursStory}
        durationInFrames={540}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="OpenBot-Dynamic"
        component={DynamicFilm}
        durationInFrames={3120}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="Dynamic-01-Birth"
        component={Birth}
        durationInFrames={300}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="Dynamic-02-Conversation"
        component={Conversation}
        durationInFrames={420}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="Dynamic-03-Orbit"
        component={Orbit}
        durationInFrames={420}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="Dynamic-04-Work"
        component={Work}
        durationInFrames={480}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="Dynamic-05-Rhythm"
        component={Rhythm}
        durationInFrames={360}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="Dynamic-06-Approval"
        component={Approval}
        durationInFrames={300}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="Dynamic-07-Continuity"
        component={Continuity}
        durationInFrames={420}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="Dynamic-08-Signature"
        component={Signature}
        durationInFrames={420}
        fps={60}
        width={1920}
        height={1080}
      />
      <Composition
        id="OpenBot-Introduction"
        component={Film}
        durationInFrames={2412}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="01-Hello"
        component={Hello}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="02-Matters"
        component={Matters}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="03-Team"
        component={Team}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="04-Choice"
        component={Choice}
        durationInFrames={240}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="05-Apps"
        component={Apps}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="06-Delivery"
        component={Delivery}
        durationInFrames={240}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="07-Routines"
        component={Routines}
        durationInFrames={240}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="08-Control"
        component={Control}
        durationInFrames={240}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="09-Reach"
        component={Reach}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="10-Open"
        component={Open}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
