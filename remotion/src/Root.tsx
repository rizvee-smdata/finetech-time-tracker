import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";

export const RemotionRoot = () => (
  <Composition
    id="main"
    component={MainVideo}
    durationInFrames={1110}
    fps={30}
    width={1920}
    height={1080}
  />
);
