"""
本地模拟 CasaOS 服务器，用来在真机上验证移动端适配（返回手势、安全区等）。

它做两件事：
  1. 用 UI 的生产构建产物提供静态页面（就是 NAS 上 /var/lib/casaos/www 的内容）
  2. 补上 /v1/* 的假 API，让页面的接口调用不至于全部报错

用法：
  python tools/mock-casaos-server.py [端口]
"""
import http.server
import json
import os
import socketserver
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "build", "sysroot", "var", "lib", "casaos", "www")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8099


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=os.path.abspath(ROOT), **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("[mock] %s - %s\n" % (self.address_string(), fmt % args))

    def _json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]

        if path == "/v1/sys/version/current":
            self._json("0.4.15")
            return
        if path == "/v1/users/status":
            self._json({"success": 200, "data": {"initialized": True}})
            return
        if path == "/v1/users/current":
            self._json({"success": 200, "data": {"username": "test", "nickname": "test"}})
            return
        if path == "/v1/folder":
            self._json({
                "success": 200,
                "data": {"content": [
                    {"name": "Media", "path": "/DATA/Media", "is_dir": True, "date": "2026-11-20 10:00:00", "size": 0, "write": True},
                    {"name": "Photos", "path": "/DATA/Photos", "is_dir": True, "date": "2026-11-20 10:00:00", "size": 0, "write": True},
                    {"name": "Documents", "path": "/DATA/Documents", "is_dir": True, "date": "2026-11-20 10:00:00", "size": 0, "write": True},
                    {"name": "readme.txt", "path": "/DATA/readme.txt", "is_dir": False, "date": "2026-11-20 10:00:00", "size": 1024, "write": True},
                ]},
            })
            return
        if path == "/v1/sys/utilization":
            self._json({"success": 200, "data": {"cpu": {"usage": 12}, "mem": {"total": 8000, "used": 3200}}})
            return
        if path == "/v1/sys/hardware":
            self._json({"success": 200, "data": {"cpu": {"model": "Test"}, "mem": {"total": 8000}, "system": {"model": "Mock"}}})
            return

        super().do_GET()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length:
            self.rfile.read(length)
        self._json({"success": 200, "data": {}})

    def do_PUT(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length:
            self.rfile.read(length)
        self._json({"success": 200, "data": {}})

    def do_DELETE(self):
        self._json({"success": 200, "data": {}})


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    print(f"[mock] serving {os.path.abspath(ROOT)} on 0.0.0.0:{PORT}")
    Server(("0.0.0.0", PORT), Handler).serve_forever()
