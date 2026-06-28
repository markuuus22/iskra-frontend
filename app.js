// ── Искра — клиентская логика ───────────────────────────────────────────────

// ВАЖНО: впиши сюда URL своего бэкенда на Railway (без слэша в конце).
const API_BASE = "https://ТВОЙ-ПРОЕКТ.up.railway.app";

const BATCH = 12;      // сколько заданий просим за один вызов модели
const REFILL_AT = 3;   // когда в корзине осталось ≤ — тихо догенерируем

// Telegram WebApp
const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();
const haptic = (style = "medium") => tg?.HapticFeedback?.impactOccurred(style);

// ── Состояние игры ──────────────────────────────────────────────────────────
const state = {
  players: ["", ""],
  current: 0,            // индекс игрока, чей ход
  level: 1,
  setting: "дома",
  exclude: "",
  buckets: {},           // "уровень-режим" -> [ {mode, for, text}, ... ]
  used: {},              // "уровень-режим" -> [ тексты ] (антиповтор)
};

const bucketKey = (level, mode) => `${level}-${mode}`;

// ── Навигация по экранам ─────────────────────────────────────────────────────
const screens = ["age-gate", "setup", "game"];
function show(id) {
  screens.forEach((s) => {
    const el = document.getElementById(s);
    el.classList.toggle("is-active", s === id);
  });
}
function showStage(id) {
  document.getElementById("choose").classList.toggle("is-active", id === "choose");
  document.getElementById("card-stage").classList.toggle("is-active", id === "card");
}

// ── Age gate ─────────────────────────────────────────────────────────────────
document.getElementById("age-yes").onclick = () => show("setup");
document.getElementById("age-no").onclick = () => {
  document.getElementById("age-gate").innerHTML =
    '<div class="gate"><p class="lede">Возвращайся, когда будет 18.</p></div>';
  tg?.close?.();
};

// ── Настройка ────────────────────────────────────────────────────────────────
document.getElementById("setting-seg").addEventListener("click", (e) => {
  const seg = e.target.closest(".seg");
  if (!seg) return;
  document.querySelectorAll("#setting-seg .seg").forEach((s) => s.classList.remove("is-on"));
  seg.classList.add("is-on");
  state.setting = seg.dataset.val;
});

document.getElementById("start").onclick = () => {
  const a = document.getElementById("name-a").value.trim() || "Игрок 1";
  const b = document.getElementById("name-b").value.trim() || "Игрок 2";
  state.players = [a, b];
  state.exclude = document.getElementById("exclude").value.trim();
  state.current = 0;
  show("game");
  document.getElementById("game").classList.add("is-active");
  renderTurn();
  showStage("choose");
  // прогреваем колоду заранее, чтобы первая карта вышла мгновенно
  ensureBucket(state.level, "действие");
  ensureBucket(state.level, "правда");
};

// ── Переключатель жара ───────────────────────────────────────────────────────
document.getElementById("heat-seg").addEventListener("click", (e) => {
  const seg = e.target.closest(".heat-seg");
  if (!seg) return;
  document.querySelectorAll(".heat-seg").forEach((s) => s.classList.remove("is-on"));
  seg.classList.add("is-on");
  state.level = Number(seg.dataset.level);
  document.body.dataset.level = state.level;   // переключает палитру/свечение
  haptic("light");
  // прогреваем новый уровень
  ensureBucket(state.level, "действие");
  ensureBucket(state.level, "правда");
});

// ── Выбор «Правда / Действие» ────────────────────────────────────────────────
document.getElementById("pick-truth").onclick = () => drawCard("правда");
document.getElementById("pick-dare").onclick = () => drawCard("действие");
document.getElementById("skip-turn").onclick = () => nextTurn();

document.getElementById("done").onclick = () => nextTurn();
document.getElementById("skip-card").onclick = () => drawCard(currentMode);

// ── Сетевой слой ─────────────────────────────────────────────────────────────
async function fetchBatch(level, mode, count) {
  const key = bucketKey(level, mode);
  const res = await fetch(`${API_BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name_a: state.players[0],
      name_b: state.players[1],
      level,
      mode,
      setting: state.setting,
      exclude: state.exclude,
      used: state.used[key] || [],
      count,
    }),
  });
  if (!res.ok) throw new Error("generate failed");
  const data = await res.json();
  return data.tasks || [];
}

// Догенерируем корзину, если она пустеет. inFlight — чтобы не дублировать запросы.
const inFlight = {};
async function ensureBucket(level, mode, min = REFILL_AT) {
  const key = bucketKey(level, mode);
  state.buckets[key] = state.buckets[key] || [];
  if (state.buckets[key].length > min || inFlight[key]) return;
  inFlight[key] = true;
  try {
    const tasks = await fetchBatch(level, mode, BATCH);
    const seen = new Set(state.used[key] || []);
    for (const t of tasks) {
      if (!seen.has(t.text)) state.buckets[key].push(t);
    }
  } catch (_) {
    /* тихо: покажем ошибку только если карта реально не вышла */
  } finally {
    inFlight[key] = false;
  }
}

// ── Вытягивание карточки ─────────────────────────────────────────────────────
let currentMode = "действие";

async function drawCard(mode) {
  currentMode = mode;
  const level = state.level;
  const key = bucketKey(level, mode);
  showStage("card");

  const kindEl = document.getElementById("card-kind");
  const textEl = document.getElementById("card-text");
  const forEl = document.getElementById("card-for");
  kindEl.textContent = mode === "правда" ? "Правда" : "Действие";
  forEl.textContent = "";

  // если в корзине пусто — показываем загрузку и ждём генерацию
  if (!state.buckets[key] || state.buckets[key].length === 0) {
    textEl.classList.add("loading");
    textEl.textContent = "Тасуем колоду…";
    await ensureBucket(level, mode, 0);
  }

  const card = state.buckets[key]?.shift();
  if (!card) {
    textEl.classList.remove("loading");
    textEl.textContent = "Колода не пришла. Проверь связь и нажми ещё раз.";
    return;
  }

  // запоминаем, чтобы не повторять
  state.used[key] = state.used[key] || [];
  state.used[key].push(card.text);
  if (state.used[key].length > 40) state.used[key].shift();

  // показываем
  textEl.classList.remove("loading");
  textEl.textContent = card.text;
  forEl.textContent = card.for && card.for !== "оба" ? `→ ${card.for}` : "→ вместе";

  const cardEl = document.getElementById("card");
  cardEl.classList.remove("reveal");
  void cardEl.offsetWidth;     // рестарт анимации
  cardEl.classList.add("reveal");
  haptic("medium");

  // фоном докидываем, если осталось мало
  ensureBucket(level, mode);
}

// ── Ход / ротация ────────────────────────────────────────────────────────────
function renderTurn() {
  document.getElementById("turn-name").textContent = state.players[state.current];
}
function nextTurn() {
  state.current = 1 - state.current;
  renderTurn();
  showStage("choose");
}
