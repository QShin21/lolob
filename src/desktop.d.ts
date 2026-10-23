import type { GlobalShortcutEvent, GlobalShortcutRequest, GlobalShortcutStatus } from '../shared/global-shortcuts';
import type { DesktopUpdateAction, DesktopUpdateStatus } from '../shared/app-operations';
export {};
declare global {
  interface Window {
    riftcastDesktop?: {
      programWindow:(action:'open'|'close'|'status')=>Promise<{open:boolean;minimized?:boolean;title?:string}>;
      choosePath:(kind:'game'|'lockfile')=>Promise<string|null>;
      openLogs:()=>Promise<string>;
      update:(action:DesktopUpdateAction)=>Promise<DesktopUpdateStatus>;
      globalShortcuts:(request:GlobalShortcutRequest)=>Promise<GlobalShortcutStatus>;
      onGlobalShortcut:(callback:(event:GlobalShortcutEvent)=>void)=>()=>void;
      onGlobalShortcutStatus:(callback:(status:GlobalShortcutStatus)=>void)=>()=>void;
    };
  }
}
