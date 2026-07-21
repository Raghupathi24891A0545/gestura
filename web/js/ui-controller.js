/**
 * UI Controller — manages all dashboard DOM updates, charts, and animations.
 */
import { GESTURE_INFO, GESTURES, HAND_CONNECTIONS, COLORS } from './constants.js';

export class UIController {
    constructor() {
        // Cache DOM elements
        this._el = {
            // Header
            aiStatus: document.getElementById('ai-status'),
            clock: document.getElementById('header-clock'),

            // Camera
            video: document.getElementById('webcam'),
            canvas: document.getElementById('output_canvas'),
            gestureBadge: document.getElementById('gesture-badge'),

            // Stats
            fpsVal: document.getElementById('fps-val'),
            handVal: document.getElementById('hand-val'),
            gestureVal: document.getElementById('gesture-val'),
            confidenceVal: document.getElementById('confidence-val'),
            stabilityVal: document.getElementById('stability-val'),
            handCountVal: document.getElementById('hand-count-val'),

            // Meters
            volumeArc: document.getElementById('volume-arc'),
            volumePercent: document.getElementById('volume-percent'),
            volumeLabel: document.getElementById('volume-label'),
            brightnessArc: document.getElementById('brightness-arc'),
            brightnessPercent: document.getElementById('brightness-percent'),

            // Action card
            actionIcon: document.getElementById('action-icon'),
            actionLabel: document.getElementById('action-label'),
            confidenceBar: document.getElementById('confidence-bar-fill'),
            actionDetail: document.getElementById('action-detail'),

            // System stats
            cpuVal: document.getElementById('cpu-val'),
            cpuBar: document.getElementById('cpu-bar-fill'),
            ramVal: document.getElementById('ram-val'),
            ramBar: document.getElementById('ram-bar-fill'),

            // Wave
            waveCanvas: document.getElementById('wave-canvas'),

            // History
            historyCanvas: document.getElementById('history-canvas'),

            // Toast container
            toastContainer: document.getElementById('toast-container'),
        };

        this._ctx = this._el.canvas?.getContext('2d');
        this._waveCtx = this._el.waveCanvas?.getContext('2d');
        this._historyCtx = this._el.historyCanvas?.getContext('2d');

        // Animation state
        this._wavePhase = 0;
        this._currentVolume = 0.5;
        this._animatedVolume = 0.5;
        this._animatedBrightness = 0.5;
        this._toasts = [];

        // FPS tracking
        this._frameTimes = [];
        this._fps = 0;

        // Volume history
        this._volumeHistory = []; // [{t, v}]
        this._historyMaxAge = 60; // seconds

        // Stability tracking
        this._gestureHistory = [];
        this._stabilityScore = 0;

        // System stats polling
        this._pollSystemStats();
        setInterval(() => this._pollSystemStats(), 3000);

        // Clock
        this._updateClock();
        setInterval(() => this._updateClock(), 1000);
    }

    get videoElement() { return this._el.video; }
    get canvasElement() { return this._el.canvas; }

    // ── Status ──────────────────────────────────────────────────

    setStatus(text, color = 'var(--neon-blue)') {
        if (this._el.aiStatus) {
            this._el.aiStatus.textContent = text;
            this._el.aiStatus.style.borderColor = color;
            this._el.aiStatus.style.color = color;
        }
    }

    // ── Per-frame update ────────────────────────────────────────

