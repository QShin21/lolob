/** 观澜 mark: a cinnabar lamp over two waves. It reads as the sun over water and as a tally lamp over
 *  a signal. Waves take the current text colour, so the mark follows the theme; the lamp is always
 *  the on-air red. Source of truth: brand/guanlan-icon.svg */
export function BrandMark({ size = 36, tile = true, title }: { size?: number; tile?: boolean; title?: string }) {
  return <svg className="brand-mark" width={size} height={size} viewBox="0 0 512 512" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
    {tile && <rect x="16" y="16" width="480" height="480" rx="112" fill="#0e0f11"/>}
    <g fill="none" stroke={tile ? '#eeeff1' : 'currentColor'} strokeWidth="40" strokeLinecap="round">
      <path d="M80 352 C140 304 196 304 256 352 S372 400 432 352" opacity=".34"/>
      <path d="M80 264 C140 216 196 216 256 264 S372 312 432 264"/>
    </g>
    <circle className="brand-mark-tally" cx="344" cy="170" r="56" fill="#e5381f"/>
  </svg>;
}
