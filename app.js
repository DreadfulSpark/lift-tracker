// Lift Tracker: all data lives in this phone's browser storage (localStorage).

const KEY = "lift-tracker-v1";
const DEFAULT = {
  routines: [
    { id: 1, name: "Push day", exercises: ["Bench press", "Overhead press", "Incline dumbbell press", "Tricep pushdown"] },
    { id: 2, name: "Pull day", exercises: ["Deadlift", "Pull-up", "Barbell row", "Bicep curl"] },
    { id: 3, name: "Leg day", exercises: ["Squat", "Romanian deadlift", "Leg press", "Calf raise"] },
  ],
  workouts: [],   // finished: { id, date, routine, minutes, sets: [{ ex, w, r }] }
  active: null,   // in progress: { routine, start, exercises: [{ name, open, sets: [{ w, r, done, warm, pr }] }] }
  nextRoutine: 0,
  notes: {},      // exercise name -> your own cues ("seat on 4")
  bodyweight: [], // [{ d, v }]
  badges: {},     // badge id -> date unlocked
  challenges: {}, // date string -> true when the daily challenge was beaten
  summary: null,  // last finished workout recap
  xp: null,       // null = work it out from history on first load
  settings: { rest: "auto", unit: "lb", weeklyGoal: 4, sound: true, accent: "teal" },
};

let state = load();
let tab = state.active ? "workout" : "home";
let progressEx = null;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    return { ...structuredClone(DEFAULT), ...s, settings: { ...DEFAULT.settings, ...s?.settings } };
  } catch { return structuredClone(DEFAULT); }
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const oneRM = (w, r) => w * (1 + r / 30); // Epley estimate
const fmtDate = d => new Date(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const unit = () => state.settings.unit;
const DAY = 86400000;
const round = (w, step) => Math.round(w / step) * step;
const incStep = () => unit() === "kg" ? 2.5 : 5;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

// ---------- Themes ----------

const ACCENTS = {
  teal:   { name: "Teal",   a: "#2fbf8f", d: "#04342c", h2: "#2f7f68", low: "#2d4a41" },
  fire:   { name: "Fire",   a: "#ff7a2f", d: "#3d1703", h2: "#a8521f", low: "#4a3020" },
  violet: { name: "Violet", a: "#9b7bff", d: "#1f1450", h2: "#6450b0", low: "#352d55" },
  ice:    { name: "Ice",    a: "#4fb7ff", d: "#06294a", h2: "#2f74a8", low: "#24384a" },
  rose:   { name: "Rose",   a: "#ff5c8a", d: "#4a0b1f", h2: "#a83a5a", low: "#4a2633" },
};
function applyTheme() {
  const t = ACCENTS[state.settings.accent] || ACCENTS.teal, r = document.documentElement.style;
  r.setProperty("--accent", t.a); r.setProperty("--accent-dark", t.d);
  r.setProperty("--hit", t.a); r.setProperty("--hit2", t.h2); r.setProperty("--low", t.low);
}

// ---------- XP and levels ----------

const XP = { set: 10, pr: 100, workout: 50, challenge: 75 };
const RANKS = ["Rookie", "Iron", "Bronze", "Silver", "Gold", "Platinum", "Diamond", "Titan"];
// Level n needs 100 * n(n-1)/2 total XP: 0, 100, 300, 600...
const levelOf = xp => Math.floor((1 + Math.sqrt(1 + 8 * xp / 100)) / 2);
const xpAt = lvl => 100 * lvl * (lvl - 1) / 2;
const rankOf = lvl => RANKS[Math.min(RANKS.length - 1, Math.floor((lvl - 1) / 5))];

function addXP(n) {
  const before = levelOf(state.xp);
  state.xp += n;
  const after = levelOf(state.xp);
  if (after > before) setTimeout(() => showLevelUp(after), 400);
}

function showLevelUp(lvl) {
  $("#levelup-num").textContent = lvl;
  $("#levelup-rank").textContent = `${rankOf(lvl)} rank`;
  $("#levelup").classList.remove("hidden");
  sfx("level");
}

function levelCard() {
  const lvl = levelOf(state.xp), lo = xpAt(lvl), hi = xpAt(lvl + 1);
  const pct = (state.xp - lo) / (hi - lo) * 100;
  return `<div class="card level">
    <div class="level-badge"><b>${lvl}</b></div>
    <div style="flex:1">
      <div class="row between"><b>${rankOf(lvl)} lifter</b><span class="sub">${state.xp - lo} / ${hi - lo} XP</span></div>
      <div class="xpbar"><i style="width:${pct}%"></i></div>
    </div>
  </div>`;
}

// ---------- Daily challenge ----------

const CHALLENGES = [
  { text: "Log 15 working sets", test: s => s.sets >= 15 },
  { text: "Set a new personal record", test: s => s.prs.length > 0 },
  { text: "Finish a workout in under 50 minutes", test: s => s.minutes < 50 },
  { text: "Move 8,000 total weight", test: s => s.volume >= 8000 },
  { text: "Do a warm-up before your first lift", test: s => s.warmups > 0 },
  { text: "Train 4+ different exercises", test: s => s.exercises.length >= 4 },
  { text: "Beat your volume from last time", test: s => s.lastVolume > 0 && s.volume > s.lastVolume },
  { text: "Log 20 working sets", test: s => s.sets >= 20 },
];
const todayKey = () => new Date().toDateString();
function todaysChallenge() {
  const d = new Date(), seed = d.getFullYear() * 400 + d.getMonth() * 31 + d.getDate();
  return CHALLENGES[seed % CHALLENGES.length];
}

// ---------- Stats helpers ----------

function lastSetsFor(ex) {
  for (let i = state.workouts.length - 1; i >= 0; i--) {
    const sets = state.workouts[i].sets.filter(s => s.ex === ex);
    if (sets.length) return sets;
  }
  return [];
}

function sessionsFor(ex, n = 5) {
  return state.workouts.filter(w => w.sets.some(s => s.ex === ex)).slice(-n).reverse()
    .map(w => ({ date: w.date, sets: w.sets.filter(s => s.ex === ex) }));
}

function bestFor(ex) {
  let best = 0;
  for (const w of state.workouts) for (const s of w.sets) if (s.ex === ex) best = Math.max(best, oneRM(s.w, s.r));
  return best;
}

function lastVolumeFor(routine) {
  const w = state.workouts.filter(x => x.routine === routine).at(-1);
  return w ? w.sets.reduce((t, s) => t + s.w * s.r, 0) : 0;
}

function streakDays() {
  const days = new Set(state.workouts.map(w => new Date(w.date).toDateString()));
  let n = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1); // today not done yet doesn't break it
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function weekStart(offset = 0) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay() - offset * 7); return d; }

function weekStats(offset = 0) {
  const from = weekStart(offset), to = offset ? weekStart(offset - 1) : new Date(8.64e15);
  const ws = state.workouts.filter(w => w.date >= from && w.date < to);
  return { count: ws.length, vol: ws.reduce((t, w) => t + w.sets.reduce((a, s) => a + s.w * s.r, 0), 0), sets: ws.reduce((t, w) => t + w.sets.length, 0) };
}
const thisWeek = () => weekStats(0);

const shortNum = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(Math.round(n));

// Progressive overload coach: hit 8+ reps on every set last time -> add weight, else chase reps.
const REP_GOAL = 8;
function coach(ex) {
  const last = lastSetsFor(ex);
  if (!last.length || equipmentFor(ex) === "bodyweight" && last.every(s => !s.w)) return null;
  const top = Math.max(...last.map(s => s.w));
  const topSets = last.filter(s => s.w === top);
  if (topSets.every(s => s.r >= REP_GOAL)) {
    const bump = incStep() * (isLowerBody(ex) && equipmentFor(ex) === "barbell" ? 2 : 1);
    return { w: top + bump, r: REP_GOAL, sets: last.length, tip: `You hit ${REP_GOAL}+ on every set. Go up to ${top + bump} ${unit()}.` };
  }
  const reps = Math.min(REP_GOAL, Math.min(...topSets.map(s => s.r)) + 1);
  return { w: top, r: reps, sets: last.length, tip: `Stay at ${top} ${unit()} and aim for ${reps} reps every set.` };
}

