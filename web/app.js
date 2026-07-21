import { HandLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

// DOM Elements
const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const statusBadge = document.getElementById("ai-status");
const audioPlayer = document.getElementById("audio-player");
const volumeArc = document.getElementById("volume-arc");
const volumePercent = document.getElementById("volume-percent");
const gestureBadge = document.getElementById("gesture-badge");

// Analytics
const fpsVal = document.getElementById("fps-val");
const handVal = document.getElementById("hand-val");
const gestureVal = document.getElementById("gesture-val");
const distanceVal = document.getElementById("distance-val");

// Wave Canvas
const waveCanvas = document.getElementById("wave-canvas");
const waveCtx = waveCanvas.getContext("2d");

let handLandmarker = undefined;
let webcamRunning = false;
let lastVideoTime = -1;
let currentVolume = 0.5; // 0.0 to 1.0

// Gesture State
let isVolumeGesture = false;
let startDistance = 0;
let startVolume = 0;
let lastFrameTime = performance.now();

// Constants
const VOLUME_SPEED = 1.0; 

// Initialize MediaPipe
async function createHandLandmarker() {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numHands: 1,
    minHandDetectionConfidence: 0.7,
    minHandPresenceConfidence: 0.7,
    minTrackingConfidence: 0.7,
  });
  
  statusBadge.innerText = "AI Ready";
  statusBadge.style.color = "var(--neon-blue)";
  
  // Start webcam automatically
  enableCam();
}
createHandLandmarker();

// Enable Webcam
function enableCam() {
  if (!handLandmarker) {
    console.log("Wait! objectDetector not loaded yet.");
    return;
  }
  
  const constraints = {
    video: { width: 640, height: 480 }
  };

  navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
    video.srcObject = stream;
    video.addEventListener("loadeddata", predictWebcam);
    webcamRunning = true;
  }).catch((err) => {
    console.error(err);
    statusBadge.innerText = "Camera Blocked!";
    statusBadge.style.color = "var(--red)";
  });
}

// Main Loop
async function predictWebcam() {
  canvasElement.style.width = video.videoWidth;
  canvasElement.style.height = video.videoHeight;
  canvasElement.width = video.videoWidth;
  canvasElement.height = video.videoHeight;

  let startTimeMs = performance.now();
  
  // Calculate FPS
  const fps = 1000 / (startTimeMs - lastFrameTime);
  lastFrameTime = startTimeMs;
  fpsVal.innerText = Math.round(fps);
  fpsVal.style.color = fps >= 25 ? "var(--green)" : "var(--red)";

  if (lastVideoTime !== video.currentTime) {
    lastVideoTime = video.currentTime;
    
    const results = handLandmarker.detectForVideo(video, startTimeMs);
    
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    if (results.landmarks && results.landmarks.length > 0) {
      handVal.innerText = "Detected";
      handVal.style.color = "var(--green)";
      
      const landmarks = results.landmarks[0];
      drawLandmarks(landmarks);
      processGesture(landmarks);
      
    } else {
      handVal.innerText = "No Hand";
      handVal.style.color = "var(--red)";
      gestureVal.innerText = "Idle";
      gestureBadge.classList.add("hidden");
      isVolumeGesture = false;
    }
    canvasCtx.restore();
  }

  // Draw Audio Wave Animation
  drawWave();

  if (webcamRunning) {
    window.requestAnimationFrame(predictWebcam);
  }
}

