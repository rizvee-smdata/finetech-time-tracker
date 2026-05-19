import React from "react";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Title } from "./components/Title";
import { Screenshot } from "./components/Screenshot";

const F = (sec: number) => Math.round(sec * 30);

// Durations (seconds): 2 + 2.5 + 2 + 3 + 2.5 + 3 + 2.5 + 3.5 + 3 + 2.5 + 2 = 28.5s
// Each transition fades 15 frames; total composition handles overlap.
export const MainVideo: React.FC = () => {
  return (
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={F(2)}>
        <Title headline="Lavisho Time Tracker" tagline="Your daily walkthrough" />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />

      <TransitionSeries.Sequence durationInFrames={F(2.5)}>
        <Screenshot
          src="images/login.png"
          step="STEP 1"
          title="Sign in"
          subtitle="Open lavishott.cloud and log in with your work email."
          highlights={[{ x: 0.36, y: 0.34, w: 0.28, h: 0.32, label: "Enter email & password" }]}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 15 })} />

      <TransitionSeries.Sequence durationInFrames={F(2)}>
        <Screenshot
          src="images/company.png"
          step="STEP 2"
          title="Pick your company"
          subtitle="Choose the Lavisho Group company you want to work in."
          highlights={[{ x: 0.36, y: 0.51, w: 0.28, h: 0.08, label: "Select company" }]}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 15 })} />

      <TransitionSeries.Sequence durationInFrames={F(3)}>
        <Screenshot
          src="images/dashboard.png"
          step="STEP 3"
          title="Your dashboard"
          subtitle="Today's visits, follow-ups and time clock — all in one view."
          highlights={[
            { x: 0.21, y: 0.16, w: 0.66, h: 0.21, label: "Daily stats" },
          ]}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 15 })} />

      <TransitionSeries.Sequence durationInFrames={F(2.5)}>
        <Screenshot
          src="images/partners.png"
          step="STEP 4"
          title="Customers, Partners & Consultants"
          subtitle="Use the sidebar to manage your network."
          highlights={[
            { x: 0.02, y: 0.31, w: 0.16, h: 0.12, label: "Sidebar tabs" },
            { x: 0.87, y: 0.06, w: 0.12, h: 0.06, label: "Add new" },
          ]}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />

      <TransitionSeries.Sequence durationInFrames={F(3)}>
        <Screenshot
          src="images/add-partner.png"
          step="STEP 4"
          title="Add a contact in seconds"
          subtitle="Name, contact person, email and phone — then Save."
          highlights={[{ x: 0.32, y: 0.26, w: 0.36, h: 0.45, label: "Fill & save" }]}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 15 })} />

      <TransitionSeries.Sequence durationInFrames={F(2.5)}>
        <Screenshot
          src="images/visits.png"
          step="STEP 5"
          title="Log a visit"
          subtitle='Tap "New visit" after every customer meeting.'
          highlights={[{ x: 0.87, y: 0.05, w: 0.11, h: 0.07, label: "New visit" }]}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 15 })} />

      <TransitionSeries.Sequence durationInFrames={F(3.5)}>
        <Screenshot
          src="images/visit-form-voice.png"
          step="STEP 5"
          title="Speak instead of typing"
          subtitle="Tap Speak on Discussion, Next action and Remarks to dictate hands-free."
          highlights={[
            { x: 0.79, y: 0.34, w: 0.07, h: 0.06, label: "🎙 Speak" },
            { x: 0.79, y: 0.54, w: 0.07, h: 0.06 },
            { x: 0.79, y: 0.73, w: 0.07, h: 0.06 },
          ]}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 15 })} />

      <TransitionSeries.Sequence durationInFrames={F(2.5)}>
        <Screenshot
          src="images/checkin.png"
          step="STEP 6"
          title="Check in for the day"
          subtitle="One tap to start the clock — and again to check out."
          highlights={[{ x: 0.51, y: 0.34, w: 0.19, h: 0.08, label: "Check in now" }]}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: "from-right" })} timing={linearTiming({ durationInFrames: 15 })} />

      <TransitionSeries.Sequence durationInFrames={F(2.5)}>
        <Screenshot
          src="images/reminders.png"
          step="STEP 7"
          title="Never miss a follow-up"
          subtitle="Reminders appear automatically before scheduled meetings."
          highlights={[{ x: 0.31, y: 0.16, w: 0.56, h: 0.13, label: "Upcoming follow-ups" }]}
        />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: 15 })} />

      <TransitionSeries.Sequence durationInFrames={F(2)}>
        <Title headline="lavishott.cloud" tagline="Field activity & visit reporting" />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  );
};
