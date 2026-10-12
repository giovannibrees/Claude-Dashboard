"""Builds demo/agent-hub-demo.html: the hub page with sample data and an in-memory database.

Run from the repo root after changing cloud/agent-hub.html: python3 demo/build.py
"""
import base64
import json
import pathlib

root = pathlib.Path(__file__).resolve().parent.parent
page = (root / 'cloud/agent-hub.html').read_text()
images = {p.name: 'data:image/png;base64,' + base64.b64encode(p.read_bytes()).decode()
          for p in sorted((root / 'demo/img').glob('*.png'))}
inject = ''.join([
    '<script>window.DEMO_IMG = ' + json.dumps(images) + ';</script>\n',
    '<script>\n' + (root / 'demo/demo-db.js').read_text() + '</script>\n',
    '<script>\n' + (root / 'demo/data.js').read_text() + '</script>\n',
])
title_end = page.index('</title>') + len('</title>')
out = page[:title_end].replace('<title>Agent Hub</title>', '<title>Agent Hub Demo</title>') + '\n' + inject + page[title_end:]
out = out.replace('HUB_URL_PLACEHOLDER', 'https://github.com/giovannibrees/Claude-Dashboard')
(root / 'demo/agent-hub-demo.html').write_text(out)
print('wrote demo/agent-hub-demo.html', len(out) // 1024, 'KB')
