import {
  ArrowDownIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleCheckIcon,
  CopyIcon,
  InfoIcon,
  Loader2Icon,
  MinusIcon,
  MoreHorizontalIcon,
  OctagonXIcon,
  PanelLeftIcon,
  SearchIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react'

const icons = {
  ArrowDownIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CircleCheckIcon,
  CopyIcon,
  InfoIcon,
  Loader2Icon,
  MinusIcon,
  MoreHorizontalIcon,
  OctagonXIcon,
  PanelLeftIcon,
  SearchIcon,
  TriangleAlertIcon,
  XIcon,
}

export function IconPlaceholder({ lucide, tabler, hugeicons, phosphor, remixicon, ...props }) {
  const Icon = icons[lucide]
  return Icon ? <Icon {...props} aria-hidden="true" /> : null
}
