/**
 * AI Desktop Gesture Controller — Main Entry Point
 *
 * Orchestrates all modules: hand tracking, gesture classification,
 * action handling, UI updates, voice feedback, and settings.
 */
import { HandTracker } from './hand-tracker.js';
import { GestureClassifier } from './gesture-classifier.js';
import { ActionHandler } from './action-handler.js';
import { UIController } from './ui-controller.js';
import { VoiceFeedback } from './voice-feedback.js';
import { CountdownOverlay } from './countdown-overlay.js';
import { SettingsManager } from './settings-manager.js';
import { GESTURES } from './constants.js';

class GestureControllerApp {
    constructor() {
        this._ui = new UIController();
        this._voice = new VoiceFeedback();
        this._countdown = new CountdownOverlay();
        this._settings = new SettingsManager();
        this._tracker = new HandTracker();
        this._classifier = new GestureClassifier(this._settings.settings);
        this._actions = new ActionHandler(this._voice, this._countdown, this._settings.settings);

        this._running = false;
        this._lastVideoTime = -1;

        // React to settings changes
        this._settings.onChange((s) => {
            this._classifier.updateSettings(s);
            this._actions.updateSettings(s);
            this._voice.enabled = s.voiceEnabled;
            document.documentElement.setAttribute('data-theme', s.theme);
        });

        // Apply initial theme
        document.documentElement.setAttribute('data-theme', this._settings.settings.theme);

        // Bind PiP Button
        document.getElementById('pip-btn')?.addEventListener('click', async () => {
            try {
                const video = this._ui.videoElement;
                if (video !== document.pictureInPictureElement) {
                    await video.requestPictureInPicture();
                    this._ui.showToast('Background Mode Active', 'success');
                } else {
                    await document.exitPictureInPicture();
                }
            } catch (err) {
                this._ui.showToast('PiP not supported or failed', 'error');
            }
        });

        this._init();
    }

    async _init() {
        this._ui.setStatus('Loading AI Model...', 'var(--yellow)');

        try {
            const confidence = this._settings.settings.confidenceThreshold || 0.7;
            await this._tracker.init(2, confidence);
            this._ui.setStatus('Starting Camera...', 'var(--yellow)');
            await this._startCamera();
            this._ui.setStatus('AI Active', 'var(--green)');
            this._ui.showToast('AI Gesture Controller Ready', 'success');
        } catch (err) {
            console.error('Init failed:', err);
            this._ui.setStatus('Init Failed', 'var(--red)');
            this._ui.showToast('Failed to initialize: ' + err.message, 'error');
        }
    }

    async _startCamera() {
        const video = this._ui.videoElement;
        if (!video) throw new Error('No video element found');

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' },
        });
        video.srcObject = stream;

        return new Promise((resolve) => {
            video.onloadeddata = () => {
                this._running = true;
                this._loop();
                resolve();
            };
        });
    }

    _loop() {
        if (!this._running) return;

        const video = this._ui.videoElement;
        
        // Continuous animations (run every frame regardless of video update)
        this._ui.drawWave();
        this._ui.drawHistory();

        if (video.currentTime !== this._lastVideoTime && video.readyState >= 2) {
            this._lastVideoTime = video.currentTime;
            
            // MediaPipe requires strictly increasing timestamps
            const now = performance.now();
            if (this._lastMediaPipeTime && now <= this._lastMediaPipeTime) {
                requestAnimationFrame(() => this._loop());
                return;
            }
            this._lastMediaPipeTime = now;

            try {
                // 1. Detect hands
                const hands = this._tracker.detect(video, now);

                // 2. Classify gesture
                const gestureResult = this._classifier.classify(hands);

                // 3. Execute action
                const actionResult = this._actions.process(gestureResult);

                // 4. Update UI
                this._ui.updateFrame(gestureResult, actionResult);
                this._ui.setVolume(this._actions.currentVolume);
                this._ui.setBrightness(this._actions.currentBrightness);

                // 5. Show notifications
                this._handleNotification(actionResult);
            } catch (e) {
                console.error("Detection loop error:", e);
                this._ui.setStatus('Error: ' + e.message, 'var(--red)');
            }
        }

        requestAnimationFrame(() => this._loop());
    }

    _handleNotification(result) {
        if (!result) return;
        const { action, detail } = result;

        const toastMap = {
            volume: null, // Too frequent for toasts
            brightness: { msg: `Brightness: ${detail}%`, type: 'info' },
            screenshot: { msg: 'Screenshot Saved', type: 'success' },
            lock: { msg: 'System Locked', type: 'purple' },
            sleep: { msg: 'Sleep Mode Activated', type: 'purple' },
            shutdown: { msg: 'Shutdown Initiated', type: 'error' },
            cancelled: { msg: 'Shutdown Cancelled', type: 'warning' },
            app: { msg: `${detail} Opened`, type: 'success' },
            website: { msg: 'Website Opened', type: 'success' },
            media: {
                msg: detail === 'play_pause' ? 'Play / Pause' : detail === 'next' ? 'Next Song' : 'Previous Song',
                type: 'info',
            },
            mouse_click: { msg: detail === 'left' ? 'Left Click' : 'Right Click', type: 'info' },
        };

        const entry = toastMap[action];
        if (entry) this._ui.showToast(entry.msg, entry.type);
    }
}

// Boot the application
new GestureControllerApp();
