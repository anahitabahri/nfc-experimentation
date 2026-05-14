const VIDEOS = [
  "_OCl2xgosA8",
  "LcN8QINjvWM",
  "mZOxQ2t3810",
];

let player;
let activated = false;
let currentIndex = -1;
let lastShakeAt = 0;
const SHAKE_THRESHOLD = 18;
const SHAKE_COOLDOWN_MS = 1200;

const switchBtn = document.getElementById("switch-btn");
const hint = document.getElementById("hint");

function pickNextIndex() {
  if (VIDEOS.length <= 1) return 0;
  let next;
  do { next = Math.floor(Math.random() * VIDEOS.length); }
  while (next === currentIndex);
  return next;
}

function loadNextVideo() {
  if (!player || !player.loadVideoById) return;
  currentIndex = pickNextIndex();
  player.loadVideoById(VIDEOS[currentIndex]);
  hint.classList.add("flash");
  setTimeout(() => hint.classList.remove("flash"), 600);
}

window.onYouTubeIframeAPIReady = () => {
  player = new YT.Player("player", {
    videoId: VIDEOS[Math.floor(Math.random() * VIDEOS.length)],
    playerVars: {
      autoplay: 1,
      mute: 1,
      playsinline: 1,
      modestbranding: 1,
      rel: 0,
      origin: window.location.origin,
    },
    events: {
      onReady: (e) => {
        currentIndex = VIDEOS.indexOf(e.target.getVideoData().video_id);
        hint.classList.add("visible");
        try { e.target.mute(); e.target.playVideo(); } catch (err) {}
      },
      onError: (e) => console.warn("yt error", e.data),
    },
  });
};

async function activate() {
  if (activated) return;
  activated = true;

  try { player.unMute(); } catch (e) {}

  if (typeof DeviceMotionEvent !== "undefined" &&
      typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      const res = await DeviceMotionEvent.requestPermission();
      if (res === "granted") window.addEventListener("devicemotion", onMotion);
    } catch (e) { console.error(e); }
  } else {
    window.addEventListener("devicemotion", onMotion);
  }
}

function onSwitch() {
  activate();
  loadNextVideo();
}

function onMotion(e) {
  const a = e.accelerationIncludingGravity || e.acceleration;
  if (!a) return;
  const magnitude = Math.sqrt((a.x||0)**2 + (a.y||0)**2 + (a.z||0)**2);
  const delta = Math.abs(magnitude - 9.8);
  const now = Date.now();
  if (delta > SHAKE_THRESHOLD && now - lastShakeAt > SHAKE_COOLDOWN_MS) {
    lastShakeAt = now;
    loadNextVideo();
  }
}

switchBtn.addEventListener("click", onSwitch);
