import { LayoutTemplate, Radio, Eye, PictureInPicture2 } from 'lucide-react';
import type { StateContext } from '../../shared/types';

export function BroadcastLook({state,send}:StateContext) {
  return <section className="director-look" aria-label="RiftCast ARENA 转播包装">
    <div className="look-heading"><LayoutTemplate size={18}/><div><strong>转播视觉</strong><span>赛前 / BP / 局内 / 赛后共用</span></div></div>
    <div className="look-identity">
      <i className="look-identity-mark" aria-hidden="true">A</i>
      <div><strong>RiftCast <b>ARENA</b></strong><span>墨蓝 · 暖白 · 薄荷 / 全流程统一视觉</span></div>
      <small>VISUAL SYSTEM 01</small>
    </div>
    <div className="look-toggles">{([{key:'scoreboard',name:'顶部计分板',icon:Radio},{key:'players',name:'底部五行计分板',icon:Eye},{key:'ticker',name:'公告字幕',icon:PictureInPicture2}] as const).map(v=><button aria-pressed={state.overlay[v.key]} className={state.overlay[v.key]?'enabled':''} key={v.key} onClick={()=>void send({type:'set-overlay',patch:{[v.key]:!state.overlay[v.key]}}).catch(()=>{})}><v.icon size={14}/>{v.name}<span>{state.overlay[v.key]?'ON':'OFF'}</span></button>)}</div>
  </section>;
}
