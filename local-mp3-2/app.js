// ====== shamrock — sound wall + shake-to-shuffle ======
// Songs are loaded from ../local-mp3/songz (no duplication).

const SONGZ = "../local-mp3/songz";

const TRACKS = [
  { file: `${SONGZ}/canihaveitlikethat.mp3`, title: "Can I Have It Like That", artist: "Pharrell" },
  { file: `${SONGZ}/senorita.mp3`,           title: "Señorita",               artist: "Pharrell" },
  { file: `${SONGZ}/bestfriend.mp3`,         title: "Best Friend",            artist: "Pharrell" },
  { file: `${SONGZ}/thatgirl.mp3`,           title: "That Girl",              artist: "Pharrell" },
  { file: `${SONGZ}/sweetlife.mp3`,          title: "Sweet Life",             artist: "Frank Ocean (prod. Pharrell)" },
  { file: `${SONGZ}/lastkiss.mp3`,           title: "Last Kiss",              artist: "OverDoz." },
  { file: `${SONGZ}/beautiful.mp3`,          title: "Beautiful",              artist: "Snoop Dogg (prod. Pharrell)" },
  { file: `${SONGZ}/comeclose.mp3`,          title: "Come Close",             artist: "Common ft. Mary J. Blige" },
];

const BOOTLEG_TRACKS = [
  { file: `${SONGZ}/bootleg/comeclose_dilla.mp3`,  title: "Come Close (J Dilla Remix)",      artist: "Common ft. Erykah Badu, Q-Tip, Pharrell" },
  { file: `${SONGZ}/bootleg/excusememiss_rmx.mp3`, title: "Excuse Me Miss (Fingalick Rerub)", artist: "Pharrell", start: 28, fadeIn: 3 },
];

// ---------- visual sketch state ----------
let cellSize = 10;
let cols, rows;
let fft, ampAnalyzer;
let song;
let isPlaying = false;
let songLoading = false;
let hasStarted = false;

// Webcam overlay
let video;
let camCols, camRows;
let camOffsetX, camOffsetY;
let camThreshold = 90;

let shuffleQueue = [];
let shuffleIndex = 0;
let activeTrackList = TRACKS;
let currentTrack = 0;

// Audio smoothing
let prevBass = 0, kickVal = 0;
let smoothBass = 0, smoothMid = 0, smoothHigh = 0, smoothEnergy = 0;

// Per-cell data
let cellHueOffset = [];
let cellPhase = [];

// Color palettes
let palettes = [
  [[10, 80, 255], [0, 200, 220], [0, 255, 140], [30, 40, 180], [0, 160, 200]],
  [[255, 20, 120], [255, 0, 200], [255, 60, 80], [200, 0, 100], [255, 130, 180]],
  [[180, 40, 255], [255, 50, 150], [100, 20, 200], [220, 80, 220], [140, 0, 255]],
  [[255, 140, 30], [255, 80, 50], [255, 200, 60], [220, 60, 30], [255, 110, 80]],
  [[160, 190, 255], [220, 230, 255], [80, 120, 220], [200, 210, 255], [40, 70, 180]],
];
let currentPal = 0, nextPal = 1, palBlend = 0, palTimer = 0;

// Chop system
let chopPieces = [];
let chopState = 0, chopTimer = 0, chopDuration = 0, chopHoldTime = 0, chopCooldown = 0;
const CHOP_COOLDOWN_MIN = 10;
const CHOP_COOLDOWN_MAX = 30;
let slowEnergy = 0;

// Underground / bootleg mode
let underground = false;
let ugAmount = 0;
let ugTransitioning = false;
let ugTransTimer = 0;
const UG_TRANS_DUR = 2.0;
let ugGlitch = 0;
let ugTilt = 0;

// Secret code (kept for desktop testing)
let keyBuffer = "";
let keyBufferTimer = 0;
const SECRET_CODE = "zzz";

// Underground particles
let ugParticles = [];
const UG_PARTICLE_COUNT = 60;

