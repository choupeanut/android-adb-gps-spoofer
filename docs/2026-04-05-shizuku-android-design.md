# Pikmin Keep Android — Shizuku GPS Spoofer Design

**Date**: 2026-04-05  
**Status**: Approved  
**Type**: New Android App (Standalone Repository)

---

## Executive Summary

Build a standalone Android GPS spoofing app using Shizuku Shell API to enable **phone-independent operation** (no PC required). Reuses all proven algorithms, anti-cheat mechanisms, and ADB commands from the Electron/Web version by replacing ADB-over-TCP with Shizuku's Binder IPC execution channel.

**Key Innovation**: Shizuku eliminates WiFi stability issues entirely (no TCP socket, no WiFi sleep, no NAT timeout) while maintaining identical command syntax.

---

## Architecture Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Project Structure** | New repository (not monorepo) | Separate release cycle, independent versioning |
| **Target Devices** | Self-device only (local GPS) | Simplifies first version, no multi-device complexity |
| **UI Framework** | Kotlin + Jetpack Compose | Native performance, declarative UI, ecosystem maturity |
| **Map SDK** | OSMDroid (OpenStreetMap) | Free, offline-capable, consistent with Web version tiles |
| **Minimum API** | Android 11 (API 30) | Shizuku wireless pairing minimum requirement |
| **Shizuku Integration** | Shell command API | Direct reuse of `cmd location` commands (zero syntax changes) |
| **Persistence** | Room (SQLite ORM) | Type-safe, Compose-native, Flow integration |
| **Background** | Foreground Service + Notification | Android 12+ compliance, user visibility, process survival |
| **GPX Import** | Deferred (Phase 2) | Reduce initial scope, focus on core features |

---

## System Architecture

