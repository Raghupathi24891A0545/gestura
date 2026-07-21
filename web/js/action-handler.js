/**
 * Action Handler — maps confirmed gestures to system actions.
 *
 * Manages volume anchor points, API calls to the backend, media control,
 * hold-gesture execution, and voice feedback triggers.
 */
import { GESTURES, DEFAULT_SETTINGS } from './constants.js';

export class ActionHandler {
    constructor(voiceFeedback, countdownOverlay, settings = {}) {
        this._voice = voiceFeedback;
        this._countdown = countdownOverlay;
        this._settings = { ...DEFAULT_SETTINGS, ...settings };

        // Volume state
        this._volumeStartDist = 0;
        this._volumeStartVal = 0.5;
        this._currentVolume = 0.5;
        this._isVolumeGesture = false;

        // Brightness
        this._currentBrightness = 50;
        this._brightnessLastAction = 0;

        // Mouse state
        this._mouseSmoothedX = 0.5;
        this._mouseSmoothedY = 0.5;
        this._isDragging = false;

        // One-shot action guards (prevent re-firing)
        this._executedHolds = new Set();
        this._lastOneShot = '';
        this._lastOneShotTime = 0;

        // API throttle
        this._lastApiCall = {};

        // Fetch initial brightness
        this._fetchBrightness();
    }

    get currentVolume() { return this._currentVolume; }
    get currentBrightness() { return this._currentBrightness; }

    updateSettings(settings) {
        Object.assign(this._settings, settings);
    }

