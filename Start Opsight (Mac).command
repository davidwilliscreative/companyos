#!/bin/bash
# Double-click to start the Opsight demo on a Mac.
cd "$(dirname "$0")"
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js is not installed. Install the LTS version from https://nodejs.org, then double-click this file again."
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi
if [ ! -d node_modules ]; then
  echo "First run: installing (this takes a minute or two)..."
  npm install || { read -n 1 -s -r -p "Install failed. Press any key to close."; exit 1; }
fi
echo "Starting Opsight. Your browser will open at http://localhost:3000"
echo "Leave this window open while you use the demo. Close it to stop."
(sleep 6 && open http://localhost:3000) &
npm run dev
