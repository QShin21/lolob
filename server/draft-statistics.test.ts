import test from 'node:test';
import assert from 'node:assert/strict';
import { draftStatistics, draftStatisticsTarget, validateDraftStatistics } from '../shared/draft-statistics';
import { createFixture } from './test-support/fixture';
import { finalizeGame } from './game-results';
import { applyAction,normalizeSavedState } from './state';
import { programState } from '../shared/production';

function fixture(){const s=createFixture(),r=finalizeGame(s,{source:'manual',winner:'blue',sourceGameId:'draft-stats-one'});assert.ok(r);r.tournamentId='cup';s.overlay.draftStatistics={source:'all'};s.draft.bluePreselect=['Ahri'];s.draft.locked=false;s.draft.activeTeam='blue';return{s,r};}
test('draft statistics is opt-in and validates only supported local sources',()=>{
 const s=createFixture();assert.equal(draftStatistics(s).enabled,false);
 for(const value of [{source:'ugg'},{source:'tournament'},{source:'all',url:'https://example.com'},null])assert.throws(()=>validateDraftStatistics(value));
 assert.deepEqual(validateDraftStatistics({source:'current',tournamentId:'ignored'}),{source:'current'});
});
test('preselection takes precedence, then an explicitly selected picked hero, then the active side last pick',()=>{
 const{s}=fixture();s.selectedPlayerId=s.players[0].id;assert.equal(draftStatisticsTarget(s)?.id,'Ahri');
 s.draft.bluePreselect=[];assert.equal(draftStatisticsTarget(s)?.id,s.players[0].championId);
 s.selectedPlayerId='missing';assert.equal(draftStatisticsTarget(s)?.id,s.draft.bluePicks.at(-1));
 s.draft.bluePicks=[];assert.equal(draftStatisticsTarget(s),undefined);
});
test('rates use separate complete pick, ban and resolved-win sample denominators',()=>{
 const{s,r}=fixture();r.draft.redBans=['Yone','Vi','Azir','Kaisa','Nautilus'];const result=draftStatistics(s);
 assert.equal(result.pickSamples,1);assert.equal(result.pickRate,1);assert.equal(result.winSamples,1);assert.equal(result.winRate,1);assert.equal(result.banSamples,1);assert.equal(result.banRate,0);
 r.winner=null;r.winnerTeamId=undefined;r.draft.blueBans=[];const partial=draftStatistics(s);assert.equal(partial.winRate,null);assert.equal(partial.banRate,null);assert.equal(partial.pickRate,1);
 s.gameResults=[];const empty=draftStatistics(s);assert.equal(empty.pickRate,null);assert.equal(empty.banRate,null);assert.equal(empty.winRate,null);
});
test('current and explicit tournament scopes never fall back to unrelated archives',()=>{
 const{s}=fixture();s.overlay.draftStatistics={source:'current'};assert.equal(draftStatistics(s).games,0);
 s.match.seriesId=`live:schedule:${s.schedule[0].id}`;s.schedule[0].tournament={tournamentId:'cup',stage:'league',round:1,order:0,blue:{kind:'team',teamId:s.match.blueTeamId},red:{kind:'team',teamId:s.match.redTeamId},state:'ready'};
 assert.equal(draftStatistics(s).games,1);s.overlay.draftStatistics={source:'tournament',tournamentId:'another'};assert.equal(draftStatistics(s).games,0);
 s.overlay.draftStatistics={source:'tournament',tournamentId:'cup'};assert.equal(draftStatistics(s).games,1);
});
test('duplicate archives and invalid attempts do not inflate draft rates',()=>{
 const{s,r}=fixture();s.gameResults!.push(structuredClone(r));assert.equal(draftStatistics(s).games,1);
 s.production!.invalidAttempts.push({key:r.key,at:r.endedAt,reason:'重赛',draft:r.draft,result:r});assert.equal(draftStatistics(s).pickRate,null);
});
test('statistic settings persist, stay in preview until TAKE and reject invalid external providers',()=>{
 let s=createFixture();s=applyAction(s,{type:'set-overlay',patch:{draftStatistics:{source:'all'}}});
 assert.equal(programState(s).overlay.draftStatistics,undefined);assert.equal(normalizeSavedState(JSON.parse(JSON.stringify(s))).overlay.draftStatistics?.source,'all');
 s=applyAction(s,{type:'take',scene:'draft'});assert.equal(programState(s).overlay.draftStatistics?.source,'all');
 assert.throws(()=>applyAction(s,{type:'set-overlay',patch:{draftStatistics:{source:'ugg'} as never}}));
});
