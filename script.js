const STORAGE_KEY = "bloat_tracker_static_v1";
const $ = (id) => document.getElementById(id);

const state = {
  meals: [],
  symptoms: [],
  mealTags: [],
};

function pad(n) { return String(n).padStart(2, "0"); }

function nowLocalISOStringMinute() {
  const d = new Date();
  d.setSeconds(0, 0);
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function parseLocalDateTime(input) {
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeFood(tag) {
  return tag
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
}

function formatWhen(dtLocalStr) {
  const d = parseLocalDateTime(dtLocalStr);
  if (!d) return dtLocalStr;
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toCSVRow(values) {
  return values
    .map((v) => {
      const s = String(v ?? "");
      if (/[\n\r,\"]/g.test(s)) return `"${s.replace(/\"/g, '""')}"`;
      return s;
    })
    .join(",");
}

function downloadText(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function uid() {
  return (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).toString();
}

function save() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      meals: state.meals,
      symptoms: state.symptoms,
      v: 1,
      savedAt: new Date().toISOString(),
    })
  );
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.meals = Array.isArray(data.meals) ? data.meals : [];
    state.symptoms = Array.isArray(data.symptoms) ? data.symptoms : [];
  } catch {}
}

function setDefaults() {
  $("mealAt").value = nowLocalISOStringMinute();
  $("symAt").value = nowLocalISOStringMinute();
}

function renderMealTags() {
  const wrap = $("mealTags");
  const input = $("mealTagInput");
  [...wrap.querySelectorAll(".chip")].forEach((n) => n.remove());

  state.mealTags.forEach((t) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = t;

    const x = document.createElement("button");
    x.type = "button";
    x.className = "chipX";
    x.textContent = "×";
    x.title = "Remove";
    x.addEventListener("click", (e) => {
      e.stopPropagation();
      state.mealTags = state.mealTags.filter((z) => z !== t);
      renderMealTags();
    });

    chip.appendChild(x);
    wrap.insertBefore(chip, input);
  });
}

function addTag(raw) {
  const t = normalizeFood(raw);
  if (!t) return;
  if (state.mealTags.includes(t)) return;
  state.mealTags.push(t);
  renderMealTags();
}

function updateFoodSuggestions() {
  const dl = document.getElementById("foodSuggestions");
  if (!dl) return;

  const foods = new Set();
  state.meals.forEach((m) => (m.tags || []).forEach((t) => foods.add(t)));

  dl.innerHTML = "";
  [...foods].sort().forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f;
    dl.appendChild(opt);
  });
}

function initTagInput() {
  const wrap = $("mealTags");
  const input = $("mealTagInput");

  wrap.addEventListener("click", () => input.focus());

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input.value);
      input.value = "";
      return;
    }
    if (e.key === "Backspace" && !input.value && state.mealTags.length) {
      state.mealTags.pop();
      renderMealTags();
    }
  });

  input.addEventListener("paste", (e) => {
    const text = e.clipboardData?.getData("text") ?? "";
    if (!text) return;
    if (text.includes(",") || text.includes("\n")) {
      e.preventDefault();
      text
        .split(/[\n,]/g)
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach(addTag);
      input.value = "";
    }
  });
}

function addMeal() {
  const at = $("mealAt").value;
  const d = parseLocalDateTime(at);
  if (!d) return alert("Meal time looks invalid.");
  if (!state.mealTags.length) return alert("Add at least one food tag.");

  const item = {
    id: uid(),
    at,
    tags: [...state.mealTags],
    portion: $("mealPortion").value,
    notes: $("mealNotes").value.trim(),
  };

  state.meals.unshift(item);
  state.mealTags = [];
  $("mealNotes").value = "";
  $("mealPortion").value = "M";
  $("mealAt").value = nowLocalISOStringMinute();
  renderMealTags();

  save();
  updateFoodSuggestions();
  renderAll();
}

function addSymptom() {
  const at = $("symAt").value;
  const d = parseLocalDateTime(at);
  if (!d) return alert("Symptom time looks invalid.");

  const b = Number($("bloat").value);
  if (!(b >= 0 && b <= 10)) return alert("Bloating must be 0–10.");

  const gas = $("gas").value === "" ? null : Number($("gas").value);
  const pain = $("pain").value === "" ? null : Number($("pain").value);

  const item = {
    id: uid(),
    at,
    bloat: b,
    gas,
    pain,
    notes: $("symNotes").value.trim(),
  };

  state.symptoms.unshift(item);
  $("symNotes").value = "";
  $("gas").value = "";
  $("pain").value = "";
  $("bloat").value = "5";
  $("symAt").value = nowLocalISOStringMinute();

  save();
  renderAll();
}

function deleteMeal(id) {
  state.meals = state.meals.filter((m) => m.id !== id);
  save();
  updateFoodSuggestions();
  renderAll();
}

function deleteSymptom(id) {
  state.symptoms = state.symptoms.filter((s) => s.id !== id);
  save();
  renderAll();
}

function computeInsights() {
  const windowHours = Number($("windowHours").value);
  const minCount = Number($("minCount").value);
  const windowMs = windowHours * 60 * 60 * 1000;

  const mealsParsed = state.meals
    .map((m) => ({ ...m, t: parseLocalDateTime(m.at)?.getTime() ?? null }))
    .filter((m) => m.t !== null);

  const symsParsed = state.symptoms
    .map((s) => ({ ...s, t: parseLocalDateTime(s.at)?.getTime() ?? null }))
    .filter((s) => s.t !== null);

  if (!symsParsed.length) return { baseline: null, rows: [] };

  const baseline =
    symsParsed.reduce((sum, s) => sum + Number(s.bloat || 0), 0) / symsParsed.length;

  const byFood = new Map();

  for (const s of symsParsed) {
    const start = s.t - windowMs;
    const end = s.t;

    const tagsInWindow = new Set();
    for (const m of mealsParsed) {
      if (m.t >= start && m.t < end) {
        (m.tags || []).forEach((tag) => tagsInWindow.add(tag));
      }
    }

    for (const tag of tagsInWindow) {
      const entry = byFood.get(tag) || { food: tag, count: 0, sumBloat: 0, highCount: 0 };
      entry.count += 1;
      entry.sumBloat += s.bloat;
      if (s.bloat >= 7) entry.highCount += 1;
      byFood.set(tag, entry);
    }
  }

  const rows = [...byFood.values()]
    .filter((r) => r.count >= minCount)
    .map((r) => {
      const avg = r.sumBloat / r.count;
      const lift = avg - baseline;
      const highRate = r.highCount / r.count;
      return { ...r, avgBloat: avg, lift, highRate };
    })
    .sort((a, b) => b.lift - a.lift);

  return { baseline, rows };
}

function renderInsights() {
  const { baseline, rows } = computeInsights();

  $("baseline").textContent =
    baseline == null ? "Baseline bloating: —" : `Baseline bloating: ${baseline.toFixed(2)}`;

  const empty = $("insightsEmpty");
  const wrap = $("insightsTableWrap");
  const body = $("insightsBody");
  body.innerHTML = "";

  if (!rows.length) {
    empty.style.display = "block";
    wrap.style.display = "none";
    return;
  }

  empty.style.display = "none";
  wrap.style.display = "block";

  rows.forEach((r) => {
    const tr = document.createElement("tr");

    const tdFood = document.createElement("td");
    tdFood.className = "foodCell";
    tdFood.textContent = r.food;

    const tdCount = document.createElement("td");
    tdCount.textContent = r.count;

    const tdAvg = document.createElement("td");
    tdAvg.textContent = r.avgBloat.toFixed(2);

    const tdLift = document.createElement("td");
    tdLift.className = r.lift >= 0 ? "pos" : "neg";
    tdLift.textContent = `${r.lift >= 0 ? "+" : ""}${r.lift.toFixed(2)}`;

    const tdHigh = document.createElement("td");
    tdHigh.textContent = `${Math.round(r.highRate * 100)}%`;

    tr.appendChild(tdFood);
    tr.appendChild(tdCount);
    tr.appendChild(tdAvg);
    tr.appendChild(tdLift);
    tr.appendChild(tdHigh);

    body.appendChild(tr);
  });
}

function renderMeals() {
  const list = $("mealsList");
  const empty = $("mealsEmpty");
  list.innerHTML = "";

  if (!state.meals.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  state.meals.slice(0, 12).forEach((m) => {
    const item = document.createElement("div");
    item.className = "listItem";

    const top = document.createElement("div");
    top.className = "listTop";

    const when = document.createElement("div");
    when.className = "when";
    when.textContent = formatWhen(m.at);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "linkDanger";
    del.textContent = "delete";
    del.addEventListener("click", () => deleteMeal(m.id));

    top.appendChild(when);
    top.appendChild(del);

    const chips = document.createElement("div");
    chips.className = "chipRow";

    (m.tags || []).forEach((t) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = t;
      chips.appendChild(chip);
    });

    const portion = document.createElement("span");
    portion.className = "pill";
    portion.textContent = m.portion || "M";
    chips.appendChild(portion);

    item.appendChild(top);
    item.appendChild(chips);

    if (m.notes) {
      const notes = document.createElement("div");
      notes.className = "notes";
      notes.textContent = m.notes;
      item.appendChild(notes);
    }

    list.appendChild(item);
  });
}

function renderSymptoms() {
  const list = $("symsList");
  const empty = $("symsEmpty");
  list.innerHTML = "";

  if (!state.symptoms.length) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  state.symptoms.slice(0, 12).forEach((s) => {
    const item = document.createElement("div");
    item.className = "listItem";

    const top = document.createElement("div");
    top.className = "listTop";

    const when = document.createElement("div");
    when.className = "when";
    when.textContent = formatWhen(s.at);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "linkDanger";
    del.textContent = "delete";
    del.addEventListener("click", () => deleteSymptom(s.id));

    top.appendChild(when);
    top.appendChild(del);

    const chips = document.createElement("div");
    chips.className = "chipRow";

    const muted1 = document.createElement("span");
    muted1.className = "muted";
    muted1.textContent = "Bloat";
    chips.appendChild(muted1);

    const pill = document.createElement("span");
    const b = Number(s.bloat);
    pill.className = `pill ${b >= 7 ? "pill-high" : b >= 4 ? "pill-mid" : "pill-low"}`;
    pill.textContent = b;
    chips.appendChild(pill);

    item.appendChild(top);
    item.appendChild(chips);

    if (s.notes) {
      const notes = document.createElement("div");
      notes.className = "notes";
      notes.textContent = s.notes;
      item.appendChild(notes);
    }

    list.appendChild(item);
  });
}

function renderAll() {
  state.meals.sort((a, b) => (a.at < b.at ? 1 : -1));
  state.symptoms.sort((a, b) => (a.at < b.at ? 1 : -1));

  renderInsights();
  renderMeals();
  renderSymptoms();
}

function exportCSV() {
  const lines = [];
  lines.push("type,datetime,foods,portion,bloating,gas,pain,notes");
  state.meals.forEach((m) => {
    lines.push(toCSVRow(["meal", m.at, (m.tags || []).join(";"), m.portion ?? "", "", "", "", m.notes ?? ""]));
  });
  state.symptoms.forEach((s) => {
    lines.push(toCSVRow(["symptom", s.at, "", "", s.bloat ?? "", s.gas ?? "", s.pain ?? "", s.notes ?? ""]));
  });

  const fname = `bloat-tracker-${new Date().toISOString().slice(0, 10)}.csv`;
  downloadText(fname, lines.join("\n"), "text/csv");
}

function backupJSON() {
  const fname = `bloat-tracker-${new Date().toISOString().slice(0, 10)}.json`;
  downloadText(fname, JSON.stringify({ meals: state.meals, symptoms: state.symptoms, v: 1 }, null, 2), "application/json");
}

async function restoreJSON(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (!data || (!Array.isArray(data.meals) && !Array.isArray(data.symptoms))) {
    alert("That file doesn't look like a bloat-tracker backup.");
    return;
  }
  if (Array.isArray(data.meals)) state.meals = data.meals;
  if (Array.isArray(data.symptoms)) state.symptoms = data.symptoms;

  save();
  updateFoodSuggestions();
  renderAll();
}

function clearAll() {
  if (!confirm("Clear all data from this device?")) return;
  state.meals = [];
  state.symptoms = [];
  state.mealTags = [];
  localStorage.removeItem(STORAGE_KEY);
  renderMealTags();
  updateFoodSuggestions();
  renderAll();
}

function wireEvents() {
  $("addMealBtn").addEventListener("click", addMeal);
  $("addSymBtn").addEventListener("click", addSymptom);

  $("windowHours").addEventListener("change", renderInsights);
  $("minCount").addEventListener("change", renderInsights);

  $("exportCsvBtn").addEventListener("click", exportCSV);
  $("backupJsonBtn").addEventListener("click", backupJSON);
  $("clearBtn").addEventListener("click", clearAll);

  $("restoreInput").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) restoreJSON(f);
    e.target.value = "";
  });
}

(function init() {
  load();
  updateFoodSuggestions();
  setDefaults();
  initTagInput();
  renderMealTags();
  wireEvents();
  renderAll();
})();
