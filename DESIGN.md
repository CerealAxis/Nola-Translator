---
name: Nola Translator
description: A desktop translation interface for real-time bilingual reading, with an ice-blue canvas, blue primary actions, compact controls, and restrained feature accents.
colors:
  primary: "oklch(60% 0.22 257)"
  on-primary: "oklch(99% 0.002 255)"
  background: "oklch(97.8% 0.014 255)"
  surface: "oklch(99.6% 0.004 255)"
  surface-secondary: "oklch(97.4% 0.012 255)"
  surface-tertiary: "oklch(94.4% 0.024 255)"
  text: "oklch(22.5% 0.047 261)"
  text-muted: "oklch(57.5% 0.046 259)"
  border: "oklch(92.3% 0.026 255)"
  separator: "oklch(95.2% 0.013 255)"
  success: "oklch(71% 0.19 155)"
  warning: "oklch(73% 0.16 65)"
  danger: "oklch(64% 0.21 23)"
  feature-purple: "oklch(60% 0.24 298)"
  feature-orange: "oklch(67% 0.19 48)"
  feature-emerald: "oklch(76% 0.15 170)"
  dark-primary: "oklch(70% 0.16 257)"
  dark-background: "oklch(21% 0.039 259)"
  dark-surface: "oklch(27% 0.044 258)"
  dark-surface-secondary: "oklch(31% 0.048 258)"
  dark-surface-tertiary: "oklch(36% 0.051 258)"
  dark-text: "oklch(96% 0.014 255)"
  dark-text-muted: "oklch(74% 0.04 258)"
  dark-border: "oklch(37% 0.05 258)"
  dark-separator: "oklch(32% 0.044 258)"
  dark-success: "oklch(76% 0.16 157)"
  dark-warning: "oklch(80% 0.15 75)"
  dark-danger: "oklch(72% 0.18 22)"
  dark-feature-purple: "oklch(74% 0.17 298)"
  dark-feature-orange: "oklch(78% 0.14 48)"
  dark-feature-emerald: "oklch(80% 0.12 170)"
typography:
  display:
    fontFamily: "Segoe UI Variable Text, Noto Sans SC, system-ui, sans-serif"
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.2
  h1:
    fontFamily: "Segoe UI Variable Text, Noto Sans SC, system-ui, sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.25
  h2:
    fontFamily: "Segoe UI Variable Text, Noto Sans SC, system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "Segoe UI Variable Text, Noto Sans SC, system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Segoe UI Variable Text, Noto Sans SC, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.65
  body-strong:
    fontFamily: "Segoe UI Variable Text, Noto Sans SC, system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.45
  caption:
    fontFamily: "Segoe UI Variable Text, Noto Sans SC, system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Segoe UI Variable Text, Noto Sans SC, system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: 6px
  md: 8px
  lg: 12px
  xl: 16px
  2xl: 24px
  full: 9999px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 40px
  3xl: 48px
  4xl: 64px
  5xl: 80px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.xl}"
  button-primary-dark:
    backgroundColor: "{colors.dark-primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.xl}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  card-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.xl}"
    padding: "{spacing.lg}"
  panel:
    backgroundColor: "{colors.surface-secondary}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
  panel-dark:
    backgroundColor: "{colors.dark-surface-secondary}"
    textColor: "{colors.dark-text}"
    rounded: "{rounded.lg}"
    padding: "{spacing.md}"
---
## Overview

Nola Translator uses an **ice-blue canvas** (`{colors.background}`), bright content surfaces, and blue primary actions. The interface combines compact desktop controls with spacious bilingual reading areas. Segoe UI Variable Text and bundled Noto Sans regional fonts support English, Simplified Chinese, Traditional Chinese, Korean, and Japanese.

The surface hierarchy has three levels:

1. **Canvas** (`{colors.background}`) — the application shell and page background.
2. **Content surface** (`{colors.surface}`) — cards, settings groups, and reading panels.
3. **Secondary surface** (`{colors.surface-secondary}`) — supporting panels and controls, with `{colors.surface-tertiary}` for stronger separation.

Dark mode uses the corresponding `dark-*` colors with the same layout and component hierarchy.

**Key Characteristics:**

- Ice-blue backgrounds with dark blue-gray text in light mode; blue-gray surfaces with light text in dark mode.
- Blue primary gradients on main actions and selected sidebar items.
- Purple, orange, and mint accents for floating captions, records, and models.
- Sans-serif typography with regional CJK fallback fonts and tabular numerals for time and numeric data.
- Rounded controls, fine borders, subtle shadows, and stable reading layouts.
- Shared visual tokens across the desktop application, floating captions, browser player, and documentation demos.