```
┌───────────────────────── Android App Boundary ─────────────────────────┐
│                                                                         │
│  ┌─────────────────────── UI Layer (Jetpack Compose) ─────────────┐    │
│  │                                                                 │    │
│  │  MapScreen (OSMDroid)                                           │    │
│  │  ├─ TopBar (Speed presets, Stop All button)                    │    │
│  │  ├─ BottomSheet (Swipeable, 3 tabs)                            │    │
│  │  │  ├─ TeleportTab (Coord input, Cooldown timer)               │    │
│  │  │  ├─ JoystickTab (Canvas joystick, Speed multiplier)         │    │
│  │  │  └─ RouteTab (Waypoint list, Play/Pause/Resume/Return)      │    │
│  │  └─ Markers (Blue=Real GPS, Green=Spoofed GPS, Orange=Pending) │    │
│  │                                                                 │    │
│  │  SetupScreen (Shizuku installation/permission guide)            │    │
│  │  SavedLocationsSheet (Starred favorites)                        │    │
│  │  SettingsScreen (Jitter, Speed defaults, Cooldown warnings)     │    │
│  │                                                                 │    │
│  └──────────────────────────┬──────────────────────────────────────┘    │
│                             │                                           │
│                      StateFlow / LiveData                               │
│                             │                                           │
│  ┌──────────────────────────┴──────────────────────────────────────┐    │
│  │                   ViewModel Layer (Hilt Injected)               │    │
│  │                                                                 │    │
│  │  MapViewModel ─── observes LocationEngine + RouteEngine        │    │
│  │  LocationViewModel ─── commands: teleport(), joystick()        │    │
│  │  RouteViewModel ─── commands: play(), pause(), addWaypoint()   │    │
│  │  SettingsViewModel ─── reads/writes DataStore preferences      │    │
│  │                                                                 │    │
│  └──────────────────────────┬──────────────────────────────────────┘    │
│                             │                                           │
│                      Repository Pattern                                 │
│                             │                                           │
│  ┌──────────────────────────┴──────────────────────────────────────┐    │
│  │              Service / Engine Layer (Kotlin Coroutines)         │    │
│  │                                                                 │    │
│  │  ┌─────────────────────────────────────────────────────┐        │    │
│  │  │ LocationEngine (Port: location-engine.ts)          │        │    │
│  │  │  · Mode: IDLE / TELEPORT / JOYSTICK / KEEP_ALIVE   │        │    │
│  │  │  · Teleport: >1km instant, ≤1km glide @1.4m/s      │        │    │
│  │  │  · Joystick: continuous bearing+speed updates      │        │    │
│  │  │  · Keep-alive: dual-channel (1000ms + 2500ms)      │        │    │
│  │  │  · Backpressure: AtomicBoolean guard               │        │    │
│  │  │  · Micro-jitter: σ=0.000015° on idle positions     │        │    │
│  │  └─────────────────────────────────────────────────────┘        │    │
│  │                                                                 │    │
│  │  ┌─────────────────────────────────────────────────────┐        │    │
│  │  │ RouteEngine (Port: route-engine.ts)                │        │    │
│  │  │  · 1 Hz tick coroutine (CoroutineScope.launch)     │        │    │
│  │  │  · State: waypoints, currentIndex, progressFraction │        │    │
│  │  │  · CRITICAL FIX: clamp progress BEFORE index++      │        │    │
│  │  │  · Loop / Reverse / Wander modes                    │        │    │
│  │  │  · Pause → keep-alive (prevent provider timeout)    │        │    │
│  │  │  · Return-to-GPS: walk back, then removeProvider    │        │    │
│  │  │  · StateFlow<RouteState> for UI observation         │        │    │
│  │  └─────────────────────────────────────────────────────┘        │    │
│  │                                                                 │    │
│  │  ┌─────────────────────────────────────────────────────┐        │    │
│  │  │ AntiDetect (Port: anti-detect.ts x2)               │        │    │
│  │  │  · applyJitter: Box-Muller Gaussian σ=0.00009°     │        │    │
│  │  │  · applySpeedFluctuation: ±15% randomization       │        │    │
│  │  │  · smoothBearing: 30% interpolation per tick       │        │    │
│  │  │  · Accuracy randomization: base ± [0,5]m           │        │    │
│  │  └─────────────────────────────────────────────────────┘        │    │
│  │                                                                 │    │
│  │  ┌─────────────────────────────────────────────────────┐        │    │
│  │  │ ShizukuShell (Port: adb.service.ts commands)       │        │    │
│  │  │  · suspend fun exec(cmd: String): ShellResult      │        │    │
│  │  │  · Wraps: Shizuku.newProcess(...).waitFor()        │        │    │
│  │  │  · Commands (IDENTICAL to ADB version):            │        │    │
│  │  │    - cmd location providers add-test-provider gps  │        │    │
│  │  │    - appops set ... android:mock_location allow    │        │    │
│  │  │    - cmd location ... set-test-provider-location   │        │    │
│  │  │    - cmd location get-last-location (4 formats)    │        │    │
│  │  │    - cmd location ... remove-test-provider gps     │        │    │
│  │  │  · NO WiFi hardening needed (Binder, not TCP)      │        │    │
│  │  └─────────────────────────────────────────────────────┘        │    │
│  │                                                                 │    │
│  │  ┌─────────────────────────────────────────────────────┐        │    │
│  │  │ GeoUtils (Port: coordinates.ts + geo.ts)           │        │    │
│  │  │  · haversineKm, bearing, interpolatePoints         │        │    │
│  │  │  · destinationPoint, getCooldownMinutes            │        │    │
│  │  └─────────────────────────────────────────────────────┘        │    │
│  │                                                                 │    │
│  │  ┌─────────────────────────────────────────────────────┐        │    │
│  │  │ SpoofForegroundService (Android Service)           │        │    │
│  │  │  · Holds LocationEngine + RouteEngine lifecycle    │        │    │
│  │  │  · startForeground(notification)                   │        │    │
│  │  │  · Notification actions: Pause | Resume | Stop     │        │    │
│  │  │  · WakeLock (PARTIAL_WAKE_LOCK) for CPU            │        │    │
│  │  │  · onDestroy → removeTestProvider() cleanup        │        │    │
│  │  └─────────────────────────────────────────────────────┘        │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                         │
│  ┌─────────────────────── Data Layer ────────────────────────────────┐  │
│  │                                                                   │  │
│  │  Room Database (pikmin_keep.db)                                  │  │
│  │  ├─ SavedLocation: id, name, lat, lng, createdAt                 │  │
│  │  ├─ LocationHistory: id, lat, lng, visitedAt                     │  │
│  │  └─ Session: id, waypoints (JSON), speedMs, loop, wanderEnabled  │  │
│  │                                                                   │  │
│  │  DataStore (Preferences)                                          │  │
│  │  ├─ speedPreset: SpeedMode enum                                  │  │
│  │  ├─ customSpeedMs: Float                                         │  │
│  │  ├─ jitterEnabled: Boolean                                       │  │
│  │  ├─ cooldownWarningEnabled: Boolean                              │  │
│  │  └─ lastKnownLocation: Pair<Double, Double>                      │  │
│  │                                                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─────────────────── External Dependencies ─────────────────────────┐  │
│  │                                                                   │  │
│  │  Shizuku SDK 13.x (Binder IPC)                                   │  │
│  │  ├─ Shizuku.checkSelfPermission()                                │  │
│  │  ├─ Shizuku.requestPermission()                                  │  │
│  │  └─ Shizuku.newProcess(["sh", "-c", command])                    │  │
│  │     → Executes as system uid (2000)                              │  │
│  │     → Returns Process with stdout/stderr                         │  │
│  │                                                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Models (Kotlin Data Classes)

### LocationUpdate
```kotlin
data class LocationUpdate(
    val lat: Double,
    val lng: Double,
    val altitude: Double = 0.0,
    val accuracy: Int = 10,          // meters
    val bearing: Double = 0.0,       // 0-360°
    val speed: Double = 0.0,         // m/s
    val timestamp: Long = System.currentTimeMillis()
)
```

### RouteWaypoint
```kotlin
data class RouteWaypoint(
    val lat: Double,
    val lng: Double,
    val altitude: Double? = null
)
```

### RouteState (Observable StateFlow)
```kotlin
data class RouteState(
    val waypoints: List<RouteWaypoint> = emptyList(),
    val totalDistanceKm: Double = 0.0,
    val currentWaypointIndex: Int = 0,
    val progressFraction: Double = 0.0,  // 0.0 to 1.0 within current segment
    val playing: Boolean = false,
    val paused: Boolean = false,
    val loop: Boolean = false,
    val reverse: Boolean = false,
    val wandering: Boolean = false,
    val finishedNaturally: Boolean = false
)
```

### Room Entities
```kotlin
@Entity(tableName = "saved_locations")
data class SavedLocation(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val name: String,
    val lat: Double,
    val lng: Double,
    val createdAt: String = LocalDateTime.now().toString()
)

