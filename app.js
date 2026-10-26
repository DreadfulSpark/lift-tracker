// Lift Tracker: all data lives in this phone's browser storage (localStorage).

const KEY = "lift-tracker-v1";
const DEFAULT = {
  routines: [
    { id: 1, name: "Push day", exercises: ["Bench press", "Overhead press", "Incline dumbbell press", "Tricep pushdown"] },
    { id: 2, name: "Pull day", exercises: ["Deadlift", "Pull-up", "Barbell row", "Bicep curl"] },
    { id: 3, name: "Leg day", exercises: ["Squat", "Romanian deadlift", "Leg press", "Calf raise"] },
  ],
  workouts: [],   // finished: { id, date, routine, minutes, sets: [{ ex, w, r }] }
  active: null,   // in progress: { routine, start, exercises: [{ name, sets: [{ w, r, done, warm }] }] }
  nextRoutine: 0,
  notes: {},      // exercise name -> your own cues ("seat on 4")
  bodyweight: [], // [{ d, v }]
  badges: {},     // badge id -> date unlocked
  summary: null,  // last finished workout recap
  settings: { rest: "auto", unit: "lb", weeklyGoal: 4 },
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

function streakDays() {
  const days = new Set(state.workouts.map(w => new Date(w.date).toDateString()));
  let n = 0;
  const d = new Date();
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1); // today not done yet doesn't break it
  while (days.has(d.toDateString())) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function weekStart() { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - d.getDay()); return d; }

function thisWeek() {
  const ws = state.workouts.filter(w => new Date(w.date) >= weekStart());
  const vol = ws.reduce((t, w) => t + w.sets.reduce((a, s) => a + s.w * s.r, 0), 0);
  return { count: ws.length, vol };
}

const shortNum = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(Math.round(n));

