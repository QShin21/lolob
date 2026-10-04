import OBSWebSocket, { type IncomingMessage } from 'obs-websocket-js/json';

function omitCredentials(value:unknown):void{
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){for(const child of value)omitCredentials(child);return;}
  for(const [key,child]of Object.entries(value)){
    if(/^(key|streamkey|stream_key|password|obspassword)$/i.test(key))delete (value as Record<string,unknown>)[key];
    else omitCredentials(child);
  }
}

/** OBS client debug output receives only sanitized incoming messages. */
export class ObsClient extends OBSWebSocket {
  protected override async decodeMessage(data:string):Promise<IncomingMessage>{
    let message:IncomingMessage;
    try{message=await super.decodeMessage(data);}catch{throw new Error('OBS 返回了无效消息');}
    omitCredentials(message);
    if(message.op===7&&!message.d.requestStatus.result)message.d.requestStatus.comment='OBS 拒绝了本次请求';
    return message;
  }
  protected override onClose(event:CloseEvent):void{super.onClose({code:event.code,reason:'OBS WebSocket 已断开'}as CloseEvent);}
  protected override onError(_event:ErrorEvent):void{super.onError({message:'OBS WebSocket 连接失败'}as ErrorEvent);}
}
