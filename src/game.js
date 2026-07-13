const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const ui = {
  hearts: document.querySelector("#hearts"),
  combo: document.querySelector("#combo"),
  gold: document.querySelector("#gold"),
  score: document.querySelector("#score"),
  depth: document.querySelector("#depth"),
  roomName: document.querySelector("#room-name"),
  objective: document.querySelector("#objective"),
  sealStatus: document.querySelector("#seal-status"),
  timingText: document.querySelector("#timing-text"),
  timingDot: document.querySelector("#timing-dot"),
  beatCursorLeft: document.querySelector("#beat-cursor-left"),
  beatCursorRight: document.querySelector("#beat-cursor-right"),
  beatConsole: document.querySelector(".beat-console"),
  touchPad: document.querySelector("#touch-pad"),
  beatNumber: document.querySelector("#beat-number"),
  overlay: document.querySelector("#overlay"),
  start: document.querySelector("#start"),
  pause: document.querySelector("#pause"),
  pausePanel: document.querySelector("#pause-panel"),
  resume: document.querySelector("#resume"),
  restart: document.querySelector("#restart"),
  message: document.querySelector("#floating-message"),
  tempos: [...document.querySelectorAll(".tempo")],
};

const SIZE = 7;
const dirs = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const rooms = [
  {
    name: "공명 전당",
    hint: "크리스털을 압력판 위로 밀어라",
    player: [1, 3],
    exit: [5, 5],
    walls: [[3, 1], [3, 5]],
    plates: [[4, 3]],
    crystals: [[2, 3]],
    spikes: [[2, 5], [4, 1]],
    coins: [[1, 1], [5, 1], [1, 5]],
    enemies: [{ type: "bat", at: [5, 2] }],
  },
  {
    name: "쌍둥이 봉인실",
    hint: "두 룬을 동시에 밝혀라",
    player: [3, 3],
    exit: [5, 1],
    walls: [[1, 3], [3, 5]],
    plates: [[1, 1], [5, 5]],
    crystals: [[2, 2], [4, 4]],
    spikes: [[4, 2], [2, 4]],
    coins: [[1, 5], [5, 1], [3, 2]],
    enemies: [{ type: "slime", at: [4, 1] }, { type: "bat", at: [1, 4] }],
  },
  {
    name: "파수꾼의 교차로",
    hint: "가시의 박자를 읽고 봉인을 완성하라",
    player: [1, 5],
    exit: [5, 1],
    walls: [[4, 2], [2, 4], [4, 4]],
    plates: [[3, 1], [3, 5]],
    crystals: [[2, 3], [4, 3]],
    spikes: [[3, 2], [2, 3], [4, 3], [3, 4]],
    coins: [[1, 1], [5, 5], [3, 3]],
    enemies: [{ type: "knight", at: [3, 3], hp: 2 }, { type: "slime", at: [5, 4] }],
  },
];

const atlas = new Image();
atlas.src = "./assets/sprite-atlas.png";
let atlasReady = false;
atlas.addEventListener("load", () => { atlasReady = true; });

const spriteCells = {
  player: [0, 0], bat: [1, 0], slime: [2, 0], knight: [3, 0],
  coin: [0, 1], crystal: [1, 1], gate: [2, 1], spike: [3, 1],
};

const state = {
  running: false,
  paused: false,
  over: false,
  bpm: 108,
  beatMs: 60000 / 108,
  nextBeatAt: 0,
  beatIndex: 0,
  input: null,
  depth: 1,
  roomIndex: 0,
  player: null,
  enemies: [],
  crystals: [],
  plates: [],
  spikes: [],
  coins: [],
  walls: [],
  exit: null,
  gateOpen: false,
  combo: 0,
  gold: 0,
  score: 0,
  shake: 0,
  flash: 0,
  beatFlash: 0,
  beatRemain: 1,
  messageTimer: 0,
  particles: [],
  audio: null,
  lastFrame: performance.now(),
};

function entity(x, y, extra = {}) {
  return { x, y, rx: x, ry: y, squash: 0, ...extra };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function same(a, b) {
  return a.x === b.x && a.y === b.y;
}

function key(x, y) {
  return `${x},${y}`;
}

function setBpm(bpm) {
  state.bpm = bpm;
  state.beatMs = 60000 / bpm;
  ui.tempos.forEach((button) => button.classList.toggle("is-active", Number(button.dataset.bpm) === bpm));
}

function makeAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0.15;
  master.connect(context.destination);
  return { context, master };
}

