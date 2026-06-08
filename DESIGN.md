# Design System for Android ADB GPS Spoofer

## Purpose

This document describes the current UI design system used by `src/renderer/`. The product is an operational map-control tool, so the interface prioritizes readability, compact controls, predictable states, and an uninterrupted map canvas.

## Visual Direction

- Dark-first interface for long sessions
- Map-dominant layout with controls placed around or above the map
- Emerald as the primary "active GPS / go" accent
- Blue reserved for secondary/link-style actions
- Dense, practical panels rather than marketing-style cards
- System fonts for UI text and monospace fonts for coordinates/numeric values
- Icons from `lucide-react`

## Token Source

The canonical tokens live in:

- `src/renderer/styles/globals.css`
- `tailwind.config.js`

Components should use Tailwind token classes such as `bg-background`, `bg-surface`, `text-foreground`, `border-border`, `text-primary`, and `text-danger`. Avoid hard-coded raw hex values in React components unless a map/Leaflet integration requires it.

## Color Tokens

| Token | CSS variable | Approx color | Role |
|---|---|---:|---|
| `background` | `--background` | `#0c0a09` | App background |
| `foreground` | `--foreground` | `#ffffff` | Primary text |
| `surface` | `--surface` | `#1c1917` | Panels |
| `surface-elevated` | `--surface-elevated` | `#292524` | Inputs, popovers, cards |
| `surface-hover` | `--surface-hover` | `#44403c` | Hover backgrounds |
| `primary` | `--primary` | `#10b981` | Primary action, GPS active |
| `secondary` | `--secondary` | `#3b82f6` | Secondary action |
| `success` | `--success` | `#22c55e` | Connected/success |
| `warning` | `--warning` | `#f59e0b` | Cooldown/warning |
| `danger` | `--danger` | `#ef4444` | Stop/error/destructive |
| `border` | `--border` | `#44403c` | Dividers and borders |
| `input` | `--input` | `#292524` | Input background |
| `ring` | `--ring` | `#10b981` | Focus ring |

## Typography

| Role | Font | Size | Use |
|---|---|---:|---|
| Body | system UI stack | `14px` | Default labels and controls |
| Small | system UI stack | `12-13px` | Secondary metadata and hints |
| Headings | system UI stack | `14-18px`, 600 | Panel titles and sections |
| Numeric/coordinate | `'SF Mono', Monaco, 'Courier New'` | `12-16px` | Lat/lng, speeds, keyboard hints |

Use concise labels. This is a control surface; avoid explanatory marketing copy inside panels.

## Layout

The current app uses:

- `TopBar` fixed at the top
- full-screen `MapView`
- desktop floating panels (`FloatingControlPanel`, `JoystickFloating`)
- tablet/mobile `BottomSheet`

Breakpoints are handled through `useBreakpoint()`:

| Breakpoint | Behavior |
|---|---|
| Mobile | Map plus bottom sheet tabs |
| Tablet | Map plus reduced floating/bottom controls |
| Desktop | Full top bar, map, floating control panels |

Keep map controls and markers visible when panels open. Use viewport-safe units and avoid body scrolling; `globals.css` fixes `html`, `body`, and `#root` to prevent mobile browser chrome from shifting the UI.

## Components

### Top Bar

Current responsibilities:

- active device display
- multi-device selection dropdown
- per-device spoof state dots
- speed presets: Walk, Cycle, Drive, HSR, Plane, Custom
- custom speed slider
- keyboard shortcut popover
- app version badge
- Stop All button and Add Device dialog

Top bar height is compact (`h-11`). Avoid adding wide text labels that crowd the speed controls.

### Device Dropdown

Device states are represented with small colored dots:

- idle: muted
- teleport: secondary/blue
- joystick: success/green
- route: warning/amber

Unavailable or unauthorized devices should remain visible enough to explain the state, but disabled for actions that need a connected device.

### Teleport Panel

Expected behavior:

- map click in teleport context sets pending coordinates
- manual latitude/longitude input is supported
- long-distance moves display cooldown guidance
- teleport action calls `window.api.teleport(serials, lat, lng)`

Do not add a separate local Stop button here; global Stop All and route-specific stop controls are the canonical stop paths.

### Route Panel

Supported modes:

- manual waypoints
- road-network planning through OSRM

Supported route controls:

- play, pause, resume
- loop or wander as mutually exclusive end modes
- fixed speed toggle
- return to real GPS
- start from real GPS when known
- GPX import
- clear route with stay/remove choice when active

When route speed changes while playing, update both the store and backend via `window.api.routeSetSpeed(ms)`.

### Joystick

Joystick movement uses:

- virtual joystick (`nipplejs`)
- `W/A/S/D`
- arrow keys
- current global speed from TopBar

Do not derive movement speed from joystick force; speed is global by design.

### Modals

Use modals for destructive or mode-changing confirmations:

- Stop All
- clearing an active route

Backdrop: dark translucent overlay. Modal content should be compact and action-oriented.

## Accessibility

- Icon-only buttons need `title` or `aria-label`.
- Keyboard focus uses an emerald ring with a background offset.
- Touch targets should stay at least `36x36px`; mobile primary actions should be closer to `44px` high.
- Avoid emoji as UI icons; use `lucide-react`.
- Keep coordinate text selectable/readable and use monospace.

## Motion

Use short transitions (`200-300ms`) and existing CSS variables:

- `--spring-duration`
- `--spring-easing`
- `--ease-out`

Motion should clarify panel opening, active states, or button feedback. Do not animate map position or controls in ways that obscure location state.

## Do

- Use token classes from Tailwind.
- Keep the map as the dominant surface.
- Keep panel density high and labels short.
- Use emerald for primary go/live actions.
- Use warning/danger colors only for real operational states.
- Preserve desktop and mobile interaction parity.

## Do Not

- Introduce new accent palettes without updating tokens.
- Add decorative gradients or large ornamental backgrounds.
- Use raw hex colors in components when a token exists.
- Hide critical device/stop controls behind deep menus.
- Add broad marketing content to the first screen.
