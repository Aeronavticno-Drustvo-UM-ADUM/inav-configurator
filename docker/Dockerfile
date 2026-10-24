FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential python3 pkg-config git ca-certificates curl file \
        libusb-1.0-0-dev libudev-dev udev \
        libgtk-3-0 libnss3 libxss1 libasound2 libgbm1 libxtst6 libxkbcommon0 \
        libdrm2 libatspi2.0-0 libcups2 libx11-xcb1 xdg-utils \
        libgl1 libegl1 libgl1-mesa-dri libglx-mesa0 dbus-x11 \
        fakeroot dpkg rpm squashfs-tools \
    && rm -rf /var/lib/apt/lists/*

# appimagetool runs extracted, the container has no FUSE
RUN curl -fsSL -o /usr/local/bin/appimagetool \
        "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-$(uname -m).AppImage" \
    && chmod +x /usr/local/bin/appimagetool

# Home and node_modules volumes are initialised from these directories
RUN mkdir -p /app/node_modules /home/dev && chmod 777 /app/node_modules /home/dev

ENV HOME=/home/dev \
    APPIMAGE_EXTRACT_AND_RUN=1 \
    ELECTRON_DISABLE_SANDBOX=1

WORKDIR /app
