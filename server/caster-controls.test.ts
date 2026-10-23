import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from './test-support/fixture';
import { applyAction, normalizeSavedState } from './state';
import { ControlSeats } from './control-seats';
import { casterBindings, casterButtonCommand, validateCasterConfiguration, type CasterButton } from '../shared/caster-controls';
import { executeCasterAction } from '../src/components/caster-action';

const button: CasterButton={id:'show-damage',label:'伤害分析',action:'analysis-mode',value:'damage',keys:['Alt+Shift+D','Alt+Shift+E']};
test('caster configuration persists multiple hotkeys and ordered buttons across reload without changing default shortcuts',()=>{
 const s=createFixture(),old=structuredClone(s.production!.hotkeys);
 const next=applyAction(s,{type:'production',command:{op:'settings',hotkeyAliases:{take:['Alt+Shift+T','Alt+Shift+Y']},casterButtons:[button,{id:'to-live',label:'预监直播',action:'preview',value:'live',keys:[]}]}});
 const restored=normalizeSavedState(JSON.parse(JSON.stringify(next)));
 assert.deepEqual(restored.production!.hotkeys,old);assert.deepEqual(restored.production!.casterButtons?.map(b=>b.id),['show-damage','to-live']);
 assert.deepEqual(casterBindings(restored.production!).take,[old.take,'Alt+Shift+T','Alt+Shift+Y']);
 assert.deepEqual(casterBindings(restored.production!)['button-show-damage'],button.keys);
});
test('caster settings reject cross-action duplicates, unknown operations, invalid payloads and excessive bindings atomically',()=>{
 const s=createFixture(),before=structuredClone(s.production);
 for(const [aliases,buttons]of [[{take:[s.production!.hotkeys.live]},[]],[{take:['Alt+Shift+T','Alt+Shift+T']},[]],[{},[{...button,action:'eval'}]],[{},[{...button,value:'invalid-mode'}]],[{},[{...button,keys:Array(4).fill('Alt+Shift+Q')}]], [{unknown:[]},[]]])assert.throws(()=>validateCasterConfiguration(s.production!.hotkeys,aliases,buttons));
 assert.throws(()=>applyAction(s,{type:'production',command:{op:'settings',hotkeyAliases:{take:['bad']},analysisSeconds:99}}));assert.deepEqual(s.production,before);
});
test('caster configuration requires the active director seat while ordinary production settings retain their permission',()=>{
 const seats=new ControlSeats(),owner=seats.issue({role:'director'},true),other=seats.issue({role:'director'},true),data=seats.issue({role:'data'},true);
 for(const cmd of [{op:'settings',casterButtons:[]},{op:'settings',hotkeyAliases:{}},{op:'settings',hotkeys:createFixture().production!.hotkeys}]){
 assert.doesNotThrow(()=>seats.authorize(owner.token,'production',cmd));for(const token of [other.token,data.token])assert.throws(()=>seats.authorize(token,'production',cmd));}
 assert.doesNotThrow(()=>seats.authorize(data.token,'production',{op:'settings',analysisSeconds:10}));
});
test('custom button dispatch uses whitelisted existing actions and rejects stale player identity or lost control',async()=>{
 const state=createFixture();state.production!.control={owner:'director',name:'Director'};state.production!.casterButtons=[button];
 const sent:unknown[]=[];const ctx={state,seat:{id:'director',role:'director' as const,name:'Director'},connected:true,send:async(a:any)=>{sent.push(a);}};
 await executeCasterAction(ctx,'button-show-damage');assert.deepEqual(sent,[{type:'set-overlay',patch:{analysisMode:'damage'}}]);
 assert.deepEqual(casterButtonCommand({...button,action:'postgame-page',value:'2'}),{type:'set-overlay',patch:{postgamePage:2}});
 state.production!.casterButtons=[{...button,action:'player',value:'past-player'}];await assert.rejects(executeCasterAction(ctx,'button-show-damage'),/当前对局/);
 state.production!.control.owner='other';await assert.rejects(executeCasterAction(ctx,'take'),/主导播/);assert.equal(sent.length,1);
});
