#!/usr/bin/env python3
"""Minimal ADB host-protocol client (no adb.exe involved).

The bundled adb.exe client hangs on this machine because the adb server
never answers "host:version" — its transport for the wireless device is
wedged. This client talks to the server (or straight to a device over TCP)
using the plain host protocol, so it is not affected.

Usage:
  python adb_mini.py devices
  python adb_mini.py connect <host>:<port>
  python adb_mini.py disconnect <serial>
  python adb_mini.py shell <serial> "<command>"
  python adb_mini.py pull <serial> <remote> <local>
"""
import socket
import sys
import time

SERVER = ('127.0.0.1', 5037)


def send(sock, cmd):
    payload = cmd.encode()
    sock.sendall(b'%04x' % len(payload) + payload)


def read_exact(sock, n):
    buf = b''
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise RuntimeError('connection closed')
        buf += chunk
    return buf


def read_response(sock):
    """Return the payload of a host command (handles the OKAY prefix)."""
    head = read_exact(sock, 4)
    if head in (b'OKAY', b'FAIL'):
        if head == b'FAIL':
            n = int(read_exact(sock, 4).decode(), 16)
            return 'FAIL: ' + read_exact(sock, n).decode('utf-8', 'replace')
        n = int(read_exact(sock, 4).decode(), 16)
        return read_exact(sock, n).decode('utf-8', 'replace')
    n = int(head.decode(), 16)
    return read_exact(sock, n).decode('utf-8', 'replace')


def server_conn():
    s = socket.create_connection(SERVER, timeout=15)
    s.settimeout(20)
    return s


def device_conn(serial, hostport=None):
    """Connect to a device: via the server (host:transport) or straight over TCP."""
    if hostport:
        s = socket.create_connection((hostport[0], hostport[1]), timeout=15)
        s.settimeout(30)
        return s
    s = server_conn()
    send(s, 'host:transport:%s' % serial)
    resp = read_response(s)
    if resp.startswith('FAIL'):
        raise RuntimeError('transport failed: %s' % resp)
    return s


def cmd_devices():
    s = server_conn()
    send(s, 'host:devices-l')
    print(read_response(s))
    s.close()


def cmd_connect(hostport):
    s = server_conn()
    send(s, 'host:connect:%s' % hostport)
    print(read_response(s))
    s.close()


def cmd_disconnect(serial):
    s = server_conn()
    send(s, 'host:disconnect:%s' % serial)
    print(read_response(s))
    s.close()


def cmd_shell(serial, command, hostport=None):
    s = device_conn(serial, hostport)
    send(s, 'shell:%s' % command)
    out = b''
    try:
        while True:
            chunk = s.recv(65536)
            if not chunk:
                break
            out += chunk
    except socket.timeout:
        pass
    sys.stdout.write(out.decode('utf-8', 'replace'))
    s.close()


def cmd_pull(serial, remote, local, hostport=None):
    s = device_conn(serial, hostport)
    send(s, 'pull:%s' % remote)
    head = read_exact(s, 4)
    if head == b'FAIL':
        n = int(read_exact(s, 4).decode(), 16)
        print('FAIL:', read_exact(s, n).decode('utf-8', 'replace'))
        return
    n = int(head.decode(), 16)
    with open(local, 'wb') as f:
        remaining = n
        while remaining > 0:
            chunk = s.recv(min(65536, remaining))
            if not chunk:
                break
            f.write(chunk)
            remaining -= len(chunk)
    print('pulled %d bytes -> %s' % (n, local))
    s.close()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    action = sys.argv[1]
    args = sys.argv[2:]

    if action == 'devices':
        cmd_devices()
    elif action == 'connect':
        cmd_connect(args[0])
    elif action == 'disconnect':
        cmd_disconnect(args[0])
    elif action == 'shell':
        hostport = None
        if len(args) >= 3 and ':' in args[0]:
            hostport = args[0].split(':')
            args = args[1:]
        cmd_shell(args[0], args[1], hostport)
    elif action == 'pull':
        hostport = None
        if len(args) >= 4 and ':' in args[0]:
            hostport = args[0].split(':')
            args = args[1:]
        cmd_pull(args[0], args[1], args[2], hostport)
    else:
        print('unknown action:', action)
        sys.exit(1)


if __name__ == '__main__':
    main()
