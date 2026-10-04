import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { parsePlayerGoldRow, parseScoreboardWords, parseScoreboardRows, matchPlayerScoreboardRows, matchPlayerGoldRows, type ScoreboardWord } from './spectator-scoreboard';
import { EconomyBridge, defaultEconomyConfig, defaultPlayerGoldRegion, validateEconomyConfig } from './economy';
import { applyAction, createSeed, csvRecording } from './state';
import type { Player } from '../shared/types';

const player = (id: string, team: Player['team'] = 'blue', kills = 6): Player => ({id,name:id,team,kills,deaths:4,assists:16,cs:27,level:12,role:'上单',championId:'Ahri',championName:'阿狸',gold:null,items:[]});
function words(text: string, team: 'blue' | 'red', y = .82): ScoreboardWord[] {
  return text.split(' ').map((text,index) => ({text,x:team==='blue'?[.30,.40,.45][index]:[.55,.58,.68][index],y,width:index===1?.03:.02,height:.02}));
}
test('native scoreboard distinguishes spendable current gold and exact cumulative gold, and rejects ambiguous strings',()=>{
  const parsed=parsePlayerGoldRow('123 （ 9423 ） 6 / 4 / 16 27','blue');
  assert.equal(parsed?.currentGold,123);assert.equal(parsed?.totalGold,9423);assert.equal(parsed?.cs,27);
  assert.equal(parsePlayerGoldRow('21 16/5/8 3632(11182)','red')?.totalGold,11182);
  for(const text of ['123 9423 6/4/16 27','123(9423) 6/4/16 27 20','123(94O3) 6/4/16 27','1000(900) 6/4/16 27','123(9423) 6/4/16 2 7'])assert.equal(parsePlayerGoldRow(text,'blue'),undefined);
});
test('word geometry combines columns even when Windows OCR assigns independent line numbers',()=>{
  const blue=words('123(9423) 6/4/16 27','blue'),red=words('21 16/5/8 3632(11182)','red');
  const rows=parseScoreboardWords([...red,...blue,{text:'GAME',x:.33,y:.72,width:.05,height:.02}]);
  assert.equal(rows.length,2);assert.equal(rows[0].totalGold,9423);assert.equal(rows[1].totalGold,11182);
  assert.deepEqual(parseScoreboardWords([{text:'123(9423)',x:NaN,y:.8,width:.02,height:.02}]),[]);
});
test('scoreboard identity uses a unique same-side KDA plus CS, independent of roster order',()=>{
  const row=parsePlayerGoldRow('123(9423) 6/4/16 27','blue')!;
  const roster=[player('other','blue',1),player('red','red'),player('expected')];
  assert.deepEqual([...matchPlayerGoldRows([row],roster).keys()],['expected']);
  assert.equal(matchPlayerGoldRows([row],[...roster,player('duplicate')]).size,0);
  assert.equal(matchPlayerGoldRows([row,row],roster).size,0);
});
test('verified champion portraits correct stale statistics, take priority, and reject weak or duplicate identities',()=>{
  const portrait={team:'blue',championId:'Ahri',x:.47,y:.807,width:.028,height:.052,score:.98,margin:.2};
  const [confirmed]=parseScoreboardWords(words('123(9423) 0/2/0 51','blue'),[portrait]);
  assert.equal(confirmed.championId,'Ahri');
  const target=player('target'),fallback=parsePlayerGoldRow('800(9100) 6/4/16 27','blue')!;
  assert.equal(matchPlayerGoldRows([fallback,confirmed],[target]).get('target'),confirmed);
  assert.equal(matchPlayerGoldRows([confirmed,confirmed],[target]).size,0);
  assert.equal(matchPlayerGoldRows([confirmed],[target,player('duplicate')]).size,0);
  const [weak]=parseScoreboardWords(words('123(9423) 0/2/0 51','blue'),[{...portrait,score:.89}]);
  assert.equal(weak.championId,undefined);assert.equal(matchPlayerGoldRows([weak],[target]).size,0);
  const [wrongSide]=parseScoreboardWords(words('123(9423) 0/2/0 51','blue'),[{...portrait,x:.51}]);
  assert.equal(wrongSide.championId,undefined);
  const [maskedWeak]=parseScoreboardWords(words('123(9423) 0/2/0 51','blue'),[{...portrait,method:'outer-gray',score:.93}]);
  assert.equal(maskedWeak.championId,undefined);
  const [maskedClose]=parseScoreboardWords(words('123(9423) 0/2/0 51','blue'),[{...portrait,method:'outer-gray',margin:.11}]);
  assert.equal(maskedClose.championId,undefined);
  const [maskedStrong]=parseScoreboardWords(words('123(9423) 0/2/0 51','blue'),[{...portrait,method:'outer-gray'}]);
  assert.equal(maskedStrong.championId,'Ahri');
});
test('one obscured portrait is identified only by four confirmed teammates and a complete unique roster',()=>{
  const roster=Array.from({length:5},(_,i)=>({...player(`p-${i}`),championId:`Champion${i}`}));
  const rows=roster.map((p,i)=>({...parsePlayerGoldRow(`${100+i}(${9000+i}) ${i}/0/0 ${50+i}`,'blue')!,rowIndex:i,...(i<4?{championId:p.championId,identitySource:'portrait' as const}:{})}));
  const matched=matchPlayerGoldRows([...rows].reverse(),[...roster].reverse());
  assert.equal(matched.size,5);assert.equal(matched.get('p-4')?.identitySource,'roster-elimination');assert.equal(matched.get('p-4')?.cs,54);
  assert.equal(matchPlayerGoldRows(rows.slice(1),roster).has('p-4'),false);
  assert.equal(matchPlayerGoldRows([...rows.slice(0,4),rows[3]],roster).has('p-4'),false);
  assert.equal(matchPlayerGoldRows(rows,[...roster.slice(0,4),{...roster[4],championId:roster[0].championId}]).has('p-4'),false);
});
test('individual OCR runs independently of team OCR, expires, respects API totals and rejects decreasing or outdated samples',async()=>{
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});state.gameTime=100;state.players=[player('target'),player('other','red')];let now=100000;
  let reading={ok:false,error:'team region unavailable',playerWords:words('123(9423) 6/4/16 27','blue')};
  const bridge=new EconomyBridge(()=>state,work=>work(state),{now:()=>now,capture:async()=>reading});
  bridge.configure({...defaultEconomyConfig,players:{enabled:true,region:defaultPlayerGoldRegion}});
  bridge.observePlayers(state.players,100);
  await bridge.probe();assert.equal(state.players[0].gold,9423);assert.equal(state.players[0].currentGold,123);assert.equal(state.players[0].goldSource,'ocr');assert.equal(state.economyFeed?.players?.status,'partial');assert.equal(state.stats.blue.gold,null);
  const native={...player('target'),gold:9500,goldSource:'api' as const,currentGold:200};assert.equal(bridge.resolvePlayers([native])[0].gold,9500);assert.equal(bridge.resolvePlayers([native])[0].currentGold,200);
  reading={...reading,playerWords:words('100(9000) 6/4/16 27','blue')};await bridge.probe();assert.equal(state.players[0].gold,9423);
  now+=10001;await bridge.poll();assert.equal(state.players[0].gold,null);assert.equal(state.players[0].currentGold,undefined);
  reading={...reading,playerWords:words('124(9500) 6/4/16 27','blue')};await bridge.probe();assert.equal(state.players[0].gold,9500);
  state.gameTime=70;await bridge.poll();assert.equal(state.players[0].gold,null);assert.equal(bridge.resolvePlayers([player('target')])[0].gold,null);
  assert.throws(()=>validateEconomyConfig({...defaultEconomyConfig,players:{enabled:true,region:{x:.6,y:.7,width:.2,height:.2}}}));
});
test('complete five-row scoreboard identifies all ten players without assigning duplicate or cropped entries',()=>{
  const roster:Player[]=[],allWords:ScoreboardWord[]=[];
  for(const team of ['blue','red']as const)for(let i=0;i<5;i++){roster.push({...player(`${team}-${i}`,team,i),deaths:i,assists:i,cs:50+i});allWords.push(...words(team==='blue'?`${100+i}(${9000+i}) ${i}/${i}/${i} ${50+i}`:`${50+i} ${i}/${i}/${i} ${100+i}(${9000+i})`,team,.7+i*.05));}
  const rows=parseScoreboardWords(allWords);assert.equal(rows.length,10);assert.equal(matchPlayerGoldRows(rows,[...roster].reverse()).size,10);
  const cropped=parseScoreboardWords(allWords.filter(word=>word.y<.89));assert.equal(matchPlayerGoldRows(cropped,roster).size,8);
});

