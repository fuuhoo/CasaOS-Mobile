#!/usr/bin/env python3
"""Talk to the adb server directly using the adb host protocol.

The adb host protocol replies "OKAY" first (for commands that produce a
payload), then a 4-hex-digit length, then the payload.

Usage: python adb_host.py [host] [port] [command]
  command defaults to "host:devices-l"
"""
import socket
import sys


def read_exact(sock, n):
    buf = b''
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise RuntimeError('connection closed')
        buf += chunk
    return buf


def host_command(sock, cmd, timeout=20):
    payload = cmd.encode()
    sock.sendall(b'%04x' % len(payload) + payload)

    # Some commands reply with a 4-byte status ("OKAY" / "FAIL").
    head = read_exact(sock, 4)
    if head in (b'OKAY', b'FAIL'):
        if head == b'FAIL':
            msg = read_exact(sock, 4)
            n = int(msg.decode(), 16)
            return 'FAIL: ' + read_exact(sock, n).decode('utf-8', 'replace')
        n = int(read_exact(sock, 4).decode(), 16)
        return read_exact(sock, n).decode('utf-8', 'replace')

    # Otherwise the first 4 bytes are the length itself.
    n = int(head.decode(), 16)
    return read_exact(sock, n).decode('utf-8', 'replace')


def main():
    host = sys.argv[1] if len(sys.argv) > 1 else '127.0.0.1'
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 5037
    cmd = sys.argv[3] if len(sys.argv) > 3 else 'host:devices-l'

    sock = socket.create_connection((host, port), timeout=15)
    sock.settimeout(20)
    print('> %s' % cmd)
    print(host_command(sock, cmd))
    sock.close()


if __name__ == '__main__':
    main()
