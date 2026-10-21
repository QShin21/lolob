export interface ReplayMoment {
 id:string;kind:'kill'|'objective'|'teamfight';title:string;time:number;start:number;end:number;
 basis:'damage'|'event';participants:string[];objective?:string;
}
export interface ReplayDirectorView {
 session:string;connected:boolean;source:'replay'|'observer'|'waiting';detail:string;
 moments:ReplayMoment[];coverageFrom?:number;coverageUntil?:number;
 playback?:{time:number;length?:number;paused:boolean;speed:number;seeking?:boolean};
}
