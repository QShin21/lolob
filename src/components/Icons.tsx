import { BrandMark } from './BrandMark';
export function Brand({compact=false}: {compact?:boolean}) {
  return <div className="brand"><div className="brand-icon" aria-hidden="true"><BrandMark size={compact?28:72} tile={false}/></div>{!compact&&<div><strong className="gl-title">观澜</strong><small className="brand-wordmark">GUANLAN</small><small>英雄联盟赛事导播</small></div>}</div>;
}