## Colors

### Brand & Accent

- **Primary Blue** (`{colors.primary}` — oklch(60% 0.22 257)): Primary actions, links, focus, and selected states. Dark mode uses `{colors.dark-primary}` — oklch(70% 0.16 257).
- **On Primary** (`{colors.on-primary}` — oklch(99% 0.002 255)): Text and icons on primary surfaces in both themes.
- **Feature Purple** (`{colors.feature-purple}`): Floating-caption entry points.
- **Feature Orange** (`{colors.feature-orange}`): Record entry points.
- **Feature Emerald** (`{colors.feature-emerald}`): Model entry points.

Primary actions and selected sidebar items use `--nola-primary-gradient`: a 105deg gradient from the primary color to oklch(71% 0.16 257) in light mode and oklch(76% 0.12 257) in dark mode. Feature accents remain separate from status colors.

### Text

- **Text** (`{colors.text}` / `{colors.dark-text}`): Headings, body copy, and control labels; mapped to `--foreground`.
- **Muted Text** (`{colors.text-muted}` / `{colors.dark-text-muted}`): Descriptions, metadata, and placeholders; mapped to `--muted`.
- **Primary Foreground** (`{colors.on-primary}`): Content on blue primary actions.

### Surfaces

| Token | Use |
| --- | --- |
| `{colors.background}` | Application canvas |
| `{colors.surface}` | Cards and reading surfaces |
| `{colors.surface-secondary}` | Supporting panels and controls |
| `{colors.surface-tertiary}` | Stronger surface separation and highlighted rows |
| `{colors.border}` | Container and control boundaries |
| `{colors.separator}` | Subtle row dividers |

Each surface has a corresponding `dark-*` value. Fields use `--field-background`, `--field-foreground`, `--field-border`, and `--field-border-focus`. Popups use `--overlay` and `--overlay-foreground`. Floating-caption colors and opacity follow user settings.

### Semantic Colors

- **Success** (`{colors.success}`): Successful operations and healthy states.
- **Warning** (`{colors.warning}`): Conditions requiring attention.
- **Danger** (`{colors.danger}`): Errors and destructive actions.

Use text or icons alongside status colors. Theme values are defined in `src/renderer/theme/nola-light.css` and `nola-dark.css`. shadcn components use the `--nola-ui-*` mappings in `base-ui.css`: `muted` maps to a secondary surface, `muted-foreground` to Nola's muted text, and `accent` to the soft accent surface.

## Typography

### Font Families

- **Interface:** Segoe UI Variable Text, the current region's Noto Sans font, system-ui, sans-serif.
- **Regional CJK:** Bundled Noto Sans SC / TC / HK / KR / JP, selected by locale in `typography.css`.
- **Monospace:** Cascadia Mono, SF Mono, Consolas, regional CJK fallback, ui-monospace, monospace.

Caption fonts follow user settings and retain the current region's fallback font.

### Type Scale

| Token | Size | Weight | Line height | Use |
| --- | --- | --- | --- | --- |
| `{typography.display}` | 48px | 600 | 1.2 | Large display text |
| `{typography.h1}` | 32px | 600 | 1.25 | Major headings |
| `{typography.h2}` | 24px | 600 | 1.3 | Section headings |
| `{typography.title}` | 15px | 600 | 1.4 | Compact titles |
| `{typography.body}` | 14px | 400 | 1.65 | Continuous reading |
| `{typography.body-strong}` | 14px | 600 | 1.45 | Emphasized body text |
| `{typography.caption}` | 13px | 400 | 1.5 | Supporting descriptions |
| `{typography.label}` | 12px | 500 | 1.4 | Labels and metadata |

Page-specific typography uses `--nola-text-display` at 700 32px/1.25 and `--nola-text-title` at 650 20px/1.4. Use tabular numerals for time and numeric values. Caption previews reflect the configured caption size.

## Layout

### Grid System

| Region | Specification |
| --- | --- |
| Title bar | 64px high, outside the main scrolling region |
| Sidebar | 200px wide; 12px navigation padding and 8px gaps |
| Navigation item | 56px high, 16px radius, 16px icon-to-label gap, approximately 24px icons |
| Main content | 24px page padding, maximum width 1600px |
| Sections | 20px gaps; 16px in compact layouts |
| Cards | 20px standard padding; 24px for emphasized content |
| Settings rows | 44–52px high, labels and controls aligned |
| Fields | 38px shared control-height token; existing business controls use 36–40px |

