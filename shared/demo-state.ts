import type { BroadcastState, GameResult, Player, Team } from './types';
import { bundledChampions, bundledChampionVersion } from './champion-art';
import { BUILTIN_STYLE_REF } from './style-packs';
import { productionDefaults, productionKey } from './production';
import { gameResultKey } from './game-results';
import type { TwitchAudienceDisplay, TwitchAudienceState } from './twitch-audience';

const roles = ['上单','打野','中单','下路','辅助'];
const heroes = ['Aatrox','LeeSin','Ahri','Jinx','Thresh','KSante','Vi','Azir','Kaisa','Nautilus'];
/** Browser-local demonstration state. No producer action or persistence API consumes this object. */
export function createDemoState(now = Date.now()): BroadcastState {
  const stamp = new Date(now).toISOString(), champions = bundledChampions();
  const teams: Team[] = ['苍穹演示队','赤焰演示队'].map((name, i) => ({ id: `demo-team-${i}`, name, tag: i ? 'RED' : 'BLUE', color: i ? '#ef7892' : '#5dbcef', logo: champions[i].image, players: roles.map((role,j) => ({ id: `demo-member-${i}-${j}`, name: `${i ? '赤焰' : '苍穹'}${j+1}`, role })) }));
  const players: Player[] = heroes.map((id,i) => {
    const side = i < 5 ? 'blue' : 'red', member = teams[i<5?0:1].players[i%5], champion = champions.find(c=>c.id===id)!;
    const damage = 12000+i*900;
    return { id:`demo-player-${i}`,registeredPlayerId:member.id,name:member.name,role:member.role,championId:id,championName:champion.name,team:side,
      skinId:i===0?1:0,kills:2+i%4,deaths:1+i%3,assists:4+i%5,cs:110+i*12,level:12+i%4,gold:8400+i*430,currentGold:550+i*60,
      statsAvailable:true,statsSource:'api',statsSampledAt:stamp,statsGameTime:1200,goldSource:'api',goldSampledAt:stamp,goldGameTime:1200,
      items:[1055,3006,3031,3085,3340],itemSlots:[1055,3006,3031,3085,0,0,3340],itemCounts:[1,1,1,1,0,0,1],
      fullRuneIds:[8010,9111,9104,8014,8345,8347],statRuneIds:[5005,5008,5001],runeSelection:{keystoneId:8010,primaryTreeId:8000,secondaryTreeId:8300},
      health:1300+i*25,maxHealth:2100,resource:400,maxResource:700,resourceType:'MANA',experience:300+i*35,maxExperience:1000,
      ultimate:{state:i%2?'cooldown':'ready',readyAt:1220+i,level:2},summonerSpells:[{id:4,name:'SummonerFlash'},{id:i%5===1?11:12,name:i%5===1?'SummonerSmite':'SummonerTeleport'}],
      roleQuest:{completed:i%5!==4,progress:i%5===4?450:600,maxProgress:600},visionScore:10+i*4,damageDealt:damage,damageTaken:damage/2,
      telemetry:{gameTime:1200,sampledAt:stamp,validForMs:5000,source:'api'},telemetryDamageSource:'api',telemetryDamageSession:'demo',telemetryDamage:{toChampions:damage,physicalToChampions:damage*.4,magicToChampions:damage*.5,trueToChampions:damage*.1} };
  });
  const state: BroadcastState = { revision:0,mode:'live',phase:'live',previewScene:'live',programScene:'live',match:{title:'RiftCast 图形演示',subtitle:'模拟比赛 · 赛前排版检查',game:2,format:'BO3',blueTeamId:teams[0].id,redTeamId:teams[1].id,blueScore:1,redScore:0,seriesId:'demo-series'},teams,players,gameTime:1200,paused:true,
    draft:{bluePicks:heroes.slice(0,5),redPicks:heroes.slice(5),blueBans:['Yone','Renekton','Leblanc','Rumble','Poppy'],redBans:['Ashe','Sejuani','Orianna','Rell','Kalista'],timer:23,activeTeam:'blue',action:'选择英雄',locked:true},
    schedule:[{id:'demo-match',title:'演示半决赛',blueTeamId:teams[0].id,redTeamId:teams[1].id,scheduledAt:stamp,format:'BO3',status:'finished',blueScore:2,redScore:1}],
    stats:{blue:{kills:18,gold:47000,towers:4,dragons:2,barons:0,heralds:1,elders:0,voidgrubs:3},red:{kills:12,gold:42500,towers:2,dragons:1,barons:0,heralds:0,elders:0,voidgrubs:3}},
    events:[{id:'demo-kill',time:1198,type:'ChampionKill',team:'blue',actor:players[0].name,victim:players[5].name,assistants:[players[1].name,players[2].name],text:'演示击杀事件'},{id:'demo-dragon',time:1195,type:'DragonKill',team:'blue',actor:players[1].name,objective:'Fire',text:'演示火龙事件'},{id:'demo-inhibitor',time:1170,type:'InhibKilled',team:'blue',victim:'Barracks_T2_C1',text:'演示水晶事件'}],
    economy:Array.from({length:21},(_,i)=>({time:i*60,blue:2500+i*2200+Math.sin(i)*300,red:2500+i*1950+Math.cos(i)*250,source:'api' as const})),
    connections:{lcu:{status:'connected',detail:'演示数据',updatedAt:stamp},live:{status:'connected',detail:'演示数据',updatedAt:stamp},replay:{status:'disconnected',detail:'演示预览'},obs:{status:'disconnected',detail:'演示预览'}},
    overlay:{stylePack:{...BUILTIN_STYLE_REF},preset:'arena',scoreboard:true,players:true,objectives:true,ticker:false,goldDiff:true,sponsor:'演示素材',tickerText:'这是模拟数据，用于赛前排版检查',accent:'#83e6c5',scale:1,countdownEnd:now+90000,nativeHud:'off',patchVersion:bundledChampionVersion,bottomTitle:'RIFTCAST · DEMONSTRATION'},assets:[],recordings:[],selectedPlayerId:null,
    settings:{lockfilePath:'',obsUrl:'',pollInterval:500,autoPhase:false,gamePath:''},production:productionDefaults(),draftHistory:[],gameResults:[] };
  for(const side of ['blue','red'] as const){state.stats[side].objectivesSource='memory';state.stats[side].objectivesSampledAt=stamp;state.stats[side].objectivesExpiresAt=new Date(now+5000).toISOString();}
  state.neutralObjectives={gameTime:1200,sampledAt:stamp,validForMs:5000,profile:'demo',objectives:[{kind:'dragon',state:'countdown',dueAt:1280},{kind:'baron',state:'alive'}]};
  state.fightSegment={id:'demo-fight',key:productionKey(state),active:true,startedAt:1180,lastTime:1200,players:Object.fromEntries(players.map((p,i)=>[p.id,{championId:p.championId,baseline:10000,total:800+i*120,previous:p.damageDealt,sampledAt:stamp,damageSession:'demo'}])),samples:Array.from({length:21},(_,i)=>({time:1180+i,blue:i*310,red:i*265}))};
  const combatants=players.map((p,i)=>({id:i+1,champion:p.championId,team:p.team,name:p.name}));
  state.combatReview={session:'demo',gameTime:1200,sampledAt:stamp,validForMs:5000,coverageFrom:1160,coverageUntil:1200,flowFrom:1170,flowComplete:true,
    flows:[{source:combatants[0],target:combatants[5],total:1800,physical:1300,magic:300,trueDamage:200},{source:combatants[2],target:combatants[6],total:2200,physical:100,magic:2000,trueDamage:100}],
    deaths:[{id:'demo-death',time:1198,from:1186,victim:combatants[5],complete:true,sources:[{source:combatants[0],total:1800,physical:1300,magic:300,trueDamage:200},{source:combatants[2],total:600,physical:0,magic:600,trueDamage:0}]}],
    fights:[{id:'demo-history-fight',start:1170,end:1185,complete:true,participants:combatants.map(p=>p.champion),rows:combatants.map((player,i)=>({player,damage:500+i*80})),samples:[{time:1170,blue:0,red:0},{time:1180,blue:2000,red:1800},{time:1185,blue:3300,red:5300}]}],
    objectives:[{id:100,kind:'dragon',from:1180,until:1200,complete:true,total:5000,dps:250,rows:[{player:combatants[1],damage:3000,dps:150},{player:combatants[3],damage:2000,dps:100}]}]};
  for(let game=1;game<=2;game++) {
    const snapshotPlayers=structuredClone(players);snapshotPlayers.forEach(p=>{p.telemetryDamageSource='postgame';});
    const result:GameResult={id:`demo-result-${game}`,key:gameResultKey({...state,match:{...state.match,game}}),sourceGameId:`demo-${game}`,seriesId:'demo-series',matchId:'demo-match',game,blueTeamId:teams[0].id,redTeamId:teams[1].id,winner:game===1?'blue':'red',winnerTeamId:teams[game===1?0:1].id,endedAt:stamp,source:'manual',seriesComplete:false,terminalSampleAccepted:true,terminalSampleComplete:true,
      match:{...state.match,game},teams:structuredClone(teams),draft:structuredClone(state.draft),snapshot:{id:`demo-record-${game}`,title:'演示归档',createdAt:stamp,duration:1200,sourceGameTime:1200,mode:'live',players:snapshotPlayers,stats:structuredClone(state.stats),events:structuredClone(state.events),economy:structuredClone(state.economy)}};
    state.gameResults!.push(result);
  }
  state.reportGameId='demo-result-2';return state;
}
export function demoTwitchState(display: TwitchAudienceDisplay, now = Date.now()): TwitchAudienceState {
  const question={id:'demo-question',title:'演示投票：你看好哪一队？',status:'ACTIVE',startedAt:new Date(now-10000).toISOString(),endsAt:new Date(now+45000).toISOString(),choices:[{id:'1',title:'苍穹演示队',votes:64},{id:'2',title:'赤焰演示队',votes:36}]};
  return {status:'connected',detail:'本地模拟',capabilities:{polls:true,predictions:true,chat:true},display,poll:question,prediction:{...question,title:'演示预测：谁将赢得比赛？'},chatVote:{...question,title:'演示聊天投票',status:'ACTIVE',totalVoters:100},warnings:[]};
}
