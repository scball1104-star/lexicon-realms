"""Static dev server for Lexicon Realms on http://127.0.0.1:8790 (no caching, correct JS module MIME type).

    python tools/dev/serve.py [--port 8790]

Serves the repo root. Bound to 127.0.0.1 only.
"""
import argparse
import functools
import http.server
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--port', type=int, default=8790)
    a = ap.parse_args()
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', a.port), functools.partial(Handler, directory=ROOT))
    print(f'serving {ROOT} on http://127.0.0.1:{a.port}', flush=True)
    srv.serve_forever()


if __name__ == '__main__':
    main()