    /**
     * Process a classified gesture result and execute the appropriate action.
     * @returns {Object} { action, detail } describing what happened
     */
    process(result) {
        const { gesture, holdProgress, holdDuration, hands } = result;
        const enabled = this._settings.gesturesEnabled || {};

        // ── Handle hold gestures with countdown ──────────────────
        const holdGestures = [GESTURES.FIST, GESTURES.TWO_PALMS, GESTURES.ROCK_SIGN];
        if (holdGestures.includes(gesture) && holdDuration > 0) {
            // Check if this feature is enabled
            const featureMap = {
                [GESTURES.FIST]: 'lock',
                [GESTURES.TWO_PALMS]: 'sleep',
                [GESTURES.ROCK_SIGN]: 'shutdown',
            };
            if (enabled[featureMap[gesture]] === false) {
                return { action: 'disabled', detail: gesture };
            }

            this._countdown.show(gesture, holdProgress, holdDuration);

            if (holdProgress >= 1.0 && !this._executedHolds.has(gesture)) {
                this._executedHolds.add(gesture);
                this._countdown.hide();
                return this._executeHoldAction(gesture);
            }

            // Reset volume gesture state
            this._isVolumeGesture = false;
            return { action: 'holding', detail: gesture, progress: holdProgress };
        }

        // If we were in a hold but gesture changed → cancel
        if (this._countdown.active) {
            this._countdown.hide();
            this._executedHolds.clear();

            if (this._countdown.gesture === GESTURES.ROCK_SIGN) {
                this._apiCall('/api/system/cancel-shutdown', {});
                this._voice.speak('Shutdown Cancelled');
                return { action: 'cancelled', detail: 'shutdown' };
            }
        }
        this._executedHolds.clear();

        // ── Volume Control ───────────────────────────────────────
        if (gesture === GESTURES.VOLUME && enabled.volume !== false) {
            return this._handleVolume(hands[0]);
        } else {
            this._isVolumeGesture = false;
        }

        // ── Brightness ───────────────────────────────────────────
        if ((gesture === GESTURES.THUMBS_UP || gesture === GESTURES.THUMBS_DOWN) && enabled.brightness !== false) {
            return this._handleBrightness(gesture);
        }

        // ── Virtual Mouse ────────────────────────────────────────
        if (gesture === GESTURES.INDEX_POINT && enabled.mouse !== false) {
            return this._handleMouse(hands[0], 'move');
        }
        if (gesture === GESTURES.PINCH_INDEX && enabled.mouse !== false) {
            return this._handleMouse(hands[0], 'left_click');
        }
        if (gesture === GESTURES.PINCH_MIDDLE && enabled.mouse !== false) {
            return this._handleMouse(hands[0], 'right_click');
        }
        // End drag if was dragging
        if (this._isDragging && gesture !== GESTURES.PINCH_INDEX) {
            this._isDragging = false;
            this._apiCall('/api/mouse', { action: 'mouse_up' });
        }

        // ── Screenshot ───────────────────────────────────────────
        if (gesture === GESTURES.OK_SIGN && enabled.screenshot !== false) {
            return this._handleOneShot('screenshot', () => {
                this._apiCall('/api/screenshot', {});
                this._voice.speak('Screenshot Saved');
                return { action: 'screenshot', detail: 'captured' };
            });
        }

        // ── Media Controls ───────────────────────────────────────
        if (gesture === GESTURES.OPEN_PALM && holdDuration === 0 && enabled.media !== false) {
            return this._handleOneShot('play_pause', () => {
                this._apiCall('/api/media/playpause', {});
                this._voice.speak('Play Pause');
                return { action: 'media', detail: 'play_pause' };
            });
        }
        if (gesture === GESTURES.SWIPE_RIGHT && enabled.media !== false) {
            return this._handleOneShot('next_track', () => {
                this._apiCall('/api/media/next', {});
                this._voice.speak('Next Song');
                return { action: 'media', detail: 'next' };
            });
        }
        if (gesture === GESTURES.SWIPE_LEFT && enabled.media !== false) {
            return this._handleOneShot('prev_track', () => {
                this._apiCall('/api/media/prev', {});
                this._voice.speak('Previous Song');
                return { action: 'media', detail: 'prev' };
            });
        }

        // ── App Launchers ────────────────────────────────────────
        if (gesture === GESTURES.PINKY_UP && enabled.apps !== false) {
            return this._handleOneShot('chrome', () => {
                this._apiCall('/api/app/chrome', {});
                this._voice.speak('Chrome Opened');
                return { action: 'app', detail: 'Chrome' };
            });
        }
        if (gesture === GESTURES.PEACE_SIGN && enabled.apps !== false) {
            return this._handleOneShot('vscode', () => {
                this._apiCall('/api/app/vscode', {});
                this._voice.speak('VS Code Opened');
                return { action: 'app', detail: 'VS Code' };
            });
        }

        // ── Heart → Open Website ─────────────────────────────────
        if (gesture === GESTURES.CALL_ME && enabled.website !== false) {
            return this._handleOneShot('website', () => {
                const url = this._settings.favouriteUrl || 'https://www.google.com';
                this._apiCall('/api/app/website', { url });
                this._voice.speak('Website Opened');
                return { action: 'website', detail: url };
            });
        }

        return { action: 'idle', detail: gesture };
    }

    // ── Volume ──────────────────────────────────────────────────

    _handleVolume(hand) {
        if (!this._isVolumeGesture) {
            // Anchor
            this._isVolumeGesture = true;
            this._volumeStartDist = hand.fingerDistance;
            this._volumeStartVal = this._currentVolume;
            this._voice.speak('Volume Control');
        }

        const delta = hand.fingerDistance - this._volumeStartDist;
        const speed = this._settings.volumeSpeed || 1.0;
        let target = this._volumeStartVal + delta * speed;
        target = Math.max(0, Math.min(1, target));

        const prev = this._currentVolume;
        this._currentVolume = target;

        // Send to backend (throttled)
        this._throttledApi('/api/volume', { volume: target }, 30);

        const direction = target > prev + 0.02 ? 'Volume Increased' : target < prev - 0.02 ? 'Volume Decreased' : null;
        if (direction) this._voice.speak(direction);

        return { action: 'volume', detail: Math.round(target * 100) };
    }

    // ── Brightness ──────────────────────────────────────────────

