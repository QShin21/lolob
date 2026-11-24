/** 观澜 mark: a cinnabar dot over two waves. It reads as the sun over water and as a tally lamp over
 *  a signal. Waves take the current text colour, so the mark follows the theme; the dot is always
 *  the on-air red. Source of truth: brand/guanlan-icon.svg */
export function BrandMark({ size = 36, tile = true, title }: { size?: number; tile?: boolean; title?: string }) {
  return <svg className="brand-mark" width={size} height={size} viewBox="0 0 512 512" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
    {tile && <rect x="16" y="16" width="480" height="480" rx="112" fill="#0e0f11"/>}
    <g fill="none" stroke={tile ? '#eeeff1' : 'currentColor'} strokeWidth="40" strokeLinecap="round">
      <path d="M92 304 C 148 248, 204 248, 256 304 S 364 360, 420 304"/>
      <path d="M92 392 C 148 336, 204 336, 256 392 S 364 448, 420 392" opacity=".36"/>
    </g>
    <circle className="brand-mark-tally" cx="338" cy="164" r="58" fill="#e5381f"/>
  </svg>;
}