// ---------- shake detection ----------
let lastShakeAt = 0;
const SHAKE_THRESHOLD = 18;
const SHAKE_COOLDOWN_MS = 1200;

// ====== p5 lifecycle ======

function buildShuffleQueue() {
  shuffleQueue = [];
  for (let i = 0; i < activeTrackList.length; i++) shuffleQueue.push(i);
  for (let i = shuffleQueue.length - 1; i > 0; i--) {
    let j = floor(random(i + 1));
    [shuffleQueue[i], shuffleQueue[j]] = [shuffleQueue[j], shuffleQueue[i]];
  }
  shuffleIndex = 0;
}

function getNextShuffledTrack() {
  shuffleIndex++;
  if (shuffleIndex >= shuffleQueue.length) {
    let lastPlayed = shuffleQueue[shuffleQueue.length - 1];
    buildShuffleQueue();
    if (shuffleQueue[0] === lastPlayed && shuffleQueue.length > 1) {
      let swapIdx = 1 + floor(random(shuffleQueue.length - 1));
      [shuffleQueue[0], shuffleQueue[swapIdx]] = [shuffleQueue[swapIdx], shuffleQueue[0]];
    }
    shuffleIndex = 0;
  }
  return shuffleQueue[shuffleIndex];
}

function initUgParticles() {
  ugParticles = [];
  for (let i = 0; i < UG_PARTICLE_COUNT; i++) {
    ugParticles.push({
      x: random(width), y: random(height),
      vx: random(-0.3, 0.3), vy: random(-0.2, 0.2),
      sz: random(2, 6),
      brightness: random(0.1, 0.4),
      phase: random(TWO_PI),
    });
  }
}

function preload() {
  activeTrackList = TRACKS;
  buildShuffleQueue();
  currentTrack = shuffleQueue[0];
  song = loadSound(TRACKS[currentTrack].file);
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  cols = floor(width / cellSize);
  rows = floor(height / cellSize);
  fft = new p5.FFT(0.8, 512);
  ampAnalyzer = new p5.Amplitude();
  initCells();
  initUgParticles();

  camRows = floor(rows * 0.65);
  camCols = floor(camRows * (4 / 3));
  camOffsetX = floor((cols - camCols) / 2);
  camOffsetY = floor((rows - camRows) / 2);

  // Front camera on phones (selfie). Falls back to default on desktop.
  video = createCapture(
    { video: { facingMode: "user" }, audio: false },
    () => { video.size(camCols, camRows); }
  );
  video.size(camCols, camRows);
  video.hide();

  noStroke();
  wireUI();
}

function initCells() {
  let total = cols * rows;
  cellHueOffset = new Array(total);
  cellPhase = new Array(total);
  for (let i = 0; i < total; i++) {
    cellHueOffset[i] = random(-0.2, 0.2);
    cellPhase[i] = random(TWO_PI);
  }
}

// ====== UI flow ======

function wireUI() {
  const motionBtn = document.getElementById("motion-btn");
  const startBtn  = document.getElementById("start-btn");
  const motionErr = document.getElementById("motion-err");
  const screenMotion = document.getElementById("screen-motion");
  const screenStart  = document.getElementById("screen-start");
  const overlay = document.getElementById("overlay");

  motionBtn.addEventListener("click", async () => {
    const ok = await requestMotionPermission(motionErr);
    if (!ok) return;
    screenMotion.classList.remove("active");
    screenStart.classList.add("active");
  });

  startBtn.addEventListener("click", () => {
    startExperience();
    overlay.classList.add("hidden");
  });
}

async function requestMotionPermission(errEl) {
  if (typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      const res = await DeviceMotionEvent.requestPermission();
      if (res === "granted") {
        window.addEventListener("devicemotion", onMotion);
        return true;
      }
      errEl.textContent = "motion denied — you can still tap to start";
      return true; // proceed anyway; shake just won't work
    } catch (e) {
      errEl.textContent = "motion error: " + e.message;
      return true;
    }
  } else {
    // No permission API needed (Android / desktop)
    window.addEventListener("devicemotion", onMotion);
    return true;
  }
}

