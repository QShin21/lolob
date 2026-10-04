import { timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { ValidationError } from './state';

export function isLoopback(address?:string):boolean {return address==='127.0.0.1'||address==='::1'||address==='::ffff:127.0.0.1';}
export function lanAddresses():string[]{return Object.values(networkInterfaces()).flat().filter(n=>n&&!n.internal&&n.family==='IPv4').map(n=>n!.address);}
export function validToken(provided:unknown,expected:string):boolean {if(typeof provided!=='string')return false;const a=Buffer.from(provided),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}
export function validHost(host:string|undefined,port:number,lan:boolean):boolean {if(!host)return false;try{const url=new URL(`http://${host}`);const name=url.hostname.replace(/^\[|\]$/g,'');const ports=[String(port),'5173'];return ['localhost','127.0.0.1','::1',...(lan?lanAddresses():[])].includes(name)&&ports.includes(url.port||'80')&&!url.username&&!url.password;}catch{return false;}}
export function validOrigin(origin:string|undefined,port:number,lan:boolean):boolean {if(!origin)return true;try{const u=new URL(origin);return u.protocol==='http:'&&validHost(u.host,port,lan)&&u.pathname==='/'&&!u.search&&!u.hash;}catch{return false;}}

export interface ImageInfo {extension:'png'|'jpg'|'gif'|'webp';mime:string;width:number;height:number}
export function inspectImage(buffer:Buffer):ImageInfo {
  let result:ImageInfo|undefined;
  if(buffer.length>=24&&buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&buffer.subarray(12,16).toString()==='IHDR')result={extension:'png',mime:'image/png',width:buffer.readUInt32BE(16),height:buffer.readUInt32BE(20)};
  else if(buffer.length>=10&&['GIF87a','GIF89a'].includes(buffer.subarray(0,6).toString()))result={extension:'gif',mime:'image/gif',width:buffer.readUInt16LE(6),height:buffer.readUInt16LE(8)};
  else if(buffer.length>=4&&buffer[0]===0xff&&buffer[1]===0xd8){let pos=2;while(pos+4<=buffer.length){if(buffer[pos]!==0xff){pos++;continue;}while(buffer[pos]===0xff)pos++;const marker=buffer[pos++];if(marker===0xd9||marker===0xda)break;if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;if(pos+2>buffer.length)break;const size=buffer.readUInt16BE(pos);if(size<2||pos+size>buffer.length)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&size>=7){result={extension:'jpg',mime:'image/jpeg',height:buffer.readUInt16BE(pos+3),width:buffer.readUInt16BE(pos+5)};break;}pos+=size;}}
  else if(buffer.length>=30&&buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP'){
    const chunk=buffer.subarray(12,16).toString();if(chunk==='VP8X')result={extension:'webp',mime:'image/webp',width:1+buffer.readUIntLE(24,3),height:1+buffer.readUIntLE(27,3)};
    else if(chunk==='VP8 '&&buffer.subarray(23,26).equals(Buffer.from([0x9d,0x01,0x2a])))result={extension:'webp',mime:'image/webp',width:buffer.readUInt16LE(26)&0x3fff,height:buffer.readUInt16LE(28)&0x3fff};
    else if(chunk==='VP8L'&&buffer[20]===0x2f){const bits=buffer.readUInt32LE(21);result={extension:'webp',mime:'image/webp',width:(bits&0x3fff)+1,height:((bits>>>14)&0x3fff)+1};}
  }
  if(!result)throw new ValidationError('文件签名无效，仅支持 PNG、JPEG、WebP、GIF 图片');
  if(result.width<1||result.height<1||result.width>8192||result.height>8192||result.width*result.height>32000000)throw new ValidationError('图片尺寸须小于 8192 × 8192，且总像素小于 3200 万');
  return result;
}
