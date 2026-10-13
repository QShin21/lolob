export type OutputDestination = 'rtmp' | 'douyin';
export type OutputAction = 'start-stream' | 'stop-stream' | 'start-record' | 'stop-record' | 'start-virtual-camera' | 'stop-virtual-camera';
export type VirtualCameraDriverStatus = { available: boolean; installed: boolean; error?: string };
export type AudioEndpoint = { id: string; name: string; interfaceName: string; capture: boolean; cable: boolean };
export type AudioDevices = { defaultRender: string; defaultCapture: string; endpoints: AudioEndpoint[]; cablePresent?: boolean; defaults?: string[] };
export type CompanionAudioStatus = {
  supported: boolean; available: boolean; installed: boolean; ready: boolean; active: boolean;
  render?: AudioEndpoint; capture?: AudioEndpoint; needsRestart?: boolean; error?: string;
  sampleRate: number; channels: number; track: number; peakDb?: number; signalAgeMs?: number;
  receivedFrames?: number; renderedFrames?: number; droppedFrames?: number; underruns?: number;
  managing?: boolean;
};
