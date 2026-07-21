"""
System-level action controllers for the AI Desktop Gesture Controller.

Provides brightness control, screenshot capture, mouse movement,
media key simulation, application launching, and power management.
"""
from __future__ import annotations

import ctypes
import datetime
import os
import subprocess
import webbrowser
from pathlib import Path
from typing import Optional

import psutil


class BrightnessController:
    """Screen brightness control using screen_brightness_control."""

    _STEP = 5  # Default brightness step percentage

    @staticmethod
    def get_brightness() -> int:
        try:
            import screen_brightness_control as sbc
            vals = sbc.get_brightness()
            return vals[0] if isinstance(vals, list) else vals
        except Exception:
            return 50

    @staticmethod
    def set_brightness(value: int) -> int:
        value = max(0, min(100, value))
        try:
            import screen_brightness_control as sbc
            sbc.set_brightness(value)
        except Exception:
            pass
        return value

    @classmethod
    def adjust(cls, direction: str, step: int = _STEP) -> int:
        current = cls.get_brightness()
        if direction == "up":
            target = min(100, current + step)
        else:
            target = max(0, current - step)
        return cls.set_brightness(target)


class ScreenshotManager:
    """Captures screenshots and saves with timestamp."""

    def __init__(self, save_folder: str = "") -> None:
        if not save_folder:
            save_folder = os.path.join(os.path.expanduser("~"), "Pictures", "GestureScreenshots")
        self._folder = save_folder
        os.makedirs(self._folder, exist_ok=True)

    def capture(self) -> str:
        """Take a screenshot and return the saved file path."""
        try:
            import mss
            from PIL import Image

            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"gesture_screenshot_{timestamp}.png"
            filepath = os.path.join(self._folder, filename)

            with mss.mss() as sct:
                monitor = sct.monitors[1]  # Primary monitor
                img = sct.grab(monitor)
                Image.frombytes("RGB", img.size, img.bgra, "raw", "BGRX").save(filepath)

            return filepath
        except Exception as e:
            return f"Error: {e}"

    @property
    def folder(self) -> str:
        return self._folder

    @folder.setter
    def folder(self, path: str) -> None:
        self._folder = path
        os.makedirs(self._folder, exist_ok=True)


class MouseController:
    """System cursor control via pyautogui."""

    def __init__(self) -> None:
        try:
            import pyautogui
            pyautogui.FAILSAFE = True
            pyautogui.PAUSE = 0
            self._screen_w, self._screen_h = pyautogui.size()
        except Exception:
            self._screen_w, self._screen_h = 1920, 1080

    def move(self, norm_x: float, norm_y: float) -> None:
        """Move cursor to normalised position (0-1)."""
        try:
            import pyautogui
            x = int(norm_x * self._screen_w)
            y = int(norm_y * self._screen_h)
            pyautogui.moveTo(x, y, _pause=False)
        except Exception:
            pass

    @staticmethod
    def left_click() -> None:
        try:
            import pyautogui
            pyautogui.click(_pause=False)
        except Exception:
            pass

    @staticmethod
    def right_click() -> None:
        try:
            import pyautogui
            pyautogui.rightClick(_pause=False)
        except Exception:
            pass

    @staticmethod
    def mouse_down() -> None:
        try:
            import pyautogui
            pyautogui.mouseDown(_pause=False)
        except Exception:
            pass

    @staticmethod
    def mouse_up() -> None:
        try:
            import pyautogui
            pyautogui.mouseUp(_pause=False)
        except Exception:
            pass


class MediaController:
    """Simulate media key presses."""

    # Virtual-Key Codes for media keys
    VK_MEDIA_PLAY_PAUSE = 0xB3
    VK_MEDIA_NEXT_TRACK = 0xB0
    VK_MEDIA_PREV_TRACK = 0xB1

    @staticmethod
    def _press_key(vk_code: int) -> None:
        """Send a virtual key press using Windows API."""
        try:
            KEYEVENTF_EXTENDEDKEY = 0x0001
            KEYEVENTF_KEYUP = 0x0002
            ctypes.windll.user32.keybd_event(vk_code, 0, KEYEVENTF_EXTENDEDKEY, 0)
            ctypes.windll.user32.keybd_event(vk_code, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0)
        except Exception:
            pass

    @classmethod
    def play_pause(cls) -> None:
        cls._press_key(cls.VK_MEDIA_PLAY_PAUSE)

    @classmethod
    def next_track(cls) -> None:
        cls._press_key(cls.VK_MEDIA_NEXT_TRACK)

    @classmethod
    def prev_track(cls) -> None:
        cls._press_key(cls.VK_MEDIA_PREV_TRACK)


class AppLauncher:
    """Launch applications and URLs."""

    # Default application paths (Windows)
    DEFAULT_PATHS = {
        "chrome": [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ],
        "vscode": [
            os.path.expandvars(r"%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe"),
            r"C:\Program Files\Microsoft VS Code\Code.exe",
        ],
        "explorer": ["explorer.exe"],
    }

    @classmethod
    def open_app(cls, app_name: str, custom_path: str = "") -> bool:
        """Open an application by name. Returns True on success."""
        if custom_path and os.path.exists(custom_path):
            try:
                subprocess.Popen([custom_path], shell=False)
                return True
            except Exception:
                return False

        paths = cls.DEFAULT_PATHS.get(app_name, [])
        for path in paths:
            if os.path.exists(path):
                try:
                    subprocess.Popen([path], shell=False)
                    return True
                except Exception:
                    continue

        # Fallback: try running the app name directly
        try:
            subprocess.Popen([app_name], shell=True)
            return True
        except Exception:
            return False

    @staticmethod
    def open_website(url: str) -> bool:
        try:
            webbrowser.open(url)
            return True
        except Exception:
            return False


class SystemController:
    """System power management: lock, sleep, shutdown."""

    @staticmethod
    def lock() -> bool:
        try:
            ctypes.windll.user32.LockWorkStation()
            return True
        except Exception:
            return False

    @staticmethod
    def sleep() -> bool:
        try:
            # SetSuspendState(hibernate, force, disable_wake_event)
            ctypes.windll.powrprof.SetSuspendState(0, 1, 0)
            return True
        except Exception:
            return False

    @staticmethod
    def shutdown() -> bool:
        try:
            os.system("shutdown /s /t 5 /c \"Gesture Controller: Shutdown initiated\"")
            return True
        except Exception:
            return False

    @staticmethod
    def cancel_shutdown() -> bool:
        try:
            os.system("shutdown /a")
            return True
        except Exception:
            return False


class SystemStats:
    """System resource monitoring."""

    @staticmethod
    def get_stats() -> dict:
        try:
            return {
                "cpu": psutil.cpu_percent(interval=0),
                "ram": psutil.virtual_memory().percent,
            }
        except Exception:
            return {"cpu": 0, "ram": 0}