// Progressive overload coach: hit 8+ reps on every set last time -> add weight, else chase reps.
const REP_GOAL = 8;
function coach(ex) {
  const last = lastSetsFor(ex);
  if (!last.length) return null;
  const top = Math.max(...last.map(s => s.w));
  const topSets = last.filter(s => s.w === top);
  if (topSets.every(s => s.r >= REP_GOAL)) {
    const bump = incStep() * (isLowerBody(ex) && isCompound(ex) ? 2 : 1);
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
];

function checkBadges() {
  const fresh = BADGES.filter(b => !state.badges[b.id] && b.test(state));
  fresh.forEach(b => state.badges[b.id] = Date.now());
  return fresh;
}

// ---------- Views ----------

function render() {
  document.querySelectorAll(".tabs button").forEach(b =>
    b.classList.toggle("on", b.dataset.tab === tab.split(":")[0] || (tab === "workout" && b.dataset.tab === "home")));
  $("#view").innerHTML = ({ home, routines, workout, progress, history, editRoutine, summary })[tab.split(":")[0]]();
  window.scrollTo(0, 0);
}

function home() {
  if (state.active) return workout();
  const r = state.routines[state.nextRoutine % state.routines.length];
  const wk = thisWeek(), goal = state.settings.weeklyGoal;
  const recent = state.workouts.slice(-3).reverse();
  const hour = new Date().getHours();
  const hi = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const since = daysSince();
  const recColor = m => since[m] === undefined ? "var(--idle)" : since[m] < 2 ? "var(--sore)" : since[m] < 3 ? "var(--warm)" : "var(--hit)";
  const ready = r ? r.exercises.flatMap(e => musclesFor(e)[0]).filter(m => since[m] !== undefined && since[m] < 2) : [];
  return `
    <div class="sub">${fmtDate(Date.now())}</div>
    <h1>${hi}, ready to lift?</h1>
    ${r ? `<div class="card hero">
      <div style="font-size:13px">Up next</div>
      <h2>${esc(r.name)}</h2>
      <div style="font-size:13px;margin-bottom:12px">${r.exercises.map(esc).join(" · ")}</div>
      ${ready.length ? `<div style="font-size:13px;margin:-6px 0 10px">⚠️ Still recovering: ${[...new Set(ready)].map(m => MUSCLES[m]).join(", ")}</div>` : ""}
      <button class="btn dark wide" data-act="start" data-id="${r.id}">▶ Start workout</button>
    </div>` : ""}
    <div class="card">
      <div class="row between"><b>Weekly goal</b><span class="sub">${wk.count} of ${goal} workouts</span></div>
      <div class="goalbar">${Array.from({ length: goal }, (_, i) => `<i class="${i < wk.count ? "on" : ""}"></i>`).join("")}</div>
      ${wk.count >= goal ? `<div class="sub" style="margin-top:6px">🎯 Goal hit. Anything else is a bonus.</div>` : ""}
    </div>
    <div class="grid3">
      <div class="stat"><span class="sub">Streak</span><b>${streakDays()} d</b></div>
      <div class="stat"><span class="sub">This week</span><b>${wk.count}</b></div>
      <div class="stat"><span class="sub">Volume</span><b>${shortNum(wk.vol)}</b></div>
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

function workout() {
  const a = state.active;
  if (!a) { tab = "home"; return home(); }
  const mins = Math.round((Date.now() - a.start) / 60000);
  return `
    <div class="row between">
      <div><div class="sub">${mins} min in</div><h1 style="margin:0">${esc(a.routine)}</h1></div>
      <button class="btn primary" data-act="finish">Finish</button>
    </div>
    ${a.exercises.map((e, ei) => {
      const last = lastSetsFor(e.name), tip = coach(e.name), note = state.notes[e.name];
      let n = 0;
      return `<div class="card" style="margin-top:12px">
        <div class="row between"><div class="row"><b>${esc(e.name)}</b>
          <a class="form-link" href="${formLink(e.name)}" target="_blank" rel="noopener">▶ Form</a></div>
          ${bestFor(e.name) ? `<span class="pr">🏆 ${Math.round(bestFor(e.name))}</span>` : ""}</div>
        ${last.length ? `<div class="last">Last: ${last.map(s => `${s.w}×${s.r}`).join(", ")}</div>` : `<div class="last">First time, pick a starting weight</div>`}
        ${tip ? `<div class="coach">📈 ${tip.tip}</div>` : ""}
        ${note ? `<div class="note">📝 ${esc(note)}</div>` : ""}
        <div class="set" style="margin-top:8px"><span class="num sub">Set</span><span class="sub" style="text-align:center">${unit()}</span><span class="sub" style="text-align:center">Reps</span><span></span></div>
        ${e.sets.map((s, si) => `<div class="set ${s.done ? "done" : ""} ${s.warm ? "warm" : ""}">
          <span class="num">${s.warm ? "W" : ++n}</span>
          <input type="number" inputmode="decimal" value="${s.w}" data-ei="${ei}" data-si="${si}" data-f="w">
          <input type="number" inputmode="numeric" value="${s.r}" data-ei="${ei}" data-si="${si}" data-f="r">
          <button class="check" data-act="toggle" data-ei="${ei}" data-si="${si}">✓</button>
        </div>`).join("")}
        <div class="tools">
          <button class="btn small ghost" data-act="addset" data-ei="${ei}">+ Set</button>
          ${e.sets.length > 1 ? `<button class="btn small ghost" data-act="delset" data-ei="${ei}">− Set</button>` : ""}
          ${e.sets.some(s => s.warm) ? "" : `<button class="btn small ghost" data-act="warmup" data-ei="${ei}">🔥 Warm-up</button>`}
          <button class="btn small ghost" data-act="plates" data-ei="${ei}">🍩 Plates</button>
          <button class="btn small ghost" data-act="swap" data-ei="${ei}">⇄ Swap</button>
          <button class="btn small ghost" data-act="info" data-ex="${esc(e.name)}">ⓘ Info</button>
        </div>
      </div>`;
    }).join("")}
    <div class="card"><input id="addex" list="ex-list" placeholder="Add an exercise (e.g. Lateral raise)">
      ${exDatalist()}
      <button class="btn ghost wide" style="margin-top:8px" data-act="addex">+ Add exercise</button></div>
    <button class="btn danger wide" data-act="discard">Discard workout</button>
  `;
}

const exDatalist = () => `<datalist id="ex-list">${Object.keys(EXERCISES).map(n => `<option value="${esc(n)}">`).join("")}</datalist>`;

function summary() {
  const s = state.summary;
  if (!s) { tab = "home"; return home(); }
  const party = s.prs.length || s.badges.length;
  return `
    ${party ? `<div class="confetti">${Array.from({ length: 40 }, (_, i) =>
      `<i style="left:${(i * 37) % 100}%;animation-delay:${(i % 10) * .12}s;background:${["#2fbf8f", "#efa027", "#ff4f7b", "#6aa8ff"][i % 4]}"></i>`).join("")}</div>` : ""}
    <div class="sub" style="text-align:center;margin-top:20px">Workout complete</div>
    <h1 style="text-align:center">${party ? "Huge session! 🏆" : "Nice work 💪"}</h1>
    <div class="card hero" style="text-align:center"><h2>${esc(s.routine)}</h2><div style="font-size:13px">${fmtDate(s.date)}</div></div>
    <div class="grid3">
      <div class="stat"><span class="sub">Time</span><b>${s.minutes} min</b></div>
      <div class="stat"><span class="sub">Sets</span><b>${s.sets}</b></div>
      <div class="stat"><span class="sub">Volume</span><b>${shortNum(s.volume)}</b></div>
    </div>
    ${s.prs.length ? `<div class="card"><b>New personal records</b>${s.prs.map(p =>
      `<div class="list-item" style="margin-top:8px"><span>${esc(p.ex)}</span><span class="pr">${Math.round(p.v)} ${unit()} est. max</span></div>`).join("")}</div>` : ""}
    ${s.badges.length ? `<div class="card"><b>Badges unlocked</b><div class="badges" style="margin-top:8px">${s.badges.map(id => badgeTile(BADGES.find(b => b.id === id), true)).join("")}</div></div>` : ""}
    <div class="card"><b>Muscles you trained</b>${bodyMap(s.exercises)}</div>
    <button class="btn primary wide" data-act="done-summary">Done</button>
  `;
}

const badgeTile = (b, on) => `<div class="badge ${on ? "" : "locked"}"><span>${b.icon}</span><b>${b.name}</b><small>${b.about}</small></div>`;

function routines() {
  const restOpts = ["auto", 60, 90, 120, 180, 240];
  return `
    <h1>Routines</h1>
    ${state.routines.map(r => `<div class="card">
      <div class="row between"><b>${esc(r.name)}</b>
        <div class="row"><button class="btn small ghost" data-act="edit" data-id="${r.id}">Edit</button>
        <button class="btn small primary" data-act="start" data-id="${r.id}">Start</button></div></div>
      <div class="row" style="margin-top:8px;align-items:flex-start">
        <div style="flex:1">${r.exercises.map(e => `<span class="chip">${esc(e)}</span>`).join("")}</div>
        ${bodyMap(r.exercises, true)}</div>
    </div>`).join("")}
    <div class="row"><button class="btn ghost" style="flex:1" data-act="newroutine">+ New routine</button>
      <button class="btn ghost" style="flex:1" data-act="programs">📚 Programs</button></div>
    <h2>Settings</h2>
    <div class="card">
      <div class="row between"><span>Rest timer</span>
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
  return `
    <button class="btn small ghost" data-act="back">‹ Back</button>
    <h1 style="margin-top:12px">Edit routine</h1>
    <input id="rname" value="${esc(r.name)}" data-id="${r.id}" placeholder="Session name (e.g. Push day)">
    <div class="card" style="margin-top:12px">
      <div class="row between"><b>Muscles worked</b>
        <span class="legend"><i style="background:var(--hit)"></i>Main <i style="background:var(--hit2)"></i>Helper</span></div>
      ${bodyMap(r.exercises)}
    </div>
    ${suggestions(r)}
    <h2>Exercises</h2>
    ${r.exercises.map((e, i) => `<div class="card list-item"><div>${esc(e)}
        <div class="sub" style="font-size:12px">${musclesFor(e)[0].map(m => MUSCLES[m]).join(", ") || "Unknown muscles"}</div></div>
      <div class="row">
        <a class="btn small ghost" href="${formLink(e)}" target="_blank" rel="noopener">▶ Form</a>
        ${i > 0 ? `<button class="btn small ghost" data-act="exup" data-id="${r.id}" data-i="${i}">↑</button>` : ""}
        <button class="btn small danger" data-act="exdel" data-id="${r.id}" data-i="${i}">✕</button></div></div>`).join("")}
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
  const heat = m => wsets[m] >= 10 ? "var(--hit)" : wsets[m] >= 5 ? "var(--hit2)" : wsets[m] > 0 ? "#2d4a41" : "var(--idle)";
  const names = [...new Set(state.workouts.flatMap(w => w.sets.map(s => s.ex)))];
  if (!names.includes(progressEx)) progressEx = names[0];
  const pts = state.workouts.map(w => {
    const s = w.sets.filter(x => x.ex === progressEx);
    return s.length ? { d: w.date, v: Math.max(...s.map(x => oneRM(x.w, x.r))) } : null;
  }).filter(Boolean);
  const bw = state.bodyweight;
  return `
    <h1>Progress</h1>
    <div class="card">
      <div class="row between"><b>This week's sets</b>
        <span class="legend"><i style="background:#2d4a41"></i>1-4 <i style="background:var(--hit2)"></i>5-9 <i style="background:var(--hit)"></i>10+</span></div>
      ${colorMap(heat)}
      <div class="sub" style="margin:8px 0">10–20 hard sets per muscle a week is the sweet spot for growth.</div>
      ${Object.values(wsets).some(n => !n) ? `<div class="sub" style="font-size:13px;margin-bottom:6px">Not trained this week: ${Object.keys(wsets).filter(m => !wsets[m]).map(m => MUSCLES[m]).join(", ")}</div>` : ""}
      ${Object.entries(wsets).filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([m, n]) => `<div class="mbar">
        <span>${MUSCLES[m]}</span><div><i style="width:${Math.min(100, n / 20 * 100)}%;background:${n >= 10 ? "var(--hit)" : n >= 5 ? "var(--hit2)" : "#555"}"></i></div><b>${+n.toFixed(1)}</b></div>`).join("")}
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
  const start = weekStart(); start.setDate(start.getDate() - 15 * 7);
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
    <polyline points="${xy.map(p => p.join(",")).join(" ")}" fill="none" stroke="#2fbf8f" stroke-width="3" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    ${xy.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="#2fbf8f"/>`).join("")}
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

function platesSheet(weight) {
  const { bar, plates } = PLATES[unit()];
  let left = (weight - bar) / 2;
  const used = [];
  if (left > 0) plates.forEach(p => { while (left >= p - 1e-9) { used.push(p); left -= p; } });
  return `<h2>Plate calculator</h2>
    <div class="row"><input id="plate-w" type="number" inputmode="decimal" value="${weight}">
      <button class="btn primary" data-act="plates-calc">Go</button></div>
    ${weight < bar ? `<div class="empty">That's lighter than the ${bar} ${unit()} bar.</div>` : `
    <div class="bar-vis"><div class="bar-sleeve">${used.map(p =>
      `<i style="height:${[100, 92, 84, 64, 50, 40, 34][plates.indexOf(p)]}px;background:${PLATE_COLORS[plates.indexOf(p)]}"></i>`).join("")}</div></div>
    <div style="text-align:center;font-size:18px;margin:6px 0"><b>Each side:</b> ${used.length ? used.join(" + ") : "nothing, just the bar"}</div>
    <div class="sub" style="text-align:center">${bar} ${unit()} bar${left > 0.01 ? ` · ${+(left * 2).toFixed(2)} ${unit()} can't be made with standard plates` : ""}</div>`}`;
}

function infoSheet(ex) {
  const sessions = sessionsFor(ex), best = bestFor(ex);
  const [p, s] = musclesFor(ex);
  return `<h2>${esc(ex)}</h2>
    <div class="sub">Main: ${p.map(m => MUSCLES[m]).join(", ") || "?"}${s.length ? ` · Helpers: ${s.map(m => MUSCLES[m]).join(", ")}` : ""}</div>
    <a class="btn ghost wide" style="margin:10px 0;text-align:center" href="${formLink(ex)}" target="_blank" rel="noopener">▶ Watch form videos on TikTok</a>
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
      <span>⇄ ${esc(n)}</span><span class="sub">${musclesFor(n)[0].map(m => MUSCLES[m]).join(", ")}</span></button>`).join("")
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
  state.active = { routine: r.name, routineId: r.id, start: Date.now(), exercises: r.exercises.map(newExercise) };
  save(); tab = "workout"; render();
}

// Pre-fill with the coach's target (or last session) so logging is one tap.
function newExercise(name) {
  const c = coach(name);
  const sets = c ? Array.from({ length: c.sets }, () => ({ w: c.w, r: c.r, done: false }))
                 : [1, 2, 3].map(() => ({ w: "", r: REP_GOAL, done: false }));
  return { name, sets };
}

function warmupSets(work) {
  const step = incStep(), bar = PLATES[unit()].bar;
  return [[0.5, 8], [0.7, 5], [0.85, 3]]
    .map(([pc, r]) => ({ w: Math.max(bar, round(work * pc, step)), r, done: false, warm: true }))
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
  state.workouts.push({ id: Date.now(), date: a.start, routine: a.routine, minutes, sets });
  const idx = state.routines.findIndex(r => r.id === a.routineId);
  if (idx >= 0) state.nextRoutine = idx + 1;
  const badges = checkBadges().map(b => b.id);
  state.summary = { routine: a.routine, date: a.start, minutes, sets: sets.length, prs, badges,
    volume: sets.reduce((t, s) => t + s.w * s.r, 0), exercises: [...new Set(sets.map(s => s.ex))] };
  state.active = null; stopRest(); save();
  tab = "summary"; render();
  if (prs.length || badges.length) beep();
}

function discard() { state.active = null; stopRest(); save(); tab = "home"; render(); }

// ---------- Rest timer ----------

let restEnd = 0, restTick = null;
function startRest(secs) {
  restEnd = Date.now() + secs * 1000;
  $("#rest").classList.remove("hidden");
  clearInterval(restTick); restTick = setInterval(tickRest, 250); tickRest();
}
function tickRest() {
  const left = Math.max(0, Math.ceil((restEnd - Date.now()) / 1000));
  $("#rest-time").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  if (left === 0) { beep(); navigator.vibrate?.([200, 100, 200]); stopRest(); }
}
function stopRest() { clearInterval(restTick); $("#rest").classList.add("hidden"); }

let audio;
function beep() {
  try {
    audio ??= new AudioContext();
    [0, .25, .5].forEach(t => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = 880; g.gain.value = .2;
      o.connect(g).connect(audio.destination);
      o.start(audio.currentTime + t); o.stop(audio.currentTime + t + .15);
    });
  } catch {}
}

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 2800);
}

