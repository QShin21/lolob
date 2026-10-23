import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const {createRendererMessenger}=createRequire(import.meta.url)('../electron/renderer-messages.cjs');
test('destroyed windows never expose webContents to shutdown notifications',()=>{
 let reads=0;const window={isDestroyed:()=>true,get webContents(){reads++;throw Error('Object has been destroyed');}};
 assert.equal(createRendererMessenger({getWindow:()=>window,trusted:()=>true})('status',{}),false);assert.equal(reads,0);
});
test('destroyed and untrusted renderer contents receive no messages',()=>{
 let sent=0,trusted=0;const contents={isDestroyed:()=>true,send:()=>sent++};const window={isDestroyed:()=>false,webContents:contents};
 const send=createRendererMessenger({getWindow:()=>window,trusted:()=>{trusted++;return false;}});assert.equal(send('status',{}),false);assert.equal(trusted,0);contents.isDestroyed=()=>false;assert.equal(send('status',{}),false);assert.equal(sent,0);
});
test('live trusted renderer receives the channel and value exactly once',()=>{
 const values:unknown[]=[];const contents={isDestroyed:()=>false,send:(...v:unknown[])=>values.push(v)};
 assert.equal(createRendererMessenger({getWindow:()=>({isDestroyed:()=>false,webContents:contents}),trusted:()=>true})('status',{enabled:false}),true);assert.deepEqual(values,[['status',{enabled:false}]]);
});
test('destruction during send is ignored while ordinary errors remain observable',()=>{
 let destroyed=false;const contents={isDestroyed:()=>destroyed,send:()=>{destroyed=true;throw Error('Object has been destroyed');}};const send=createRendererMessenger({getWindow:()=>({isDestroyed:()=>false,webContents:contents}),trusted:()=>true});assert.equal(send('status',{}),false);
 destroyed=false;contents.send=()=>{throw Error('transport failure');};assert.throws(()=>send('status',{}),/transport failure/);
});
