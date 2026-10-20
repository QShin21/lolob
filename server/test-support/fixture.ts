export const fallbackChampionData = [
  ['Aatrox',266,'暗裔剑魔','战士'],['LeeSin',64,'盲僧','刺客'],['Ahri',103,'九尾妖狐','法师'],['Jinx',222,'暴走萝莉','射手'],['Thresh',412,'魂锁典狱长','辅助'],
  ['KSante',897,'纳祖芒荣耀','坦克'],['Vi',254,'皮城执法官','战士'],['Azir',268,'沙漠皇帝','法师'],['Kaisa',145,'虚空之女','射手'],['Nautilus',111,'深海泰坦','坦克'],
  ['Yone',777,'封魔剑魂','刺客'],['Renekton',58,'荒漠屠夫','战士'],['Leblanc',7,'诡术妖姬','法师'],['Ashe',22,'寒冰射手','射手'],['Rell',526,'镕铁少女','辅助'],
  ['Sejuani',113,'北地之怒','坦克'],['Kalista',429,'复仇之矛','射手'],['Orianna',61,'发条魔灵','法师'],['Rumble',68,'机械公敌','战士'],['Poppy',78,'圣锤之毅','坦克'],
] as const;
// Synthetic input for automated tests only. Never imported by the application service.
import type { BroadcastState, Team, Player } from '../../shared/types';
import { BUILTIN_STYLE_REF } from '../../shared/style-packs';
import { createSeed as createInitialState, clearLiveData } from '../state';
import { captureManualDraft } from '../draft-history';
import { ensureProduction, captureProgram } from '../../shared/production';
const roles=['上单','打野','中单','下路','辅助'];
export function createFixture(): BroadcastState {
  const names = [['山岚','追风','星河','流光','青禾'],['赤霄','临渊','长夜','烬羽','望舒']];
  const teams: Team[] = [
    {id:'azure',name:'苍穹竞技',tag:'AZR',color:'#48b8ef',players:names[0].map((name,i)=>({name,role:roles[i]}))},
    {id:'ember',name:'赤焰战队',tag:'EMB',color:'#ef665e',players:names[1].map((name,i)=>({name,role:roles[i]}))},
    {id:'jade',name:'青玉之锋',tag:'JAD',color:'#78d3ac',players:roles.map((role,i)=>({name:['竹影','听雨','云舟','晚照','见月'][i],role}))},
    {id:'storm',name:'雷霆先锋',tag:'STM',color:'#bd94f0',players:roles.map((role,i)=>({name:['雷鸣','疾行','远帆','破晓','风语'][i],role}))},
  ];
  for (const team of teams) for (const player of team.players) player.id = `${team.id}:${player.role}`;
  const players: Player[] = fallbackChampionData.slice(0,10).map(([id,,name],i)=>{
    // Explicitly synthetic combat values for the demonstration source only.
    const maxHealth=1600+i*70;const maxResource=i===1?200:i===0?100:700+i*35;
    const secondary=i%5===1?{id:11,name:'SummonerSmite'}:i%5===0?{id:12,name:'SummonerTeleport'}:i%5===2?{id:14,name:'SummonerDot'}:i%5===3?{id:7,name:'SummonerHeal'}:{id:3,name:'SummonerExhaust'};
    const [keystoneId,primaryTreeId,secondaryTreeId]=[[8010,8000,8400],[8010,8000,8300],[8112,8100,8200],[8008,8000,8300],[8439,8400,8300]][i%5];
    return {id:`${i<5?'blue':'red'}-${i%5}`,name:names[i<5?0:1][i%5],role:roles[i%5],championId:id,championName:name,kills:[3,2,4,4,1,1,2,3,3,0][i],deaths:[2,1,1,1,4,3,2,4,3,2][i],assists:[3,8,5,4,11,2,5,3,4,8][i],cs:[168,124,191,202,28,158,120,179,188,23][i],level:[13,12,14,13,10,12,11,13,12,10][i],gold:[9400,8100,10600,11100,5400,8300,7600,9500,10400,4900][i],items:[1055,3006,3031,3085,3340],itemSlots:[1055,3006,3031,3085,0,0,3340],itemCounts:[1,1,1,1,0,0,2],team:i<5?'blue':'red',health:Math.round(maxHealth*(.58+i%4*.1)),maxHealth,resource:Math.round(maxResource*(.42+i%3*.18)),maxResource,resourceType:i===1?'ENERGY':i===0?'BLOODWELL':'MANA',experience:120+i*48,maxExperience:880+i*40,ultimate:i%3===1?{state:'cooldown',cooldownRemaining:24+i*3,level:2}:{state:'ready',level:2},visionScore:[12,19,10,8,41,10,18,8,7,37][i],roleQuest:{completed:i%5!==4,progress:i%5===4?440:600,maxProgress:600},runeIds:[keystoneId,primaryTreeId,secondaryTreeId],runeSelection:{keystoneId,primaryTreeId,secondaryTreeId},isDead:false,respawnTimer:0,summonerSpells:[{id:4,name:'SummonerFlash'},secondary]};
  });
  const events = [{id:'fixture-1',time:182,type:'FirstBlood',text:'苍穹竞技 · 星河 拿下一血',team:'blue' as const},{id:'fixture-2',time:382,type:'DragonKill',text:'赤焰战队 击杀炼狱亚龙',team:'red' as const},{id:'fixture-3',time:628,type:'TurretKilled',text:'苍穹竞技 摧毁中路一塔',team:'blue' as const},{id:'fixture-4',time:1012,type:'DragonKill',text:'苍穹竞技 击杀海洋亚龙',team:'blue' as const}];
  const seed: BroadcastState = {
    revision:0,mode:'live',phase:'live',previewScene:'draft',programScene:'live',
    match:{title:'峡谷邀请赛 · 秋季赛',subtitle:'半决赛 · 演示数据',game:2,format:'BO3',blueTeamId:'azure',redTeamId:'ember',blueScore:1,redScore:0,seriesId:'fixture-series'},teams,
    schedule:[{id:'m1',title:'半决赛 A',blueTeamId:'azure',redTeamId:'ember',scheduledAt:'2026-10-03T19:00:00+08:00',format:'BO3',status:'live',blueScore:1,redScore:0},{id:'m2',title:'半决赛 B',blueTeamId:'jade',redTeamId:'storm',scheduledAt:'2026-10-03T20:30:00+08:00',format:'BO3',status:'scheduled',blueScore:0,redScore:0},{id:'m3',title:'决赛',blueTeamId:'azure',redTeamId:'jade',scheduledAt:'2026-10-04T19:00:00+08:00',format:'BO5',status:'scheduled',blueScore:0,redScore:0}],
    players,gameTime:1124,paused:false,
    stats:{blue:{kills:14,gold:44600,towers:4,dragons:2,barons:0},red:{kills:9,gold:40700,towers:2,dragons:1,barons:0}},
    draft:{bluePicks:players.slice(0,5).map(p=>p.championId),redPicks:players.slice(5).map(p=>p.championId),blueBans:['Yone','Renekton','Leblanc','Kalista','Rumble'],redBans:['Ashe','Sejuani','Orianna','Rell','Poppy'],timer:24,activeTeam:'blue',action:'选择英雄'},events,
    economy:Array.from({length:20},(_,i)=>({time:i*60,blue:2500+i*2215+Math.round(Math.sin(i/3)*400),red:2500+i*2007+Math.round(Math.cos(i/4)*360)})),
    connections:{lcu:{status:'disconnected',detail:'尚未连接客户端'},live:{status:'disconnected',detail:'等待游戏进入对局'},replay:{status:'disconnected',detail:'仅回放模式支持播放控制'},obs:{status:'disconnected',detail:'连接 OBS WebSocket 5.x'}},
    overlay:{stylePack:{...BUILTIN_STYLE_REF},preset:'arena',scoreboard:true,players:true,objectives:true,ticker:false,goldDiff:true,sponsor:'RIFTCAST',tickerText:'峡谷邀请赛 · 欢迎来到比赛直播间',accent:'#83e6c5',scale:1,countdownEnd:null,nativeHud:'auto',patchVersion:'26.18',bottomTitle:'2026 DEMACIA CUP GLOBAL INVITATIONAL',playerFeeds:{blue:{mode:'image',imageUrl:'',cameraDeviceId:'',label:''},red:{mode:'image',imageUrl:'',cameraDeviceId:'',label:''}}},assets:[],recordings:[],selectedPlayerId:null,
    settings:{lockfilePath:'',obsUrl:'ws://127.0.0.1:4455',pollInterval:500,autoPhase:true,gamePath:''},
    draftHistory:[{seriesId:'fixture-series',game:1,blueTeamId:'azure',redTeamId:'ember',bluePicks:fallbackChampionData.slice(10,15).map(c=>c[0]),redPicks:fallbackChampionData.slice(15,20).map(c=>c[0]),recordedAt:'2026-10-03T11:00:00.000Z',source:'manual'}],
  };
  const sampledAt=new Date().toISOString();
  seed.connections.live={status:'connected',detail:'isolated test input',updatedAt:sampledAt};
  for(const player of seed.players)Object.assign(player,{statsSource:'api',statsAvailable:true,statsSampledAt:sampledAt,statsGameTime:seed.gameTime,goldSource:'api',goldSampledAt:sampledAt,goldGameTime:seed.gameTime});
  captureManualDraft(seed);
  ensureProduction(seed).program=captureProgram(seed);
  return seed;
}

export function emptyFixture(): BroadcastState {
  const state=createFixture();clearLiveData(state);state.phase='pregame';state.paused=false;
  state.draftHistory=[];state.production=createInitialState().production;state.connections=createInitialState().connections;
  ensureProduction(state).program=captureProgram(state);return state;
}
