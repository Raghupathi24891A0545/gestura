"""
Shared application state — a mutable dataclass observed by all UI panels.
"""
from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum, auto


class GestureState(Enum):
    """Possible gesture states."""
    IDLE     = auto()
    VOLUME   = auto()
    MUTED    = auto()
    LOCKED   = auto()


@dataclass
class AppState:
    """
    Central mutable state shared across threads via signal/slot.
    Only the main‑thread slot mutates this; UI panels read it.
    """
    # ── Volume ──────────────────────────────────────────────────────────
    current_volume: float = 50.0
    previous_volume: float = 50.0       # stored before mute
    is_muted: bool = False

    # ── Gesture ─────────────────────────────────────────────────────────
    gesture_state: GestureState = GestureState.IDLE
    gesture_name: str = "Idle"
    is_locked: bool = False

    # ── Tracking ────────────────────────────────────────────────────────
    hand_detected: bool = False
    tracking_confidence: float = 0.0
    finger_distance: float = 0.0
    fingers_up: list[bool] = field(default_factory=lambda: [False] * 5)

    # ── Performance ─────────────────────────────────────────────────────
    fps: float = 0.0
    _frame_times: deque[float] = field(
        default_factory=lambda: deque(maxlen=30), repr=False
    )

    # ── Volume History (for graph) ──────────────────────────────────────
    volume_history: deque[tuple[float, float]] = field(
        default_factory=lambda: deque(maxlen=120), repr=False
    )  # (timestamp, volume)

    # ── Settings ────────────────────────────────────────────────────────
    camera_index: int = 0
    detection_confidence: float = 0.7
    tracking_confidence_setting: float = 0.7
    smoothing_alpha: float = 0.3
    volume_speed: float = 1.0
    theme_name: str = "Dark"

    # ── Helpers ──────────────────────────────────────────────────────────
    def record_frame_time(self) -> None:
        """Call once per processed frame to update FPS."""
        now = time.perf_counter()
        self._frame_times.append(now)
        if len(self._frame_times) >= 2:
            dt = self._frame_times[-1] - self._frame_times[0]
            if dt > 0:
                self.fps = (len(self._frame_times) - 1) / dt

    def record_volume(self) -> None:
        """Append current volume to history."""
        self.volume_history.append((time.time(), self.current_volume))