function tone(frequency, duration, volume, type = "sine", delay = 0) {
  if (!state.audio) return;
  const now = state.audio.context.currentTime + delay;
  const osc = state.audio.context.createOscillator();
  const gain = state.audio.context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.connect(gain);
  gain.connect(state.audio.master);
  osc.start(now);
  osc.stop(now + duration);
}

function playBeat() {
  const accent = state.beatIndex % 4 === 1;
  tone(accent ? 92 : 72, 0.11, accent ? 0.42 : 0.25, "sine");
  tone(accent ? 740 : 1040, 0.035, 0.09, "square");
  if (accent) tone(185, 0.15, 0.08, "triangle", 0.02);
}

function playAction(kind) {
  if (kind === "perfect") {
    tone(660, 0.08, 0.12, "triangle");
    tone(990, 0.1, 0.08, "triangle", 0.035);
  } else if (kind === "hit") {
    tone(120, 0.12, 0.2, "sawtooth");
  } else if (kind === "seal") {
    [392, 523, 659].forEach((note, index) => tone(note, 0.28, 0.1, "sine", index * 0.07));
  }
}

function loadRoom(index, preservePosition = false) {
  const room = rooms[index % rooms.length];
  state.roomIndex = index % rooms.length;
  state.walls = room.walls.map(([x, y]) => ({ x, y }));
  state.plates = room.plates.map(([x, y]) => ({ x, y }));
  state.crystals = room.crystals.map(([x, y]) => entity(x, y));
  state.spikes = room.spikes.map(([x, y], i) => ({ x, y, phase: i % 2 }));
  state.coins = room.coins.map(([x, y]) => entity(x, y, { spin: Math.random() * Math.PI }));
  state.enemies = room.enemies.map((enemyData, i) => {
    const [x, y] = enemyData.at;
    return entity(x, y, {
      type: enemyData.type,
      hp: enemyData.hp || (enemyData.type === "knight" ? 2 : 1),
      phase: i % 2,
      id: `${Date.now()}-${i}`,
    });
  });
  const [px, py] = room.player;
  const hp = preservePosition && state.player ? state.player.hp : 4;
  state.player = entity(px, py, { hp, invulnerable: 0 });
  state.exit = { x: room.exit[0], y: room.exit[1] };
  state.gateOpen = false;
  state.input = null;
  ui.roomName.textContent = room.name;
  ui.objective.textContent = room.hint;
  updatePuzzle();
  updateHud();
  burst(px, py, "#42e4da", 18);
}

function resetRun() {
  state.depth = 1;
  state.combo = 0;
  state.gold = 0;
  state.score = 0;
  state.beatIndex = 0;
  state.over = false;
  state.particles = [];
  loadRoom(0);
}

function beginGame() {
  if (!state.audio) state.audio = makeAudio();
  state.audio?.context.resume();
  resetRun();
  state.running = true;
  state.paused = false;
  state.nextBeatAt = performance.now() + state.beatMs;
  ui.overlay.classList.add("is-hidden");
  ui.pausePanel.hidden = true;
  showMessage("첫 박자를 준비하세요", "good");
}

function setPaused(paused) {
  if (!state.running || state.over) return;
  state.paused = paused;
  ui.pausePanel.hidden = !paused;
  if (paused) setBeatCueClasses(false, false);
  if (!paused) state.nextBeatAt = performance.now() + state.beatMs;
}

function setBeatCueClasses(ready, beatNow) {
  ui.beatConsole.classList.toggle("beat-ready", ready);
  ui.beatConsole.classList.toggle("beat-now", beatNow);
  ui.touchPad.classList.toggle("beat-ready", ready);
  ui.touchPad.classList.toggle("beat-now", beatNow);
}

function queueInput(dir) {
  if (!state.running || state.paused || state.over) return;
  const now = performance.now();
  const untilBeat = state.nextBeatAt - now;
  const ratio = Math.abs(untilBeat) / state.beatMs;
  const quality = ratio <= 0.18 ? "perfect" : ratio <= 0.36 ? "good" : "miss";
  state.input = { dir, quality };
  flashButton(dir);
  if (quality === "miss") setTiming("EARLY", "bad");
  else setTiming(quality.toUpperCase(), "good");
}

function flashButton(dir) {
  const button = document.querySelector(`[data-dir="${dir}"]`);
  button?.classList.add("is-pressed");
  window.setTimeout(() => button?.classList.remove("is-pressed"), 100);
}

