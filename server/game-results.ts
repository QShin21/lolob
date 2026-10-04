import { randomUUID } from 'node:crypto';
import type { BroadcastState, GameResult, Player, Recording, Side } from '../shared/types';
import { currentGameResult, gameResultKey, rosterFingerprint } from '../shared/game-results';
import { currentIncomeSnapshot } from './player-income';

export function explicitWinner(value: unknown): Side | undefined {
  if(typeof value==='string')value=value.toUpperCase();
  return [1,100,'1','100','ORDER','BLUE'].includes(value as any)?'blue':[2,200,'2','200','CHAOS','RED'].includes(value as any)?'red':undefined;
}
export function lcuWinner(value: any): Side | undefined {
  if(!value||typeof value!=='object')return undefined;
  const direct=explicitWinner(value.winningTeamId??value.winningTeam??value.WinningTeam);if(direct)return direct;
  const teams=Array.isArray(value.teams)?value.teams:[];
  const winning=teams.filter((team:any)=>team?.isWinningTeam===true||team?.isWinner===true||team?.win===true||team?.win==='Win');
  return winning.length===1?explicitWinner(winning[0].teamId):undefined;
}
export function sourceGameId(value: unknown): string | undefined {
  return typeof value==='number'&&Number.isSafeInteger(value)&&value>0?String(value):typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value)&&value!=='0'?value:undefined;
}
export function acceptNextGameSample(state:BroadcastState,sample:{players:Player[];gameTime:number;ended:boolean;sourceGameId?:string}):boolean {
  if(currentGameResult(state))return false;
  const gate=state.awaitingNextGame;if(!gate)return true;
  if(sample.ended)return false;
  if(gate.sourceGameId&&sample.sourceGameId===gate.sourceGameId)return false;
  const changedId=!!sample.sourceGameId&&sample.sourceGameId!==gate.sourceGameId;
  if(!changedId&&rosterFingerprint(sample.players)===gate.rosterFingerprint&&sample.gameTime>=gate.gameTime-1)return false;
  delete state.awaitingNextGame;return true;
}
function seriesComplete(state:BroadcastState):boolean {
  const count=Number(state.match.format.match(/^BO(\d+)$/i)?.[1]);
  return Number.isInteger(count)&&count>0&&(state.match.blueScore>=Math.floor(count/2)+1||state.match.redScore>=Math.floor(count/2)+1);
}
function applyWinner(state:BroadcastState,result:GameResult,winner:Side):void {
  result.winner=winner;result.winnerTeamId=winner==='blue'?result.blueTeamId:result.redTeamId;
  state.match[`${winner}Score`]++;
  result.match=structuredClone(state.match);result.seriesComplete=seriesComplete(state);
  const match=result.matchId?state.schedule.find(m=>m.id===result.matchId):undefined;
  if(match){match.blueScore=match.blueTeamId===result.blueTeamId?state.match.blueScore:state.match.redScore;match.redScore=match.redTeamId===result.redTeamId?state.match.redScore:state.match.blueScore;match.status=result.seriesComplete?'finished':'live';}
}
/** Confirmed end signals archive the last actually observed sample, including its original sample time. */
export function finalizeGame(state:BroadcastState,options:{source:GameResult['source'];winner?:Side;sourceGameId?:string;now?:number;terminal?:boolean}):GameResult|undefined {
  const key=gameResultKey(state);const existing=state.gameResults?.find(result=>result.key===key);
  if(existing){state.finishedGameId=existing.id;state.reportGameId=existing.id;state.phase='postgame';state.paused=true;if(existing.sourceGameId&&options.sourceGameId&&existing.sourceGameId!==options.sourceGameId)return existing;if(!existing.sourceGameId&&options.sourceGameId)existing.sourceGameId=options.sourceGameId;if(!existing.winner&&options.winner)applyWinner(state,existing,options.winner);return existing;}
  if(state.activeSourceGameId&&options.sourceGameId&&state.activeSourceGameId!==options.sourceGameId)return undefined;
  if(state.awaitingNextGame)return undefined;
  if(options.sourceGameId&&state.gameResults?.some(result=>result.seriesId===state.match.seriesId&&result.sourceGameId===options.sourceGameId))return undefined;
  if(state.mode==='live'&&(!state.players.some(p=>p.statsSource==='api'||p.statsSource==='ocr'||p.id.startsWith('live-'))||state.events.some(e=>e.id.startsWith('demo-'))))return undefined;
  const now=options.now??Date.now(),id=`game-${randomUUID()}`,endedAt=new Date(now).toISOString();
  const income=currentIncomeSnapshot(state);
  const observed=state.players.map(p=>p.statsSampledAt).filter((value):value is string=>!!value&&Number.isFinite(Date.parse(value))).sort();
  const snapshot:Recording={id,title:`${state.match.title} · 第 ${state.match.game} 局 · 赛后`,createdAt:endedAt,mode:state.mode,duration:state.gameTime,sourceGameTime:state.gameTime,...(observed[0]?{observedAt:observed[0]}:state.connections.live.updatedAt?{observedAt:state.connections.live.updatedAt}:{}),players:structuredClone(state.players),stats:structuredClone(state.stats),events:structuredClone(state.events),economy:structuredClone(state.economy),...(state.economyFeed?{economyFeed:structuredClone(state.economyFeed)}:{}),...(income?{incomeSnapshots:[structuredClone(income)]}:{})};
  const result:GameResult={id,key,seriesId:state.match.seriesId||state.match.title,...(state.match.seriesId?.startsWith(`${state.mode}:schedule:`)?{matchId:state.match.seriesId.slice(`${state.mode}:schedule:`.length)}:{}),game:state.match.game,blueTeamId:state.match.blueTeamId,redTeamId:state.match.redTeamId,winner:null,endedAt,source:options.source,...(options.sourceGameId?{sourceGameId:options.sourceGameId}:state.activeSourceGameId?{sourceGameId:state.activeSourceGameId}:{}),snapshot,match:structuredClone(state.match),teams:structuredClone(state.teams),draft:structuredClone(state.draft),seriesComplete:false,terminalSampleAccepted:options.terminal===true};
  if(options.source==='manual')result.terminalSampleAccepted=true;
  result.selectedPlayerId=state.selectedPlayerId;
  state.gameResults=[...(state.gameResults??[]),result];state.finishedGameId=id;state.reportGameId=id;state.phase='postgame';state.paused=true;delete state.gameClock;
  if(options.winner)applyWinner(state,result,options.winner);
  if(!state.recordings.some(recording=>recording.id===id))state.recordings=[structuredClone(snapshot),...state.recordings].slice(0,100);
  return result;
}

