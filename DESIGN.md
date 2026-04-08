# Design System for Android ADB GPS Spoofer

## 1. Visual Theme & Atmosphere

The app adopts Apple's philosophy of controlled minimalism with a dark-first interface optimized for extended use. The design language emphasizes clarity, precision, and utility — essential for a GPS spoofing tool where location accuracy and device control are paramount.

The interface retreats to let the map dominate. Pure blacks (`#0c0a09`) and deep charcoals create an immersive canvas that reduces eye strain during long sessions. The singular accent color — a vibrant emerald (`#10b981`) — guides users to interactive elements and active states, reminiscent of GPS "live" indicators.

Typography is clean and functional. The system defaults to `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` — prioritizing the native font stack for optimal rendering and familiarity across platforms. Text is deliberately minimal: concise labels, clear hierarchies, and no decorative copy.

**Key Characteristics:**
- Dark-first interface with pure black (`#0c0a09`) and charcoal (`#1c1917`) surfaces
- Single accent: Emerald Green (`#10b981`) for active states, GPS indicators, and primary actions
- Native font stack prioritizing system fonts for optimal cross-platform rendering
- Map-centric layout — controls frame the map, never compete with it
- Tight spacing and compact components for information density
- Pill-shaped buttons and rounded panels (8px-12px radius) for approachability
- Translucent panels with subtle backdrop blur for depth
- GPS coordinates displayed in monospace (`'SF Mono', Monaco, 'Courier New', monospace`)

---

## 2. Color Palette & Roles

### Primary
- **Pure Black** (`#0c0a09`): App background, deepest surface
- **Charcoal** (`#1c1917`): Panel backgrounds, elevated surfaces
- **Charcoal Light** (`#292524`): Hover states, secondary surfaces
- **Charcoal Border** (`#44403c`): Subtle dividers, input borders

### Interactive
- **Emerald Primary** (`#10b981`): Active GPS indicator, primary CTAs, active device status
- **Emerald Hover** (`#059669`): Hover state for emerald buttons
- **Blue Link** (`#3b82f6`): Secondary actions, "Learn more" style links
- **Blue Hover** (`#2563eb`): Hover state for blue links

### Text
- **White** (`#ffffff`): Primary text, headings, labels
- **Gray Light** (`#d6d3d1`): Secondary text, descriptions
- **Gray Muted** (`#a8a29e`): Tertiary text, disabled states, placeholders
- **Monospace Text** (`#e7e5e4`): Coordinates, speed values, technical data

### Status & Semantic
- **Success Green** (`#22c55e`): Connected device, successful teleport
- **Warning Amber** (`#f59e0b`): Cooldown warnings, safety alerts
- **Danger Red** (`#ef4444`): Device errors, out-of-bounds locations
- **Info Blue** (`#3b82f6`): Informational messages, tips

### Surfaces
- **Panel Surface** (`#1c1917`): Main control panels, sidebar
- **Panel Elevated** (`#292524`): Cards, dropdowns, modals
- **Panel Hover** (`#44403c`): Hover state for interactive surfaces
- **Input Background** (`#292524`): Search, text inputs
- **Overlay** (`rgba(0, 0, 0, 0.8)`): Modal backdrop, dropdown scrim

### Shadows
- **Soft Elevation** (`rgba(0, 0, 0, 0.3) 0px 4px 16px 0px`): Panels, cards
- **Dropdown Shadow** (`rgba(0, 0, 0, 0.4) 0px 8px 24px 0px`): Modals, menus
- **Focus Ring** (`0 0 0 2px #0c0a09, 0 0 0 4px #10b981`): Keyboard focus indicator

---

## 3. Typography Rules

