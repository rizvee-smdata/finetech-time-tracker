import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { Title } from "./components/Title";
import { Screenshot } from "./components/Screenshot";

const FPS = 30;
const F = (sec: number) => Math.round(sec * FPS);

type Scene = {
  audio: string;
  duration: number; // frames
  render: () => React.ReactNode;
};

const scenes: Scene[] = [
  {
    audio: "audio/01-intro.mp3",
    duration: F(26.2),
    render: () => (
      <Title headline="Lavisho Time Tracker" tagline="আপনার দৈনিক কাজের সঙ্গী" />
    ),
  },
  {
    audio: "audio/02-login.mp3",
    duration: F(27.5),
    render: () => (
      <Screenshot
        src="images/login.png"
        step="ধাপ ১"
        title="লগ ইন করুন"
        subtitle="lavishott.cloud খুলে আপনার অফিস ইমেইল দিয়ে সাইন ইন করুন।"
        highlights={[{ x: 0.36, y: 0.34, w: 0.28, h: 0.32, label: "ইমেইল ও পাসওয়ার্ড" }]}
      />
    ),
  },
  {
    audio: "audio/03-company.mp3",
    duration: F(22.4),
    render: () => (
      <Screenshot
        src="images/company.png"
        step="ধাপ ২"
        title="কোম্পানি নির্বাচন করুন"
        subtitle="Lavisho Group-এর যে কোম্পানিতে কাজ করবেন সেটি বেছে নিন।"
        highlights={[{ x: 0.36, y: 0.51, w: 0.28, h: 0.08, label: "কোম্পানি" }]}
      />
    ),
  },
  {
    audio: "audio/04-dashboard.mp3",
    duration: F(28),
    render: () => (
      <Screenshot
        src="images/dashboard.png"
        step="ধাপ ৩"
        title="আপনার ড্যাশবোর্ড"
        subtitle="আজকের ভিজিট, ফলো-আপ এবং টাইম ক্লক — সব এক জায়গায়।"
        highlights={[{ x: 0.21, y: 0.16, w: 0.66, h: 0.21, label: "দৈনিক পরিসংখ্যান" }]}
      />
    ),
  },
  {
    audio: "audio/05-contacts.mp3",
    duration: F(24),
    render: () => (
      <Screenshot
        src="images/partners.png"
        step="ধাপ ৪"
        title="কাস্টমার, পার্টনার ও কনসালট্যান্ট"
        subtitle="সাইডবার থেকে আপনার সব যোগাযোগ ম্যানেজ করুন।"
        highlights={[
          { x: 0.02, y: 0.31, w: 0.16, h: 0.12, label: "সাইডবার" },
          { x: 0.87, y: 0.06, w: 0.12, h: 0.06, label: "নতুন যোগ করুন" },
        ]}
      />
    ),
  },
  {
    audio: "audio/06-add-contact.mp3",
    duration: F(39),
    render: () => (
      <Screenshot
        src="images/add-partner.png"
        step="ধাপ ৪"
        title="নতুন কন্টাক্ট যোগ করুন"
        subtitle="নাম, যোগাযোগ ব্যক্তি, ইমেইল ও ফোন দিয়ে Save চাপুন।"
        highlights={[{ x: 0.32, y: 0.26, w: 0.36, h: 0.45, label: "তথ্য পূরণ করে সেভ করুন" }]}
      />
    ),
  },
  {
    audio: "audio/07-visits.mp3",
    duration: F(21),
    render: () => (
      <Screenshot
        src="images/visits.png"
        step="ধাপ ৫"
        title="ভিজিট লগ করুন"
        subtitle="প্রতিটি কাস্টমার মিটিং শেষে 'New visit' চাপুন।"
        highlights={[{ x: 0.87, y: 0.05, w: 0.11, h: 0.07, label: "New visit" }]}
      />
    ),
  },
  {
    audio: "audio/08-voice.mp3",
    duration: F(38),
    render: () => (
      <Screenshot
        src="images/visit-form-voice.png"
        step="ধাপ ৫"
        title="টাইপ না করে কথা বলুন"
        subtitle="Discussion, Next action ও Remarks-এ Speak বোতাম চেপে বাংলায় বলুন।"
        highlights={[
          { x: 0.79, y: 0.34, w: 0.07, h: 0.06, label: "🎙 Speak" },
          { x: 0.79, y: 0.54, w: 0.07, h: 0.06 },
          { x: 0.79, y: 0.73, w: 0.07, h: 0.06 },
        ]}
      />
    ),
  },
  {
    audio: "audio/09-checkin.mp3",
    duration: F(19),
    render: () => (
      <Screenshot
        src="images/checkin.png"
        step="ধাপ ৬"
        title="দিন শুরুর চেক-ইন"
        subtitle="এক ট্যাপে ক্লক শুরু — দিন শেষে আবার ট্যাপ করে চেক-আউট।"
        highlights={[{ x: 0.51, y: 0.34, w: 0.19, h: 0.08, label: "Check in" }]}
      />
    ),
  },
  {
    audio: "audio/10-reminders.mp3",
    duration: F(20),
    render: () => (
      <Screenshot
        src="images/reminders.png"
        step="ধাপ ৭"
        title="ফলো-আপ মিস হবে না"
        subtitle="শিডিউল করা মিটিং-এর আগে স্বয়ংক্রিয় রিমাইন্ডার পাবেন।"
        highlights={[{ x: 0.31, y: 0.16, w: 0.56, h: 0.13, label: "আসন্ন ফলো-আপ" }]}
      />
    ),
  },
  {
    audio: "audio/11-outro.mp3",
    duration: F(14),
    render: () => (
      <Title headline="lavishott.cloud" tagline="ফিল্ড একটিভিটি ও ভিজিট রিপোর্টিং" />
    ),
  },
];

export const MainVideo: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill>
      {scenes.map((scene, i) => {
        const start = from;
        from += scene.duration;
        return (
          <Sequence key={i} from={start} durationInFrames={scene.duration}>
            <AbsoluteFill>{scene.render()}</AbsoluteFill>
            <Audio src={staticFile(scene.audio)} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