test('central champion death timers are excluded by column geometry and never replace missing CS',()=>{
  const line=[{text:'49',x:.535,y:.82,width:.009,height:.014},{text:'1/3/18',x:.557,y:.82,width:.027,height:.014},{text:'2218(8318)',x:.613,y:.82,width:.045,height:.017},{text:'20',x:.515,y:.82,width:.009,height:.014}];
  const parsed=parseScoreboardWords(line);assert.equal(parsed.length,1);assert.equal(parsed[0].cs,49);assert.equal(parsed[0].totalGold,8318);
  assert.deepEqual(parseScoreboardWords(line.filter(word=>word.text!=='49')),[]);
});
test('equipment view supplies fresh KDA and CS independently of missing gold and excludes portrait overlays',()=>{
  const portrait={team:'blue',championId:'Ahri',x:.47,y:.807,width:.028,height:.052,score:.98,margin:.2};
  const numeric=words('123(9423) 0/2/0 51','blue').slice(1);
  const rows=parseScoreboardRows([...numeric,{text:'19',x:.478,y:.82,width:.01,height:.02},{text:'5',x:.31,y:.82,width:.02,height:.02}],[portrait]);
  assert.equal(rows.length,1);assert.equal(rows[0].cs,51);assert.equal(rows[0].currentGold,undefined);assert.equal(rows[0].totalGold,undefined);
  assert.equal(matchPlayerScoreboardRows(rows,[player('stale-api')]).get('stale-api')?.kills,0);
  assert.deepEqual(parseScoreboardWords(numeric,[portrait]),[]);
  assert.deepEqual(parseScoreboardRows(numeric.filter(word=>word.text!=='51').concat({text:'19',x:.478,y:.82,width:.01,height:.02}),[portrait]),[]);
});
test('ambiguous or invalid gold cells leave independently valid KDA and CS available',()=>{
  const portrait={team:'blue',championId:'Ahri',x:.47,y:.807,width:.028,height:.052,score:.98,margin:.2};
  for(const cells of [words('1000(900) 0/2/0 51','blue'),words('123(9423) 0/2/0 51','blue').concat({text:'55(9999)',x:.34,y:.82,width:.04,height:.02})]){
    const rows=parseScoreboardRows(cells,[portrait]);assert.equal(rows.length,1);assert.equal(rows[0].cs,51);assert.equal(rows[0].kills,0);assert.equal(rows[0].deaths,2);assert.equal(rows[0].totalGold,undefined);assert.equal(rows[0].currentGold,undefined);
    assert.equal(parseScoreboardWords(cells,[portrait]).length,0);
  }
  assert.deepEqual(parseScoreboardRows(words('1000(900) 0/2/0 51','blue').concat({text:'1/1/1',x:.35,y:.82,width:.04,height:.02}),[portrait]),[]);
  assert.deepEqual(parseScoreboardRows(words('1000(900) 0/2/0 51','blue').concat({text:'9',x:.465,y:.82,width:.004,height:.02}),[portrait]),[]);
});
test('recorded 4K equipment view matches all ten exact statistics without fabricating personal gold',async()=>{
  for(const filename of ['spectator-equipment.json','spectator-equipment-low-cs.json']){
  const fixture=JSON.parse(await readFile(new URL(`./fixtures/${filename}`,import.meta.url),'utf8'));
  const roster:Player[]=fixture.expected.map((expected:{team:Player['team'];championId:string},i:number)=>({...player(`equipment-${i}`,expected.team),championId:expected.championId}));
  const rows=parseScoreboardRows(fixture.words,fixture.portraits),matched=matchPlayerScoreboardRows(rows,[...roster].reverse());
  assert.equal(rows.length,10);assert.equal(matched.size,10);assert.equal(parseScoreboardWords(fixture.words,fixture.portraits).length,0);
  for(const expected of fixture.expected){const row=[...matched.values()].find(row=>row.championId===expected.championId)!;
    const {team,championId,kills,deaths,assists,cs}=row;assert.deepEqual({team,championId,kills,deaths,assists,cs},expected);assert.equal(row.currentGold,undefined);assert.equal(row.totalGold,undefined);}
  }
});
test('small unrelated HUD words cannot split the main numeric scoreboard row',()=>{
  const native=[{text:'22',x:.5353,y:.964622,width:.0095,height:.012622},{text:'1/4/21',x:.5579,y:.964622,width:.0258,height:.0128},{text:'922(9582)',x:.6155,y:.9632,width:.0401,height:.016},
    {text:'0',x:.9491,y:.964978,width:.0027,height:.005333},{text:'00',x:.9363,y:.965511,width:.0064,height:.005333}];
  assert.equal(parseScoreboardWords(native)[0]?.cs,22);assert.equal(parseScoreboardWords(native)[0]?.totalGold,9582);
});
test('recorded Windows OCR from the user attachment and two native 4K frames preserves all ten exact player values',async()=>{
  const fixtures=JSON.parse(await readFile(new URL('./fixtures/spectator-scoreboard.json',import.meta.url),'utf8'));
  for(const fixture of fixtures){
    const rows=parseScoreboardWords(fixture.words,fixture.portraits);
    const roster:Player[]=fixture.expected.map((expected:{team:Player['team'];championId:string},i:number)=>({...player(`fixture-${i}`,expected.team),championId:expected.championId}));
    const matches=matchPlayerGoldRows(rows,[...roster].reverse());
    assert.equal(rows.length,10,fixture.name);assert.equal(matches.size,10,fixture.name);
    for(const expected of fixture.expected){
      const row=[...matches.values()].find(row=>row.team===expected.team&&row.championId===expected.championId)!;
      const {team,championId,kills,deaths,assists,cs,currentGold,totalGold}=row;
      assert.deepEqual({team,championId,kills,deaths,assists,cs,currentGold,totalGold},expected,`${fixture.name}: ${expected.championId}`);
    }
    if(fixture.name==='native-4k-respawn-and-bounty')assert.equal([...matches.values()].find(row=>row.championId==='Yunara')?.identitySource,'roster-elimination');
  }
});
test('victory shade and multiple respawn overlays preserve a safe partial identity result',async()=>{
  const fixture=JSON.parse(await readFile(new URL('./fixtures/spectator-victory-occlusion.json',import.meta.url),'utf8'));
  const heroes=['Darius','Sylas','Zed','Yunara','Lulu','Jayce','Graves','Ekko','Jhin','Rakan'];
  const roster=heroes.map((championId,i)=>({...player(`victory-${i}`,i<5?'blue':'red'),championId}));
  const rows=parseScoreboardWords(fixture.words,fixture.portraits),matches=matchPlayerGoldRows(rows,roster);
  assert.equal(rows.length,10);assert.equal(matches.size,8);
  assert.equal(matches.has('victory-1'),false);assert.equal(matches.has('victory-4'),false);
  assert.equal([...matches.values()].filter(row=>row.identitySource==='roster-elimination').length,0);
});

