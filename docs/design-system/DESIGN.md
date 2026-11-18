---
version: alpha
name: Nola Translator
title: DESIGN.md
description: A neutral gray desktop interface with blue actions, readable multilingual content, and paired light and dark themes.
---

# DESIGN.md

## Overview

Nola Translator is a workspace for translation, reading, and language tools. Keep the interface quiet, precise, and dependable. Source text, translated text, and the current task lead the composition. Neutral gray surfaces organize the workspace; blue identifies meaningful actions and selections.

Use a compact desktop rhythm, semantic text styles, and familiar shadcn/ui shapes. Settings resemble an organized form, translation results resemble a readable document, and editors give their canvas the available space. Keep cards, headings, and backgrounds subordinate to these tasks.

| Principle | Application |
| --- | --- |
| [Proximity](./principles/structure.md) | Keep a label closer to its control than to the next field. Separate unrelated groups with more space. |
| [Alignment](./principles/alignment.md) | Share a leading edge across headings and content. Align comparable numbers at the trailing edge. |
| [Contrast](./principles/contrast.md) | Distinguish primary actions and text roles. Give equally consequential choices equal visual weight. |
| [Repetition](./principles/repetition.md) | Repeat field order, component variants, terminology, and state placement across similar tasks. |
| [Direct manipulation](./principles/interaction.md) | Edit simple values beside their content. Provide a button alternative to dragging. |
| [Stay in context](./principles/stay.md) | Reveal details inline or nearby, retaining selection, filters, and scroll position. |
| [Simplified interaction](./principles/lightweight.md) | Keep essential tools visible and beside their objects. Reveal secondary tools on hover and keyboard focus. |
| [Invitation](./principles/invitation.md) | Make the next action discoverable. An empty state offers an explicit first step. |
| [Transition](./principles/transition.md) | Explain a change with a short transition while surrounding content remains stable. |
| [Immediate response](./principles/response.md) | Acknowledge input immediately, display real progress, and preserve input after failure. |

## Colors

```yaml
colors:
  background: "oklch(0.9700 0.0029 264.5420)"
  foreground: "#000000E0"
  card: "oklch(1.0000 0 0)"
  card-foreground: "#000000E0"
  popover: "oklch(1.0000 0 0)"
  popover-foreground: "#000000E0"
  primary: "oklch(0.5700 0.1903 257.9419)"
  primary-foreground: "oklch(1.0000 0 0)"
  secondary: "oklch(0.9394 0.0046 258.3251)"
  secondary-foreground: "oklch(0.2786 0.0211 257.2774)"
  muted: "oklch(0.9504 0.0042 236.4983)"
  muted-foreground: "#000000A6"
  accent: "oklch(0.9209 0.0294 257.7666)"
  accent-foreground: "oklch(0.3232 0.1376 260.7577)"
  destructive: "oklch(0.5700 0.2203 24.8903)"
  destructive-foreground: "oklch(1.0000 0 0)"
  border: "oklch(0.8994 0.0064 255.4779)"
  input: "oklch(0.6200 0.0052 247.8807)"
  ring: "oklch(0.6007 0.1903 257.9419)"
  chart-1: "oklch(0.6007 0.1903 257.9419)"
  chart-2: "oklch(0.6369 0.1247 171.0112)"
  chart-3: "oklch(0.5495 0.2003 300.1164)"
  chart-4: "oklch(0.6806 0.1901 45.0513)"
  chart-5: "oklch(0.6198 0.2297 5.1656)"
  sidebar: "oklch(0.9504 0.0042 236.4983)"
  sidebar-foreground: "#000000E0"
  sidebar-primary: "oklch(0.6007 0.1903 257.9419)"
  sidebar-primary-foreground: "oklch(1.0000 0 0)"
  sidebar-accent: "oklch(0.9209 0.0294 257.7666)"
  sidebar-accent-foreground: "oklch(0.3232 0.1376 260.7577)"
  sidebar-border: "oklch(0.8994 0.0064 255.4779)"
  sidebar-ring: "oklch(0.6007 0.1903 257.9419)"
  background-dark: "oklch(0.1492 0.0093 263.9667)"
  foreground-dark: "#FFFFFFD9"
  card-dark: "oklch(0.1993 0.0111 260.6610)"
  card-foreground-dark: "#FFFFFFD9"
  popover-dark: "oklch(0.2298 0.0107 260.6838)"
  popover-foreground-dark: "#FFFFFFD9"
  primary-dark: "oklch(0.6496 0.1885 257.7207)"
  primary-foreground-dark: "oklch(0.1205 0.0097 252.8876)"
  secondary-dark: "oklch(0.2411 0.0097 248.2290)"
  secondary-foreground-dark: "oklch(0.9008 0.0105 247.9427)"
  muted-dark: "oklch(0.2207 0.0091 255.6084)"
  muted-foreground-dark: "#FFFFFFA6"
  accent-dark: "oklch(0.2804 0.0598 257.7090)"
  accent-foreground-dark: "oklch(0.8435 0.0803 251.0277)"
  destructive-dark: "oklch(0.6789 0.2096 21.9475)"
  destructive-foreground-dark: "#000000E0"
  border-dark: "oklch(0.2800 0.0102 260.7048)"
  input-dark: "oklch(0.5500 0.0102 260.7048)"
  ring-dark: "oklch(0.6496 0.1885 257.7207)"
  chart-1-dark: "oklch(0.6496 0.1885 257.7207)"
  chart-2-dark: "oklch(0.6943 0.1346 171.9868)"
  chart-3-dark: "oklch(0.6203 0.1997 300.1454)"
  chart-4-dark: "oklch(0.7171 0.1878 45.3388)"
  chart-5-dark: "oklch(0.6604 0.2297 5.1368)"
  sidebar-dark: "oklch(0.1808 0.0095 255.6419)"
  sidebar-foreground-dark: "#FFFFFFD9"
  sidebar-primary-dark: "oklch(0.6496 0.1885 257.7207)"
  sidebar-primary-foreground-dark: "oklch(0.1205 0.0097 252.8876)"
  sidebar-accent-dark: "oklch(0.2804 0.0598 257.7090)"
  sidebar-accent-foreground-dark: "oklch(0.8435 0.0803 251.0277)"
  sidebar-border-dark: "oklch(0.2594 0.0104 260.6979)"
  sidebar-ring-dark: "oklch(0.6496 0.1885 257.7207)"
```

