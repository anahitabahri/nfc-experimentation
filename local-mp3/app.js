const SONGS = [
  "songz/beautiful.mp3",
  "songz/bestfriend.mp3",
  "songz/canihaveitlikethat.mp3",
  "songz/comeclose.mp3",
  "songz/lastkiss.mp3",
  "songz/senorita.mp3",
  "songz/sweetlife.mp3",
  "songz/thatgirl.mp3",
  "songz/bootleg/comeclose_dilla.mp3",
  "songz/bootleg/excusememiss_rmx.mp3",
];

const audio = document.getElementById("audio");
const titleEl = document.getElementById("title");
const statusEl = document.getElementById("status");
const motionBtn = document.getElementById("motion-btn");
const playBtn = document.getElementById("play-btn");

let currentIndex = -1;
let lastShakeAt = 0;
const SHAKE_THRESHOLD = 18;
const SHAKE_COOLDOWN_MS = 1200;

function fileNameFrom(path) {
  return path.split("/").pop();
}

function pickNextIndex() {
  if (SONGS.length <= 1) return 0;
  let next;
  do { next = Math.floor(Math.random() * SONGS.length); }
  while (next === currentIndex);
  return next;
}

function playRandom() {
  currentIndex = pickNextIndex();
  const path = SONGS[currentIndex];
  audio.src = path;
  audio.play().catch(err => {
    statusEl.textContent = "tap play to start audio: " + err.message;
  });
  titleEl.textContent = fileNameFrom(path);
}

async function enableMotion() {
  if (typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      const res = await DeviceMotionEvent.requestPermission();
      if (res === "granted") {
        window.addEventListener("devicemotion", onMotion);
        statusEl.textContent = "motion enabled — shake for next song";
        motionBtn.disabled = true;
      } else {
        statusEl.textContent = "motion denied";
      }
    } catch (e) {
      statusEl.textContent = "motion error: " + e.message;
    }
  } else {
    window.addEventListener("devicemotion", onMotion);
    statusEl.textContent = "motion enabled — shake for next song";
    motionBtn.disabled = true;
  }
}

function onMotion(e) {
  const a = e.accelerationIncludingGravity || e.acceleration;
  if (!a) return;
  const magnitude = Math.sqrt((a.x||0)**2 + (a.y||0)**2 + (a.z||0)**2);
  const delta = Math.abs(magnitude - 9.8);
  const now = Date.now();
  if (delta > SHAKE_THRESHOLD && now - lastShakeAt > SHAKE_COOLDOWN_MS) {
    lastShakeAt = now;
    playRandom();
  }
}

motionBtn.addEventListener("click", enableMotion);
playBtn.addEventListener("click", playRandom);
