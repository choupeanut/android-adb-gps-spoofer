# GPS Spoofing Android App — 技術規格文件

## 專案目標

開發一個 Android APP，能在**不依賴外部電腦**的情況下，透過本機 ADB 連線執行 GPS Spoofing（`geo fix`），且注入的座標**不會觸發 `isFromMockProvider` flag**，可繞過其他 APP 的 Mock Location 偵測機制。

---

## 背景知識與技術選型理由

### 為什麼不用 Mock Location APP？

一般 Mock Location APP 走 Android `LocationManager.addTestProvider()` API，注入的座標會帶有：
```
location.isFromMockProvider == true   // API 18+
location.isMock == true              // API 31+
```
目標 APP 只要呼叫這個 flag 就能偵測到，無法用於測試真實定位行為。

### 為什麼 ADB `geo fix` 不會被偵測？

ADB 的 `geo fix` 指令透過 NMEA / LocationManager 底層直接注入，**不設置 mock flag**，所以偵測機制失效。這是本專案採用 ADB 方案的核心原因。

### 為什麼不用外部電腦執行 ADB？

USB 連線不方便，WiFi ADB 需要電腦在同一網路。目標是讓手機**獨立運作**，APP 內嵌 ADB client，透過 localhost 連線到手機自身的 `adbd`。

---

## 系統架構

```
┌──────────────────────────────────────────┐
│           GPS Spoofing APP               │
│                                          │
│  ┌──────────────┐   ┌─────────────────┐  │
│  │  ADB Manager │   │   GPS UI        │  │
│  │  (內嵌binary)│   │  座標輸入/路線   │  │
│  └──────┬───────┘   └─────────────────┘  │
│         │                                │
│  ┌──────▼───────┐                        │
│  │ Network      │                        │
│  │ Detector     │  偵測可用 IP 介面       │
│  └──────┬───────┘                        │
└─────────┼────────────────────────────────┘
          │ TCP 連線 (localhost 或 hotspot IP)
          ▼
┌─────────────────────────────────────────┐
│         adbd (Android 系統層)            │
│  需要「開發者選項 > 無線偵錯」已開啟       │
└─────────────────────────────────────────┘
```

---

## 前置條件（使用者需手動完成一次）

1. 開啟「開發者選項」
2. 開啟「無線偵錯（Wireless Debugging）」
3. **首次配對**：用外部電腦執行一次：
   ```bash
   adb tcpip 5555
   ```
   Android 11+ 需額外走 TLS 配對流程（見下方說明）

完成後，日常使用**只需要手機本身**。

---

## 網路介面策略（核心限制）

### 問題
`adbd` 需要綁定到一個有效的網路介面 IP 才能監聽。**沒有 WiFi 或熱點 = 沒有 IP = ADB 連線失敗。**

### 解法：優先順序偵測

APP 啟動時依序嘗試以下介面：

| 優先順序 | 介面類型 | 典型 IP | 說明 |
|---------|---------|---------|------|
| 1 | WiFi（已連線） | 192.168.x.x | 最穩定 |
| 2 | 手機熱點（Hotspot） | 192.168.43.1 | 無需外部 WiFi |
| 3 | USB Tethering | 192.168.42.129 | 需插 USB |
| 4 | localhost | 127.0.0.1 | 部分裝置可用 |

**推薦方案：開手機熱點（不需要任何裝置連入）**
手機開熱點後會建立虛擬網路介面（`ap0` / `wlan1`），`adbd` 可以綁定，APP 連線到 `192.168.43.1:5555`。

---

## 實作規格

### 1. ADB Binary 內嵌

將 `adb` binary 打包進 APP assets，支援多架構：

```
assets/
├── adb_arm64-v8a
├── adb_armeabi-v7a
└── adb_x86_64
```

啟動時複製到 app 私有目錄並賦予執行權限：

```kotlin
class AdbBinaryManager(private val context: Context) {

    val adbBinary: File by lazy {
        val abi = Build.SUPPORTED_ABIS[0]
        File(context.filesDir, "adb").also { file ->
            if (!file.exists()) {
                context.assets.open("adb_$abi")
                    .use { input -> file.outputStream().use { input.copyTo(it) } }
                file.setExecutable(true)
            }
        }
    }
}
```

