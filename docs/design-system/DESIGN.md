---
version: alpha
name: Nola Translator
description: A neutral gray desktop interface with blue actions, readable multilingual content, and paired light and dark themes.
---

# Nola Translator Design System

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

Use achromatic grays for the shell, content, and controls. Blue is the general interaction accent. Green, amber, and red convey status. Provider logos, images, and user content retain their colors.

Light mode separates a pale gray workspace from white content. Dark mode uses a charcoal workspace, a slightly lighter content surface, and a brighter floating surface. Switch the semantic palette together while keeping geometry and information hierarchy stable.

```yaml
colors:
  primary: "#1D4ED8"
  primary-hover: "#1E40AF"
  primary-active: "#1E3A8A"
  primary-foreground: "#FFFFFF"
  background: "#FAFAFA"
  foreground: "#171717"
  card: "#FFFFFF"
  popover: "#FFFFFF"
  muted: "#F5F5F5"
  muted-foreground: "#666666"
  accent: "#EDEDED"
  selection: "#EFF6FF"
  selection-foreground: "#1D4ED8"
  border: "#D4D4D4"
  input: "#858585"
  ring: "#1D4ED8"
  success: "#166534"
  warning: "#854D0E"
  destructive: "#B91C1C"
  primary-dark: "#60A5FA"
  primary-hover-dark: "#93C5FD"
  primary-active-dark: "#3B82F6"
  primary-foreground-dark: "#171717"
  background-dark: "#171717"
  foreground-dark: "#F5F5F5"
  card-dark: "#1F1F1F"
  popover-dark: "#292929"
  muted-dark: "#262626"
  muted-foreground-dark: "#A3A3A3"
  accent-dark: "#333333"
  selection-dark: "#172C48"
  selection-foreground-dark: "#93C5FD"
  border-dark: "#404040"
  input-dark: "#858585"
  ring-dark: "#60A5FA"
  success-dark: "#86EFAC"
  warning-dark: "#FCD34D"
  destructive-dark: "#FCA5A5"
```

### Semantic roles

Unsuffixed tokens are light values. A `-dark` token replaces its counterpart in dark mode. Component entries with that suffix override appearance while retaining base geometry and typography. Apply these token pairs in the theme stylesheet when switching appearance.

| Role | Application |
| --- | --- |
| `background` / `foreground` | Workspace background and default text. |
| `card` / `foreground` | Panels, editable fields, and reading surfaces. |
| `popover` / `foreground` | Menus, popovers, dialogs, and toasts. |
| `primary` / `primary-foreground` | Filled primary actions, checked controls, and active slider tracks. |
| `muted` / `muted-foreground` | Supporting surfaces and secondary text. Secondary text can also sit on card or background surfaces. |
| `accent` / `foreground` | Neutral hover and pressed surfaces for secondary controls and rows. |
| `selection` / `selection-foreground` | Selected navigation, options, and text highlights. |
| `border` | Decorative separators and panel boundaries. |
| `input` | Field outlines, unchecked controls, and other necessary control boundaries. |
| `ring` | Keyboard focus indicators. |
| `success`, `warning`, `destructive` | Status text and icons on neutral surfaces, paired with a label or recognizable symbol. |

Follow shadcn's [semantic surface and foreground pairing](https://ui.shadcn.com/docs/theming).

Use blue fill for the principal action in the current task region. Supporting actions use neutral fill or outline. Links use `primary` and an underline on hover and focus; prose links remain underlined. Selection retains a checkmark, indicator, or selected control state alongside the tint. Focus and selection can appear together.

Primary buttons use the explicit hover and active values for the current theme. Neutral controls use `accent` on hover and retain their boundary on press. Disabled controls retain their shape at 50% opacity and expose the disabled state. Necessary explanations remain readable outside the disabled control.

Status messages use neutral surfaces and a colored icon or label. Destructive confirmation buttons use the light `destructive` fill and white lettering in both modes. The pale red dark token is for status text and icons.

Normal text must reach 4.5:1 contrast. Meaningful boundaries, selection indicators, and focus outlines must reach 3:1 against adjacent surfaces. Decorative separators can be subtler because spacing also explains grouping. Use a 2px focus outline with a 2px offset; preserve the neutral gap around a filled blue control.

## Typography

Use the platform system sans serif for interface text and system monospace for code. Apple platforms obtain San Francisco through the system stack; Windows uses its system UI face. Select the language-specific Noto CJK fallback by content language.