/** LCU can signal the end before the game's final Live Client sample reaches us. Upgrade once. */
type TerminalSample={players:Player[];stats:BroadcastState['stats'];events:BroadcastState['events'];gameTime:number;ended:boolean;sourceGameId?:string};
const validPlayerScores=(player:Player|undefined):player is Player=>!!player&&player.statsAvailable!==false&&[player.kills,player.deaths,player.assists,player.cs].every(value=>Number.isInteger(value)&&value>=0);
export function matchingTerminalGameSample(state:BroadcastState,sample:TerminalSample):boolean {
  const result=currentGameResult(state);
  if(!result||!sample.ended||sample.gameTime<result.snapshot.duration||!sample.players.length)return false;
  if(result.sourceGameId&&sample.sourceGameId&&result.sourceGameId!==sample.sourceGameId)return false;
  return rosterFingerprint(sample.players)===rosterFingerprint(result.snapshot.players);
}
export function absorbTerminalGameSample(state:BroadcastState,sample:TerminalSample):boolean {
  const result=currentGameResult(state);
  if(!result||result.terminalSampleAccepted||!matchingTerminalGameSample(state,sample))return false;
  const snapshot=result.snapshot;
  const previousPlayers=snapshot.players,previousStats=snapshot.stats;
  snapshot.players=structuredClone(sample.players);snapshot.stats=structuredClone(sample.stats);snapshot.events=structuredClone(sample.events);snapshot.duration=sample.gameTime;snapshot.sourceGameTime=sample.gameTime;
  // A partial terminal response must not replace valid observed scores with normalization defaults.
  for(const player of snapshot.players){
    const previous=previousPlayers.find(p=>p.id===player.id);
    if(!validPlayerScores(player)&&validPlayerScores(previous))Object.assign(player,{kills:previous.kills,deaths:previous.deaths,assists:previous.assists,cs:previous.cs,statsAvailable:previous.statsAvailable,statsSource:previous.statsSource,statsSampledAt:previous.statsSampledAt,statsGameTime:previous.statsGameTime,statsExpiresAt:previous.statsExpiresAt});
  }
  for(const side of ['blue','red']as const)snapshot.stats[side].kills=snapshot.players.filter(player=>player.team===side&&validPlayerScores(player)).reduce((sum,player)=>sum+player.kills,0);
  // Missing lifetime-gold fields retain the last known amount with its original source timestamp.
  for(const player of snapshot.players){const previous=previousPlayers.find(p=>p.id===player.id);if(player.gold===null&&previous?.gold!==null&&previous?.gold!==undefined){player.gold=previous.gold;for(const field of ['goldSource','goldSampledAt','goldGameTime','goldExpiresAt']as const)(player as any)[field]=previous[field];}}
  for(const side of ['blue','red']as const)if(snapshot.stats[side].gold===null)snapshot.stats[side].gold=previousStats[side].gold;
  const observed=snapshot.players.map(p=>p.statsSampledAt).filter((value):value is string=>!!value&&Number.isFinite(Date.parse(value))).sort();if(observed[0])snapshot.observedAt=observed[0];
  if(sample.sourceGameId)result.sourceGameId=sample.sourceGameId;
  result.terminalSampleAccepted=true;result.source='live';
  const recording=state.recordings.find(r=>r.id===result.id);if(recording)Object.assign(recording,structuredClone(snapshot));
  return true;
}
