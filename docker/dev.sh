#!/usr/bin/env bash
# Build, run and test INAV Configurator in Docker. Usage: docker/dev.sh <command>
#   image      build the Docker image
#   install    yarn install (into the node_modules volume)
#   start      yarn start, the window opens on your desktop (SITL on the host: tcp://127.0.0.1:5760)
#   test       yarn test
#   package    yarn package (out/)
#   appimage   package, then wrap into out/*.AppImage
#   shell      shell in the container
#   clean      remove the volumes and out/ .vite/
set -euo pipefail

cd "$(dirname "$0")"
ROOT=$(cd .. && pwd)

export HOST_UID=$(id -u) HOST_GID=$(id -g)
export DIALOUT_GID=$(getent group dialout | cut -d: -f3 || echo 20)
export DISPLAY=${DISPLAY:-:0}
export XAUTH_FILE=${XAUTHORITY:-$HOME/.Xauthority}
[ -e "$XAUTH_FILE" ] || XAUTH_FILE=/dev/null

# USB passthrough (real flight controller, DFU) only where the host has /dev/bus/usb, not on CI runners
COMPOSE_FILES=(-f docker-compose.yml)
[ -d /dev/bus/usb ] && COMPOSE_FILES+=(-f docker-compose.usb.yml)

dc() { docker compose "${COMPOSE_FILES[@]}" "$@"; }
run() { dc run --rm app "$@"; }

# Named volumes start root-owned
init_volumes() {
    dc run --rm -u root app chown "$HOST_UID:$HOST_GID" /app/node_modules /home/dev
}

ensure_deps() {
    run test -d node_modules/electron || { init_volumes; run yarn install; }
}

case "${1:-}" in
    image)    dc build ;;
    install)  init_volumes; run yarn install ;;
    start)
        command -v xhost >/dev/null && xhost +SI:localuser:"$(id -un)" >/dev/null || true
        ensure_deps; run yarn start -- -- --disable-gpu ;;
    test)     ensure_deps; run yarn test ;;
    package)  ensure_deps; run yarn package ;;
    appimage) ensure_deps; run yarn package; run bash docker/make-appimage.sh ;;
    shell)    run bash ;;
    clean)
        dc down -v
        rm -rf "$ROOT/out" "$ROOT/.vite" ;;
    *) sed -n '2,10p' "$0"; exit 1 ;;
esac