function processBeat(now) {
  state.beatIndex += 1;
  state.beatFlash = 1;
  playBeat();
  if (navigator.vibrate) navigator.vibrate(8);
  state.player.squash = 1;
  state.enemies.forEach((enemy) => { enemy.squash = 1; });

  if (state.player.invulnerable > 0) state.player.invulnerable -= 1;
  if (state.input && state.input.quality !== "miss") {
    movePlayer(state.input.dir, state.input.quality);
  } else {
    state.combo = 0;
    if (!state.input) setTiming("STEP", "");
  }
  state.input = null;

  moveEnemies();
  resolveContacts();
  resolveSpikes();
  updatePuzzle();
  updateHud();
  state.nextBeatAt = now + state.beatMs;
  ui.beatNumber.textContent = String((state.beatIndex % 4) + 1);
}

function isBlocked(x, y) {
  if (x <= 0 || y <= 0 || x >= SIZE - 1 || y >= SIZE - 1) return true;
  return state.walls.some((wall) => wall.x === x && wall.y === y);
}

function crystalAt(x, y) {
  return state.crystals.find((crystal) => crystal.x === x && crystal.y === y);
}

function enemyAt(x, y) {
  return state.enemies.find((enemy) => enemy.x === x && enemy.y === y);
}

function movePlayer(dir, quality) {
  const delta = dirs[dir];
  const tx = state.player.x + delta.x;
  const ty = state.player.y + delta.y;
  if (isBlocked(tx, ty)) {
    bump("벽에 막혔다");
    return;
  }

  const enemy = enemyAt(tx, ty);
  if (enemy) {
    enemy.hp -= quality === "perfect" ? 2 : 1;
    state.combo += quality === "perfect" ? 2 : 1;
    state.score += quality === "perfect" ? 180 : 100;
    state.shake = 7;
    burst(tx, ty, "#f06b5f", 14);
    playAction("hit");
    if (enemy.hp <= 0) {
      state.enemies = state.enemies.filter((item) => item !== enemy);
      state.gold += enemy.type === "knight" ? 3 : 1;
      showMessage("파수꾼 격파", "good");
    } else {
      showMessage("갑옷을 부쉈다", "good");
    }
    return;
  }

  const crystal = crystalAt(tx, ty);
  if (crystal) {
    const bx = tx + delta.x;
    const by = ty + delta.y;
    if (isBlocked(bx, by) || crystalAt(bx, by) || enemyAt(bx, by) || (state.exit.x === bx && state.exit.y === by)) {
      bump("크리스털이 걸렸다");
      return;
    }
    crystal.x = bx;
    crystal.y = by;
    crystal.squash = 1;
    burst(bx, by, "#42e4da", 10);
  }

  state.player.x = tx;
  state.player.y = ty;
  state.combo += quality === "perfect" ? 2 : 1;
  state.score += quality === "perfect" ? 60 : 35;
  if (quality === "perfect") playAction("perfect");

  const coin = state.coins.find((item) => same(item, state.player));
  if (coin) {
    state.coins = state.coins.filter((item) => item !== coin);
    state.gold += 1;
    state.score += 75 + state.combo * 3;
    burst(tx, ty, "#f5bd4c", 14);
    showMessage("룬 조각 +1", "good");
    tone(880, 0.12, 0.12, "triangle");
  }

  if (state.gateOpen && same(state.player, state.exit)) completeRoom();
}

function bump(message) {
  state.shake = 3;
  state.combo = 0;
  showMessage(message, "bad");
  tone(90, 0.08, 0.12, "square");
}

function moveEnemies() {
  const occupied = new Set(state.enemies.map((enemy) => key(enemy.x, enemy.y)));
  for (const enemy of state.enemies) {
    occupied.delete(key(enemy.x, enemy.y));
    enemy.phase = 1 - enemy.phase;
    if (enemy.type === "slime" && enemy.phase) {
      occupied.add(key(enemy.x, enemy.y));
      continue;
    }

    const candidates = enemy.type === "bat" ? shuffledSteps(enemy) : directedSteps(enemy);
    const next = candidates.find((tile) => !isBlocked(tile.x, tile.y) && !occupied.has(key(tile.x, tile.y)) && !crystalAt(tile.x, tile.y));
    if (next) {
      enemy.x = next.x;
      enemy.y = next.y;
    }
    occupied.add(key(enemy.x, enemy.y));
  }
}

function directedSteps(enemy) {
  const dx = Math.sign(state.player.x - enemy.x);
  const dy = Math.sign(state.player.y - enemy.y);
  const horizontal = { x: enemy.x + dx, y: enemy.y };
  const vertical = { x: enemy.x, y: enemy.y + dy };
  return Math.abs(state.player.x - enemy.x) >= Math.abs(state.player.y - enemy.y)
    ? [horizontal, vertical]
    : [vertical, horizontal];
}

