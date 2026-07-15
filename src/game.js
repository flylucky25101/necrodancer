const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const ui = {
  combo: document.querySelector("#combo"),
  gold: document.querySelector("#gold"),
  score: document.querySelector("#score"),
  depth: document.querySelector("#depth"),
  roomName: document.querySelector("#room-name"),
  objective: document.querySelector("#objective"),
  sealStatus: document.querySelector("#seal-status"),
  timingText: document.querySelector("#timing-text"),
  timingDot: document.querySelector("#timing-dot"),
  beatTrack: document.querySelector("#beat-track"),
  stepConsole: document.querySelector(".step-console"),
  touchPad: document.querySelector("#touch-pad"),
  queueCount: document.querySelector("#queue-count"),
  queueSlots: [...document.querySelectorAll(".queue-slot")],
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
const MAX_QUEUE = 3;
const dirs = {
  up: { x: 0, y: -1, symbol: "↑" },
  down: { x: 0, y: 1, symbol: "↓" },
  left: { x: -1, y: 0, symbol: "←" },
  right: { x: 1, y: 0, symbol: "→" },
};

const gardens = [
  {
    name: "새싹 뜰",
    hint: "물뿌리개를 꽃밭까지 밀어 주세요",
    player: [1, 3],
    portal: [5, 5],
    hedges: [[3, 1], [3, 5]],
    beds: [[4, 3]],
    cans: [[2, 3]],
    mushrooms: [],
    seeds: [[1, 1], [5, 1], [1, 5]],
    friends: [],
  },
  {
    name: "클로버 마당",
    hint: "두 꽃밭에 물뿌리개를 놓아 주세요",
    player: [3, 3],
    portal: [5, 1],
    hedges: [[1, 3], [3, 5]],
    beds: [[1, 1], [5, 5]],
    cans: [[2, 2], [4, 4]],
    mushrooms: [[4, 2]],
    seeds: [[1, 5], [5, 1], [3, 2]],
    friends: [{ type: "mole", at: [4, 1] }, { type: "dandelion", at: [1, 4] }],
  },
  {
    name: "햇살 연못",
    hint: "숲 친구들과 함께 마지막 꽃밭을 깨워요",
    player: [1, 5],
    portal: [5, 1],
    hedges: [[4, 2], [2, 4], [4, 4]],
    beds: [[3, 1], [3, 5]],
    cans: [[2, 3], [4, 3]],
    mushrooms: [[1, 2], [5, 2]],
    seeds: [[1, 1], [5, 5], [3, 3]],
    friends: [{ type: "badger", at: [5, 4] }, { type: "mole", at: [1, 4] }],
  },
];

const sprites = new Image();
sprites.src = "./assets/garden-sprites.png";
let spritesReady = false;
sprites.addEventListener("load", () => { spritesReady = true; });

const gardenImage = new Image();
gardenImage.src = "./assets/garden-clearing.png";
let gardenReady = false;
gardenImage.addEventListener("load", () => { gardenReady = true; });

const spriteCells = {
  player: [0, 0],
  mole: [1, 0],
  dandelion: [2, 0],
  badger: [3, 0],
  seed: [0, 1],
  can: [1, 1],
  portal: [2, 1],
  mushroom: [3, 1],
};

const state = {
  running: false,
  paused: false,
  complete: false,
  bpm: 76,
  beatMs: 60000 / 76,
  nextBeatAt: 0,
  beatIndex: 0,
  beatRemain: 1,
  beatFlash: 0,
  queue: [],
  gardenIndex: 0,
  depth: 1,
  player: null,
  cans: [],
  beds: [],
  seeds: [],
  mushrooms: [],
  hedges: [],
  friends: [],
  portal: null,
  portalOpen: false,
  sparkle: 0,
  gold: 0,
  score: 0,
  actionCount: 0,
  shake: 0,
  beatPulse: 0,
  messageTimer: 0,
  particles: [],
  audio: null,
  tutorial: 0,
  lastFrame: performance.now(),
};

function entity(x, y, extra = {}) {
  return { x, y, rx: x, ry: y, squash: 0, tilt: 0, mood: "", moodTimer: 0, ...extra };
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
  master.gain.value = 0.13;
  master.connect(context.destination);
  return { context, master };
}

function tone(frequency, duration, volume, type = "sine", delay = 0) {
  if (!state.audio) return;
  const now = state.audio.context.currentTime + delay;
  const oscillator = state.audio.context.createOscillator();
  const gain = state.audio.context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gain);
  gain.connect(state.audio.master);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

function playBeat() {
  const notes = [392, 494, 440, 523];
  const note = notes[state.beatIndex % notes.length];
  tone(note, 0.14, 0.08, "triangle");
  tone(note * 2, 0.045, 0.035, "sine", 0.015);
}

function playSound(kind) {
  if (kind === "sparkle") {
    tone(659, 0.12, 0.1, "sine");
    tone(988, 0.18, 0.07, "triangle", 0.045);
  } else if (kind === "seed") {
    tone(784, 0.1, 0.09, "triangle");
  } else if (kind === "bloom") {
    [523, 659, 784].forEach((note, index) => tone(note, 0.3, 0.08, "sine", index * 0.075));
  } else if (kind === "bump") {
    tone(220, 0.08, 0.045, "sine");
  }
}

function loadGarden(index, keepScore = false) {
  const garden = gardens[index % gardens.length];
  state.gardenIndex = index % gardens.length;
  state.hedges = garden.hedges.map(([x, y]) => ({ x, y }));
  state.beds = garden.beds.map(([x, y]) => ({ x, y }));
  state.cans = garden.cans.map(([x, y]) => entity(x, y));
  state.mushrooms = garden.mushrooms.map(([x, y], phase) => ({ x, y, phase: phase % 2 }));
  state.seeds = garden.seeds.map(([x, y]) => entity(x, y, { spin: Math.random() * Math.PI }));
  state.friends = garden.friends.map((friend, indexValue) => {
    const [x, y] = friend.at;
    return entity(x, y, { type: friend.type, phase: indexValue * 1.3 });
  });
  const [px, py] = garden.player;
  state.player = entity(px, py);
  state.portal = { x: garden.portal[0], y: garden.portal[1] };
  state.portalOpen = false;
  state.queue = [];
  if (!keepScore) state.actionCount = 0;
  ui.roomName.textContent = garden.name;
  ui.objective.textContent = garden.hint;
  updateGarden();
  updateHud();
  updateQueueUi();
  burst(px, py, ["#fff2a8", "#f6a6bd", "#95d6b1"], 18);
}

function resetRun() {
  state.depth = 1;
  state.sparkle = 0;
  state.gold = 0;
  state.score = 0;
  state.beatIndex = 0;
  state.complete = false;
  state.tutorial = 0;
  state.particles = [];
  loadGarden(0);
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
  showMessage("방향을 눌러 다음 걸음을 예약해 보세요", "good", 2.5);
}

function setPaused(paused) {
  if (!state.running || state.complete) return;
  state.paused = paused;
  ui.pausePanel.hidden = !paused;
  if (!paused) state.nextBeatAt = performance.now() + state.beatMs;
}

function queueInput(dir) {
  if (!state.running || state.paused || state.complete) return;
  if (state.queue.length >= MAX_QUEUE) {
    setTiming("세 걸음이 모두 예약됐어요", "bad");
    showMessage("먼저 예약한 걸음을 기다려 주세요", "bad", 1.1);
    if (navigator.vibrate) navigator.vibrate(12);
    return;
  }

  const sparkle = state.queue.length === 0 && state.beatRemain <= 0.38;
  state.queue.push({ dir, sparkle });
  flashButton(dir);
  updateQueueUi();
  setTiming(sparkle ? "반짝 타이밍! 보너스 예약" : "다음 걸음 예약 완료", sparkle ? "good" : "");
  if (sparkle) playSound("sparkle");
  if (navigator.vibrate) navigator.vibrate(sparkle ? 12 : 6);

  if (state.tutorial === 0) {
    state.tutorial = 1;
    showMessage("좋아요! 토끼 모모가 다음 박자에 움직여요", "good", 2.1);
  }
}

function flashButton(dir) {
  const button = document.querySelector(`[data-dir="${dir}"]`);
  button?.classList.add("is-pressed");
  window.setTimeout(() => button?.classList.remove("is-pressed"), 110);
}

function updateQueueUi() {
  ui.queueSlots.forEach((slot, index) => {
    const action = state.queue[index];
    slot.textContent = action ? dirs[action.dir].symbol : "";
    slot.classList.toggle("is-filled", Boolean(action));
    slot.classList.toggle("is-sparkle", Boolean(action?.sparkle));
  });
  ui.queueCount.textContent = String(state.queue.length);
  ui.touchPad.classList.toggle("is-full", state.queue.length >= MAX_QUEUE);
}

function processBeat(now) {
  state.beatIndex += 1;
  state.beatFlash = 1;
  state.beatPulse = 1;
  playBeat();
  if (navigator.vibrate) navigator.vibrate(4);

  const action = state.queue.shift();
  updateQueueUi();
  if (action) {
    state.actionCount += 1;
    state.player.squash = 1;
    const moveResult = movePlayer(action.dir, action.sparkle);
    const moved = Boolean(moveResult);
    if (action.sparkle && moved) {
      state.sparkle += 1;
      state.gold += 1;
      state.score += 45;
      setMood(state.player, "heart", 0.75);
      burst(state.player.x, state.player.y, ["#ffe27a", "#ffffff", "#f3a6c0"], 14);
    }
    if (moveResult === "portal") {
      completeGarden();
    } else {
      if (state.actionCount % 2 === 0) moveFriends();
      updateGarden();
      updateHud();
    }
    if (state.tutorial === 1) {
      state.tutorial = 2;
      showMessage("박자를 기다리지 않아도 언제든 세 걸음까지 예약할 수 있어요", "good", 2.6);
    }
  } else {
    setTiming("쉬어가는 박자 · 손해 없음", "");
  }

  state.nextBeatAt = now + state.beatMs;
  ui.beatNumber.textContent = String((state.beatIndex % 4) + 1);
}

function isInside(x, y) {
  return x > 0 && y > 0 && x < SIZE - 1 && y < SIZE - 1;
}

function hedgeAt(x, y) {
  return state.hedges.some((item) => item.x === x && item.y === y);
}

function canAt(x, y) {
  return state.cans.find((item) => item.x === x && item.y === y);
}

function friendAt(x, y) {
  return state.friends.find((item) => item.x === x && item.y === y);
}

function mushroomAt(x, y) {
  return state.mushrooms.find((item) => item.x === x && item.y === y);
}

function blocked(x, y) {
  return !isInside(x, y) || hedgeAt(x, y) || mushroomAt(x, y);
}

function movePlayer(dir, sparkle) {
  const delta = dirs[dir];
  const tx = state.player.x + delta.x;
  const ty = state.player.y + delta.y;
  state.player.tilt = delta.x * 0.08;

  if (blocked(tx, ty)) {
    friendlyBump(mushroomAt(tx, ty) ? "버섯 친구가 쿨쿨 자고 있어요" : "생울타리 너머는 갈 수 없어요");
    return false;
  }

  const friend = friendAt(tx, ty);
  if (friend) {
    if (!nudgeFriend(friend, delta)) {
      friendlyBump("숲 친구와 인사했어요");
      setMood(friend, "heart", 0.8);
      return false;
    }
    setMood(friend, "surprise", 0.65);
    state.score += 15;
  }

  const can = canAt(tx, ty);
  if (can) {
    const bx = tx + delta.x;
    const by = ty + delta.y;
    const blockingFriend = friendAt(bx, by);
    if (blockingFriend && !nudgeFriend(blockingFriend, delta)) {
      friendlyBump("친구가 지나갈 때까지 잠깐 기다려요");
      return false;
    }
    if (blocked(bx, by) || canAt(bx, by) || same(state.portal, { x: bx, y: by })) {
      friendlyBump("물뿌리개가 살짝 걸렸어요");
      return false;
    }
    can.x = bx;
    can.y = by;
    can.squash = 1;
    burst(bx, by, ["#78d3e7", "#d9f6f0", "#ffffff"], 9);
  }

  state.player.x = tx;
  state.player.y = ty;
  state.score += sparkle ? 35 : 20;

  const seed = state.seeds.find((item) => same(item, state.player));
  if (seed) {
    state.seeds = state.seeds.filter((item) => item !== seed);
    state.gold += 1;
    state.score += 60;
    setMood(state.player, "heart", 0.7);
    burst(tx, ty, ["#ffe27a", "#f6a6bd", "#fff8d0"], 16);
    showMessage("햇살 씨앗을 찾았어요", "good", 1.25);
    playSound("seed");
  }

  if (state.portalOpen && same(state.player, state.portal)) return "portal";
  return true;
}

function friendlyBump(message) {
  state.shake = 2.5;
  state.player.squash = 0.65;
  setMood(state.player, "surprise", 0.65);
  showMessage(`${message} · 다른 걸음은 그대로예요`, "bad", 1.45);
  playSound("bump");
}

function nudgeFriend(friend, preferred) {
  const options = [
    { x: friend.x + preferred.x, y: friend.y + preferred.y },
    ...Object.values(dirs).map((dir) => ({ x: friend.x + dir.x, y: friend.y + dir.y })),
  ];
  const next = options.find((tile) => {
    const occupiedBed = state.beds.some((bed) => same(bed, tile));
    return !blocked(tile.x, tile.y) && !canAt(tile.x, tile.y) && !friendAt(tile.x, tile.y) && !occupiedBed && !same(tile, state.portal) && !same(tile, state.player);
  });
  if (!next) return false;
  friend.x = next.x;
  friend.y = next.y;
  friend.squash = 1;
  return true;
}

function moveFriends() {
  const occupied = new Set(state.friends.map((friend) => key(friend.x, friend.y)));
  for (const friend of state.friends) {
    occupied.delete(key(friend.x, friend.y));
    const options = Object.values(dirs)
      .map((dir) => ({ x: friend.x + dir.x, y: friend.y + dir.y }))
      .filter((tile) => {
        const onBed = state.beds.some((bed) => same(bed, tile));
        return !blocked(tile.x, tile.y) && !canAt(tile.x, tile.y) && !occupied.has(key(tile.x, tile.y)) && !same(tile, state.portal) && !same(tile, state.player) && !onBed;
      });
    if (options.length && Math.random() > 0.3) {
      const next = options[Math.floor(Math.random() * options.length)];
      friend.x = next.x;
      friend.y = next.y;
      friend.squash = 0.7;
    }
    occupied.add(key(friend.x, friend.y));
  }
}

function updateGarden() {
  const blooming = state.beds.filter((bed) => state.cans.some((can) => same(bed, can))).length;
  const wasOpen = state.portalOpen;
  state.portalOpen = blooming === state.beds.length;
  ui.sealStatus.textContent = `${blooming}/${state.beds.length}`;

  if (state.portalOpen && !wasOpen) {
    ui.objective.textContent = "꽃문이 열렸어요 · 안으로 들어가요";
    showMessage("모든 꽃이 활짝 피었어요!", "good", 2);
    playSound("bloom");
    burst(state.portal.x, state.portal.y, ["#fff39c", "#f6a6bd", "#9edbc0", "#a9cfee"], 34);
  } else if (!state.portalOpen) {
    ui.objective.textContent = gardens[state.gardenIndex].hint;
  }
}

function completeGarden() {
  state.score += 400 + state.sparkle * 8;
  state.depth += 1;
  if (state.depth > gardens.length) {
    finishRun();
    return;
  }
  loadGarden(state.gardenIndex + 1, true);
  state.nextBeatAt = performance.now() + state.beatMs;
  showMessage("다음 정원으로 폴짝!", "good", 1.7);
}

function finishRun() {
  state.running = false;
  state.complete = true;
  state.queue = [];
  updateQueueUi();
  ui.overlay.classList.remove("is-hidden");
  ui.overlay.querySelector(".eyebrow").textContent = "EVERY GARDEN IS BLOOMING";
  ui.overlay.querySelector("h2").innerHTML = "정원이 모두<br><em>활짝 피었어요</em>";
  ui.overlay.querySelector(".intro-copy").textContent = `정원 점수 ${state.score.toLocaleString()} · 햇살 씨앗 ${state.gold} · 반짝 걸음 ${state.sparkle}`;
  ui.start.querySelector("span").textContent = "다시 산책하기";
  playSound("bloom");
}

function setMood(item, mood, duration) {
  item.mood = mood;
  item.moodTimer = duration;
}

function setTiming(text, kind = "") {
  ui.timingText.textContent = text;
  ui.timingDot.className = "timing-dot";
  if (kind) ui.timingDot.classList.add(kind);
}

function showMessage(text, kind = "good", duration = 1.3) {
  ui.message.textContent = text;
  ui.message.style.color = kind === "bad" ? "#b46b56" : "#5b7750";
  ui.message.classList.add("is-visible");
  state.messageTimer = duration;
}

function updateHud() {
  ui.combo.textContent = state.sparkle;
  ui.gold.textContent = state.gold;
  ui.score.textContent = state.score.toLocaleString();
  ui.depth.textContent = String(Math.min(state.depth, 99)).padStart(2, "0");
}

function burst(x, y, colors, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.45 + Math.random() * 1.5;
    state.particles.push({
      x: x + 0.5,
      y: y + 0.5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.65,
      life: 0.55 + Math.random() * 0.5,
      maxLife: 1.05,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 2 + Math.random() * 3,
      spin: Math.random() * Math.PI,
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
  const speed = 1 - Math.pow(0.0012, dt);
  item.rx += (item.x - item.rx) * speed;
  item.ry += (item.y - item.ry) * speed;
  item.squash = Math.max(0, item.squash - dt * 4.7);
  item.tilt *= Math.pow(0.01, dt);
  if (item.moodTimer > 0) {
    item.moodTimer -= dt;
    if (item.moodTimer <= 0) item.mood = "";
  }
}

function update(dt) {
  animateEntity(state.player, dt);
  [...state.cans, ...state.seeds, ...state.friends].forEach((item) => animateEntity(item, dt));
  state.particles.forEach((particle) => {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += 2.6 * dt;
    particle.spin += dt * 5;
    particle.life -= dt;
  });
  state.particles = state.particles.filter((particle) => particle.life > 0);
  state.shake = Math.max(0, state.shake - dt * 22);
  state.beatFlash = Math.max(0, state.beatFlash - dt * 3.8);
  state.beatPulse = Math.max(0, state.beatPulse - dt * 2.8);
  if (state.messageTimer > 0) {
    state.messageTimer -= dt;
    if (state.messageTimer <= 0) ui.message.classList.remove("is-visible");
  }
}

function boardMetrics() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const side = Math.min(width * 0.87, height * 0.86);
  const tile = side / SIZE;
  return { width, height, side, tile, ox: (width - side) / 2, oy: (height - side) / 2 + height * 0.015 };
}

function draw() {
  const m = boardMetrics();
  ctx.clearRect(0, 0, m.width, m.height);
  drawGardenBackground(m);
  const shakeX = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  const shakeY = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawBoardGuides(m);
  drawBeds(m);
  drawHedges(m);
  drawMushrooms(m);
  drawPortal(m);
  state.seeds.forEach((seed) => drawSeed(seed, m));
  state.cans.forEach((can) => drawSprite(can, "can", m, 1.06));
  state.friends.forEach((friend) => drawFriend(friend, m));
  drawStepCue(m);
  drawPlayer(m);
  drawParticles(m);
  ctx.restore();
}

function drawGardenBackground(m) {
  if (gardenReady) {
    const scale = Math.max(m.width / gardenImage.naturalWidth, m.height / gardenImage.naturalHeight);
    const sw = m.width / scale;
    const sh = m.height / scale;
    const sx = (gardenImage.naturalWidth - sw) / 2;
    const sy = (gardenImage.naturalHeight - sh) / 2;
    ctx.drawImage(gardenImage, sx, sy, sw, sh, 0, 0, m.width, m.height);
  } else {
    const gradient = ctx.createLinearGradient(0, 0, 0, m.height);
    gradient.addColorStop(0, "#b8dc77");
    gradient.addColorStop(1, "#87c66e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, m.width, m.height);
  }
  ctx.fillStyle = "rgba(255, 250, 205, 0.11)";
  ctx.fillRect(0, 0, m.width, m.height);
}

function drawBoardGuides(m) {
  for (let y = 1; y < SIZE - 1; y += 1) {
    for (let x = 1; x < SIZE - 1; x += 1) {
      const cx = m.ox + (x + 0.5) * m.tile;
      const cy = m.oy + (y + 0.5) * m.tile;
      const seedValue = Math.sin(x * 18.3 + y * 31.7) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(255, 255, 220, ${0.055 + seedValue * 0.028})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy + m.tile * 0.16, m.tile * 0.35, m.tile * 0.18, seedValue * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function tileCenter(item, m) {
  return { x: m.ox + (item.rx + 0.5) * m.tile, y: m.oy + (item.ry + 0.5) * m.tile };
}

function drawBeds(m) {
  state.beds.forEach((bed, index) => {
    const cx = m.ox + (bed.x + 0.5) * m.tile;
    const cy = m.oy + (bed.y + 0.5) * m.tile;
    const blooming = state.cans.some((can) => same(can, bed));
    ctx.save();
    ctx.translate(cx, cy + m.tile * 0.1);
    ctx.fillStyle = blooming ? "rgba(255, 244, 177, 0.72)" : "rgba(98, 137, 67, 0.22)";
    ctx.beginPath();
    ctx.ellipse(0, 0, m.tile * 0.39, m.tile * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    const colors = ["#f49ab2", "#f6d36c", "#8ecedc", "#a992dc"];
    for (let i = 0; i < 5; i += 1) {
      const angle = i / 5 * Math.PI * 2 + index;
      const radius = blooming ? m.tile * 0.21 : m.tile * 0.14;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.55;
      drawFlower(x, y, blooming ? m.tile * 0.1 : m.tile * 0.065, colors[(i + index) % colors.length], blooming ? 1 : 0.45);
    }
    ctx.restore();
  });
}

function drawFlower(x, y, radius, color, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i += 1) {
    const angle = i / 5 * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * radius * 0.55, Math.sin(angle) * radius * 0.55, radius * 0.46, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ffe378";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHedges(m) {
  state.hedges.forEach((hedge, index) => {
    const cx = m.ox + (hedge.x + 0.5) * m.tile;
    const cy = m.oy + (hedge.y + 0.5) * m.tile;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = "rgba(72, 93, 46, 0.18)";
    ctx.beginPath();
    ctx.ellipse(0, m.tile * 0.23, m.tile * 0.38, m.tile * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    const greens = ["#74b85d", "#8fc96a", "#5fa450"];
    [[-0.22, 0.04], [0.05, -0.08], [0.25, 0.08], [-0.03, 0.15]].forEach(([dx, dy], i) => {
      ctx.fillStyle = greens[(i + index) % greens.length];
      ctx.beginPath();
      ctx.arc(dx * m.tile, dy * m.tile, m.tile * (0.23 - i * 0.012), 0, Math.PI * 2);
      ctx.fill();
    });
    drawFlower(m.tile * 0.08, -m.tile * 0.17, m.tile * 0.065, index % 2 ? "#f3a3bd" : "#fff3a4", 0.9);
    ctx.restore();
  });
}

function drawMushrooms(m) {
  state.mushrooms.forEach((mushroom, index) => {
    const temp = entity(mushroom.x, mushroom.y);
    const bob = Math.sin(performance.now() * 0.002 + index) * m.tile * 0.012;
    drawShadow(temp, m, 0.25);
    drawSprite(temp, "mushroom", m, 1.03, bob);
  });
}

function drawPortal(m) {
  const temp = entity(state.portal.x, state.portal.y);
  const center = tileCenter(temp, m);
  if (state.portalOpen) {
    const pulse = 0.8 + Math.sin(performance.now() * 0.005) * 0.12;
    const glow = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, m.tile * 0.75);
    glow.addColorStop(0, `rgba(255, 245, 164, ${0.35 * pulse})`);
    glow.addColorStop(0.55, `rgba(145, 218, 194, ${0.18 * pulse})`);
    glow.addColorStop(1, "rgba(145, 218, 194, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(center.x - m.tile, center.y - m.tile, m.tile * 2, m.tile * 2);
  }
  ctx.save();
  ctx.globalAlpha = state.portalOpen ? 1 : 0.42;
  drawSprite(temp, "portal", m, 1.22, state.portalOpen ? Math.sin(performance.now() * 0.004) * 2 : 0);
  ctx.restore();
}

function drawSeed(seed, m) {
  const bob = Math.sin(performance.now() * 0.005 + seed.spin) * m.tile * 0.05;
  drawSprite(seed, "seed", m, 0.72, bob);
}

function drawFriend(friend, m) {
  const bob = Math.sin(performance.now() * 0.004 + friend.phase) * m.tile * 0.025;
  drawShadow(friend, m, friend.type === "badger" ? 0.31 : 0.25);
  drawSprite(friend, friend.type, m, friend.type === "badger" ? 1.15 : 1.02, bob, friend.tilt);
  drawMood(friend, m);
}

function drawStepCue(m) {
  if (!state.running || state.paused) return;
  const center = tileCenter(state.player, m);
  const progress = 1 - state.beatRemain;
  const bonus = state.beatRemain <= 0.38;
  const radius = m.tile * (0.43 + Math.sin(progress * Math.PI) * 0.09);
  ctx.save();
  ctx.translate(center.x, center.y + m.tile * 0.11);
  ctx.strokeStyle = bonus ? "rgba(255, 224, 104, 0.9)" : "rgba(255, 255, 235, 0.62)";
  ctx.lineWidth = bonus ? 3 : 2;
  ctx.shadowColor = bonus ? "#ffe278" : "transparent";
  ctx.shadowBlur = bonus ? 10 : 0;
  ctx.beginPath();
  ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 4; i += 1) {
    const angle = i / 4 * Math.PI * 2 + progress * 0.25;
    drawFlower(Math.cos(angle) * radius, Math.sin(angle) * radius, m.tile * 0.04, bonus ? "#f4a0ba" : "#ffffff", bonus ? 1 : 0.7);
  }
  ctx.restore();

  if (state.queue.length) {
    const first = dirs[state.queue[0].dir];
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.strokeStyle = "rgba(79, 135, 91, 0.85)";
    ctx.fillStyle = "rgba(79, 135, 91, 0.85)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(first.x * m.tile * 0.15, first.y * m.tile * 0.15);
    ctx.lineTo(first.x * m.tile * 0.4, first.y * m.tile * 0.4);
    ctx.stroke();
    ctx.translate(first.x * m.tile * 0.42, first.y * m.tile * 0.42);
    ctx.rotate(Math.atan2(first.y, first.x) + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, m.tile * 0.08);
    ctx.lineTo(-m.tile * 0.07, -m.tile * 0.05);
    ctx.lineTo(m.tile * 0.07, -m.tile * 0.05);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawPlayer(m) {
  const anticipation = state.running ? Math.max(0, 1 - state.beatRemain * 2.4) : 0;
  const hop = state.beatFlash * m.tile * 0.1 - anticipation * m.tile * 0.02;
  drawShadow(state.player, m, 0.28 - state.beatFlash * 0.05);
  drawSprite(state.player, "player", m, 1.12, hop, state.player.tilt);
  drawMood(state.player, m);
}

function drawMood(item, m) {
  if (!item.mood) return;
  const center = tileCenter(item, m);
  const float = Math.sin(performance.now() * 0.01) * 2;
  ctx.save();
  ctx.translate(center.x + m.tile * 0.26, center.y - m.tile * 0.42 + float);
  ctx.fillStyle = "rgba(255, 253, 245, 0.94)";
  ctx.strokeStyle = "rgba(126, 111, 87, 0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, m.tile * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = item.mood === "heart" ? "#ed88a6" : "#d99066";
  ctx.font = `900 ${Math.max(11, m.tile * 0.2)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(item.mood === "heart" ? "♥" : "!", 0, 1);
  ctx.restore();
}

function drawShadow(item, m, scale) {
  const center = tileCenter(item, m);
  ctx.fillStyle = "rgba(65, 79, 39, 0.18)";
  ctx.beginPath();
  ctx.ellipse(center.x, center.y + m.tile * 0.26, m.tile * scale, m.tile * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSprite(item, name, m, scale = 1, offsetY = 0, rotation = 0) {
  const center = tileCenter(item, m);
  const squash = item.squash || 0;
  const width = m.tile * scale * (1 + squash * 0.08);
  const height = m.tile * scale * (1 - squash * 0.09);
  ctx.save();
  ctx.translate(center.x, center.y - offsetY);
  ctx.rotate(rotation || 0);
  if (spritesReady) {
    const [column, row] = spriteCells[name];
    const sourceWidth = sprites.naturalWidth / 4;
    const sourceHeight = sprites.naturalHeight / 2;
    ctx.drawImage(sprites, column * sourceWidth, row * sourceHeight, sourceWidth, sourceHeight, -width / 2, -height / 2, width, height);
  } else {
    ctx.fillStyle = name === "player" ? "#fff0cc" : name === "can" ? "#65cfd2" : "#f3a47e";
    ctx.beginPath();
    ctx.arc(0, 0, width * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawParticles(m) {
  state.particles.forEach((particle) => {
    ctx.save();
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.translate(m.ox + particle.x * m.tile, m.oy + particle.y * m.tile);
    ctx.rotate(particle.spin);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, particle.size, particle.size * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function frame(now) {
  const dt = Math.min(0.05, (now - state.lastFrame) / 1000);
  state.lastFrame = now;
  if (state.running && !state.paused) {
    while (now >= state.nextBeatAt) processBeat(now);
    state.beatRemain = clamp((state.nextBeatAt - now) / state.beatMs, 0, 1);
    const progress = (1 - state.beatRemain) * 100;
    ui.beatTrack.style.setProperty("--beat-progress", `${progress}%`);
    const bonus = state.beatRemain <= 0.38;
    ui.stepConsole.classList.toggle("is-sparkle", bonus);
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
loadGarden(0);
resizeCanvas();
requestAnimationFrame(frame);
