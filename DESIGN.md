# DESIGN.md — Light 'E-Ink Paper' Developer Dashboard Spec

## 1. Palette & Surface Tokens

| Token | Hex / Value | Purpose |
|---|---|---|
| **App Canvas** | `#f4f1ea` | Warm paper base ground |
| **Raised Paper** | `#faf8f3` | Cards, sidebars, elevated surfaces |
| **Primary Ink** | `#141310` | High-contrast text, primary buttons, filled glyphs |
| **Secondary Ink** | `rgba(20, 19, 16, 0.62)` | Secondary labels, descriptions, durations |
| **Muted Meta** | `rgba(20, 19, 16, 0.42)` | Micro-headers, timestamps, subtle breadcrumbs |
| **Hairline Dividers** | `rgba(20, 19, 16, 0.14)` | 1px border lines and grid dividers |
| **Signal Red (Only Chroma)** | `#c8321e` | Reserved strictly for failed build row & error log tail |

---

## 2. Typography & Hierarchy

- **UI Headings & Body**: `IBM Plex Sans` (Weights: 400 Regular, 500 Medium, 600 SemiBold)
- **Data & Telemetry**: `IBM Plex Mono` with `font-variant-numeric: tabular-nums` (commit hashes, durations, deploy IDs, log lines, stats)
- **Micro-Headers**: Uppercase `10.5px - 11px`, `weight: 600`, `letter-spacing: 0.08em`, muted ink.

---

## 3. Ink Status Glyph Vocabulary

Never use green, blue, or yellow. Semantic states are expressed purely in ink:
- **Ready**: Solid filled `#141310` circle (`r=6`)
- **Building**: Half-filled `#141310` ring with spinning animation
- **Queued**: Empty `1.5px` stroked ring
- **Canceled**: Dashed-stroke ring (`stroke-dasharray="3 3"`)
- **Failed**: Filled `#c8321e` circle with white `x` (only colored element on page)

---

## 4. Texture & Borders

- **Dot Grain Texture**: Faint radial dot-grain applied to the hero card:
  `radial-gradient(rgba(20, 19, 16, 0.06) 0.65px, transparent 0.65px)` with `4px` grid size.
- **Zero Drop Shadows**: Hierarchy is built exclusively through 1px hairline borders, font weights, and paper-ground tonal contrasts.
- **Zero Gradients**: Flat surfaces with clean ink borders.

---

## 5. Structural Layout

- **Left Sidebar**: Fixed ~240px with workspace switcher ('SD'), Cmd+K search, main nav with active 3px ink rule, environments group, build quota meter (412/600), and user row.
- **Navbar**: 52px height with breadcrumb, segmented All/Production/Preview pill control, ghost filter, right sidebar chamber toggle, and solid-ink Deploy button.
- **Hero Card**: Current production with 4-stage pipeline rail (Build, Test, Bundle, Deploy summing exactly to 2m 41s).
- **Deployments Table**: Dense table with ~44px rows, branch chips, commit messages, and redeploy action.
- **Bottom Split**: Last failed build log excerpt with signal red error lines + Deploys last 14 days stepped ink bar chart.
- **Right Sidebar**: Double panel containing the **AI Oh-My-Pi Chamber** (interactive prompt/diagnostic assistant) and **Deployment Inspector** (runtime properties & stage breakdown).