function startExperience() {
  if (hasStarted) return;
  hasStarted = true;
  getAudioContext().resume().then(() => {
    const track = activeTrackList[currentTrack];
    const startTime = track.start || 0;
    const fadeIn = track.fadeIn || 0;
    if (fadeIn > 0) {
      song.setVolume(0);
      song.play(0, 1, 1, startTime);
      song.setVolume(1, fadeIn);
    } else {
      song.play(0, 1, 1, startTime);
    }
    isPlaying = true;
  });
}

function onMotion(e) {
  if (!hasStarted) return;
  const a = e.accelerationIncludingGravity || e.acceleration;
  if (!a) return;
  const magnitude = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
  const delta = Math.abs(magnitude - 9.8);
  const now = Date.now();
  if (delta > SHAKE_THRESHOLD && now - lastShakeAt > SHAKE_COOLDOWN_MS) {
    lastShakeAt = now;
    switchTrack(getNextShuffledTrack());
  }
}

// ====== underground transition ======

function toggleUnderground() {
  ugTransitioning = true;
  ugTransTimer = 0;
  if (!underground) {
    underground = true;
    activeTrackList = BOOTLEG_TRACKS;
    buildShuffleQueue();
    switchTrack(shuffleQueue[0]);
  } else {
    underground = false;
    activeTrackList = TRACKS;
    buildShuffleQueue();
    switchTrack(shuffleQueue[0]);
  }
}

function updateUndergroundTransition(dt) {
  if (!ugTransitioning) return;
  ugTransTimer += dt;
  let t = min(ugTransTimer / UG_TRANS_DUR, 1);
  ugGlitch = sin(t * PI) * 1.0;
  let eased = t < 0.5 ? 2*t*t : 1 - pow(-2*t+2, 2) / 2;
  ugAmount = underground ? eased : (1 - eased);
  if (t >= 1) {
    ugTransitioning = false;
    ugGlitch = 0;
    ugAmount = underground ? 1 : 0;
  }
}

// ====== chop ======

function startChop() {
  if (chopState !== 0) return;
  chopPieces = [];
  let style = random() < 0.5 ? 0 : 1;
  if (style === 0) {
    let n = floor(random(4, 8));
    let h = floor(rows / n);
    for (let i = 0; i < n; i++) {
      let sy = i * h;
      let sh = (i === n-1) ? rows-sy : h;
      let dir = (i % 2 === 0) ? 1 : -1;
      chopPieces.push({ sx:0, sy, sw:cols, sh, ox:0,oy:0, targetOx:dir*random(4,12), targetOy:random(-1,1) });
    }
  } else {
    let n = floor(random(4, 7));
    let w = floor(cols / n);
    for (let i = 0; i < n; i++) {
      let sx = i * w;
      let sw = (i === n-1) ? cols-sx : w;
      let dir = (i % 2 === 0) ? 1 : -1;
      chopPieces.push({ sx, sy:0, sw, sh:rows, ox:0,oy:0, targetOx:random(-2,2), targetOy:dir*random(3,8) });
    }
  }
  chopState = 1;
  chopTimer = 0;
  chopDuration = random(0.4, 0.8);
  chopHoldTime = random(1.5, 3.0);
}

function updateChop(dt) {
  if (chopState === 0) return;
  chopTimer += dt;
  if (chopState === 1) {
    let t = min(chopTimer / chopDuration, 1);
    let e = easeOutCubic(t);
    for (let p of chopPieces) { p.ox = p.targetOx * e; p.oy = p.targetOy * e; }
    if (t >= 1) { chopState = 2; chopTimer = 0; }
  } else if (chopState === 2) {
    if (chopTimer > chopHoldTime) { chopState = 3; chopTimer = 0; chopDuration = random(0.3, 0.7); }
  } else if (chopState === 3) {
    let t = min(chopTimer / chopDuration, 1);
    let e = easeInCubic(t);
    for (let p of chopPieces) { p.ox = p.targetOx * (1 - e); p.oy = p.targetOy * (1 - e); }
    if (t >= 1) { chopState = 0; chopPieces = []; }
  }
}