// Sets per muscle in the last 7 days (helper muscles count as half a set).
function weeklySets() {
  const since = Date.now() - 7 * DAY, out = {};
  Object.keys(MUSCLES).forEach(m => out[m] = 0);
  state.workouts.filter(w => w.date >= since).forEach(w => w.sets.forEach(s => {
    const [p, sec] = musclesFor(s.ex);
    p.forEach(m => out[m] += 1);
    sec.forEach(m => out[m] += 0.5);
  }));
  return out;
}

// Days since each muscle was last trained directly.
function daysSince() {
  const out = {};
  state.workouts.forEach(w => w.sets.forEach(s => musclesFor(s.ex)[0].forEach(m => out[m] = Math.max(out[m] || 0, w.date))));
  Object.keys(out).forEach(m => out[m] = (Date.now() - out[m]) / DAY);
  return out;
}

function restFor(ex) {
  if (state.settings.rest !== "auto") return +state.settings.rest;
  return isCompound(ex) ? 150 : 75;
}

// Strength level from your best estimated max relative to bodyweight.
const STANDARDS = {
  "Bench press": [0.5, 0.75, 1, 1.5, 2], "Squat": [0.75, 1.25, 1.5, 2.25, 2.75],
  "Deadlift": [1, 1.5, 2, 2.5, 3], "Overhead press": [0.35, 0.55, 0.75, 1, 1.35], "Barbell row": [0.5, 0.75, 1, 1.5, 1.75],
};
const TIERS = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite"];
function strengthLevel(ex) {
  const std = STANDARDS[ex], bw = state.bodyweight.at(-1)?.v, best = bestFor(ex);
  if (!std || !bw || !best) return null;
  const ratio = best / bw;
  let i = std.findLastIndex(x => ratio >= x);
  const next = std[i + 1];
  return { tier: i < 0 ? "Untrained" : TIERS[i], ratio, next: next ? Math.round(next * bw) : null, nextTier: TIERS[i + 1], pct: Math.min(100, ratio / std.at(-1) * 100) };
}

// Fun comparisons for total weight moved (in lb).
const THINGS = [[15, "house cats"], [70, "golden retrievers"], [250, "baby elephants' worth of watermelons"],
  [500, "grizzly bears"], [1000, "grand pianos"], [4000, "cars"], [12000, "T-rexes"], [30000, "school buses"]];
function funVolume(vol) {
  const lb = unit() === "kg" ? vol * 2.2 : vol;
  const [w, what] = THINGS.filter(([w]) => lb >= w).at(-1) || THINGS[0];
  const n = lb / w;
  return `That's about <b>${n >= 10 ? Math.round(n) : n.toFixed(1)} ${what}</b> 🐘`;
}

// ---------- Badges ----------

const BADGES = [
  { id: "first", icon: "🎉", name: "First rep", about: "Finish your first workout", test: s => s.workouts.length >= 1 },
  { id: "ten", icon: "🔟", name: "Regular", about: "Finish 10 workouts", test: s => s.workouts.length >= 10 },
  { id: "fifty", icon: "🏛️", name: "Gym rat", about: "Finish 50 workouts", test: s => s.workouts.length >= 50 },
  { id: "streak3", icon: "🔥", name: "On fire", about: "3-day streak", test: () => streakDays() >= 3 },
  { id: "streak7", icon: "☄️", name: "Unstoppable", about: "7-day streak", test: () => streakDays() >= 7 },
  { id: "goal", icon: "🎯", name: "Goal getter", about: "Hit your weekly goal", test: s => thisWeek().count >= s.settings.weeklyGoal },
  { id: "pr", icon: "🏆", name: "Record breaker", about: "Set a personal record", test: s => (s.prCount || 0) >= 1 },
  { id: "pr10", icon: "👑", name: "PR machine", about: "Set 10 personal records", test: s => (s.prCount || 0) >= 10 },
  { id: "vol10k", icon: "🏋️", name: "Heavy day", about: "Move 10,000 in one workout", test: s => s.workouts.some(w => w.sets.reduce((a, x) => a + x.w * x.r, 0) >= 10000) },
  { id: "sets100", icon: "💯", name: "Century", about: "Log 100 sets", test: s => s.workouts.reduce((a, w) => a + w.sets.length, 0) >= 100 },
  { id: "plate2", icon: "🥈", name: "Two plates", about: "Bench 225 lb / 100 kg", test: s => s.workouts.some(w => w.sets.some(x => x.ex === "Bench press" && x.w >= (s.settings.unit === "kg" ? 100 : 225))) },
  { id: "weighin", icon: "⚖️", name: "Weigh-in", about: "Log your bodyweight", test: s => s.bodyweight.length >= 1 },
  { id: "daily", icon: "⚡", name: "Challenger", about: "Beat a daily challenge", test: s => Object.keys(s.challenges).length >= 1 },
  { id: "lvl10", icon: "🥇", name: "Gold rank", about: "Reach level 16", test: s => levelOf(s.xp) >= 16 },
];

function checkBadges() {
  const fresh = BADGES.filter(b => !state.badges[b.id] && b.test(state));
  fresh.forEach(b => state.badges[b.id] = Date.now());
  return fresh;
}

// ---------- Views ----------

// keepScroll: re-draw in place (e.g. after ticking a set) instead of jumping to the top.
function render() {
  document.querySelectorAll(".tabs button").forEach(b =>
    b.classList.toggle("on", b.dataset.tab === tab.split(":")[0] || (tab === "workout" && b.dataset.tab === "home")));
  const y = window.scrollY;
  $("#view").innerHTML = ({ home, routines, workout, progress, history, editRoutine, summary })[tab.split(":")[0]]();
  window.scrollTo(0, y);
}

// Changing screens: scroll to top, slide in, count numbers up.
function go(t) {
  tab = t;
  render();
  window.scrollTo(0, 0);
  const v = $("#view");
  v.classList.remove("enter"); void v.offsetWidth; v.classList.add("enter");
  countUp();
}