    _handleBrightness(gesture) {
        const now = performance.now();
        if (now - this._brightnessLastAction < 300) return { action: 'brightness_wait' };
        this._brightnessLastAction = now;

        const direction = gesture === GESTURES.THUMBS_UP ? 'up' : 'down';
        const step = this._settings.brightnessStep || 5;

        this._apiCall('/api/brightness', { direction, step }).then(res => {
            if (res && res.brightness !== undefined) {
                this._currentBrightness = res.brightness;
            }
        });

        if (direction === 'up') {
            this._currentBrightness = Math.min(100, this._currentBrightness + step);
            this._voice.speak('Brightness Increased');
        } else {
            this._currentBrightness = Math.max(0, this._currentBrightness - step);
            this._voice.speak('Brightness Decreased');
        }

        return { action: 'brightness', detail: this._currentBrightness };
    }

    // ── Mouse ───────────────────────────────────────────────────

    _handleMouse(hand, action) {
        const alpha = this._settings.mouseSmoothing || 0.3;
        this._mouseSmoothedX += alpha * (hand.indexTip.x - this._mouseSmoothedX);
        this._mouseSmoothedY += alpha * (hand.indexTip.y - this._mouseSmoothedY);

        if (action === 'move') {
            this._throttledApi('/api/mouse', {
                action: 'move',
                x: this._mouseSmoothedX,
                y: this._mouseSmoothedY,
            }, 16);
            return { action: 'mouse_move' };
        }

        if (action === 'left_click') {
            if (!this._isDragging) {
                this._isDragging = true;
                this._apiCall('/api/mouse', { action: 'left_click' });
                return { action: 'mouse_click', detail: 'left' };
            }
            // If already dragging, just move
            this._throttledApi('/api/mouse', {
                action: 'move',
                x: this._mouseSmoothedX,
                y: this._mouseSmoothedY,
            }, 16);
            return { action: 'mouse_drag' };
        }

        if (action === 'right_click') {
            return this._handleOneShot('right_click', () => {
                this._apiCall('/api/mouse', { action: 'right_click' });
                return { action: 'mouse_click', detail: 'right' };
            });
        }

        return { action: 'mouse', detail: action };
    }

    // ── Hold actions ────────────────────────────────────────────

    _executeHoldAction(gesture) {
        switch (gesture) {
            case GESTURES.FIST:
                this._apiCall('/api/system/lock', {});
                this._voice.speak('System Locked');
                return { action: 'lock', detail: 'executed' };

            case GESTURES.TWO_PALMS:
                this._apiCall('/api/system/sleep', {});
                this._voice.speak('Sleep Mode Activated');
                return { action: 'sleep', detail: 'executed' };

            case GESTURES.ROCK_SIGN:
                this._apiCall('/api/system/shutdown', {});
                this._voice.speak('Shutdown Initiated');
                return { action: 'shutdown', detail: 'executed' };

            default:
                return { action: 'hold_unknown', detail: gesture };
        }
    }

    // ── One-shot guard ──────────────────────────────────────────

    _handleOneShot(key, fn) {
        const now = performance.now();
        if (this._lastOneShot === key && now - this._lastOneShotTime < 2000) {
            return { action: 'cooldown', detail: key };
        }
        this._lastOneShot = key;
        this._lastOneShotTime = now;
        return fn();
    }

    // ── API helpers ─────────────────────────────────────────────

    async _apiCall(endpoint, data) {
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
            return await res.json();
        } catch {
            return null;
        }
    }

    _throttledApi(endpoint, data, intervalMs) {
        const now = performance.now();
        if (now - (this._lastApiCall[endpoint] || 0) < intervalMs) return;
        this._lastApiCall[endpoint] = now;
        this._apiCall(endpoint, data);
    }

    async _fetchBrightness() {
        try {
            const res = await fetch('/api/brightness');
            const data = await res.json();
            if (data.brightness !== undefined) this._currentBrightness = data.brightness;
        } catch { /* backend offline */ }
    }
}
