import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {PortraitManifestStore} from './spectator-portraits';
import {createSeed,applyAction} from './state';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {EconomySourcePanel} from '../src/components/EconomySourcePanel';
import {bottomEquipment} from './bottom-scoreboard';

test('fresh offline installation builds all ten portraits without champions.json and repairs corrupt images',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'riftcast-portrait-test-'));const players=createSeed().players;
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw Error('offline')};
 try{const store=new PortraitManifestStore(dir);const file=await store.prepare(players);assert.ok(file);const m=JSON.parse(await readFile(file,'utf8'));assert.equal(m.portraits.length,10);for(const p of m.portraits)assert.deepEqual([...((await readFile(p.imagePath)).subarray(0,8))],[137,80,78,71,13,10,26,10]);
 await writeFile(m.portraits[0].imagePath,'broken');const repaired=await new PortraitManifestStore(dir).prepare(players);assert.ok(repaired);assert.ok((await readFile(m.portraits[0].imagePath)).length>100);
 }finally{globalThis.fetch=original;}
});
test('equipment sorts by total price, keeps stacks attached to original slots, and leaves trinkets separate',()=>{
 const p=createSeed().players[0];p.itemSlots=[1001,0,3031,2003,1036,1037,3340];p.itemCounts=[1,0,1,3,1,1,1];
 const prices={1001:{gold:300},3031:{gold:3600},2003:{gold:50},1036:{gold:350},1037:{gold:875}};
 const sorted=bottomEquipment(p,prices);assert.deepEqual(sorted.map(i=>i.id),[3031,1037,1036,1001,2003,0]);assert.equal(sorted[4].count,3);assert.equal(sorted[4].slot,3);assert.equal(p.itemSlots[0],1001);assert.ok(!sorted.some(i=>i.id===3340));
 assert.deepEqual(bottomEquipment(p,{}).map(i=>i.id),[1001,3031,2003,1036,1037,0]);
});

test('frozen postgame source panel explains stopped capture and hides misleading historic live counts',()=>{
 const s=applyAction(createSeed(),{type:'finalize-game',winner:'blue'});
 const html=renderToStaticMarkup(createElement(EconomySourcePanel,{state:s,notify:()=>{}}));
 assert.ok(html.includes('赛后已冻结'));assert.ok(html.includes('测试其他录像请开启新系列赛'));assert.ok(!html.includes('读数有效'));
});
