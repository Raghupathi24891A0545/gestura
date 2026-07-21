/**
 * Settings Manager — persists user preferences to localStorage
 * and provides the settings modal UI logic.
 */
import { DEFAULT_SETTINGS } from './constants.js';

const STORAGE_KEY = 'gesture_controller_settings';

export class SettingsManager {
    constructor() {
        this._settings = this._load();
        this._modal = document.getElementById('settings-modal');
        this._listeners = [];
        this._bindUI();
    }

    get settings() { return { ...this._settings }; }

    /**
     * Register a callback fired whenever settings change.
     */
    onChange(fn) {
        this._listeners.push(fn);
    }

    open() {
        if (this._modal) {
            this._populateUI();
            this._modal.classList.add('open');
        }
    }

    close() {
        if (this._modal) this._modal.classList.remove('open');
    }

    // ── Persistence ─────────────────────────────────────────────

    _load() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                return { ...DEFAULT_SETTINGS, ...parsed, gesturesEnabled: { ...DEFAULT_SETTINGS.gesturesEnabled, ...(parsed.gesturesEnabled || {}) } };
            }
        } catch { /* corrupted storage */ }
        return { ...DEFAULT_SETTINGS, gesturesEnabled: { ...DEFAULT_SETTINGS.gesturesEnabled } };
    }

    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings));
            // Also persist to backend
            fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this._settings),
            }).catch(() => {});
        } catch { /* no localStorage */ }
        this._notify();
    }

    _notify() {
        for (const fn of this._listeners) fn(this._settings);
    }

    // ── UI binding ──────────────────────────────────────────────

    _bindUI() {
        // Close button
        document.getElementById('settings-close')?.addEventListener('click', () => this.close());

        // Save button
        document.getElementById('settings-save')?.addEventListener('click', () => {
            this._readUI();
            this._save();
            this.close();
        });

        // Reset button
        document.getElementById('settings-reset')?.addEventListener('click', () => {
            this._settings = { ...DEFAULT_SETTINGS, gesturesEnabled: { ...DEFAULT_SETTINGS.gesturesEnabled } };
            this._populateUI();
        });

        // Theme toggle (instant preview)
        document.getElementById('setting-theme')?.addEventListener('change', (e) => {
            document.documentElement.setAttribute('data-theme', e.target.value);
        });

        // Open settings button
        document.getElementById('settings-btn')?.addEventListener('click', () => this.open());

        // Close on backdrop click
        this._modal?.addEventListener('click', (e) => {
            if (e.target === this._modal) this.close();
        });

        // Live slider value display
        this._bindSliderDisplay('setting-confidence', 'confidence-display', v => Math.round(v * 100) + '%');
        this._bindSliderDisplay('setting-volume-speed', 'volume-speed-display', v => v.toFixed(1) + 'x');
        this._bindSliderDisplay('setting-brightness-step', 'brightness-step-display', v => v);
        this._bindSliderDisplay('setting-animation-speed', 'animation-speed-display', v => v.toFixed(1) + 'x');
        this._bindSliderDisplay('setting-lock-hold', 'lock-hold-display', v => v.toFixed(1) + 's');
        this._bindSliderDisplay('setting-sleep-hold', 'sleep-hold-display', v => v.toFixed(1) + 's');
        this._bindSliderDisplay('setting-shutdown-hold', 'shutdown-hold-display', v => v.toFixed(1) + 's');
        this._bindSliderDisplay('setting-mouse-smoothing', 'mouse-smoothing-display', v => Math.round(v * 100) + '%');
    }

    _bindSliderDisplay(sliderId, displayId, formatter) {
        const slider = document.getElementById(sliderId);
        const display = document.getElementById(displayId);
        if (slider && display) {
            slider.addEventListener('input', () => {
                display.textContent = formatter(parseFloat(slider.value));
            });
        }
    }

    _populateUI() {
        const s = this._settings;

        this._setVal('setting-confidence', s.confidenceThreshold);
        this._setDisplay('confidence-display', Math.round(s.confidenceThreshold * 100) + '%');
        this._setVal('setting-volume-speed', s.volumeSpeed);
        this._setDisplay('volume-speed-display', s.volumeSpeed.toFixed(1) + 'x');
        this._setVal('setting-brightness-step', s.brightnessStep);
        this._setDisplay('brightness-step-display', s.brightnessStep);
        this._setVal('setting-animation-speed', s.animationSpeed);
        this._setDisplay('animation-speed-display', s.animationSpeed.toFixed(1) + 'x');
        this._setVal('setting-lock-hold', s.lockHoldDuration);
        this._setDisplay('lock-hold-display', s.lockHoldDuration.toFixed(1) + 's');
        this._setVal('setting-sleep-hold', s.sleepHoldDuration);
        this._setDisplay('sleep-hold-display', s.sleepHoldDuration.toFixed(1) + 's');
        this._setVal('setting-shutdown-hold', s.shutdownHoldDuration);
        this._setDisplay('shutdown-hold-display', s.shutdownHoldDuration.toFixed(1) + 's');
        this._setVal('setting-mouse-smoothing', s.mouseSmoothing);
        this._setDisplay('mouse-smoothing-display', Math.round(s.mouseSmoothing * 100) + '%');
        this._setVal('setting-favourite-url', s.favouriteUrl);
        this._setVal('setting-screenshot-folder', s.screenshotFolder);

        // Theme
        const themeEl = document.getElementById('setting-theme');
        if (themeEl) themeEl.value = s.theme;

        // Voice toggle
        const voiceEl = document.getElementById('setting-voice');
        if (voiceEl) voiceEl.checked = s.voiceEnabled;

        // Gesture toggles
        for (const [key, val] of Object.entries(s.gesturesEnabled)) {
            const el = document.getElementById('gesture-' + key);
            if (el) el.checked = val;
        }
    }

    _readUI() {
        const s = this._settings;

        s.confidenceThreshold = parseFloat(document.getElementById('setting-confidence')?.value || 0.7);
        s.volumeSpeed = parseFloat(document.getElementById('setting-volume-speed')?.value || 1.0);
        s.brightnessStep = parseInt(document.getElementById('setting-brightness-step')?.value || 5);
        s.animationSpeed = parseFloat(document.getElementById('setting-animation-speed')?.value || 1.0);
        s.lockHoldDuration = parseFloat(document.getElementById('setting-lock-hold')?.value || 3.0);
        s.sleepHoldDuration = parseFloat(document.getElementById('setting-sleep-hold')?.value || 3.0);
        s.shutdownHoldDuration = parseFloat(document.getElementById('setting-shutdown-hold')?.value || 5.0);
        s.mouseSmoothing = parseFloat(document.getElementById('setting-mouse-smoothing')?.value || 0.3);
        s.favouriteUrl = document.getElementById('setting-favourite-url')?.value || 'https://www.google.com';
        s.screenshotFolder = document.getElementById('setting-screenshot-folder')?.value || '';
        s.theme = document.getElementById('setting-theme')?.value || 'dark';
        s.voiceEnabled = document.getElementById('setting-voice')?.checked ?? true;

        // Gesture toggles
        const gestures = ['volume', 'brightness', 'mouse', 'screenshot', 'lock', 'sleep', 'shutdown', 'media', 'apps', 'website'];
        for (const key of gestures) {
            const el = document.getElementById('gesture-' + key);
            if (el) s.gesturesEnabled[key] = el.checked;
        }
    }

    _setVal(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }

    _setDisplay(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }
}
