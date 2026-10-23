import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRiotId,resolveAutomaticSides}from'../shared/player-identity';
import {applyAutomaticSides}from'./player-identity';
import {createFixture}from'./test-support/fixture';
import {applyIdentity,captureProgram,programState}from'../shared/production';
import {applyAction,normalizeSavedState}from'./state';
import {ControlSeats}from'./control-seats';

function fixture(){const s=createFixture();s.production!.autoSides=true;const ids=[s.match.blueTeamId,s.match.redTeamId];for(const[id,index]of ids.map((id,i)=>[id,i] as const)){s.teams.find(t=>t.id===id)!.players=s.teams.find(t=>t.id===id)!.players.slice(0,5).map((p,i)=>({...p,account:`Account ${index}-${i}#CN1`}));}const raw=ids.flatMap((id,index)=>s.teams.find(t=>t.id===id)!.players.map(p=>({team:index===0?'CHAOS':'ORDER',riotId:p.account})));return{s,raw};}
test('Riot ID paste parsing trims separators, preserves display spelling and excludes incomplete identities',()=>{
 assert.deepEqual(parseRiotId('  张 三  # CN1 '),{gameName:'张 三',tagLine:'CN1',display:'张 三#CN1',key:'张 三#cn1'});
 for(const invalid of ['Name','Name#','#TAG','Name##TAG','Name#T A','Name\n#TAG',{},null])assert.equal(parseRiotId(invalid),null);
 assert.equal(parseRiotId('Ａname#tag')!.key===parseRiotId('Aname#tag')!.key,false);
});
test('automatic sides needs both teams with at least three unique consistent accounts and defaults disabled',()=>{
 const{s,raw}=fixture();assert.equal(resolveAutomaticSides(s,raw).status,'swap');
 const partial=structuredClone(raw);for(const i of [3,4,8,9])delete partial[i].riotId;
 const found=resolveAutomaticSides(s,partial);assert.equal(found.status,'swap');assert.deepEqual(found.matches,{blue:3,red:3});
 delete partial[2].riotId;assert.equal(resolveAutomaticSides(s,partial).status,'unknown');
 s.production!.autoSides=undefined;assert.equal(resolveAutomaticSides(s,raw).status,'disabled');
});
test('duplicate accounts, mixed sides, client field conflict and incomplete teams never change configured sides',()=>{
 for(const alter of [(s:any,r:any[])=>{r[1].riotId=r[0].riotId;},(s:any,r:any[])=>{[r[0].team,r[5].team]=[r[5].team,r[0].team];},(s:any,r:any[])=>{s.teams.find((t:any)=>t.id===s.match.redTeamId).players[0].account=r[0].riotId;},(s:any,r:any[])=>{r[0].riotIdGameName='Other';r[0].riotIdTagLine='CN1';},(s:any,r:any[])=>r.pop()]){
 const{s,raw}=fixture();alter(s,raw);const before=structuredClone(s.match);assert.equal(applyAutomaticSides(s,raw).status,'unknown');assert.deepEqual(s.match,before);}
});
test('accepted automatic swap changes preview team identity and corresponding scores while freezing programme until TAKE',()=>{
 const{s,raw}=fixture();s.production!.program=captureProgram(s);const before=structuredClone(programState(s)),id=s.match.blueTeamId;
 assert.equal(applyAutomaticSides(s,raw).status,'swap');assert.equal(s.match.redTeamId,id);assert.deepEqual(programState(s).match,before.match);assert.deepEqual(programState(s).players,before.players);
 assert.equal(resolveAutomaticSides(s,raw).status,'aligned');const audits=s.production!.audit.length;applyAutomaticSides(s,raw);assert.equal(s.production!.audit.length,audits);
});
test('automatic-side toggle persists and is restricted to the active director',()=>{
 const s=createFixture(),next=applyAction(s,{type:'production',command:{op:'settings',autoSides:true}});assert.equal(normalizeSavedState(JSON.parse(JSON.stringify(next))).production!.autoSides,true);
 assert.throws(()=>applyAction(s,{type:'production',command:{op:'settings',autoSides:'true'}} as never));
 const seats=new ControlSeats(),owner=seats.issue({role:'director'},true),other=seats.issue({role:'director'},true),data=seats.issue({role:'data'},true);
 assert.doesNotThrow(()=>seats.authorize(owner.token,'production',{op:'settings',autoSides:true}));for(const token of [other.token,data.token])assert.throws(()=>seats.authorize(token,'production',{op:'settings',autoSides:true}));
});


test('full Riot ID normalization matches NFC and case while preserving exact legacy account behavior',()=>{
 const s=createFixture(),team=s.teams.find(t=>t.id===s.match.blueTeamId)!;team.players[0].account='  Cafe\u0301 # CN1  ';const id=team.players[0].id;
 const observed={...s.players.find(p=>p.team==='blue')!,id:'live-CAFÉ#cn1',name:'untrusted display'};
 assert.equal(applyIdentity(s,[observed])[0].registeredPlayerId,id);
 assert.equal(applyIdentity(s,[{...observed,id:'live-CAFÉ#cn2'}])[0].registeredPlayerId,undefined);
 assert.equal(applyIdentity(s,[{...observed,id:'live-incomplete',name:'Café#CN1'}])[0].registeredPlayerId,undefined);
 team.players[1].account='café#CN1';assert.equal(applyIdentity(s,[observed])[0].registeredPlayerId,undefined);
 team.players[1].account='';team.players[0].account='LegacyName';
 assert.equal(applyIdentity(s,[{...observed,id:'live-LegacyName'}])[0].registeredPlayerId,id);
 assert.equal(applyIdentity(s,[{...observed,id:'live-legacyname'}])[0].registeredPlayerId,undefined);
});

test('live client split Riot ID is available to roster mapping and conflicting fields are excluded',async()=>{
 const {normalizeLive}=await import('./adapters');const s=createFixture(),team=s.teams.find(t=>t.id===s.match.blueTeamId)!;team.players[0].account='Name#CN1';
 const base={team:'ORDER',riotIdGameName:' Name ',riotIdTagLine:' cn1 '};
 const split=normalizeLive({allPlayers:[base],gameData:{gameTime:50}},[]).players;
 assert.equal(split[0].id,'live-Name#cn1');assert.equal(applyIdentity(s,split)[0].registeredPlayerId,team.players[0].id);
 const conflict=normalizeLive({allPlayers:[{...base,riotId:'Another#CN1'}]},[]).players;
 assert.equal(conflict[0].id,'live-0');assert.equal(applyIdentity(s,conflict)[0].registeredPlayerId,undefined);
 const legacy=normalizeLive({allPlayers:[{team:'ORDER',riotId:'LegacyName'}]},[]).players;
 assert.equal(legacy[0].id,'live-LegacyName');
});