// ---------- Events ----------

document.addEventListener("click", e => {
  if (e.target.id === "sheet") { closeSheet(); return; }
  const tabBtn = e.target.closest("[data-tab]");
  if (tabBtn) { closeSheet(); tab = tabBtn.dataset.tab === "home" && state.active ? "workout" : tabBtn.dataset.tab; render(); return; }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const { act, id, ei, si, i } = b.dataset;
  const a = state.active;
  const routine = () => state.routines.find(x => x.id == id);

  switch (act) {
    case "start": startWorkout(id); return;
    case "finish": finishWorkout(); return;
    case "discard": if (confirm("Throw away this workout?")) discard(); return;
    case "done-summary": tab = "home"; render(); return;
    case "close-sheet": closeSheet(); return;
    case "toggle": {
      audio ??= new AudioContext(); // unlock sound on iPhone from a tap
      const s = a.exercises[ei].sets[si];
      if (!s.done && (s.w === "" || !s.r)) { toast("Enter weight and reps first"); return; }
      s.done = !s.done; save(); render();
      if (s.done) startRest(s.warm ? 45 : restFor(a.exercises[ei].name));
      return;
    }
    case "addset": { const sets = a.exercises[ei].sets; const l = sets.at(-1);
      sets.push({ w: l?.w ?? "", r: l?.r ?? REP_GOAL, done: false }); break; }
    case "delset": a.exercises[ei].sets.pop(); break;
    case "warmup": {
      const ex = a.exercises[ei], work = +ex.sets.find(s => !s.warm)?.w;
      if (!work) { toast("Enter your working weight first"); return; }
      const w = warmupSets(work);
      if (!w.length) { toast("Too light to need a warm-up"); return; }
      ex.sets.unshift(...w); break;
    }
    case "plates": { const sets = a.exercises[ei].sets;
      const w = +sets.find(s => !s.done && !s.warm && s.w)?.w || +sets.find(s => !s.warm)?.w || PLATES[unit()].bar;
      openSheet(platesSheet(w)); return; }
    case "plates-calc": openSheet(platesSheet(+$("#plate-w").value || 0)); return;
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
    case "rest-add": restEnd += 30000; tickRest(); return;
    case "rest-skip": stopRest(); return;
    case "edit": tab = "editRoutine:" + id; break;
    case "back": tab = "routines"; break;
    case "newroutine": { const r = { id: Date.now(), name: "New routine", exercises: [] };
      state.routines.push(r); tab = "editRoutine:" + r.id; break; }
    case "exadd": { const v = $("#newex").value.trim(); if (!v) return; routine().exercises.push(v); break; }
    case "exsugg": routine().exercises.push(b.dataset.name); break;
    case "exdel": routine().exercises.splice(i, 1); break;
    case "exup": { const ex = routine().exercises; [ex[i - 1], ex[i]] = [ex[i], ex[i - 1]]; break; }
    case "delroutine": if (!confirm("Delete this routine?")) return;
      state.routines = state.routines.filter(x => x.id != id); tab = "routines"; break;
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
      save(); tab = "home"; render(); toast("Backup restored");
    } catch { alert("That file isn't a Lift Tracker backup."); }
  });
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
render();