function processGesture(landmarks) {
  // Check if thumb and index are extended, others folded (simplified heuristic)
  // 4: thumb tip, 8: index tip, 12: middle tip, 16: ring tip, 20: pinky tip
  // 5: index mcp, 9: middle mcp, 13: ring mcp, 17: pinky mcp
  
  // Y goes down in canvas. Tip Y < MCP Y means finger is "up" relative to palm base.
  // Actually, MediaPipe returns normalized coordinates (0-1).
  const isThumbOut = landmarks[4].x < landmarks[3].x; // Assuming right hand facing camera
  const isIndexOut = landmarks[8].y < landmarks[6].y;
  const isMiddleFolded = landmarks[12].y > landmarks[10].y;
  const isRingFolded = landmarks[16].y > landmarks[14].y;
  const isPinkyFolded = landmarks[20].y > landmarks[18].y;

  // Gesture check
  if (isIndexOut && isMiddleFolded && isRingFolded && isPinkyFolded) {
    gestureVal.innerText = "Volume";
    gestureVal.style.color = "var(--purple-accent)";
    gestureBadge.innerText = "Volume";
    gestureBadge.classList.remove("hidden");
    
    // Calculate normalized distance
    const dx = landmarks[4].x - landmarks[8].x;
    const dy = landmarks[4].y - landmarks[8].y;
    const rawDistance = Math.hypot(dx, dy);
    
    // Palm size for normalization
    const pdx = landmarks[0].x - landmarks[9].x;
    const pdy = landmarks[0].y - landmarks[9].y;
    const palmSize = Math.hypot(pdx, pdy) || 0.1;
    
    const fingerDistance = rawDistance / palmSize;
    distanceVal.innerText = fingerDistance.toFixed(2);
    
    if (!isVolumeGesture) {
      // Just started gesture
      isVolumeGesture = true;
      startDistance = fingerDistance;
      startVolume = currentVolume;
    } else {
      // Continued gesture - relative adjustment
      const delta = fingerDistance - startDistance;
      let target = startVolume + (delta * VOLUME_SPEED);
      target = Math.max(0.0, Math.min(1.0, target));
      
      currentVolume = target;
      updateAudioVolume(currentVolume);
    }
  } else {
    gestureVal.innerText = "Idle";
    gestureVal.style.color = "var(--text-dim)";
    gestureBadge.classList.add("hidden");
    isVolumeGesture = false;
  }
}

let lastApiTime = 0;

function updateAudioVolume(vol) {
  audioPlayer.volume = vol;
  const percent = Math.round(vol * 100);
  volumePercent.innerText = `${percent}%`;
  
  // Update circular meter (dashoffset goes from 251.2 down to 0)
  const maxOffset = 251.2;
  const offset = maxOffset - (vol * maxOffset);
  volumeArc.style.strokeDashoffset = offset;

  // Send volume to Python Backend (Debounced to ~30fps)
  const now = performance.now();
  if (now - lastApiTime > 30) {
    lastApiTime = now;
    fetch('/api/volume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ volume: vol })
    }).catch(err => console.log("Backend offline or error:", err));
  }
}

function drawLandmarks(landmarks) {
  // Simple wireframe drawing
  canvasCtx.strokeStyle = "#00f0ff";
  canvasCtx.lineWidth = 2;
  
  // Draw connections (simplified)
  const w = canvasElement.width;
  const h = canvasElement.height;
  
  for (let i = 0; i < landmarks.length; i++) {
    const x = landmarks[i].x * w;
    const y = landmarks[i].y * h;
    
    canvasCtx.beginPath();
    canvasCtx.arc(x, y, 4, 0, 2 * Math.PI);
    canvasCtx.fillStyle = "#00f0ff";
    if (i === 4 || i === 8) {
      canvasCtx.fillStyle = "#a855f7";
      canvasCtx.arc(x, y, 6, 0, 2 * Math.PI);
    }
    canvasCtx.fill();
  }
}

// Wave Animation Logic
let phase = 0;
function drawWave() {
  const w = waveCanvas.width;
  const h = waveCanvas.height;
  
  // Resize if needed
  if (waveCanvas.offsetWidth !== w || waveCanvas.offsetHeight !== h) {
    waveCanvas.width = waveCanvas.offsetWidth;
    waveCanvas.height = waveCanvas.offsetHeight;
  }
  
  waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
  
  phase += 0.1;
  const amplitude = currentVolume * (waveCanvas.height * 0.4);
  const midY = waveCanvas.height / 2;
  
  waveCtx.beginPath();
  waveCtx.moveTo(0, midY);
  
  for (let x = 0; x < waveCanvas.width; x += 2) {
    const t = x / waveCanvas.width;
    // Envelope to fade at edges
    const env = Math.sin(Math.PI * t);
    const y = midY + Math.sin(x * 0.05 + phase) * amplitude * env;
    waveCtx.lineTo(x, y);
  }
  
  waveCtx.strokeStyle = "#00f0ff";
  waveCtx.lineWidth = 2;
  waveCtx.stroke();
  
  // Fill gradient
  waveCtx.lineTo(waveCanvas.width, waveCanvas.height);
  waveCtx.lineTo(0, waveCanvas.height);
  waveCtx.closePath();
  
  const grad = waveCtx.createLinearGradient(0, midY - amplitude, 0, waveCanvas.height);
  grad.addColorStop(0, "rgba(0, 240, 255, 0.3)");
  grad.addColorStop(1, "rgba(0, 240, 255, 0)");
  waveCtx.fillStyle = grad;
  waveCtx.fill();
}

// Init volume display
updateAudioVolume(currentVolume);
