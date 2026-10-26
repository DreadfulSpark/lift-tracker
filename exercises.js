// Exercise library, muscle map and session suggestions.

const MUSCLES = {
  chest: "Chest", shoulders: "Front delts", rearDelts: "Rear delts", traps: "Traps",
  lats: "Lats", lowerBack: "Lower back", biceps: "Biceps", triceps: "Triceps",
  forearms: "Forearms", abs: "Abs", obliques: "Obliques", glutes: "Glutes",
  quads: "Quads", hamstrings: "Hamstrings", calves: "Calves",
};

// name: [primary muscles, secondary muscles]
const EXERCISES = {
  "Bench press": [["chest"], ["triceps", "shoulders"]],
  "Dumbbell bench press": [["chest"], ["triceps", "shoulders"]],
  "Incline bench press": [["chest", "shoulders"], ["triceps"]],
  "Incline dumbbell press": [["chest", "shoulders"], ["triceps"]],
  "Decline bench press": [["chest"], ["triceps"]],
  "Cable fly": [["chest"], ["shoulders"]],
  "Pec deck": [["chest"], []],
  "Push-up": [["chest"], ["triceps", "shoulders", "abs"]],
  "Dips": [["chest", "triceps"], ["shoulders"]],
  "Overhead press": [["shoulders"], ["triceps", "traps", "abs"]],
  "Dumbbell shoulder press": [["shoulders"], ["triceps", "traps"]],
  "Arnold press": [["shoulders"], ["triceps"]],
  "Lateral raise": [["shoulders"], ["traps"]],
  "Front raise": [["shoulders"], []],
  "Rear delt fly": [["rearDelts"], ["traps"]],
  "Face pull": [["rearDelts", "traps"], ["biceps"]],
  "Upright row": [["shoulders", "traps"], ["biceps"]],
  "Shrug": [["traps"], ["forearms"]],
  "Tricep pushdown": [["triceps"], []],
  "Skull crusher": [["triceps"], []],
  "Overhead tricep extension": [["triceps"], []],
  "Close-grip bench press": [["triceps", "chest"], ["shoulders"]],
  "Pull-up": [["lats"], ["biceps", "rearDelts", "forearms"]],
  "Chin-up": [["lats", "biceps"], ["forearms"]],
  "Lat pulldown": [["lats"], ["biceps", "rearDelts"]],
  "Barbell row": [["lats", "traps"], ["biceps", "rearDelts", "lowerBack"]],
  "Dumbbell row": [["lats"], ["biceps", "rearDelts", "traps"]],
  "Seated cable row": [["lats", "traps"], ["biceps", "rearDelts"]],
  "T-bar row": [["lats", "traps"], ["biceps", "rearDelts"]],
  "Straight-arm pulldown": [["lats"], ["triceps"]],
  "Deadlift": [["hamstrings", "glutes", "lowerBack"], ["traps", "forearms", "quads", "lats"]],
  "Romanian deadlift": [["hamstrings", "glutes"], ["lowerBack", "forearms"]],
  "Back extension": [["lowerBack"], ["glutes", "hamstrings"]],
  "Bicep curl": [["biceps"], ["forearms"]],
  "Hammer curl": [["biceps", "forearms"], []],
  "Preacher curl": [["biceps"], []],
  "Incline dumbbell curl": [["biceps"], []],
  "Wrist curl": [["forearms"], []],
  "Farmer's carry": [["forearms", "traps"], ["abs", "obliques"]],
  "Squat": [["quads", "glutes"], ["hamstrings", "lowerBack", "abs"]],
  "Front squat": [["quads"], ["glutes", "abs"]],
  "Leg press": [["quads", "glutes"], ["hamstrings"]],
  "Hack squat": [["quads"], ["glutes"]],
  "Bulgarian split squat": [["quads", "glutes"], ["hamstrings"]],
  "Lunge": [["quads", "glutes"], ["hamstrings", "calves"]],
  "Leg extension": [["quads"], []],
  "Leg curl": [["hamstrings"], ["calves"]],
  "Hip thrust": [["glutes"], ["hamstrings"]],
  "Calf raise": [["calves"], []],
  "Plank": [["abs"], ["obliques", "shoulders"]],
  "Crunch": [["abs"], []],
  "Hanging leg raise": [["abs"], ["obliques", "forearms"]],
  "Cable crunch": [["abs"], ["obliques"]],
  "Russian twist": [["obliques"], ["abs"]],
};

