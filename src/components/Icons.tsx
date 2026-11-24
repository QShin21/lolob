import { BrandMark } from './BrandMark';
export function Brand({compact=false}: {compact?:boolean}) {
  return <div className="brand"><div className="brand-icon" aria-hidden="true"><BrandMark size={compact?28:96}/></div>{!compact&&<div><strong>观澜</strong><small className="brand-wordmark">GUANLAN</small><small>赛事导播</small></div>}</div>;
}
