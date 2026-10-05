import http.server
import socketserver
import os
import sys
import webbrowser
import threading
import time

# Ensure the server runs from the same directory as the script
os.chdir(os.path.dirname(os.path.abspath(__file__)))

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disable caching for all files to ensure latest assets are loaded
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        # Silently handle Chrome DevTools auto-discovery probe
        if self.path.startswith('/.well-known/appspecific/com.chrome.devtools.json'):
            self.send_response(204)
            self.end_headers()
            return

        # Silently handle missing sourcemaps if requested by browser developer tools
        if self.path.endswith('.map') and not os.path.exists(self.translate_path(self.path)):
            self.send_response(404)
            self.end_headers()
            return

        super().do_GET()

    def log_message(self, format, *args):
        # Suppress noisy DevTools background requests from polluting the server console
        req = getattr(self, 'path', '') or (args[0] if args else '')
        if 'com.chrome.devtools.json' in str(req) or (str(req).endswith('.map') and not os.path.exists(self.translate_path(getattr(self, 'path', '')))):
            return
        super().log_message(format, *args)

class ThreadedHTTPServer(http.server.ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True

Handler = MyHTTPRequestHandler

httpd = None
while True:
    try:
        httpd = ThreadedHTTPServer(("127.0.0.1", PORT), Handler)
        break
    except OSError as e:
        if e.errno == 10048 or "already in use" in str(e).lower():
            PORT += 1
            if PORT > 8100:
                print("Error: No available ports between 8000 and 8100.")
                sys.exit(1)
        else:
            raise e

print(f"Starting server on http://127.0.0.1:{PORT}")
print("Working directory:", os.getcwd())
print("Cache-busting enabled: Browser will always fetch latest files.")

def launch_browser():
    time.sleep(1)
    webbrowser.open(f"http://127.0.0.1:{PORT}/index.html")

# Launch default browser in a background thread once the server starts
threading.Thread(target=launch_browser, daemon=True).start()

# Explicitly bind to 127.0.0.1 for better reliability in offline/local environments
try:
    httpd.serve_forever()
except KeyboardInterrupt:
    print("\nServer stopped.")
    httpd.server_close()
