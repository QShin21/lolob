import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readSpectatorGold,defaultEconomyConfig,defaultPlayerGoldRegion} from '../server/economy.ts';
import {closeSpectatorOcrWorker} from '../server/spectator-ocr-worker.ts';
import {parseScoreboardRows,matchPlayerScoreboardRows} from '../server/spectator-scoreboard.ts';
import {createSeed} from '../server/state.ts';
const expected=[['Trundle',9,393,4343,61],['Elise',6,1023,5478,67],['Lucian',3,355,4555,106],['Yunara',8,283,5593,116],['Nautilus',20,471,3576,19],['Yasuo',11,1402,6477,141],['Nidalee',25,669,9569,120],['Sivir',7,1610,8115,128],['Ziggs',6,646,6196,116],['Jhin',21,141,4916,11]] as const;
const seed=createSeed();const players=expected.map(([championId],i)=>({...seed.players[i],id:championId,championId,team:i<5?'blue' as const:'red' as const,kills:0,deaths:0,assists:0,cs:0}));
const image=process.argv[2];if(!image)throw new Error('Usage: npx tsx scripts/verify-scoreboard-081.ts <user sample PNG>');
try{for(let pass=0;pass<2;pass++){const start=Date.now();const reading=await readSpectatorGold({...defaultEconomyConfig,players:{enabled:true,region:defaultPlayerGoldRegion}},players,image);const matched=matchPlayerScoreboardRows(parseScoreboardRows(reading.playerWords,reading.playerPortraits),players);assert.equal(matched.size,10);for(const [id,...numbers]of expected){const row=matched.get(id)!;assert.deepEqual([row.visionScore,row.currentGold,row.totalGold,row.cs],numbers,id);}await fs.mkdir('verification-output/ocr-0.8.1',{recursive:true});await fs.writeFile(`verification-output/ocr-0.8.1/runtime-${pass}.json`,JSON.stringify(reading,null,2));console.log(`Pass ${pass+1}: all 40 values and ten identities correct (${Date.now()-start} ms)`);}}finally{await closeSpectatorOcrWorker();}