The page provides one outer padding layer. Main content and reading panels manage their own vertical scrolling. Flex and grid children use `min-width: 0`; vertically shrinking regions use `min-height: 0`.

### Spacing Scale

| Token | Value |
| --- | --- |
| `{spacing.sm}` | 8px |
| `{spacing.md}` | 16px |
| `{spacing.lg}` | 24px |
| `{spacing.xl}` | 32px |
| `{spacing.2xl}` | 40px |
| `{spacing.3xl}` | 48px |
| `{spacing.4xl}` | 64px |
| `{spacing.5xl}` | 80px |

These map to `--space-1` through `--space-8`.

### Whitespace Philosophy

Use compact spacing for configuration and repeated actions, and generous line spacing for bilingual reading. Keep page padding, section gaps, and card padding at their respective container levels. Avoid duplicate outer padding.

## Elevation & Depth

| Level | Treatment | Use |
| --- | --- | --- |
| Canvas | Background color | Application shell |
| Content surface | Surface color and fine border | Cards and reading panels |
| Secondary surface | Secondary or tertiary surface color | Supporting panels and highlighted controls |
| Surface shadow | `--surface-shadow` | Subtle card separation |
| Overlay shadow | `--overlay-shadow` | Menus, popups, and dialogs |

Light-mode surface shadow: `0 2px 10px rgba(35,72,125,.04)`. Dark-mode surface shadow: `0 2px 10px rgba(15,25,45,.12)`.

Light-mode overlay shadow: `0 12px 36px rgba(35,72,125,.14)`. Dark-mode overlay shadow: `0 12px 36px rgba(10,20,40,.32)`.

### Decorative Depth

Background decoration uses low-contrast glows and broad diagonal bands. Floating captions may use translucent glass with user-configured opacity. Cards remain visually stable during interaction.

Motion uses `--dur-micro` at 120ms, `--dur-enter` at 200ms, `--dur-exit` at 120ms, and `--dur-page` at 160ms. Respect both system and application reduced-motion settings.

## Shapes

### Border Radius Scale

| Token | Value | Use |
| --- | --- | --- |
| `{rounded.sm}` | 6px | Small details |
| `{rounded.md}` | 8px | Shared field-radius base |
| `{rounded.lg}` | 12px | Base panels and cards |
| `{rounded.xl}` | 16px | Product buttons, navigation items, and business cards |
| `{rounded.2xl}` | 24px | Large rounded containers |
| `{rounded.full}` | 9999px | Circular elements |

Fields use `--field-radius`, overridden to .625rem in `app.css`. Title-bar controls retain their window-specific geometry.

### Photography & Illustrations

The home page pairs a compact horizontal hero with an illustration on the right. Browser connections use the official Chrome, Edge, and Firefox assets. About and acknowledgments use avatars. Product demos reuse the application UI and identify simulated content.

## Components

### Top Navigation

**TitleBar** — A 64px window header with application controls. Electron drag regions exclude interactive controls.

**NavigationItem** — A 56px sidebar item with a visible surface, icon, and label. The selected item uses the primary gradient. The collapsed sidebar retains tooltips and accessible names.

### Buttons

**`button-primary`** — Primary action with `{colors.primary}`, `{colors.on-primary}`, `{typography.body-strong}`, and `{rounded.xl}`. Product styling applies the primary gradient.

**Secondary button** — `secondary` or `outline` variant with a visible surface and semantic border. Uses the same product radius as the primary action.

**Destructive button** — `destructive` variant, or the existing `danger` alias, for destructive actions.

**Icon button** — A visible background and an accessible name. Title-bar controls follow their dedicated styling.