## Typography

| Style | Light size | Dark size | Line height | Weight | Dark tracking | Use |
| --- | --- | --- | --- | --- | --- | --- |
| H1 | 36px | 36px | 40px | 800 | normal | Main page title |
| H2 | 30px | 30px | 36px | 600 | normal | Main section |
| H3 | 24px | 24px | 32px | 600 | normal | Subsection |
| H4 | 20px | 20px | 28px | 600 | normal | Nested group heading |
| Body | 14px | 15px | 22px | 400 | 0.015em | Prose, navigation, controls, table values |
| Small | 14px | 14px | 20px | 500 | 0.02em | Short status or emphasized supporting text |
| Muted | 14px | 14px | 20px | inherit | 0.02em | Description or metadata |
| Code | 14px | 14px | 20px | 600 | normal | Code, command, log or API model identifier |

| Text role | Light | Dark |
| --- | --- | --- |
| `text-primary` | `#000000E0` | `#FFFFFFD9` |
| `text-secondary` | `#000000A6` | `#FFFFFFA6` |
| `text-disabled` | `#00000040` | `#FFFFFF40` |

## Layout

```yaml
spacing:
  base: 0.25rem
  page-padding: 24px
  narrow-page-padding: 16px
  panel-gap: 16px
  control-height: 36px
  panel-padding: 20px
  field-gap: 16px
  label-gap: 8px
  description-gap: 4px
  page-heading-gap: 16px
  section-heading-gap: 12px
  paragraph-gap: 8px
  reading-paragraph-gap: 12px
  comfortable-control-height: 44px
  comfortable-panel-padding: 28px
  comfortable-panel-gap: 20px
  comfortable-field-gap: 20px
```

## Materials

Content, ordinary cards, settings, menus, dialogs, and other regular popups use solid surfaces. Remove global glass overrides from base components. A subtitle toolbar or a small tool panel over media or a canvas may explicitly opt into glass. Avoid applying it to both a panel and its children. At most one or two glass surfaces should appear together, each supporting its overlay context.

Manage the main window backing material independently from content surfaces. Retain user transparency and reduced-transparency preferences in the allowed scenes. Verify text contrast over the actual backdrop, and provide solid fallbacks for unsupported blur, increased contrast, and reduced transparency. Blur, opacity, borders, and shadows must not turn ordinary content into glass by inheritance.

## Elevation & Depth