@Entity(tableName = "location_history")
data class LocationHistory(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val lat: Double,
    val lng: Double,
    val visitedAt: String = LocalDateTime.now().toString()
)

@Entity(tableName = "session")
data class Session(
    @PrimaryKey val id: Int = 1,  // Singleton session
    val waypointsJson: String,    // JSON serialized List<RouteWaypoint>
    val speedMs: Double,
    val loop: Boolean,
    val wanderEnabled: Boolean,
    val wanderRadiusM: Int
)
```

---

## Constants (Direct Port from constants.ts)

```kotlin
object SpeedPresets {
    const val WALK = 1.4        // m/s
    const val CYCLE = 4.2
    const val DRIVE = 11.0
    const val HSR = 83.3        // High-speed rail
    const val PLANE = 250.0
    const val DEFAULT = WALK
}

object Timing {
    const val UPDATE_INTERVAL_MS = 1000L      // Location push + route tick
    const val KEEP_ALIVE_BACKUP_MS = 2500L    // Backup keep-alive channel
}

object Location {
    const val DEFAULT_ACCURACY = 10           // meters
    const val GLIDE_MAX_KM = 1.0             // Teleport vs glide threshold
    const val GLIDE_SPEED_MS = 1.4           // Walk speed for glide interpolation
}

object AntiDetect {
    const val JITTER_SIGMA = 0.00009         // ~10m at equator (main jitter)
    const val JITTER_SIGMA_KEEPALIVE = 0.000015  // ~1.7m (micro-jitter for idle)
    const val SPEED_FLUCTUATION_FACTOR = 0.3    // ±15% variance
    const val BEARING_SMOOTH_FACTOR = 0.3       // 30% interpolation per tick
}

object Wander {
    const val DEFAULT_RADIUS_M = 100
    const val INTERVAL_MIN_SEC = 5
    const val INTERVAL_MAX_SEC = 25
}

