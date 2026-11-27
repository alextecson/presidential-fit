#!/bin/sh
# Installs the Presidential Fit helper on this Mac so it starts by itself and stays running.
# Before running: put profile.json (the profile block of your closet file) and me.jpg (your reference photo)
# in ~/Library/Application Support/PresidentialFit. To remove it again, run this script with "remove".
set -eu
LABEL=com.presidentialfit.helper
DIR="$HOME/Library/Application Support/PresidentialFit"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SRC=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
NODE=$(command -v node)
# A mockup that is being made right now is allowed to finish first (five minutes at most).
n=0
while [ -f "$DIR/busy" ] && [ "$n" -lt 150 ]; do
  [ "$n" -eq 0 ] && echo "A mockup is being made. Waiting for it to finish."
  sleep 2; n=$((n + 1))
done
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [ "${1:-}" = "remove" ]; then rm -f "$PLIST"; rm -rf "$DIR/helper"; echo "Helper removed. Private files stay in $DIR."; exit 0; fi
[ -f "$DIR/profile.json" ] && [ -f "$DIR/me.jpg" ] || { echo "Put profile.json and me.jpg in $DIR first."; exit 1; }
mkdir -p "$DIR/helper" "$HOME/Library/LaunchAgents"
cp "$SRC/mac/helper.mjs" "$SRC/js/link.js" "$SRC/js/mockup.js" "$SRC/js/engine.js" "$DIR/helper/"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$DIR/helper/helper.mjs</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$DIR/helper.out.log</string>
  <key>StandardErrorPath</key><string>$DIR/helper.out.log</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
</dict></plist>
PL
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Helper installed and started. Log: $DIR/helper.log"
