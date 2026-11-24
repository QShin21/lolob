import { useId } from 'react';

/** 观澜 mark: brass lens ring, one arc-light wave, on-air tally. Source of truth: brand/guanlan-icon.svg */
export function BrandMark({ size = 36, tile = true, title }: { size?: number; tile?: boolean; title?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const wave = 'M44 290 C124 180 200 184 262 252 S392 318 468 236 C404 372 316 356 252 300 S128 236 44 290 Z';
  return <svg className="brand-mark" width={size} height={size} viewBox="0 0 512 512" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
    <defs>
      <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#16233a"/><stop offset=".55" stopColor="#0b1220"/><stop offset="1" stopColor="#05080e"/></linearGradient>
      <linearGradient id={`${id}r`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f3e0aa"/><stop offset=".45" stopColor="#c8aa6e" stopOpacity=".55"/><stop offset="1" stopColor="#7a6231" stopOpacity=".9"/></linearGradient>
      <linearGradient id={`${id}g`} x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stopColor="#fbeec5"/><stop offset=".45" stopColor="#d9bc7c"/><stop offset="1" stopColor="#a07c3e"/></linearGradient>
      <linearGradient id={`${id}a`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#2a8fe0"/><stop offset=".38" stopColor="#63d9f2"/><stop offset=".62" stopColor="#e6fbff"/><stop offset="1" stopColor="#4fc4f2"/></linearGradient>
      <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4fc4f2" stopOpacity=".42"/><stop offset="1" stopColor="#1b5fb4" stopOpacity=".06"/></linearGradient>
      <radialGradient id={`${id}b`} cx="50%" cy="58%" r="50%"><stop offset="0" stopColor="#3fc8f0" stopOpacity=".3"/><stop offset="1" stopColor="#3fc8f0" stopOpacity="0"/></radialGradient>
      <radialGradient id={`${id}d`} cx="38%" cy="34%" r="70%"><stop offset="0" stopColor="#ff9aa2"/><stop offset=".5" stopColor="#ff4558"/><stop offset="1" stopColor="#c81d33"/></radialGradient>
      <clipPath id={`${id}c`}><rect x="16" y="16" width="480" height="480" rx="108"/></clipPath>
      <clipPath id={`${id}l`}><circle cx="256" cy="256" r="139"/></clipPath>
    </defs>
    {tile && <>
      <rect x="16" y="16" width="480" height="480" rx="108" fill={`url(#${id}t)`}/>
      <rect x="16" y="16" width="480" height="480" rx="108" fill={`url(#${id}b)`}/>
      <rect x="21" y="21" width="470" height="470" rx="103" fill="none" stroke={`url(#${id}r)`} strokeWidth="8"/>
    </>}
    <g clipPath={`url(#${id}l)`}>
      <path fill={`url(#${id}w)`} d="M40 292 C120 196 196 196 256 268 S392 340 472 244 V520 H40 Z"/>
      <path fill="none" stroke="#9fe6fb" strokeOpacity=".34" strokeWidth="12" strokeLinecap="round" d="M96 372 C150 326 200 326 256 362 S362 398 416 352"/>
    </g>
    <circle cx="256" cy="256" r="156" fill="none" stroke={`url(#${id}g)`} strokeWidth="34"/>
    <g clipPath={`url(#${id}c)`}>
      {tile && <path fill="#0a111e" stroke="#0a111e" strokeWidth="22" strokeLinejoin="round" d={wave}/>}
      <path fill={`url(#${id}a)`} d={wave}/>
      <path fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="5" strokeLinecap="round" d="M96 246 C150 204 204 204 258 258 S372 316 428 276"/>
    </g>
    <circle className="brand-mark-tally-halo" cx="306" cy="182" r="50" fill="#ff4558" opacity=".2"/>
    <circle className="brand-mark-tally" cx="306" cy="182" r="32" fill={`url(#${id}d)`}/>
  </svg>;
}