Use semantic text roles, restrained weights, and layouts that grow with text, following [Apple's typography guidance](https://developer.apple.com/design/human-interface-guidelines/typography). Set interface body text at 14px with generous leading for multilingual content; use the reading style for long passages. Scale text through rem-based styles and responsive layouts.

```yaml
typography:
  display:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", var(--font-cjk-fallback, sans-serif), sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0em"
  title-1:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", var(--font-cjk-fallback, sans-serif), sans-serif"
    fontSize: "1.625rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0em"
  title-2:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", var(--font-cjk-fallback, sans-serif), sans-serif"
    fontSize: "1.375rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0em"
  title-3:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", var(--font-cjk-fallback, sans-serif), sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0em"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", var(--font-cjk-fallback, sans-serif), sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0em"
  body-strong:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", var(--font-cjk-fallback, sans-serif), sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.6
    letterSpacing: "0em"
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", var(--font-cjk-fallback, sans-serif), sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "0em"
  caption:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", var(--font-cjk-fallback, sans-serif), sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  reading:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", var(--font-cjk-fallback, sans-serif), sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "0em"
  code:
    fontFamily: "ui-monospace, \"SF Mono\", \"Cascadia Mono\", Consolas, var(--font-cjk-fallback, monospace), monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
```

### Text styles

Pixel equivalents assume a 16px root. Keep sizes in rem and preserve browser or application zoom. Line height is a unitless multiplier, so the leading scales with the text. Apply each role as a complete style.

| Role | Size | Weight | Line height | Use |
| --- | --- | --- | --- | --- |
| `display` | 32px | 600 | 1.25 | A short welcome or introduction heading. |
| `title-1` | 26px | 600 | 1.25 | One page title. |
| `title-2` | 22px | 600 | 1.3 | Dialog titles and major sections. |
| `title-3` | 17px | 600 | 1.4 | Panel and card titles. |
| `body` | 14px | 400 | 1.6 | Interface prose, input values, and table content. |
| `body-strong` | 14px | 600 | 1.6 | Emphasis within ordinary content. |
| `label` | 14px | 500 | 1.5 | Fields, buttons, navigation, table headers, and toast titles. |
| `caption` | 12px | 400 | 1.5 | Metadata, timestamps, and toast descriptions. |
| `reading` | 17px | 400 | 1.65 | Translation passages, notes, and conversation prose. |
| `code` | 13px | 400 | 1.5 | Code, paths, model identifiers, and diagnostic values. |

Use natural letter spacing and optical sizing where available. Align text at the logical start. Comparable numeric columns use tabular numerals and consistent units and precision. Give each source and translated passage its own language and direction; isolate paths and identifiers within mixed-direction text.

Labels, errors, and descriptions can wrap. A filename can truncate when its full value remains available through an accessible detail or copy action. Translation passages remain complete. Retain source/translation pairing as passages grow. User-configured caption size, line count, and backdrop stay independent of interface styles.

## Layout

Build around the task, using shared leading edges and a small spacing scale. Fields form groups; groups form sections. Use whitespace first, then a separator if the relationship needs clarification. Use cards to contain related content.

```yaml
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
  label-gap: "6px"
  field-gap: "16px"
  group-gap: "24px"
  section-gap: "32px"
  page-padding: "24px"
  narrow-page-padding: "16px"
  panel-padding: "24px"
  control-inset: "12px"
  action-gap: "8px"
```

### Page composition

Use a 240px expanded navigation rail and a 56px collapsed rail as the desktop shell's starting geometry. Keep the current destination identifiable in either form. Sidebar switches destinations, Tabs switch peer views of one object, and Breadcrumb expresses hierarchy. Native window controls and drag regions follow platform constraints.

| Content | Width and arrangement |
| --- | --- |
| Settings | A leading-aligned column, maximum 48rem. One section title per related group. |
| Lists and libraries | Maximum 72rem for ordinary collections. Dense tables can use the remaining width. |
| Reading | Maximum 46rem for a passage. A bilingual view can use two equal columns. |
| Editors | Available space for the canvas, with a 15rem item list and a 20rem inspector when they fit. |
| Dialogs | Maximum 32rem for a normal task; 48rem when comparison or multiple columns need it. |

Treat these widths as maximums and let containers shrink with the available space. Floating content retains at least 16px at viewport edges. Dialogs have a maximum height of 80dvh with scrollable content and reachable titles and actions.

Below 40rem of available content width, use 16px page padding and stack settings labels above controls. Two-column forms need at least 15rem per field plus the group gap; otherwise stack whole fields. Bilingual text stacks source above translation below 45rem. Editors preserve canvas space by collapsing the inspector into a Sheet, then replacing the item list with a picker if necessary. Use the affected content area's width, including under zoom.

### Forms and rows

Default desktop buttons and single-line fields are 36px high. Textareas, multiline rows, and validation messages grow with content. A 16px icon sits within a minimum 36 × 36px icon-button target. Touch-oriented targets reach at least 44 × 44px without overlapping adjacent targets.

Use 6px between label and control, 16px between fields, 24px between related groups, and 32px between sections. Action buttons have an 8px gap. Align the group to the form's logical end, with the primary action last. Consequential peer choices retain equal emphasis.

Horizontal settings use a shared 10rem label column, a 24px gutter, and a flexible control column; narrow layouts stack labels above controls. Numeric table cells align at the end; names and prose align at the start. Preserve columns during inline editing and keep row actions beside their object.

Ordinary pages have one main scrolling region. Independent panes belong to editors and reading workspaces that need persistent tools. Use the existing ScrollArea when needed, retaining operable scrollbars and keyboard scrolling. Long menus scroll within the viewport and keep the selected item in view.

## Elevation & Depth

Use tonal surfaces, spacing, and a 1px border to express structure. Panels normally have no shadow. Reserve elevation for floating content.

| Surface | Light shadow | Dark shadow |
| --- | --- | --- |
| Menu or popover | `0 4px 16px rgb(0 0 0 / 12%)` | `0 4px 16px rgb(0 0 0 / 32%)` |
| Dialog or sheet | `0 16px 48px rgb(0 0 0 / 16%)` | `0 16px 48px rgb(0 0 0 / 48%)` |

Keep the opaque popover surface and 1px border visible in both modes. A modal backdrop uses `rgb(0 0 0 / 32%)` in light mode and `rgb(0 0 0 / 56%)` in dark mode. Tooltips and menus do not dim the page.

Base UI owns portal stacking, focus containment, dismissal, and focus restoration. A tooltip opened from a dialog remains above it without page-specific z-index overrides. Solid surfaces are standard; translucency belongs to a deliberate content-overlay need, such as captions over video with a readable backing.

## Shapes

Use softly rectangular shapes. Internal marks use small radii, fields and buttons share a control silhouette, and panels have slightly softer corners. Buttons use `--radius-xl`, set to 8px.

```yaml
rounded:
  none: "0px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "8px"
  2xl: "12px"
  full: "9999px"
```

| Shape | Radius |
| --- | --- |
| Buttons and icon buttons | `xl` — 8px. |
| Inputs, selects, and composer controls | `lg` — 8px. |
| Menu items, selected navigation rows, badges, and tooltips | `md` — 6px. |
| Cards, dialogs, sheets, menus, popovers, and toasts | `2xl` — 12px. |
| Skeleton details and small thumbnails | `sm` — 4px. |
| Avatars and slider thumbs | `full`. Circular elements only. |

Use Lucide outline icons for actions, normally 16px with the library's default stroke. Use 20px for larger navigation or empty-state compositions. Shared components size their own icons. LobeHub Icons identify providers; preserve their artwork and aspect ratio. Hide decorative icons from assistive technology and give icon-only actions accessible names. Avoid adding an icon to every label.

## Components

Compose existing [shadcn/ui Base UI components](https://ui.shadcn.com/docs/components) before creating visual primitives. Keep upstream anatomy and keyboard behavior. Theme values belong in shared components and adapters; page classes arrange layout. State entries override the corresponding base appearance.

```yaml
components:
  workspace:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    padding: "{spacing.page-padding}"
  workspace-dark:
    backgroundColor: "{colors.background-dark}"
    textColor: "{colors.foreground-dark}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.panel-padding}"
  card-dark:
    backgroundColor: "{colors.card-dark}"
    textColor: "{colors.foreground-dark}"
  floating-surface:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.lg}"
  floating-surface-dark:
    backgroundColor: "{colors.popover-dark}"
    textColor: "{colors.foreground-dark}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    height: "36px"
    padding: "{spacing.control-inset}"
  button-primary-dark:
    backgroundColor: "{colors.primary-dark}"
    textColor: "{colors.primary-foreground-dark}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.primary-foreground}"
  button-primary-hover-dark:
    backgroundColor: "{colors.primary-hover-dark}"
    textColor: "{colors.primary-foreground-dark}"
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.primary-foreground}"
  button-primary-active-dark:
    backgroundColor: "{colors.primary-active-dark}"
    textColor: "{colors.primary-foreground-dark}"
  button-secondary:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    height: "36px"
    padding: "{spacing.control-inset}"
  button-secondary-dark:
    backgroundColor: "{colors.muted-dark}"
    textColor: "{colors.foreground-dark}"
  neutral-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.foreground}"
  neutral-hover-dark:
    backgroundColor: "{colors.accent-dark}"
    textColor: "{colors.foreground-dark}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.xl}"
    height: "36px"
    padding: "{spacing.control-inset}"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    height: "36px"
    padding: "{spacing.control-inset}"
  input-dark:
    backgroundColor: "{colors.card-dark}"
    textColor: "{colors.foreground-dark}"
  selected-item:
    backgroundColor: "{colors.selection}"
    textColor: "{colors.selection-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
  selected-item-dark:
    backgroundColor: "{colors.selection-dark}"
    textColor: "{colors.selection-foreground-dark}"
  separator:
    backgroundColor: "{colors.border}"
    size: "1px"
  separator-dark:
    backgroundColor: "{colors.border-dark}"
  input-boundary:
    backgroundColor: "{colors.input}"
    size: "1px"
  input-boundary-dark:
    backgroundColor: "{colors.input-dark}"
  focus-indicator:
    backgroundColor: "{colors.ring}"
    size: "2px"
  focus-indicator-dark:
    backgroundColor: "{colors.ring-dark}"
  description:
    textColor: "{colors.muted-foreground}"
    typography: "{typography.caption}"
  description-dark:
    textColor: "{colors.muted-foreground-dark}"
  status-success:
    textColor: "{colors.success}"
    typography: "{typography.label}"
  status-success-dark:
    textColor: "{colors.success-dark}"
  status-warning:
    textColor: "{colors.warning}"
    typography: "{typography.label}"
  status-warning-dark:
    textColor: "{colors.warning-dark}"
  status-error:
    textColor: "{colors.destructive}"
    typography: "{typography.label}"
  status-error-dark:
    textColor: "{colors.destructive-dark}"
  toast:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.2xl}"
    padding: "{spacing.lg}"
    width: "24rem"
  toast-dark:
    backgroundColor: "{colors.popover-dark}"
    textColor: "{colors.foreground-dark}"
```

### Buttons and fields

Use Button `default` for the primary action, `outline` or `secondary` for supporting actions, and `destructive` for confirmed destructive actions. Text buttons do not use a ghost variant. Transparent icon buttons retain their hit target and visible hover and focus states. The input-boundary and focus-indicator entries describe the control's stroke and outline; their size sets the stroke thickness. Button and input padding tokens describe horizontal inset; vertical content is centered within the stated height.

Use [FieldGroup and Field](https://ui.shadcn.com/docs/components/base/field) to retain label, control, description, and error relationships. A placeholder is an optional example, never the only label. Set `data-invalid` on Field and `aria-invalid` on its control; associate errors with `aria-describedby`. InputGroup owns attached buttons, prefixes, and suffixes.

```tsx
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type NameFormProps = {
  label: string;
  action: string;
  name: string;
  error?: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
};

export function NameForm(props: NameFormProps) {
  const id = useId();
  return (
    <form className="flex flex-col gap-6" onSubmit={event => {
      event.preventDefault();
      props.onSave();
    }}>
      <FieldGroup>
        <Field data-invalid={Boolean(props.error)}>
          <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
          <Input
            id={id}
            value={props.name}
            onChange={event => props.onNameChange(event.target.value)}
            aria-invalid={Boolean(props.error)}
            aria-describedby={props.error ? `${id}-error` : undefined}
          />
          <FieldError id={`${id}-error`}>{props.error}</FieldError>
        </Field>
      </FieldGroup>
      <div className="flex justify-end gap-2">
        <Button type="submit">{props.action}</Button>
      </div>
    </form>
  );
}
```

### Choice controls

Use [Select](https://ui.shadcn.com/docs/components/base/select) for a short single-choice list and Combobox for a large searchable list. Keep SelectItem inside SelectGroup and provide a visible label. DropdownMenu presents commands. ToggleGroup presents a short visible set of peer options, Checkbox independent selections, RadioGroup one choice, and Switch an immediately applied binary setting.

Use [Slider](https://ui.shadcn.com/docs/components/base/slider) for a bounded continuous value, with value and unit beside the label. A neutral 4px track and blue active segment support a 16px circular thumb within a 36px interaction region. Retain keyboard adjustments, focus, and an accessible value description. Provide numeric entry when precision matters.

### Cards and overlays

Use CardHeader, CardTitle, CardContent, and CardFooter where their content exists. CardDescription adds necessary information only. Card headings use `title-3`, dialog titles `title-2`, and toast titles `label`.

Use [Dialog](https://ui.shadcn.com/docs/components/base/dialog) for a focused modal task, AlertDialog for irreversible confirmation, Popover for short contextual details, and Sheet for an inspector or secondary panel. Every overlay retains an accessible title. Base UI triggers use `render`. Closing returns focus to the trigger and preserves the underlying selection and scroll.

```tsx
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogClose, DialogContent, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n";

export function PreviewDialog(props: {
  triggerLabel: string;
  title: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        {props.triggerLabel}
      </DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{props.title}</DialogTitle></DialogHeader>
        {props.children}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>
            {t("common.close")}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Menus use 4px outer padding, 32px minimum item height, and label text. Tooltips use caption text, 8px padding, and a maximum width of 18rem. Tooltips appear on hover and keyboard focus; essential instructions remain visible. Interactive help belongs in a Popover.

### Lists, navigation, and feedback

Prefer Table or repeated Item rows for comparable records. Keep a stable name/status/action order, trailing-aligned numbers, and restrained separators. Selection remains visible; hover disappears when the pointer leaves. Essential actions remain visible, while secondary tools may appear on hover and `focus-within`.

TabsTrigger stays inside TabsList, with selection identifiable beyond color. Collapsible or Accordion can reveal advanced settings while required fields and errors remain discoverable. Expanding details preserves the heading, task actions, and the user's place.

Use the existing Base UI [Toast](https://ui.shadcn.com/docs/components/base/toast) wrapper for brief completion feedback and reversible actions. Cap width at 24rem and the available viewport width, with a 12px icon-to-copy gap. Use a concise label-style title and an optional caption description. Lasting results remain on the page. Reversible removal can offer Undo; permanent deletion requires prior confirmation.

Use Alert for a persistent issue, Empty for first-use or no-results states, Skeleton for expected content geometry, Spinner for indeterminate work, and Progress for measured completion. Show an actual stage when percentage cannot be measured. Validation stays beside the field. Failure retains input and offers useful recovery.

Use clear verbs such as “Save”, “Start translation”, and “Retry”. Success names what completed; failure explains the next useful step. Avoid repeated descriptions beneath obvious headings. Production copy uses `t()` and the existing regional dictionaries; translated labels can grow and wrap.

### Assistant workspace

Use the existing [assistant-ui Thread](https://www.assistant-ui.com/elements/thread) and Elements for messages, composer, tool activity, attachments, and approvals. Those primitives retain streaming, scroll anchoring, cancellation, and keyboard behavior. Conversation prose uses reading, controls use label, and technical output uses code. Keep the composer reachable while the thread scrolls.

[Approval cards](https://www.assistant-ui.com/elements/approval-card) show the action, affected object, and explicit choices with suitable visual weight. Routine activity stays compact; details expand in place.

### State changes and motion

Account for default, hover, focus-visible, pressed, selected, disabled, pending, and invalid states where applicable. Pending actions respond immediately and prevent duplicate submission; cancellation remains available when supported. Async results do not steal focus or pull a reader to the latest content.

Control color changes use 150ms ease-out. Floating content enters in 150ms and exits in 120ms, both ease-out. Movement explains an origin or destination. A changed row can retain its selection-tint highlight for two seconds, then fade over 150ms; updated text remains. With reduced motion, remove spatial transitions and highlight animation and show the resulting state directly. Animation never delays an operation.

## Do's and Don'ts

| Do | Don't |
| --- | --- |
| Start from a form, list, reading surface, or canvas. | Force every page into a grid of cards. |
| Apply paired semantic values in both appearances. | Add page-specific shades or invert content for dark mode. |
| Use blue for meaningful actions and selections. | Fill headings, sidebars, and unrelated icons with blue. |
| Apply a complete text role per purpose. | Let toast titles inherit dialog headings or shrink labels to fit. |
| Let labels, errors, and passages wrap. | Clip essential content or cap every row at a fixed height. |
| Keep related content and actions close and aligned. | Scatter an object's status, result, and tools across the page. |
| Reuse Base UI shadcn and assistant-ui Elements. | Recreate selects, dialogs, toasts, or conversation scrolling. |
| Keep primary actions discoverable; expose secondary tools on focus. | Hide necessary tools behind hover alone. |
| Preserve context during local edits and details. | Reset filters, scroll, selection, or unsaved text after a local action. |
| Pair status color with text or a recognizable symbol. | Communicate errors, progress, or selection only through color or motion. |
| Confirm irreversible actions; offer undo for reversible removal. | Make a disappearing toast the only record of a consequential result. |
| Review light, dark, narrow layouts, and 200% zoom. | Treat token compliance as proof of rendered usability. |