function easeOutCubic(t) { return 1 - pow(1-t, 3); }
function easeInCubic(t)  { return t*t*t; }

// ====== underground particles ======

function updateUgParticles(dt, t) {
  for (let p of ugParticles) {
    p.x += p.vx + smoothBass * random(-0.5, 0.5);
    p.y += p.vy + smoothHigh * random(-0.3, 0.3);
    if (p.x < -10) p.x = width + 10;
    if (p.x > width + 10) p.x = -10;
    if (p.y < -10) p.y = height + 10;
    if (p.y > height + 10) p.y = -10;
    p.brightness = 0.08 + sin(t * 1.5 + p.phase) * 0.06 + smoothEnergy * 0.25 + kickVal * 0.15;
  }
}

function drawUgParticles(alpha) {
  for (let p of ugParticles) {
    let b = p.brightness * 255 * alpha;
    fill(b);
    noStroke();
    ellipse(p.x, p.y, p.sz * (1 + smoothBass * 0.5), p.sz * (1 + smoothBass * 0.5));
  }
}

// ====== draw ======

function draw() {
  background(0);

  let dt = deltaTime / 1000;
  dt = min(dt, 0.1);

  // Auto-advance when song ends
  if (isPlaying && !songLoading && song && !song.isPlaying() && hasStarted) {
    switchTrack(getNextShuffledTrack());
  }

  updateUndergroundTransition(dt);

  let targetTilt = underground ? sin(millis() * 0.0003) * 0.02 : 0;
  ugTilt = lerp(ugTilt, targetTilt, 0.02);

  keyBufferTimer += dt;
  if (keyBufferTimer > 2) keyBuffer = "";

  let spectrum = fft.analyze();
  let level = ampAnalyzer.getLevel();
  let bass = fft.getEnergy("bass") / 255;
  let mid  = fft.getEnergy("mid")  / 255;
  let high = fft.getEnergy("treble") / 255;

  smoothBass   = lerp(smoothBass, bass, 0.3);
  smoothMid    = lerp(smoothMid, mid, 0.25);
  smoothHigh   = lerp(smoothHigh, high, 0.25);
  smoothEnergy = lerp(smoothEnergy, pow(level, 0.4), 0.2);

  let kick = 0;
  if (bass - prevBass > 0.1) {
    kick = constrain((bass - prevBass) * 3, 0, 1);
  }
  prevBass = lerp(prevBass, bass, 0.15);
  kickVal *= 0.85;
  if (kick > kickVal) kickVal = kick;

  palTimer += dt;
  if (palTimer > 20) {
    currentPal = nextPal;
    nextPal = (nextPal + 1) % palettes.length;
    palBlend = 0;
    palTimer = 0;
  }
  palBlend = min(1, palBlend + dt / 3);
  let pal = blendPals(palettes[currentPal], palettes[nextPal], palBlend);

  slowEnergy = lerp(slowEnergy, smoothEnergy, 0.02);
  let energyDelta = smoothEnergy - slowEnergy;
  chopCooldown = max(0, chopCooldown - dt);

  let chopEnergyThresh = underground ? 0.10 : 0.15;
  let chopKickThresh   = underground ? 0.2  : 0.3;

  if (chopState === 0 && chopCooldown <= 0 && energyDelta > chopEnergyThresh && kick > chopKickThresh) {
    startChop();
    let cdMin = underground ? 8  : CHOP_COOLDOWN_MIN;
    let cdMax = underground ? 20 : CHOP_COOLDOWN_MAX;
    chopCooldown = random(cdMin, cdMax);
  }
  updateChop(dt);

  let t = millis() * 0.001;
  if (ugAmount > 0.01) updateUgParticles(dt, t);

  push();
  if (abs(ugTilt) > 0.001) {
    translate(width/2, height/2);
    rotate(ugTilt);
    translate(-width/2, -height/2);
  }
  if (ugGlitch > 0.01) {
    let gx = (random()-0.5) * ugGlitch * 60;
    let gy = (random()-0.5) * ugGlitch * 30;
    translate(gx, gy);
  }

  if (ugAmount < 0.99) {
    let gridAlpha = 1 - ugAmount;
    if (chopState === 0) {
      drawSurfaceGrid(0, 0, cols, rows, 0, 0, spectrum, pal, t, gridAlpha);
    } else {
      for (let p of chopPieces) {
        drawSurfaceGrid(p.sx, p.sy, p.sw, p.sh, p.ox, p.oy, spectrum, pal, t, gridAlpha);
      }
    }
  }

  if (ugAmount > 0.01) drawUgParticles(ugAmount);

  drawWebcamLayer(pal, t);
  pop();

  if (ugAmount > 0.01) drawScanlines();
  if (ugGlitch > 0.3)  drawGlitchBurst();
}

