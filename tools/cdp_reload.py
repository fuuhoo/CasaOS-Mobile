#!/usr/bin/env python3
"""Clear the WebView's HTTP cache and reload the page, via CDP.

Usage: python cdp_reload.py [--port 9333]
"""
import json
import sys
import time

sys.path.insert(0, __file__.rsplit('\\', 1)[0].rsplit('/', 1)[0])
from cdp import WS, pick_target  # noqa: E402


def call(ws, mid, method, params=None):
    ws.send(json.dumps({'id': mid, 'method': method, 'params': params or {}}))
    while True:
        msg = json.loads(ws.recv())
        if msg.get('id') == mid:
            return msg


def main():
    port = 9333
    args = sys.argv[1:]
    if args and args[0] == '--port':
        port = int(args[1])

    target = pick_target(port)
    if not target:
        print('no target')
        return
    print('target:', target.get('url'))
    ws = WS(target['webSocketDebuggerUrl'])

    for mid, method in ((1, 'Network.enable'), (2, 'Network.clearBrowserCache'),
                        (3, 'Network.clearBrowserCookies')):
        res = call(ws, mid, method)
        print('%s -> %s' % (method, 'ok' if 'error' not in res else res['error']))

    # 强制重新导航，绕过 HTTP 缓存
    call(ws, 4, 'Page.enable')
    url = target['url']
    print('navigate ->', url)
    call(ws, 5, 'Page.navigate', {'url': url})

    time.sleep(2)
    ws.sock.close()


if __name__ == '__main__':
    main()
