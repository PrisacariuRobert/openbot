import type { ReactNode } from "react";
import { CanvasImage, Interactive, staticFile, useCurrentFrame } from "remotion";
import { move } from "../launch/Motion";

/** Pixel-for-pixel captures of the shipping Studio. Only camera/editorial
 * layers are animated here; no marketing-only buttons or settings UI. */
export function Screen({ image, previous, children }: { image: string; previous?: string; children: ReactNode }) {
  const f = useCurrentFrame();
  return <>
    {previous && f < 42 && <CanvasImage src={staticFile(`actual-ui/${previous}.png`)} style={{position:"absolute",inset:0,width:1440,height:890}} />}
    <Interactive.Div name={`Actual app / ${image}`} style={{position:"absolute",inset:0,clipPath:previous ? `inset(0 0 0 ${move(f,0,42,100,0)}%)` : undefined}}>
      <CanvasImage src={staticFile(`actual-ui/${image}.png`)} style={{width:1440,height:890}} />
    </Interactive.Div>
    <Interactive.Div name="Feature / caption" style={{position:"fixed",left:0,top:0,display:"none"}}>{children}</Interactive.Div>
  </>;
}
