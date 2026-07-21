/**
 * Gesture Classifier — converts raw hand results into named gestures
 * with debounce, hold timing, and swipe detection.
 */
import { GESTURES, LM, DEFAULT_SETTINGS } from './constants.js';

export class GestureClassifier {
    constructor(settings = {}) {
        this._settings = { ...DEFAULT_SETTINGS, ...settings };

        // Debounce state
        this._buffer = GESTURES.NONE;
        this._bufferCount = 0;

        // Hold timers (for gestures requiring sustained hold)
        this._holdGesture = '';
        this._holdStart = 0;

        // Swipe tracking
        this._posHistory = []; // [{x, y, t}, ...]

        // No-hand timeout
        this._noHandFrames = 0;

        // Thumb direction tracking (for thumbs up vs down)
        this._thumbDirectionBuffer = [];
    }

    updateSettings(settings) {
        Object.assign(this._settings, settings);
    }

    /**
     * Classify one frame of hand results.
     * @param {Array} hands - Array of hand results from HandTracker.detect()
     * @returns {Object} { gesture, confidence, holdProgress, holdDuration, hands, rawGesture }
     */
    classify(hands) {
        const now = performance.now() / 1000; // seconds

        if (!hands || hands.length === 0) {
            this._noHandFrames++;
            if (this._noHandFrames > 10) {
                this._resetBuffer();
                this._resetHold();
            }
            return {
                gesture: GESTURES.NONE,
                rawGesture: GESTURES.NONE,
                confidence: 0,
                holdProgress: 0,
                holdDuration: 0,
                hands: [],
            };
        }

        this._noHandFrames = 0;

        // Filter by confidence
        const validHands = hands.filter(h => h.confidence >= this._settings.confidenceThreshold);
        if (validHands.length === 0) {
            return {
                gesture: GESTURES.NONE,
                rawGesture: GESTURES.NONE,
                confidence: 0,
                holdProgress: 0,
                holdDuration: 0,
                hands,
            };
        }

        const avgConfidence = validHands.reduce((s, h) => s + h.confidence, 0) / validHands.length;

        // Classify the raw gesture
        let raw;
        if (validHands.length >= 2) {
            raw = this._classifyTwoHands(validHands);
        } else {
            raw = this._classifySingleHand(validHands[0]);
        }

        // Track swipe for the primary hand
        this._trackSwipe(validHands[0], now);
        const swipe = this._detectSwipe();
        if (swipe) {
            raw = swipe;
        }

        // Debounce: require N consecutive frames of same gesture
        if (raw !== this._buffer) {
            this._buffer = raw;
            this._bufferCount = 1;
        } else {
            this._bufferCount++;
        }

        const debounceFrames = this._settings.debounceFrames || 4;
        if (this._bufferCount < debounceFrames) {
            // Still accumulating — return previous confirmed gesture with raw info
            return {
                gesture: this._lastConfirmed || GESTURES.NONE,
                rawGesture: raw,
                confidence: avgConfidence,
                holdProgress: this._getHoldProgress(now),
                holdDuration: this._getHoldDuration(raw),
                hands: validHands,
            };
        }

        // Gesture confirmed
        this._lastConfirmed = raw;

        // Hold timing for dangerous/held gestures
        const holdDuration = this._getHoldDuration(raw);
        let holdProgress = 0;

        if (holdDuration > 0) {
            if (this._holdGesture !== raw) {
                this._holdGesture = raw;
                this._holdStart = now;
            }
            const elapsed = now - this._holdStart;
            holdProgress = Math.min(1.0, elapsed / holdDuration);
        } else {
            if (this._holdGesture && this._holdGesture !== raw) {
                this._resetHold();
            }
        }

        return {
            gesture: raw,
            rawGesture: raw,
            confidence: avgConfidence,
            holdProgress,
            holdDuration,
            hands: validHands,
        };
    }

    /**
     * Check if a hold gesture has completed.
     */
    isHoldComplete(result) {
        return result.holdDuration > 0 && result.holdProgress >= 1.0;
    }

    /**
     * Reset hold state (e.g. after action executed or cancelled).
     */
    resetHold() {
        this._resetHold();
    }

    // ── Single-hand classification ──────────────────────────────────

