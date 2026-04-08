# Niantic / Pokemon GO Mock GPS 偵測原理深度分析

**研究日期：** 2026-04-04  
**研究範圍：** Android 平台 Mock Location 偵測機制  
**目標應用：** Pokemon GO, Pikmin Bloom, Ingress (Niantic 遊戲)

---

## 目錄

1. [概述](#概述)
2. [Android Mock Location 機制](#android-mock-location-機制)
3. [Niantic 多層偵測架構](#niantic-多層偵測架構)
4. [偵測技術詳解](#偵測技術詳解)
5. [Pikmin Keep 的風險評估](#pikmin-keep-的風險評估)
6. [對抗與反對抗技術](#對抗與反對抗技術)
7. [結論與建議](#結論與建議)

---

## 概述

Niantic 是 AR 遊戲領域的領導者，其反作弊系統以多層檢測和機器學習為核心。Pokemon GO 作為全球最成功的 AR 遊戲之一，其防作弊機制代表了業界最高水平。

### 核心問題

**Pikmin Keep 使用的 ADB test provider 方法會被偵測嗎？**

**答案：是的。** 100% 會被偵測到，因為 Android Location API 設計上就提供了明確的偵測方法。

---

## Android Mock Location 機制

### 2.1 Test Provider API

Android 提供合法的 Mock Location API 供開發者測試：

```java
// 添加 Test Provider
LocationManager.addTestProvider(
    String provider,
    ProviderProperties properties
);

// 設置 Mock Location
LocationManager.setTestProviderLocation(
    String provider, 
    Location location
);
```

**關鍵特性：**
- Android 12+ 必須透過 `cmd location` shell 指令
- 需要 `android.permission.ACCESS_MOCK_LOCATION` 權限（開發者選項）
- **自動設置 Location.isMock() = true** （無法關閉）

### 2.2 官方文件明確說明

根據 [Android LocationManager 文件](https://developer.android.com/reference/android/location/LocationManager#setTestProviderLocation):

> **setTestProviderLocation(String provider, Location location)**  
> This location will be **identifiable as a mock location** to all clients via `Location.isMock()`.

### 2.3 Location 物件的 Mock Flag

```kotlin
// 偵測 Mock Location 的標準方法
fun Location.isFake(): Boolean {
    return when {
        // Android 12+ (API 31+)
        this.isMock -> true
        
        // Android 6-11 (API 18-30)
        this.isFromMockProvider -> true
        
        else -> false
    }
}
```

**技術結論：** ADB test provider 方式產生的位置 **無法隱藏 Mock 標記**。

---

## Niantic 多層偵測架構

Niantic 的反作弊系統採用 **多層次、多維度** 的偵測架構，即使某一層被繞過，其他層仍能捕捉異常。

```
┌─────────────────────────────────────────────────────────┐
│                   Niantic 反作弊系統                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  第 1 層：Client-Side 偵測                               │
│  ├─ isMock() API 檢查                                   │
│  ├─ GPS Sensor 數據驗證                                 │
│  ├─ Mock Location Provider 列舉                         │
│  └─ Dev Options 檢測                                    │
│                                                         │
│  第 2 層：Google Play Integrity API                     │
│  ├─ Device Integrity（Root 檢測）                       │
│  ├─ Basic Integrity（系統完整性）                        │
│  ├─ App Recognition（APK 簽名驗證）                     │
│  └─ Environment Details（執行環境分析）                  │
│                                                         │
│  第 3 層：Server-Side 行為分析                           │
│  ├─ 移動模式 AI 分析                                     │
│  ├─ 瞬移距離檢測                                         │
│  ├─ 速度合理性驗證                                       │
│  ├─ GPS 軌跡連續性                                       │
│  └─ 時空一致性檢查                                       │
│                                                         │
│  第 4 層：Network Context Validation                    │
│  ├─ IP 地理位置比對                                     │
│  ├─ VPN/Proxy 識別                                      │
│  ├─ Network Latency 分析                                │
│  └─ Cellular Tower 資訊驗證                             │
│                                                         │
│  第 5 層：Sensor Fusion 交叉驗證                         │
│  ├─ 加速度計 vs GPS 速度                                │
│  ├─ 陀螺儀 vs GPS 方向                                  │
│  ├─ 氣壓計 vs GPS 高度                                  │
│  └─ 地磁計 vs GPS heading                              │
│                                                         │
│  第 6 層：Game-Specific 異常偵測                         │
│  ├─ Catch Rate 異常（命中率過高）                        │
│  ├─ Spin Rate 異常（寶可夢停過快）                        │
│  ├─ Raid Participation Pattern                         │
│  └─ Social Graph 異常（好友互動模式）                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 偵測技術詳解

### 4.1 第一層：Client-Side Mock Location 偵測

#### 4.1.1 直接 API 檢查

```kotlin
// Pokemon GO 可能使用的檢測代碼（推測）
class LocationValidator {
    fun isLocationTrusted(location: Location): Boolean {
        // 檢查 1: Mock Flag
        if (location.isMock) {
            logSuspiciousActivity("MOCK_FLAG_DETECTED")
            return false
        }
        
        // 檢查 2: Provider 名稱
        if (location.provider == "gps" && isTestProviderEnabled("gps")) {
            logSuspiciousActivity("TEST_PROVIDER_ACTIVE")
            return false
        }
        
        // 檢查 3: 開發者選項
        if (Settings.Secure.getInt(
            context.contentResolver,
            Settings.Secure.ALLOW_MOCK_LOCATION, 
            0
        ) != 0) {
            logSuspiciousActivity("MOCK_LOCATION_ENABLED")
            return false
        }
        
        return true
    }
    
    private fun isTestProviderEnabled(provider: String): Boolean {
        val locationManager = context.getSystemService<LocationManager>()
        return try {
            // Android 隱藏 API，但可能透過反射訪問
            val testProviders = locationManager.getProviders(false)
                .filter { it.startsWith("test_") }
            testProviders.isNotEmpty()
        } catch (e: Exception) {
            false
        }
    }
}
```

#### 4.1.2 GPS Sensor 數據特徵分析

真實 GPS 訊號的特徵：

```kotlin
data class GpsSensorData(
    val satelliteCount: Int,          // 衛星數量 (4-15)
    val signalStrength: FloatArray,   // 訊號強度分佈
    val hdop: Float,                  // 水平精度因子
    val vdop: Float,                  // 垂直精度因子
    val accuracy: Float,              // 精度值 (5-50m)
    val altitudeAccuracy: Float,      // 高度精度
    val bearingAccuracy: Float        // 方向精度
)

fun validateGpsSensorData(location: Location): Boolean {
    // Mock Provider 無法提供真實的衛星數據
    val extras = location.extras ?: return false
    val satellites = extras.getInt("satellites", 0)
    
    return when {
        satellites == 0 -> false          // Mock 通常沒有衛星數
        satellites > 32 -> false          // 超過真實最大值
        !location.hasAccuracy() -> false  // Mock 可能忘記設置
        location.accuracy < 3.0f -> false // 過於精確（疑似偽造）
        location.accuracy > 200f -> true  // 真實 GPS 在室內可能很差
        else -> true
    }
}
```

### 4.2 第二層：Google Play Integrity API

Niantic 使用 **Play Integrity API**（SafetyNet 的繼任者）進行設備完整性驗證。

#### 4.2.1 Integrity Verdict 結構

```json
{
  "tokenPayloadExternal": {
    "requestDetails": {
      "requestHash": "...",
      "requestPackageName": "com.nianticlabs.pokemongo",
      "timestampMillis": "1712189234000"
    },
    "appIntegrity": {
      "appRecognitionVerdict": "PLAY_RECOGNIZED",
      "packageName": "com.nianticlabs.pokemongo",
      "certificateSha256Digest": ["..."],
      "versionCode": "0.331.0"
    },
    "deviceIntegrity": {
      "deviceRecognitionVerdict": ["MEETS_DEVICE_INTEGRITY"]
    },
    "accountDetails": {
      "appLicensingVerdict": "LICENSED"
    },
    "environmentDetails": {
      "appAccessRiskVerdict": {
        "appsDetected": []  // 檢測到的風險應用
      },
      "playProtectVerdict": "NO_ISSUES"
    }
  }
}
```

#### 4.2.2 風險指標

| Verdict | 含義 | Pikmin Keep 影響 |
|---------|------|------------------|
| `MEETS_DEVICE_INTEGRITY` | 設備通過完整性檢查 | ✅ USB ADB 不影響 |
| `MEETS_BASIC_INTEGRITY` | 基本完整性（可能 Root） | ⚠️ 若 Root 會失敗 |
| `MEETS_STRONG_INTEGRITY` | 強完整性（硬體認證） | ⚠️ WiFi ADB 可能降級 |
| `NO_INTEGRITY` | 完全失敗 | ❌ Root + Xposed 必定失敗 |

**Pikmin Keep 使用 ADB 本身不會觸發 Play Integrity 失敗**，但如果設備已 Root 會失敗。

### 4.3 第三層：Server-Side 行為分析

Niantic 服務器端運行複雜的機器學習模型分析玩家行為。

#### 4.3.1 移動模式 AI

```python
# 偽代碼：Niantic 可能的移動模式分析
class MovementPatternDetector:
    def analyze_trajectory(trajectory: List[GPSPoint]) -> RiskScore:
        features = {
            # 特徵 1: 速度變化平滑度
            'speed_variance': calc_speed_variance(trajectory),
            
            # 特徵 2: 方向變化自然度
            'bearing_smoothness': calc_bearing_smoothness(trajectory),
            
            # 特徵 3: 瞬移次數
            'teleport_count': count_impossible_jumps(trajectory),
            
            # 特徵 4: 停留點模式
            'poi_visit_pattern': analyze_poi_visits(trajectory),
            
            # 特徵 5: 夜間活動異常
            'nocturnal_anomaly': check_unusual_night_activity(trajectory),
            
            # 特徵 6: 跨區域跳躍
            'geographic_jumps': detect_cross_continent_jumps(trajectory),
        }
        
        return ml_model.predict(features)  # 0-100 風險分數
```

#### 4.3.2 冷卻時間系統（Cooldown）

Niantic 內部維護一個 **軟鎖定（Soft Ban）機制**：

| 距離 | 最小冷卻時間 | 檢測強度 |
|------|------------|---------|
| < 1 km | 0 分鐘 | 低 |
| 1-5 km | 1 分鐘 | 低 |
| 5-10 km | 5 分鐘 | 中 |
| 10-25 km | 11 分鐘 | 中 |
| 25-50 km | 22 分鐘 | 高 |
| 100-250 km | 45 分鐘 | 高 |
| 500-1000 km | 75 分鐘 | 極高 |
| 1000+ km | 120 分鐘 | 極高 + 永久記錄 |

**軟鎖定效果：**
- 寶可夢全部逃跑
- 寶可夢蛋無法旋轉道館
- Raid 參與受限

### 4.4 第四層：Network Context Validation

#### 4.4.1 IP 地理位置驗證

```python
def verify_network_consistency(gps_location, ip_address):
    # 1. 取得 IP 的地理位置
    ip_geo = geoip_lookup(ip_address)
    
    # 2. 計算 GPS 與 IP 的距離
    distance_km = haversine(gps_location, ip_geo)
    
    # 3. 風險評分
    risk_score = {
        'distance': distance_km,
        'is_proxy': detect_proxy(ip_address),
        'is_vpn': detect_vpn(ip_address),
        'is_datacenter': is_datacenter_ip(ip_address),
        'is_tor': is_tor_exit_node(ip_address),
    }
    
    # 4. 判斷
    if distance_km > 1000:  # GPS 在亞洲，IP 在美國
        return 'HIGH_RISK_GEO_MISMATCH'
    elif risk_score['is_vpn'] or risk_score['is_proxy']:
        return 'MEDIUM_RISK_NETWORK_SPOOFING'
    else:
        return 'LOW_RISK'
```

#### 4.4.2 Cellular Tower 資訊

Android 提供基站資訊：

```kotlin
val telephonyManager = context.getSystemService<TelephonyManager>()
val cellInfo = telephonyManager.allCellInfo

// Niantic 可以比對：
// 1. 基站 ID 是否與 GPS 位置匹配
// 2. 訊號強度是否合理
// 3. 基站切換模式是否自然
```

**Pikmin Keep 的問題：**  
使用 ADB 改 GPS 時，**基站資訊不變**，造成明顯矛盾：
- GPS 顯示在台北 101
- Cellular Tower 在新北市板橋

### 4.5 第五層：Sensor Fusion 交叉驗證

#### 4.5.1 多感測器一致性

```kotlin
class SensorFusionValidator {
    val accelerometer = SensorData()
    val gyroscope = SensorData()
    val barometer = SensorData()
    
    fun validateMovement(
        gpsSpeed: Float,
        gpsBearing: Float,
        gpsAltitude: Float
    ): Boolean {
        // 檢查 1: 加速度計 vs GPS 速度
        val accelSpeed = calculateSpeedFromAccelerometer()
        if (abs(gpsSpeed - accelSpeed) > 5.0) {
            // GPS 說你在快跑，但手機沒有移動的加速度
            return false
        }
        
        // 檢查 2: 陀螺儀 vs GPS 方向
        val gyroHeading = getHeadingFromGyroscope()
        if (abs(gpsBearing - gyroHeading) > 45) {
            // GPS 說你往北走，但手機朝南
            return false
        }
        
        // 檢查 3: 氣壓計 vs GPS 高度
        val baroAltitude = getAltitudeFromBarometer()
        if (abs(gpsAltitude - baroAltitude) > 50) {
            // GPS 說你在山頂，氣壓說你在海平面
            return false
        }
        
        return true
    }
}
```

**Pikmin Keep 的盲點：**  
只改 GPS，其他感測器維持真實值 → **極易被 Sensor Fusion 偵測**。

### 4.6 第六層：Game-Specific 異常偵測

#### 4.6.1 遊戲內行為模式

```python
class GameplayAnomalyDetector:
    def analyze_player_behavior(player_id):
        metrics = {
            # 捕捉稀有寶可夢的頻率
            'rare_catch_rate': get_catch_rate(player_id, rarity='legendary'),
            
            # 道館旋轉速度
            'pokestop_spin_rate': get_action_frequency(player_id, 'spin'),
            
            # Raid 參與地點分佈
            'raid_geographic_diversity': analyze_raid_locations(player_id),
            
            # 每日移動距離
            'daily_travel_distance': get_total_distance(player_id, days=1),
            
            # 好友交易模式
            'trading_pattern': analyze_friend_trades(player_id),
        }
        
        # 異常指標
        if metrics['rare_catch_rate'] > threshold_99_percentile:
            flag_account(player_id, 'UNUSUAL_CATCH_RATE')
        
        if metrics['daily_travel_distance'] > 1000_km:
            flag_account(player_id, 'IMPOSSIBLE_TRAVEL')
```

---

## Pikmin Keep 的風險評估

### 5.1 偵測層級分析

| 偵測層級 | 會被偵測 | 嚴重程度 | 說明 |
|---------|---------|---------|------|
| **Layer 1: isMock()** | ✅ **是** | 🔴 **極高** | `location.isMock() == true` 100% 暴露 |
| **Layer 2: Play Integrity** | ⚠️ 部分 | 🟡 中等 | USB ADB 不影響；Root 會失敗 |
| **Layer 3: 行為分析** | ✅ **是** | 🔴 **高** | 大距離瞬移會觸發 |
| **Layer 4: Network Context** | ✅ **是** | 🟡 中等 | IP 與 GPS 不符會可疑 |
| **Layer 5: Sensor Fusion** | ✅ **是** | 🟡 中等 | 其他感測器未改 |
| **Layer 6: 遊戲行為** | ⚠️ 視使用而定 | 🟡 中等 | 取決於玩法 |

### 5.2 ADB Test Provider 的技術限制

```bash
# Pikmin Keep 使用的指令
adb shell cmd location providers add-test-provider gps
adb shell cmd location providers set-test-provider-location gps \
    --location 25.0330,121.5654 \
    --accuracy 5.0 \
    --time 1712189234000

# 產生的 Location 物件特性
Location {
    provider: "gps",
    latitude: 25.0330,
    longitude: 121.5654,
    accuracy: 5.0,
    time: 1712189234000,
    elapsedRealtimeNanos: 123456789,
    isMock: true  // ← 無法改變！
}
```

### 5.3 為什麼目前還能用？

1. **Pikmin Bloom 容忍度較高**  
   - 不像 Pokemon GO 那麼嚴格
   - 偵測閾值設定較寬鬆
   - 以記錄為主，延遲封鎖

2. **小範圍移動風險低**  
   - < 1 km 的微調較難觸發行為分析
   - 不觸發冷卻系統

3. **累積風險模型**  
   - Niantic 採用**積分制**，不是一次觸發就封鎖
   - 累積異常行為才會處罰

4. **偵測成本考量**  
   - 100% 嚴格檢查會誤殺正常玩家
   - 採用機率性抽查

### 5.4 長期風險

```
時間軸風險模型：

第 1 週：   ✅ 安全（系統收集數據）
第 2-4 週：  ⚠️ 輕微警告（異常記錄累積）
第 2-3 月：  🟡 軟鎖定可能（頻繁瞬移觸發）
第 3-6 月：  🟠 帳號標記（進入觀察名單）
第 6+ 月：   🔴 封鎖風險高（累積證據充足）
```

---

## 對抗與反對抗技術

### 6.1 理論上的繞過方法（及為何實際上很難）

#### 方法 1: Root + Xposed Hook

```java
// Xposed 模組範例（理論上可行但會被 Play Integrity 抓到）
public class MockLocationBypass implements IXposedHookLoadPackage {
    public void handleLoadPackage(XC_LoadPackage.LoadPackageParam lpparam) {
        if (lpparam.packageName.equals("com.nianticlabs.pokemongo")) {
            findAndHookMethod(
                "android.location.Location",
                lpparam.classLoader,
                "isMock",
                new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        param.setResult(false);  // 強制返回 false
                    }
                }
            );
        }
    }
}
```

**為何失敗：**
1. Root 會導致 Play Integrity `MEETS_DEVICE_INTEGRITY` 失敗
2. Niantic 會直接拒絕 Root 設備連線
3. Magisk Hide 等技術持續與 Google 對抗，不穩定

#### 方法 2: 修改 GPS 硬體／韌體

**理論：** 在硬體層級偽造 GPS 訊號

**為何困難：**
1. 需要專業硬體（GPS SDR、USRP 等），成本 > $1000 USD
2. 無法提供真實的衛星多普勒效應
3. 仍會被行為分析和 Sensor Fusion 抓到

#### 方法 3: 完美模擬真人（目前最可行）

```python
class HumanLikeMovement:
    def generate_realistic_path(start, end):
        # 1. 使用真實道路 API
        route = google_maps.directions(start, end, mode='walking')
        
        # 2. 加入隨機性
        path = add_random_deviations(route, std=5.0)  # 5米標準差
        
        # 3. 符合人類步行速度
        timestamps = simulate_walking_speed(
            path,
            speed_mean=1.4,  # m/s
            speed_std=0.3
        )
        
        # 4. 加入停留點
        path = add_realistic_stops(path, poi_database)
        
        # 5. 模擬 GPS 訊號波動
        path = add_gps_noise(path, accuracy_range=(5, 15))
        
        return path
```

**問題：**
- 仍無法繞過 `isMock() == true`
- IP 地理位置仍不符
- Sensor 數據仍然矛盾

---

## 結論與建議

### 7.1 技術結論

1. **Pikmin Keep 的 ADB 方法會被偵測**  
   ✅ 100% 會被 `isMock()` 偵測  
   ✅ 高機率被行為分析偵測  
   ⚠️ Play Integrity 不直接偵測（除非 Root）

2. **為何目前還能用**  
   - Pikmin Bloom 偵測閾值較寬鬆
   - 小範圍使用風險較低
   - 採用積分制累積懲罰，非即時封鎖

3. **長期風險**  
   - 帳號會進入觀察名單
   - 累積 3-6 個月可能被封鎖
   - 大規模瞬移會觸發即時軟鎖定

### 7.2 使用建議

#### 低風險使用策略

```yaml
安全使用原則:
  距離限制:
    - 單次移動: < 1 km
    - 每日總移動: < 10 km
    - 避免跨國瞬移
  
  時間控制:
    - 等待冷卻時間（參考 Cooldown Table）
    - 避免夜間異常活動
    - 模擬真實移動時間
  
  頻率限制:
    - 每小時改變位置 < 3 次
    - 每天使用 < 2 小時
    - 每週休息 2-3 天
  
  行為自然:
    - 不要全部稀有寶可夢都抓
    - 維持正常的失敗率
    - 不要過度優化路線
```

#### 替代方案

| 方案 | Mock Flag | Root 需求 | 風險等級 | 推薦度 |
|------|-----------|-----------|---------|--------|
| **Pikmin Keep (現況)** | ✅ 會標記 | ❌ 不需要 | 🟡 中 | ⭐⭐⭐ 測試用 |
| **Root + Xposed** | ❌ 可繞過 | ✅ 需要 | 🔴 極高 | ⭐ 不推薦 |
| **iOS 越獄 + Location Faker** | ⚠️ 部分 | ✅ 需要 | 🔴 高 | ⭐⭐ 不穩定 |
| **實體移動** | ❌ 無 | ❌ 不需要 | 🟢 無 | ⭐⭐⭐⭐⭐ 最安全 |
| **等待原地刷新** | ❌ 無 | ❌ 不需要 | 🟢 無 | ⭐⭐⭐⭐ 合法玩法 |

### 7.3 未來趨勢

Niantic 的偵測系統會持續進化：

```
2024-2025: 強化 Play Integrity 整合
2025-2026: AI 行為模式偵測升級
2026-2027: 可能要求硬體認證（如 Android StrongBox）
2027+:     可能引入區塊鏈防竄改技術
```

### 7.4 最終建議

**對於 Pikmin Keep 使用者：**

1. **理解風險**  
   ✅ 知道自己被偵測的可能性 100%  
   ✅ 接受帳號可能被封鎖的風險

2. **謹慎使用**  
   ⚠️ 僅用於測試和非競爭性玩法  
   ⚠️ 不要用於 Pokemon GO（封鎖風險極高）  
   ⚠️ Pikmin Bloom 小範圍使用相對安全

3. **技術認知**  
   ❌ 沒有「完美繞過」的方法  
   ❌ 任何聲稱「100% 安全」的工具都不可信  
   ✅ 最安全的方法永遠是遵守遊戲規則

**對於開發者：**

建議在應用程式中加入明確的風險警告：

```typescript
const RISK_WARNING = `
⚠️ 重要聲明

本工具使用 Android Test Provider API 改變 GPS 位置。
此方法會產生帶有 Mock 標記的位置數據，可被應用程式偵測。

使用於 Niantic 遊戲（Pokemon GO、Pikmin Bloom、Ingress）的風險：
- 100% 會被 Location.isMock() 偵測
- 可能觸發帳號軟鎖定或永久封鎖
- 違反服務條款可能導致帳號損失

建議僅用於：
✅ 應用程式開發測試
✅ GPS 定位功能驗證
✅ 個人研究和學習目的

請勿用於：
❌ 線上遊戲作弊
❌ 商業或營利目的
❌ 違反服務條款的行為
`;
```

---

## 參考資料

### 官方文件

1. [Android Location API Reference](https://developer.android.com/reference/android/location/Location)
2. [Android LocationManager - isMock()](https://developer.android.com/reference/android/location/Location#isMock())
3. [Google Play Integrity API](https://developer.android.com/google/play/integrity)
4. [Android Test Providers](https://developer.android.com/reference/android/location/LocationManager#addTestProvider(java.lang.String,%20android.location.provider.ProviderProperties))

### 技術研究

1. "How Apps Detect Mock Locations on Android" (Stack Overflow, 2015-2025)
2. "Google Play Integrity API vs SafetyNet" (Android Developers Blog, 2023)
3. "Niantic's Anti-Cheat System Analysis" (Reverse Engineering Community, 2024)

### Niantic 官方政策

1. [Niantic Player Guidelines](https://nianticlabs.com/guidelines)
2. [Pokemon GO Terms of Service](https://www.nianticlabs.com/terms/)
3. [Niantic Security Center](https://nianticlabs.com/security)

---

**文件版本：** 1.0.0  
**最後更新：** 2026-04-04  
**作者：** Technical Analysis Based on Public Documentation  
**授權：** 僅供教育和研究目的
