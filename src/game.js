const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const ui = {
  moves: document.querySelector("#moves"),
  seeds: document.querySelector("#seeds"),
  gardensCleared: document.querySelector("#gardens-cleared"),
  depth: document.querySelector("#depth"),
  roomName: document.querySelector("#room-name"),
  objective: document.querySelector("#objective"),
  sealStatus: document.querySelector("#seal-status"),
  coachText: document.querySelector("#coach-text"),
  overlay: document.querySelector("#overlay"),
  eyebrow: document.querySelector("#overlay .eyebrow"),
  heading: document.querySelector("#overlay h2"),
  introCopy: document.querySelector("#overlay .intro-copy"),
  howTo: document.querySelector("#overlay .how-to"),
  puzzleTip: document.querySelector("#overlay .puzzle-tip"),
  start: document.querySelector("#start"),
  help: document.querySelector("#help"),
  undo: document.querySelector("#undo"),
  restart: document.querySelector("#restart"),
  message: document.querySelector("#floating-message"),
};

const SIZE = 7;
const dirs = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
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
    hint: "두 물뿌리개를 위쪽 꽃밭에 놓아 주세요",
    player: [3, 4],
    portal: [5, 1],
    hedges: [[1, 3], [3, 5]],
    beds: [[2, 1], [4, 2]],
    cans: [[2, 2], [4, 4]],
    mushrooms: [[3, 2]],
    seeds: [[1, 1], [5, 5], [3, 5]],
    friends: [{ type: "dandelion", at: [1, 5] }],
  },
  {
    name: "햇살 연못",
    hint: "두 물뿌리개의 자리를 바꾸어 꽃을 피워요",
    player: [1, 3],
    portal: [5, 3],
    hedges: [[2, 2], [4, 4]],
    beds: [[3, 1], [3, 5]],
    cans: [[2, 3], [4, 3]],
    mushrooms: [[1, 1], [5, 5]],
    seeds: [[1, 4], [5, 2], [5, 4]],
    friends: [{ type: "mole", at: [1, 5] }, { type: "badger", at: [5, 1] }],
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
  started: false,
  running: false,
  complete: false,
  overlayMode: "intro",
  inputLocked: false,
  gardenIndex: 0,
  player: null,
  cans: [],
  beds: [],
  seeds: [],
  mushrooms: [],
  hedges: [],
  friends: [],
  portal: null,
  portalOpen: false,
  moves: 0,
  totalSeeds: 0,
  levelSeedBase: 0,
  gardensCleared: 0,
  history: [],
  tutorialStage: 0,
  shake: 0,
  moveFlash: 0,
  messageTimer: 0,
  particles: [],
  audio: null,
  lastFrame: performance.now(),
  swipe: null,
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

function makeAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  const context = new AudioContext();
  const master = context.createGain();
  master.gain.value = 0.12;
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

function playSound(kind) {
  if (kind === "move") tone(420, 0.055, 0.025, "sine");
  if (kind === "push") {
    tone(330, 0.09, 0.055, "triangle");
    tone(440, 0.08, 0.035, "sine", 0.035);
  }
  if (kind === "seed") {
    tone(690, 0.1, 0.08, "triangle");
    tone(920, 0.13, 0.05, "sine", 0.045);
  }
  if (kind === "bloom") [523, 659, 784].forEach((note, index) => tone(note, 0.28, 0.07, "sine", index * 0.07));
  if (kind === "bump") tone(210, 0.075, 0.04, "sine");
  if (kind === "undo") tone(350, 0.07, 0.035, "triangle");
}

function haptic(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function loadGarden(index, mode = "new") {
  if (mode === "restart") state.totalSeeds = state.levelSeedBase;
  if (mode === "new") state.levelSeedBase = state.totalSeeds;

  const garden = gardens[index];
  state.gardenIndex = index;
  state.hedges = garden.hedges.map(([x, y]) => ({ x, y }));
  state.beds = garden.beds.map(([x, y]) => ({ x, y }));
  state.cans = garden.cans.map(([x, y]) => entity(x, y));
  state.mushrooms = garden.mushrooms.map(([x, y], phase) => ({ x, y, phase }));
  state.seeds = garden.seeds.map(([x, y]) => entity(x, y, { spin: Math.random() * Math.PI }));
  state.friends = garden.friends.map((friend, friendIndex) => {
    const [x, y] = friend.at;
    return entity(x, y, { type: friend.type, phase: friendIndex * 1.35 });
  });
  state.player = entity(garden.player[0], garden.player[1]);
  state.portal = { x: garden.portal[0], y: garden.portal[1] };
  state.portalOpen = false;
  state.moves = 0;
  state.history = [];
  state.inputLocked = false;
  state.tutorialStage = index === 0 ? 0 : 4;
  state.particles = [];
  ui.roomName.textContent = garden.name;
  ui.objective.textContent = garden.hint;
  updateGarden(false);
  updateHud();
  updateCoach();
}

function resetRun() {
  state.complete = false;
  state.totalSeeds = 0;
  state.levelSeedBase = 0;
  state.gardensCleared = 0;
  loadGarden(0, "new");
}

function renderOverlay(mode) {
  state.overlayMode = mode;
  ui.howTo.hidden = mode === "finish";
  ui.puzzleTip.hidden = mode === "finish";

  if (mode === "finish") {
    ui.eyebrow.textContent = "ALL GARDENS ARE BLOOMING";
    ui.heading.innerHTML = "세 정원이 모두<br><em>활짝 피었어요</em>";
    ui.introCopy.textContent = `총 ${state.totalSeeds}개의 햇살 씨앗을 모았어요. 이제 더 적은 이동으로 다시 풀어 보세요.`;
    ui.start.querySelector("span").textContent = "다시 산책하기";
  } else if (mode === "help") {
    ui.eyebrow.textContent = "HOW TO PLAY";
    ui.heading.innerHTML = "세 가지만 알면<br><em>바로 풀 수 있어요</em>";
    ui.introCopy.textContent = "물뿌리개를 벽 모서리로 밀기 전에 다음 길을 먼저 살펴보세요.";
    ui.start.querySelector("span").textContent = "퍼즐 계속하기";
  } else {
    ui.eyebrow.textContent = "MOMO'S GARDEN PUZZLE";
    ui.heading.innerHTML = "밀고, 피우고,<br><em>꽃문을 열어요</em>";
    ui.introCopy.textContent = "모모와 함께 물뿌리개를 제자리로 옮겨 정원을 깨워 주세요.";
    ui.start.querySelector("span").textContent = "첫 정원 시작";
  }
}

function beginGame() {
  if (!state.audio) state.audio = makeAudio();
  state.audio?.context.resume();
  if (!state.started || state.overlayMode === "finish") {
    resetRun();
    state.started = true;
  }
  state.running = true;
  state.complete = false;
  ui.overlay.classList.add("is-hidden");
  showMessage(state.gardenIndex === 0 ? "화살표를 누르면 바로 움직여요" : "정원을 천천히 살펴보세요", "good", 1.8);
}

function showHelp() {
  if (!state.started || state.complete) return;
  renderOverlay("help");
  ui.overlay.classList.remove("is-hidden");
}

function restartGarden() {
  if (!state.started || state.complete || !ui.overlay.classList.contains("is-hidden")) return;
  loadGarden(state.gardenIndex, "restart");
  state.running = true;
  flashTool(ui.restart);
  showMessage("현재 정원을 처음부터 다시 시작했어요", "good", 1.4);
  haptic(12);
}

function snapshot() {
  return {
    player: { x: state.player.x, y: state.player.y },
    cans: state.cans.map((can) => ({ x: can.x, y: can.y })),
    seeds: state.seeds.map((seed) => ({ x: seed.x, y: seed.y, spin: seed.spin })),
    moves: state.moves,
    totalSeeds: state.totalSeeds,
    portalOpen: state.portalOpen,
    tutorialStage: state.tutorialStage,
  };
}

function undoMove() {
  if (!state.running || state.complete || !state.history.length || !ui.overlay.classList.contains("is-hidden")) return;
  const previous = state.history.pop();
  state.player.x = previous.player.x;
  state.player.y = previous.player.y;
  state.player.squash = 0.55;
  state.cans = previous.cans.map((can) => entity(can.x, can.y));
  state.seeds = previous.seeds.map((seed) => entity(seed.x, seed.y, { spin: seed.spin }));
  state.moves = previous.moves;
  state.totalSeeds = previous.totalSeeds;
  state.portalOpen = previous.portalOpen;
  state.tutorialStage = previous.tutorialStage;
  updateGarden(false);
  updateHud();
  updateCoach();
  flashTool(ui.undo);
  showMessage("한 수 되돌렸어요", "good", 0.9);
  playSound("undo");
  haptic(8);
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
  return !isInside(x, y) || hedgeAt(x, y) || mushroomAt(x, y) || friendAt(x, y);
}

function movePlayer(dir) {
  if (!state.running || state.complete || state.inputLocked || !ui.overlay.classList.contains("is-hidden")) return;
  const delta = dirs[dir];
  if (!delta) return;

  const tx = state.player.x + delta.x;
  const ty = state.player.y + delta.y;
  const can = canAt(tx, ty);
  let bx;
  let by;

  if (blocked(tx, ty)) {
    friendlyBump(friendAt(tx, ty) ? "숲 친구가 쉬고 있어요" : mushroomAt(tx, ty) ? "버섯이 길을 막고 있어요" : "그쪽으로는 갈 수 없어요");
    lockInput();
    return;
  }

  if (can) {
    bx = tx + delta.x;
    by = ty + delta.y;
    if (blocked(bx, by) || canAt(bx, by) || same(state.portal, { x: bx, y: by })) {
      friendlyBump("물뿌리개는 그쪽으로 밀 수 없어요");
      lockInput();
      return;
    }
  }

  state.history.push(snapshot());
  state.player.tilt = delta.x * 0.09;
  state.player.x = tx;
  state.player.y = ty;
  state.player.squash = 1;
  state.moveFlash = 1;
  state.moves += 1;

  if (can) {
    can.x = bx;
    can.y = by;
    can.squash = 1;
    burst(bx, by, ["#7ed4e5", "#d7f5ef", "#ffffff"], 9);
    playSound("push");
    haptic([10, 24, 10]);
    if (state.gardenIndex === 0 && state.tutorialStage < 2) state.tutorialStage = 2;
  } else {
    playSound("move");
    haptic(7);
    if (state.gardenIndex === 0 && state.tutorialStage === 0) state.tutorialStage = 1;
  }

  collectSeed();
  updateGarden(true);
  updateHud();
  updateCoach();
  flashDirection(dir);
  lockInput();

  if (state.portalOpen && same(state.player, state.portal)) completeGarden();
}

function lockInput() {
  state.inputLocked = true;
  window.setTimeout(() => { state.inputLocked = false; }, 105);
}

function collectSeed() {
  const seed = state.seeds.find((item) => same(item, state.player));
  if (!seed) return;
  state.seeds = state.seeds.filter((item) => item !== seed);
  state.totalSeeds += 1;
  setMood(state.player, "heart", 0.72);
  burst(seed.x, seed.y, ["#ffe27a", "#f6a6bd", "#fff8d0"], 16);
  showMessage("햇살 씨앗을 찾았어요", "good", 1.05);
  playSound("seed");
  haptic([8, 25, 8]);
}

function friendlyBump(message) {
  state.shake = 2.6;
  state.player.squash = 0.55;
  setMood(state.player, "surprise", 0.62);
  showMessage(`${message} · 다른 길을 찾아봐요`, "bad", 1.15);
  playSound("bump");
  haptic(18);
}

function updateGarden(announce) {
  const blooming = state.beds.filter((bed) => state.cans.some((can) => same(bed, can))).length;
  const wasOpen = state.portalOpen;
  state.portalOpen = blooming === state.beds.length;
  ui.sealStatus.textContent = `${blooming}/${state.beds.length}`;

  if (state.portalOpen) {
    ui.objective.textContent = "꽃문이 열렸어요 · 문으로 이동하세요";
    if (!wasOpen && announce) {
      state.tutorialStage = 3;
      showMessage("모든 꽃이 피어 꽃문이 열렸어요!", "good", 1.7);
      playSound("bloom");
      haptic([15, 35, 15, 35, 22]);
      burst(state.portal.x, state.portal.y, ["#fff39c", "#f6a6bd", "#9edbc0", "#a9cfee"], 34);
    }
  } else {
    ui.objective.textContent = gardens[state.gardenIndex].hint;
  }
}

function completeGarden() {
  state.running = false;
  state.gardensCleared += 1;
  updateHud();
  playSound("bloom");
  burst(state.player.x, state.player.y, ["#fff39c", "#f6a6bd", "#9edbc0"], 32);

  if (state.gardenIndex === gardens.length - 1) {
    state.complete = true;
    window.setTimeout(() => {
      renderOverlay("finish");
      ui.overlay.classList.remove("is-hidden");
    }, 620);
    return;
  }

  showMessage("다음 정원으로 폴짝!", "good", 1.1);
  window.setTimeout(() => {
    loadGarden(state.gardenIndex + 1, "new");
    state.running = true;
  }, 620);
}

function updateCoach() {
  if (state.portalOpen) {
    ui.coachText.textContent = "꽃문이 열렸어요. 빛나는 문으로 이동하세요.";
  } else if (state.gardenIndex === 0 && state.tutorialStage === 0) {
    ui.coachText.textContent = "화살표를 눌러 모모를 한 칸 움직여 보세요.";
  } else if (state.gardenIndex === 0 && state.tutorialStage === 1) {
    ui.coachText.textContent = "물뿌리개 뒤에서 같은 방향을 누르면 밀 수 있어요.";
  } else if (state.gardenIndex === 0 && state.tutorialStage === 2) {
    ui.coachText.textContent = "좋아요! 물뿌리개를 반짝이는 꽃밭에 놓으세요.";
  } else {
    ui.coachText.textContent = "당길 수는 없어요. 막히면 ↶ 버튼으로 되돌리세요.";
  }
}

function updateHud() {
  ui.moves.textContent = state.moves;
  ui.seeds.textContent = state.totalSeeds;
  ui.gardensCleared.textContent = state.gardensCleared;
  ui.depth.textContent = String(state.gardenIndex + 1).padStart(2, "0");
  ui.undo.disabled = state.history.length === 0 || !state.running;
}

function setMood(item, mood, duration) {
  item.mood = mood;
  item.moodTimer = duration;
}

function showMessage(text, kind = "good", duration = 1.2) {
  ui.message.textContent = text;
  ui.message.style.color = kind === "bad" ? "#ad6857" : "#587650";
  ui.message.classList.add("is-visible");
  state.messageTimer = duration;
}

function flashDirection(dir) {
  const button = document.querySelector(`[data-dir="${dir}"]`);
  button?.classList.add("is-pressed");
  window.setTimeout(() => button?.classList.remove("is-pressed"), 105);
}

function flashTool(button) {
  button.classList.add("is-pressed");
  window.setTimeout(() => button.classList.remove("is-pressed"), 110);
}

function burst(x, y, colors, count) {
  for (let index = 0; index < count; index += 1) {
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
  item.squash = Math.max(0, item.squash - dt * 5.2);
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
  state.moveFlash = Math.max(0, state.moveFlash - dt * 5.6);
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
  const metrics = boardMetrics();
  ctx.clearRect(0, 0, metrics.width, metrics.height);
  drawGardenBackground(metrics);
  const shakeX = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  const shakeY = state.shake ? (Math.random() - 0.5) * state.shake : 0;
  ctx.save();
  ctx.translate(shakeX, shakeY);
  drawBoardGuides(metrics);
  drawBeds(metrics);
  drawHedges(metrics);
  drawMushrooms(metrics);
  drawPortal(metrics);
  state.seeds.forEach((seed) => drawSeed(seed, metrics));
  state.friends.forEach((friend) => drawFriend(friend, metrics));
  state.cans.forEach((can) => drawSprite(can, "can", metrics, 1.04));
  drawPuzzleHint(metrics);
  drawPlayer(metrics);
  drawParticles(metrics);
  ctx.restore();
}

function drawGardenBackground(metrics) {
  if (gardenReady) {
    const scale = Math.max(metrics.width / gardenImage.naturalWidth, metrics.height / gardenImage.naturalHeight);
    const sourceWidth = metrics.width / scale;
    const sourceHeight = metrics.height / scale;
    const sourceX = (gardenImage.naturalWidth - sourceWidth) / 2;
    const sourceY = (gardenImage.naturalHeight - sourceHeight) / 2;
    ctx.drawImage(gardenImage, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, metrics.width, metrics.height);
  } else {
    ctx.fillStyle = "#9aca78";
    ctx.fillRect(0, 0, metrics.width, metrics.height);
  }
  ctx.fillStyle = "rgba(255, 250, 205, 0.1)";
  ctx.fillRect(0, 0, metrics.width, metrics.height);
}

function drawBoardGuides(metrics) {
  for (let y = 1; y < SIZE - 1; y += 1) {
    for (let x = 1; x < SIZE - 1; x += 1) {
      const center = tileCenter({ x, y }, metrics);
      ctx.fillStyle = (x + y) % 2 ? "rgba(233, 246, 194, 0.2)" : "rgba(255, 251, 214, 0.15)";
      ctx.beginPath();
      ctx.ellipse(center.x, center.y + metrics.tile * 0.08, metrics.tile * 0.43, metrics.tile * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function tileCenter(item, metrics) {
  return {
    x: metrics.ox + (item.rx ?? item.x) * metrics.tile + metrics.tile / 2,
    y: metrics.oy + (item.ry ?? item.y) * metrics.tile + metrics.tile / 2,
  };
}

function drawBeds(metrics) {
  state.beds.forEach((bed) => {
    const center = tileCenter(bed, metrics);
    const blooming = state.cans.some((can) => same(can, bed));
    ctx.fillStyle = blooming ? "rgba(255, 234, 142, 0.76)" : "rgba(111, 84, 67, 0.28)";
    ctx.beginPath();
    ctx.ellipse(center.x, center.y + metrics.tile * 0.16, metrics.tile * 0.37, metrics.tile * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let index = 0; index < 5; index += 1) {
      const angle = index / 5 * Math.PI * 2;
      drawFlower(
        center.x + Math.cos(angle) * metrics.tile * 0.2,
        center.y + Math.sin(angle) * metrics.tile * 0.12,
        metrics.tile * (blooming ? 0.075 : 0.055),
        blooming ? ["#f39ab4", "#fff1a0", "#91d5b3"][index % 3] : "#ddd3b9",
        blooming ? 1 : 0.74,
      );
    }
  });
}

function drawFlower(x, y, radius, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.fillStyle = color;
  for (let index = 0; index < 5; index += 1) {
    const angle = index / 5 * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, radius * 0.75, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#f5c85d";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHedges(metrics) {
  state.hedges.forEach((hedge) => {
    const center = tileCenter(hedge, metrics);
    ctx.fillStyle = "rgba(53, 107, 55, 0.19)";
    ctx.beginPath();
    ctx.ellipse(center.x, center.y + metrics.tile * 0.29, metrics.tile * 0.38, metrics.tile * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    [[-0.21, 0.03, 0.24], [0.03, -0.08, 0.3], [0.24, 0.04, 0.23]].forEach(([x, y, size], index) => {
      ctx.fillStyle = index === 1 ? "#6fae58" : "#589649";
      ctx.beginPath();
      ctx.arc(center.x + x * metrics.tile, center.y + y * metrics.tile, size * metrics.tile, 0, Math.PI * 2);
      ctx.fill();
    });
    drawFlower(center.x - metrics.tile * 0.14, center.y - metrics.tile * 0.15, metrics.tile * 0.045, "#f4a4bb");
  });
}

function drawMushrooms(metrics) {
  state.mushrooms.forEach((mushroom) => {
    const temp = entity(mushroom.x, mushroom.y);
    const bob = Math.sin(performance.now() * 0.003 + mushroom.phase) * 1.4;
    drawShadow(temp, metrics, 0.24);
    drawSprite(temp, "mushroom", metrics, 0.83, bob);
  });
}

function drawPortal(metrics) {
  const temp = entity(state.portal.x, state.portal.y);
  if (state.portalOpen) {
    const center = tileCenter(temp, metrics);
    const pulse = 0.32 + Math.sin(performance.now() * 0.004) * 0.05;
    ctx.fillStyle = "rgba(255, 244, 143, 0.32)";
    ctx.beginPath();
    ctx.arc(center.x, center.y, metrics.tile * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.globalAlpha = state.portalOpen ? 1 : 0.38;
  drawSprite(temp, "portal", metrics, 1.18, state.portalOpen ? Math.sin(performance.now() * 0.004) * 2 : 0);
  ctx.restore();
}

function drawSeed(seed, metrics) {
  const bob = Math.sin(performance.now() * 0.005 + seed.spin) * metrics.tile * 0.05;
  drawSprite(seed, "seed", metrics, 0.7, bob);
}

function drawFriend(friend, metrics) {
  const bob = Math.sin(performance.now() * 0.003 + friend.phase) * metrics.tile * 0.02;
  drawShadow(friend, metrics, friend.type === "badger" ? 0.3 : 0.24);
  drawSprite(friend, friend.type, metrics, friend.type === "badger" ? 1.1 : 0.98, bob);
  drawMood(friend, metrics);
}

function drawPuzzleHint(metrics) {
  if (!state.running || state.gardenIndex !== 0) return;
  let target = state.player;
  let color = "rgba(255, 255, 230, 0.9)";
  if (state.tutorialStage === 1 || state.tutorialStage === 2) {
    target = state.cans[0];
    color = "rgba(117, 211, 224, 0.92)";
  }
  if (state.portalOpen) {
    target = state.portal;
    color = "rgba(255, 226, 105, 0.95)";
  }
  const center = tileCenter(target, metrics);
  const pulse = 0.4 + Math.sin(performance.now() * 0.005) * 0.045;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(center.x, center.y, metrics.tile * pulse, 0, Math.PI * 2);
  ctx.stroke();
}

function drawPlayer(metrics) {
  const hop = state.moveFlash * metrics.tile * 0.11;
  drawShadow(state.player, metrics, 0.28 - state.moveFlash * 0.05);
  drawSprite(state.player, "player", metrics, 1.1, hop, state.player.tilt);
  drawMood(state.player, metrics);
}

function drawMood(item, metrics) {
  if (!item.mood) return;
  const center = tileCenter(item, metrics);
  const float = Math.sin(performance.now() * 0.01) * 2;
  ctx.save();
  ctx.translate(center.x + metrics.tile * 0.25, center.y - metrics.tile * 0.42 + float);
  ctx.fillStyle = "rgba(255, 253, 245, 0.94)";
  ctx.beginPath();
  ctx.arc(0, 0, metrics.tile * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = item.mood === "heart" ? "#ed88a6" : "#d99066";
  ctx.font = `900 ${Math.max(11, metrics.tile * 0.2)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(item.mood === "heart" ? "♥" : "!", 0, 1);
  ctx.restore();
}

function drawShadow(item, metrics, scale) {
  const center = tileCenter(item, metrics);
  ctx.fillStyle = "rgba(65, 79, 39, 0.18)";
  ctx.beginPath();
  ctx.ellipse(center.x, center.y + metrics.tile * 0.26, metrics.tile * scale, metrics.tile * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawSprite(item, name, metrics, scale = 1, offsetY = 0, rotation = 0) {
  const center = tileCenter(item, metrics);
  const squash = item.squash || 0;
  const width = metrics.tile * scale * (1 + squash * 0.08);
  const height = metrics.tile * scale * (1 - squash * 0.09);
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

function drawParticles(metrics) {
  state.particles.forEach((particle) => {
    ctx.save();
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.translate(metrics.ox + particle.x * metrics.tile, metrics.oy + particle.y * metrics.tile);
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
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

ui.start.addEventListener("click", beginGame);
ui.help.addEventListener("click", showHelp);
ui.undo.addEventListener("click", undoMove);
ui.restart.addEventListener("click", restartGarden);

document.querySelectorAll("[data-dir]").forEach((button) => {
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    movePlayer(button.dataset.dir);
  });
});

canvas.addEventListener("pointerdown", (event) => {
  state.swipe = { x: event.clientX, y: event.clientY, id: event.pointerId };
});

canvas.addEventListener("pointerup", (event) => {
  if (!state.swipe || state.swipe.id !== event.pointerId) return;
  const dx = event.clientX - state.swipe.x;
  const dy = event.clientY - state.swipe.y;
  state.swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
  movePlayer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
});

canvas.addEventListener("pointercancel", () => { state.swipe = null; });

window.addEventListener("keydown", (event) => {
  const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };
  if (map[event.key]) {
    event.preventDefault();
    movePlayer(map[event.key]);
  } else if (event.key === "z") {
    event.preventDefault();
    undoMove();
  } else if (event.key === "r") {
    event.preventDefault();
    restartGarden();
  }
});

window.addEventListener("resize", resizeCanvas);
renderOverlay("intro");
loadGarden(0, "new");
resizeCanvas();
requestAnimationFrame(frame);
