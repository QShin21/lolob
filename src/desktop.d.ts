export {};
declare global { interface Window { riftcastDesktop?: {choosePath:(kind:'game'|'lockfile')=>Promise<string|null>;openLogs:()=>Promise<string>}; } }
