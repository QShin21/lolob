export interface ReplayMoment {
 id:string;kind:'kill'|'objective'|'teamfight';title:string;time:number;start:number;end:number;
 basis:'damage'|'event';participants:string[];objective?:string;
}
export interface ReplayDirectorView {
 session:string;connected:boolean;source:'replay'|'observer'|'waiting';detail:string;
 moments:ReplayMoment[];coverageFrom?:number;coverageUntil?:number;
 playback?:{time:number;length?:number;paused:boolean;speed:number;seeking?:boolean};
}

/** Return to the original timeline advancing at normal speed, independent of replay transport. */
export function advancingReplayTime(start:number,elapsedMs:number,length?:number):number {
 const target=Math.max(0,start)+Math.max(0,elapsedMs)/1000;
 return typeof length==='number'&&Number.isFinite(length)&&length>=0?Math.min(target,length):target;
}