    _classifySingleHand(hand) {
        const [t, i, m, r, p] = hand.fingersUp;
        const fd = hand.fingerDistance;      // thumb-index normalized
        const tmd = hand.thumbMiddleDistance; // thumb-middle normalized

        // Fist: no fingers up at all
        if (!t && !i && !m && !r && !p) {
            return GESTURES.FIST;
        }

        // OK sign: thumb and index tips very close, middle+ring+pinky extended
        if (fd < 0.35 && m && r && p) {
            return GESTURES.OK_SIGN;
        }

        // Volume: thumb + index only
        if (t && i && !m && !r && !p) {
            return GESTURES.VOLUME;
        }

        // Thumbs Up: only thumb extended, hand fairly upright
        if (t && !i && !m && !r && !p) {
            // Determine direction: is thumb tip above or below wrist?
            const thumbTipY = hand.landmarks[LM.THUMB_TIP].y;
            const wristY = hand.landmarks[LM.WRIST].y;
            const palmVertical = hand.landmarks[LM.MIDDLE_MCP].y - wristY;

            // Thumb is pointing up if wrist is below MCP (palm facing camera, hand upright)
            // and thumb tip is above wrist
            if (thumbTipY < wristY) {
                return GESTURES.THUMBS_UP;
            } else {
                return GESTURES.THUMBS_DOWN;
            }
        }

        // Index point: only index up (no thumb)
        if (!t && i && !m && !r && !p) {
            return GESTURES.INDEX_POINT;
        }

        // Virtual mouse pinch detection (during index point)
        // Pinch index: thumb + index close while pointing
        if (i && fd < 0.3 && !m && !r && !p) {
            return GESTURES.PINCH_INDEX;
        }

        // Peace Sign (V-Sign): Index and Middle up only
        if (!t && i && m && !r && !p) {
            return GESTURES.PEACE_SIGN;
        }

        // Pinky Up: Only pinky up
        if (!t && !i && !m && !r && p) {
            return GESTURES.PINKY_UP;
        }

        // Call Me (Thumb and Pinky up)
        if (t && !i && !m && !r && p) {
            return GESTURES.CALL_ME;
        }

        // Rock Sign / Spider-Man (Index and Pinky up)
        if (!t && i && !m && !r && p) {
            return GESTURES.ROCK_SIGN;
        }

        // Open palm / five fingers: all up
        if (t && i && m && r && p) {
            return GESTURES.OPEN_PALM;
        }

        return GESTURES.UNKNOWN;
    }

    // ── Two-hand classification ─────────────────────────────────────

    _classifyTwoHands(hands) {
        const [h1, h2] = hands;
        const [t1, i1, m1, r1, p1] = h1.fingersUp;
        const [t2, i2, m2, r2, p2] = h2.fingersUp;

        const allUp1 = t1 && i1 && m1 && r1 && p1;
        const allUp2 = t2 && i2 && m2 && r2 && p2;
        const allDown1 = !t1 && !i1 && !m1 && !r1 && !p1;
        const allDown2 = !t2 && !i2 && !m2 && !r2 && !p2;

        // Two palms open → Sleep
        if (allUp1 && allUp2) {
            return GESTURES.TWO_PALMS;
        }

        // If two hands but no special two-hand gesture, classify primary hand
        return this._classifySingleHand(h1);
    }

    // ── Swipe detection ─────────────────────────────────────────────

    _trackSwipe(hand, now) {
        this._posHistory.push({
            x: hand.indexTip.x,
            y: hand.indexTip.y,
            t: now,
        });
        const window = this._settings.swipeWindowFrames || 10;
        while (this._posHistory.length > window) {
            this._posHistory.shift();
        }
    }

    _detectSwipe() {
        if (this._posHistory.length < 5) return null;

        const first = this._posHistory[0];
        const last = this._posHistory[this._posHistory.length - 1];
        const dt = last.t - first.t;
        if (dt < 0.05) return null;

        const dx = last.x - first.x;
        const dy = last.y - first.y;
        const velocityX = dx / dt;

        const threshold = this._settings.swipeVelocityThreshold || 0.04;
        const absVelocity = Math.abs(velocityX);

        // Only detect swipe if horizontal movement is dominant
        if (absVelocity > threshold && Math.abs(dx) > Math.abs(dy) * 2) {
            // Clear history to prevent repeated triggers
            this._posHistory = [];
            return velocityX > 0 ? GESTURES.SWIPE_RIGHT : GESTURES.SWIPE_LEFT;
        }

        return null;
    }

    // ── Hold duration per gesture ───────────────────────────────────

    _getHoldDuration(gesture) {
        switch (gesture) {
            case GESTURES.FIST:       return this._settings.lockHoldDuration || 3.0;
            case GESTURES.TWO_PALMS:  return this._settings.sleepHoldDuration || 3.0;
            case GESTURES.ROCK_SIGN:  return this._settings.shutdownHoldDuration || 5.0;
            case GESTURES.OPEN_PALM:  return 0; // Instant tap
            case GESTURES.FIVE_HOLD:  return this._settings.explorerHoldDuration || 2.0;
            default: return 0;
        }
    }

    _getHoldProgress(now) {
        if (!this._holdGesture || !this._holdStart) return 0;
        const duration = this._getHoldDuration(this._holdGesture);
        if (duration <= 0) return 0;
        return Math.min(1.0, (now - this._holdStart) / duration);
    }

    _resetBuffer() {
        this._buffer = GESTURES.NONE;
        this._bufferCount = 0;
        this._lastConfirmed = GESTURES.NONE;
    }

    _resetHold() {
        this._holdGesture = '';
        this._holdStart = 0;
    }
}
