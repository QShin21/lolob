import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import sharp from 'sharp';
import fixture from './fixtures/hud-093.json';

test('native digit fallback accepts scaled captured glyphs and rejects empty, cropped, neutral and multiple glyphs',{skip:process.platform!=='win32'},async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'riftcast-hud-glyph-'));
 try{
  const patch=fixture.patches[5],pixels=Buffer.alloc(patch.width*patch.rows.length*3);
  patch.rows.forEach((row,y)=>{const bits=BigInt('0x'+row);for(let x=0;x<patch.width;x++)if(bits&(1n<<BigInt(x)))for(let c=0;c<3;c++)pixels[(y*patch.width+x)*3+c]=patch.color[c];});
  const glyph=await sharp(pixels,{raw:{width:patch.width,height:patch.rows.length,channels:3}}).resize(20,26,{kernel:'nearest'}).png().toBuffer();
  const canvas=()=>sharp({create:{width:64,height:40,channels:3,background:'#000'}});
  await canvas().composite([{input:glyph,left:6,top:6}]).png().toFile(path.join(directory,'scaled.png'));
  await canvas().png().toFile(path.join(directory,'empty.png'));
  await canvas().composite([{input:glyph,left:0,top:0}]).png().toFile(path.join(directory,'cropped.png'));
  const neutral=await sharp(glyph).grayscale().png().toBuffer();
  await canvas().composite([{input:neutral,left:6,top:6}]).png().toFile(path.join(directory,'neutral.png'));
  await canvas().composite([{input:glyph,left:6,top:6},{input:glyph,left:34,top:6}]).png().toFile(path.join(directory,'multiple.png'));
  const script=path.join(directory,'check.ps1');
  await writeFile(script,`param([string]$Source,[string]$Directory)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -Path $Source -ReferencedAssemblies System.Drawing
$results=@{}
foreach($name in @('scaled','empty','cropped','neutral','multiple')){
 $image=[Drawing.Bitmap]::FromFile((Join-Path $Directory ($name+'.png')))
 try{$results[$name]=[RiftCastNumericFilter]::ReadHudAmbiguousGlyph($image,0,0,$image.Width,$image.Height)}finally{$image.Dispose()}
}
$results|ConvertTo-Json -Compress
`);
  const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,'-Source',path.resolve('scripts/spectator-portrait-matcher.cs'),'-Directory',directory],{windowsHide:true,timeout:20000});
  assert.deepEqual(JSON.parse(stdout),{scaled:'3',empty:null,cropped:null,neutral:null,multiple:null});
 }finally{
  assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));
  assert(path.basename(directory).startsWith('riftcast-hud-glyph-'));
  await rm(directory,{recursive:true,force:true});
 }
});
