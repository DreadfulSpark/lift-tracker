// White-label settings. A gym edits this one file (plus manifest.json and the icons) to make the app theirs.
const BRAND = {
  name: "Lift Tracker",
  accent: "teal",               // a preset (teal, fire, violet, ice, rose) or your own hex, e.g. "#e11d48"
  logo: null,                   // image shown at the top of Home instead of the name, e.g. "logo.png"
  game: true,                   // false = XP, levels, badges and challenges start switched off
  // Programs the gym wants every member to see first, same shape as PROGRAMS in exercises.js:
  // { name, about, routines: [["Day name", ["Exercise", ...]], ...] }
  programs: [],
  // Optional coach-approved form clips that play inside the app: { "Bench press": "videos/bench.mp4" }
  videos: {},
};
