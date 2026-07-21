"""
API server for the AI Desktop Gesture Controller.

Serves the web frontend and provides REST API endpoints for system-level
actions: volume, brightness, screenshots, mouse control, media keys,
application launching, and power management.
"""
import http.server
import socketserver
import json
import os
import mimetypes
import time

mimetypes.add_type('text/css', '.css')
mimetypes.add_type('application/javascript', '.js')
mimetypes.add_type('application/javascript', '.mjs')

from core.volume_controller import VolumeController
from core.system_actions import (
    BrightnessController,
    ScreenshotManager,
    MouseController,
    MediaController,
    AppLauncher,
    SystemController,
    SystemStats,
)

import sys

if getattr(sys, 'frozen', False):
    base_dir = sys._MEIPASS
    settings_dir = os.path.dirname(sys.executable)
else:
    base_dir = os.path.dirname(__file__)
    settings_dir = base_dir

PORT = 8080
WEB_DIR = os.path.join(base_dir, "web")
SETTINGS_FILE = os.path.join(settings_dir, "gesture_settings.json")

# Initialize controllers
vol_ctrl = VolumeController()
screenshot_mgr = ScreenshotManager()
mouse_ctrl = MouseController()


def _load_settings() -> dict:
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_settings(data: dict) -> None:
    try:
        with open(SETTINGS_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass


class APIHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def log_message(self, format, *args):
        # Suppress noisy request logs, only print errors
        if args and isinstance(args[0], str) and args[0].startswith("4"):
            super().log_message(format, *args)

    def do_OPTIONS(self):
        self.send_response(200, "ok")
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS, POST')
        self.send_header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type")
        self.end_headers()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def _read_json(self) -> dict:
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length) if length else b'{}'
            return json.loads(body)
        except Exception:
            return {}

    def _respond_json(self, data: dict, status: int = 200) -> None:
        self.send_response(status)
        self.send_header('Content-type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    # ── GET endpoints ────────────────────────────────────────────────

    def do_GET(self):
        if self.path == '/api/settings':
            self._respond_json({"status": "ok", "settings": _load_settings()})
        elif self.path == '/api/brightness':
            val = BrightnessController.get_brightness()
            self._respond_json({"status": "ok", "brightness": val})
        elif self.path == '/api/volume':
            val = vol_ctrl.get_volume()
            self._respond_json({"status": "ok", "volume": val})
        elif self.path == '/api/system/stats':
            stats = SystemStats.get_stats()
            self._respond_json({"status": "ok", **stats})
        else:
            super().do_GET()

    # ── POST endpoints ───────────────────────────────────────────────

    def do_POST(self):
        path = self.path
        data = self._read_json()

        try:
            # ── Volume (existing, preserved) ─────────────────────────
            if path == '/api/volume':
                volume_fraction = float(data.get('volume', 0.5))
                target_volume = volume_fraction * 100.0
                vol_ctrl.set_volume(target_volume, smooth=False)
                vol_ctrl.reset_smoothing()
                self._respond_json({"status": "ok", "volume": target_volume})

            # ── Brightness ───────────────────────────────────────────
            elif path == '/api/brightness':
                direction = data.get('direction', 'up')
                step = int(data.get('step', 5))
                new_val = BrightnessController.adjust(direction, step)
                self._respond_json({"status": "ok", "brightness": new_val})

            # ── Screenshot ───────────────────────────────────────────
            elif path == '/api/screenshot':
                filepath = screenshot_mgr.capture()
                success = not filepath.startswith("Error")
                self._respond_json({
                    "status": "ok" if success else "error",
                    "path": filepath,
                })

            # ── Mouse ────────────────────────────────────────────────
            elif path == '/api/mouse':
                action = data.get('action', 'move')
                if action == 'move':
                    mouse_ctrl.move(
                        float(data.get('x', 0.5)),
                        float(data.get('y', 0.5)),
                    )
                elif action == 'left_click':
                    mouse_ctrl.left_click()
                elif action == 'right_click':
                    mouse_ctrl.right_click()
                elif action == 'mouse_down':
                    mouse_ctrl.mouse_down()
                elif action == 'mouse_up':
                    mouse_ctrl.mouse_up()
                self._respond_json({"status": "ok"})

            # ── Media Controls ───────────────────────────────────────
            elif path == '/api/media/playpause':
                MediaController.play_pause()
                self._respond_json({"status": "ok", "action": "play_pause"})

            elif path == '/api/media/next':
                MediaController.next_track()
                self._respond_json({"status": "ok", "action": "next"})

            elif path == '/api/media/prev':
                MediaController.prev_track()
                self._respond_json({"status": "ok", "action": "prev"})

            # ── System Power ─────────────────────────────────────────
            elif path == '/api/system/lock':
                ok = SystemController.lock()
                self._respond_json({"status": "ok" if ok else "error"})

            elif path == '/api/system/sleep':
                ok = SystemController.sleep()
                self._respond_json({"status": "ok" if ok else "error"})

            elif path == '/api/system/shutdown':
                ok = SystemController.shutdown()
                self._respond_json({"status": "ok" if ok else "error"})

            elif path == '/api/system/cancel-shutdown':
                ok = SystemController.cancel_shutdown()
                self._respond_json({"status": "ok" if ok else "error"})

            elif path == '/api/system/stats':
                stats = SystemStats.get_stats()
                self._respond_json({"status": "ok", **stats})

            # ── App Launcher ─────────────────────────────────────────
            elif path == '/api/app/chrome':
                ok = AppLauncher.open_app("chrome")
                self._respond_json({"status": "ok" if ok else "error", "app": "Chrome"})

            elif path == '/api/app/vscode':
                ok = AppLauncher.open_app("vscode")
                self._respond_json({"status": "ok" if ok else "error", "app": "VS Code"})

            elif path == '/api/app/explorer':
                ok = AppLauncher.open_app("explorer")
                self._respond_json({"status": "ok" if ok else "error", "app": "Explorer"})

            elif path == '/api/app/website':
                url = data.get('url', 'https://www.google.com')
                ok = AppLauncher.open_website(url)
                self._respond_json({"status": "ok" if ok else "error", "url": url})

            # ── Settings ─────────────────────────────────────────────
            elif path == '/api/settings':
                _save_settings(data)
                # Apply relevant settings
                folder = data.get('screenshotFolder', '')
                if folder:
                    screenshot_mgr.folder = folder
                self._respond_json({"status": "ok"})

            else:
                self._respond_json({"status": "error", "message": "Unknown endpoint"}, 404)

        except Exception as e:
            self._respond_json({"status": "error", "message": str(e)}, 500)


if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", PORT), APIHandler) as httpd:
        print(f"\n  [AI] AI Gesture Desktop Controller")
        print(f"  ---------------------------------")
        print(f"  Server running on http://localhost:{PORT}")
        print(f"  Web UI: http://localhost:{PORT}/index.html")
        print(f"  Press Ctrl+C to stop\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        print("\n  Server stopped.")
