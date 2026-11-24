"""Read-only static server for the look-dev harness (qa/lookdev, wave 5): one port, the game at /game/.

    python qa/lookdev/serve.py [--port 8821]
    /game/...  -> this checkout (the repo root: index.html, src/, assets/), never written

Copied from the look-dev lane (D:/lr_lookdev/harness/serve.py, 2026-11-23); it now serves the repo it lives in.
Also importable: start(port) returns a server running on a daemon thread; stop with .shutdown().
"""
import argparse, http.server, os, threading, urllib.parse

GAME = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
MOUNTS = {'/game/': GAME}


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript',
                      '.json': 'application/json', '.wasm': 'application/wasm'}

    def translate_path(self, path):
        p = urllib.parse.unquote(urllib.parse.urlsplit(path).path)
        for pre, root in MOUNTS.items():
            if p.startswith(pre):
                rel = os.path.normpath(p[len(pre):]).lstrip('\\/')
                full = os.path.abspath(os.path.join(root, rel))
                return full if full.startswith(os.path.abspath(root)) else os.path.join(root, '__nope__')
        return os.path.join(GAME, '__nope__')

    def do_PUT(self):
        self.send_error(405)
    do_POST = do_DELETE = do_PUT

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *a):
        pass


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def start(port=8821):
    srv = Server(('127.0.0.1', port), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=int(os.environ.get('PORT', 8821)))
    a = ap.parse_args()
    print(f'serving http://127.0.0.1:{a.port}/game/ from {GAME}', flush=True)
    Server(('127.0.0.1', a.port), Handler).serve_forever()
