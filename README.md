# Android ADB GPS Spoofer

[English](#english) | [繁體中文](#繁體中文)

---

## English

### Overview

Open-source Android GPS spoofing via ADB (no phone-side app required).

It has two runtime modes:
- Electron desktop app (Windows / Linux)
- Standalone web server (Docker, browser UI)

Designed and tested for **Pikmin Bloom** and **Pokemon GO** workflows.

### What Is Implemented

**Location Control**
- Teleport by map click or manual coordinates
- Short-distance teleport glide (up to 1 km) at walk speed when current spoof position is known
- Joystick control (virtual joystick, `W/A/S/D`, arrow keys)
- Route playback with multi-waypoint paths
- GPX import (downsampled to max 1000 points)
- End-of-route mode: `Stop`, `Loop`, or `Wander` (configurable radius)
- Optional `Return to GPS when done`

**Anti-Detection / Stability**
- Gaussian GPS jitter (~10 m scale)
- Speed fluctuation (+/-15%)
- Bearing smoothing for route turns
- Cooldown calculator using distance table
- Dual-channel keep-alive and push watchdog to reduce jump-back

**Device & Session**
- Multi-device spoofing (parallel dispatch per selected serial)
- USB + Wi-Fi ADB workflows (`adb tcpip`, `adb connect`)
- Auto device polling every 3 seconds
- Real GPS readback (network-provider-first parsing)
- Saved locations + history (last 100 entries)
- Session persistence for route/speed/toggles
- Global `Stop All` with 3 modes:
  - `stay`: stop movement, keep mock GPS pinned
  - `graceful`: walk back to real GPS, then stop
  - `immediate`: remove mock provider immediately

**Architecture**
- Desktop app with tray support
- Embedded LAN web access from desktop app (default `http://<host-ip>:3388`)
- Standalone web server in Docker (default `http://<host-ip>:3000`)

### Requirements

**Desktop (Electron)**
- Windows 10/11 or Linux x64
- ADB either:
  - installed system-wide in `PATH`, or
  - bundled for runtime

**ADB resource folders (for packaged builds)**
- Windows bundle source: `resources/platform-tools/` (`adb.exe`, `AdbWinApi.dll`, `AdbWinUsbApi.dll`)
- Linux packaged app defaults to system `adb` in `PATH` (no bundled Linux adb by default)

**Web Server (Docker)**
- Docker
- USB passthrough: `--privileged` plus `/dev/bus/usb` mount
- Persistent data volume recommended (`/data`)

**Android Device**
- Android 12+ recommended (`cmd location` test-provider flow)
- USB debugging enabled

### Installation

#### Desktop

Download release artifacts:
- Windows: `.exe` installer / portable
- Linux: `.AppImage`

Or build from source:

```bash
git clone https://github.com/choupeanut/android-adb-gps-spoofer.git
cd android-adb-gps-spoofer
pnpm install
pnpm dev
pnpm dist:win
pnpm dist:linux
```

#### Docker (Standalone Web)

```bash
docker pull choupeanut/android-adb-gps-spoofer:latest

docker run -d \
  --name android-adb-gps-spoofer \
  -p 3000:3000 \
  --privileged \
  -v /dev/bus/usb:/dev/bus/usb \
  -v gps-spoofer-data:/data \
  choupeanut/android-adb-gps-spoofer:latest
```

Open `http://<host-ip>:3000`.

### Quick Start (USB)

1. Enable Android developer options + USB debugging.
2. Connect device by USB and accept RSA prompt.
3. In app/device card, run `Setup GPS` (`enable-mock-location`).
4. Start spoofing:
   - Teleport
   - Joystick
   - Route play / GPX import
5. Stop via per-feature stop, or `Stop All` modal.

### Wi-Fi ADB Flow

1. USB once: `Enable TCP/IP` (runs `adb tcpip 5555`).
2. Enter phone LAN IP and connect.
3. Reconnect by `ip:port` while phone stays on same LAN.
4. After reboot, usually repeat TCP/IP enable over USB.

### Synology / Container Manager Notes

- Run with USB passthrough and privileged mode, otherwise ADB-over-USB in container usually fails.
- Persist `/data` to a Synology volume.
- Prefer LAN-only exposure for port `3000`.

### Development

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm test:watch

# Build standalone web artifacts
node build-server.cjs
npx vite build --config vite.web.config.ts

# Run standalone web server locally
PORT=3000 DATA_DIR=./data node dist/server/index.js
```

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ADB_PATH` | unset | Override adb binary path |
| `PORT` | `3000` (standalone web) | HTTP/WS server port |
| `DATA_DIR` | `./data` (standalone web) | SQLite/session/log storage directory |
| `APP_VERSION` | `dev` | Version shown by `/api/version` |
| `EXPERIMENTAL_DISABLE_REAL_GPS_ON_FAKE` | `0` | Experimental master-location toggle during spoof |
| `ALLOW_CONTAMINATED_REAL_GPS` | `0` | Allow fallback GPS providers when strict network provider parse fails |

### Project Structure

```text
src/
  main/
    services/       ADB, device manager, location engine, route engine, anti-detect, db
    ipc/            IPC + WebSocket handler registration
    server/         Embedded desktop LAN web server (HTTP + WS)
  preload/          Electron contextBridge API
  renderer/         React + TypeScript UI
  shared/           Shared types/constants/geo helpers
web/
  server/           Standalone Express + WebSocket server (Docker target)
  client/           Browser client adapter (WS + REST)
resources/
  platform-tools/   Windows ADB binaries (optional bundle)
  platform-tools-linux/ Optional notes for custom Linux adb bundling
tests/
  unit/             Vitest unit tests
  integration/      WebSocket integration tests
```

### Tech Stack

- Electron 33, React 19, TypeScript
- Vite / electron-vite, esbuild
- Tailwind CSS v3, Zustand, react-leaflet
- better-sqlite3, Express (standalone web), ws

### Compatibility & Disclaimer

GPS spoofing can violate Terms of Service of location-based games and services.
Use at your own risk.

### License

MIT

---

## 繁體中文

### 概述

這是一個透過 ADB 進行 Android GPS 偽裝的開源工具，手機端不需安裝 App。

目前有兩種執行模式：
- Electron 桌面版（Windows / Linux）
- 獨立 Web 伺服器（Docker + 瀏覽器）

### 目前實作功能

**位置控制**
- 地圖點選或座標輸入瞬移
- 已有偽裝位置時，1 公里內可平滑走位瞬移
- 搖桿模式（虛擬搖桿、`W/A/S/D`、方向鍵）
- 多點路線自動行走
- GPX 匯入（超過 1000 點會自動降採樣）
- 路線結束策略：`Stop`、`Loop`、`Wander`
- 可選「路線結束後自動返回真實 GPS」

**反偵測與穩定性**
- 高斯抖動（約 10m 級別）
- 速度波動（+/-15%）
- 方向平滑化
- 冷卻時間計算
- 雙通道 keep-alive + watchdog，降低跳回真實 GPS 機率

**裝置與狀態管理**
- 多裝置同時偽裝
- USB / Wi-Fi ADB
- 每 3 秒自動輪詢裝置
- 真實 GPS 回讀（以 network provider 優先）
- 收藏地點 + 最近 100 筆歷史
- Session 設定持久化
- `Stop All` 三種模式：
  - `stay`：停止移動但維持 mock GPS
  - `graceful`：走回真實 GPS 再停止
  - `immediate`：立即移除 mock provider

**架構**
- 桌面版含系統匣
- 桌面版內建 LAN Web 入口（預設 `3388`）
- Docker 獨立 Web（預設 `3000`）

### 系統需求

**桌面版**
- Windows 10/11 或 Linux x64
- ADB 可用系統 PATH，或用資源檔打包

**打包 ADB 資源目錄**
- Windows：`resources/platform-tools/`
- Linux：預設走系統 `PATH` 的 `adb`（目前不預設打包 Linux adb）

**Docker Web**
- 需要 `--privileged` + `/dev/bus/usb` 掛載
- 建議掛載 `/data` 做持久化

**Android**
- 建議 Android 12+
- 開啟 USB 偵錯

### 安裝

#### 桌面版

```bash
git clone https://github.com/choupeanut/android-adb-gps-spoofer.git
cd android-adb-gps-spoofer
pnpm install
pnpm dev
pnpm dist:win
pnpm dist:linux
```

#### Docker（獨立 Web）

```bash
docker run -d \
  --name android-adb-gps-spoofer \
  -p 3000:3000 \
  --privileged \
  -v /dev/bus/usb:/dev/bus/usb \
  -v gps-spoofer-data:/data \
  choupeanut/android-adb-gps-spoofer:latest
```

### 使用流程（USB）

1. 啟用開發者模式與 USB 偵錯
2. USB 連線並在手機上允許偵錯
3. 在裝置卡片按 `Setup GPS`
4. 使用 Teleport / Joystick / Route / GPX
5. 需要停止時可用單一功能停止或 `Stop All`

### Wi-Fi ADB 流程

1. 先 USB 一次，點 `Enable TCP/IP`
2. 輸入手機 LAN IP 連線
3. 同網段可重連；重開機通常要重新做 TCP/IP 啟用

### Synology / Container Manager 注意事項

- 容器需開 `privileged` 並掛載 USB bus，否則多半無法操作 USB ADB。
- `/data` 請掛到 NAS Volume 做資料保留。
- 建議僅在內網開放 `3000`。

### 開發

```bash
pnpm install
pnpm dev
pnpm build
pnpm test

node build-server.cjs
npx vite build --config vite.web.config.ts
PORT=3000 DATA_DIR=./data node dist/server/index.js
```

### 授權

MIT