### Font Family
- **Body**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **Monospace**: `'SF Mono', Monaco, 'Courier New', monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Use |
|------|------|------|--------|-------------|-----|
| Page Title | System | 24px (1.5rem) | 600 | 1.2 | Main panel headings |
| Section Heading | System | 18px (1.125rem) | 600 | 1.3 | Panel section titles |
| Subsection | System | 16px (1rem) | 600 | 1.4 | Component group labels |
| Body | System | 14px (0.875rem) | 400 | 1.5 | Standard text, descriptions |
| Body Emphasis | System | 14px (0.875rem) | 500 | 1.5 | Highlighted labels |
| Small | System | 13px (0.8125rem) | 400 | 1.4 | Secondary info, hints |
| Tiny | System | 12px (0.75rem) | 400 | 1.3 | Fine print, status text |
| Coordinate | Monospace | 14px (0.875rem) | 400 | 1.6 | GPS coordinates, lat/lng |
| Speed Value | Monospace | 16px (1rem) | 500 | 1.4 | Speed display, numeric data |
| Button | System | 14px (0.875rem) | 500 | 1 | Button text |
| Button Large | System | 15px (0.9375rem) | 500 | 1 | Primary CTA text |

### Principles
- **System font supremacy**: Use the native font stack for seamless OS integration
- **Monospace for precision**: Coordinates and numeric values use monospace for alignment and technical feel
- **Compact line-heights**: Text runs tight (1.2-1.6) to maximize information density
- **Weight restraint**: Span 400-600; weight 500 for subtle emphasis, 600 for headings

---

## 4. Component Stylings

### Buttons

**Primary Emerald (CTA)**
- Background: `#10b981`
- Text: `#ffffff`
- Padding: `8px 16px`
- Radius: `8px`
- Font: System, 14px, weight 500
- Hover: `#059669` background
- Active: scale(0.98)
- Focus: `2px solid #10b981` ring
- Use: "Teleport", "Start Route", "Connect Device"

**Secondary Gray**
- Background: `#292524`
- Text: `#ffffff`
- Padding: `8px 16px`
- Radius: `8px`
- Font: System, 14px, weight 500
- Hover: `#44403c` background
- Border: `1px solid #44403c`
- Use: "Pause", "Resume", "Cancel"

**Ghost (Outline)**
- Background: `transparent`
- Text: `#10b981`
- Padding: `8px 16px`
- Radius: `8px`
- Border: `1px solid #10b981`
- Hover: `rgba(16, 185, 129, 0.1)` background
- Use: "Learn More", "View Details"

**Danger**
- Background: `#ef4444`
- Text: `#ffffff`
- Padding: `8px 16px`
- Radius: `8px`
- Hover: `#dc2626` background
- Use: "Stop All", "Disconnect", "Delete"

**Icon Button**
- Background: `transparent`
- Text: `#a8a29e`
- Padding: `8px`
- Radius: `6px`
- Size: 36x36px
- Hover: `#292524` background, `#ffffff` text
- Use: Refresh GPS, Settings, Close

### Inputs

**Text Input**
- Background: `#292524`
- Text: `#ffffff`
- Placeholder: `#a8a29e`
- Padding: `8px 12px`
- Radius: `8px`
- Border: `1px solid #44403c`
- Focus: `2px solid #10b981` ring, border becomes `#10b981`
- Font: System, 14px

**Coordinate Input**
- Background: `#292524`
- Text: `#e7e5e4`
- Font: Monospace, 14px
- Padding: `8px 12px`
- Radius: `8px`
- Border: `1px solid #44403c`
- Focus: `2px solid #10b981` ring

**Dropdown/Select**
- Background: `#292524`
- Text: `#ffffff`
- Padding: `8px 12px`
- Radius: `8px`
- Border: `1px solid #44403c`
- Hover: `#44403c` background
- Menu: `#1c1917` background, `0px 8px 24px rgba(0, 0, 0, 0.4)` shadow

### Cards & Panels

**Device Card**
- Background: `#1c1917`
- Border: `1px solid #44403c`
- Radius: `12px`
- Padding: `16px`
- Shadow: `rgba(0, 0, 0, 0.3) 0px 4px 16px 0px`
- Hover: `#292524` background (for interactive cards)

**Control Panel**
- Background: `#1c1917`
- Border: none
- Radius: `12px`
- Padding: `20px`
- Shadow: `rgba(0, 0, 0, 0.3) 0px 4px 16px 0px`

