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

// Coaching cues shown in-app: [setup/execution cues, most common mistake].
const FORM_CUES = {
  "Bench press": [["Eyes under the bar, shoulder blades squeezed and down", "Feet planted, slight arch, grip just outside shoulders", "Lower to mid-chest, elbows ~45°, press up and slightly back"], "Flaring elbows to 90° and bouncing the bar off your chest"],
  "Dumbbell bench press": [["Kick the dumbbells up off your knees as you lie back", "Shoulder blades pinned, wrists stacked over elbows", "Lower until a deep stretch, press up and slightly in"], "Letting the dumbbells drift too wide at the bottom"],
  "Incline bench press": [["Bench at 30–45°", "Bar touches upper chest, just under the collarbone", "Keep your shoulder blades back the whole set"], "Setting the bench too steep so it turns into a shoulder press"],
  "Incline dumbbell press": [["Bench at 30–45°", "Lower the dumbbells to upper-chest level", "Press up in a slight arc, don't clang them together"], "Shrugging your shoulders up toward your ears"],
  "Overhead press": [["Bar on front delts, grip just outside shoulders", "Squeeze glutes and brace your abs hard", "Press straight up, move your head back then through"], "Leaning way back and turning it into a standing incline press"],
  "Dumbbell shoulder press": [["Dumbbells at ear height, palms forward", "Ribs down, glutes tight", "Press up until arms are straight, don't lock hard"], "Arching the lower back to finish reps"],
  "Lateral raise": [["Slight bend in the elbows, lean a touch forward", "Lead with the elbows, raise to shoulder height", "Control the way down, 2–3 seconds"], "Swinging with momentum and going too heavy"],
  "Tricep pushdown": [["Elbows pinned to your sides", "Push down until arms are fully straight", "Only your forearms move"], "Letting elbows drift forward so your shoulders take over"],
  "Dips": [["Lean slightly forward for chest, upright for triceps", "Lower until shoulders are just below elbows", "Press up to full lockout"], "Dropping too deep with shrugged shoulders"],
  "Push-up": [["Hands under shoulders, body in one straight line", "Elbows ~45° from your body", "Chest touches the floor every rep"], "Hips sagging or piking up"],
  "Pull-up": [["Grip just wider than shoulders, start from a dead hang", "Pull your elbows down to your ribs", "Chin over the bar, lower all the way under control"], "Half reps and kipping to get the chin up"],
  "Chin-up": [["Palms facing you, shoulder-width grip", "Drive elbows down and back", "Full hang at the bottom of every rep"], "Craning the neck to reach the bar"],
  "Lat pulldown": [["Thighs locked under the pad", "Pull the bar to your upper chest", "Lean back slightly, squeeze lats at the bottom"], "Leaning way back and yanking with your lower back"],
  "Barbell row": [["Hinge to about 45°, flat back", "Pull the bar to your lower ribs", "Squeeze shoulder blades together at the top"], "Standing up more each rep to cheat the weight"],
  "Dumbbell row": [["One hand and knee on the bench, flat back", "Pull the dumbbell to your hip, not your chest", "Full stretch at the bottom"], "Twisting your torso to lift the weight"],
  "Seated cable row": [["Sit tall, slight knee bend", "Pull the handle to your belly button", "Squeeze, then let your shoulders reach forward"], "Rocking back and forth with your whole body"],
  "Face pull": [["Rope at face height, thumbs pointing back", "Pull toward your eyes, elbows high", "Pull the rope apart at the end"], "Going heavy and turning it into a row"],
  "Deadlift": [["Bar over mid-foot, shins touch the bar", "Hinge down, flat back, chest up, take the slack out", "Push the floor away, lock out with your glutes"], "Rounding your lower back and jerking the bar off the floor"],
  "Romanian deadlift": [["Soft knees, push your hips straight back", "Bar slides down your thighs, back stays flat", "Stop at a big hamstring stretch, drive hips forward"], "Bending the knees too much so it becomes a squat"],
  "Squat": [["Bar on upper traps, feet shoulder-width, toes slightly out", "Brace, sit down between your heels, knees track over toes", "Hit at least parallel, drive up through mid-foot"], "Heels lifting or knees caving inward"],
  "Front squat": [["Bar on front delts, elbows high", "Stay tall, sit straight down", "Drive elbows up as you stand"], "Elbows dropping so the bar rolls forward"],
  "Leg press": [["Feet shoulder-width, mid-platform", "Lower until knees are near your chest", "Press through your heels, don't lock knees hard"], "Lower back peeling off the seat at the bottom"],
  "Bulgarian split squat": [["Rear foot on bench, front foot far enough forward", "Drop straight down", "Push through the front heel"], "Front foot too close so the knee shoots forward"],
  "Lunge": [["Long step, torso tall", "Back knee drops toward the floor", "Push through the front heel to stand"], "Knee caving in on the front leg"],
  "Leg curl": [["Pad just above your heels", "Curl all the way, squeeze hamstrings", "Lower slowly"], "Hips lifting off the pad"],
  "Leg extension": [["Knee lined up with the machine's pivot", "Extend fully and squeeze quads", "Lower with control"], "Swinging the weight up with momentum"],
  "Hip thrust": [["Upper back on bench, bar over hips (use a pad)", "Chin tucked, drive through heels", "Lock out with glutes, ribs down"], "Arching the lower back at the top instead of using glutes"],
  "Calf raise": [["Balls of feet on the edge", "Full stretch at the bottom, pause", "Rise all the way up and squeeze"], "Bouncing fast with tiny reps"],
  "Bicep curl": [["Elbows pinned to your sides", "Curl up without swinging", "Lower slowly, full extension"], "Swinging your torso to lift the weight"],
  "Hammer curl": [["Palms face each other", "Elbows stay still", "Control the way down"], "Letting the elbows drift forward"],
  "Skull crusher": [["Arms angled slightly back toward your head", "Bend only at the elbows", "Lower to forehead or just behind"], "Elbows flaring out wide"],
  "Plank": [["Elbows under shoulders", "Squeeze glutes and abs, straight line", "Breathe, don't hold your breath"], "Hips sagging toward the floor"],
  "Hanging leg raise": [["Dead hang, shoulders active", "Curl your pelvis up, not just your legs", "Lower slowly without swinging"], "Swinging and using momentum"],
  "Shrug": [["Arms straight, stand tall", "Shrug straight up toward your ears", "Pause at the top"], "Rolling your shoulders in circles"],
};
const MUSCLE_CUES = {
  chest: [["Shoulder blades back and down", "Control the lowering phase", "Full range of motion"], "Bouncing the weight"],
  shoulders: [["Ribs down, glutes tight", "Press or raise under control", "Stop just short of locking out"], "Arching the lower back"],
  lats: [["Lead with your elbows", "Squeeze your back at the end", "Let your arms fully straighten"], "Pulling with just your arms"],
  quads: [["Brace your core", "Knees track over toes", "Full depth you can control"], "Knees caving in"],
  hamstrings: [["Hinge at the hips, flat back", "Feel the stretch", "Drive hips forward"], "Rounding the back"],
  glutes: [["Drive through your heels", "Squeeze glutes at the top", "Keep ribs down"], "Using your lower back instead"],
  biceps: [["Elbows still", "No swinging", "Slow on the way down"], "Using momentum"],
  triceps: [["Elbows still", "Full lockout", "Control the stretch"], "Elbows flaring"],
  abs: [["Brace like someone's about to poke you", "Move slowly", "Breathe out on the effort"], "Pulling on your neck"],
};
function formCues(name) {
  const k = Object.keys(FORM_CUES).find(x => x.toLowerCase() === name.toLowerCase());
  if (k) return FORM_CUES[k];
  const m = musclesFor(name)[0][0];
  return MUSCLE_CUES[m] || [["Set up in a stable position", "Move through a full range under control", "Stop 1–2 reps before your form breaks"], "Going too heavy too soon"];
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

function figure(shapes, colorOf) {
  const parts = shapes.map(([m, el]) => el.replace("/>", ` fill="${colorOf(m)}"><title>${MUSCLES[m]}</title></${el.match(/<(\w+)/)[1]}>`)).join("");
  return `<g fill="var(--body)">${SILHOUETTE}</g>${parts}<g transform="translate(120,0) scale(-1,1)">${parts}</g>`;
}

// colorOf(muscle) -> CSS color. Used for session coverage, weekly volume and recovery.
function colorMap(colorOf, small = false) {
  const h = small ? 110 : 230;
  return `<div class="bodymap">
    <div><svg viewBox="0 0 120 220" height="${h}" role="img" aria-label="Front muscles">${figure(FRONT, colorOf)}</svg>${small ? "" : `<div class="sub">Front</div>`}</div>
    <div><svg viewBox="0 0 120 220" height="${h}" role="img" aria-label="Back muscles">${figure(BACK, colorOf)}</svg>${small ? "" : `<div class="sub">Back</div>`}</div>
  </div>`;
}

function bodyMap(exercises, small = false) {
  const { primary, secondary } = coverage(exercises);
  return colorMap(m => primary.has(m) ? "var(--hit)" : secondary.has(m) ? "var(--hit2)" : "var(--idle)", small);
}

// Other exercises that train the same main muscle, for swapping mid-workout.
function alternatives(name) {
  const [p] = musclesFor(name);
  if (!p.length) return [];
  return Object.entries(EXERCISES)
    .filter(([n, [q]]) => n.toLowerCase() !== name.toLowerCase() && q.includes(p[0]))
    .sort((a, b) => b[1][0].filter(m => p.includes(m)).length - a[1][0].filter(m => p.includes(m)).length)
    .map(([n]) => n).slice(0, 8);
}

// What the weight is loaded on. Name keywords win; otherwise a best guess per exercise.
const EQUIP_GUESS = {
  "Lateral raise": "dumbbell", "Front raise": "dumbbell", "Rear delt fly": "dumbbell", "Arnold press": "dumbbell",
  "Bicep curl": "dumbbell", "Hammer curl": "dumbbell", "Incline dumbbell curl": "dumbbell", "Wrist curl": "dumbbell",
  "Lunge": "dumbbell", "Bulgarian split squat": "dumbbell", "Farmer's carry": "dumbbell", "Shrug": "dumbbell",
  "Overhead tricep extension": "dumbbell", "Preacher curl": "machine", "Calf raise": "machine",
  "Upright row": "barbell", "Hip thrust": "barbell", "Skull crusher": "barbell", "T-bar row": "barbell",
  "Russian twist": "bodyweight", "Back extension": "bodyweight",
};
function equipmentFor(name) {
  const n = name.toLowerCase();
  if (/dumb+bell|\bdb\b/.test(n)) return "dumbbell";
  if (/cable|pulldown|pushdown|face pull|crossover/.test(n)) return "cable";
  if (/machine|smith|leg press|leg extension|leg curl|pec deck|hack squat|seated row/.test(n)) return "machine";
  if (/barbell|\bbb\b|ez.?bar/.test(n)) return "barbell";
  if (/kettlebell|\bkb\b/.test(n)) return "dumbbell";
  if (/pull.?up|chin.?up|push.?up|\bdips?\b|plank|crunch|sit.?up|leg raise|bodyweight/.test(n)) return "bodyweight";
  const known = Object.keys(EQUIP_GUESS).find(k => k.toLowerCase() === n);
  if (known) return EQUIP_GUESS[known];
  if (/bench|squat|deadlift|overhead press|military|row|clean|snatch|good morning/.test(n)) return "barbell";
  if (/curl|raise|fly|kickback|extension/.test(n)) return "dumbbell";
  return "machine";
}

// Big multi-muscle lifts get longer rest than isolation moves.
function isCompound(name) {
  const [p, s] = musclesFor(name);
  return p.length + s.length >= 3;
}
const LOWER_BODY = ["quads", "hamstrings", "glutes"];
function isLowerBody(name) { return musclesFor(name)[0].some(m => LOWER_BODY.includes(m)); }

const PROGRAMS = [
  { name: "Push / Pull / Legs", about: "6 days, classic bodybuilding split", routines: [
    ["Push day", ["Bench press", "Overhead press", "Incline dumbbell press", "Lateral raise", "Tricep pushdown"]],
    ["Pull day", ["Deadlift", "Pull-up", "Barbell row", "Face pull", "Bicep curl"]],
    ["Leg day", ["Squat", "Romanian deadlift", "Leg press", "Leg curl", "Calf raise"]]] },
  { name: "Upper / Lower", about: "4 days, strength and size", routines: [
    ["Upper", ["Bench press", "Barbell row", "Overhead press", "Lat pulldown", "Bicep curl", "Tricep pushdown"]],
    ["Lower", ["Squat", "Romanian deadlift", "Leg press", "Leg curl", "Calf raise"]]] },
  { name: "Full body 3x", about: "3 days, great for beginners", routines: [
    ["Full body A", ["Squat", "Bench press", "Barbell row", "Plank"]],
    ["Full body B", ["Deadlift", "Overhead press", "Lat pulldown", "Lunge"]]] },
  { name: "StrongLifts 5x5", about: "3 days, pure strength", routines: [
    ["5x5 A", ["Squat", "Bench press", "Barbell row"]],
    ["5x5 B", ["Squat", "Overhead press", "Deadlift"]]] },
  { name: "Bro split", about: "5 days, one muscle group a day", routines: [
    ["Chest day", ["Bench press", "Incline dumbbell press", "Cable fly", "Dips"]],
    ["Back day", ["Deadlift", "Pull-up", "Seated cable row", "Straight-arm pulldown"]],
    ["Shoulder day", ["Overhead press", "Lateral raise", "Rear delt fly", "Shrug"]],
    ["Arm day", ["Close-grip bench press", "Bicep curl", "Skull crusher", "Hammer curl"]],
    ["Leg day", ["Squat", "Leg press", "Leg curl", "Leg extension", "Calf raise"]]] },
];
