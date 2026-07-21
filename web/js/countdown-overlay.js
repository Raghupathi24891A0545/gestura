/**
 * Countdown Overlay — full-screen countdown for dangerous actions.
 *
 * Shows an animated countdown (e.g., "Locking in... 3, 2, 1") that
 * cancels immediately if the gesture is broken.
 */

export class CountdownOverlay {
    constructor() {
        this._overlay = document.getElementById('countdown-overlay');
        this._title = document.getElementById('countdown-title');
        this._number = document.getElementById('countdown-number');
        this._ring = document.getElementById('countdown-ring-fill');
        this._active = false;
        this._gesture = '';
    }

    get active() { return this._active; }
    get gesture() { return this._gesture; }

    /**
     * Show or update the countdown overlay.
     * @param {string} gesture - The gesture name being held
     * @param {number} progress - 0.0 to 1.0
     * @param {number} duration - Total hold duration in seconds
     */
    show(gesture, progress, duration) {
        if (!this._overlay) return;

        this._active = true;
        this._gesture = gesture;

        const remaining = Math.ceil(duration * (1.0 - progress));
        const labels = {
            fist: 'Locking in...',
            two_palms: 'Sleep Mode in...',
            rock_sign: 'Shutdown in...',
            five_hold: 'Opening Explorer in...',
        };

        const colorClasses = {
            fist: 'countdown--lock',
            two_palms: 'countdown--sleep',
            rock_sign: 'countdown--shutdown',
            five_hold: 'countdown--app',
        };

        this._title.textContent = labels[gesture] || 'Hold gesture...';
        this._number.textContent = remaining > 0 ? remaining : '✓';

        // Animate ring
        const circumference = 2 * Math.PI * 54; // radius 54 in SVG
        const offset = circumference * (1 - progress);
        this._ring.style.strokeDasharray = circumference;
        this._ring.style.strokeDashoffset = offset;

        // Set color class
        this._overlay.className = 'countdown-overlay active ' + (colorClasses[gesture] || '');
    }

    hide() {
        if (!this._overlay) return;
        this._active = false;
        this._gesture = '';
        this._overlay.classList.remove('active');
    }
}
