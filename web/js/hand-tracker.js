/**
 * MediaPipe HandLandmarker wrapper.
 *
 * Initializes the hand detection model and provides a clean detect() interface
 * that returns structured results with finger-up classification.
 */
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { LM, FINGER_TIP_PIP } from './constants.js';

/**
 * Compute Euclidean distance between two landmarks.
 */
function dist(landmarks, i, j) {
    const dx = landmarks[i].x - landmarks[j].x;
    const dy = landmarks[i].y - landmarks[j].y;
    return Math.hypot(dx, dy);
}

/**
 * Determine which fingers are extended (orientation-independent).
 * Returns [thumb, index, middle, ring, pinky] booleans.
 */
function fingersUp(landmarks) {
    const fingers = [];

    // Thumb: tip further from pinky MCP than IP joint is from pinky MCP
    fingers.push(dist(landmarks, LM.THUMB_TIP, LM.PINKY_MCP) > dist(landmarks, LM.THUMB_IP, LM.PINKY_MCP));

    // Other four: tip further from wrist than PIP joint is from wrist
    for (const [tip, pip] of FINGER_TIP_PIP) {
        fingers.push(dist(landmarks, tip, LM.WRIST) > dist(landmarks, pip, LM.WRIST));
    }
    return fingers;
}

/**
 * Calculate palm-size-normalized distance between two landmarks.
 */
function normalizedDistance(landmarks, i, j) {
    const raw = dist(landmarks, i, j);
    const palmSize = dist(landmarks, LM.WRIST, LM.MIDDLE_MCP) || 0.001;
    return raw / palmSize;
}

export class HandTracker {
    constructor() {
        this._landmarker = null;
        this._ready = false;
    }

    get ready() { return this._ready; }

    async init(numHands = 2, confidence = 0.7) {
        const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
        );
        this._landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
                delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numHands,
            minHandDetectionConfidence: confidence,
            minHandPresenceConfidence: confidence,
            minTrackingConfidence: confidence,
        });
        this._ready = true;
    }

    /**
     * Detect hands in a video frame.
     * @returns {Array<HandResult>} Array of detected hand results (max numHands).
     */
    detect(video, timestamp) {
        if (!this._ready) return [];

        const raw = this._landmarker.detectForVideo(video, timestamp);

        if (!raw.landmarks || raw.landmarks.length === 0) return [];

        const results = [];
        for (let i = 0; i < raw.landmarks.length; i++) {
            const lm = raw.landmarks[i];
            const handedness = raw.handednesses[i][0];

            results.push({
                landmarks: lm,
                fingersUp: fingersUp(lm),
                confidence: handedness.score,
                handedness: handedness.categoryName, // "Left" or "Right"
                thumbTip: lm[LM.THUMB_TIP],
                indexTip: lm[LM.INDEX_TIP],
                middleTip: lm[LM.MIDDLE_TIP],
                fingerDistance: normalizedDistance(lm, LM.THUMB_TIP, LM.INDEX_TIP),
                thumbMiddleDistance: normalizedDistance(lm, LM.THUMB_TIP, LM.MIDDLE_TIP),
                palmSize: dist(lm, LM.WRIST, LM.MIDDLE_MCP),
            });
        }
        return results;
    }
}
