import { useId } from 'react';

/** 观澜 mark: Rift map (three lanes, blue and red bases), the river as a wave of arc light, the observer's lens
 *  at the river crossing. Source of truth: brand/guanlan-icon.svg */
export function BrandMark({ size = 36, tile = true, title }: { size?: number; tile?: boolean; title?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const river = 'M96 120 C150 110 214 150 232 214 S292 318 356 330 S420 376 416 400 C356 408 300 372 280 300 S214 204 156 190 S92 150 96 120 Z';
  const cut = tile ? '#0a111e' : 'none';
  return <svg className="brand-mark" width={size} height={size} viewBox="0 0 512 512" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
    <defs>
      <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#16233a"/><stop offset=".55" stopColor="#0b1220"/><stop offset="1" stopColor="#05080e"/></linearGradient>
      <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f3e0aa"/><stop offset=".45" stopColor="#c8aa6e" stopOpacity=".55"/><stop offset="1" stopColor="#7a6231" stopOpacity=".9"/></linearGradient>
      <linearGradient id={`${id}g`} x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stopColor="#fbeec5"/><stop offset=".45" stopColor="#d9bc7c"/><stop offset="1" stopColor="#a07c3e"/></linearGradient>
      <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2a8fe0"/><stop offset=".4" stopColor="#63d9f2"/><stop offset=".6" stopColor="#e6fbff"/><stop offset="1" stopColor="#3aa6ee"/></linearGradient>
      <radialGradient id={`${id}b`} cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#3fc8f0" stopOpacity=".28"/><stop offset="1" stopColor="#3fc8f0" stopOpacity="0"/></radialGradient>
      <radialGradient id={`${id}d`} cx="38%" cy="34%" r="70%"><stop offset="0" stopColor="#ff9aa2"/><stop offset=".5" stopColor="#ff4558"/><stop offset="1" stopColor="#c81d33"/></radialGradient>
      <radialGradient id={`${id}u`} cx="38%" cy="34%" r="70%"><stop offset="0" stopColor="#bfe0ff"/><stop offset=".5" stopColor="#5aa9ff"/><stop offset="1" stopColor="#2468c8"/></radialGradient>
    </defs>
    {tile && <>
      <rect x="16" y="16" width="480" height="480" rx="108" fill={`url(#${id}t)`}/>
      <rect x="16" y="16" width="480" height="480" rx="108" fill={`url(#${id}b)`}/>
      <rect x="21" y="21" width="470" height="470" rx="103" fill="none" stroke={`url(#${id}r)`} strokeWidth="8"/>
    </>}
    <g fill="none" stroke={`url(#${id}g)`} strokeWidth="18" strokeLinecap="round" strokeLinejoin="round">
      <path d="M124 388 V168 a44 44 0 0 1 44 -44 H388"/><path d="M124 388 H344 a44 44 0 0 0 44 -44 V124"/><path d="M124 388 L388 124"/>
    </g>
    <path d={river} fill={cut} stroke={cut} strokeWidth="26" strokeLinejoin="round"/>
    <path d={river} fill={`url(#${id}a)`}/>
    <circle cx="256" cy="256" r="62" fill={cut}/>
    <circle cx="256" cy="256" r="50" fill="#0c1627" stroke={`url(#${id}g)`} strokeWidth="16"/>
    <circle cx="256" cy="256" r="18" fill={`url(#${id}a)`}/>
    <circle cx="249" cy="249" r="5" fill="#fff" opacity=".85"/>
    <circle cx="124" cy="388" r="40" fill={cut}/><circle cx="124" cy="388" r="30" fill={`url(#${id}u)`}/>
    <circle cx="388" cy="124" r="40" fill={cut}/>
    <circle className="brand-mark-tally-halo" cx="388" cy="124" r="46" fill="#ff4558" opacity=".2"/>
    <circle className="brand-mark-tally" cx="388" cy="124" r="30" fill={`url(#${id}d)`}/>
  </svg>;
}