> **注意**：adb binary 可從 Android SDK Platform-Tools 中取得，針對各架構編譯。

---

### 2. 網路介面偵測

```kotlin
class NetworkInterfaceDetector {

    fun detectAdbHost(): String? {
        // 優先嘗試 WiFi
        getWifiIp()?.let { return it }

        // 嘗試熱點 IP
        if (isHotspotIp("192.168.43.1")) return "192.168.43.1"

        // 嘗試 USB Tethering
        if (isHotspotIp("192.168.42.129")) return "192.168.42.129"

        // 最後嘗試 localhost
        return "127.0.0.1"
    }

    private fun getWifiIp(): String? {
        val wifiManager = context.getSystemService(Context.WIFI_SERVICE) as WifiManager
        val ip = wifiManager.connectionInfo.ipAddress
        if (ip == 0) return null
        return String.format(
            "%d.%d.%d.%d",
            ip and 0xff, ip shr 8 and 0xff, ip shr 16 and 0xff, ip shr 24 and 0xff
        )
    }

    private fun isHotspotIp(ip: String): Boolean {
        return try {
            NetworkInterface.getNetworkInterfaces().asSequence()
                .flatMap { it.inetAddresses.asSequence() }
                .any { it.hostAddress == ip }
        } catch (e: Exception) { false }
    }
}
```

---

### 3. ADB 連線管理

```kotlin
class AdbManager(
    private val context: Context,
    private val binaryManager: AdbBinaryManager,
    private val networkDetector: NetworkInterfaceDetector
) {
    private var connectedHost: String? = null
    private val adb get() = binaryManager.adbBinary.absolutePath

    fun connect(): Result<String> {
        val host = networkDetector.detectAdbHost()
            ?: return Result.failure(Exception("找不到可用的網路介面"))

        val output = runCommand("$adb connect $host:5555")
        return if (output.contains("connected")) {
            connectedHost = host
            Result.success(host)
        } else {
            Result.failure(Exception("連線失敗：$output"))
        }
    }

    fun spoofGPS(lat: Double, lon: Double): Result<Unit> {
        val host = connectedHost
            ?: return Result.failure(Exception("尚未連線，請先呼叫 connect()"))

        // geo fix 的參數順序是 longitude latitude
        val output = runCommand("$adb -H $host -P 5555 shell geo fix $lon $lat")
        return if (!output.contains("error", ignoreCase = true)) {
            Result.success(Unit)
        } else {
            Result.failure(Exception("GPS 注入失敗：$output"))
        }
    }

    fun disconnect() {
        connectedHost?.let { runCommand("$adb disconnect $it:5555") }
        connectedHost = null
    }

    fun isConnected(): Boolean = connectedHost != null

    private fun runCommand(cmd: String): String {
        return try {
            val process = Runtime.getRuntime().exec(cmd)
            val output = process.inputStream.bufferedReader().readText()
            val error = process.errorStream.bufferedReader().readText()
            process.waitFor()
            output + error
        } catch (e: Exception) {
            "error: ${e.message}"
        }
    }
}
```

---

### 4. Android 11+ TLS 配對處理

Android 11 以後，「無線偵錯」改為 TLS 配對機制，配對 port 每次隨機產生。

#### 配對流程

使用者需在 APP 內手動輸入配對資訊（APP 無法自動取得）：

1. 手機開啟「開發者選項 > 無線偵錯 > 使用配對碼配對裝置」
2. 畫面顯示 `IP:port` 與 6 位配對碼
3. 使用者在 APP 內輸入這些資訊

```kotlin
fun pairDevice(pairingAddress: String, pairingCode: String): Result<Unit> {
    // pairingAddress 格式：192.168.43.1:37159（port 每次不同）
    val output = runCommand("$adb pair $pairingAddress $pairingCode")
    return if (output.contains("Successfully paired")) {
        Result.success(Unit)
    } else {
        Result.failure(Exception("配對失敗：$output"))
    }
}
```

#### UI 引導設計

