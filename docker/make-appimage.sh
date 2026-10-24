#!/usr/bin/env bash
# Runs inside the container, after `yarn package`: wraps the packaged app into out/*.AppImage
set -euo pipefail
cd /app

PKG=$(ls -d out/*-linux-* 2>/dev/null | head -n1 || true)
[ -n "$PKG" ] || { echo "No packaged app in out/, run 'yarn package' first" >&2; exit 1; }

APPDIR=out/AppDir
rm -rf "$APPDIR"
mkdir -p "$APPDIR/usr/lib/inav-configurator"
cp -a "$PKG/." "$APPDIR/usr/lib/inav-configurator/"
cp assets/linux/icon/inav_icon_128.png "$APPDIR/inav-configurator.png"

cat > "$APPDIR/inav-configurator.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=INAV Configurator
Exec=inav-configurator
Icon=inav-configurator
Categories=Utility;
EOF

# An AppImage has no setuid chrome-sandbox, so the sandbox must be off
cat > "$APPDIR/AppRun" <<'EOF'
#!/bin/sh
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/lib/inav-configurator/inav-configurator" --no-sandbox "$@"
EOF
chmod +x "$APPDIR/AppRun"

VERSION=$(node -p "require('./package.json').version")
OUT="out/INAV-Configurator-${VERSION}-$(uname -m).AppImage"
ARCH=$(uname -m) appimagetool "$APPDIR" "$OUT"
rm -rf "$APPDIR"
echo "Built $OUT"