test('CSV appends individual OCR provenance and spendable gold while preserving the original cumulative-gold column',()=>{
  const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});
  const sampledAt=new Date().toISOString(),expiresAt=new Date(Date.now()+10000).toISOString();
  state.players=[{...player('live-ocr-player'),gold:9423,currentGold:123,goldSource:'ocr',goldSampledAt:sampledAt,goldExpiresAt:expiresAt,statsSource:'ocr',statsSampledAt:sampledAt,statsExpiresAt:expiresAt}];
  const saved=applyAction(state,{type:'save-recording'}).recordings[0];
  const csv=csvRecording(saved);
  assert.match(csv,/"个人累计经济","个人经济来源","个人经济采样时间","当前金币"/);
  assert.ok(csv.includes(`"9423","观战 HUD 识别","${sampledAt}","123"`));
});

test('Windows OCR reads all ten current(total) rows from an offline native-style scoreboard fixture', {skip:process.platform!=='win32'},async()=>{
  const taskDirectory=await mkdtemp(path.join(os.tmpdir(),'riftcast-player-scoreboard-'));
  try{
    const taskImage=path.join(taskDirectory,'scoreboard.png');
    const taskGenerator=path.join(taskDirectory,'generate.ps1');
    const source=`param([string]$OutputPath)
Add-Type -AssemblyName System.Drawing
$taskImage=New-Object Drawing.Bitmap(1920,1080)
$taskGraphics=[Drawing.Graphics]::FromImage($taskImage);$taskGraphics.Clear([Drawing.Color]::Black)
$taskFont=New-Object Drawing.Font('Arial',24,[Drawing.FontStyle]::Bold,[Drawing.GraphicsUnit]::Pixel)
$taskScores=@('6/4/16','3/4/14','3/5/12','10/7/7','7/6/17');$taskCs=@('27','12','6','30','22')
for($taskRow=0;$taskRow -lt 5;$taskRow++){
  $taskY=[single](800+46*$taskRow)
  $taskGraphics.DrawString("$(100+$taskRow)($(9000+$taskRow))",$taskFont,[Drawing.Brushes]::White,[single]570,$taskY)
  $taskGraphics.DrawString($taskScores[$taskRow],$taskFont,[Drawing.Brushes]::White,[single]790,$taskY)
  $taskGraphics.DrawString($taskCs[$taskRow],$taskFont,[Drawing.Brushes]::White,[single]900,$taskY)
  $taskGraphics.DrawString($taskCs[$taskRow],$taskFont,[Drawing.Brushes]::White,[single]1000,$taskY)
  $taskGraphics.DrawString($taskScores[$taskRow],$taskFont,[Drawing.Brushes]::White,[single]1070,$taskY)
  $taskGraphics.DrawString("$(200+$taskRow)($(10000+$taskRow))",$taskFont,[Drawing.Brushes]::White,[single]1230,$taskY)
}
$taskImage.Save($OutputPath,[Drawing.Imaging.ImageFormat]::Png)
$taskFont.Dispose();$taskGraphics.Dispose();$taskImage.Dispose()
`;
    await writeFile(taskGenerator,'﻿'+source,'utf8');
    const run=promisify(execFile),options={windowsHide:true,timeout:15000};
    await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',taskGenerator,'-OutputPath',taskImage],options);
    const taskProduction=path.resolve('scripts/read-spectator-gold.ps1');
    const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',taskProduction,'-ReadPlayers','-SkipTeam','-ImagePath',taskImage,'-PlayersX','0','-PlayersY','0','-PlayersWidth','1','-PlayersHeight','1'],options);
    const reading=JSON.parse(stdout.trim());assert.equal(reading.ok,true);assert.equal(reading.playerError,undefined);
    const rows=parseScoreboardWords(reading.playerWords);assert.equal(rows.length,10,JSON.stringify(reading.playerWords));
    for(const team of ['blue','red']as const){const observed=rows.filter(row=>row.team===team);assert.deepEqual(observed.map(row=>row.totalGold),Array.from({length:5},(_,i)=>(team==='blue'?9000:10000)+i));assert.deepEqual(observed.map(row=>row.currentGold),Array.from({length:5},(_,i)=>(team==='blue'?100:200)+i));}
  }finally{assert.ok(path.resolve(taskDirectory).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(taskDirectory,{recursive:true,force:true});}
});
