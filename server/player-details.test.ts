import { cachedResource } from '../shared/resource-url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summonerSpellImage, summonerSpellKey, runeImage } from '../shared/player-assets';
import { normalizeLive } from './adapters';

test('summoner icons accept real localized spectator spell tokens and evolved variants', () => {
  const cases = [
    ['解封的传送', 'GeneratedTip_SummonerSpell_S12_SummonerTeleportUpgrade_DisplayName', 'SummonerTeleport'],
    ['Unleashed Teleport', '', 'SummonerTeleport'],
    ['原初惩戒', 'GeneratedTip_SummonerSpell_SummonerSmiteAvatarUtility_DisplayName', 'SummonerSmite'],
    ['Primal Smite', 'GeneratedTip_SummonerSpell_SummonerSmiteAvatarOffensive_DisplayName', 'SummonerSmite'],
    ['Unleashed Smite', 'GeneratedTip_SummonerSpell_SummonerSmiteAvatarDefensive_DisplayName', 'SummonerSmite'],
    ['未知本地化', 'GeneratedTip_SummonerSpell_SummonerFlash_DisplayName', 'SummonerFlash'],
    ['game_spell_displayname_SummonerExhaust', '', 'SummonerExhaust'],
    ['SummonerTeleportUpgrade', '', 'SummonerTeleport'],
    ['S5_SummonerSmiteDuel', '', 'SummonerSmite'],
    ['Cleanse', '', 'SummonerBoost'],
  ];
  for (const [name, rawName, expected] of cases) assert.equal(summonerSpellKey({ name, rawName }), expected);
  assert.equal(summonerSpellKey({id:4,name:'未知'}),'SummonerFlash');
  assert.equal(summonerSpellKey({id:999999,name:'unsupported'}),undefined);
  assert.equal(summonerSpellImage({name:'SummonerTeleportUpgrade'},'16.19.1'),cachedResource('https://ddragon.leagueoflegends.com/cdn/16.19.1/img/spell/SummonerTeleport.png'));
  assert.equal(summonerSpellImage({name:'Flash'},'../../assets'),undefined);
});

test('spell slots and source tokens survive normalization without shifting the second spell', () => {
  const result=normalizeLive({allPlayers:[{team:'ORDER',summonerSpells:{summonerSpellTwo:{displayName:'解封的传送',rawDisplayName:'GeneratedTip_SummonerSpell_S12_SummonerTeleportUpgrade_DisplayName'}}},{team:'CHAOS',summonerSpells:{summonerSpellOne:{id:4}}}]},[]);
  assert.deepEqual(result.players[0].summonerSpells?.[0],{name:''});
  assert.equal(result.players[0].summonerSpells?.[1].rawName,'GeneratedTip_SummonerSpell_S12_SummonerTeleportUpgrade_DisplayName');
  assert.equal(summonerSpellKey(result.players[0].summonerSpells?.[1]),'SummonerTeleport');
  assert.equal(summonerSpellKey(result.players[1].summonerSpells?.[0]),'SummonerFlash');
});

test('scoreboard reads explicit vision, rune roles, item counts and compatible details', () => {
  const result=normalizeLive({gameData:{gameTime:500},allPlayers:[{
    team:'ORDER',level:8,scores:{kills:0,deaths:0,assists:0,creepScore:70,wardScore:6.2},
    items:[{itemID:1055,slot:0,count:1},{itemID:2055,slot:4,count:2},{itemID:3340,slot:6,count:1}],
    runes:{secondaryRuneTree:{id:8300}},experience:180,maxExperience:550,
    ultimate:{state:'cooldown',cooldownRemaining:42,level:1},roleQuest:{completed:false,progress:330,maxProgress:600},
  }]},[]).players[0];
  assert.equal(result.visionScore,6.2);assert.deepEqual(result.itemCounts,[1,0,0,0,2,0,1]);
  assert.deepEqual(result.runeSelection,{secondaryTreeId:8300});assert.equal(result.experience,180);assert.equal(result.maxExperience,550);
  assert.deepEqual(result.ultimate,{state:'cooldown',cooldownRemaining:42,level:1});
  assert.deepEqual(result.roleQuest,{completed:false,progress:330,maxProgress:600});
  assert.ok(runeImage(result.runeSelection?.secondaryTreeId)?.endsWith('7203_Whimsy.png'));
  assert.equal(runeImage(999999),undefined);
});

test('absent details remain unknown and active ability levels do not invent ultimate readiness', () => {
  const result=normalizeLive({gameData:{gameTime:1200},activePlayer:{riotId:'active-test',abilities:{R:{abilityLevel:2}},experience:250,maxExperience:800},allPlayers:[{team:'ORDER',riotId:'active-test',level:16},{team:'ORDER',riotId:'other-test',level:16},{team:'CHAOS',riotId:'invalid-test',level:18,experience:-5,maxExperience:NaN,visionScore:'6',ultimate:{cooldownRemaining:-1},roleQuest:{completed:'true',progress:-1}}]},[]).players;
  assert.deepEqual(result[0].ultimate,{state:'unknown',level:2});assert.equal(result[0].experience,250);
  assert.equal(result[1].ultimate,undefined);assert.equal(result[1].experience,undefined);assert.equal(result[1].health,undefined);assert.equal(result[1].roleQuest,undefined);
  assert.equal(result[2].ultimate?.state,'unknown');assert.equal(result[2].experience,undefined);assert.equal(result[2].visionScore,undefined);assert.equal(result[2].roleQuest,undefined);
});
