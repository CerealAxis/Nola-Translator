import { Avatar, AvatarFallback } from '../../../src/renderer/components/ui/avatar'
import { NolaLogo } from '../logo'
import type { ProviderConnection } from '../providers'

export function ProviderAvatar({ provider }: { provider?: ProviderConnection }) {
  return <Avatar className="nola-provider-avatar" title={provider?.name} aria-hidden="true"><AvatarFallback>{provider?.preset === 'nola' ? <NolaLogo /> : provider?.name.slice(0, 1) ?? '?'}</AvatarFallback></Avatar>
}
