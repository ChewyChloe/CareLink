---
name: Tender Bloom Baby Care
colors:
  surface: '#fbf9f5'
  surface-dim: '#dbdad6'
  surface-bright: '#fbf9f5'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3ef'
  surface-container: '#efeeea'
  surface-container-high: '#eae8e4'
  surface-container-highest: '#e4e2de'
  on-surface: '#1b1c1a'
  on-surface-variant: '#574143'
  inverse-surface: '#30312e'
  inverse-on-surface: '#f2f0ed'
  outline: '#8a7173'
  outline-variant: '#debfc1'
  surface-tint: '#a93349'
  primary: '#a93349'
  on-primary: '#ffffff'
  primary-container: '#fb7185'
  on-primary-container: '#6f0122'
  inverse-primary: '#ffb2b9'
  secondary: '#855316'
  on-secondary: '#ffffff'
  secondary-container: '#ffbc76'
  on-secondary-container: '#79490b'
  tertiary: '#00668a'
  on-tertiary: '#ffffff'
  tertiary-container: '#04a9e3'
  on-tertiary-container: '#003950'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdadc'
  primary-fixed-dim: '#ffb2b9'
  on-primary-fixed: '#400010'
  on-primary-fixed-variant: '#891933'
  secondary-fixed: '#ffdcbd'
  secondary-fixed-dim: '#fcb973'
  on-secondary-fixed: '#2c1600'
  on-secondary-fixed-variant: '#683c00'
  tertiary-fixed: '#c4e7ff'
  tertiary-fixed-dim: '#7bd0ff'
  on-tertiary-fixed: '#001e2c'
  on-tertiary-fixed-variant: '#004c69'
  background: '#fbf9f5'
  on-background: '#1b1c1a'
  surface-variant: '#e4e2de'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1.25rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.25rem
  space-xl: 1.75rem
---

## Brand & Style

The design system addresses parents, caregivers, and infant educators who require clarity, reassurance, and speed when recording daily milestones and checking infant status. The brand personality balances maternal gentleness with pediatric precision: comforting, reliable, orderly, and uplifting.

The design movement combines **Minimalism** with **Soft Organic Warmth**. Instead of loud solid pink banners, harsh dividing borders, or obstructive ad placements seen in legacy daycare portals, the interface uses a breathable cream background, rounded floating cards, friendly pastel category highlights, and refined typography. Every touchpoint reduces caregiver cognitive load while celebrating daily growth with subtle delight.

## Colors

- **Primary (`#FB7185`)**: A soft coral rose used for primary actions, active indicators, baby highlights, and vital badge states. It replaces the aggressive magenta tone with warm reassurance.
- **Secondary (`#FDBA74`)**: A sweet peach/apricot shade dedicated to nutrition, feeding schedules, bottle consumption, and routine alerts.
- **Tertiary (`#38BDF8`)**: A calming sky blue reserved for health telemetry, water intake, diaper changes, and sleep tracking, creating an intuitive mental map across diverse daily activities.
- **Neutral Background (`#FFFDF9`)**: A warm milk/cream surface, reducing the cold sterile glare of pure white while framing content in a soft, welcoming glow.
- **Text & Surface Contrast**: High-contrast text utilizes `#1E293B` (slate-800) for primary headings and `#475569` (slate-600) for subtext. Card surfaces leverage pure `#FFFFFF` with warm-tinted ambient borders (`rgba(251, 113, 133, 0.08)`).

## Typography

The design system adopts **Plus Jakarta Sans** for its friendly, rounded geometry, humanist terminals, and legibility on mobile viewports. For CJK glyphs (Traditional Chinese baby names, daycare log labels like 成長日記 and 托育聯絡簿), it pairs cleanly with system sans-serif font fallbacks (`PingFang TC`, `Noto Sans TC`).

- **Headlines**: Semi-bold to bold weights establish calm hierarchy without visual aggression.
- **Body**: Generous line-heights prevent cramped, spreadsheet-like reading of continuous care notes.
- **Numbers & Metrics**: Uses tabular figure alignments for time entries (e.g., 12:41) and liquid volumes (e.g., 210 ml).

## Layout & Spacing

A fluid single-column mobile layout provides thumb-accessible tracking with safe touch targets (minimum 48px).

- **Margins & Safe Zones**: Screens utilize `1.25rem` outer canvas padding to create breathing room from device edges.
- **Card Gaps**: Grouped list items and timeline blocks maintain a clean `1rem` vertical gap, avoiding the stacked bar feeling of generic table views.
- **Responsive Handling**: On tablets and wide formats, the layout transitions into a centered max-width container (640px) or an asymmetric two-pane split (baby profiles on left, daily logs on right).

## Elevation & Depth

Visual hierarchy uses **warm ambient shadows and tonal containment** rather than harsh border strokes:

- **Surface Neutral**: `#FFFDF9` forms the base canvas.
- **Base Cards**: Pure white (`#FFFFFF`) with a subtle peach-tinted shadow (`box-shadow: 0 4px 20px -2px rgba(251, 113, 133, 0.06), 0 2px 6px -1px rgba(0, 0, 0, 0.02)`) and a delicate feather border (`1px solid rgba(254, 226, 226, 0.6)`).
- **Interactive Modals & Floating Action Controls**: Elevated with soft diffusion (`box-shadow: 0 12px 32px -4px rgba(251, 113, 133, 0.16)`), providing floating feedback when switching between children or logging feeds.

## Shapes

The shape system embraces welcoming, tactile curves:
- **Child Cards & Form Containers**: Styled with `rounded-2xl` (1rem to 1.25rem radius) to eliminate sharp, clinical angles.
- **Avatar Pods**: Full circles (`rounded-full`) framed with pastel rings.
- **Quick Action Pills & Tags**: Fully rounded pill forms (`rounded-full`) for status indicators, unread flags, and metric counters.

## Components

### Baby Profile Cards
- Floating cards featuring a circular child photo or playful avatar on the left.
- Name rendered in `headline-md` with birthday or age subtext in `body-sm`.
- Quick action strip aligned along the bottom: Development Checklist, Growth Diary, and Monthly Analytics icons contained within subtle pastel circles (`#FFE4E6`, `#FEF3C7`, `#E0F2FE`).

### Category Logging Rows
- Replaces harsh table dividers with isolated floating list items or soft separators.
- Left-aligned icon nestled in a soft tinted pill reflecting its domain (bottle for feeding in peach, moon for sleep in soft lavender, droplet for bath in sky blue).
- Center text with activity title in `label-lg` and description in `body-md`.
- Right counter badge with pill styling indicating daily record counts (`0` or `3 records`).

### Timeline & Daily Log Feeds
- Left time-chip in coral pill format (`12:41`) accompanied by a continuous vertical guide dot.
- Activity notes contained in clean white cards with clear category tags, eliminating unformatted wall-of-text displays.
- Teacher/Caregiver signature badge placed subtly at the bottom corner with a read receipt status chip.

### Buttons & Inputs
- **Primary Buttons**: Warm gradient fill (`linear-gradient(135deg, #FB7185, #F43F5E)`) with soft white label text, subtle pill rounding, and smooth tap compression states.
- **Secondary Buttons**: Warm cream surface with coral outline and text.
- **Inputs**: Rounded-xl borders with cream background and coral focus rings (`ring-2 ring-rose-300`).