    updateFrame(gestureResult, actionResult) {
        this._recordFps();

        const { gesture, confidence, hands, holdProgress, holdDuration } = gestureResult;
        const info = GESTURE_INFO[gesture] || GESTURE_INFO[GESTURES.UNKNOWN];

        // FPS
        if (this._el.fpsVal) {
            this._el.fpsVal.textContent = Math.round(this._fps);
            this._el.fpsVal.style.color = this._fps >= 20 ? 'var(--green)' : 'var(--red)';
        }

        // Hand status
        const handCount = hands?.length || 0;
        if (this._el.handVal) {
            this._el.handVal.textContent = handCount > 0 ? 'Detected' : 'No Hand';
            this._el.handVal.style.color = handCount > 0 ? 'var(--green)' : 'var(--red)';
        }
        if (this._el.handCountVal) {
            this._el.handCountVal.textContent = handCount;
            this._el.handCountVal.style.color = handCount > 0 ? 'var(--neon-blue)' : 'var(--text-dim)';
        }

        // Gesture name
        if (this._el.gestureVal) {
            this._el.gestureVal.textContent = info.label;
            this._el.gestureVal.style.color = info.color;
        }

        // Confidence
        const confPct = Math.round(confidence * 100);
        if (this._el.confidenceVal) {
            this._el.confidenceVal.textContent = confPct + '%';
            this._el.confidenceVal.style.color = confPct >= 70 ? 'var(--green)' : confPct >= 40 ? 'var(--yellow)' : 'var(--red)';
        }

        // Stability
        this._trackStability(gesture);
        if (this._el.stabilityVal) {
            const stabText = this._stabilityScore >= 80 ? 'Stable' : this._stabilityScore >= 50 ? 'Moderate' : 'Unstable';
            this._el.stabilityVal.textContent = stabText;
            this._el.stabilityVal.style.color = this._stabilityScore >= 80 ? 'var(--green)' : this._stabilityScore >= 50 ? 'var(--yellow)' : 'var(--red)';
        }

        // Gesture badge on camera
        if (this._el.gestureBadge) {
            if (gesture !== GESTURES.NONE) {
                this._el.gestureBadge.textContent = `${info.icon}  ${info.label}`;
                this._el.gestureBadge.classList.remove('hidden');
            } else {
                this._el.gestureBadge.classList.add('hidden');
            }
        }

        // Action card
        if (this._el.actionIcon) this._el.actionIcon.textContent = info.icon;
        if (this._el.actionLabel) this._el.actionLabel.textContent = info.label;
        if (this._el.confidenceBar) this._el.confidenceBar.style.width = confPct + '%';
        if (this._el.actionDetail) {
            const detail = actionResult?.detail || '';
            this._el.actionDetail.textContent = typeof detail === 'number' ? `Value: ${detail}` : detail;
        }

        // Draw landmarks on canvas
        this._drawLandmarks(hands);
    }

    // ── Volume / Brightness meters ──────────────────────────────

    setVolume(vol01) {
        this._currentVolume = vol01;
        // Smooth animation
        this._animatedVolume += 0.15 * (vol01 - this._animatedVolume);

        const pct = Math.round(this._animatedVolume * 100);
        if (this._el.volumePercent) this._el.volumePercent.textContent = pct + '%';

        // SVG arc (circumference = 2π × 54 ≈ 339.29)
        const circumference = 339.29;
        const offset = circumference * (1 - this._animatedVolume);
        if (this._el.volumeArc) this._el.volumeArc.style.strokeDashoffset = offset;

        // Record history
        this._volumeHistory.push({ t: Date.now() / 1000, v: pct });
        const cutoff = Date.now() / 1000 - this._historyMaxAge;
        while (this._volumeHistory.length > 0 && this._volumeHistory[0].t < cutoff) {
            this._volumeHistory.shift();
        }
    }

    setBrightness(val) {
        this._animatedBrightness += 0.15 * (val / 100 - this._animatedBrightness);
        const pct = Math.round(this._animatedBrightness * 100);
        if (this._el.brightnessPercent) this._el.brightnessPercent.textContent = pct + '%';

        const circumference = 339.29;
        const offset = circumference * (1 - this._animatedBrightness);
        if (this._el.brightnessArc) this._el.brightnessArc.style.strokeDashoffset = offset;
    }

    // ── Wave animation (call every frame) ───────────────────────

    drawWave() {
        const canvas = this._el.waveCanvas;
        const ctx = this._waveCtx;
        if (!canvas || !ctx) return;

        // Resize if needed
        if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        }

        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        this._wavePhase += 0.08;
        const amplitude = this._currentVolume * h * 0.4;
        const midY = h / 2;

