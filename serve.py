#!/usr/bin/env python3
"""개발용 정적 서버.

`python -m http.server` 를 그냥 쓰면 브라우저가 ES 모듈을 공격적으로 캐싱해서
소스를 고쳐도 화면이 그대로인 일이 생긴다. 캐시 무효화 헤더를 붙여 그걸 막는다.

배포(GitHub Pages)에는 이 파일이 관여하지 않는다. 순수 개발 편의용.

    python serve.py [포트]
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def send_response(self, *args, **kwargs):
        # Last-Modified 기반 304 를 아예 내보내지 않는다
        super().send_response(*args, **kwargs)

    def log_message(self, fmt, *args):
        if "304" in (args[1] if len(args) > 1 else ""):
            return
        super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    handler = partial(NoCacheHandler, directory=str(ROOT))
    with ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"APEX dev server  ->  http://localhost:{port}  (no-cache)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nstopped")


if __name__ == "__main__":
    main()