// Cooldown table: distance (km) to wait time (minutes)
val COOLDOWN_TABLE = listOf(
    1 to 0.5, 2 to 1.0, 5 to 2.0, 10 to 5.0, 25 to 10.0, 50 to 20.0,
    100 to 30.0, 250 to 45.0, 500 to 60.0, 750 to 80.0, 1000 to 100.0, 1500 to 120.0
)
```

---

## UI Design Patterns (Ported from Web/Renderer)

### Map Interaction Modes (Tab-Dependent)

| Active Tab | Map Click Behavior | Visual Feedback |
|------------|-------------------|-----------------|
| **Teleport** | Set `pendingTeleport` location | Orange marker (not committed) |
| **Route** | Add waypoint directly | Green marker added to route polyline |
| **Joystick** | No-op (joystick controls movement) | Map click disabled |

**Rationale**: Prevents accidental teleports, matches user mental model per tab context.

### Speed Control (Global TopBar)

- **Preset Chips**: Walk | Cycle | Drive | HSR | Plane (horizontally scrollable)
- **Long-press**: Opens custom speed slider (0.1 - 300 m/s)
- **Display**: Shows both m/s and km/h conversion
- **Scope**: Applies to all modes (teleport glide, joystick, route playback)

### Route Semantics (Explicit States)

| Action | Effect | Provider State |
|--------|--------|---------------|
| **Play** | Start from first waypoint, loop tick starts | Active, pushing |
| **Pause** | Stop movement, preserve position/segment | Active, keep-alive only |
| **Resume** | Continue from current position (no reset) | Active, tick resumes |
| **Return** | Walk back to real GPS at route speed | Active until arrival |
| **Stop** | Immediate halt, clear state | Removed |
| **Clear** | UI reset (only allowed when not playing) | No change |

### Cooldown Timer (Yellow Warning)

- **Trigger**: Distance ≥ 500m
- **Display**: "Recommended wait: X minutes" + countdown timer
- **User Action**: Optional — timer is advisory, not blocking
- **Table Lookup**: Binary search `COOLDOWN_TABLE` by distance

---

## Shizuku Integration Details

### Permission Flow

```
App Launch
├─ Check Shizuku installed: packageManager.getPackageInfo("moe.shizuku.privileged.api")
│  └─ Not installed → Show dialog with Play Store / GitHub link
├─ Check Shizuku running: Shizuku.pingBinder()
│  └─ Not running → Show "Open Shizuku app and tap Start"
├─ Check permission: Shizuku.checkSelfPermission()
│  └─ Denied → Shizuku.requestPermission(REQUEST_CODE)
└─ Granted → Proceed to MapScreen
```

### Android 11+ Wireless Pairing (No PC Required)

**Setup Guide (Shown in SetupScreen)**:
1. Open Shizuku app
2. Tap "Wireless debugging"
3. Toggle Settings → Developer Options → Wireless Debugging ON
4. Return to Shizuku → Tap "Pairing"
5. Enter pairing code from Settings
6. Shizuku shows "Started via wireless debugging"
7. Return to Pikmin Keep → Grant permission

### Command Execution Pattern

```kotlin
class ShizukuShell {
    suspend fun exec(command: String): ShellResult = withContext(Dispatchers.IO) {
        val process = Shizuku.newProcess(
            arrayOf("sh", "-c", command),
            null,  // env
            null   // cwd
        )
        val stdout = process.inputStream.bufferedReader().readText()
        val stderr = process.errorStream.bufferedReader().readText()
        val exitCode = process.waitFor()
        ShellResult(stdout, stderr, exitCode)
    }
    
    suspend fun pushLocation(loc: LocationUpdate): Boolean {
        val cmd = "cmd location providers set-test-provider-location gps " +
                  "--location ${loc.lat},${loc.lng} " +
                  "--accuracy ${loc.accuracy} " +
                  "--time ${loc.timestamp}"
        val result = exec(cmd)
        return result.exitCode == 0
    }
    
