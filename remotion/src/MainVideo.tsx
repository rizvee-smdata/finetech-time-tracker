import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Scene1Login } from "./scenes/Scene1Login";
import { Scene2CheckIn } from "./scenes/Scene2CheckIn";
import { Scene2bContacts } from "./scenes/Scene2bContacts";
import { Scene3Visit } from "./scenes/Scene3Visit";
import { Scene4Reminders } from "./scenes/Scene4Reminders";
import { Scene5CheckOut } from "./scenes/Scene5CheckOut";

// Durations: 150 + 150 + 240 + 320 + 180 + 170 = 1210
// 5 transitions × 20 = -100 overlap → 1110 effective frames
export const MainVideo: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={150}><Scene1Login /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence durationInFrames={150}><Scene2CheckIn /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence durationInFrames={240}><Scene2bContacts /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence durationInFrames={320}><Scene3Visit /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence durationInFrames={180}><Scene4Reminders /></TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 20 })} />
      <TransitionSeries.Sequence durationInFrames={170}><Scene5CheckOut /></TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
