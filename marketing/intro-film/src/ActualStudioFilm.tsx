import { Audio } from "@remotion/media";
import { AbsoluteFill, Easing, Interactive, interpolate, Sequence, staticFile, useCurrentFrame } from "remotion";
import { ActualConversation } from "./actual/01-Conversation";
import { ActualDay } from "./actual/02-Day";
import { ActualBuild } from "./actual/03-Build";
import { ActualExtend } from "./actual/04-Extend";
import { ActualRoutines } from "./actual/05-Routines";
import { ActualAccounts } from "./actual/06-Accounts";
import { ActualAPI } from "./actual/07-API";
import { ActualModels } from "./actual/08-Models";
import { ActualYours } from "./actual/09-Yours";
import { Mascot } from "./launch/Product";
import { move } from "./launch/Motion";

const cuts = [0, 720, 1260, 1800, 2340, 2880, 3240, 3540, 3840, 4080];
const copy = ["Start with a conversation.", "A little less on your mind.", "From a question to a change.", "Build the missing piece. With your okay.", "Give good work a rhythm.", "Bring your subscriptions.", "Or an API. Or a local model.", "The right model for each teammate.", "Create a team that feels like yours."];
export function ActualStudioFilm() {
  const f = useCurrentFrame();
  const chapter = cuts.reduce((last, start, index) => f >= start ? index : last, 0);
  const local = f - cuts[chapter]!;
  return <AbsoluteFill style={{background:"#fafafa",fontFamily:"Inter",color:"#202020",overflow:"hidden"}}>
    <Audio src={staticFile("audio/openbot-launch-choice.wav")} />
    <Interactive.Div name="One continuous camera / real Studio" style={{
      position:"absolute",left:240,top:35,width:1440,height:890,borderRadius:18,overflow:"hidden",border:"1px solid #dedede",boxShadow:"0 22px 70px #00000012",transformOrigin:"center top",
      scale:interpolate(f,[0,160,650,850,1750,1950,2850,3070,3500,3700,4020,4140],[.74,.89,.93,.89,.93,1.02,.9,1.04,1.04,1.01,.94,.70],{extrapolateRight:"clamp",easing:Easing.bezier(.4,0,.2,1)}),
      translate:interpolate(f,[0,650,850,1750,1950,2800,3070,3500,4020,4140],["0px 100px","-35px 0px","0px 0px","-35px 0px","-150px -15px","-150px -15px","-160px -20px","-160px -20px","-110px -30px","0px 0px"],{extrapolateRight:"clamp",easing:Easing.bezier(.4,0,.2,1)}),
      opacity:move(f,4080,4170,1,0),
    }}>
      <Sequence from={0} durationInFrames={720} name="Conversation"><ActualConversation /></Sequence>
      <Sequence from={720} durationInFrames={540} name="Personal assistance"><ActualDay /></Sequence>
      <Sequence from={1260} durationInFrames={540} name="Project work"><ActualBuild /></Sequence>
      <Sequence from={1800} durationInFrames={540} name="Self-extending studio"><ActualExtend /></Sequence>
      <Sequence from={2340} durationInFrames={540} name="Routines"><ActualRoutines /></Sequence>
      <Sequence from={2880} durationInFrames={360} name="Your subscriptions"><ActualAccounts /></Sequence>
      <Sequence from={3240} durationInFrames={300} name="API and local models"><ActualAPI /></Sequence>
      <Sequence from={3540} durationInFrames={300} name="Models by teammate"><ActualModels /></Sequence>
      <Sequence from={3840} durationInFrames={480} name="Make it yours"><ActualYours /></Sequence>
    </Interactive.Div>
    {chapter < 9 && <Interactive.Div name="Editorial / current feature" style={{position:"absolute",left:130,right:130,bottom:72,fontSize:59,fontWeight:570,letterSpacing:"-.045em",lineHeight:1.06,opacity:move(local,48,82)*move(f,cuts[chapter+1]!-30,cuts[chapter+1]!,1,0),translate:`0 ${move(local,48,88,24,0)}px`}}>{copy[chapter]}</Interactive.Div>}
    <div style={{position:"absolute",left:134,bottom:34,color:"#717171",fontSize:17,opacity:move(f,4060,4130,1,0)}}>Actual OpenBot interface · sample workspace{f >= 2880 && f < 3840 ? " · Supported plans and models. Provider terms and limits apply." : ""}</div>
    <Interactive.Div name="OpenBot / living identities" style={{position:"absolute",left:1420,top:865,display:"flex",gap:8,opacity:move(f,0,80)*move(f,4020,4080,1,0)}}>
      <Mascot name="Nova" frame={f} size={82} id="actual-nova" /><Mascot name="Pixel" frame={f+45} size={82} id="actual-pixel" /><Mascot name="Scout" frame={f+90} size={82} id="actual-scout" />
    </Interactive.Div>
    <Interactive.Div name="Closing / open possibilities" style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:30,opacity:move(f,4090,4160),scale:move(f,4090,4250,.9,1)}}>
      <div style={{display:"flex",gap:18}}><Mascot name="Nova" frame={f} size={130} id="end-nova" /><Mascot name="Pixel" frame={f+55} size={130} id="end-pixel" /><Mascot name="Scout" frame={f+105} size={130} id="end-scout" /></div>
      <div style={{fontSize:104,fontWeight:590,letterSpacing:"-.06em"}}>OpenBot.</div>
      <div style={{fontSize:35,color:"#777"}}>Open source. A little more possible.</div>
    </Interactive.Div>
  </AbsoluteFill>;
}
