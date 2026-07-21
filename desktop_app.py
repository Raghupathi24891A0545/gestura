"""
AI Gesture Desktop Controller - Desktop Application Entry Point

This script wraps the web dashboard into a hidden/system-tray desktop
application using PyQt6 and PyQt6-WebEngine. It runs the local Python API
server in the background so that gestures work continuously.
"""
import sys
import threading
import time
from PyQt6.QtWidgets import QApplication, QSystemTrayIcon, QMenu, QMainWindow
from PyQt6.QtGui import QIcon, QAction, QPixmap
from PyQt6.QtCore import QUrl, Qt
from PyQt6.QtWebEngineWidgets import QWebEngineView

# Import our API server and PORT
from server import APIHandler, PORT, socketserver

def run_server():
    """Run the local API server in a daemon thread."""
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("0.0.0.0", PORT), APIHandler) as httpd:
            httpd.serve_forever()
    except Exception as e:
        print(f"Server failed to start: {e}")

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("AI Gesture Controller")
        self.resize(1400, 900)
        
        # Make it look like a native borderless app (optional, but looks cleaner)
        # self.setWindowFlags(Qt.WindowType.FramelessWindowHint)
        
        self.browser = QWebEngineView()
        
        # Optional: enable camera permissions automatically for the webview
        self.browser.page().featurePermissionRequested.connect(self.on_permission_requested)
        
        self.browser.setUrl(QUrl(f"http://localhost:{PORT}/index.html"))
        self.setCentralWidget(self.browser)

    def on_permission_requested(self, url, feature):
        from PyQt6.QtWebEngineCore import QWebEnginePage
        if feature == QWebEnginePage.Feature.MediaVideoCapture:
            self.browser.page().setFeaturePermission(
                url, feature, QWebEnginePage.PermissionPolicy.GrantedByUser
            )

    def closeEvent(self, event):
        # Instead of killing the app, just hide the window to the system tray
        event.ignore()
        self.hide()

def create_tray_icon(app):
    """Fallback standard icon if no custom .ico is available."""
    return app.style().standardIcon(app.style().StandardPixmap.SP_ComputerIcon)

def main():
    # 1. Start the backend API server
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Wait a moment for server to bind
    time.sleep(1.0)

    # 2. Start the Qt Application
    app = QApplication(sys.argv)
    app.setQuitOnLastWindowClosed(False)

    icon = create_tray_icon(app)
    app.setWindowIcon(icon)

    window = MainWindow()

    # 3. Setup System Tray
    tray = QSystemTrayIcon(icon, app)
    tray.setToolTip("AI Gesture Controller")

    menu = QMenu()

    open_action = QAction("Open Dashboard", app)
    open_action.triggered.connect(window.show)
    menu.addAction(open_action)

    quit_action = QAction("Quit", app)
    quit_action.triggered.connect(app.quit)
    menu.addAction(quit_action)

    tray.setContextMenu(menu)
    tray.show()

    # Show dashboard on launch
    window.show()

    # 4. Start Event Loop
    sys.exit(app.exec())

if __name__ == "__main__":
    main()
