import { useId } from 'react';

/** RiftCast 2.0 mark: brass R, arc-light rift leg, on-air tally. Source of truth: brand/riftcast-icon.svg */
export function BrandMark({ size = 36, tile = true, title }: { size?: number; tile?: boolean; title?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  return <svg className="brand-mark" width={size} height={size} viewBox="0 0 512 512" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
    <defs>
      <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#16233a"/><stop offset=".55" stopColor="#0b1220"/><stop offset="1" stopColor="#05080e"/></linearGradient>
      <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f3e0aa"/><stop offset=".45" stopColor="#c8aa6e" stopOpacity=".55"/><stop offset="1" stopColor="#7a6231" stopOpacity=".9"/></linearGradient>
      <linearGradient id={`${id}g`} x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stopColor="#fbeec5"/><stop offset=".42" stopColor="#d9bc7c"/><stop offset="1" stopColor="#a98646"/></linearGradient>
      <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#e6fbff"/><stop offset=".4" stopColor="#63d9f2"/><stop offset="1" stopColor="#2a8fe0"/></linearGradient>
      <radialGradient id={`${id}b`} cx="62%" cy="72%" r="46%"><stop offset="0" stopColor="#3fc8f0" stopOpacity=".38"/><stop offset="1" stopColor="#3fc8f0" stopOpacity="0"/></radialGradient>
      <radialGradient id={`${id}d`} cx="38%" cy="34%" r="70%"><stop offset="0" stopColor="#ff9aa2"/><stop offset=".5" stopColor="#ff4558"/><stop offset="1" stopColor="#c81d33"/></radialGradient>
    </defs>
    {tile && <>
      <rect x="16" y="16" width="480" height="480" rx="108" fill={`url(#${id}t)`}/>
      <rect x="16" y="16" width="480" height="480" rx="108" fill={`url(#${id}b)`}/>
      <rect x="21" y="21" width="470" height="470" rx="103" fill="none" stroke={`url(#${id}r)`} strokeWidth="8"/>
    </>}
    <path fill={`url(#${id}g)`} fillRule="evenodd" d="M124 104 H272 a104 104 0 0 1 0 208 H200 V408 H124 Z M200 172 V246 H268 a37 37 0 0 0 0 -74 Z"/>
    <path fill={`url(#${id}a)`} d="M214 330 H318 L412 408 H308 Z"/>
    <path fill="#fff" opacity=".5" d="M214 330 H244 L338 408 H308 Z"/>
    <circle className="brand-mark-tally-halo" cx="412" cy="108" r="44" fill="#ff4558" opacity=".2"/>
    <circle className="brand-mark-tally" cx="412" cy="108" r="28" fill={`url(#${id}d)`}/>
  </svg>;
}
