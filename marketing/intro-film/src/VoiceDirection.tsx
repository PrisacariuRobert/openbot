import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { CharacterShot } from "./voice-test/01-Character";
import { RequestShot } from "./voice-test/02-Request";
import { ApprovalShot } from "./voice-test/03-Approval";
import { ToolShot } from "./voice-test/04-Tool";
import { VoiceSignature } from "./voice-test/05-Signature";

// A direction test, not an application recording. Timing follows the locally
// transcribed Aiden sample. No Apple footage, soundtrack, or voice imitation.
export const VoiceDirection = () => (
  <AbsoluteFill>
    <Audio src={staticFile("audio/voice-direction-bed.wav")} volume={0.36} />
    <Sequence from={24} layout="none" name="Aiden — local voice audition">
      <Audio
        src={staticFile(
          "audio/voice/self-extension-direction-e1d58d043e6da640.wav",
        )}
        volume={1}
      />
    </Sequence>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={126} name="Meet the team">
        <CharacterShot />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={123} name="One request">
        <RequestShot />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        durationInFrames={132}
        name="Review and approve"
      >
        <ApprovalShot />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence
        durationInFrames={177}
        name="Same task, a new tool"
      >
        <ToolShot />
      </TransitionSeries.Sequence>
      <TransitionSeries.Sequence durationInFrames={102} name="Built around you">
        <VoiceSignature />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
