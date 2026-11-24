#!/usr/bin/env python3
"""Minimal Chrome DevTools Protocol client for evaluating JavaScript
inside the CasaOS WebView running on the phone.

Usage:
    python cdp.py <ws-url> "<javascript expression>"
    python cdp.py --port 9333 "<javascript expression>"   # picks the CasaOS page

The expression is evaluated with `Runtime.evaluate` (awaitPromise, returning
the JSON value). Console output from the page is captured as well.
"""
import json
import socket
import struct
import sys
import urllib.request
import base64
import os


def http_json(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read().decode('utf-8'))


class WS:
    """Tiny WebSocket client (text frames only) - enough for CDP."""

    def __init__(self, url):
        assert url.startswith('ws://')
        rest = url[5:]
        hostport, _, path = rest.partition('/')
        host, _, port = hostport.partition(':')
        self.sock = socket.create_connection((host, int(port or 80)), timeout=20)
        self.sock.settimeout(25)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            'GET /%s HTTP/1.1\r\n'
            'Host: %s\r\n'
            'Upgrade: websocket\r\n'
            'Connection: Upgrade\r\n'
            'Sec-WebSocket-Key: %s\r\n'
            'Sec-WebSocket-Version: 13\r\n\r\n' % (path, hostport, key)
        )
        self.sock.sendall(req.encode())
        self.buf = b''
        while b'\r\n\r\n' not in self.buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError('handshake failed')
            self.buf += chunk
        self.buf = self.buf.split(b'\r\n\r\n', 1)[1]

    def _recv_exact(self, n):
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise RuntimeError('connection closed')
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send(self, text):
        payload = text.encode('utf-8')
        header = bytearray([0x81])
        mask = os.urandom(4)
        n = len(payload)
        if n < 126:
            header.append(0x80 | n)
        elif n < 65536:
            header.append(0x80 | 126)
            header += struct.pack('>H', n)
        else:
            header.append(0x80 | 127)
            header += struct.pack('>Q', n)
        header += mask
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(header) + masked)

    def recv(self):
        b0, b1 = self._recv_exact(2)
        opcode = b0 & 0x0F
        masked = b1 & 0x80
        length = b1 & 0x7F
        if length == 126:
            length = struct.unpack('>H', self._recv_exact(2))[0]
        elif length == 127:
            length = struct.unpack('>Q', self._recv_exact(8))[0]
        if masked:
            mask = self._recv_exact(4)
            data = bytes(b ^ mask[i % 4] for i, b in enumerate(self._recv_exact(length)))
        else:
            data = self._recv_exact(length)
        if opcode == 0x8:
            raise RuntimeError('closed by peer')
        return data.decode('utf-8', 'replace')


def pick_target(port, match='casaos'):
    targets = http_json('http://127.0.0.1:%d/json' % port)
    for t in targets:
        url = (t.get('url') or '').lower()
        title = (t.get('title') or '').lower()
        if match.lower() in url or match.lower() in title:
            return t
    return targets[0] if targets else None


def evaluate(ws, expression):
    ws.send(json.dumps({
        'id': 1,
        'method': 'Runtime.evaluate',
        'params': {
            'expression': expression,
            'returnByValue': True,
            'awaitPromise': True,
        },
    }))
    while True:
        msg = json.loads(ws.recv())
        if msg.get('id') == 1:
            return msg


def main():
    port = 9333
    args = sys.argv[1:]
    if args and args[0] == '--port':
        port = int(args[1])
        args = args[2:]
    expr = None
    if args and args[0] == '--file':
        with open(args[1], encoding='utf-8') as f:
            expr = f.read()
        args = args[2:]
    if not args and expr is None:
        print(__doc__)
        sys.exit(1)
    if expr is None:
        expr = args[0]

    target = pick_target(port)
    if not target:
        print('no devtools target on port %d' % port)
        sys.exit(1)
    print('target: %s  %s' % (target.get('title'), target.get('url')))

    ws = WS(target['webSocketDebuggerUrl'])
    result = evaluate(ws, expr)
    res = result.get('result', {}).get('result', {})
    if 'exceptionDetails' in result.get('result', {}):
        print('EXCEPTION:', json.dumps(result['result']['exceptionDetails'],
                                         ensure_ascii=False, indent=2))
    else:
        value = res.get('value')
        if isinstance(value, str):
            print(value)
        else:
            print(json.dumps(value, ensure_ascii=False, indent=2))
    ws.sock.close()


if __name__ == '__main__':
    main()
