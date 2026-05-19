import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Scene1Login } from "./scenes/Scene1Login";
import { Scene2CheckIn } from "./scenes/Scene2CheckIn";
import { Scene3Visit } from "./scenes/Scene3Visit";
import { Scene4Reminders } from "./scenes/Scene4Reminders";
import { Scene5CheckOut } from "./scenes/Scene5CheckOut";

// 5 scenes, 4 transitions of 20 frames each = -80 frames overlap
// 150 + 150 + 270 + 180 + 170 = 920, minus 80 = 840. Composition has 900 frames buffer.
export const MainVideo: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={150}><Scene1Login /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence durationInFrames={150}><Scene2CheckIn /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence durationInFrames={270}><Scene3Visit /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence durationInFrames={180}><Scene4Reminders /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence durationInFrames={170}><Scene5CheckOut /></TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
