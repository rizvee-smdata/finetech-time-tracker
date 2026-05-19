import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadSora } from "@remotion/google-fonts/Sora";

export const inter = loadInter("normal", { weights: ["400", "500", "600"], subsets: ["latin"] }).fontFamily;
export const sora = loadSora("normal", { weights: ["600", "700", "800"], subsets: ["latin"] }).fontFamily;

export const C = {
  bg: "#0B1020",
  bg2: "#141A33",
  card: "#1B2347",
  line: "#2A3566",
  text: "#EAF0FF",
  sub: "#9AA6D2",
  primary: "#5B8CFF",
  accent: "#22D3A0",
  warn: "#F6A623",
};
