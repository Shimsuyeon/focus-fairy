#!/usr/bin/env bash
# 크롬 웹스토어 스크린샷(1280×800) 다시 만들기 — 가짜 데이터(store/screenshot-kit/shim.js)로 팝업을 띄워 헤드리스 크롬으로 캡처
# 사용: bash scripts/store-screenshots.sh   (macOS, Google Chrome 필요)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
WORK="$(mktemp -d)"
PORT=8798

cp -R "$ROOT/extension/." "$WORK/"
cp "$ROOT/store/screenshot-kit/shim.js" "$ROOT/store/screenshot-kit/shot.html" "$WORK/"
# 팝업 스크립트보다 먼저 가짜 chrome.* / fetch 를 넣는다
perl -0pi -e 's#<script type="module" src="panel.js">#<script src="shim.js"></script>\n\t\t<script type="module" src="panel.js">#' "$WORK/popup.html"

(cd "$WORK" && python3 -m http.server "$PORT" >/dev/null 2>&1) &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; wait $SERVER 2>/dev/null; rm -rf "$WORK"' EXIT
sleep 1

shot() { # scene 파일명 [dark]
	local flags=(--headless=new --disable-gpu --hide-scrollbars --window-size=1280,800 --virtual-time-budget=5000)
	[[ "${3:-}" == dark ]] && flags+=(--force-dark-mode --blink-settings=preferredColorScheme=0)
	"$CHROME" "${flags[@]}" --screenshot="$ROOT/store/screenshots/$2" "http://localhost:$PORT/shot.html?scene=$1" 2>/dev/null
}

mkdir -p "$ROOT/store/screenshots"
shot 1 1-focus.png
shot 2 2-start.png
shot 3 3-tree-dark.png dark
echo "✅ store/screenshots/"
