import type { SummonerSpell } from './types';

const spellIds: Record<number, string> = {1:'SummonerBoost',3:'SummonerExhaust',4:'SummonerFlash',6:'SummonerHaste',7:'SummonerHeal',11:'SummonerSmite',12:'SummonerTeleport',13:'SummonerMana',14:'SummonerDot',21:'SummonerBarrier',30:'SummonerPoroRecall',31:'SummonerPoroThrow',32:'SummonerSnowball',39:'SummonerSnowURFSnowball_Mark',54:'Summoner_UltBookPlaceholder',55:'Summoner_UltBookSmitePlaceholder',2201:'SummonerCherryHold',2202:'SummonerCherryFlash'};
const spellNames: Record<string, string> = {
  '闪现':'SummonerFlash',flash:'SummonerFlash','虚弱':'SummonerExhaust',exhaust:'SummonerExhaust',
  '传送':'SummonerTeleport','解封的传送':'SummonerTeleport','解封传送':'SummonerTeleport',teleport:'SummonerTeleport','unleashedteleport':'SummonerTeleport',
  '治疗术':'SummonerHeal','治疗':'SummonerHeal',heal:'SummonerHeal','惩戒':'SummonerSmite','原初惩戒':'SummonerSmite','挑战惩戒':'SummonerSmite','深寒惩戒':'SummonerSmite','灼烧惩戒':'SummonerSmite',smite:'SummonerSmite','primalsmite':'SummonerSmite','challengingsmite':'SummonerSmite','chillingsmite':'SummonerSmite','unleashedsmite':'SummonerSmite',
  '引燃':'SummonerDot',ignite:'SummonerDot','疾跑':'SummonerHaste',ghost:'SummonerHaste','屏障':'SummonerBarrier',barrier:'SummonerBarrier',
  '净化':'SummonerBoost',cleanse:'SummonerBoost','清晰术':'SummonerMana',clarity:'SummonerMana','标记':'SummonerSnowball',mark:'SummonerSnowball','雪球':'SummonerSnowball',snowball:'SummonerSnowball',
};
const canonicalSpells = new Set(Object.values(spellIds));

/** Live Client localization tokens and evolved spells use canonical Data Dragon artwork. */
export function summonerSpellKey(spell?: SummonerSpell): string | undefined {
  if (!spell) return undefined;
  if (spell.id && spellIds[spell.id]) return spellIds[spell.id];
  for (const raw of [spell.rawName, spell.name]) {
    if (!raw) continue;
    const localized = spellNames[raw.trim().toLowerCase().replace(/[\s_-]/g, '')];
    if (localized) return localized;
    const token = raw.replace(/^game_spell_displayname_/i, '').replace(/^GeneratedTip_SummonerSpell_/i, '').replace(/_(?:DisplayName|Description)$/i, '').replace(/^(?:S\d+_)/i, '');
    if (/^SummonerTeleport(?:Upgrade)?$/i.test(token)) return 'SummonerTeleport';
    if (/^(?:SummonerSmite\w*|S5_SummonerSmite\w*)$/i.test(token)) return 'SummonerSmite';
    const canonical = [...canonicalSpells].find(key => key.toLowerCase() === token.toLowerCase());
    if (canonical) return canonical;
  }
  return undefined;
}

export function summonerSpellImage(spell: SummonerSpell | undefined, version: string): string | undefined {
  const key = summonerSpellKey(spell);
  return key && /^\d+\.\d+\.\d+$/.test(version) ? `https://ddragon.leagueoflegends.com/cdn/${version}/img/spell/${key}.png` : undefined;
}

// Paths verified against Riot's 16.19.1 runesReforged.json; style artwork is version independent.
const runePaths: Record<number, string> = {
  8000:'Styles/7201_Precision.png',8100:'Styles/7200_Domination.png',8200:'Styles/7202_Sorcery.png',8300:'Styles/7203_Whimsy.png',8400:'Styles/7204_Resolve.png',
  8005:'Styles/Precision/PressTheAttack/PressTheAttack.png',8008:'Styles/Precision/LethalTempo/LethalTempoTemp.png',8021:'Styles/Precision/FleetFootwork/FleetFootwork.png',8010:'Styles/Precision/Conqueror/Conqueror.png',
  8112:'Styles/Domination/Electrocute/Electrocute.png',8128:'Styles/Domination/DarkHarvest/DarkHarvest.png',9923:'Styles/Domination/HailOfBlades/HailOfBlades.png',
  8214:'Styles/Sorcery/SummonAery/SummonAery.png',8229:'Styles/Sorcery/ArcaneComet/ArcaneComet.png',8230:'Styles/Sorcery/PhaseRush/StormraidersSurgeRuneIcon2.png',8992:'Styles/Sorcery/DeathfireTouch/DEATHFIRE_TOUCH_KEYSTONE.png',
  8437:'Styles/Resolve/GraspOfTheUndying/GraspOfTheUndying.png',8439:'Styles/Resolve/VeteranAftershock/VeteranAftershock.png',8465:'Styles/Resolve/Guardian/Guardian.png',
  8351:'Styles/Inspiration/GlacialAugment/GlacialAugment.png',8360:'Styles/Inspiration/UnsealedSpellbook/UnsealedSpellbook.png',8369:'Styles/Inspiration/FirstStrike/FirstStrike.png',
};
export function runeImage(id?: number): string | undefined {
  return id && runePaths[id] ? `https://ddragon.leagueoflegends.com/cdn/img/perk-images/${runePaths[id]}` : undefined;
}
