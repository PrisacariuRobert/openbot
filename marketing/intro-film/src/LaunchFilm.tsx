import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { AbsoluteFill, Freeze, staticFile, useCurrentFrame } from "remotion";
import type { ReactNode } from "react";
import { Conversation } from "./launch/01-Conversation";
import { WorkingWorld } from "./launch/02-WorkingWorld";
import { Team } from "./launch/03-Team";
import { Extend } from "./launch/04-Extend";
import { Delivery } from "./launch/05-Delivery";
import { Yours } from "./launch/06-Yours";
import { YourAI } from "./launch/YourAIChoice";
import { FlowFilm } from "./flow/FlowFilm";
// Preserve the screenshot direction separately. This is an animated product story,
// with the same window geometry, messages and controls as the shared Studio UI.
// A single editorial clock preserves every matched camera pose at the scene joins.
function EditorialClock({ children }: { children: ReactNode }) {
  const frame = useCurrentFrame();
  return (
    <Freeze frame={Math.min(4319, Math.round(frame * 1.2))}>{children}</Freeze>
  );
}
export function LaunchFilm() {
  return (
    <AbsoluteFill>
      <Audio src={staticFile("audio/openbot-launch-motion.wav")} />
      <FlowFilm />
    </AbsoluteFill>
  );
}
export function AnimatedStory() {
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="01 / A conversation begins"
          durationInFrames={400}
        >
          <EditorialClock>
            <Conversation />
          </EditorialClock>
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence
          name="02 / Your working world"
          durationInFrames={600}
        >
          <EditorialClock>
            <WorkingWorld />
          </EditorialClock>
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence
          name="03 / A team, together"
          durationInFrames={500}
        >
          <EditorialClock>
            <Team />
          </EditorialClock>
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence
          name="04 / Build the missing piece"
          durationInFrames={600}
        >
          <EditorialClock>
            <Extend />
          </EditorialClock>
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence
          name="05 / Deliver, then repeat"
          durationInFrames={600}
        >
          <EditorialClock>
            <Delivery />
          </EditorialClock>
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence
          name="06 / Bring your AI"
          durationInFrames={400}
        >
          <EditorialClock>
            <YourAI />
          </EditorialClock>
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence
          name="07 / Make it yours"
          durationInFrames={500}
        >
          <EditorialClock>
            <Yours />
          </EditorialClock>
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
}