        const layers = [
            { freq: 1.0, phase: 0,    color: COLORS.neonBlue,    alpha: 0.6 },
            { freq: 1.5, phase: 1.0,  color: COLORS.purpleAccent, alpha: 0.4 },
            { freq: 0.7, phase: -0.5, color: COLORS.neonBlue,    alpha: 0.25 },
        ];

        for (const layer of layers) {
            ctx.beginPath();
            ctx.moveTo(0, midY);
            for (let x = 0; x < w; x += 2) {
                const t = x / w;
                const envelope = Math.sin(Math.PI * t);
                const y = midY + amplitude * Math.sin(2 * Math.PI * layer.freq * t + this._wavePhase + layer.phase) * envelope;
                ctx.lineTo(x, y);
            }

            ctx.strokeStyle = layer.color;
            ctx.globalAlpha = layer.alpha;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Fill under wave
            ctx.lineTo(w, h);
            ctx.lineTo(0, h);
            ctx.closePath();
            ctx.globalAlpha = layer.alpha * 0.3;
            ctx.fillStyle = layer.color;
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }

    // ── Volume history chart ────────────────────────────────────

    drawHistory() {
        const canvas = this._el.historyCanvas;
        const ctx = this._historyCtx;
        if (!canvas || !ctx) return;

        if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        }

        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        const ml = 40, mr = 10, mt = 10, mb = 22;
        const cw = w - ml - mr, ch = h - mt - mb;

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        for (const pct of [25, 50, 75]) {
            const y = mt + ch * (1 - pct / 100);
            ctx.beginPath(); ctx.moveTo(ml, y); ctx.lineTo(w - mr, y); ctx.stroke();
        }

        // Y-axis labels
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'right';
        for (const pct of [0, 25, 50, 75, 100]) {
            const y = mt + ch * (1 - pct / 100);
            ctx.fillText(pct + '%', ml - 6, y + 3);
        }

        // X-axis labels
        ctx.textAlign = 'center';
        const now = Date.now() / 1000;
        for (const sec of [0, 15, 30, 45, 60]) {
            const x = ml + cw * (1 - sec / 60);
            ctx.fillText('-' + sec + 's', x, h - 4);
        }

        if (this._volumeHistory.length < 2) {
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.textAlign = 'center';
            ctx.font = '12px Inter, sans-serif';
            ctx.fillText('Collecting data...', w / 2, h / 2);
            return;
        }

        // Build points
        const tMin = now - 60;
        const points = [];
        for (const { t, v } of this._volumeHistory) {
            if (t < tMin) continue;
            const x = ml + cw * ((t - tMin) / 60);
            const y = mt + ch * (1 - v / 100);
            points.push([x, y]);
        }

        if (points.length < 2) return;

        // Gradient fill
        const grad = ctx.createLinearGradient(0, mt, 0, mt + ch);
        grad.addColorStop(0, 'rgba(0, 212, 255, 0.2)');
        grad.addColorStop(1, 'rgba(0, 212, 255, 0.0)');

        ctx.beginPath();
        ctx.moveTo(points[0][0], mt + ch);
        for (const [x, y] of points) ctx.lineTo(x, y);
        ctx.lineTo(points[points.length - 1][0], mt + ch);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Line
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
        ctx.strokeStyle = COLORS.neonBlue;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();

        // Current dot
        const [lx, ly] = points[points.length - 1];
        ctx.beginPath();
        ctx.arc(lx, ly, 4, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.neonBlue;
        ctx.fill();
    }

    // ── Toast notifications ─────────────────────────────────────

    showToast(message, type = 'info') {
        const container = this._el.toastContainer;
        if (!container) return;

        const colorMap = {
            info: COLORS.neonBlue,
            success: COLORS.green,
            warning: COLORS.yellow,
            error: COLORS.red,
            purple: COLORS.purpleAccent,
        };
        const iconMap = {
            info: '🔔',
            success: '✅',
            warning: '⚠️',
            error: '❌',
            purple: '🎮',
        };

        const toast = document.createElement('div');
        toast.className = 'toast toast--' + type;
        toast.style.borderColor = colorMap[type] || colorMap.info;
        toast.innerHTML = `<span class="toast-icon">${iconMap[type] || '🔔'}</span> ${message}`;
        container.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => toast.classList.add('toast--visible'));

