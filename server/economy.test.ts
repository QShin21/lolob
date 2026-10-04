import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EconomyBridge, defaultEconomyConfig, parseGold, validateEconomyConfig, type OcrReading, type AutoLocatedReading } from './economy';
import { applyAction, createSeed } from './state';
import type { BroadcastState } from '../shared/types';

const stats=():BroadcastState['stats']=>({blue:{kills:0,gold:null,towers:0,dragons:0,barons:0},red:{kills:0,gold:null,towers:0,dragons:0,barons:0}});
function setup(capture?:()=>Promise<OcrReading>,locate?:()=>Promise<AutoLocatedReading>){const state=applyAction(createSeed(),{type:'set-mode',mode:'live'});state.gameTime=100;let now=100000;const bridge=new EconomyBridge(()=>state,work=>work(state),{now:()=>now,capture,locate});return {state,bridge,advance:(ms:number)=>{now+=ms;}};}

test('gold parser accepts scoreboard units and rejects ambiguous OCR or invented values',()=>{
  for(const [input,expected]of [[23400,23400],['23,400',23400],['23.4k',23400],['23.4 K',23400],['23 ． 4k',23400],['23 · 4k',23400],['２.３４万',23400],['0',0]]as const)assert.equal(parseGold(input),expected);
  for(const input of ['23.4','23,4k','23.4k 2','1 2','1·2·3k','23·lk','O3.4k','-2500','2e4',1000001,NaN])assert.throws(()=>parseGold(input));
  assert.throws(()=>validateEconomyConfig({...defaultEconomyConfig,blue:{x:.9,y:0,width:.2,height:.05}}));assert.throws(()=>validateEconomyConfig({...defaultEconomyConfig,red:defaultEconomyConfig.blue}));
});

test('manual real values update the scoreboard immediately and expire after ten seconds without estimating player gold',async()=>{
  const {state,bridge,advance}=setup();assert.equal(bridge.status().status,'disabled');const feed=bridge.sample({blue:'23.4k',red:'2.3万'});assert.equal(feed.source,'manual');assert.equal(state.stats.blue.gold,23400);assert.equal(state.stats.red.gold,23000);assert.deepEqual(state.economy,[{time:100,blue:23400,red:23000,source:'manual'}]);
  bridge.sample({blue:23500,red:23100});assert.equal(state.economy.length,1);assert.equal(state.economy[0].blue,23500);
  const resolved=bridge.resolve(101,stats());assert.equal(resolved.stats.blue.gold,23500);assert.equal(resolved.feed.source,'manual');assert.equal(state.players.length,0);
  advance(10001);await bridge.poll();assert.equal(bridge.status().status,'stale');assert.equal(state.stats.blue.gold,null);assert.equal(bridge.resolve(102,stats()).stats.red.gold,null);assert.equal(state.economy.length,1);
});

test('native cumulative gold takes priority while manual and OCR retain accurate source metadata',async()=>{
  const {state,bridge,advance}=setup(async()=>({ok:true,blueText:'24.1k',redText:'23.8k'}));bridge.configure({...defaultEconomyConfig,enabled:true});bridge.sample({blue:'23.4k',red:'23k'});await bridge.probe();assert.equal(bridge.status().source,'manual');
  const native=stats();native.blue.gold=24145;native.red.gold=23787;const api=bridge.resolve(100,native);assert.equal(api.feed.source,'api');assert.equal(api.stats.blue.gold,24145);
  advance(10001);state.gameTime=105;await bridge.probe();const ocr=bridge.resolve(105,stats());assert.equal(ocr.feed.source,'ocr');assert.equal(ocr.stats.blue.gold,24100);assert.deepEqual(ocr.feed.raw,{blue:'24.1k',red:'23.8k'});assert.equal(state.economy.at(-1)?.source,'ocr');
});