function countUp() {
  document.querySelectorAll("[data-count]").forEach(el => {
    const end = +el.dataset.count, suffix = el.dataset.suffix || "", fmt = el.dataset.fmt === "short" ? shortNum : Math.round;
    if (!end) return;
    const t0 = performance.now(), dur = 700;
    const step = now => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(end * e) + suffix;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
const num = (v, suffix = "", fmt = "") => `<b data-count="${v}" data-suffix="${suffix}" data-fmt="${fmt}">${fmt === "short" ? shortNum(v) : Math.round(v)}${suffix}</b>`;

function home() {
  if (state.active) return workout();
  const r = state.routines[state.nextRoutine % state.routines.length];
  const wk = thisWeek(), last = weekStats(1), goal = state.settings.weeklyGoal;
  const recent = state.workouts.slice(-3).reverse();
  const hour = new Date().getHours();
  const hi = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const since = daysSince();
  const recColor = m => since[m] === undefined ? "var(--idle)" : since[m] < 2 ? "var(--sore)" : since[m] < 3 ? "var(--warm)" : "var(--hit)";
  const ready = r ? r.exercises.flatMap(e => musclesFor(e)[0]).filter(m => since[m] !== undefined && since[m] < 2) : [];
  const streak = streakDays(), ch = todaysChallenge(), chDone = state.challenges[todayKey()];
  const diff = last.vol ? Math.round((wk.vol - last.vol) / last.vol * 100) : null;
  return `
    <div class="sub">${fmtDate(Date.now())}</div>
    <h1>${hi}, ready to lift?</h1>
    ${levelCard()}
    ${r ? `<div class="card hero shine">
      <div style="font-size:13px">Up next</div>
      <h2>${esc(r.name)}</h2>
      <div style="font-size:13px;margin-bottom:12px">${r.exercises.map(esc).join(" · ")}</div>
      ${ready.length ? `<div style="font-size:13px;margin:-6px 0 10px">⚠️ Still recovering: ${[...new Set(ready)].map(m => MUSCLES[m]).join(", ")}</div>` : ""}
      <button class="btn dark wide" data-act="start" data-id="${r.id}">▶ Start workout</button>
    </div>` : ""}
    <div class="card challenge ${chDone ? "won" : ""}">
      <div class="ch-icon">${chDone ? "✅" : "⚡"}</div>
      <div style="flex:1"><div class="sub" style="font-size:12px">Daily challenge · +${XP.challenge} XP</div><b>${ch.text}</b></div>
    </div>
    <div class="grid3">
      <div class="stat"><span class="sub">Streak</span><div class="row" style="gap:4px">${num(streak)}<span class="${streak ? "flame" : "flame off"}">🔥</span></div></div>
      <div class="stat"><span class="sub">This week</span>${num(wk.count)}</div>
      <div class="stat"><span class="sub">Volume</span>${num(wk.vol, "", "short")}</div>
    </div>
    <div class="card">
      <div class="row between"><b>Weekly goal</b><span class="sub">${wk.count} of ${goal} workouts</span></div>
      <div class="goalbar">${Array.from({ length: goal }, (_, i) => `<i class="${i < wk.count ? "on" : ""}" style="animation-delay:${i * .08}s"></i>`).join("")}</div>
      ${diff !== null ? `<div class="sub" style="margin-top:8px">${diff >= 0 ? `<span class="up">▲ ${diff}%</span>` : `<span class="down">▼ ${-diff}%</span>`} volume vs last week (${shortNum(last.vol)})</div>` : ""}
    </div>
    ${state.workouts.length ? `<div class="card">
      <div class="row between"><b>Recovery</b>
        <span class="legend"><i style="background:var(--sore)"></i>Sore <i style="background:var(--warm)"></i>Almost <i style="background:var(--hit)"></i>Ready</span></div>
      ${colorMap(recColor)}
    </div>` : ""}
    <h2>Quick start</h2>
    ${state.routines.map(x => `<div class="card list-item">
      <div><b>${esc(x.name)}</b><div class="sub">${x.exercises.length} exercises</div></div>
      <button class="btn small primary" data-act="start" data-id="${x.id}">Start</button></div>`).join("")}
    ${recent.length ? `<h2>Recent</h2>` + recent.map(w => `<div class="card">
      <b>${esc(w.routine)}</b><div class="sub">${fmtDate(w.date)} · ${w.minutes} min · ${w.sets.length} sets</div></div>`).join("") : ""}
  `;
}

const EQUIP_BTN = { barbell: "🍩 Plates", dumbbell: "🏋️ Dumbbells", cable: "🧱 Stack", machine: "🧱 Stack" };
const EQUIP_TAG = { barbell: "Barbell", dumbbell: "Dumbbell", cable: "Cable", machine: "Machine", bodyweight: "Bodyweight" };

function workout() {
  const a = state.active;
  if (!a) { tab = "home"; return home(); }
  const done = a.exercises.flatMap(e => e.sets.filter(s => s.done && !s.warm));
  const vol = done.reduce((t, s) => t + (+s.w || 0) * (+s.r || 0), 0), lastVol = lastVolumeFor(a.routine);
  const beat = lastVol ? Math.min(100, vol / lastVol * 100) : 0;
  return `
    <div class="row between">
      <div><div class="sub"><span id="elapsed">${elapsed()}</span> · ${done.length} sets</div><h1 style="margin:0">${esc(a.routine)}</h1></div>
      <button class="btn primary" data-act="finish">Finish</button>
    </div>
    ${lastVol ? `<div class="card beat ${vol > lastVol ? "won" : ""}">
      <div class="row between"><span class="sub">${vol > lastVol ? "🔥 Beating last time!" : "Beat last session"}</span><span class="sub">${shortNum(vol)} / ${shortNum(lastVol)}</span></div>
      <div class="xpbar"><i style="width:${beat}%"></i></div></div>` : ""}
    ${a.exercises.map((e, ei) => {
      const work = e.sets.filter(s => !s.warm), complete = work.length && work.every(s => s.done);
      const eq = equipmentFor(e.name);
      if (complete && !e.open) return `<div class="card done-card" data-act="expand" data-ei="${ei}">
        <div class="row between"><div class="row"><span class="tick">✓</span><b>${esc(e.name)}</b></div>
        <span class="sub">${work.map(s => `${s.w}×${s.r}`).join(", ")}${work.some(s => s.pr) ? " 🏆" : ""}</span></div></div>`;
      const last = lastSetsFor(e.name), tip = coach(e.name), note = state.notes[e.name];
      let n = 0;
      return `<div class="card" style="margin-top:12px">
        <div class="row between"><div class="row"><b>${esc(e.name)}</b>
          <a class="form-link" href="${formLink(e.name)}" target="_blank" rel="noopener">▶ Form</a></div>
          <span class="eq">${EQUIP_TAG[eq]}</span></div>
        ${last.length ? `<div class="last">Last: ${last.map(s => `${s.w}×${s.r}`).join(", ")}${bestFor(e.name) ? ` · 🏆 ${Math.round(bestFor(e.name))}` : ""}</div>` : `<div class="last">First time, pick a starting weight</div>`}
        ${tip ? `<div class="coach">📈 ${tip.tip}</div>` : ""}
        ${note ? `<div class="note">📝 ${esc(note)}</div>` : ""}
        <div class="set" style="margin-top:8px"><span class="num sub">Set</span><span class="sub" style="text-align:center">${eq === "dumbbell" ? unit() + " each" : unit()}</span><span class="sub" style="text-align:center">Reps</span><span></span></div>
        ${e.sets.map((s, si) => `<div class="set ${s.done ? "done" : ""} ${s.warm ? "warm" : ""} ${s.pr ? "is-pr" : ""}" data-row="${ei}-${si}">
          <span class="num">${s.warm ? "W" : ++n}</span>
          <input type="number" inputmode="decimal" value="${s.w}" data-ei="${ei}" data-si="${si}" data-f="w">
          <input type="number" inputmode="numeric" value="${s.r}" data-ei="${ei}" data-si="${si}" data-f="r">
          <button class="check" data-act="toggle" data-ei="${ei}" data-si="${si}">${s.pr ? "🏆" : "✓"}</button>
        </div>`).join("")}
        <div class="tools">
          <button class="btn small ghost" data-act="addset" data-ei="${ei}">+ Set</button>
          ${e.sets.length > 1 ? `<button class="btn small ghost" data-act="delset" data-ei="${ei}">− Set</button>` : ""}
          ${e.sets.some(s => s.warm) || eq === "bodyweight" ? "" : `<button class="btn small ghost" data-act="warmup" data-ei="${ei}">🔥 Warm-up</button>`}
          ${EQUIP_BTN[eq] ? `<button class="btn small ghost" data-act="plates" data-ei="${ei}">${EQUIP_BTN[eq]}</button>` : ""}
          <button class="btn small ghost" data-act="swap" data-ei="${ei}">⇄ Swap</button>
          <button class="btn small ghost" data-act="info" data-ex="${esc(e.name)}">ⓘ Info</button>
          ${complete ? `<button class="btn small ghost" data-act="collapse" data-ei="${ei}">▴ Hide</button>` : ""}
        </div>
      </div>`;
    }).join("")}
    <div class="card"><input id="addex" list="ex-list" placeholder="Add an exercise (e.g. Lateral raise)">
      ${exDatalist()}
      <button class="btn ghost wide" style="margin-top:8px" data-act="addex">+ Add exercise</button></div>
    <button class="btn danger wide" data-act="discard">Discard workout</button>
  `;
}

function elapsed() {
  const s = Math.floor((Date.now() - state.active.start) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return `${h ? h + ":" + String(m).padStart(2, "0") : m}:${String(s % 60).padStart(2, "0")}`;
}
setInterval(() => { const el = $("#elapsed"); if (el && state.active) el.textContent = elapsed(); }, 1000);

const exDatalist = () => `<datalist id="ex-list">${Object.keys(EXERCISES).map(n => `<option value="${esc(n)}">`).join("")}</datalist>`;

function summary() {
  const s = state.summary;
  if (!s) { tab = "home"; return home(); }
  const party = s.prs.length || s.badges.length || s.challenge;
  return `
    ${party ? `<div class="confetti">${Array.from({ length: 50 }, (_, i) =>
      `<i style="left:${(i * 37) % 100}%;animation-delay:${(i % 10) * .12}s;background:${["var(--accent)", "#efa027", "#ff4f7b", "#6aa8ff", "#fff"][i % 5]}"></i>`).join("")}</div>` : ""}
    <div class="sub" style="text-align:center;margin-top:20px">Workout complete</div>
    <h1 style="text-align:center">${party ? "Huge session! 🏆" : "Nice work 💪"}</h1>
    <div class="card hero shine" style="text-align:center"><h2>${esc(s.routine)}</h2><div style="font-size:13px">${fmtDate(s.date)}</div>
      <div class="xp-earned">+${s.xp} XP</div></div>
    <div class="grid3">
      <div class="stat"><span class="sub">Time</span>${num(s.minutes, " min")}</div>
      <div class="stat"><span class="sub">Sets</span>${num(s.sets)}</div>
      <div class="stat"><span class="sub">Volume</span>${num(s.volume, "", "short")}</div>
    </div>
    <div class="card" style="text-align:center">${funVolume(s.volume)}</div>
    ${s.challenge ? `<div class="card challenge won"><div class="ch-icon">⚡</div><div><div class="sub" style="font-size:12px">Daily challenge beaten · +${XP.challenge} XP</div><b>${s.challenge}</b></div></div>` : ""}
    ${s.prs.length ? `<div class="card"><b>New personal records</b>${s.prs.map(p =>
      `<div class="list-item" style="margin-top:8px"><span>${esc(p.ex)}</span><span class="pr">${Math.round(p.v)} ${unit()} est. max</span></div>`).join("")}</div>` : ""}
    ${s.badges.length ? `<div class="card"><b>Badges unlocked</b><div class="badges" style="margin-top:8px">${s.badges.map(id => badgeTile(BADGES.find(b => b.id === id), true)).join("")}</div></div>` : ""}
    <div class="card"><b>Muscles you trained</b><div class="glowmap">${bodyMap(s.exercises)}</div></div>
    <div class="row"><button class="btn ghost" style="flex:1" data-act="share">📤 Share</button>
      <button class="btn primary" style="flex:2" data-act="done-summary">Done</button></div>
  `;
}

const badgeTile = (b, on) => `<div class="badge ${on ? "" : "locked"}"><span>${b.icon}</span><b>${b.name}</b><small>${b.about}</small></div>`;

function routines() {
  const restOpts = ["auto", 60, 90, 120, 180, 240];
  const n = state.routines.length;
  return `
    <h1>Routines</h1>
    ${state.routines.map((r, i) => `<div class="card">
      <div class="row between"><b style="font-size:17px">${esc(r.name)}</b>
        <div class="row" style="gap:4px">
          <button class="icon-btn" data-act="r-up" data-i="${i}" ${i ? "" : "disabled"} aria-label="Move up">↑</button>
          <button class="icon-btn" data-act="r-down" data-i="${i}" ${i < n - 1 ? "" : "disabled"} aria-label="Move down">↓</button>
          <button class="icon-btn" data-act="r-rename" data-id="${r.id}" aria-label="Rename">✎</button>
          <button class="icon-btn danger" data-act="delroutine" data-id="${r.id}" aria-label="Delete">🗑</button>
        </div></div>
      <div class="row" style="margin-top:8px;align-items:flex-start">
        <div style="flex:1">${r.exercises.map(e => `<span class="chip">${esc(e)}</span>`).join("") || `<span class="sub">No exercises yet</span>`}</div>
        ${bodyMap(r.exercises, true)}</div>
      <div class="row" style="margin-top:8px"><button class="btn small ghost" style="flex:1" data-act="edit" data-id="${r.id}">Edit exercises</button>
        <button class="btn small primary" style="flex:1" data-act="start" data-id="${r.id}">▶ Start</button></div>
    </div>`).join("")}
    <div class="row"><button class="btn ghost" style="flex:1" data-act="newroutine">+ New routine</button>
      <button class="btn ghost" style="flex:1" data-act="programs">📚 Programs</button></div>
    <h2>Settings</h2>
    <div class="card">
      <div class="row between"><span>Color</span>
        <div class="row" style="gap:8px">${Object.entries(ACCENTS).map(([k, t]) =>
          `<button class="swatch ${k === state.settings.accent ? "on" : ""}" style="background:${t.a}" data-act="accent" data-k="${k}" aria-label="${t.name}"></button>`).join("")}</div></div>
      <div class="row between" style="margin-top:10px"><span>Sound effects</span>
        <button class="toggle ${state.settings.sound ? "on" : ""}" data-act="sound" aria-label="Sound"><i></i></button></div>
      <div class="row between" style="margin-top:10px"><span>Rest timer</span>
        <select id="set-rest" style="width:auto">${restOpts.map(s =>
          `<option value="${s}" ${s == state.settings.rest ? "selected" : ""}>${s === "auto" ? "Auto (by exercise)" : s >= 60 ? (s / 60) + " min" : s + " s"}</option>`).join("")}</select></div>
      <div class="row between" style="margin-top:10px"><span>Weekly goal</span>
        <select id="set-goal" style="width:auto">${[2, 3, 4, 5, 6, 7].map(g =>
          `<option value="${g}" ${g == state.settings.weeklyGoal ? "selected" : ""}>${g} workouts</option>`).join("")}</select></div>
      <div class="row between" style="margin-top:10px"><span>Units</span>
        <select id="set-unit" style="width:auto">${["lb", "kg"].map(u =>
          `<option ${u === unit() ? "selected" : ""}>${u}</option>`).join("")}</select></div>
    </div>
    <div class="card">
      <div class="sub" style="margin-bottom:8px">Your data only lives on this phone. Save a backup now and then.</div>
      <div class="row"><button class="btn ghost" data-act="export">Save backup</button>
      <label class="btn ghost">Restore<input id="import" type="file" accept=".json" class="hidden"></label></div>
    </div>
  `;
}

function editRoutine() {
  const r = state.routines.find(x => x.id == tab.split(":")[1]);
  if (!r) { tab = "routines"; return routines(); }
  const n = r.exercises.length;
  return `
    <button class="btn small ghost" data-act="back">‹ Back</button>
    <h1 style="margin-top:12px">Edit routine</h1>
    <div class="sub" style="margin-bottom:6px">Name</div>
    <input id="rname" value="${esc(r.name)}" data-id="${r.id}" placeholder="Session name (e.g. Push day)">
    <div class="card" style="margin-top:12px">
      <div class="row between"><b>Muscles worked</b>
        <span class="legend"><i style="background:var(--hit)"></i>Main <i style="background:var(--hit2)"></i>Helper</span></div>
      ${bodyMap(r.exercises)}
    </div>
    ${suggestions(r)}
    <h2>Exercises</h2>
    ${r.exercises.map((e, i) => `<div class="card">
      <div class="row between"><div><b>${esc(e)}</b>
        <div class="sub" style="font-size:12px">${EQUIP_TAG[equipmentFor(e)]} · ${musclesFor(e)[0].map(m => MUSCLES[m]).join(", ") || "Unknown muscles"}</div></div>
        <a class="form-link" href="${formLink(e)}" target="_blank" rel="noopener">▶ Form</a></div>
      <div class="row" style="gap:4px;margin-top:8px">
        <button class="icon-btn" data-act="exup" data-id="${r.id}" data-i="${i}" ${i ? "" : "disabled"} aria-label="Move up">↑</button>
        <button class="icon-btn" data-act="exdown" data-id="${r.id}" data-i="${i}" ${i < n - 1 ? "" : "disabled"} aria-label="Move down">↓</button>
        <button class="icon-btn" data-act="exrename" data-id="${r.id}" data-i="${i}" aria-label="Rename">✎</button>
        <span style="flex:1"></span>
        <button class="icon-btn danger" data-act="exdel" data-id="${r.id}" data-i="${i}" aria-label="Remove">✕</button></div></div>`).join("")}
    <div class="card"><input id="newex" list="ex-list" placeholder="Exercise name">
      ${exDatalist()}
      <button class="btn primary wide" style="margin-top:8px" data-act="exadd" data-id="${r.id}">+ Add</button></div>
    <button class="btn danger wide" data-act="delroutine" data-id="${r.id}">Delete routine</button>
  `;
}

function suggestions(r) {
  const { target, fromName, missing, picks } = suggest(r.name, r.exercises);
  let msg;
  if (!target.length) msg = "Name your session (like “Push day” or “Back and biceps”) or add an exercise to get ideas.";
  else if (missing.length) msg = `Not hitting yet: <b>${missing.map(m => MUSCLES[m]).join(", ")}</b>`;
  else msg = fromName ? `✓ Every muscle for “${esc(r.name)}” is covered.` : "✓ Nicely balanced.";
  return `<div class="card">
    <b>Suggestions</b><div class="sub" style="margin:4px 0 8px">${msg}</div>
    ${picks.map(p => `<button class="sugg" data-act="exsugg" data-id="${r.id}" data-name="${esc(p.name)}">
      <span>+ ${esc(p.name)}</span><span class="sub">${esc(p.why)}</span></button>`).join("")}
  </div>`;
}

function progress() {
  const wsets = weeklySets();
  const heat = m => wsets[m] >= 10 ? "var(--hit)" : wsets[m] >= 5 ? "var(--hit2)" : wsets[m] > 0 ? "var(--low)" : "var(--idle)";
  const names = [...new Set(state.workouts.flatMap(w => w.sets.map(s => s.ex)))];
  if (!names.includes(progressEx)) progressEx = names[0];
  const pts = state.workouts.map(w => {
    const s = w.sets.filter(x => x.ex === progressEx);
    return s.length ? { d: w.date, v: Math.max(...s.map(x => oneRM(x.w, x.r))) } : null;
  }).filter(Boolean);
  const bw = state.bodyweight;
  const lifts = Object.keys(STANDARDS).map(ex => [ex, strengthLevel(ex)]).filter(([, l]) => l);
  return `
    <h1>Progress</h1>
    ${levelCard()}
    <div class="card">
      <div class="row between"><b>This week's sets</b>
        <span class="legend"><i style="background:var(--low)"></i>1-4 <i style="background:var(--hit2)"></i>5-9 <i style="background:var(--hit)"></i>10+</span></div>
      ${colorMap(heat)}
      <div class="sub" style="margin:8px 0">10–20 hard sets per muscle a week is the sweet spot for growth.</div>
      ${Object.values(wsets).some(n => !n) ? `<div class="sub" style="font-size:13px;margin-bottom:6px">Not trained this week: ${Object.keys(wsets).filter(m => !wsets[m]).map(m => MUSCLES[m]).join(", ")}</div>` : ""}
      ${Object.entries(wsets).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([m, n]) => `<div class="mbar">
        <span>${MUSCLES[m]}</span><div><i style="width:${Math.min(100, n / 20 * 100)}%;background:${n >= 10 ? "var(--hit)" : n >= 5 ? "var(--hit2)" : "#555"}"></i></div><b>${+n.toFixed(1)}</b></div>`).join("")}
    </div>
    <div class="card"><b>Strength level</b>
      ${lifts.length ? lifts.map(([ex, l]) => `<div style="margin-top:10px">
        <div class="row between"><span>${ex}</span><span class="tier">${l.tier}</span></div>
        <div class="xpbar"><i style="width:${l.pct}%"></i></div>
        <div class="sub" style="font-size:12px">${l.ratio.toFixed(2)}× bodyweight${l.next ? ` · ${l.nextTier} at ${l.next} ${unit()}` : " · top tier!"}</div></div>`).join("")
        : `<div class="sub" style="margin-top:4px">Log your bodyweight below and do bench, squat, deadlift, overhead press or barbell row to see how you stack up.</div>`}
    </div>
    <div class="card"><b>Consistency</b><div class="sub" style="margin-bottom:8px">Last 16 weeks</div>${calendar()}</div>
    ${names.length ? `<div class="card">
      <select id="pick-ex">${names.map(n => `<option ${n === progressEx ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
      <div class="row between" style="margin-top:10px"><span class="sub">Estimated 1-rep max</span><span class="pr">🏆 ${Math.round(Math.max(...pts.map(p => p.v)))} ${unit()}</span></div>
      ${chart(pts)}
    </div>` : ""}
    <div class="card">
      <div class="row between"><b>Bodyweight</b>${bw.length ? `<span class="sub">${bw.at(-1).v} ${unit()}</span>` : ""}</div>
      ${bw.length ? chart(bw) : ""}
      <div class="row" style="margin-top:8px"><input id="bw" type="number" inputmode="decimal" placeholder="Today's weight (${unit()})">
        <button class="btn primary" data-act="logbw">Log</button></div>
    </div>
    <h2>Badges <span class="sub">${Object.keys(state.badges).length}/${BADGES.length}</span></h2>
    <div class="badges">${BADGES.map(b => badgeTile(b, state.badges[b.id])).join("")}</div>
    ${names.length ? `<h2>All-time bests</h2>` + names.map(n => `<div class="card list-item"><span>${esc(n)}</span><span class="pr">${Math.round(bestFor(n))} ${unit()}</span></div>`).join("") : ""}
  `;
}

function calendar() {
  const days = new Set(state.workouts.map(w => new Date(w.date).toDateString()));
  const start = weekStart(15);
  const cols = [];
  for (let wk = 0; wk < 16; wk++) {
    const cells = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(start); day.setDate(start.getDate() + wk * 7 + d);
      cells.push(`<i class="${days.has(day.toDateString()) ? "on" : ""} ${day > new Date() ? "future" : ""}"></i>`);
    }
    cols.push(`<div>${cells.join("")}</div>`);
  }
  return `<div class="cal">${cols.join("")}</div>`;
}

function chart(pts) {
  if (pts.length < 2) return `<div class="empty" style="padding:16px">Log this again to see a trend.</div>`;
  const W = 300, H = 140, P = 10;
  const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || 1;
  const xy = pts.map((p, i) => [P + i * (W - 2 * P) / (pts.length - 1), H - P - (p.v - lo) / span * (H - 2 * P)]);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <polyline points="${xy.map(p => p.join(",")).join(" ")}" fill="none" style="stroke:var(--accent)" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    ${xy.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" style="fill:var(--accent)"/>`).join("")}
  </svg>
  <div class="row between sub"><span>${fmtDate(pts[0].d)}</span><span>${fmtDate(pts.at(-1).d)}</span></div>`;
}

function history() {
  if (!state.workouts.length) return `<h1>History</h1><div class="empty">No workouts yet. Go lift something.</div>`;
  return `<h1>History</h1>` + state.workouts.slice().reverse().map(w => {
    const byEx = {};
    w.sets.forEach(s => (byEx[s.ex] ??= []).push(`${s.w}×${s.r}`));
    return `<div class="card">
      <div class="row between"><b>${esc(w.routine)}</b><button class="btn small danger" data-act="delworkout" data-id="${w.id}">✕</button></div>
      <div class="sub">${fmtDate(w.date)} · ${w.minutes} min</div>
      ${Object.entries(byEx).map(([ex, s]) => `<div style="margin-top:6px"><b style="font-size:14px">${esc(ex)}</b> <span class="sub">${s.join(", ")}</span></div>`).join("")}
    </div>`;
  }).join("");
}

// ---------- Bottom sheets ----------

function openSheet(html) { $("#sheet-body").innerHTML = html; $("#sheet").classList.remove("hidden"); }
function closeSheet() { $("#sheet").classList.add("hidden"); }

const PLATES = { lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5] }, kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] } };
const PLATE_COLORS = ["#e24b4a", "#3b82f6", "#efa027", "#2fbf8f", "#f1efe8", "#888", "#555"];

// Weight helper that matches the equipment: plates for barbells, a pair for dumbbells, a pin for stacks.
function weightSheet(ex, weight) {
  const eq = equipmentFor(ex);
  const input = `<div class="row"><input id="plate-w" type="number" inputmode="decimal" value="${weight}" data-ex="${esc(ex)}">
    <button class="btn primary" data-act="plates-calc">Go</button></div>`;
  if (eq === "dumbbell") return `<h2>Dumbbells</h2><div class="sub">${esc(ex)} · weight is per hand</div>${input}${dumbbellVis(weight)}`;
  if (eq === "cable" || eq === "machine") return `<h2>Weight stack</h2><div class="sub">${esc(ex)} · ${eq === "cable" ? "cable" : "machine"}</div>${input}${stackVis(weight)}`;
  return `<h2>Plate calculator</h2><div class="sub">${esc(ex)} · barbell</div>${input}${platesVis(weight)}`;
}

function platesVis(weight) {
  const { bar, plates } = PLATES[unit()];
  let left = (weight - bar) / 2;
  const used = [];
  if (left > 0) plates.forEach(p => { while (left >= p - 1e-9) { used.push(p); left -= p; } });
  if (weight < bar) return `<div class="empty">That's lighter than the ${bar} ${unit()} bar.</div>`;
  return `<div class="bar-vis"><div class="bar-sleeve">${used.map(p =>
      `<i style="height:${[100, 92, 84, 64, 50, 40, 34][plates.indexOf(p)]}px;background:${PLATE_COLORS[plates.indexOf(p)]}"></i>`).join("")}</div></div>
    <div style="text-align:center;font-size:18px;margin:6px 0"><b>Each side:</b> ${used.length ? used.join(" + ") : "nothing, just the bar"}</div>
    <div class="sub" style="text-align:center">${bar} ${unit()} bar${left > 0.01 ? ` · ${+(left * 2).toFixed(2)} ${unit()} can't be made with standard plates` : ""}</div>`;
}

function dumbbellVis(weight) {
  const step = unit() === "kg" ? 2 : 5, near = Math.max(step, round(weight, step));
  const bell = `<svg viewBox="0 0 120 50" class="db"><rect x="8" y="5" width="22" height="40" rx="6" style="fill:var(--accent)"/>
    <rect x="30" y="20" width="60" height="10" rx="3" fill="#999"/><rect x="90" y="5" width="22" height="40" rx="6" style="fill:var(--accent)"/>
    <text x="60" y="44" text-anchor="middle" font-size="11" fill="#f1efe8" font-weight="700">${near}</text></svg>`;
  return `<div class="db-row">${bell}${bell}</div>
    <div style="text-align:center;font-size:18px;margin:6px 0"><b>Grab two ${near} ${unit()} dumbbells</b></div>
    <div class="sub" style="text-align:center">${near * 2} ${unit()} total${near !== weight ? ` · rounded from ${weight} to the nearest rack size` : ""}</div>`;
}

function stackVis(weight) {
  const step = unit() === "kg" ? 5 : 10, plates = 20, near = Math.max(step, round(weight, step)), pin = Math.min(plates, near / step);
  return `<div class="stack">${Array.from({ length: plates }, (_, i) => {
      const lvl = i + 1;
      return `<div class="${lvl <= pin ? "lift" : ""} ${lvl === pin ? "pin" : ""}"><span>${lvl * step}</span>${lvl === pin ? "<em>◀ pin</em>" : ""}</div>`;
    }).join("")}</div>
    <div style="text-align:center;font-size:18px;margin:6px 0"><b>Put the pin at ${near} ${unit()}</b></div>
    <div class="sub" style="text-align:center">${near !== weight ? `Rounded from ${weight}. ` : ""}Stacks vary by machine, so match the number printed on the plate.</div>`;
}

function infoSheet(ex) {
  const sessions = sessionsFor(ex), best = bestFor(ex), lvl = strengthLevel(ex);
  const [p, s] = musclesFor(ex);
  return `<h2>${esc(ex)}</h2>
    <div class="sub">${EQUIP_TAG[equipmentFor(ex)]} · Main: ${p.map(m => MUSCLES[m]).join(", ") || "?"}${s.length ? ` · Helpers: ${s.map(m => MUSCLES[m]).join(", ")}` : ""}</div>
    <a class="btn ghost wide" style="margin:10px 0;text-align:center" href="${formLink(ex)}" target="_blank" rel="noopener">▶ Watch form videos on TikTok</a>
    ${lvl ? `<div class="card" style="background:var(--card2)"><div class="row between"><b>Strength level</b><span class="tier">${lvl.tier}</span></div>
      <div class="xpbar"><i style="width:${lvl.pct}%"></i></div></div>` : ""}
    <b>Your notes</b>
    <textarea id="note" data-ex="${esc(ex)}" rows="2" placeholder="Seat height, grip, cues that help…">${esc(state.notes[ex] || "")}</textarea>
    ${best ? `<h2>Training percentages</h2><div class="sub">Based on your estimated max of ${Math.round(best)} ${unit()}</div>
      <div class="pct">${[[95, 2], [90, 3], [85, 5], [80, 7], [75, 9], [70, 11], [60, 15]].map(([pc, r]) =>
        `<div><b>${round(best * pc / 100, incStep() / 2)}</b><span>${pc}% · ~${r} reps</span></div>`).join("")}</div>` : ""}
    <h2>Recent sessions</h2>
    ${sessions.length ? sessions.map(x => `<div class="list-item" style="padding:6px 0;border-bottom:1px solid #2a2a2a">
      <span class="sub">${fmtDate(x.date)}</span><span>${x.sets.map(s => `${s.w}×${s.r}`).join(", ")}</span></div>`).join("")
      : `<div class="sub">Nothing logged yet.</div>`}`;
}

function swapSheet(ei) {
  const name = state.active.exercises[ei].name, alts = alternatives(name);
  return `<h2>Swap ${esc(name)}</h2><div class="sub">Machine taken? These hit the same muscles.</div>
    ${alts.length ? alts.map(n => `<button class="sugg" data-act="swap-to" data-ei="${ei}" data-name="${esc(n)}">
      <span>⇄ ${esc(n)}</span><span class="sub">${EQUIP_TAG[equipmentFor(n)]}</span></button>`).join("")
      : `<div class="empty">No matches for this one.</div>`}`;
}

function programsSheet() {
  return `<h2>Programs</h2><div class="sub">Proven routines. Adding one keeps your current routines too.</div>
    ${PROGRAMS.map((p, i) => `<div class="card" style="background:var(--card2);margin-top:10px">
      <div class="row between"><div><b>${p.name}</b><div class="sub">${p.about}</div></div>
        <button class="btn small primary" data-act="add-program" data-i="${i}">Add</button></div>
      <div style="margin-top:6px">${p.routines.map(([n]) => `<span class="chip">${n}</span>`).join("")}</div></div>`).join("")}`;
}

// ---------- Workout logic ----------

function startWorkout(id) {
  if (state.active && !confirm("You already have a workout going. Replace it?")) return;
  const r = state.routines.find(x => x.id == id);
  if (!r.exercises.length) { toast("Add some exercises to this routine first"); return; }
  state.active = { routine: r.name, routineId: r.id, start: Date.now(), exercises: r.exercises.map(newExercise) };
  sfx("start"); save(); go("workout");
}

// Pre-fill with the coach's target (or last session) so logging is one tap.
function newExercise(name) {
  const c = coach(name), bw = equipmentFor(name) === "bodyweight";
  const sets = c ? Array.from({ length: c.sets }, () => ({ w: c.w, r: c.r, done: false }))
                 : [1, 2, 3].map(() => ({ w: bw ? 0 : "", r: REP_GOAL, done: false }));
  return { name, sets };
}

function warmupSets(ex, work) {
  const eq = equipmentFor(ex), step = eq === "barbell" ? incStep() : unit() === "kg" ? 2 : 5;
  const floor = eq === "barbell" ? PLATES[unit()].bar : step;
  return [[0.5, 8], [0.7, 5], [0.85, 3]]
    .map(([pc, r]) => ({ w: Math.max(floor, round(work * pc, step)), r, done: false, warm: true }))
    .filter((s, i, a) => s.w < work && (i === 0 || s.w !== a[i - 1].w));
}

function finishWorkout() {
  const a = state.active;
  const sets = a.exercises.flatMap(e => e.sets.filter(s => s.done && !s.warm && s.w !== "" && s.r)
    .map(s => ({ ex: e.name, w: +s.w, r: +s.r })));
  if (!sets.length) { if (confirm("No working sets checked off. Discard this workout?")) discard(); return; }
  const prs = [...new Set(sets.map(s => s.ex))].map(ex => {
    const prev = bestFor(ex), now = Math.max(...sets.filter(s => s.ex === ex).map(s => oneRM(s.w, s.r)));
    return prev && now > prev ? { ex, v: now } : null;
  }).filter(Boolean);
  state.prCount = (state.prCount || 0) + prs.length;
  const minutes = Math.max(1, Math.round((Date.now() - a.start) / 60000));
  const volume = sets.reduce((t, s) => t + s.w * s.r, 0), lastVolume = lastVolumeFor(a.routine);
  state.workouts.push({ id: Date.now(), date: a.start, routine: a.routine, minutes, sets });
  const idx = state.routines.findIndex(r => r.id === a.routineId);
  if (idx >= 0) state.nextRoutine = idx + 1;

  const recap = { routine: a.routine, date: a.start, minutes, sets: sets.length, prs, volume, lastVolume,
    warmups: a.exercises.flatMap(e => e.sets.filter(s => s.warm && s.done)).length, exercises: [...new Set(sets.map(s => s.ex))] };
  // Set XP was already given live; add the finish bonus (PR bonus was given live too).
  let xp = sets.length * XP.set + prs.length * XP.pr + XP.workout;
  const ch = todaysChallenge();
  if (!state.challenges[todayKey()] && ch.test(recap)) { state.challenges[todayKey()] = true; recap.challenge = ch.text; xp += XP.challenge; addXP(XP.challenge); }
  addXP(XP.workout);
  recap.badges = checkBadges().map(b => b.id);
  recap.xp = xp;
  state.summary = recap;
  state.active = null; stopRest(); save();
  go("summary");
  sfx(prs.length || recap.badges.length || recap.challenge ? "fanfare" : "done");
}

function discard() { state.active = null; stopRest(); save(); go("home"); }

const HYPE = ["Light weight!", "Clean rep!", "Strong!", "Let's go!", "Easy money", "Built different", "Keep stacking", "That's the one"];

function completeSet(ei, si, btn) {
  const a = state.active, e = a.exercises[ei], s = e.sets[si];
  if (!s.done && (s.w === "" || !s.r)) { toast("Enter weight and reps first"); return; }
  const rect = btn.getBoundingClientRect();
  s.done = !s.done;
  if (s.done && !s.warm) {
    // Live PR check against everything before today.
    const isPR = bestFor(e.name) > 0 && oneRM(+s.w, +s.r) > Math.max(bestFor(e.name), ...e.sets.filter(x => x !== s && x.pr).map(x => oneRM(+x.w, +x.r)));
    s.pr = isPR;
    addXP(XP.set + (isPR ? XP.pr : 0));
    if (isPR) { prPop(e.name, s); sfx("pr"); }
    else { sfx("set"); floatText(`+${XP.set} XP${Math.random() < .35 ? " · " + pick(HYPE) : ""}`, rect); }
  } else if (s.done) sfx("set");
  else if (!s.warm) { state.xp = Math.max(0, state.xp - XP.set - (s.pr ? XP.pr : 0)); s.pr = false; }
  save(); render();
  const row = document.querySelector(`[data-row="${ei}-${si}"]`);
  if (row && s.done) row.classList.add("pop");
  if (s.done) {
    const next = e.sets.find(x => !x.done) ? `${e.name} · set ${e.sets.filter(x => !x.warm).findIndex(x => !x.done) + 1}`
      : a.exercises.find(x => x.sets.some(y => !y.done))?.name || "Finish the workout 🎉";
    startRest(s.warm ? 45 : restFor(e.name), next);
  }
}

function prPop(name, s) {
  const el = document.createElement("div");
  el.className = "pr-pop";
  el.innerHTML = `<div>🏆</div><b>NEW PR</b><span>${esc(name)} · ${s.w} × ${s.r}</span><small>+${XP.pr} XP</small>`;
  document.body.appendChild(el);
  document.body.classList.add("shake");
  setTimeout(() => document.body.classList.remove("shake"), 500);
  setTimeout(() => el.remove(), 2200);
}

function floatText(text, rect) {
  const el = document.createElement("div");
  el.className = "float-xp";
  el.textContent = text;
  el.style.left = Math.min(window.innerWidth - 160, rect.left - 60) + "px";
  el.style.top = rect.top - 6 + "px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

// ---------- Rest timer ----------

let restEnd = 0, restTotal = 0, restTick = null;
const RING = 2 * Math.PI * 44;
function startRest(secs, next) {
  restTotal = secs; restEnd = Date.now() + secs * 1000;
  $("#rest-next").textContent = next || "";
  $("#rest").classList.remove("hidden", "ending", "ring-done");
  document.body.classList.add("resting");
  clearInterval(restTick); restTick = setInterval(tickRest, 200); tickRest();
}
function tickRest() {
  const ms = Math.max(0, restEnd - Date.now()), left = Math.ceil(ms / 1000);
  $("#rest-time").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  $("#ring-fg").style.strokeDasharray = RING;
  $("#ring-fg").style.strokeDashoffset = RING * (1 - ms / (restTotal * 1000));
  $("#rest").classList.toggle("ending", left <= 10);
  if (left === 0) {
    sfx("rest"); navigator.vibrate?.([200, 100, 200]);
    clearInterval(restTick);
    $("#rest").classList.add("ring-done");
    setTimeout(stopRest, 900);
  }
}
function stopRest() { clearInterval(restTick); $("#rest").classList.add("hidden"); document.body.classList.remove("resting"); }

// ---------- Sound ----------

let audio;
function tone(freq, at, dur, type = "sine", vol = .18) {
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, audio.currentTime + at);
  g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + at + dur);
  o.connect(g).connect(audio.destination);
  o.start(audio.currentTime + at); o.stop(audio.currentTime + at + dur);
}
const SOUNDS = {
  set: () => { tone(660, 0, .08, "triangle"); tone(990, .06, .1, "triangle"); },
  start: () => [440, 554, 659].forEach((f, i) => tone(f, i * .07, .15, "triangle")),
  rest: () => [880, 880, 1175].forEach((f, i) => tone(f, i * .22, .18)),
  pr: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .08, .25, "square", .08)),
  fanfare: () => [523, 523, 523, 698, 880, 784, 1047].forEach((f, i) => tone(f, i * .12, i === 6 ? .6 : .14, "square", .07)),
  done: () => [523, 784, 1047].forEach((f, i) => tone(f, i * .1, .25, "triangle")),
  level: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * .07, .3, "sawtooth", .05)),
};
function sfx(name) {
  if (!state.settings.sound) return;
  try { audio ??= new AudioContext(); SOUNDS[name](); } catch {}
}

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add("hidden"), 2800);
}