function shuffledSteps(enemy) {
  const options = Object.values(dirs).map((dir) => ({ x: enemy.x + dir.x, y: enemy.y + dir.y }));
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

function resolveContacts() {
  if (state.enemies.some((enemy) => same(enemy, state.player))) damagePlayer("파수꾼의 공격");
}

function spikeActive(spike) {
  return (state.beatIndex + spike.phase) % 2 === 0;
}

function resolveSpikes() {
  const active = state.spikes.some((spike) => spikeActive(spike) && same(spike, state.player));
  if (active) damagePlayer("가시 함정");
}

function damagePlayer(reason) {
  if (state.player.invulnerable > 0) return;
  state.player.hp -= 1;
  state.player.invulnerable = 2;
  state.combo = 0;
  state.shake = 12;
  state.flash = 1;
  burst(state.player.x, state.player.y, "#f06b5f", 20);
  showMessage(reason, "bad");
  playAction("hit");
  if (navigator.vibrate) navigator.vibrate(45);
  if (state.player.hp <= 0) endGame(false);
}

function updatePuzzle() {
  const active = state.plates.filter((plate) => state.crystals.some((crystal) => same(plate, crystal))).length;
  const wasOpen = state.gateOpen;
  state.gateOpen = active === state.plates.length && state.enemies.length === 0;
  ui.sealStatus.textContent = `${active}/${state.plates.length}`;
  ui.sealStatus.style.color = active === state.plates.length ? "var(--gold)" : "var(--cyan-soft)";

  if (state.gateOpen && !wasOpen) {
    showMessage("봉인문이 열렸다", "good");
    playAction("seal");
    burst(state.exit.x, state.exit.y, "#a97dff", 28);
  }

  if (active === state.plates.length && state.enemies.length > 0) {
    ui.objective.textContent = `룬 완성 · 남은 파수꾼 ${state.enemies.length}`;
  } else if (active < state.plates.length) {
    ui.objective.textContent = rooms[state.roomIndex].hint;
  } else {
    ui.objective.textContent = "열린 봉인문으로 이동하라";
  }
}

function completeRoom() {
  state.score += 500 + state.combo * 10;
  state.depth += 1;
  if (state.depth > rooms.length) {
    endGame(true);
    return;
  }
  showMessage("다음 금고로 진입", "good");
  loadRoom(state.roomIndex + 1, true);
  state.nextBeatAt = performance.now() + state.beatMs;
}

function endGame(victory) {
  state.running = false;
  state.over = true;
  setBeatCueClasses(false, false);
  ui.overlay.classList.remove("is-hidden");
  const eyebrow = ui.overlay.querySelector(".eyebrow");
  const title = ui.overlay.querySelector("h2");
  const copy = ui.overlay.querySelector(".intro-copy");
  eyebrow.textContent = victory ? "VAULT RESONANCE COMPLETE" : "THE RHYTHM WAS BROKEN";
  title.innerHTML = victory ? "모든 봉인이<br><em>깨어났다</em>" : "박자를 되찾아<br><em>다시 도전하라</em>";
  copy.textContent = `점수 ${state.score.toLocaleString()} · 룬 조각 ${state.gold} · 최대 금고 ${Math.min(state.depth, rooms.length)}`;
  ui.start.querySelector("span").textContent = "다시 탐험";
}

function setTiming(text, kind = "") {
  ui.timingText.textContent = text;
  ui.timingDot.className = "timing-dot";
  if (kind) ui.timingDot.classList.add(kind);
}

function showMessage(text, kind = "good") {
  ui.message.textContent = text;
  ui.message.style.borderColor = kind === "bad" ? "rgba(240,107,95,.55)" : "rgba(66,228,218,.42)";
  ui.message.style.color = kind === "bad" ? "var(--coral)" : "var(--cyan-soft)";
  ui.message.classList.add("is-visible");
  state.messageTimer = 1.2;
}

function updateHud() {
  ui.hearts.replaceChildren();
  for (let i = 0; i < 4; i += 1) {
    const heart = document.createElement("i");
    heart.className = `heart${i >= state.player.hp ? " is-empty" : ""}`;
    ui.hearts.append(heart);
  }
  ui.combo.textContent = state.combo;
  ui.gold.textContent = state.gold;
  ui.score.textContent = state.score.toLocaleString();
  ui.depth.textContent = String(Math.min(state.depth, 99)).padStart(2, "0");
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 1.8;
    state.particles.push({
      x: x + 0.5,
      y: y + 0.5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.7,
      life: 0.5 + Math.random() * 0.45,
      maxLife: 0.95,
      color,
      size: 1.5 + Math.random() * 3,
    });
  }
}

function resizeCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function animateEntity(item, dt) {
  const speed = 1 - Math.pow(0.001, dt);
  item.rx += (item.x - item.rx) * speed;
  item.ry += (item.y - item.ry) * speed;
  item.squash = Math.max(0, item.squash - dt * 5.5);
}

function update(dt) {
  animateEntity(state.player, dt);
  [...state.enemies, ...state.crystals, ...state.coins].forEach((item) => animateEntity(item, dt));
  state.particles.forEach((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 3.2 * dt;
    particle.life -= dt;
  });
  state.particles = state.particles.filter((particle) => particle.life > 0);
  state.shake = Math.max(0, state.shake - dt * 30);
  state.flash = Math.max(0, state.flash - dt * 3.8);
  state.beatFlash = Math.max(0, state.beatFlash - dt * 5.5);
  if (state.messageTimer > 0) {
    state.messageTimer -= dt;
    if (state.messageTimer <= 0) ui.message.classList.remove("is-visible");
  }
}

function boardMetrics() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const side = Math.min(width * 0.94, height * 0.94);
  const tile = side / SIZE;
  return { width, height, side, tile, ox: (width - side) / 2, oy: (height - side) / 2 };
}

function draw() {
  const m = boardMetrics();
  ctx.clearRect(0, 0, m.width, m.height);
  drawBackdrop(m);
  const sx = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  const sy = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  ctx.save();
  ctx.translate(sx, sy);
  drawBoard(m);
  drawPlates(m);
  drawSpikes(m);
  drawGate(m);
  state.coins.forEach((coin) => drawCoin(coin, m));
  state.crystals.forEach((crystal) => drawEntitySprite(crystal, "crystal", m, 1.2));
  drawBeatCue(m);
  state.enemies.forEach((enemy) => drawEnemy(enemy, m));
  drawPlayer(m);
  drawParticles(m);
  ctx.restore();
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(240, 107, 95, ${state.flash * 0.2})`;
    ctx.fillRect(0, 0, m.width, m.height);
  }
}

function drawBackdrop(m) {
  const glow = ctx.createRadialGradient(m.width / 2, m.height * 0.46, 0, m.width / 2, m.height * 0.48, m.side * 0.8);
  glow.addColorStop(0, "#1a2b2e");
  glow.addColorStop(0.46, "#0e181d");
  glow.addColorStop(1, "#040609");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, m.width, m.height);

  const time = performance.now() * 0.00008;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 14; i += 1) {
    const px = ((i * 83.17 + time * (18 + i)) % 100) / 100 * m.width;
    const py = ((i * 47.31 - time * (9 + i * 0.4)) % 100 + 100) % 100 / 100 * m.height;
    const alpha = 0.045 + (i % 3) * 0.018;
    ctx.fillStyle = `rgba(122, 218, 205, ${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, 0.8 + (i % 4) * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBoard(m) {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,.65)";
  ctx.shadowBlur = 30;
  ctx.fillStyle = "#080c0f";
  ctx.beginPath();
  ctx.arc(m.width / 2, m.height / 2, m.side * 0.54, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const floorGlow = ctx.createRadialGradient(m.width / 2, m.height / 2, m.tile, m.width / 2, m.height / 2, m.side * 0.56);
  floorGlow.addColorStop(0, "#17272a");
  floorGlow.addColorStop(0.72, "#101a1f");
  floorGlow.addColorStop(1, "#080d10");
  ctx.fillStyle = floorGlow;
  ctx.beginPath();
  ctx.arc(m.width / 2, m.height / 2, m.side * 0.525, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(m.width / 2, m.height / 2);
  ctx.strokeStyle = "rgba(74, 179, 169, 0.08)";
  ctx.lineWidth = 1;
  [0.21, 0.34, 0.47].forEach((radius, index) => {
    ctx.setLineDash(index === 1 ? [8, 13] : [3, 17]);
    ctx.beginPath();
    ctx.arc(0, 0, m.side * radius, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.restore();

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const px = m.ox + x * m.tile;
      const py = m.oy + y * m.tile;
      const wall = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1 || state.walls.some((item) => item.x === x && item.y === y);
      if (wall) drawWall(px, py, m.tile, x, y);
      else drawFloor(px, py, m.tile, x, y);
    }
  }

  drawTorches(m);
}

function seeded(gx, gy, salt = 0) {
  const value = Math.sin(gx * 91.7 + gy * 47.3 + salt * 17.1) * 43758.5453;
  return value - Math.floor(value);
}

function drawFloor(x, y, tile, gx, gy) {
  const inset = tile * 0.035;
  const corners = [0, 1, 2, 3].map((i) => (seeded(gx, gy, i) - 0.5) * tile * 0.13);
  const gradient = ctx.createLinearGradient(x, y, x, y + tile);
  const toneShift = seeded(gx, gy, 8) > 0.52;
  gradient.addColorStop(0, toneShift ? "#1a292b" : "#172428");
  gradient.addColorStop(1, toneShift ? "#111b1e" : "#0f191d");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.moveTo(x + inset + corners[0], y + inset);
  ctx.lineTo(x + tile - inset, y + inset + corners[1]);
  ctx.lineTo(x + tile - inset + corners[2] * 0.25, y + tile - inset);
  ctx.lineTo(x + inset, y + tile - inset + corners[3] * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(3, 8, 10, 0.5)";
  ctx.lineWidth = Math.max(1, tile * 0.035);
  ctx.stroke();

  const mark = seeded(gx, gy, 12);
  ctx.strokeStyle = `rgba(121, 176, 169, ${0.035 + mark * 0.05})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + tile * (0.15 + mark * 0.16), y + tile * 0.22);
  ctx.lineTo(x + tile * (0.45 + mark * 0.12), y + tile * 0.47);
  ctx.lineTo(x + tile * (0.38 + mark * 0.2), y + tile * 0.74);
  ctx.stroke();

  if (seeded(gx, gy, 19) > 0.64) {
    ctx.fillStyle = "rgba(72, 108, 66, 0.18)";
    ctx.beginPath();
    ctx.ellipse(x + tile * (0.25 + mark * 0.45), y + tile * 0.78, tile * 0.16, tile * 0.055, mark, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWall(x, y, tile, gx, gy) {
  const wobble = (seeded(gx, gy, 3) - 0.5) * tile * 0.1;
  const edge = ctx.createLinearGradient(x, y, x, y + tile);
  edge.addColorStop(0, "#39474a");
  edge.addColorStop(0.22, "#263438");
  edge.addColorStop(1, "#0d1519");
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.moveTo(x + tile * 0.08 + wobble, y + tile * 0.14);
  ctx.lineTo(x + tile * 0.86, y + tile * 0.07 - wobble * 0.3);
  ctx.lineTo(x + tile * 0.95 - wobble, y + tile * 0.83);
  ctx.lineTo(x + tile * 0.16, y + tile * 0.94 + wobble * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "rgba(168, 203, 194, 0.13)";
  ctx.beginPath();
  ctx.moveTo(x + tile * 0.15, y + tile * 0.17);
  ctx.lineTo(x + tile * 0.82, y + tile * 0.11);
  ctx.lineTo(x + tile * 0.74, y + tile * 0.22);
  ctx.lineTo(x + tile * 0.2, y + tile * 0.27);
  ctx.closePath();
  ctx.fill();
  if ((gx + gy) % 3 === 0) {
    ctx.strokeStyle = "rgba(66,228,218,.12)";
    ctx.beginPath();
    ctx.moveTo(x + tile * 0.5, y + tile * 0.28);
    ctx.lineTo(x + tile * 0.42, y + tile * 0.48);
    ctx.lineTo(x + tile * 0.56, y + tile * 0.68);
    ctx.stroke();
  }
}

function drawTorches(m) {
  const time = performance.now() * 0.012;
  const points = [[0.72, 1.15], [6.25, 1.05], [0.8, 5.8], [6.2, 5.85]];
  points.forEach(([gx, gy], index) => {
    const x = m.ox + gx * m.tile;
    const y = m.oy + gy * m.tile;
    const flicker = 0.92 + Math.sin(time + index * 1.7) * 0.08;
    const light = ctx.createRadialGradient(x, y, 0, x, y, m.tile * 1.25);
    light.addColorStop(0, `rgba(245, 177, 72, ${0.17 * flicker})`);
    light.addColorStop(0.35, `rgba(219, 101, 48, ${0.07 * flicker})`);
    light.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = light;
    ctx.fillRect(x - m.tile * 1.3, y - m.tile * 1.3, m.tile * 2.6, m.tile * 2.6);
    ctx.fillStyle = "#6b4028";
    ctx.fillRect(x - 2, y + m.tile * 0.06, 4, m.tile * 0.24);
    ctx.fillStyle = "#ffd36a";
    ctx.beginPath();
    ctx.moveTo(x, y - m.tile * 0.2 * flicker);
    ctx.quadraticCurveTo(x + m.tile * 0.12, y, x, y + m.tile * 0.09);
    ctx.quadraticCurveTo(x - m.tile * 0.1, y, x, y - m.tile * 0.2 * flicker);
    ctx.fill();
  });
}

function tileCenter(item, m) {
  return { x: m.ox + (item.rx + 0.5) * m.tile, y: m.oy + (item.ry + 0.5) * m.tile };
}

function drawPlates(m) {
  state.plates.forEach((plate) => {
    const cx = m.ox + (plate.x + 0.5) * m.tile;
    const cy = m.oy + (plate.y + 0.5) * m.tile;
    const active = state.crystals.some((crystal) => same(crystal, plate));
    ctx.save();
    ctx.strokeStyle = active ? "#f5bd4c" : "rgba(66,228,218,.42)";
    ctx.lineWidth = Math.max(1.5, m.tile * 0.035);
    ctx.shadowColor = active ? "#f5bd4c" : "#42e4da";
    ctx.shadowBlur = active ? 14 : 5;
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4);
    ctx.strokeRect(-m.tile * 0.25, -m.tile * 0.25, m.tile * 0.5, m.tile * 0.5);
    ctx.strokeRect(-m.tile * 0.12, -m.tile * 0.12, m.tile * 0.24, m.tile * 0.24);
    ctx.restore();
  });
}

function drawSpikes(m) {
  state.spikes.forEach((spike) => {
    const active = spikeActive(spike);
    ctx.save();
    ctx.globalAlpha = active ? 0.92 : 0.25;
    const temp = entity(spike.x, spike.y);
    drawEntitySprite(temp, "spike", m, active ? 1.05 : 0.82, active ? 0 : m.tile * 0.12);
    ctx.restore();
  });
}

function drawGate(m) {
  const item = entity(state.exit.x, state.exit.y);
  const c = tileCenter(item, m);
  if (state.gateOpen) {
    const pulse = 0.78 + Math.sin(performance.now() * 0.008) * 0.16;
    const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, m.tile * 0.62);
    glow.addColorStop(0, `rgba(169,125,255,${0.34 * pulse})`);
    glow.addColorStop(1, "rgba(169,125,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(c.x - m.tile, c.y - m.tile, m.tile * 2, m.tile * 2);
  }
  ctx.save();
  ctx.globalAlpha = state.gateOpen ? 1 : 0.5;
  drawEntitySprite(item, "gate", m, 1.25);
  ctx.restore();
  if (state.gateOpen) {
    ctx.strokeStyle = "rgba(213,190,255,.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y + m.tile * 0.05, m.tile * 0.25, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawCoin(coin, m) {
  const bob = Math.sin(performance.now() * 0.005 + coin.spin) * m.tile * 0.06;
  drawEntitySprite(coin, "coin", m, 0.72, bob);
}

function drawEnemy(enemy, m) {
  const bob = Math.sin(performance.now() * 0.006 + enemy.phase) * m.tile * 0.025;
  drawShadow(enemy, m, 0.27);
  drawEntitySprite(enemy, enemy.type, m, enemy.type === "knight" ? 1.16 : 1.04, bob);
  if (enemy.hp > 1) {
    const c = tileCenter(enemy, m);
    ctx.fillStyle = "#f5bd4c";
    ctx.beginPath();
    ctx.arc(c.x + m.tile * 0.25, c.y - m.tile * 0.28, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBeatCue(m) {
  if (!state.running || state.paused) return;
  const c = tileCenter(state.player, m);
  const remain = state.beatRemain;
  const ready = remain <= 0.36;
  const now = remain <= 0.18;
  const radius = m.tile * (0.34 + remain * 0.72);
  const alpha = 0.28 + (1 - remain) * 0.55;
  const color = now ? "245, 189, 76" : ready ? "66, 228, 218" : "116, 151, 154";

  ctx.save();
  ctx.translate(c.x, c.y + m.tile * 0.05);
  ctx.strokeStyle = `rgba(${color}, ${alpha})`;
  ctx.lineWidth = now ? 3 : 1.5;
  ctx.shadowColor = now ? "#f5bd4c" : "#42e4da";
  ctx.shadowBlur = now ? 16 : ready ? 9 : 0;
  ctx.setLineDash(ready ? [] : [4, 7]);
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.setLineDash([]);
  for (let i = 0; i < 4; i += 1) {
    const angle = i * Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = `rgba(${color}, ${Math.min(1, alpha + 0.16)})`;
    ctx.beginPath();
    ctx.moveTo(0, m.tile * 0.08);
    ctx.lineTo(-m.tile * 0.07, -m.tile * 0.04);
    ctx.lineTo(m.tile * 0.07, -m.tile * 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (state.input && state.input.quality !== "miss") {
    const queued = dirs[state.input.dir];
    ctx.strokeStyle = "rgba(134, 255, 244, 0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(queued.x * m.tile * 0.18, queued.y * m.tile * 0.18);
    ctx.lineTo(queued.x * m.tile * 0.42, queued.y * m.tile * 0.42);
    ctx.stroke();
  }

  if (now || state.beatFlash > 0.5) {
    ctx.shadowBlur = 12;
    ctx.fillStyle = now ? "#fff1bd" : "#86fff4";
    ctx.font = `900 ${Math.max(10, m.tile * 0.2)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("NOW", 0, -m.tile * 0.62);
  }
  ctx.restore();
}

function drawPlayer(m) {
  const anticipation = state.running ? Math.max(0, 1 - state.beatRemain * 2.8) : 0;
  const beatBob = state.beatFlash * m.tile * 0.08 - anticipation * m.tile * 0.025;
  drawShadow(state.player, m, 0.28);
  ctx.save();
  if (state.player.invulnerable > 0 && state.beatIndex % 2 === 0) ctx.globalAlpha = 0.48;
  drawEntitySprite(state.player, "player", m, 1.12, beatBob);
  ctx.restore();
}

function drawShadow(item, m, scale) {
  const c = tileCenter(item, m);
  ctx.fillStyle = "rgba(0,0,0,.42)";
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + m.tile * 0.26, m.tile * scale, m.tile * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawEntitySprite(item, name, m, scale = 1, offsetY = 0) {
  const c = tileCenter(item, m);
  const squash = item.squash || 0;
  const width = m.tile * scale * (1 + squash * 0.08);
  const height = m.tile * scale * (1 - squash * 0.1);
  if (atlasReady) {
    const [col, row] = spriteCells[name];
    const sw = atlas.naturalWidth / 4;
    const sh = atlas.naturalHeight / 2;
    ctx.drawImage(atlas, col * sw, row * sh, sw, sh, c.x - width / 2, c.y - height / 2 - offsetY, width, height);
  } else {
    ctx.fillStyle = name === "player" ? "#42e4da" : name === "crystal" ? "#5cecf2" : "#f06b5f";
    ctx.beginPath();
    ctx.arc(c.x, c.y - offsetY, width * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles(m) {
  state.particles.forEach((particle) => {
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(m.ox + particle.x * m.tile - particle.size / 2, m.oy + particle.y * m.tile - particle.size / 2, particle.size, particle.size);
  });
  ctx.globalAlpha = 1;
}

function frame(now) {
  const dt = Math.min(0.05, (now - state.lastFrame) / 1000);
  state.lastFrame = now;
  if (state.running && !state.paused) {
    while (now >= state.nextBeatAt) processBeat(now);
    const remain = clamp((state.nextBeatAt - now) / state.beatMs, 0, 1);
    state.beatRemain = remain;
    const left = 8 + (1 - remain) * 42;
    const right = 92 - (1 - remain) * 42;
    ui.beatCursorLeft.style.setProperty("--cursor-left", `${left}%`);
    ui.beatCursorRight.style.setProperty("--cursor-right", `${right}%`);
    const ready = remain <= 0.36;
    const beatNow = remain <= 0.18;
    setBeatCueClasses(ready, beatNow);
  }
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

ui.start.addEventListener("click", beginGame);
ui.pause.addEventListener("click", () => setPaused(!state.paused));
ui.resume.addEventListener("click", () => setPaused(false));
ui.restart.addEventListener("click", beginGame);
ui.tempos.forEach((button) => button.addEventListener("click", () => setBpm(Number(button.dataset.bpm))));

document.querySelectorAll("[data-dir]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    queueInput(button.dataset.dir);
  });
});

window.addEventListener("keydown", (event) => {
  const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
  if (event.key === " ") {
    event.preventDefault();
    setPaused(!state.paused);
  } else if (map[event.key]) {
    event.preventDefault();
    queueInput(map[event.key]);
  }
});

window.addEventListener("resize", resizeCanvas);
setBpm(state.bpm);
loadRoom(0);
resizeCanvas();
requestAnimationFrame(frame);