function drawSurfaceGrid(startX, startY, w, h, offX, offY, spectrum, pal, t, alpha) {
  for (let y = startY; y < startY + h && y < rows; y++) {
    for (let x = startX; x < startX + w && x < cols; x++) {
      let gi = y * cols + x;
      let px = (x + offX) * cellSize;
      let py = (y + offY) * cellSize;

      let n = noise(x * 0.1, y * 0.1, t * 0.3);
      let freqIdx = floor(n * spectrum.length * 0.5);
      freqIdx = constrain(freqIdx, 0, spectrum.length - 1);
      let specVal = spectrum[freqIdx] / 255;

      let cn = noise(x * 0.05, y * 0.05, t * 0.2);
      let ci = constrain(floor(cn * pal.length), 0, pal.length - 1);
      let c = pal[ci];

      let phase = cellPhase[gi];
      let breathe = sin(t * 2 + phase) * 0.04;
      let bright = 0.08 + specVal * 0.4 + smoothEnergy * 0.55 + breathe + kickVal * 0.3;
      bright = constrain(bright, 0.03, 1.2);

      let sz = cellSize * (0.2 + specVal * 0.4 + smoothEnergy * 0.3 + smoothBass * 0.15 + kickVal * 0.2);
      sz = constrain(sz, cellSize * 0.1, cellSize * 0.95);
      let pad = (cellSize - sz) / 2;

      fill(c[0] * bright * alpha, c[1] * bright * alpha, c[2] * bright * alpha);
      rect(px + pad, py + pad, sz, sz);
    }
  }
}

function drawWebcamLayer(pal, t) {
  if (!video) return;
  video.loadPixels();
  if (!video.pixels || video.pixels.length === 0) return;

  for (let y = 0; y < camRows; y++) {
    for (let x = 0; x < camCols; x++) {
      let idx = (x + y * video.width) * 4;
      if (idx + 2 >= video.pixels.length) continue;

      let r = video.pixels[idx];
      let g = video.pixels[idx + 1];
      let b = video.pixels[idx + 2];
      let avg = (r + g + b) / 3;

      let gx = x + camOffsetX;
      let gy = y + camOffsetY;
      let px = gx * cellSize;
      let py = gy * cellSize;

      if (ugAmount < 0.01) {
        if (avg >= camThreshold) continue;
        fill(0);
        rect(px + 1, py + 1, cellSize - 2, cellSize - 2);
      } else if (ugAmount > 0.99) {
        if (avg >= camThreshold) continue;
        let darkness = 1 - (avg / camThreshold);
        let intensity = darkness * (0.5 + smoothEnergy * 0.5 + kickVal * 0.3);
        intensity = constrain(intensity, 0, 1);
        let bri = intensity * 255;
        fill(bri, bri * 0.97, bri * 0.93);
        ellipse(px + cellSize/2, py + cellSize/2, cellSize - 2, cellSize - 2);
      } else {
        if (avg >= camThreshold) continue;
        let darkness = 1 - (avg / camThreshold);
        let intensity = darkness * (0.5 + smoothEnergy * 0.5);
        let bri = ugAmount * intensity * 255;
        let finalR = lerp(0, bri, ugAmount);
        let finalG = lerp(0, bri * 0.97, ugAmount);
        let finalB = lerp(0, bri * 0.93, ugAmount);
        fill(finalR, finalG, finalB);
        let cornerR = ugAmount * (cellSize-2) * 0.5;
        rect(px + 1, py + 1, cellSize - 2, cellSize - 2, cornerR);
      }
    }
  }
}