// For exercises not in the list, guess from words in the name.
const KEYWORDS = [
  [/leg curl|hamstring/, [["hamstrings"], []]],
  [/wrist|grip/, [["forearms"], []]],
  [/hammer/, [["biceps", "forearms"], []]],
  [/curl|bicep/, [["biceps"], ["forearms"]]],
  [/tricep|pushdown|skull|kickback/, [["triceps"], []]],
  [/calf|calves/, [["calves"], []]],
  [/squat|leg press|lunge|step.?up|quad/, [["quads", "glutes"], ["hamstrings"]]],
  [/glute|hip thrust|bridge|kickback/, [["glutes"], ["hamstrings"]]],
  [/deadlift|good morning/, [["hamstrings", "glutes", "lowerBack"], ["traps"]]],
  [/row/, [["lats", "traps"], ["biceps", "rearDelts"]]],
  [/pull.?up|chin|pulldown|lat/, [["lats"], ["biceps"]]],
  [/shrug|trap/, [["traps"], []]],
  [/rear delt|face pull|reverse fly/, [["rearDelts"], ["traps"]]],
  [/lateral|shoulder|overhead|military|delt|raise/, [["shoulders"], ["triceps"]]],
  [/bench|chest|fly|pec|push.?up|dip/, [["chest"], ["triceps", "shoulders"]]],
  [/ab|crunch|plank|sit.?up|core|leg raise/, [["abs"], ["obliques"]]],
  [/twist|oblique|woodchop/, [["obliques"], ["abs"]]],
  [/back extension|hyperextension|lower back/, [["lowerBack"], ["glutes"]]],
];

function musclesFor(name) {
  const known = Object.keys(EXERCISES).find(k => k.toLowerCase() === name.trim().toLowerCase());
  if (known) return EXERCISES[known];
  const n = name.toLowerCase();
  const hit = KEYWORDS.find(([re]) => re.test(n));
  return hit ? hit[1] : [[], []];
}

// What a session name suggests it should train.
const NAME_TARGETS = [
  [/push/, ["chest", "shoulders", "triceps"]],
  [/pull/, ["lats", "traps", "rearDelts", "biceps"]],
  [/leg|lower/, ["quads", "hamstrings", "glutes", "calves"]],
  [/upper/, ["chest", "lats", "shoulders", "biceps", "triceps"]],
  [/full|total|whole/, ["chest", "lats", "shoulders", "quads", "hamstrings", "abs"]],
  [/chest|pec/, ["chest"]],
  [/back/, ["lats", "traps", "rearDelts", "lowerBack"]],
  [/shoulder|delt/, ["shoulders", "rearDelts", "traps"]],
  [/arm/, ["biceps", "triceps", "forearms"]],
  [/\bbi(s|cep)?\b|bicep/, ["biceps"]],
  [/\btri(s|cep)?\b|tricep/, ["triceps"]],
  [/glute|booty|butt/, ["glutes", "hamstrings"]],
  [/quad/, ["quads"]],
  [/ham/, ["hamstrings"]],
  [/core|abs?\b/, ["abs", "obliques", "lowerBack"]],
];

// Muscles that pair well when the session name doesn't say what it's for.
const PARTNERS = {
  chest: ["triceps", "shoulders"], shoulders: ["triceps", "rearDelts"], triceps: ["chest"],
  lats: ["biceps", "rearDelts", "traps"], traps: ["rearDelts"], biceps: ["lats", "triceps"],
  quads: ["hamstrings", "glutes", "calves"], hamstrings: ["glutes", "quads"], glutes: ["hamstrings"],
  abs: ["obliques", "lowerBack"], rearDelts: ["traps"],
};

function targetsFromName(name) {
  const n = name.toLowerCase();
  return [...new Set(NAME_TARGETS.filter(([re]) => re.test(n)).flatMap(([, m]) => m))];
}

function coverage(exercises) {
  const primary = new Set(), secondary = new Set();
  exercises.forEach(e => {
    const [p, s] = musclesFor(e);
    p.forEach(m => primary.add(m));
    s.forEach(m => secondary.add(m));
  });
  return { primary, secondary };
}

// Returns { target, missing, picks: [{ name, why }] } for the routine editor.
function suggest(routineName, exercises) {
  const { primary, secondary } = coverage(exercises);
  let target = targetsFromName(routineName);
  const fromName = target.length > 0;
  if (!fromName) target = [...new Set([...primary].flatMap(m => [m, ...(PARTNERS[m] || [])]))];
  // A muscle only counts as trained if some exercise hits it directly.
  const missing = target.filter(m => !primary.has(m));
  const have = new Set(exercises.map(e => e.toLowerCase()));
  const picks = [];
  const add = (name, why) => {
    if (!have.has(name.toLowerCase()) && !picks.some(p => p.name === name)) picks.push({ name, why });
  };
  // Best isolated hit first: fewest primaries that still include the muscle.
  const byMuscle = m => Object.entries(EXERCISES)
    .filter(([, [p]]) => p.includes(m))
    .sort((a, b) => a[1][0].length - b[1][0].length + (b[1][1].length - a[1][1].length) * 0.01);

  if (missing.length) {
    missing.forEach(m => { const hit = byMuscle(m).find(([n]) => !have.has(n.toLowerCase())); if (hit) add(hit[0], `hits ${MUSCLES[m].toLowerCase()}`); });
  }
  if (fromName && exercises.length < 6) {
    // Big compound lifts that match the session name.
    Object.entries(EXERCISES)
      .map(([n, [p, s]]) => [n, p.filter(m => target.includes(m)).length * 2 + s.filter(m => target.includes(m)).length])
      .filter(([, score]) => score >= 2).sort((a, b) => b[1] - a[1])
      .forEach(([n]) => add(n, `fits ${routineName}`));
  }
  return { target, fromName, missing, picks: picks.slice(0, 6) };
}

