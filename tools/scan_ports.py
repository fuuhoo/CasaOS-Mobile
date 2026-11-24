#!/usr/bin/env python3
"""Scan a host for open TCP ports in the Android wireless-debugging range.

Usage: python scan_ports.py <host> [start] [end]
"""
import socket
import sys
from concurrent.futures import ThreadPoolExecutor


def probe(host, port, timeout=0.6):
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return port
    except Exception:
        return None


def main():
    host = sys.argv[1]
    start = int(sys.argv[2]) if len(sys.argv) > 2 else 30000
    end = int(sys.argv[3]) if len(sys.argv) > 3 else 49999

    ports = range(start, end + 1)
    found = []
    with ThreadPoolExecutor(max_workers=600) as pool:
        for res in pool.map(lambda p: probe(host, p), ports):
            if res:
                found.append(res)
                print('  open: %d' % res)

    print('open ports: %s' % (', '.join(str(p) for p in sorted(found)) or 'none'))


if __name__ == '__main__':
    main()