function drawScanlines() {
  let alpha = ugAmount * 25;
  for (let y = 0; y < height; y += 3) {
    fill(0, alpha);
    noStroke();
    rect(0, y, width, 1);
  }
}

function drawGlitchBurst() {
  let intensity = ugGlitch;
  let cellCount = floor(intensity * 200);
  for (let i = 0; i < cellCount; i++) {
    let px = random(width);
    let py = random(height);
    let sz = random(3, 10);
    let bri = random() < 0.6 ? random(180, 255) : random(0, 40);
    fill(bri, random(120, 255));
    noStroke();
    if (random() < ugAmount) ellipse(px, py, sz, sz);
    else rect(px, py, sz, sz);
  }
}

function blendPals(a, b, t) {
  let r = [];
  for (let i = 0; i < a.length; i++) {
    r.push([lerp(a[i][0],b[i][0],t), lerp(a[i][1],b[i][1],t), lerp(a[i][2],b[i][2],t)]);
  }
  return r;
}

function switchTrack(idx) {
  if (songLoading) return;
  songLoading = true;
  if (song && song.isPlaying()) song.stop();
  currentTrack = idx;
  song = loadSound(activeTrackList[currentTrack].file, () => {
    let track = activeTrackList[currentTrack];
    let startTime = track.start || 0;
    let fadeIn = track.fadeIn || 0;
    if (fadeIn > 0) {
      song.setVolume(0);
      song.play(0, 1, 1, startTime);
      song.setVolume(1, fadeIn);
    } else {
      song.play(0, 1, 1, startTime);
    }
    isPlaying = true;
    songLoading = false;
    currentPal = nextPal;
    nextPal = (nextPal + 1) % palettes.length;
    palBlend = 0;
    palTimer = 0;
  });
}

// Desktop keyboard controls (kept for testing)
function keyPressed() {
  if (key.length === 1 && key.match(/[a-z]/i)) {
    keyBuffer += key.toLowerCase();
    keyBufferTimer = 0;
    if (keyBuffer.length >= SECRET_CODE.length) {
      let tail = keyBuffer.slice(-SECRET_CODE.length);
      if (tail === SECRET_CODE) { keyBuffer = ""; toggleUnderground(); return; }
    }
    if (keyBuffer.length > 20) keyBuffer = keyBuffer.slice(-10);
  }
  if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW) {
    let idx;
    if (keyCode === RIGHT_ARROW) idx = getNextShuffledTrack();
    else { shuffleIndex = max(0, shuffleIndex - 2); idx = shuffleQueue[shuffleIndex]; }
    switchTrack(idx);
  } else if (key === " ") {
    if (song.isPlaying()) song.pause();
    else song.play();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  cols = floor(width / cellSize);
  rows = floor(height / cellSize);
  initCells();
  initUgParticles();
  camRows = floor(rows * 0.65);
  camCols = floor(camRows * (4 / 3));
  camOffsetX = floor((cols - camCols) / 2);
  camOffsetY = floor((rows - camRows) / 2);
  if (video) video.size(camCols, camRows);
}
