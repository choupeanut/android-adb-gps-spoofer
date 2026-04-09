# Android ADB GPS Spoofer

[English](#english) | [繁體中文](#繁體中文)

---

## English

### Overview

An open-source GPS location spoofing tool for Android devices, operated entirely through ADB (Android Debug Bridge). No companion app installation is required on the phone. Available as an Electron desktop application (Windows / Linux) and a standalone web server (Docker).

Designed and tested for compatibility with **Pikmin Bloom** and **Pokemon GO**.

### Key Features

**Location Control**
- Teleport -- click the map or enter coordinates to jump to any location (distances ≤ 1 km glide smoothly at walk speed, > 1 km teleport instantly)
- Joystick -- walk, cycle, or drive with a virtual joystick or WASD / arrow keys
- Route Mode -- draw multi-waypoint routes on the map or import GPX files, then auto-walk them
- Wander Mode -- randomised movement within a configurable radius while routes are paused

**Anti-Detection**
- Gaussian GPS jitter (~10 m random noise on every coordinate update)
- Speed fluctuation (+/-15% random variation on movement speed)
- Bearing smoothing (gradual direction changes, no instant snaps)
- Cooldown timer with distance-based wait time calculator (based on Pokemon GO cooldown table)

**Device Management**
- Multi-device support -- spoof GPS on multiple Android devices simultaneously
- USB and Wi-Fi ADB connections
- Automatic device discovery (polls `adb devices` every 3 seconds)
- Real GPS location readback from connected devices

**Convenience**
- Saved locations -- star favourite spots for quick recall
- Location history -- last 100 visited coordinates
- Speed presets -- Walk (1.4 m/s), Cycle (5.14 m/s), Drive (11 m/s), HSR (83.3 m/s), Plane (250 m/s), Custom
- GPX file import for pre-planned routes
- Return-to-real-GPS function that walks back at route speed before stopping

**Dual Architecture**
- Electron desktop app with native system tray
- Standalone web server accessible from any browser on the LAN (Docker deployment)

### Requirements

**Desktop (Electron)**
- Windows 10/11 or Linux (x64)
- ADB (Android Debug Bridge) -- either installed system-wide via PATH or placed in `resources/platform-tools/`

**Web Server (Docker)**
- Docker
- USB passthrough (`--privileged` flag or `/dev/bus/usb` volume mount)

**Android Device**
- Android 12 or newer (required for `cmd location` mock provider commands)
- USB Debugging enabled in Developer Options

### Installation

#### Desktop

Download the latest release from the [Releases](https://github.com/choupeanut/android-adb-gps-spoofer/releases) page:
- **Windows**: `.exe` NSIS installer
- **Linux**: `.AppImage`

Or build from source:

```bash
git clone https://github.com/choupeanut/android-adb-gps-spoofer.git
cd android-adb-gps-spoofer
pnpm install
pnpm dev          # Development mode with hot reload
pnpm dist:win     # Build Windows installer
pnpm dist:linux   # Build Linux AppImage
```

#### Docker (Web Server)

```bash
docker pull choupeanut/android-adb-gps-spoofer:latest

docker run -d \
  -p 3000:3000 \
  --privileged \
  -v /dev/bus/usb:/dev/bus/usb \
  choupeanut/android-adb-gps-spoofer:latest
```

Then open `http://<host-ip>:3000` in your browser.

Or build the Docker image locally:

```bash
git clone https://github.com/choupeanut/android-adb-gps-spoofer.git
cd android-adb-gps-spoofer
docker build -t android-adb-gps-spoofer .
docker run -d -p 3000:3000 --privileged -v /dev/bus/usb:/dev/bus/usb android-adb-gps-spoofer
```

### Usage: USB ADB Connection

1. **Enable Developer Options on Android**
   - Go to Settings > About Phone
   - Tap "Build Number" 7 times until you see "You are now a developer"
   - Return to Settings > Developer Options
   - Enable "USB Debugging"

2. **Connect via USB**
   - Plug your Android device into your computer with a USB cable
   - On the phone, accept the "Allow USB Debugging?" prompt (check "Always allow from this computer")
   - Open Android ADB GPS Spoofer -- your device will appear in the device panel

3. **Set up mock location**
   - Click "Setup GPS" on the device card -- this enables the mock location test provider
   - The device status indicator will turn green when ready

4. **Start spoofing**
   - **Teleport**: Click a point on the map, then click the "Teleport" button
   - **Joystick**: Switch to the Joystick tab, use the on-screen joystick or WASD / arrow keys
   - **Route**: Switch to the Route tab, click waypoints on the map (or import a GPX file), set speed, then press Play

### Usage: Wi-Fi ADB Connection

Wi-Fi ADB allows wireless operation after an initial USB pairing. This is useful when you want your phone to remain mobile during spoofing.

1. **Initial setup (USB required once)**
   - Connect your phone via USB and ensure USB Debugging is working
   - In the app, click "Wi-Fi" in the connection dialog
   - Click "Enable TCP/IP" -- this runs `adb tcpip 5555` to switch the phone to network mode

2. **Connect wirelessly**
   - Note your phone's IP address (Settings > Wi-Fi > your network > IP address)
   - Enter the IP address in the connection dialog and click Connect
   - You can now disconnect the USB cable

3. **Reconnect**
   - As long as the phone stays on the same Wi-Fi network with TCP/IP enabled, you can reconnect by IP
   - If the phone reboots, you need to repeat the USB TCP/IP enable step

**Note**: Wi-Fi ADB requires the phone and computer to be on the same local network.

### Compatibility with Pikmin Bloom and Pokemon GO

This tool uses Android's built-in Mock Location test provider API through ADB shell commands:

```
adb shell cmd location providers set-test-provider-location gps --location <lat>,<lng> ...
```

No root access, no modified APK, and no app installation on the phone is needed. The anti-detection system (jitter, speed fluctuation, bearing smoothing) is designed to mimic realistic GPS behaviour.

**Cooldown Table (Pokemon GO)**

| Distance | Wait Time |
|----------|-----------|
| 1 km     | 30 sec    |
| 2 km     | 1 min     |
| 5 km     | 2 min     |
| 10 km    | 5 min     |
| 25 km    | 10 min    |
| 50 km    | 20 min    |
| 100 km   | 30 min    |
| 250 km   | 45 min    |
| 500 km   | 60 min    |
| 750 km   | 80 min    |
| 1000 km  | 100 min   |
| 1500 km  | 120 min   |

The app displays a cooldown warning when teleporting distances of 500 m or more.

**Disclaimer**: GPS spoofing may violate the Terms of Service of Pikmin Bloom, Pokemon GO, and other location-based games. Use at your own risk.

### Development

```bash
pnpm install          # Install dependencies
pnpm dev              # Electron dev mode (hot reload)
pnpm build            # Build Electron app
pnpm test             # Run unit tests (Vitest)
pnpm test:watch       # Watch mode

# Web server build (for Docker)
node build-server.cjs                          # Bundle server
npx vite build --config vite.web.config.ts     # Bundle client
```

### Project Structure

```
src/
  main/             Electron main process (Node.js)
    services/       ADB, device manager, location engine, route engine, anti-detect, database
    ipc/            IPC handler registrations
    utils/          Coordinate math, cooldown calculations
  preload/          contextBridge API surface
  renderer/         React 19 + TypeScript UI
    components/     Map, controls, device, sidebar, layout, UI primitives
    stores/         Zustand state (device, location, route, UI, logs)
  shared/           Types and constants shared across all processes
web/
  server/           Express + WebSocket standalone server (Docker)
  client/           Browser client (replaces Electron preload with HTTP/WS)
tests/
  unit/             Vitest unit tests
  integration/      WebSocket integration tests
```

### Tech Stack

- Electron 33, React 19, TypeScript
- Tailwind CSS v3, Zustand, react-leaflet
- better-sqlite3, Express, WebSocket (ws)
- electron-vite (bundler), esbuild, Vite

### License

MIT

---

## 繁體中文

### 概述

一款開源的 Android GPS 位置偽裝工具，完全透過 ADB（Android Debug Bridge）操作。手機端無需安裝任何應用程式。提供 Electron 桌面應用程式（Windows / Linux）以及獨立 Web 伺服器（Docker 部署）兩種使用方式。

針對 **Pikmin Bloom** 和 **Pokemon GO** 設計並測試相容性。

### 主要功能

**位置控制**
- 瞬間移動 -- 點擊地圖或輸入座標跳轉至任何地點（距離 ≤ 1 公里時以步行速度平滑移動，> 1 公里瞬間傳送）
- 搖桿模式 -- 使用虛擬搖桿或 WASD / 方向鍵，以步行、騎車或開車速度移動
- 路線模式 -- 在地圖上繪製多點路線或匯入 GPX 檔案，自動沿路線行走
- 漫遊模式 -- 路線暫停時，在可設定的半徑內隨機移動

**反偵測機制**
- 高斯 GPS 抖動（每次座標更新加入約 10 公尺隨機噪音）
- 速度波動（移動速度 +/-15% 隨機變化）
- 方向平滑化（漸進式方向變更，避免瞬間轉向）
- 冷卻計時器，內建基於距離的等待時間計算（依據 Pokemon GO 冷卻時間表）

**裝置管理**
- 多裝置支援 -- 同時在多台 Android 裝置上進行 GPS 偽裝
- USB 與 Wi-Fi ADB 連線
- 自動裝置偵測（每 3 秒輪詢 `adb devices`）
- 從已連線裝置讀取真實 GPS 位置

**便利功能**
- 收藏地點 -- 將常用地點加入收藏，快速切換
- 位置歷史 -- 記錄最近 100 筆造訪座標
- 速度預設 -- 步行 (1.4 m/s)、騎車 (5.14 m/s)、開車 (11 m/s)、高鐵 (83.3 m/s)、飛機 (250 m/s)、自訂
- GPX 檔案匯入，適用於預先規劃的路線
- 返回真實 GPS 功能，以路線速度走回原位後停止偽裝

**雙架構**
- Electron 桌面應用，支援系統匣
- 獨立 Web 伺服器，區域網路內任何瀏覽器皆可存取（Docker 部署）

### 系統需求

**桌面版（Electron）**
- Windows 10/11 或 Linux（x64）
- ADB（Android Debug Bridge）-- 系統 PATH 中已安裝，或放置於 `resources/platform-tools/`

**Web 伺服器（Docker）**
- Docker
- USB 通透（`--privileged` 旗標或 `/dev/bus/usb` 磁碟區掛載）

**Android 裝置**
- Android 12 以上（`cmd location` 模擬位置指令所需）
- 已啟用 USB 偵錯

### 安裝

#### 桌面版

從 [Releases](https://github.com/choupeanut/android-adb-gps-spoofer/releases) 頁面下載最新版本：
- **Windows**：`.exe` NSIS 安裝程式
- **Linux**：`.AppImage`

或從原始碼建置：

```bash
git clone https://github.com/choupeanut/android-adb-gps-spoofer.git
cd android-adb-gps-spoofer
pnpm install
pnpm dev          # 開發模式，支援熱重載
pnpm dist:win     # 建置 Windows 安裝程式
pnpm dist:linux   # 建置 Linux AppImage
```

#### Docker（Web 伺服器）

```bash
docker pull choupeanut/android-adb-gps-spoofer:latest

docker run -d \
  -p 3000:3000 \
  --privileged \
  -v /dev/bus/usb:/dev/bus/usb \
  choupeanut/android-adb-gps-spoofer:latest
```

開啟瀏覽器前往 `http://<主機 IP>:3000` 即可使用。

或在本地建置 Docker 映像：

```bash
git clone https://github.com/choupeanut/android-adb-gps-spoofer.git
cd android-adb-gps-spoofer
docker build -t android-adb-gps-spoofer .
docker run -d -p 3000:3000 --privileged -v /dev/bus/usb:/dev/bus/usb android-adb-gps-spoofer
```

### 使用方式：USB ADB 連線

1. **啟用 Android 開發者選項**
   - 前往 設定 > 關於手機
   - 連續點擊「版本號碼」7 次，直到出現「您現在是開發人員」
   - 返回 設定 > 開發人員選項
   - 啟用「USB 偵錯」

2. **透過 USB 連接**
   - 使用 USB 傳輸線將 Android 裝置連接到電腦
   - 手機上會彈出「允許 USB 偵錯嗎？」提示，點選允許（勾選「一律允許從此電腦」）
   - 開啟 Android ADB GPS Spoofer，裝置將自動顯示在裝置面板中

3. **設定模擬位置**
   - 點擊裝置卡片上的「Setup GPS」，啟用模擬位置測試提供者
   - 裝置狀態指示燈變為綠色即表示就緒

4. **開始偽裝**
   - **瞬間移動**：在地圖上點擊一個位置，然後按下「Teleport」按鈕
   - **搖桿模式**：切換至 Joystick 分頁，使用螢幕搖桿或 WASD / 方向鍵
   - **路線模式**：切換至 Route 分頁，在地圖上點擊路徑點（或匯入 GPX 檔案），設定速度後按 Play

### 使用方式：Wi-Fi ADB 連線

Wi-Fi ADB 可在初次 USB 配對後進行無線操作。適用於偽裝期間需要手機保持可移動狀態的場景。

1. **初始設定（需 USB 一次）**
   - 透過 USB 連接手機，確認 USB 偵錯已正常運作
   - 在應用程式中，點擊連線對話框中的「Wi-Fi」
   - 點擊「Enable TCP/IP」，此操作會執行 `adb tcpip 5555` 將手機切換為網路模式

2. **無線連接**
   - 記下手機的 IP 位址（設定 > Wi-Fi > 目前網路 > IP 位址）
   - 在連線對話框中輸入 IP 位址，點擊 Connect
   - 此時可以拔除 USB 傳輸線

3. **重新連線**
   - 只要手機維持在同一 Wi-Fi 網路且 TCP/IP 模式未關閉，即可透過 IP 重新連線
   - 若手機重新開機，需再次透過 USB 執行 TCP/IP 啟用步驟

**注意**：Wi-Fi ADB 需要手機與電腦在同一區域網路內。

### Pikmin Bloom 和 Pokemon GO 相容性

本工具透過 ADB shell 指令使用 Android 內建的 Mock Location 測試提供者 API：

```
adb shell cmd location providers set-test-provider-location gps --location <lat>,<lng> ...
```

無需 root 權限、無需修改 APK、手機端無需安裝任何應用程式。反偵測系統（抖動、速度波動、方向平滑化）的設計旨在模擬真實的 GPS 行為。

**冷卻時間表（Pokemon GO）**

| 距離 | 等待時間 |
|------|----------|
| 1 km     | 30 秒  |
| 2 km     | 1 分鐘 |
| 5 km     | 2 分鐘 |
| 10 km    | 5 分鐘 |
| 25 km    | 10 分鐘 |
| 50 km    | 20 分鐘 |
| 100 km   | 30 分鐘 |
| 250 km   | 45 分鐘 |
| 500 km   | 60 分鐘 |
| 750 km   | 80 分鐘 |
| 1000 km  | 100 分鐘 |
| 1500 km  | 120 分鐘 |

當瞬移距離達 500 公尺以上時，應用程式會顯示冷卻時間警告。

**免責聲明**：GPS 偽裝可能違反 Pikmin Bloom、Pokemon GO 及其他位置型遊戲的服務條款。使用風險自負。

### 開發

```bash
pnpm install          # 安裝依賴
pnpm dev              # Electron 開發模式（熱重載）
pnpm build            # 建置 Electron 應用
pnpm test             # 執行單元測試（Vitest）
pnpm test:watch       # 監聽模式

# Web 伺服器建置（Docker 用）
node build-server.cjs                          # 打包伺服器
npx vite build --config vite.web.config.ts     # 打包客戶端
```

### 專案結構

```
src/
  main/             Electron 主程序（Node.js）
    services/       ADB、裝置管理、位置引擎、路線引擎、反偵測、資料庫
    ipc/            IPC 處理器註冊
    utils/          座標運算、冷卻計算
  preload/          contextBridge API 介面
  renderer/         React 19 + TypeScript 使用者介面
    components/     地圖、控制項、裝置、側邊欄、佈局、UI 元件
    stores/         Zustand 狀態管理（裝置、位置、路線、UI、日誌）
  shared/           所有程序共用的型別與常數
web/
  server/           Express + WebSocket 獨立伺服器（Docker）
  client/           瀏覽器客戶端（以 HTTP/WS 取代 Electron preload）
tests/
  unit/             Vitest 單元測試
  integration/      WebSocket 整合測試
```

### 技術棧

- Electron 33、React 19、TypeScript
- Tailwind CSS v3、Zustand、react-leaflet
- better-sqlite3、Express、WebSocket (ws)
- electron-vite（打包工具）、esbuild、Vite

### 授權

MIT
