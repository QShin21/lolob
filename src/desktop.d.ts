export {};
declare global { interface Window { riftcastDesktop?: {programWindow:(action:'open'|'close'|'status')=>Promise<{open:boolean;minimized?:boolean;title?:string}>;choosePath:(kind:'game'|'lockfile')=>Promise<string|null>;openLogs:()=>Promise<string>}; } }
