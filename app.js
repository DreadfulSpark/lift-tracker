// Lift Tracker: all data lives in this phone's browser storage (localStorage).

const KEY = "lift-tracker-v1";
const DEFAULT = {
  routines: [
    { id: 1, name: "Push day", exercises: ["Bench press", "Overhead press", "Incline dumbbell press", "Tricep pushdown"] },
    { id: 2, name: "Pull day", exercises: ["Deadlift", "Pull-up", "Barbell row", "Bicep curl"] },
    { id: 3, name: "Leg day", exercises: ["Squat", "Romanian deadlift", "Leg press", "Calf raise"] },
  ],
  workouts: [],   // finished: { id, date, routine, minutes, sets: [{ ex, w, r }] }
  active: null,   // in progress: { routine, start, exercises: [{ name, sets: [{ w, r, done }] }] }
  nextRoutine: 0,
  settings: { rest: 90, unit: "lb" },
};

let state = load();
let tab = state.active ? "workout" : "home";
let progressEx = null;

function load() {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY)) }; }
  catch { return structuredClone(DEFAULT); }
}
function save() { localStorage.setItem(KEY, JSON.stringify(state)); }

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const oneRM = (w, r) => w * (1 + r / 30); // Epley estimate
const fmtDate = d => new Date(d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const unit = () => state.settings.unit;

// ---------- Stats helpers ----------

function lastSetsFor(ex) {
  for (let i = state.workouts.length - 1; i >= 0; i--) {
    const sets = state.workouts[i].sets.filter(s => s.ex === ex);
    if (sets.length) return sets;
  }
  return [];
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

function thisWeek() {
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - start.getDay());
  const ws = state.workouts.filter(w => new Date(w.date) >= start);
  const vol = ws.reduce((t, w) => t + w.sets.reduce((a, s) => a + s.w * s.r, 0), 0);
  return { count: ws.length, vol };
}

const shortNum = n => n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : String(Math.round(n));

// ---------- Views ----------

function render() {
  document.querySelectorAll(".tabs button").forEach(b =>
    b.classList.toggle("on", b.dataset.tab === tab || (tab === "workout" && b.dataset.tab === "home")));
  $("#view").innerHTML = ({ home, routines, workout, progress, history, editRoutine })[tab.split(":")[0]]();
  window.scrollTo(0, 0);
}

function home() {
  if (state.active) return workout();
  const r = state.routines[state.nextRoutine % state.routines.length];
  const wk = thisWeek();
  const recent = state.workouts.slice(-3).reverse();
  const hour = new Date().getHours();
  const hi = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  return `
    <div class="sub">${fmtDate(Date.now())}</div>
    <h1>${hi}, ready to lift?</h1>
    ${r ? `<div class="card hero">
      <div style="font-size:13px">Up next</div>
      <h2>${esc(r.name)}</h2>
      <div style="font-size:13px;margin-bottom:12px">${r.exercises.map(esc).join(" · ")}</div>
      <button class="btn dark wide" data-act="start" data-id="${r.id}">▶ Start workout</button>
    </div>` : ""}
    <div class="grid3">
      <div class="stat"><span class="sub">Streak</span><b>${streakDays()} d</b></div>
      <div class="stat"><span class="sub">This week</span><b>${wk.count}</b></div>
      <div class="stat"><span class="sub">Volume</span><b>${shortNum(wk.vol)}</b></div>
    </div>
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
      const last = lastSetsFor(e.name);
      return `<div class="card" style="margin-top:12px">
        <div class="row between"><div class="row"><b>${esc(e.name)}</b>
          <a class="form-link" href="${formLink(e.name)}" target="_blank" rel="noopener">▶ Form</a></div>
          ${bestFor(e.name) ? `<span class="pr">🏆 ${Math.round(bestFor(e.name))} ${unit()}</span>` : ""}</div>
        ${last.length ? `<div class="last">Last: ${last.map(s => `${s.w}×${s.r}`).join(", ")}</div>` : `<div class="last">First time, pick a starting weight</div>`}
        <div class="set" style="margin-top:8px"><span class="num sub">Set</span><span class="sub" style="text-align:center">${unit()}</span><span class="sub" style="text-align:center">Reps</span><span></span></div>
        ${e.sets.map((s, si) => `<div class="set ${s.done ? "done" : ""}">
          <span class="num">${si + 1}</span>
          <input type="number" inputmode="decimal" value="${s.w}" data-ei="${ei}" data-si="${si}" data-f="w">
          <input type="number" inputmode="numeric" value="${s.r}" data-ei="${ei}" data-si="${si}" data-f="r">
          <button class="check" data-act="toggle" data-ei="${ei}" data-si="${si}">✓</button>
        </div>`).join("")}
        <div class="row" style="margin-top:6px">
          <button class="btn small ghost" data-act="addset" data-ei="${ei}">+ Set</button>
          ${e.sets.length > 1 ? `<button class="btn small danger" data-act="delset" data-ei="${ei}">− Set</button>` : ""}
        </div>
      </div>`;
    }).join("")}
    <div class="card"><input id="addex" placeholder="Add an exercise (e.g. Lateral raise)">
      <button class="btn ghost wide" style="margin-top:8px" data-act="addex">+ Add exercise</button></div>
    <button class="btn danger wide" data-act="discard">Discard workout</button>
  `;
}

function routines() {
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
    <button class="btn ghost wide" data-act="newroutine">+ New routine</button>
    <h2>Settings</h2>
    <div class="card">
      <div class="row between"><span>Rest timer</span>
        <select id="set-rest" style="width:auto">${[60, 90, 120, 180, 240].map(s =>
          `<option value="${s}" ${s == state.settings.rest ? "selected" : ""}>${s / 60 >= 1 ? (s / 60) + " min" : s + " s"}</option>`).join("")}</select></div>
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
      <datalist id="ex-list">${Object.keys(EXERCISES).map(n => `<option value="${esc(n)}">`).join("")}</datalist>
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
  const names = [...new Set(state.workouts.flatMap(w => w.sets.map(s => s.ex)))];
  if (!names.length) return `<h1>Progress</h1><div class="empty">Finish your first workout to see charts here.</div>`;
  if (!names.includes(progressEx)) progressEx = names[0];
  // Best estimated 1RM per workout for the chosen exercise
  const pts = state.workouts.map(w => {
    const s = w.sets.filter(x => x.ex === progressEx);
    return s.length ? { d: w.date, v: Math.max(...s.map(x => oneRM(x.w, x.r))) } : null;
  }).filter(Boolean);
  const best = Math.max(...pts.map(p => p.v));
  return `
    <h1>Progress</h1>
    <select id="pick-ex">${names.map(n => `<option ${n === progressEx ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
    <div class="card" style="margin-top:10px">
      <div class="row between"><span class="sub">Estimated 1-rep max</span><span class="pr">🏆 ${Math.round(best)} ${unit()}</span></div>
      ${chart(pts)}
    </div>
    <h2>All-time bests</h2>
    ${names.map(n => `<div class="card list-item"><span>${esc(n)}</span><span class="pr">${Math.round(bestFor(n))} ${unit()}</span></div>`).join("")}
  `;
}

function chart(pts) {
  if (pts.length < 2) return `<div class="empty" style="padding:20px">Log this lift again to see a trend.</div>`;
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

// ---------- Workout logic ----------

function startWorkout(id) {
  if (state.active && !confirm("You already have a workout going. Replace it?")) return;
  const r = state.routines.find(x => x.id == id);
  state.active = { routine: r.name, routineId: r.id, start: Date.now(), exercises: r.exercises.map(newExercise) };
  save(); tab = "workout"; render();
}

// Pre-fill with last session's numbers so logging is one tap
function newExercise(name) {
  const last = lastSetsFor(name);
  const sets = last.length ? last.map(s => ({ w: s.w, r: s.r, done: false }))
                           : [1, 2, 3].map(() => ({ w: "", r: 8, done: false }));
  return { name, sets };
}

function finishWorkout() {
  const a = state.active;
  const sets = a.exercises.flatMap(e => e.sets.filter(s => s.done && s.w !== "" && s.r)
    .map(s => ({ ex: e.name, w: +s.w, r: +s.r })));
  if (!sets.length) { if (confirm("No sets checked off. Discard this workout?")) discard(); return; }
  const prs = [...new Set(sets.map(s => s.ex))].filter(ex => {
    const prev = bestFor(ex);
    return prev && Math.max(...sets.filter(s => s.ex === ex).map(s => oneRM(s.w, s.r))) > prev;
  });
  state.workouts.push({ id: Date.now(), date: a.start, routine: a.routine,
    minutes: Math.max(1, Math.round((Date.now() - a.start) / 60000)), sets });
  const idx = state.routines.findIndex(r => r.id === a.routineId);
  if (idx >= 0) state.nextRoutine = idx + 1;
  state.active = null; stopRest(); save();
  tab = "home"; render();
  toast(prs.length ? `🏆 New PR: ${prs.join(", ")}!` : "Workout saved 💪");
}

function discard() { state.active = null; stopRest(); save(); tab = "home"; render(); }

// ---------- Rest timer ----------

let restEnd = 0, restTick = null;
function startRest() {
  restEnd = Date.now() + state.settings.rest * 1000;
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
  const tabBtn = e.target.closest("[data-tab]");
  if (tabBtn) { tab = tabBtn.dataset.tab === "home" && state.active ? "workout" : tabBtn.dataset.tab; render(); return; }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const { act, id, ei, si, i } = b.dataset;
  const a = state.active;
  const routine = () => state.routines.find(x => x.id == id);

  switch (act) {
    case "start": startWorkout(id); return;
    case "finish": finishWorkout(); return;
    case "discard": if (confirm("Throw away this workout?")) discard(); return;
    case "toggle": {
      audio ??= new AudioContext(); // unlock sound on iPhone from a tap
      const s = a.exercises[ei].sets[si];
      if (!s.done && (s.w === "" || !s.r)) { toast("Enter weight and reps first"); return; }
      s.done = !s.done; save(); render();
      if (s.done) startRest();
      return;
    }
    case "addset": { const sets = a.exercises[ei].sets; const l = sets.at(-1);
      sets.push({ w: l?.w ?? "", r: l?.r ?? 8, done: false }); break; }
    case "delset": a.exercises[ei].sets.pop(); break;
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
  if (t.id === "set-rest") { state.settings.rest = +t.value; save(); }
  if (t.id === "set-unit") { state.settings.unit = t.value; save(); }
  if (t.id === "pick-ex") { progressEx = t.value; render(); }
  if (t.id === "import") importData(t.files[0]);
});

document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  if (e.target.id === "addex") document.querySelector('[data-act="addex"]').click();
  if (e.target.id === "newex") document.querySelector('[data-act="exadd"]').click();
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
      state = { ...DEFAULT, ...d }; save(); tab = "home"; render(); toast("Backup restored");
    } catch { alert("That file isn't a Lift Tracker backup."); }
  });
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
render();
