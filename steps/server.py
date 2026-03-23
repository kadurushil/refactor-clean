import http.server
import socketserver
import os
import sys

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

Handler = MyHTTPRequestHandler

print(f"Starting server on http://127.0.0.1:{PORT}")
print("Working directory:", os.getcwd())
print("Cache-busting enabled: Browser will always fetch latest files.")

# Explicitly bind to 127.0.0.1 for better reliability in offline/local environments
with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        httpd.server_close()
