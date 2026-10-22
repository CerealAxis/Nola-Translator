import type { SVGProps } from 'react'
import { LoaderCircle } from 'lucide-react'

export interface SpinnerProps extends SVGProps<SVGSVGElement> { size?: 'sm' | 'md' }

export function Spinner({ size = 'sm', className, ...props }: SpinnerProps) {
  return <LoaderCircle aria-hidden={props['aria-label'] ? undefined : true} data-slot="spinner" className={['nola-spinner', size === 'md' && 'nola-spinner--md', className].filter(Boolean).join(' ')} {...props} />
}