// ---------- Share ----------

async function shareSummary() {
  const s = state.summary, c = document.createElement("canvas");
  c.width = 1080; c.height = 1350;
  const g = c.getContext("2d"), acc = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  g.fillStyle = "#0f0f0f"; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = acc; g.fillRect(0, 0, 1080, 16);
  g.textAlign = "center"; g.fillStyle = "#8a8984"; g.font = "500 40px -apple-system, sans-serif";
  g.fillText(fmtDate(s.date).toUpperCase(), 540, 150);
  g.fillStyle = "#f1efe8"; g.font = "800 96px -apple-system, sans-serif"; g.fillText(s.routine, 540, 270);
  const stats = [["TIME", s.minutes + " min"], ["SETS", s.sets], ["VOLUME", shortNum(s.volume) + " " + unit()]];
  stats.forEach(([k, v], i) => {
    const x = 200 + i * 340;
    g.fillStyle = "#1c1c1c"; g.beginPath(); g.roundRect(x - 150, 360, 300, 220, 32); g.fill();
    g.fillStyle = "#8a8984"; g.font = "600 34px -apple-system, sans-serif"; g.fillText(k, x, 430);
    g.fillStyle = acc; g.font = "800 72px -apple-system, sans-serif"; g.fillText(v, x, 530);
  });
  let y = 700;
  if (s.prs.length) {
    g.fillStyle = "#efa027"; g.font = "800 60px -apple-system, sans-serif"; g.fillText("🏆 NEW PR" + (s.prs.length > 1 ? "S" : ""), 540, y); y += 80;
    g.fillStyle = "#f1efe8"; g.font = "500 44px -apple-system, sans-serif";
    s.prs.slice(0, 4).forEach(p => { g.fillText(`${p.ex} · ${Math.round(p.v)} ${unit()}`, 540, y); y += 64; });
  }
  g.fillStyle = "#f1efe8"; g.font = "600 48px -apple-system, sans-serif";
  g.fillText(`Level ${levelOf(state.xp)} · ${rankOf(levelOf(state.xp))} lifter`, 540, 1180);
  g.fillStyle = acc; g.font = "800 44px -apple-system, sans-serif"; g.fillText("LIFT TRACKER", 540, 1270);
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  const file = new File([blob], "workout.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) navigator.share({ files: [file] }).catch(() => {});
  else { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "workout.png"; a.click(); }
}

// ---------- Events ----------

document.addEventListener("click", e => {
  if (e.target.id === "sheet") { closeSheet(); return; }
  const tabBtn = e.target.closest("[data-tab]");
  if (tabBtn) { closeSheet(); go(tabBtn.dataset.tab === "home" && state.active ? "workout" : tabBtn.dataset.tab); return; }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const { act, id, ei, si, i } = b.dataset;
  const a = state.active;
  const routine = () => state.routines.find(x => x.id == id);
  const move = (arr, from, to) => { if (to < 0 || to >= arr.length) return; [arr[from], arr[to]] = [arr[to], arr[from]]; };

  switch (act) {
    case "start": startWorkout(id); return;
    case "finish": finishWorkout(); return;
    case "discard": if (confirm("Throw away this workout?")) discard(); return;
    case "done-summary": go("home"); return;
    case "share": shareSummary(); return;
    case "close-sheet": closeSheet(); return;
    case "close-levelup": $("#levelup").classList.add("hidden"); return;
    case "toggle": completeSet(+ei, +si, b); return;
    case "expand": a.exercises[ei].open = true; break;
    case "collapse": a.exercises[ei].open = false; break;
    case "addset": { const sets = a.exercises[ei].sets; const l = sets.at(-1);
      sets.push({ w: l?.w ?? "", r: l?.r ?? REP_GOAL, done: false }); break; }
    case "delset": a.exercises[ei].sets.pop(); break;
    case "warmup": {
      const ex = a.exercises[ei], work = +ex.sets.find(s => !s.warm)?.w;
      if (!work) { toast("Enter your working weight first"); return; }
      const w = warmupSets(ex.name, work);
      if (!w.length) { toast("Too light to need a warm-up"); return; }
      ex.sets.unshift(...w); break;
    }
    case "plates": { const ex = a.exercises[ei], sets = ex.sets;
      const w = +sets.find(s => !s.done && !s.warm && s.w)?.w || +sets.find(s => !s.warm)?.w || PLATES[unit()].bar;
      openSheet(weightSheet(ex.name, w)); return; }
    case "plates-calc": { const inp = $("#plate-w"); openSheet(weightSheet(inp.dataset.ex, +inp.value || 0)); return; }
    case "swap": openSheet(swapSheet(ei)); return;
    case "swap-to": a.exercises[ei] = newExercise(b.dataset.name); closeSheet(); break;
    case "info": openSheet(infoSheet(b.dataset.ex)); return;
    case "programs": openSheet(programsSheet()); return;
    case "add-program": {
      const p = PROGRAMS[i];
      p.routines.forEach(([name, exs], k) => state.routines.push({ id: Date.now() + k, name, exercises: [...exs] }));
      closeSheet(); toast(`Added ${p.name}`); break;
    }
    case "addex": { const v = $("#addex").value.trim(); if (!v) return; a.exercises.push(newExercise(v)); break; }
    case "rest-add": restEnd += 30000; restTotal += 30; tickRest(); return;
    case "rest-skip": stopRest(); return;
    case "accent": state.settings.accent = b.dataset.k; applyTheme(); break;
    case "sound": state.settings.sound = !state.settings.sound; if (state.settings.sound) sfx("set"); break;
    case "edit": save(); go("editRoutine:" + id); return;
    case "back": save(); go("routines"); return;
    case "newroutine": { const r = { id: Date.now(), name: "New routine", exercises: [] };
      state.routines.push(r); save(); go("editRoutine:" + r.id); return; }
    case "r-up": move(state.routines, +i, +i - 1); break;
    case "r-down": move(state.routines, +i, +i + 1); break;
    case "r-rename": { const r = routine(), v = prompt("Rename routine", r.name)?.trim(); if (!v) return; r.name = v; break; }
    case "exadd": { const v = $("#newex").value.trim(); if (!v) return; routine().exercises.push(v); break; }
    case "exsugg": routine().exercises.push(b.dataset.name); break;
    case "exdel": routine().exercises.splice(i, 1); break;
    case "exup": move(routine().exercises, +i, +i - 1); break;
    case "exdown": move(routine().exercises, +i, +i + 1); break;
    case "exrename": { const ex = routine().exercises, v = prompt("Rename exercise", ex[i])?.trim(); if (!v) return; ex[i] = v; break; }
    case "delroutine": if (!confirm(`Delete "${routine().name}"? Your workout history stays.`)) return;
      state.routines = state.routines.filter(x => x.id != id); save(); go("routines"); return;
    case "delworkout": if (!confirm("Delete this workout from history?")) return;
      state.workouts = state.workouts.filter(w => w.id != id); break;
    case "logbw": {
      const v = +$("#bw").value; if (!v) return;
      const today = new Date().toDateString();
      state.bodyweight = state.bodyweight.filter(x => new Date(x.d).toDateString() !== today);
      state.bodyweight.push({ d: Date.now(), v });
      checkBadges().forEach(b => toast(`${b.icon} Badge unlocked: ${b.name}`)); break;
    }
    case "export": exportData(); return;
  }
  save(); render();
});

document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.f && state.active) {
    const s = state.active.exercises[t.dataset.ei].sets[t.dataset.si];
    s[t.dataset.f] = t.value === "" ? "" : +t.value; save();
  }
  if (t.id === "rname") { state.routines.find(x => x.id == t.dataset.id).name = t.value.trim() || "Routine"; save(); render(); }
  if (t.id === "note") { const v = t.value.trim(); if (v) state.notes[t.dataset.ex] = v; else delete state.notes[t.dataset.ex]; save(); if (state.active) render(); }
  if (t.id === "set-rest") { state.settings.rest = t.value === "auto" ? "auto" : +t.value; save(); }
  if (t.id === "set-goal") { state.settings.weeklyGoal = +t.value; save(); }
  if (t.id === "set-unit") { state.settings.unit = t.value; save(); }
  if (t.id === "pick-ex") { progressEx = t.value; render(); }
  if (t.id === "import") importData(t.files[0]);
});

document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  if (e.target.id === "addex") document.querySelector('[data-act="addex"]').click();
  if (e.target.id === "newex") document.querySelector('[data-act="exadd"]').click();
  if (e.target.id === "plate-w") document.querySelector('[data-act="plates-calc"]').click();
  if (e.target.id === "bw") document.querySelector('[data-act="logbw"]').click();
});

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `lift-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

function importData(file) {
  if (!file) return;
  file.text().then(txt => {
    try {
      const d = JSON.parse(txt);
      if (!Array.isArray(d.workouts)) throw 0;
      if (!confirm("Replace everything on this phone with the backup?")) return;
      state = { ...structuredClone(DEFAULT), ...d, settings: { ...DEFAULT.settings, ...d.settings } };
      backfillXP(); save(); applyTheme(); go("home"); toast("Backup restored");
    } catch { alert("That file isn't a Lift Tracker backup."); }
  });
}

// Existing lifters get XP for the workouts they logged before levels existed.
function backfillXP() {
  if (state.xp == null) state.xp = state.workouts.reduce((t, w) => t + XP.workout + w.sets.length * XP.set, 0);
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
backfillXP(); save();
applyTheme();
go(tab);