        // Remove after 2.5s
        setTimeout(() => {
            toast.classList.remove('toast--visible');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 2500);

        // Cap visible toasts
        while (container.children.length > 4) {
            container.removeChild(container.firstChild);
        }
    }

    // ── Canvas landmark drawing ─────────────────────────────────

    _drawLandmarks(hands) {
        const canvas = this._el.canvas;
        const ctx = this._ctx;
        if (!canvas || !ctx) return;

        const video = this._el.video;
        if (!video) return;

        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!hands || hands.length === 0) return;

        const w = canvas.width, h = canvas.height;

        for (const hand of hands) {
            const lm = hand.landmarks;

            // Connections
            ctx.strokeStyle = COLORS.neonBlue;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            for (const [a, b] of HAND_CONNECTIONS) {
                ctx.beginPath();
                ctx.moveTo(lm[a].x * w, lm[a].y * h);
                ctx.lineTo(lm[b].x * w, lm[b].y * h);
                ctx.stroke();
            }

            // Dots
            for (let i = 0; i < 21; i++) {
                const x = lm[i].x * w, y = lm[i].y * h;

                // Glow for thumb & index tips
                if (i === 4 || i === 8) {
                    const glow = ctx.createRadialGradient(x, y, 0, x, y, 14);
                    glow.addColorStop(0, 'rgba(168, 85, 247, 0.5)');
                    glow.addColorStop(1, 'rgba(168, 85, 247, 0)');
                    ctx.fillStyle = glow;
                    ctx.beginPath();
                    ctx.arc(x, y, 14, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.beginPath();
                ctx.arc(x, y, (i === 4 || i === 8) ? 5 : 3, 0, Math.PI * 2);
                ctx.fillStyle = (i === 4 || i === 8) ? COLORS.purpleAccent : COLORS.neonBlue;
                ctx.fill();
            }

            // Dashed line between thumb and index
            const tx = lm[4].x * w, ty = lm[4].y * h;
            const ix = lm[8].x * w, iy = lm[8].y * h;
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = COLORS.purpleAccent;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(ix, iy);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // ── Private helpers ─────────────────────────────────────────

    _recordFps() {
        const now = performance.now();
        this._frameTimes.push(now);
        while (this._frameTimes.length > 30) this._frameTimes.shift();
        if (this._frameTimes.length >= 2) {
            const dt = (this._frameTimes[this._frameTimes.length - 1] - this._frameTimes[0]) / 1000;
            this._fps = dt > 0 ? (this._frameTimes.length - 1) / dt : 0;
        }
    }

    _trackStability(gesture) {
        this._gestureHistory.push(gesture);
        if (this._gestureHistory.length > 30) this._gestureHistory.shift();
        if (this._gestureHistory.length < 5) { this._stabilityScore = 0; return; }

        // Stability = % of last 30 frames that match the most common gesture
        const counts = {};
        for (const g of this._gestureHistory) counts[g] = (counts[g] || 0) + 1;
        const maxCount = Math.max(...Object.values(counts));
        this._stabilityScore = Math.round((maxCount / this._gestureHistory.length) * 100);
    }

    async _pollSystemStats() {
        try {
            const res = await fetch('/api/system/stats');
            const data = await res.json();
            if (this._el.cpuVal) this._el.cpuVal.textContent = Math.round(data.cpu) + '%';
            if (this._el.cpuBar) this._el.cpuBar.style.width = data.cpu + '%';
            if (this._el.ramVal) this._el.ramVal.textContent = Math.round(data.ram) + '%';
            if (this._el.ramBar) this._el.ramBar.style.width = data.ram + '%';
        } catch { /* backend offline */ }
    }

    _updateClock() {
        if (this._el.clock) {
            const now = new Date();
            this._el.clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
    }
}