**Modal**
- Background: `#1c1917`
- Border: `1px solid #44403c`
- Radius: `16px`
- Padding: `24px`
- Shadow: `rgba(0, 0, 0, 0.4) 0px 8px 24px 0px`
- Backdrop: `rgba(0, 0, 0, 0.8)` with backdrop-filter blur(4px)

### Status Indicators

**GPS Active**
- Icon: Pulsing green dot
- Color: `#10b981`
- Animation: scale pulse (1.0 → 1.2 → 1.0) every 2s

**Device Connected**
- Border: `2px solid #22c55e`
- Background: `rgba(34, 197, 94, 0.1)`

**Device Offline**
- Border: `2px solid #78716c`
- Background: `#1c1917`
- Text: `#a8a29e`

**Cooldown Warning**
- Background: `#78350f`
- Border: `1px solid #f59e0b`
- Text: `#fbbf24`
- Icon: Amber alert triangle

### Navigation Tabs

**Tab Button**
- Background: `transparent`
- Text: `#a8a29e`
- Padding: `10px 16px`
- Radius: `8px`
- Font: System, 14px, weight 500
- Hover: `#292524` background, `#d6d3d1` text
- Active: `#10b981` text, `rgba(16, 185, 129, 0.15)` background, `2px solid #10b981` bottom border

---

## 5. Layout Principles

### Spacing System
- Base unit: `4px`
- Scale: `4px, 8px, 12px, 16px, 20px, 24px, 32px, 40px, 48px, 64px`
- Component internal padding: `8px, 12px, 16px`
- Section spacing: `20px, 24px, 32px`

### Grid & Structure
- **Three-panel layout** (Desktop):
  - Left Sidebar: `320px` fixed (Device list, Saved Locations)
  - Center Map: Flexible (takes remaining space)
  - Right Sidebar: `360px` fixed (Control panels)
- **Responsive Collapse**:
  - `<1024px`: Right sidebar becomes bottom sheet
  - `<768px`: Left sidebar collapses to hamburger, bottom sheet tabs
- **Panel scrolling**: Sidebars scroll independently, map stays fixed

### Border Radius Scale
- Micro (`6px`): Icon buttons, small tags
- Standard (`8px`): Buttons, inputs, most components
- Comfortable (`12px`): Cards, panels, device cards
- Large (`16px`): Modals, major containers
- Pill (`9999px`): Route waypoint numbers, status badges

### Whitespace Philosophy
- **Compact by default**: 16px padding on panels, 8px spacing between controls
- **Breathing room for hierarchy**: 24px between panel sections
- **Map dominance**: Minimal chrome around map, controls hug edges

---

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Base | No shadow, `#0c0a09` background | App background |
| Surface | `#1c1917` background, subtle shadow | Panels, sidebars |
| Elevated | `#292524` background, `rgba(0,0,0,0.3) 0px 4px 16px` | Cards, dropdowns |
| Modal | `#1c1917` background, `rgba(0,0,0,0.4) 0px 8px 24px`, `blur(4px)` backdrop | Modals, dialogs |
| Focus | `2px solid #10b981` ring | Keyboard focus |

**Shadow Philosophy**: Shadows are soft and subtle, mimicking diffused ambient light. Most elements exist on the base or surface level; elevation is reserved for dropdowns, modals, and cards that need to "float" above the interface.

---

## 7. Do's and Don'ts

### Do
- Use emerald (`#10b981`) ONLY for GPS-active states and primary actions — it must signal "live" or "go"
- Display coordinates in monospace font for alignment and precision
- Use pill-shaped badges for route waypoint numbers (e.g., "1", "2", "3")
- Keep map controls minimal — zoom buttons only, no unnecessary chrome
- Use translucent backdrops (`rgba(0,0,0,0.8)`) for modals to maintain context
- Apply subtle scale transforms (`scale(0.98)`) on button press for tactile feedback
- Use GPS pulsing indicator when location spoofing is active
- Keep text concise — labels should be <3 words, descriptions <10 words

