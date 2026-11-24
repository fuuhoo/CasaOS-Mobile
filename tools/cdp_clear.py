#!/usr/bin/env python3
"""Clear all service workers / caches for an origin via the CDP Storage domain.

Usage: python cdp_clear.py --port 9333 [--origin http://host:port]
"""
import json
import sys

sys.path.insert(0, __file__.rsplit('\\', 1)[0].rsplit('/', 1)[0])
from cdp import WS, pick_target  # noqa: E402


def main():
    port = 9333
    origin = None
    args = sys.argv[1:]
    while args:
        if args[0] == '--port':
            port = int(args[1]); args = args[2:]
        elif args[0] == '--origin':
            origin = args[1]; args = args[2:]
        else:
            break

    target = pick_target(port)
    if not target:
        print('no target')
        return
    if not origin:
        origin = target['url'].split('/#')[0].split('/')[0] + '//' + \
            target['url'].split('//')[1].split('/')[0]

    print('origin:', origin)
    ws = WS(target['webSocketDebuggerUrl'])

    ws.send(json.dumps({
        'id': 1,
        'method': 'Storage.clearDataForOrigin',
        'params': {
            'origin': origin,
            'storageTypes': 'all',
        },
    }))

    while True:
        msg = json.loads(ws.recv())
        if msg.get('id') == 1:
            print('clearDataForOrigin ->', json.dumps(msg.get('result', msg.get('error')), ensure_ascii=False))
            break

    ws.sock.close()


if __name__ == '__main__':
    main()