```css
:root {
  --shadow-x: 0px;
  --shadow-y: 2px;
  --shadow-blur: 28px;
  --shadow-spread: 0px;
  --shadow-opacity: 0.10;
  --shadow-color: #4e5661;
  --shadow-2xs: 0px 2px 28px 0px hsl(214.7368 10.8571% 34.3137% / 0.05);
  --shadow-xs: 0px 2px 28px 0px hsl(214.7368 10.8571% 34.3137% / 0.05);
  --shadow-sm: 0px 2px 28px 0px hsl(214.7368 10.8571% 34.3137% / 0.10), 0px 1px 2px -1px hsl(214.7368 10.8571% 34.3137% / 0.10);
  --shadow: 0px 2px 28px 0px hsl(214.7368 10.8571% 34.3137% / 0.10), 0px 1px 2px -1px hsl(214.7368 10.8571% 34.3137% / 0.10);
  --shadow-md: 0px 2px 28px 0px hsl(214.7368 10.8571% 34.3137% / 0.10), 0px 2px 4px -1px hsl(214.7368 10.8571% 34.3137% / 0.10);
  --shadow-lg: 0px 2px 28px 0px hsl(214.7368 10.8571% 34.3137% / 0.10), 0px 4px 6px -1px hsl(214.7368 10.8571% 34.3137% / 0.10);
  --shadow-xl: 0px 2px 28px 0px hsl(214.7368 10.8571% 34.3137% / 0.10), 0px 8px 10px -1px hsl(214.7368 10.8571% 34.3137% / 0.10);
  --shadow-2xl: 0px 2px 28px 0px hsl(214.7368 10.8571% 34.3137% / 0.25);
}

.dark {
  --shadow-x: 0px;
  --shadow-y: 4px;
  --shadow-blur: 40px;
  --shadow-spread: 0px;
  --shadow-opacity: 0.45;
  --shadow-color: #000000;
  --shadow-2xs: 0px 4px 40px 0px hsl(0 0% 0% / 0.23);
  --shadow-xs: 0px 4px 40px 0px hsl(0 0% 0% / 0.23);
  --shadow-sm: 0px 4px 40px 0px hsl(0 0% 0% / 0.45), 0px 1px 2px -1px hsl(0 0% 0% / 0.45);
  --shadow: 0px 4px 40px 0px hsl(0 0% 0% / 0.45), 0px 1px 2px -1px hsl(0 0% 0% / 0.45);
  --shadow-md: 0px 4px 40px 0px hsl(0 0% 0% / 0.45), 0px 2px 4px -1px hsl(0 0% 0% / 0.45);
  --shadow-lg: 0px 4px 40px 0px hsl(0 0% 0% / 0.45), 0px 4px 6px -1px hsl(0 0% 0% / 0.45);
  --shadow-xl: 0px 4px 40px 0px hsl(0 0% 0% / 0.45), 0px 8px 10px -1px hsl(0 0% 0% / 0.45);
  --shadow-2xl: 0px 4px 40px 0px hsl(0 0% 0% / 1);
}
```

## Shapes

```yaml
rounded:
  base: 0.875rem
  base-dark: 1.5rem
  sm: 10px
  md: 12px
  lg: 14px
  xl: 18px
  sm-dark: 20px
  md-dark: 22px
  lg-dark: 24px
  xl-dark: 18px
  button: 18px
  demo-control: "{rounded.button}"
  demo-card: 14px
  demo-tab: 6px
  demo-dialog: 14px
  demo-plugin: 14px
  foundation-card: 12px
  foundation-code: 4px
```

## Components

```yaml
components:
  demo-button:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.button}"
    padding: "0 16px"
    height: "{spacing.control-height}"
  demo-button-default:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
  demo-button-default-dark:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.primary-foreground-dark}"
  demo-button-secondary:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
  demo-button-link:
    backgroundColor: transparent
    textColor: "{colors.primary}"
  demo-button-icon:
    width: "{spacing.control-height}"
    padding: 0px
  demo-input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.demo-control}"
    height: "{spacing.control-height}"
    width: "100%"
  demo-card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.demo-card}"
  demo-tab-list:
    backgroundColor: "{colors.muted}"
    rounded: "{rounded.demo-control}"
    height: 36px
    padding: 4px
  demo-tab:
    textColor: "{colors.muted-foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.demo-tab}"
    height: 28px
  demo-tab-selected:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
  demo-tooltip:
    backgroundColor: "{colors.foreground}"
    textColor: "{colors.card}"
    typography: "{typography.muted}"
    rounded: "{rounded.demo-tab}"
    padding: "4px 8px"
  foundation-button:
    typography: "{typography.body}"
    padding: "0 12px"
    height: "{spacing.control-height}"
  foundation-button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
  foundation-button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.destructive-foreground}"
  foundation-card:
    rounded: "{rounded.foundation-card}"
  foundation-code:
    backgroundColor: "{colors.secondary}"
    typography: "{typography.code}"
    rounded: "{rounded.foundation-code}"
    padding: "2px 4px"
```