    // ... other commands: addTestProvider, enableMockLocation, removeTestProvider, etc.
}
```

**Key Difference from Web Version**:
- **Web**: `child_process.exec("adb shell cmd location ...")`
- **Android**: `Shizuku.newProcess(["sh", "-c", "cmd location ..."])`
- **Commands**: IDENTICAL syntax, zero translation needed

---

## Background Service Design

### Foreground Service Lifecycle

```
User taps "Teleport" / "Play Route" / Joystick drag
└─ startForegroundService(Intent(context, SpoofForegroundService::class.java))
   ├─ onCreate(): Inject LocationEngine + RouteEngine (Hilt)
   ├─ onStartCommand(): startForeground(NOTIFICATION_ID, notification)
   │  ├─ Acquire PARTIAL_WAKE_LOCK
   │  ├─ Start keep-alive / route tick coroutines
   │  └─ Update notification with current mode + coordinates
   ├─ Notification Actions (PendingIntent):
   │  ├─ [Pause] → LocationEngine.pause() + RouteEngine.pause()
   │  ├─ [Resume] → LocationEngine.resume() + RouteEngine.resume()
   │  └─ [Stop] → removeTestProvider() → stopSelf()
   └─ onDestroy():
      ├─ LocationEngine.stop()
      ├─ RouteEngine.stop()
      ├─ ShizukuShell.exec("cmd location providers remove-test-provider gps")
      ├─ Release WakeLock
      └─ Super.onDestroy()
```

### Notification Design

**Channel**: `gps_spoof_service` (importance: LOW, silent)

**Content**:
```
🎯 GPS Spoofing Active
Mode: Route Playback (Walking)
Location: 35.6762, 139.6503
Speed: 1.4 m/s (5.0 km/h)
Elapsed: 00:05:32

[ ⏸ Pause ]  [ ⏹ Stop ]
```

**Auto-update**: Every 1s from LocationEngine/RouteEngine StateFlow

---

## Testing Strategy

### Unit Tests (JUnit 5 + Kotlin Coroutines Test)

#### AntiDetectTest (Port from anti-detect.test.ts)
- `applyJitter_changesLatLng`: 100 samples, all differ from base
- `applyJitter_staysWithin100m`: σ=0.00009 → 95% within 20m radius
- `applyJitter_accuracyRange3to25`: 50 samples, all in [3, 25]
- `applyJitter_preservesOtherFields`: altitude, bearing, speed unchanged
- `applySpeedFluctuation_variance`: ±15% range over 1000 samples
- `smoothBearing_30percentInterpolation`: target 90°, current 0° → 27°
- `smoothBearing_handles180Wraparound`: 350° → 10° uses shortest arc

#### GeoUtilsTest
- `haversineKm_knownDistance`: Taipei to Tokyo → 2104 km (±1 km)
- `bearing_northEast`: 0,0 to 1,1 → 45°
- `interpolatePoints_midpoint`: 0.5 fraction → exact midpoint
- `destinationPoint_100kmEast`: bearing 90°, 100km → correct longitude shift
- `getCooldownMinutes_500km`: lookup → 60 minutes

#### RouteEngineTest
- `tick_progressesByStepKm`: speedMs=1.4, distanceKm=1.4 → progressFraction=1.0 after 1000 ticks
- `tick_clampsProgressBeforeIndexIncrement`: 2 waypoints 0.5km apart, speed 250m/s → no snap-back
- `pause_startsKeepAlive`: paused state → verify 1Hz push with speed=0
- `loop_restartsFromZero`: 3 waypoints, loop=true → index wraps to 0
- `wander_generatesRandomPoints`: wanderRadiusM=100 → all points within 100m
- `returnToRealGps_walksBack`: current=10km from real → gradual approach

### UI Tests (Compose Test)

```kotlin
@Test
fun mapClick_inTeleportTab_setsPendingMarker() {
    composeTestRule.setContent {
        MapScreen(viewModel)
    }
    composeTestRule.onNodeWithTag("tab_teleport").performClick()
    composeTestRule.onNodeWithTag("map_view").performTouchInput { 
        click(Offset(100f, 100f)) 
    }
    assert(viewModel.pendingTeleport.value != null)
}

@Test
fun speedChip_click_updatesViewModel() {
    composeTestRule.onNodeWithText("Walk").performClick()
    assertEquals(SpeedPresets.WALK, viewModel.speedMs.value)
}

