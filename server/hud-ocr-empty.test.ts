import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { defaultEconomyConfig, readSpectatorGold } from './economy';
import { defaultObjectiveRegions } from '../shared/hud-ocr';
import { closeSpectatorOcrWorker } from './spectator-ocr-worker';

test('Windows objective OCR leaves blank pixels missing, including zero/one glyph fallback',{skip:process.platform!=='win32'},async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'riftcast-hud-empty-'));
  try{
    const image=path.join(directory,'blank.png');
    await sharp({create:{width:2048,height:1148,channels:3,background:'#000000'}}).png().toFile(image);
    const result=await readSpectatorGold({...defaultEconomyConfig,players:{enabled:false,region:{x:0,y:.4,width:1,height:.6}},objectives:{enabled:true,regions:defaultObjectiveRegions}},[],image);
    assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.objectiveError,undefined);
    assert.deepEqual(result.objectiveTexts,{blue:{},red:{}});
  }finally{await closeSpectatorOcrWorker();await rm(directory,{recursive:true,force:true});}
});
