#!/bin/bash
# macOS: double-click to start the agent dashboard. Keep this window open.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Get it from https://nodejs.org (LTS), then double-click this file again."
  read -r -p "Press Enter to close."
  exit 1
fi
node server.js --open