test('seek backwards, new game, source-mode changes and explicit reset discard former samples',()=>{
  const {state,bridge}=setup();bridge.sample({blue:23000,red:22000});bridge.resolve(100,stats());const backwards=bridge.resolve(80,stats());assert.equal(backwards.stats.blue.gold,null);assert.notEqual(backwards.feed.status,'fresh');
  state.gameTime=80;bridge.sample({blue:21000,red:20000});state.match.game++;assert.notEqual(bridge.status().status,'fresh');assert.equal(bridge.resolve(0,stats()).stats.blue.gold,null);
  state.gameTime=0;bridge.sample({blue:2500,red:2500});state.mode='demo';assert.equal(bridge.resolve(0,stats()).feed.status,'disabled');state.mode='live';assert.notEqual(bridge.status().status,'fresh');
  bridge.sample({blue:2600,red:2500});bridge.reset();assert.equal(state.stats.blue.gold,null);assert.deepEqual(state.economy,[]);
});

test('OCR is opt-in and an in-flight read is discarded after the match changes',async()=>{
  let calls=0;let finish:(reading:OcrReading)=>void=()=>{};const {state,bridge}=setup(async()=>{calls++;return new Promise(resolve=>{finish=resolve;});});await bridge.poll();assert.equal(calls,0);assert.equal((await bridge.probe()).status,'error');assert.equal(calls,0);
  bridge.configure({...defaultEconomyConfig,enabled:true});const pending=bridge.probe();assert.equal(calls,1);state.match.game++;finish({ok:true,blueText:'26.5k',redText:'25k'});await pending;assert.notEqual(bridge.status().status,'fresh');assert.equal(state.stats.blue.gold,null);
});

test('explicit automatic calibration saves validated regions and immediately publishes a real OCR sample',async()=>{
  let calls=0;const reading={ok:true,blueText:'23 ． 4k',redText:'22.8k',blueRoi:{x:.32,y:.02,width:.05,height:.025},redRoi:{x:.62,y:.02,width:.05,height:.025}};
  const {state,bridge}=setup(undefined,async()=>{calls++;return reading;});await bridge.poll();assert.equal(calls,0);const result=await bridge.autoCalibrate();assert.equal(calls,1);assert.deepEqual(result.config,{enabled:true,blue:reading.blueRoi,red:reading.redRoi});assert.deepEqual(state.settings.economyOcr,result.config);assert.equal(result.feed.source,'ocr');assert.equal(state.stats.blue.gold,23400);assert.equal(state.stats.red.gold,22800);assert.equal(state.economy.at(-1)?.source,'ocr');
});

test('ambiguous or outdated automatic calibration keeps the previous configuration intact',async()=>{
  const failure=setup(undefined,async()=>({ok:false,error:'多候选，请手动校准'}));const before=structuredClone(failure.state.settings);await assert.rejects(failure.bridge.autoCalibrate(),/多候选/);assert.deepEqual(failure.state.settings,before);assert.equal(failure.state.stats.blue.gold,null);
  let finish:(reading:AutoLocatedReading)=>void=()=>{};const pending=setup(undefined,()=>new Promise(resolve=>{finish=resolve;}));const work=pending.bridge.autoCalibrate();pending.state.gameTime=80;finish({ok:true,blueText:'23k',redText:'22k',blueRoi:defaultEconomyConfig.blue,redRoi:defaultEconomyConfig.red});await assert.rejects(work,/位置已变化/);assert.equal(pending.state.settings.economyOcr?.enabled??false,false);
});

test('automatic team calibration retains independently disabled player OCR and its custom region',async()=>{
  const reading={ok:true,blueText:'23k',redText:'22k',blueRoi:defaultEconomyConfig.blue,redRoi:defaultEconomyConfig.red};
  const {state,bridge}=setup(undefined,async()=>reading);
  const players={enabled:false,region:{x:.3,y:.7,width:.4,height:.3}};
  bridge.configure({...defaultEconomyConfig,players});
  const calibrated=await bridge.autoCalibrate();
  assert.deepEqual(calibrated.config.players,players);assert.deepEqual(state.settings.economyOcr?.players,players);
});

