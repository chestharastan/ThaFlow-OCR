#!/usr/bin/env python3
"""Static dev server for the client-only ThaOCR app with the two headers multi-threaded WebAssembly needs.
    python serve.py [port]      (default 8020)"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

class H(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".mjs": "text/javascript", ".js": "text/javascript", ".wasm": "application/wasm", ".onnx": "application/octet-stream", ".json": "application/json"}
    def end_headers(self):
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Resource-Policy", "same-origin")
        self.send_header("Cache-Control", "public, max-age=31536000, immutable" if self.path.startswith(("/models/", "/vendor/", "/fonts/")) and not self.path.endswith(".json") else "no-cache")
        super().end_headers()
    def log_message(self, fmt, *args):
        if "404" in (args[1] if len(args) > 1 else ""): super().log_message(fmt, *args)

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8020
    import os; os.chdir(Path(__file__).parent)
    print(f"ThaOCR web on http://localhost:{port}/")
    ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
