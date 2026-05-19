// Generates Bengali narration MP3s per scene using ElevenLabs TTS.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../public/audio");
fs.mkdirSync(OUT_DIR, { recursive: true });

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) throw new Error("ELEVENLABS_API_KEY missing");

// Sarah - clear multilingual female voice
const VOICE_ID = "EXAVITQu4vr4xnSDxMaL";
const MODEL = "eleven_multilingual_v2";

// Bengali narration — designed for ~5 min total (≈300s).
const SCENES = [
  {
    id: "01-intro",
    text: "লাভিশো টাইম ট্র্যাকারে আপনাকে স্বাগতম। এই ভিডিওতে আমরা ধাপে ধাপে দেখবো কীভাবে আপনি প্রতিদিন এই সফটওয়্যারটি ব্যবহার করবেন — লগইন থেকে শুরু করে কাস্টমার, পার্টনার ও কনসালট্যান্ট যোগ করা, ভিজিট লগ করা, এবং ভয়েস-টু-টেক্সট দিয়ে দ্রুত নোট লেখা পর্যন্ত। চলুন শুরু করা যাক।",
  },
  {
    id: "02-login",
    text: "প্রথম ধাপ — লগইন। আপনার ব্রাউজারে lavishott.cloud ঠিকানায় যান। এরপর আপনার অফিসিয়াল ইমেইল ঠিকানা এবং পাসওয়ার্ড দিয়ে সাইন ইন করুন। যদি আপনার অ্যাকাউন্ট না থাকে, অনুগ্রহ করে আপনার অ্যাডমিনের সাথে যোগাযোগ করুন। লগইন করার পর আপনি স্বয়ংক্রিয়ভাবে পরবর্তী ধাপে চলে যাবেন।",
  },
  {
    id: "03-company",
    text: "দ্বিতীয় ধাপ — কোম্পানি নির্বাচন। লাভিশো গ্রুপের একাধিক কোম্পানি থাকতে পারে। তালিকা থেকে আপনি যে কোম্পানির হয়ে আজ কাজ করবেন সেটি বেছে নিন। একবার নির্বাচন করলে, পরবর্তী সব তথ্য ও ভিজিট সেই কোম্পানির অধীনে সংরক্ষিত হবে।",
  },
  {
    id: "04-dashboard",
    text: "তৃতীয় ধাপ — ড্যাশবোর্ড। এটি আপনার মূল কর্মক্ষেত্র। এখানে আপনি দেখতে পাবেন আজকের মোট ভিজিট, পরবর্তী ফলো-আপ, এবং চেক-ইন ও চেক-আউটের সময়। উপরের অংশে দৈনিক পরিসংখ্যান এবং নিচে আপনার সাম্প্রতিক কার্যকলাপ প্রদর্শিত হয়। বাম পাশের সাইডবার থেকে আপনি যেকোনো বিভাগে যেতে পারেন।",
  },
  {
    id: "05-contacts",
    text: "চতুর্থ ধাপ — কাস্টমার, পার্টনার এবং কনসালট্যান্ট পরিচালনা। বাম পাশের সাইডবার থেকে আপনি তিনটি আলাদা ট্যাব দেখতে পাবেন — Customers, Partners এবং Consultants। প্রতিটি বিভাগে আপনি আপনার সম্পর্কিত যোগাযোগ তালিকা দেখতে পারবেন। নতুন কেউ যোগ করতে চাইলে উপরের ডান কোণে থাকা Add বোতামে ক্লিক করুন।",
  },
  {
    id: "06-add-contact",
    text: "নতুন যোগাযোগ যোগ করা খুবই সহজ। একটি ছোট ফর্ম খুলবে যেখানে আপনি কোম্পানির নাম, যোগাযোগকারী ব্যক্তির নাম, ইমেইল ঠিকানা এবং ফোন নম্বর লিখবেন। সব তথ্য পূরণ হয়ে গেলে নিচে Save বোতামে ক্লিক করুন। সঙ্গে সঙ্গে আপনার তালিকায় নতুন এন্ট্রি যুক্ত হয়ে যাবে এবং আপনি সেটি ভিজিট লগ করার সময় ব্যবহার করতে পারবেন।",
  },
  {
    id: "07-visits",
    text: "পঞ্চম ধাপ — ভিজিট লগ করা। প্রতিটি কাস্টমার মিটিং বা সাইট ভিজিটের পর আপনাকে এখানে এন্ট্রি দিতে হবে। Visits পেজে গিয়ে উপরের ডান দিকে থাকা New Visit বোতামে ক্লিক করুন। একটি বিস্তারিত ফর্ম খুলবে যেখানে আপনি কাস্টমার, তারিখ, আলোচনার বিষয়বস্তু এবং পরবর্তী পদক্ষেপ লিখতে পারবেন।",
  },
  {
    id: "08-voice",
    text: "এখানে একটি বিশেষ সুবিধা আছে — ভয়েস-টু-টেক্সট বা কণ্ঠস্বর দিয়ে লেখা। Discussion, Next Action এবং Remarks — এই তিনটি ফিল্ডের পাশে আপনি একটি ছোট মাইক্রোফোন আইকনসহ Speak বোতাম দেখতে পাবেন। বোতামে ক্লিক করুন, ব্রাউজার আপনার মাইক্রোফোনের অনুমতি চাইবে — Allow চাপুন। এরপর বাংলা বা ইংরেজিতে স্বাভাবিকভাবে কথা বলুন, আপনার কথা স্বয়ংক্রিয়ভাবে টেক্সটে রূপান্তরিত হয়ে ফিল্ডে লেখা হবে। কথা শেষ হলে Stop চাপুন। এতে আপনার সময় বাঁচবে এবং হাত-মুক্তভাবে দ্রুত নোট নিতে পারবেন।",
  },
  {
    id: "09-checkin",
    text: "ষষ্ঠ ধাপ — চেক-ইন ও চেক-আউট। দিনের শুরুতে Check-in পেজে গিয়ে Check in now বোতামে এক ক্লিক করুন। সিস্টেম আপনার সময় ও অবস্থান রেকর্ড করবে। দিন শেষে একইভাবে Check out করুন। এর মাধ্যমে আপনার কর্মঘণ্টা স্বয়ংক্রিয়ভাবে হিসাব হয়ে যাবে।",
  },
  {
    id: "10-reminders",
    text: "সপ্তম ধাপ — রিমাইন্ডার। আপনি যখনই কোনো ভিজিটে Next Action তারিখ সেট করেন, সিস্টেম সেটিকে স্বয়ংক্রিয়ভাবে রিমাইন্ডারে যোগ করে। Reminders পেজে আপনি আগামী ফলো-আপগুলোর তালিকা দেখতে পাবেন, যাতে কোনো গুরুত্বপূর্ণ মিটিং আপনার চোখ এড়িয়ে না যায়।",
  },
  {
    id: "11-outro",
    text: "এই ছিল লাভিশো টাইম ট্র্যাকারের দৈনিক ব্যবহারের সম্পূর্ণ পরিচিতি। নিয়মিত লগইন করুন, ভিজিট লগ করুন, এবং ভয়েস ফিচার ব্যবহার করে আপনার কাজকে আরও দ্রুত ও সহজ করুন। ধন্যবাদ।",
  },
];

async function tts(text) {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.3, use_speaker_boost: true, speed: 1.0 },
      }),
    }
  );
  if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

const manifest = [];
for (const s of SCENES) {
  const file = path.join(OUT_DIR, `${s.id}.mp3`);
  if (!fs.existsSync(file)) {
    console.log("Generating", s.id);
    const buf = await tts(s.text);
    fs.writeFileSync(file, buf);
  } else {
    console.log("Cached", s.id);
  }
  manifest.push({ id: s.id, file: `audio/${s.id}.mp3` });
}
fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("Done. Files:", manifest.length);
