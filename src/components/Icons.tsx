import { BrandMark } from './BrandMark';
export function Brand({compact=false}: {compact?:boolean}) {
  return <div className="brand"><div className="brand-icon" aria-hidden="true"><BrandMark size={compact?28:96}/></div>{!compact&&<div><strong>RiftCast</strong><small>裂谷导播工作站</small></div>}</div>;
}