@Test
fun routePlay_startsService() {
    viewModel.addWaypoint(RouteWaypoint(35.6762, 139.6503))
    viewModel.addWaypoint(RouteWaypoint(35.6812, 139.7671))
    composeTestRule.onNodeWithTag("route_play_button").performClick()
    verify(serviceStarter).startForegroundService(any())
}
```

### Integration Tests

```kotlin
@Test
fun shizukuShell_mockLocationCommand_correctSyntax() = runTest {
    val mockShizuku = MockShizukuShell()
    val engine = LocationEngine(mockShizuku)
    
    engine.teleport(LocationUpdate(35.6762, 139.6503))
    
    val capturedCommand = mockShizuku.lastCommand
    assertTrue(capturedCommand.contains("cmd location providers set-test-provider-location gps"))
    assertTrue(capturedCommand.contains("--location 35.6762,139.6503"))
}
```

---

## Migration Mapping (TypeScript → Kotlin)

| TypeScript Source | Kotlin Target | Complexity |
|------------------|---------------|------------|
| `web/server/services/adb.service.ts` | `ShizukuShell.kt` | Low (syntax identical) |
| `web/server/services/location-engine.ts` | `LocationEngine.kt` | Medium (coroutines vs setInterval) |
| `web/server/services/route-engine.ts` | `RouteEngine.kt` | Medium (tick loop, StateFlow) |
| `src/main/services/anti-detect.ts` | `AntiDetect.kt` | Low (math functions) |
| `src/main/utils/coordinates.ts` | `GeoUtils.kt` | Low (pure functions) |
| `src/shared/types.ts` | `Models.kt` | Low (data classes) |
| `src/shared/constants.ts` | `Constants.kt` | Trivial (const vals) |
| `web/server/services/db.ts` | `RoomDatabase.kt` + DAOs | Medium (SQLite → Room ORM) |
| `src/renderer/components/map/MapView.tsx` | `MapScreen.kt` (Compose) | High (React → Compose, OSMDroid) |
| `src/renderer/components/controls/RoutePanel.tsx` | `RoutePanel.kt` (Compose) | Medium (UI composition) |

**Estimated Port Effort**:
- Core engines (Location + Route + AntiDetect): 3-4 days
- Shizuku integration + permission flow: 1 day
- Compose UI (Map + BottomSheet + Controls): 4-5 days
- Room DB + DataStore: 1 day
- Foreground Service + Notification: 1 day
- Testing: 2 days
- **Total**: ~12-15 days (single developer)

---

## Implementation Phases

### Phase 1: Foundation (Days 1-2)
- [x] Design approval
- [ ] Create new Android project in Android Studio
- [ ] Configure Kotlin DSL, dependencies (Shizuku, Compose, Room, Hilt)
- [ ] Scaffold package structure: `data/`, `domain/`, `ui/`, `service/`
- [ ] Implement Constants.kt (direct copy)
- [ ] Implement Models.kt (data classes)

### Phase 2: Core Engines (Days 3-6)
- [ ] GeoUtils.kt (haversine, bearing, interpolate)
- [ ] AntiDetect.kt (jitter, speed fluctuation, bearing smoothing)
- [ ] ShizukuShell.kt (command execution wrapper)
- [ ] LocationEngine.kt (teleport, glide, joystick, keep-alive)
- [ ] RouteEngine.kt (tick loop, pause/resume, loop, wander, return-to-GPS)
- [ ] Unit tests for all engines (JUnit 5)

### Phase 3: Shizuku Integration (Day 7)
- [ ] SetupScreen (install/permission guide)
- [ ] Permission request flow
- [ ] Test provider setup commands (add, enable, push, remove)
- [ ] Real GPS reading (get-last-location, 4 format parsing)

### Phase 4: UI Layer (Days 8-11)
- [ ] MapScreen.kt (OSMDroid setup, markers, click handling)
- [ ] TopBar (Speed chips, Stop button)
- [ ] BottomSheet (3 tabs: Teleport, Joystick, Route)
- [ ] TeleportTab (coord input, cooldown timer)
- [ ] JoystickTab (Canvas joystick overlay)
- [ ] RouteTab (waypoint list, Play/Pause/Resume/Return/Stop/Clear)
- [ ] SavedLocationsSheet
- [ ] SettingsScreen (DataStore preferences)
- [ ] Compose UI tests

### Phase 5: Background Service (Day 12)
- [ ] SpoofForegroundService.kt
- [ ] Notification with actions (Pause, Stop)
- [ ] WakeLock lifecycle
- [ ] Service binding for Activity communication

### Phase 6: Persistence (Day 13)
- [ ] Room database (SavedLocation, LocationHistory, Session)
- [ ] DAOs with Flow queries
- [ ] Session restore on app launch

### Phase 7: Polish & Testing (Days 14-15)
- [ ] End-to-end testing (Shizuku → GPS push → Google Maps verification)
- [ ] Edge cases (provider timeout, permission revoke, Shizuku stop)
- [ ] Performance profiling (memory leaks, battery drain)
- [ ] Documentation (README, screenshots, build instructions)

---

## Verification Checklist

- [ ] **Shizuku Permission**: SetupScreen guides user through wireless pairing → `uid=2000` shell execution confirmed
- [ ] **Test Provider Setup**: `cmd location providers add-test-provider gps` succeeds → system GPS shows mock indicator
- [ ] **Teleport (>1km)**: Enter 35.6762,139.6503 → map jumps → Google Maps shows spoofed location
- [ ] **Glide (≤1km)**: 500m teleport → smooth 7-minute walk animation (not instant)
- [ ] **Keep-alive**: Idle for 5 minutes → GPS does not snap back to real position
- [ ] **Route Playback**: 3+ waypoints → Play → observe smooth movement along polyline → Pause → position stable
- [ ] **Loop Mode**: 3 waypoints, loop enabled → reaches end → restarts from waypoint 0
- [ ] **Wander Mode**: Route ends → Wander enabled → random movement within 100m radius every 5-25s
- [ ] **Joystick**: Drag → immediate movement in drag direction → Release → speed=0, keep-alive starts
- [ ] **Cooldown Warning**: 50km teleport → yellow banner "Wait 20 minutes" displayed
- [ ] **Foreground Service**: Press Home → notification persists → GPS still updating after 5 minutes
- [ ] **Stop All**: Tap Stop → test provider removed → Google Maps returns to real GPS
- [ ] **Return-to-GPS**: Tap Return → walks back at route speed → arrives → provider auto-removed
- [ ] **Saved Locations**: Star a location → kill app → relaunch → starred location still present
- [ ] **Session Restore**: Set 3 waypoints, speed=Drive, loop=true → kill app → relaunch → session restored

---

## Deferred Features (Phase 2)

1. **GPX Import**: Storage Access Framework file picker → XML parsing → waypoint extraction
2. **Multi-Device Control**: Expand to control remote devices via WiFi ADB (reintroduces TCP complexity)
3. **Geocoding**: Nominatim API integration for address search
4. **Quick Settings Tile**: System tile for instant Start/Stop without opening app
5. **Widget**: Home screen widget showing current mode + coordinates
6. **Wear OS Companion**: Joystick control from smartwatch
7. **I18N**: Chinese/English/Japanese locale support

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Shizuku permission revoked mid-session | Medium | High | Monitor `Shizuku.onBinderReceived/Dead`, show reconnect prompt |
| Provider timeout (Android kills after 60s idle) | High | High | Dual-channel keep-alive (1s + 2.5s), micro-jitter to prevent loop detection |
| WiFi sleep interferes with Shizuku | Low | Low | Shizuku uses Binder (not TCP), immune to WiFi sleep |
| Play Integrity API detects mock location | High | Critical | Document limitation: `isMock()` always true, advise cooldown adherence |
| Battery drain from foreground service | Medium | Medium | PARTIAL_WAKE_LOCK only, coroutine-based (not polling), optimize tick rate |
| OSMDroid tile download fails (offline) | Low | Low | Cache tiles, fallback to gray map, show offline indicator |

---

## Success Metrics

1. **Shizuku Setup Success Rate**: >90% of users complete permission flow on first attempt
2. **GPS Stability**: <1% snap-back incidents during 10-minute keep-alive test
3. **Route Accuracy**: 95% of ticks within 5m of expected interpolated position
4. **Foreground Service Survival**: >99% survival after 1 hour in background (Android 13+)
5. **Battery Impact**: <5% drain per hour during active route playback
6. **Test Coverage**: >80% line coverage for engine classes

---

## References

- **Pikmin Keep Web**: `/home/peanutchou/pricer/pikmin-keep`
- **Code Review**: `docs/codex-5.3-review.md` (W1-W7 fixes applied in Web version)
- **Shizuku Docs**: https://shizuku.rikka.app/guide/
- **OSMDroid Wiki**: https://github.com/osmdroid/osmdroid/wiki
- **Android Location API**: https://developer.android.com/reference/android/location/LocationManager

---

**Status**: Ready for implementation. Proceed to Phase 1 project scaffolding.
