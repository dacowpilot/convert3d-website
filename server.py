from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
import json
import cgi
import uuid
from urllib.parse import urlparse

ROOT = os.path.dirname(__file__)
UPLOAD_DIR = os.path.join(ROOT, 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

class Handler(SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True}).encode())
            return
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/upload':
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ={'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': self.headers['Content-Type']}
            )

            file_item = form['file']
            if not file_item.filename:
                self.send_json(400, {'error': 'No file provided'})
                return

            filename = os.path.basename(file_item.filename)
            safe_name = f"{uuid.uuid4().hex}_{filename}"
            dest_path = os.path.join(UPLOAD_DIR, safe_name)
            with open(dest_path, 'wb') as f:
                f.write(file_item.file.read())

            self.send_json(200, {'ok': True, 'file': safe_name, 'name': filename})
            return

        self.send_json(404, {'error': 'Not found'})

    def send_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        return

if __name__ == '__main__':
    port = 8000
    server = ThreadingHTTPServer(('0.0.0.0', port), Handler)
    print(f'Serving on http://localhost:{port}')
    server.serve_forever()
