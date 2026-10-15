import { useLayoutEffect, useRef } from 'react';
import './fit-name.css';
/** Measure at the authored font size; retain a common baseline and fit the full ID. */
export function FitName({children,className=''}:{children:string;className?:string}) {
 const host=useRef<HTMLElement>(null),text=useRef<HTMLSpanElement>(null);
 useLayoutEffect(()=>{const h=host.current,t=text.current;if(!h||!t)return;let alive=true;
 const fit=()=>{if(!alive)return;t.style.fontSize='';t.style.transform='';const available=h.clientWidth;const natural=t.scrollWidth;if(!available||!natural)return;const ratio=Math.min(1,available/natural);const size=Math.max(.72,ratio);t.style.fontSize=`${size}em`;t.style.transform=`scaleX(${Math.min(1,available/t.scrollWidth)})`;};
 fit();const observer=new ResizeObserver(fit);observer.observe(h);document.fonts.ready.then(fit);return()=>{alive=false;observer.disconnect();};},[children]);
 return <strong ref={host} className={`fit-name ${className}`} title={children}><span ref={text}>{children}</span></strong>;
}
