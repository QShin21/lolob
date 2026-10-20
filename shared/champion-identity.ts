/** Live Client Data uses both localization-key formats in the same roster. */
export function liveChampionId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const id = raw.replace(/^game_character_displayname_/i, '').replace(/^Character_([A-Za-z0-9]+)_Name$/i, '$1');
  return /^[A-Za-z0-9]{2,40}$/.test(id) ? id : '';
}
