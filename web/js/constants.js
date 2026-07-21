/**
 * Shared constants for the AI Desktop Gesture Controller.
 */

// MediaPipe Hand Landmark Indices
export const LM = {
    WRIST: 0,
    THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
    INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
    MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
    RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
    PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
};

// Hand connections for drawing skeleton
export const HAND_CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [0,9],[9,10],[10,11],[11,12],
    [0,13],[13,14],[14,15],[15,16],
    [0,17],[17,18],[18,19],[19,20],
    [5,9],[9,13],[13,17],
];

// Finger tip / pip pairs (excluding thumb) for "is-up" detection
export const FINGER_TIP_PIP = [
    [LM.INDEX_TIP, LM.INDEX_PIP],
    [LM.MIDDLE_TIP, LM.MIDDLE_PIP],
    [LM.RING_TIP, LM.RING_PIP],
    [LM.PINKY_TIP, LM.PINKY_PIP],
];

// Gesture names
export const GESTURES = {
    NONE: 'none',
    VOLUME: 'volume',
    THUMBS_UP: 'thumbs_up',
    THUMBS_DOWN: 'thumbs_down',
    FIST: 'fist',
    INDEX_POINT: 'index_point',
    OK_SIGN: 'ok_sign',
    OPEN_PALM: 'open_palm',
    PINKY_UP: 'pinky_up',
    PEACE_SIGN: 'peace_sign',
    FIVE_HOLD: 'five_hold',
    TWO_PALMS: 'two_palms',
    ROCK_SIGN: 'rock_sign',
    CALL_ME: 'call_me',
    SWIPE_LEFT: 'swipe_left',
    SWIPE_RIGHT: 'swipe_right',
    PINCH_INDEX: 'pinch_index',
    PINCH_MIDDLE: 'pinch_middle',
    UNKNOWN: 'unknown',
};

// Gesture display info: emoji + label
export const GESTURE_INFO = {
    [GESTURES.NONE]:           { icon: '—',  label: 'No Hand',         color: 'var(--text-dim)' },
    [GESTURES.VOLUME]:         { icon: '✌️', label: 'Volume Control',  color: 'var(--purple-accent)' },
    [GESTURES.THUMBS_UP]:      { icon: '👍', label: 'Brightness Up',   color: 'var(--green)' },
    [GESTURES.THUMBS_DOWN]:    { icon: '👎', label: 'Brightness Down', color: 'var(--red)' },
    [GESTURES.FIST]:           { icon: '✊', label: 'Lock Screen',     color: 'var(--red)' },
    [GESTURES.INDEX_POINT]:    { icon: '☝️', label: 'Virtual Mouse',   color: 'var(--neon-blue)' },
    [GESTURES.OK_SIGN]:        { icon: '👌', label: 'Screenshot',      color: 'var(--yellow)' },
    [GESTURES.OPEN_PALM]:      { icon: '🖐️', label: 'Play / Pause',    color: 'var(--neon-blue)' },
    [GESTURES.PINKY_UP]:       { icon: '🤙', label: 'Open Chrome',     color: 'var(--green)' },
    [GESTURES.PEACE_SIGN]:     { icon: '✌️', label: 'Open VS Code',    color: 'var(--purple-accent)' },
    [GESTURES.FIVE_HOLD]:      { icon: '✋', label: 'Open Explorer',   color: 'var(--yellow)' },
    [GESTURES.TWO_PALMS]:      { icon: '🤲', label: 'Sleep Mode',      color: 'var(--purple-accent)' },
    [GESTURES.ROCK_SIGN]:      { icon: '🤘', label: 'Shutdown',        color: 'var(--red)' },
    [GESTURES.CALL_ME]:        { icon: '📞', label: 'Open Website',    color: 'var(--red)' },
    [GESTURES.SWIPE_LEFT]:     { icon: '👈', label: 'Previous Song',   color: 'var(--neon-blue)' },
    [GESTURES.SWIPE_RIGHT]:    { icon: '👉', label: 'Next Song',       color: 'var(--neon-blue)' },
    [GESTURES.PINCH_INDEX]:    { icon: '🖱️', label: 'Left Click',      color: 'var(--green)' },
    [GESTURES.PINCH_MIDDLE]:   { icon: '🖱️', label: 'Right Click',     color: 'var(--yellow)' },
    [GESTURES.UNKNOWN]:        { icon: '❓', label: 'Unknown',          color: 'var(--text-dim)' },
};

// Default settings
export const DEFAULT_SETTINGS = {
    confidenceThreshold: 0.7,
    debounceFrames: 4,
    volumeSpeed: 1.0,
    brightnessStep: 5,
    voiceEnabled: true,
    theme: 'dark',
    animationSpeed: 1.0,
    favouriteUrl: 'https://www.google.com',
    screenshotFolder: '',
    lockHoldDuration: 3.0,
    sleepHoldDuration: 3.0,
    shutdownHoldDuration: 5.0,
    explorerHoldDuration: 2.0,
    gesturesEnabled: {
        volume: true,
        brightness: true,
        mouse: true,
        screenshot: true,
        lock: true,
        sleep: true,
        shutdown: true,
        media: true,
        apps: true,
        website: true,
    },
    swipeVelocityThreshold: 0.04,
    swipeWindowFrames: 10,
    mouseSmoothing: 0.3,
};

// Color palette
export const COLORS = {
    neonBlue: '#00d4ff',
    purpleAccent: '#a855f7',
    green: '#22c55e',
    red: '#ef4444',
    yellow: '#facc15',
    white: '#ffffff',
    dimWhite: '#9ca3af',
    bgDark: '#0a0a0f',
    bgLight: '#f0f2f5',
};