### Don't
- Don't introduce additional accent colors — emerald is the singular GPS-active indicator
- Don't use light backgrounds — this is a dark-first app for extended use
- Don't add decorative elements — every pixel serves a function
- Don't use heavy shadows — keep elevation subtle
- Don't center-align body text or coordinates — left-align for scannability
- Don't use gradients on backgrounds — solid colors only
- Don't hide critical controls behind hamburger menus on desktop
- Don't use emoji icons — stick to lucide-react SVG icons

---

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <640px | Single panel + bottom sheet tabs |
| Tablet | 640-1024px | Map + bottom sheet, left sidebar collapses |
| Desktop Small | 1024-1280px | Three-panel layout begins |
| Desktop | 1280-1920px | Full layout, sidebars at standard width |
| Large Desktop | >1920px | Sidebars stay fixed width, map expands |

### Touch Targets
- Buttons: Minimum `36x36px` touch area
- Icon buttons: `36x36px` or `40x40px`
- Map markers: `40x40px` minimum
- Tab buttons: Minimum `44px` height

### Collapsing Strategy
- Desktop (`>1024px`): Three-panel layout, all panels visible
- Tablet (`640-1024px`): Left sidebar collapses to hamburger, right controls become bottom sheet
- Mobile (`<640px`): Full-screen map, bottom sheet nav with tabs (Teleport, Joystick, Route, Logs)
- Control panels stack vertically in bottom sheet
- Device list becomes dropdown selector on mobile

---

## 9. Agent Prompt Guide

### Quick Color Reference
- Primary CTA: Emerald (`#10b981`)
- App background: Pure Black (`#0c0a09`)
- Panel background: Charcoal (`#1c1917`)
- Primary text: White (`#ffffff`)
- Secondary text: Gray Light (`#d6d3d1`)
- Border: Charcoal Border (`#44403c`)
- Focus ring: Emerald (`#10b981`)
- Coordinate text: Monospace, `#e7e5e4`

### Example Component Prompts

**Device Card**
```
Create a device card: background #1c1917, border 1px solid #44403c, 12px border-radius, 16px padding. Top row: device name (14px, weight 500, white) and status badge (pill shape, emerald if connected). Second row: model info (13px, #a8a29e). Bottom row: two buttons side-by-side — "Test ADB" (ghost style) and "Setup GPS" (emerald primary).
```

**Speed Control**
```
Design a speed selector: four pill buttons in a horizontal row. Each button: 8px padding, 8px radius, #292524 background, white text. Active button: #10b981 background. Show speed value below in monospace (16px, #e7e5e4) with "km/h" suffix. Buttons: "Walk 5.0 km/h", "Cycle 18.5 km/h", "Drive 40 km/h", "Custom".
```

**Teleport Panel**
```
Build teleport panel on #1c1917 background. Title "Teleport" (18px, weight 600, white). Two coordinate inputs side-by-side: "Latitude" and "Longitude" (monospace, 14px, #292524 input background, 8px radius). Below: emerald "Teleport" button (full width, 15px text, weight 500). Show cooldown warning (amber background, #78350f, with alert icon) if distance > 500m.
```

**Map Marker**
```
GPS marker: 40x40px green pulsing circle (#10b981) with white center dot. CSS animation: scale from 1.0 to 1.2 to 1.0 over 2s, infinite loop. Shadow: rgba(16, 185, 129, 0.5) 0px 4px 12px.
```

### Iteration Guide
1. Emerald (`#10b981`) is the ONLY accent — use it for GPS-active states and primary CTAs
2. All backgrounds are dark: `#0c0a09` (app), `#1c1917` (panels), `#292524` (inputs/cards)
3. Coordinates MUST use monospace font (`'SF Mono', Monaco, 'Courier New'`)
4. Keep spacing tight: 8px internal padding, 16px panel padding, 24px between sections
5. Buttons get subtle scale transform on press (`transform: scale(0.98)`)
6. Map takes center stage — sidebars frame it, never compete with it
7. Focus rings are 2px emerald with 2px black offset for visibility
8. Text is concise — labels ≤3 words, descriptions ≤10 words
