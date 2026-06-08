# Android ADB GPS Spoofer

[English](#english) | [繁體中文](#繁體中文)

---

## English

### Overview

Android ADB GPS Spoofer controls Android GPS test-provider coordinates from a desktop app or a LAN web UI. It talks to Android devices through ADB, so the target phone does not need a separate companion app.

Runtime modes:

- **Electron desktop**: Windows/Linux/macOS app with local IPC, tray support, and an embedded LAN web server on port `3388`.
- **Standalone web server**: Docker-friendly Express + WebSocket server. The container listens on `3000`; examples map it to host port `3001` to avoid the existing CISSP site on host port `3000`.

The implementation is optimized for controlled Android location-testing workflows. Location spoofing can violate third-party service terms and can be detected by apps that inspect Android mock-location state. Use it only where you accept that risk.

### Implemented Features

**Device and ADB**

- USB ADB and Wi-Fi ADB (`adb tcpip 5555`, `adb connect ip:port`)
- Multi-device selection with per-device engines
- Device dropdown `Select All` / `Clear` controls for connected devices
- Wi-Fi Add Device quick buttons from the most-used recorded IPs
- ADB diagnostics, connection test, and auto polling every 3 seconds
- Android `cmd location` GPS test-provider setup through the shell user
- Wi-Fi stability hardening for TCP ADB sessions

**Location Control**

- Teleport by map click or manual latitude/longitude
- Teleport always pushes the target coordinate immediately
- Joystick mode with virtual joystick plus `W/A/S/D` and arrow keys
- Manual multi-waypoint routes
- Road-network route planning through OSRM for `walk`, `cycle`, and `drive`
- GPX import, downsampled to a maximum of 1000 points
- Route pause/resume, loop, wander radius, fixed-speed toggle, start-from-real-GPS, and return-to-real-GPS
- Loop mode always allows adding another final waypoint; loop closure is visual/playback only
- Map tile provider selector with CARTO, OSM local-label tiles, and custom tile URL support

**Stability and Realism**

- Location pushes every `500 ms` (`UPDATE_INTERVAL_MS`)
- Backup keep-alive channel every `1000 ms`
- Route push watchdog that attempts emergency recovery if recent pushes go stale
- Gaussian GPS jitter around 10 m scale
- Speed fluctuation of roughly +/-15% unless fixed-speed mode is enabled
- Bearing smoothing for route turns
- Cooldown table and warnings for long-distance jumps

**Persistence**

- SQLite-backed saved locations
- Location history capped at 100 entries
- Wi-Fi IP history for Add Device quick buttons
- Session settings for speed, route mode, loop/wander, control points, and toggles
- Desktop database path is Electron `userData` / `pikmin-keep.db`
- Web database path is `DATA_DIR/pikmin-keep.db`

### Requirements

**Desktop**

- Windows 10/11 x64, Linux x64, or macOS Universal support for Apple Silicon and Intel Macs
- Node.js 20+ and pnpm for source builds
- ADB available from `ADB_PATH`, bundled Windows/macOS resources, or system `PATH`

**Docker Web**

- Docker Engine
- USB device access through `--privileged` and `/dev/bus/usb` mount, or Wi-Fi ADB access
- Persistent `/data` volume recommended

**Android**

- Android 12+ recommended
- Developer options and USB debugging enabled
- USB data cable for initial setup

### Quick Start: Desktop

```bash
pnpm install
pnpm dev
```

Build release artifacts:

```bash
pnpm build
pnpm dist:win
pnpm dist:linux
pnpm dist:mac
```

Packaged Windows builds include ADB from `resources/platform-tools/`. Packaged macOS builds include ADB from `resources/platform-tools-mac/` after running `scripts/download-mac-adb.sh`. Linux builds use system `adb` unless `ADB_PATH` is set.

For a local macOS package, run the Mac resource preparation scripts on macOS before `pnpm dist:mac`:

```bash
./scripts/generate-mac-icon.sh
./scripts/download-mac-adb.sh
pnpm dist:mac
```

The first macOS release channel is unsigned for internal testing. If Gatekeeper blocks launch, open the app from Finder with Control-click -> Open and confirm the prompt.

Future signed/notarized macOS releases will need Apple Developer credentials in CI, typically `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` or the equivalent App Store Connect API key variables.

### Quick Start: Docker Web

```bash
docker build -t android-adb-gps-spoofer:latest .

docker run -d \
  --name android-adb-gps-spoofer \
  --privileged \
  -p 3001:3000 \
  -v /dev/bus/usb:/dev/bus/usb \
  -v gps-spoofer-data:/data \
  android-adb-gps-spoofer:latest
```

Open `http://<host-ip>:3001`.

### Device Setup Flow

1. Enable Android developer options and USB debugging.
2. Connect the phone by USB and accept the RSA prompt.
3. Click **Setup GPS** on the device card. The backend runs `appops` setup and creates/enables the `gps` test provider.
4. Use Teleport, Joystick, Route, Road Network, or GPX import.
5. Stop with the route controls or **Stop All**:
   - `stay`: stop movement and keep the current mock GPS pinned
   - `graceful`: walk back to real GPS when possible, then stop
   - `immediate`: remove the test provider immediately

### Wi-Fi ADB Flow

1. Connect by USB once.
2. Use **USB -> Wi-Fi setup** or run `adb tcpip 5555`.
3. Enter the phone LAN IP and port `5555`, then connect.
4. Successful IPs are recorded and appear as quick buttons the next time you add a device.
5. After reboot, repeat the USB `tcpip` step if Wi-Fi ADB is no longer active.

### Environment Variables

| Variable | Default | Purpose |
|---|---:|---|
| `ADB_PATH` | unset | Override the ADB binary path |
| `PORT` | `3000` | Standalone web HTTP/WebSocket port |
| `DATA_DIR` | `./data` locally, `/data` in Docker | SQLite/session/log storage directory |
| `APP_VERSION` | `dev` | Version returned by `/api/version` |
| `EXPERIMENTAL_DISABLE_REAL_GPS_ON_FAKE` | `0` | Best-effort master-location disable during spoofing |
| `ALLOW_CONTAMINATED_REAL_GPS` | `0` | Allow non-network providers for real-GPS fallback diagnostics |

### Development Commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm test:watch

# Standalone web build
node build-server.cjs
npx vite build --config vite.web.config.ts

# Run standalone web server locally
PORT=3000 DATA_DIR=./data node dist/server/index.js
```

### Project Structure

```text
src/
  main/        Electron main process, IPC, embedded LAN server, ADB/services
  preload/     Electron contextBridge window.api
  renderer/    React UI shared by Electron and web
  shared/      Shared types, constants, and geo helpers
web/
  server/      Standalone Express + WebSocket server for Docker
  client/      Browser API adapter and web entry
tests/
  unit/        Core service and utility tests
  integration/ WebSocket tests
docs/
  project-overview.md   Detailed architecture and repo analysis
  deployment.md         Docker and Portainer deployment guide
```

### License

MIT

---

## 繁體中文

### 概述

Android ADB GPS Spoofer 是一個透過 ADB 控制 Android GPS test provider 的定位測試工具。它可以用桌面 App 操作，也可以用 Docker 架一個 LAN Web UI；目標手機不需要另外安裝 companion app。

執行模式：

- **Electron 桌面版**：Windows/Linux/macOS，使用本機 IPC，含系統匣，並啟動 `3388` 的內嵌 LAN Web server。
- **獨立 Web 版**：Docker 可部署的 Express + WebSocket server。容器內使用 `3000`，範例對外映射到 host `3001`，避開目前 host `3000` 的 CISSP 網站。

此工具適合受控的 Android 定位測試流程。GPS spoofing 可能違反第三方服務條款，也可能被會檢查 Android mock-location 狀態的 App 偵測；請只在能承擔風險的情境使用。

### 已實作功能

**裝置與 ADB**

- USB ADB 與 Wi-Fi ADB
- 多裝置選取與 per-device engine
- Device dropdown 可一鍵全選/清除 connected devices
- Add Device 會顯示最常用 Wi-Fi IP 快選
- ADB 診斷、連線測試、每 3 秒輪詢裝置
- 透過 shell user 建立並啟用 Android `cmd location` GPS test provider
- TCP ADB 連線時套用 Wi-Fi 穩定性設定

**位置控制**

- 地圖點選或手動座標瞬移
- Teleport 一律立即推送目標座標
- 虛擬搖桿、`W/A/S/D`、方向鍵
- 手動多點路線
- OSRM road-network 路線規劃：`walk`、`cycle`、`drive`
- GPX 匯入，超過 1000 點會降採樣
- 暫停/恢復、循環、結束後 wander、固定速度、從真實 GPS 開始、返回真實 GPS
- Loop 模式下不再因為靠近第一點而阻止新增最後 waypoint
- 地圖圖磚可切換 CARTO、OSM local labels，或輸入自訂 tile URL

**穩定性與擬真**

- 主要位置推送每 `500 ms`
- 備援 keep-alive 每 `1000 ms`
- Route watchdog 在推送停滯時做 emergency push
- 約 10 m 級別的高斯 GPS 抖動
- 非固定速度模式下有約 +/-15% 速度波動
- 路線轉向 bearing smoothing
- 長距離跳躍 cooldown 表與提示

**持久化**

- SQLite 收藏地點
- 最近位置歷史最多 100 筆
- Add Device Wi-Fi IP history
- Session 保存速度、路線模式、loop/wander、控制點與 toggle
- 桌面版資料庫：Electron `userData` 下的 `pikmin-keep.db`
- Web 版資料庫：`DATA_DIR/pikmin-keep.db`

### 系統需求

**桌面版**

- Windows 10/11 x64、Linux x64，或支援 Apple Silicon 與 Intel Mac 的 macOS Universal build
- 從原始碼執行需 Node.js 20+ 與 pnpm
- ADB 來源可為 `ADB_PATH`、Windows/macOS bundled resource，或系統 `PATH`

**Docker Web**

- Docker Engine
- USB ADB 需要 `--privileged` 與 `/dev/bus/usb` mount；也可走 Wi-Fi ADB
- 建議掛載 `/data` 做資料持久化

**Android**

- 建議 Android 12+
- 開啟開發者選項與 USB 偵錯
- 初次設定需要可傳資料的 USB 線

### 桌面版快速開始

```bash
pnpm install
pnpm dev
```

打包：

```bash
pnpm build
pnpm dist:win
pnpm dist:linux
pnpm dist:mac
```

Windows packaged build 會從 `resources/platform-tools/` 打包 ADB；macOS packaged build 會在執行 `scripts/download-mac-adb.sh` 後從 `resources/platform-tools-mac/` 打包 ADB；Linux 預設使用系統 `adb`，除非設定 `ADB_PATH`。

本機打包 macOS 版時，需在 macOS 上先準備 Mac 資源：

```bash
./scripts/generate-mac-icon.sh
./scripts/download-mac-adb.sh
pnpm dist:mac
```

第一版 macOS release 是 unsigned 內測版。如果 Gatekeeper 阻擋啟動，請在 Finder 對 App Control-click -> Open，並確認提示。

未來若要改成正式簽章與公證，需要在 CI 補 Apple Developer credentials，常見變數包含 `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`，或等效的 App Store Connect API key 變數。

### Docker Web 快速開始

```bash
docker build -t android-adb-gps-spoofer:latest .

docker run -d \
  --name android-adb-gps-spoofer \
  --privileged \
  -p 3001:3000 \
  -v /dev/bus/usb:/dev/bus/usb \
  -v gps-spoofer-data:/data \
  android-adb-gps-spoofer:latest
```

開啟 `http://<host-ip>:3001`。

### 裝置設定流程

1. 開啟 Android 開發者選項與 USB 偵錯。
2. USB 連線並在手機上允許 RSA prompt。
3. 在裝置卡片按 **Setup GPS**。後端會執行 `appops` 設定並建立/啟用 `gps` test provider。
4. 使用 Teleport、Joystick、Route、Road Network 或 GPX。
5. 停止時可用路線控制或 **Stop All**：
   - `stay`：停止移動但保留目前 mock GPS
   - `graceful`：可行時走回真實 GPS，再停止
   - `immediate`：立即移除 test provider

### Wi-Fi ADB 流程

1. 先用 USB 連線一次。
2. 使用 **USB -> Wi-Fi setup**，或執行 `adb tcpip 5555`。
3. 輸入手機 LAN IP 與 port `5555` 後連線。
4. 成功使用過的 IP 會自動記錄，下次 Add Device 會出現快選按鈕。
5. 手機重開機後通常需要重新做 USB `tcpip`。

### 授權

MIT