**Async button** — Compose Button, Spinner, and a disabled state. Retain the action label and prevent duplicate activation while work is running. See [Button](https://ui.shadcn.com/docs/components/base/button).

### Cards & Containers

**`card` / `card-dark`** — Business cards with the theme surface, foreground, `{rounded.xl}`, and `{spacing.lg}` padding for emphasized content.

**`panel` / `panel-dark`** — Supporting panels with the secondary surface, `{rounded.lg}`, and `{spacing.md}` padding.

**SectionCard** — Settings and content groups with a title, optional description, content, and related actions.

**Table Card** — Records with search, sorting, pagination, and row actions. The home page shows up to three recent records with a view-all action.

**ModelCard** — Model identity, capabilities, installation state, and aligned actions. Model management groups recommended, installed, search, and download content in tabs.

**Reading panels** — Sentence-aligned source and translation, a soft blue highlight for the latest sentence, collapsible notes, and adjacent session controls.

### Inputs & Forms

**Text input** — Uses field background, foreground, border, focus, height, and radius tokens. Labels remain visible independently of placeholders.

**Field group** — Compose FieldGroup, Field, labels, descriptions, and FieldError. Associate each label with its control; use `aria-invalid` and a visible error message for validation. Reflect disabled state on the field and control. Existing SettingRow layouts retain their product alignment. See [Field](https://ui.shadcn.com/docs/components/base/field).

**Selection controls** — Select or Combobox for languages and models; Switch, Slider, NumberField, and ColorPicker for their corresponding settings. Language lists scroll within the adjacent popup.

**Empty state** — Use Empty with a title, description, and next action. Distinguish an empty collection from no search results. See [Empty](https://ui.shadcn.com/docs/components/base/empty).

### Tags / Badges

**StatusPill / Badge** — Connection, session, installation, and download states, with descriptive text and semantic colors. Model capabilities reflect the actual configuration.

### Tab / Filter

**Tabs** — Switch between sibling content panels, with triggers inside TabsList.

**ToggleGroup** — Related selection options using the control's value-change interface.

**Search and filters** — Remain within the list context; secondary columns may be hidden in narrow layouts.

### CTA / Footer

Primary actions sit in PageHeader, configuration toolbars, or session controls. Documentation download actions use the shared product theme.

## Do's and Don'ts

### Do

- Use semantic theme tokens and existing shadcn Base UI components.
- Use the blue gradient for primary actions and selected navigation.
- Use regional CJK fonts and the six locale dictionaries for interface text.
- Keep source and translated sentences aligned and preserve source text when translation fails.
- Provide accessible names, visible focus, dialog titles, and keyboard-reachable actions.
- Use Button with native `onClick`; use each compound control's actual value-change API.
- Give async operations visible feedback and errors a recovery action.
- Use the existing stacking classes: `.z-base` (0), `.z-caption-scrim` (10), `.z-sticky` (20), `.z-caption-actions` (30), `.z-dropdown` (40), `.z-overlay` (60), `.z-popup` (65), `.z-onboarding` (70), `.z-toast` (80), and `.z-titlebar-drag` (100).

### Don't

- Add literal theme colors or arbitrary spacing and radius values to components.
- Use `ghost` buttons or backgroundless product icon buttons.
- Add heavy black shadows, large card lifts, or continuous decorative animations.
- Substitute screenshots or fabricated data for functional UI and real state.
- Hide the source text after translation fails, or substitute source text in translation-only mode.
- Use viewport sizing, negative margins, or fixed positioning to escape the page shell.
- Add literal z-index utilities or bypass the shared stacking scale.
- Introduce HeroUI, legacy component APIs, native confirmation dialogs, or unsupported account and sharing features.

## Responsive Behavior

### Breakpoints

| Condition | Key Changes |
| --- | --- |
| Width > 1024px | 200px sidebar, 24px page padding, maximum content width 1600px |
| Width <= 1024px | 76px icon sidebar, tooltips and accessible names, 20px page padding |
| Height <= 700px | 16px page padding and internally scrolling content |

### Touch Targets

Sidebar navigation items are 56px high. Settings rows are 44–52px high. Shared fields use a 38px control-height token. Buttons retain the existing component and business sizes.

### Collapsing Strategy

- Home entry cards change from four columns to two or one as content width decreases.
- The workspace collapses notes and allows source and translation to stack vertically.
- Model grids collapse to one column.
- Settings secondary navigation becomes horizontal; controls can move below labels.
- Tables hide secondary columns instead of overflowing horizontally.

### Image Behavior

Illustrations scale proportionally. Browser icons retain their aspect ratio. Caption placement is stored relative to video height and avoids player controls; resizing recalculates visible lines and keeps the latest content visible.

## Iteration Guide

1. Work on one component at a time and reference its YAML key where available.
2. Reuse the existing theme tokens and component variants.
3. Keep YAML values synchronized with the corresponding theme CSS.
4. Preserve the blue canvas, primary gradient, regional typography, and component radius hierarchy.
5. Check the affected page in both themes, six locales, and relevant window sizes.

## Known Gaps

- Floating-caption colors, fonts, and opacity depend on user settings rather than fixed YAML values.
- Contrast over variable video backgrounds requires checking the configured caption appearance against actual content.
- A shared touchscreen target-size specification has not been defined.
