export interface CameraVector { x: number; y: number; z: number }
export interface CameraPose { position: CameraVector; rotation: CameraVector; fov: number }
export interface CameraKeyframe extends CameraPose { id: string; time: number; interpolation: 'spline' | 'linear' | 'cut' }
export interface CameraTrack { id: string; name: string; frames: CameraKeyframe[] }
export type ControllerMode = 'directed' | 'free' | 'dolly';
export interface ControllerBindings {
  moveX: number; moveZ: number; yaw: number; pitch: number;
  up: number; down: number; next: number; previous: number; play: number; stop: number; capture: number;
}
export interface CameraController { bindings: ControllerBindings; deadzone: number; moveSpeed: number; lookSpeed: number; invertY: boolean }
export interface CinematicLibrary { version: 1; revision: number; tracks: CameraTrack[]; controller: CameraController }
export interface CinematicView {
  library: CinematicLibrary; connected: boolean; session: string; detail: string;
  pose?: CameraPose; playback?: { time: number; speed: number; paused: boolean; length?: number; seeking?: boolean };
  activeTrackId?: string; autoFollow: boolean; selection?: string; captured?: CameraKeyframe;
}
export const defaultController = (): CameraController => ({
  bindings: { moveX: 0, moveZ: 1, yaw: 2, pitch: 3, up: 5, down: 4, next: 15, previous: 14, play: 0, stop: 1, capture: 2 },
  deadzone: .18, moveSpeed: 1200, lookSpeed: 50, invertY: false,
});
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const spline = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  .5 * ((2 * p1) + (-p0 + p2) * t + (2*p0 - 5*p1 + 4*p2 - p3)*t*t + (-p0 + 3*p1 - 3*p2 + p3)*t*t*t);
const shortest = (a: number, b: number) => a + ((b-a+540)%360+360)%360-180;

/** Times are absolute replay seconds; a cut holds its start until the next keyframe. */
export function cameraAt(frames: CameraKeyframe[], time: number): CameraPose {
  if (!frames.length) throw new Error('镜头轨迹需要关键帧');
  if (time <= frames[0].time) return structuredClone(frames[0]);
  if (time >= frames.at(-1)!.time) return structuredClone(frames.at(-1)!);
  const index = frames.findIndex((frame, i) => i + 1 < frames.length && time >= frame.time && time < frames[i+1].time);
  const a = frames[index], b = frames[index+1], p = frames[Math.max(0,index-1)], n = frames[Math.min(frames.length-1,index+2)];
  if (a.interpolation === 'cut') return structuredClone(a);
  const t = (time-a.time)/(b.time-a.time);
  const position = {} as CameraVector, rotation = {} as CameraVector;
  for (const key of ['x','y','z'] as const) {
    position[key] = a.interpolation === 'spline' ? spline(p.position[key],a.position[key],b.position[key],n.position[key],t) : lerp(a.position[key],b.position[key],t);
    // Use the nearest equivalent rotation to avoid a full spin across 0/360 degrees.
    rotation[key] = lerp(a.rotation[key],shortest(a.rotation[key],b.rotation[key]),t);
  }
  return { position, rotation, fov: lerp(a.fov,b.fov,t) };
}
export interface ReplayKey<T> { time: number; value: T; blend: 'linear' | 'snap' }
export interface ReplayCameraSequence { cameraPosition: ReplayKey<CameraVector>[]; cameraRotation: ReplayKey<CameraVector>[]; fieldOfView: ReplayKey<number>[] }

/** Native interpolation runs inside the game; spline segments are sampled at 20 Hz. */
export function cameraSequence(track: CameraTrack): ReplayCameraSequence {
  const sequence: ReplayCameraSequence = { cameraPosition: [], cameraRotation: [], fieldOfView: [] };
  const append = (time: number, pose: CameraPose, blend: 'linear'|'snap'='linear') => {
    const last=sequence.cameraRotation.at(-1)?.value;
    const rotation=last?{x:shortest(last.x,pose.rotation.x),y:shortest(last.y,pose.rotation.y),z:shortest(last.z,pose.rotation.z)}:pose.rotation;
    sequence.cameraPosition.push({time,value:pose.position,blend});
    sequence.cameraRotation.push({time,value:rotation,blend});
    sequence.fieldOfView.push({time,value:pose.fov,blend});
  };
  for(let i=0;i<track.frames.length;i++) {
    const a=track.frames[i], b=track.frames[i+1];
    append(a.time,a);
    // Repeating the start pose immediately before the cut also preserves the hold
    // on clients that interpret blend on the arriving keyframe.
    if(b&&a.interpolation==='cut')append(b.time-.001,a);
    if(b&&a.interpolation==='spline') {
      const steps=Math.ceil((b.time-a.time)*20);
      for(let j=1;j<steps;j++) { const time=a.time+(b.time-a.time)*j/steps; append(time,cameraAt(track.frames,time)); }
    }
  }
  return sequence;
}

/** Convert normalized controller axes to camera-relative motion, independent of request rate. */
export function nudgeCamera(pose: CameraPose, mode: ControllerMode, input: { x:number;y:number;z:number;yaw:number;pitch:number;dt:number }, config: CameraController): CameraPose {
  const angle=pose.rotation.y*Math.PI/180, distance=config.moveSpeed*input.dt;
  const forward=input.z, horizontal=mode==='dolly'?0:input.x;
  return {position:{x:pose.position.x+(Math.cos(angle)*horizontal+Math.sin(angle)*forward)*distance,
    y:pose.position.y+(mode==='dolly'?0:input.y)*distance,z:pose.position.z+(-Math.sin(angle)*horizontal+Math.cos(angle)*forward)*distance},
    rotation:{x:Math.max(-89.9,Math.min(89.9,pose.rotation.x+input.pitch*config.lookSpeed*input.dt)),
      y:pose.rotation.y+(mode==='dolly'?0:input.yaw*config.lookSpeed*input.dt),z:pose.rotation.z},fov:pose.fov};
}
