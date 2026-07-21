"""
Gesture state machine.

Interprets finger states from HandDetector and emits volume / mute / lock
commands.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum, auto
from typing import Optional

from core.hand_detector import HandResult
from models.app_state import GestureState
from utils.constants import MIN_FINGER_DISTANCE, MAX_FINGER_DISTANCE


class GestureEvent(Enum):
    """Events emitted by the gesture engine to drive UI notifications."""
    VOLUME_CHANGED  = auto()
    MUTED           = auto()
    UNMUTED         = auto()
    LOCKED          = auto()
    UNLOCKED        = auto()


@dataclass
class GestureCommand:
    """Command produced each frame by the gesture engine."""
    state: GestureState
    gesture_name: str
    target_volume: Optional[float] = None   # 0‑100 or None (no change)
    event: Optional[GestureEvent] = None    # one‑shot notification trigger


class GestureEngine:
    """
    Stateful gesture interpreter.

    Reads *HandResult* each frame and returns a *GestureCommand*.
    """

    def __init__(self, volume_speed: float = 1.0) -> None:
        self._state = GestureState.IDLE
        self._prev_volume: float = 50.0   # volume stored before mute
        self._volume_speed = volume_speed

        # Anchor points for relative volume control
        self._start_distance: float = 0.0
        self._start_volume: float = 0.0

        # Debounce: require gesture to be held for N consecutive frames
        self._gesture_buffer: str = ""
        self._buffer_count: int = 0
        self._required_hold: int = 4      # ~4 frames ≈ 130 ms at 30 fps

        # No-hand timeout: reset state after hand disappears for N frames
        self._no_hand_count: int = 0
        self._no_hand_reset_threshold: int = 10  # ~330ms at 30fps

    # ── Public ──────────────────────────────────────────────────────────

    def update(
        self, hand: Optional[HandResult], current_volume: float
    ) -> GestureCommand:
        """Process one frame and return a command."""
        if hand is None:
            self._reset_buffer()
            self._no_hand_count += 1

            # After hand is gone long enough, reset state to IDLE
            # so the next hand appearance starts fresh
            if self._no_hand_count >= self._no_hand_reset_threshold:
                was_muted = self._state == GestureState.MUTED
                if self._state != GestureState.IDLE:
                    self._state = GestureState.IDLE

            return GestureCommand(
                state=self._state, gesture_name="No Hand"
            )

        # Hand detected — reset the no-hand counter
        self._no_hand_count = 0

        raw = self._classify(hand)

        # Debounce: only act when the same gesture is held for N frames
        if raw != self._gesture_buffer:
            self._gesture_buffer = raw
            self._buffer_count = 1
        else:
            self._buffer_count += 1

        if self._buffer_count < self._required_hold:
            # Still accumulating — return current state, no action
            return GestureCommand(state=self._state, gesture_name=raw)

        # --- gesture confirmed ---
        return self._process(raw, hand, current_volume)

    def set_volume_speed(self, speed: float) -> None:
        self._volume_speed = speed

    def reset(self) -> None:
        """Full reset of engine state (e.g. when camera restarts)."""
        self._state = GestureState.IDLE
        self._reset_buffer()
        self._no_hand_count = 0

    # ── Private ─────────────────────────────────────────────────────────

    def _reset_buffer(self) -> None:
        self._gesture_buffer = ""
        self._buffer_count = 0

    @staticmethod
    def _classify(hand: HandResult) -> str:
        """
        Classify the current finger configuration into a gesture name.
        ``fingers_up`` order: [thumb, index, middle, ring, pinky]
        """
        t, i, m, r, p = hand.fingers_up

        if not any(hand.fingers_up):
            return "Fist"
        if all(hand.fingers_up):
            return "Open Palm"
        if t and not i and not m and not r and not p:
            return "Thumbs Up"
        if not t and i and m and not r and not p:
            return "Victory"
        if t and i and not m and not r and not p:
            return "Volume"
        return "Unknown"

    def _process(
        self, gesture: str, hand: HandResult, current_volume: float
    ) -> GestureCommand:
        event: Optional[GestureEvent] = None

        # ── Locked state — only Victory can unlock ──────────────────────
        if self._state == GestureState.LOCKED:
            if gesture == "Victory":
                self._state = GestureState.IDLE
                event = GestureEvent.UNLOCKED
                return GestureCommand(
                    state=self._state,
                    gesture_name="Unlocked",
                    event=event,
                )
            return GestureCommand(
                state=self._state, gesture_name="Locked 🔒"
            )

        # ── Normal processing ───────────────────────────────────────────
        if gesture == "Volume":
            event = None
            if self._state != GestureState.VOLUME:
                # Just entered the volume gesture: anchor the current volume and distance
                event = GestureEvent.VOLUME_CHANGED
                self._start_distance = hand.finger_distance
                self._start_volume = current_volume
            
            self._state = GestureState.VOLUME
            
            # Calculate how much the fingers have moved since the gesture started
            delta_dist = hand.finger_distance - self._start_distance
            
            # A delta of 1.0 (roughly the size of the palm) equals a 100% volume change at 1.0x speed
            target = self._start_volume + (delta_dist * 100.0 * self._volume_speed)
            target = max(0.0, min(100.0, target))
            
            return GestureCommand(
                state=self._state,
                gesture_name="Volume",
                target_volume=target,
                event=event,
            )

        if gesture == "Fist":
            if self._state != GestureState.MUTED:
                self._prev_volume = current_volume
                event = GestureEvent.MUTED
            self._state = GestureState.MUTED
            return GestureCommand(
                state=self._state,
                gesture_name="Muted 🔇",
                target_volume=0.0,
                event=event,
            )

        if gesture == "Open Palm":
            if self._state == GestureState.MUTED:
                event = GestureEvent.UNMUTED
                self._state = GestureState.IDLE
                return GestureCommand(
                    state=self._state,
                    gesture_name="Unmuted 🔊",
                    target_volume=self._prev_volume,
                    event=event,
                )
            self._state = GestureState.IDLE
            return GestureCommand(
                state=self._state, gesture_name="Open Palm"
            )

        if gesture == "Thumbs Up":
            if self._state != GestureState.LOCKED:
                event = GestureEvent.LOCKED
            self._state = GestureState.LOCKED
            return GestureCommand(
                state=self._state,
                gesture_name="Locked 🔒",
                event=event,
            )

        # Unknown / other
        self._state = GestureState.IDLE
        return GestureCommand(state=self._state, gesture_name=gesture)