// TikTok search for form videos. Opens the TikTok app on iPhone if installed.
function formLink(name) {
  return `https://www.tiktok.com/search?q=${encodeURIComponent(name + " proper form")}`;
}

// ---------- Body map ----------

// Shapes for the left half of the figure (mirrored for the right). Each is [muscle, svg element].
const FRONT = [
  ["traps", `<path d="M51 31 L59 29 L59 35 L47 37 Z"/>`],
  ["shoulders", `<ellipse cx="39" cy="44" rx="7.5" ry="8.5"/>`],
  ["chest", `<path d="M59 39 L47 39 Q40 45 44 56 Q52 61 59 57 Z"/>`],
  ["biceps", `<ellipse cx="34" cy="64" rx="4.8" ry="11"/>`],
  ["forearms", `<path d="M31 77 Q25 88 27 102 L32 102 Q36 90 35 77 Z"/>`],
  ["abs", `<rect x="52.5" y="61" width="6.5" height="40" rx="3"/>`],
  ["obliques", `<path d="M50.5 61 L45 63 Q43 82 48 100 L50.5 101 Z"/>`],
  ["quads", `<path d="M58 112 Q46 108 43 120 Q41 145 47 162 L56 162 Q59 140 58 112 Z"/>`],
  ["calves", `<path d="M46 172 Q42 190 45 210 L50 210 Q53 190 51 172 Z"/>`],
];
const BACK = [
  ["traps", `<path d="M59 27 L47 36 L59 62 Z"/>`],
  ["rearDelts", `<ellipse cx="39" cy="44" rx="7.5" ry="8.5"/>`],
  ["lats", `<path d="M58 62 L46 44 Q39 60 47 86 L58 92 Z"/>`],
  ["triceps", `<ellipse cx="34" cy="64" rx="4.8" ry="11"/>`],
  ["forearms", `<path d="M31 77 Q25 88 27 102 L32 102 Q36 90 35 77 Z"/>`],
  ["lowerBack", `<rect x="52" y="90" width="7" height="16" rx="2"/>`],
  ["glutes", `<ellipse cx="51" cy="117" rx="8.5" ry="10"/>`],
  ["hamstrings", `<path d="M57 128 Q46 126 44 136 Q43 152 47 164 L56 164 Q59 146 57 128 Z"/>`],
  ["calves", `<path d="M45 170 Q40 186 45 206 L51 206 Q55 186 51 170 Z"/>`],
];
const SILHOUETTE = `
  <circle cx="60" cy="15" r="10"/>
  <rect x="55" y="23" width="10" height="8" rx="3"/>
  <path d="M42 33 Q60 26 78 33 L84 40 L86 58 L80 100 L80 112 Q70 120 60 118 Q50 120 40 112 L40 100 L34 58 L36 40 Z"/>
  <path d="M33 40 Q26 60 28 78 Q22 92 25 106 L33 106 Q37 92 38 78 L40 52 Z"/>
  <path d="M87 40 Q94 60 92 78 Q98 92 95 106 L87 106 Q83 92 82 78 L80 52 Z"/>
  <path d="M40 110 Q40 140 45 166 Q40 190 44 214 L52 214 Q56 190 54 166 Q59 140 59 118 Z"/>
  <path d="M80 110 Q80 140 75 166 Q80 190 76 214 L68 214 Q64 190 66 166 Q61 140 61 118 Z"/>`;

function figure(shapes, primary, secondary) {
  const fill = m => primary.has(m) ? "var(--hit)" : secondary.has(m) ? "var(--hit2)" : "var(--idle)";
  const parts = shapes.map(([m, el]) => el.replace("/>", ` fill="${fill(m)}"><title>${MUSCLES[m]}</title></${el.match(/<(\w+)/)[1]}>`)).join("");
  return `<g fill="var(--body)">${SILHOUETTE}</g>${parts}<g transform="translate(120,0) scale(-1,1)">${parts}</g>`;
}

function bodyMap(exercises, small = false) {
  const { primary, secondary } = coverage(exercises);
  const h = small ? 110 : 230;
  return `<div class="bodymap">
    <div><svg viewBox="0 0 120 220" height="${h}" role="img" aria-label="Front muscles">${figure(FRONT, primary, secondary)}</svg>${small ? "" : `<div class="sub">Front</div>`}</div>
    <div><svg viewBox="0 0 120 220" height="${h}" role="img" aria-label="Back muscles">${figure(BACK, primary, secondary)}</svg>${small ? "" : `<div class="sub">Back</div>`}</div>
  </div>`;
}
