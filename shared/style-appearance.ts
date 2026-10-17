/** Stable semantic targets; selectors remain owned by the renderer. */
export const APPEARANCE_TARGETS = {
  "lineupName": ".rl-info > .fit-name",
  "lineupCardBlue": ".rl-card.blue",
  "lineupCardRed": ".rl-card.red",
  "lineupTeam": ".rl-tag",
  "lineupScoreBlue": ".rl-score.blue",
  "lineupScoreRed": ".rl-score.red",
  "lineupGame": ".rl-game",
  "lineupCaption": ".rl-caption",
  "lineupFooter": ".rune-lineup footer",
  "draftName": ".cast-draft-player",
  "draftTeam": ".arena-draft-team-heading",
  "draftTimer": ".cast-draft-timer",
  "liveName": ".lb-player-name",
  "liveNameplate": ".lb-nameplate",
  "liveScoreboard": ".lb-scoreboard",
  "reportName": ".pr-card > .fit-name",
  "reportKda": ".pr-kda",
  "reportHeadingBlue": ".pr-table-heading:not(.red)",
  "reportHeadingRed": ".pr-table-heading.red",
  "reportTeam": ".pr-header > strong",
  "reportGame": ".pr-header small",
  "reportCaption": ".pr-caption",
  "reportMetric": ".pr-metrics",
  "reportGoldLabel": ".pr-gold-label",
  "scheduleTeam": ".arena-schedule-team",
  "scheduleScore": ".arena-schedule-score",
  "scheduleTime": ".arena-schedule-time",
  "countdownNumber": ".arena-countdown-number",
  "countdownMessage": ".arena-countdown-message",
  "interviewName": ".cast-interview-name",
  "ticker": ".cast-ticker",
  "analysisHeading": ".arena-analysis-heading"
} as const;
export const APPEARANCE_PROPERTIES = ['color', 'backgroundColor', 'borderColor', 'font', 'fontSize', 'fontWeight', 'letterSpacing'] as const;
export type ElementAppearance = {color?: string; backgroundColor?: string; borderColor?: string; font?: 'default' | 'modern' | 'serif'; fontSize?: number; fontWeight?: number; letterSpacing?: number};
export type StyleAppearance = Partial<Record<keyof typeof APPEARANCE_TARGETS, ElementAppearance | null>>;
export function mergeAppearance(base?: StyleAppearance, scene?: StyleAppearance): StyleAppearance {
  const result = {...base};
  for (const [key, value] of Object.entries(scene ?? {})) {
    const target = key as keyof StyleAppearance;
    result[target] = value === null ? null : {...result[target], ...value};
  }
  return result;
}
