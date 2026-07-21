"""
System volume controller using pycaw (Windows Core Audio API).

Provides get/set/mute/unmute with EMA smoothing to prevent jumps.
"""
from __future__ import annotations

import math
from ctypes import cast, POINTER

from comtypes import CLSCTX_ALL
from pycaw.pycaw import AudioUtilities, IAudioEndpointVolume


class VolumeController:
    """
    Thin wrapper around the Windows default‑audio‑endpoint volume.

    All public methods accept / return volume as 0‑100 float percentage.
    """

    def __init__(self, smoothing_alpha: float = 0.3) -> None:
        devices = AudioUtilities.GetSpeakers()
        self._volume = devices.EndpointVolume
        self._alpha = smoothing_alpha
        self._smoothed: float | None = None
        self._last_sent_pct: float = self.get_volume()
        self._pre_mute_volume: float = self._last_sent_pct

    # ── Public API ──────────────────────────────────────────────────────

    def get_volume(self) -> float:
        """Return current system volume as 0‑100 %."""
        current_scalar = self._volume.GetMasterVolumeLevelScalar()
        return current_scalar * 100.0

    def set_volume(self, pct: float, smooth: bool = True) -> float:
        """
        Set system volume.  Returns the actual value applied (after smoothing).
        """
        pct = max(0.0, min(100.0, pct))

        if smooth:
            if self._smoothed is None:
                self._smoothed = pct
            else:
                self._smoothed += self._alpha * (pct - self._smoothed)
            pct = self._smoothed

        # Only send to OS if the volume has changed by more than 0.2%
        # This prevents flooding the Windows COM interface at 30 FPS.
        if abs(pct - self._last_sent_pct) > 0.2:
            self._volume.SetMasterVolumeLevelScalar(pct / 100.0, None)
            self._last_sent_pct = pct

        return pct

    def mute(self) -> None:
        """Mute system audio: save current volume, set scalar to 0, set mute flag."""
        current = self.get_volume()
        if current > 0:
            self._pre_mute_volume = current
        self._volume.SetMasterVolumeLevelScalar(0.0, None)
        self._volume.SetMute(True, None)
        self._last_sent_pct = 0.0

    def unmute(self, restore_volume: float | None = None) -> None:
        """Unmute system audio: restore volume scalar, clear mute flag."""
        self._volume.SetMute(False, None)
        target = restore_volume if restore_volume is not None else self._pre_mute_volume
        target = max(0.0, min(100.0, target))
        self._volume.SetMasterVolumeLevelScalar(target / 100.0, None)
        self._last_sent_pct = target
        self._smoothed = target  # sync smoother so next gesture is seamless

    def is_muted(self) -> bool:
        return bool(self._volume.GetMute())

    def set_smoothing(self, alpha: float) -> None:
        self._alpha = max(0.05, min(1.0, alpha))

    def reset_smoothing(self) -> None:
        """Clear EMA state so next gesture starts with a fresh reading."""
        self._smoothed = None