```
┌─────────────────────────────────────┐
│  首次設定（Android 11+）             │
│                                     │
│  1. 開啟「無線偵錯」                  │
│  2. 點選「使用配對碼配對裝置」         │
│  3. 輸入畫面顯示的資訊：              │
│                                     │
│  IP:Port  [ 192.168.43.1:_____ ]    │
│  配對碼   [ ______            ]     │
│                                     │
│           [ 開始配對 ]               │
└─────────────────────────────────────┘
```

> **注意**：配對完成後，只要「無線偵錯」保持開啟，後續連線**不需要再次配對**。但若關閉再開啟無線偵錯，port 會改變，需重新配對。

---

### 5. GPS Spoofing Service

```kotlin
class GpsSpoofingService(private val adbManager: AdbManager) {

    data class Location(val lat: Double, val lon: Double, val label: String = "")

    private var isRunning = false
    private var continuousJob: Job? = null

    // 單次注入
    suspend fun setLocation(location: Location): Result<Unit> =
        withContext(Dispatchers.IO) {
            adbManager.spoofGPS(location.lat, location.lon)
        }

    // 連續模擬移動路線
    fun startRoute(
        waypoints: List<Location>,
        intervalMs: Long = 1000L,
        onProgress: (Location) -> Unit
    ) {
        isRunning = true
        continuousJob = CoroutineScope(Dispatchers.IO).launch {
            for (point in waypoints) {
                if (!isRunning) break
                adbManager.spoofGPS(point.lat, point.lon)
                onProgress(point)
                delay(intervalMs)
            }
        }
    }

    fun stopRoute() {
        isRunning = false
        continuousJob?.cancel()
    }
}
```

---

### 6. 主要 UI 功能規劃

```
MainActivity
├── 連線狀態列
│   ├── 顯示目前連線介面（WiFi / Hotspot / USB / Localhost）
│   ├── 連線 / 斷線按鈕
│   └── Android 11+ 配對入口
│
├── 座標輸入區
│   ├── 緯度（Latitude）輸入框
│   ├── 經度（Longitude）輸入框
│   ├── 地圖選點（選用）
│   └── [注入座標] 按鈕
│
├── 路線模擬區
│   ├── 預設地點清單（快速選擇）
│   ├── 移動間隔設定（ms）
│   ├── [開始路線] / [停止] 按鈕
│   └── 目前座標顯示
│
└── 設定頁
    ├── ADB Port（預設 5555）
    ├── 手動指定連線 IP
    └── 自動偵測介面開關
```

---

### 7. AndroidManifest 權限

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
<!-- 偵測熱點介面用 -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

---

## 已知限制與注意事項

| 限制 | 說明 | 解決方式 |
|------|------|---------|
| 首次需要電腦 | `adb tcpip 5555` 需外部執行一次 | 這是 adbd 的設計，無法繞過 |
| 需要網路介面 | 無 WiFi 且無熱點時無法連線 | 引導使用者開熱點 |
| Android 11+ 配對 port 變動 | 每次重開無線偵錯 port 隨機 | APP 內建配對 UI |
| SELinux 限制 | 部分 ROM 可能阻擋 untrusted_app 執行 adb | 測試裝置確認，必要時考慮 root |
| adb binary 授權 | Android SDK 的 adb 有 Apache 2.0 授權 | 確認可重新分發 |

---

## 開發建議順序

1. **Phase 1**：實作 AdbBinaryManager + 基本連線測試
2. **Phase 2**：實作 NetworkInterfaceDetector，驗證各介面偵測
3. **Phase 3**：實作 `geo fix` 注入，驗證 mock flag 不被觸發
4. **Phase 4**：實作 Android 11+ TLS 配對 UI
5. **Phase 5**：實作路線模擬功能
6. **Phase 6**：UI 優化與錯誤處理

---

## 測試驗證方式

```kotlin
// 確認 mock flag 未被觸發
val locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
locationManager.requestLocationUpdates("gps", 0, 0f) { location ->
    Log.d("TEST", "isMock: ${location.isMock}")           // 應為 false
    Log.d("TEST", "isFromMockProvider: ${location.isFromMockProvider}") // 應為 false
    Log.d("TEST", "lat: ${location.latitude}, lon: ${location.longitude}")
}
```