test('Windows OCR auto-location uses word bounds, excludes the timer and rejects a third gold candidate', {skip:process.platform!=='win32'},async()=>{
  const taskDirectory=await mkdtemp(path.join(os.tmpdir(),'riftcast-gold-fixture-'));
  try{
    const taskGenerator=path.join(taskDirectory,'generate.ps1');
    const taskProduction=path.resolve('scripts/read-spectator-gold.ps1');
    const source=`param([string]$OutputPath,[string]$ProductionPath)
. $ProductionPath -InitializeOnly
$taskFirst=New-Object RiftCastGoldWindow+RECT;$taskFirst.Left=0;$taskFirst.Top=0;$taskFirst.Right=100;$taskFirst.Bottom=100
$taskOther=New-Object RiftCastGoldWindow+RECT;$taskOther.Left=99;$taskOther.Top=50;$taskOther.Right=120;$taskOther.Bottom=120
if(-not [RiftCastGoldWindow]::Overlaps($taskFirst,$taskOther)){throw 'one-pixel overlap must be detected'}
$taskOther.Left=100;if([RiftCastGoldWindow]::Overlaps($taskFirst,$taskOther)){throw 'touching bounds must allow another monitor'}
$taskOther.Left=-120;$taskOther.Right=-1;if([RiftCastGoldWindow]::Overlaps($taskFirst,$taskOther)){throw 'a separate negative-coordinate monitor must be allowed'}
$taskSelected=Select-GoldText ([pscustomobject]@{text='23 · lk';alternateText='23．1k'})
if((Convert-GoldText $taskSelected).value -ne 23100){throw 'clear alternate reading must be used without guessing'}
$taskRejected=$false;try{[void](Select-GoldText ([pscustomobject]@{text='23.1k';alternateText='23.7k'}))}catch{$taskRejected=$true}
if(-not $taskRejected){throw 'contradictory OCR languages must be rejected'}
$taskImage=New-Object Drawing.Bitmap(1920,1080);$taskGraphics=[Drawing.Graphics]::FromImage($taskImage);$taskGraphics.Clear([Drawing.Color]::Black)
$taskFont=New-Object Drawing.Font('Arial',20,[Drawing.FontStyle]::Bold)
$taskGraphics.DrawString('23.4k',$taskFont,[Drawing.Brushes]::White,[single]614,[single]12)
$taskGraphics.DrawString('22.8k',$taskFont,[Drawing.Brushes]::White,[single]1200,[single]12)
$taskGraphics.DrawString('28:45',$taskFont,[Drawing.Brushes]::White,[single]930,[single]12)
$taskImage.Save($OutputPath,[Drawing.Imaging.ImageFormat]::Png)
$taskGraphics.DrawString('15.2k',$taskFont,[Drawing.Brushes]::White,[single]790,[single]70)
$taskImage.Save($OutputPath+'.ambiguous.png',[Drawing.Imaging.ImageFormat]::Png)
$taskFont.Dispose();$taskGraphics.Dispose();$taskImage.Dispose()
`;
    await writeFile(taskGenerator,'﻿'+source,'utf8');const run=promisify(execFile),options={windowsHide:true,timeout:15000};
    const taskImage=path.join(taskDirectory,'scoreboard.png');
    await run('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',taskGenerator,'-OutputPath',taskImage,'-ProductionPath',taskProduction],options);
    const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',taskProduction,'-AutoLocate','-ImagePath'];
    const {stdout}=await run('powershell.exe',[...args,taskImage],options);const located=JSON.parse(stdout.trim())as AutoLocatedReading;
    assert.equal(located.ok,true);assert.equal(parseGold(located.blueText),23400);assert.equal(parseGold(located.redText),22800);
    for(const roi of [located.blueRoi,located.redRoi])assert.ok(roi&&Object.values(roi).every(v=>typeof v==='number'&&v>=0&&v<=1)&&roi.height>0&&roi.width>0,JSON.stringify(located));
    const config=validateEconomyConfig({enabled:true,blue:located.blueRoi,red:located.redRoi});assert.ok(config.blue.x>.30&&config.blue.x<.34);assert.ok(config.red.x>.60&&config.red.x<.65);assert.ok(config.blue.y+config.blue.height<.08);
    await assert.rejects(run('powershell.exe',[...args,taskImage+'.ambiguous.png'],options),error=>{const rejected=JSON.parse((error as {stdout:string}).stdout.trim());assert.equal(rejected.ok,false);assert.match(rejected.error,/唯一/);return true;});
  }finally{assert.ok(path.resolve(taskDirectory).startsWith(path.resolve(os.tmpdir())+path.sep));await rm(taskDirectory,{recursive:true,force:true});}
});
