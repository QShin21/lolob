import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { tsImport } from 'tsx/esm/api';

const { BUILTIN_STYLE_PACK, BUILTIN_STYLE_RECORDS } = await tsImport('../shared/style-packs.ts', import.meta.url);
const { validateStyleManifest, writeBuiltinStyleArchive } = await tsImport('../server/style-packs.ts', import.meta.url);

const ink = '#070b12', navy = '#0e1624', panel = '#121c2c';
const gold = '#c8aa6e', pale = '#f0e2b8', bronze = '#7a6231', arc = '#4fd8eb';
const paper = '#f2f5f9', muted = '#a9b6c8', blue = '#5aa9ff', red = '#ff6b6b';
const blueNavy = '#10243b', redNavy = '#2a1926', steel = '#71839a';
const width = 1920, height = 1080;

// Legacy tokens serve distinct roles in the programme CSS, including native HUD status colors.
const palette = { ink, panel, muted, line: gold + '4d', paper, blue, red, accent: gold };
for (const [color, tokens] of [
  [ink, 'c000 c07080a c090909 c131514'],
  [navy, 'c14242e c142330 c0c100e c101211 c0a110f c13150e c1d2221 c121419 c111a23 cf4f0e3'],
  [panel, 'c233544 c243642 c1c2a36 c242b29 c17232e cfaf9f5 c192735'],
  ['#192639', 'c1b2e38 c2a3e4b'],
  ['#26364c', 'cd9d8d4 ceae9e3'],
  [paper, 'cf4f8fa cf3f3f1 cfff cf5f5f2 ceee cf7f7f3 cf6f5f1 cf2f1e9 c17191e c141414 c191d27 c333 c222 c555'],
  [muted, 'c9fb2bd cc4d1d7 cd0c3ae ca7becb c9db4c2 caeb3ba caeb3bb cbac0c8 cc3c8ce cadbfc9 c65665f c66685e c62625c c5b5c56'],
  [steel, 'c575e5d c737b78 c68717c c8f959e c737982 c8e959f c888f9a c959da8 c7c8592'],
  ['#42516a', 'c414946 c656960 c414744 c64716f c737a74 c999 caaa'],
  [gold, 'ccbb886 cbf9765 cb9a467 cb8a263 c363735 c45484a'],
  [pale, 'cf1d9b0 ceed38e cdfb97b ce2c58c cc5d3d6'],
  [blue, 'c36c8ff c41a5da c71d5ee c20278c c24278d'],
  [red, 'cff555b cec765b cff8f83 cb3a457 cb6a459'],
  [blueNavy, 'c22298b'],
  [redNavy, 'cb5ab76'],
  ['#79d166', 'c79d166'],
  ['#cd73b5', 'ccd73b5'],
  ['#72c687', 'c72c687'],
  ['#60afd4', 'c60afd4'],
  ['#dfc758', 'cdfc758'],
  ['#d86154', 'cd86154'],
  ['#231e17f2', 'c3b3125f2'],
  [gold + '70', 'cc8aa7470'],
  [panel + 'fa', 'c172c38fa'],
  [ink + '52', 'c10192340'],
  [ink + 'f5', 'c101923f5'],
  [ink + 'e8', 'c101923e8'],
  [ink + 'd9', 'c080f17d9'],
  [ink + 'dd', 'c172725dd'],
  [ink + '80', 'c24272580'],
  [ink + '99', 'c0009'],
  [ink + '88', 'c0008'],
  [pale + 'b0', 'cf4e5cdb0'],
  [gold + '1c', 'ca4c5d51c'],
  [gold + '30', 'cffffff30 ce5ebe22b'],
  [gold + '24', 'cffffff24 cbbdfc924'],
  [gold + '21', 'ce5ebe221'],
  [gold + '26', 'cffffff26'],
  [gold + '60', 'cffffff60'],
  [paper + '06', 'cffffff06'],
  [paper + '07', 'cbbdfc907'],
]) {
  for (const token of tokens.split(' ')) palette[token] = color;
}
assert.deepEqual(Object.keys(palette).sort(), Object.keys(BUILTIN_STYLE_PACK.palette).sort());

function seededRandom(seed) {
  let state = seed;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

const point = ([x, y]) => x.toFixed(1) + ',' + y.toFixed(1);
const pathData = points => 'M' + points.map(point).join('L');
const face = (points, fill, stroke = 'none', opacity = 1) =>
  '<path d="' + pathData(points) + 'Z" fill="' + fill + '" stroke="' + stroke + '" opacity="' + opacity + '"/>';
const trace = (points, stroke, weight = 1, opacity = 1) =>
  '<path d="' + pathData(points) + '" fill="none" stroke="' + stroke + '" stroke-width="' + weight + '" opacity="' + opacity + '"/>';
const diamond = (x, y, size, stroke) =>
  face([[x - size, y], [x, y - size], [x + size, y], [x, y + size]], 'none', stroke);
const svg = (w, h, defs, shapes) =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '"><defs>' + defs + '</defs>' + shapes + '</svg>';
const stops = entries => entries.map(([at, color, opacity = 1]) =>
  '<stop offset="' + at + '" stop-color="' + color + '" stop-opacity="' + opacity + '"/>').join('');
const gradient = (id, x1, y1, x2, y2, entries) =>
  '<linearGradient id="' + id + '" x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" gradientUnits="userSpaceOnUse">' + stops(entries) + '</linearGradient>';
const rectangle = (w, h, fill) => '<rect width="' + w + '" height="' + h + '" fill="' + fill + '"/>';
const hex = '<pattern id="hex" width="28" height="48" patternUnits="userSpaceOnUse"><path d="M0 8 14 0 28 8V24L14 32 0 24ZM0 24V40L14 48 28 40V24M14 32V48" fill="none" stroke="#809abb" stroke-opacity=".15" stroke-width=".7"/></pattern>';

// Each crop has its own silhouette and exposure. The light stops follow canvas y, with
// the brightest parts falling in the space between programme elements.
const backgrounds = {
  'bg-standby': {
    seed: 811, x: 1950, slope: -.445, spread: 1, wash: [1710, 696, 740, 534],
    exposure: [[0, .15], [.2, .44], [.34, .10], [.45, .10], [.55, .95], [.61, 1], [.69, .13], [.77, .18], [.87, .83], [1, .12]],
    planes: [
      [[-120, -95], [1050, -95], [445, 645], [-120, 932]],
      [[651, 0], [1308, 0], [1140, 307], [838, 380], [373, 857]],
      [[2090, 155], [2090, 657], [1296, 1150], [613, 1150], [1163, 846], [1556, 720]],
      [[-90, 995], [535, 851], [893, 1080], [-90, 1080]],
      [[1165, 1090], [1700, 754], [2040, 645], [1785, 1090]],
    ],
    rails: [[[-50, 970], [522, 970], [670, 924], [892, 924]], [[-60, 227], [335, 227], [409, 201], [710, 201]], [[1172, 1008], [1436, 1008], [1492, 975]]],
    etching: 'M0 785H594L700 1080H0ZM1580 0H1920V580L1680 402Z',
  },
  'bg-lineup': {
    seed: 1701, x: 1254, slope: -.42, spread: .72, wash: [959, 660, 624, 611],
    exposure: [[0, .24], [.25, .43], [.44, .29], [.51, .58], [.61, .31], [.67, .8], [.725, .44], [.8, .29], [1, .38]],
    planes: [
      [[-100, -20], [632, -20], [912, 448], [699, 1080], [-100, 1080]],
      [[27, 1100], [272, 420], [649, 241], [428, 1080]],
      [[1637, -20], [2050, -20], [1899, 1080], [1223, 1080], [1532, 535]],
      [[1269, 686], [1498, 1080], [739, 1080], [875, 892]],
    ],
    rails: [[[26, 170], [26, 841], [52, 900], [52, 1008]], [[1894, 172], [1894, 716], [1868, 778], [1868, 1008]], [[660, 1032], [842, 1032], [901, 1009], [1025, 1009], [1084, 1032], [1260, 1032]]],
    etching: 'M0 0H132V1080H0ZM1788 0H1920V1080H1788Z',
  },
  'bg-schedule': {
    seed: 3811, x: 98, slope: .446, spread: .8, wash: [361, 703, 640, 500],
    exposure: [[0, .04], [.34, .05], [.43, .14], [.52, .65], [.60, .94], [.68, .54], [.77, .13], [.88, .12], [.94, .30], [1, .08]],
    planes: [
      [[-100, 0], [542, 0], [626, 155], [395, 290], [115, 699], [-100, 755]],
      [[206, 1090], [428, 424], [555, 274], [811, 274], [595, 728], [659, 1090]],
      [[810, 1080], [1044, 902], [1696, 902], [1848, 832], [2020, 832], [2020, 1080]],
      [[1555, 0], [2020, 0], [2020, 424], [1745, 237]],
    ],
    rails: [[[564, 984], [965, 984], [1046, 952], [1592, 952]], [[173, 223], [387, 223], [426, 204], [682, 204]], [[1548, 1008], [1691, 1008], [1792, 969], [1920, 969]]],
    etching: 'M0 389H399L550 1080H0ZM1530 949 1860 772H1920V1080H1494Z',
  },
  'bg-postgame': {
    seed: 6203, x: 1731, slope: .446, spread: .92, wash: [1832, 392, 650, 500],
    exposure: [[0, .21], [.025, .17], [.07, .08], [.13, .39], [.24, .40], [.32, .85], [.39, .90], [.49, .42], [.6, .23], [1, .10]],
    planes: [
      [[-100, 0], [559, 0], [431, 363], [229, 500], [16, 805], [-100, 834]],
      [[699, -70], [1529, -70], [1884, 403], [1471, 345], [1124, 196], [849, 196]],
      [[304, 1100], [866, 729], [1189, 596], [1569, 716], [1358, 1037], [1434, 1100]],
      [[1497, 1100], [1812, 505], [2011, 389], [2011, 1100]],
      [[-100, 1030], [453, 872], [652, 890], [373, 1100], [-100, 1100]],
    ],
    rails: [[[17, 258], [17, 675], [38, 714], [38, 905]], [[494, 1039], [680, 1039], [733, 1018], [1099, 1018]], [[1521, 1019], [1775, 1019], [1813, 997], [1900, 997]]],
    etching: 'M0 0H426L168 328H0ZM1630 742 1920 545V1080H1498Z',
  },
};

function rail(points, rng) {
  const [x, y] = points[0];
  const [endX, endY] = points.at(-1);
  const vertical = Math.abs(points[1][1] - y) > Math.abs(points[1][0] - x);
  const teeth = Array.from({ length: 13 }, (_, i) => {
    const offset = 15 + 7 * i;
    const size = i % 4 === 0 ? 8 : 3;
    const tick = vertical ? [[x, y + offset], [x + size, y + offset]] : [[x + offset, y], [x + offset, y - size]];
    return trace(tick, i === 9 ? 'url(#faint-light)' : gold, 1, .15 + rng() * .25);
  }).join('');
  return trace(points, gold, 1, .21) + trace(points.map(([px, py]) => [px + 3, py + 4]), '#455b79', 1, .42) +
    teeth + '<g opacity=".42">' + diamond(endX, endY, 4, gold) + '</g>';
}

function rift(profile, rng) {
  const { x, slope, spread } = profile;
  const samples = [-135, -18, 83, 147, 220, 304, 354, 418, 475, 553, 628, 677, 735, 801, 892, 951, 1028, 1150];
  const spine = samples.map((y, i) => {
    const center = x + slope * y + (rng() - .5) * 23;
    const opening = (2.6 + rng() * (i % 4 === 1 ? 24 : 12)) * spread;
    const bend = i % 3 === 1 ? .60 : .35;
    return {
      center: [center, y],
      left: [center - opening * (1 - bend), y + 4 * bend],
      right: [center + opening * bend, y - 6 * bend],
    };
  });
  const center = spine.map(p => p.center);
  const left = spine.map(p => p.left), right = spine.map(p => p.right);
  let rock = face([...left, ...right.toReversed()], '#040c16');
  for (const [edge, sign] of [[left, -1], [right, 1]]) {
    for (let i = 0; i < edge.length - 2; i += 2) {
      const [a, b, c] = edge.slice(i, i + 3);
      const outer = [b[0] + sign * spread * (125 + rng() * 340), b[1] + 38 + rng() * 117];
      const shoulder = [b[0] + sign * spread * (44 + 78 * rng()), b[1] + 8 + rng() * 43];
      rock += face([a, b, c, outer], 'url(#rock-' + (i % 3) + ')', '#364760', .54 + rng() * .22);
      rock += face([a, b, shoulder], 'url(#cold-facet)', '#3f617d', .48);
      rock += face([b, c, shoulder], 'url(#dark-facet)', 'none', .75);
      rock += trace([outer, shoulder, b], 'url(#warm-metal)', .8, .24 + rng() * .26);
      rock += trace([a, b, c], 'url(#edge-gold)', 1.2, .84);
    }
    rock += trace(edge, 'url(#faint-light)', 7, .4);
    rock += trace(edge, 'url(#edge-gold)', 3.2, .75);
  }

  let sparks = '';
  for (let i = 0; i < 58; i++) {
    const [sx, sy] = center[1 + Math.floor(rng() * (center.length - 2))];
    const px = sx + (rng() - .5) * (70 + rng() * 240) * spread;
    const py = sy + (rng() - .5) * 190;
    if (i % 8 === 0) {
      const tip = 11 + rng() * 25;
      sparks += face([[px, py], [px - 9 * Math.sign(slope), py + tip], [px + 3, py + 3]], 'url(#dark-facet)', 'url(#edge-gold)', .65);
    } else {
      const size = .45 + rng() * 1.15;
      sparks += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + size.toFixed(2) + '" fill="url(#edge-gold)" opacity=".66"/>';
    }
  }
  const bloom = '<g filter="url(#air-blur)">' + trace(center, 'url(#blue-air)', 122 * spread) + '</g>' +
    '<g filter="url(#bloom-blur)">' + trace(center, 'url(#faint-light)', 34 * spread, .82) + '</g>';
  const aperture = '<g filter="url(#core-blur)">' + trace(center, 'url(#faint-light)', 12 * spread) + '</g>' +
    trace(center, 'url(#faint-light)', 4.4 * spread) + trace(center, 'url(#hot-core)', 1.75 * spread) + sparks;
  return bloom + rock + '<g opacity=".68">' + bloom + '</g>' + aperture;
}

function background(profile) {
  const rng = seededRandom(profile.seed);
  const [cx, cy, rx, ry] = profile.wash;
  const exposure = (id, color, amount = 1) => gradient(id, 0, 0, 0, height,
    profile.exposure.map(([at, level]) => [at, color, level * amount]));
  const defs = [
    gradient('base', 90, -80, 1370, 1150, [[0, '#0e1929'], [.41, ink], [1, navy]]),
    gradient('far-panel', 0, 0, 1410, 980, [[0, '#22324b', .85], [.51, '#17253b', .43], [.78, '#0c1523', .12], [1, '#253550', .71]]),
    gradient('cold-facet', cx - 480, cy + 510, cx + 460, cy - 460, [[0, '#0c1120'], [.48, '#2a4663'], [1, '#142137']]),
    gradient('dark-facet', 0, 0, 480, 970, [[0, '#25314a'], [.55, '#142038'], [1, '#080c13']]),
    gradient('warm-metal', 0, -65, 1690, 1080, [[0, bronze, .18], [.28, gold, .25], [.5, pale, .74], [.76, bronze, .16], [.9, gold, .55], [1, bronze, .15]]),
    ...[['#253958', '#111c2b'], ['#14223b', '#263e56'], ['#111824', '#21354c']].map(([a, b], i) =>
      gradient('rock-' + i, cx - 290, cy - 450, cx + 220, cy + 540, [[0, b], [.46, a], [.75, b], [1, '#121b2d']])),
    exposure('edge-gold', gold, .84),
    exposure('blue-air', '#285fba', .89),
    exposure('faint-light', arc),
    exposure('hot-core', '#f4ffff'),
    '<radialGradient id="wash">' + stops([[0, '#294362', .57], [.39, '#182942', .44], [1, '#121c2c', 0]]) + '</radialGradient>',
    '<radialGradient id="vignette" cx="50%" cy="47%" r="65%">' + stops([[0, ink, 0], [.6, ink, .06], [1, '#030509', .71]]) + '</radialGradient>',
    ...[['air-blur', 45], ['bloom-blur', 13], ['core-blur', 3]].map(([id, blur]) =>
      '<filter id="' + id + '" x="-350" y="-235" width="2620" height="1550" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="' + blur + '"/></filter>'),
    '<clipPath id="etched"><path d="' + profile.etching + '"/></clipPath>',
    hex,
  ].join('');
  const plates = profile.planes.map((p, i) => face(p, i % 2 === 0 ? 'url(#far-panel)' : 'url(#dark-facet)', '#344763', .44 + i * .05) +
    trace(p.slice(0, 3).map(([x, y]) => [x + 3, y - 2]), 'url(#warm-metal)', 1, .54)).join('');
  const shapes = rectangle(width, height, 'url(#base)') +
    '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="url(#wash)"/>' +
    plates + '<g clip-path="url(#etched)" opacity=".42">' + rectangle(width, height, 'url(#hex)') + '</g>' +
    rectangle(width, height, 'url(#vignette)') + rift(profile, rng) + profile.rails.map(p => rail(p, rng)).join('');
  return svg(width, height, defs, shapes);
}

function frame() {
  const top = trace([[11, 112], [11, 45], [39, 17], [237, 17]], bronze, 1) +
    trace([[17, 72], [17, 47], [41, 23], [141, 23], [150, 17]], gold, 1.35, .85) +
    trace([[29, 43], [41, 31], [88, 31]], pale, 1, .55) +
    trace([[250, 17], [266, 17]], gold, 1, .65) +
    diamond(278, 17, 3, bronze);
  const bottom = trace([[11, 979], [11, 1068], [20, 1077], [204, 1077]], bronze) +
    trace([[17, 1008], [17, 1067], [25, 1075], [95, 1075], [103, 1077]], gold, 1.2, .74) +
    trace([[216, 1077], [236, 1077]], gold, 1, .6) + diamond(248, 1076, 2, bronze);
  const corners = top + bottom + '<g transform="translate(1920 0) scale(-1 1)">' + top + bottom + '</g>';
  return svg(width, height, '', corners + '<g opacity=".48">' +
    trace([[919, 17], [945, 17], [951, 11], [969, 11], [975, 17], [1001, 17]], gold) +
    diamond(960, 17, 3, pale) + '</g>');
}

// Widescreen bars, compact rows and tall panels share the edge treatment. Turns stay in
// the margins of each texture so they survive the programme slots' different aspect ratios.
const surfaces = {
  countdown: [576, 660, { silver: true, cut: 34 }],
  'draft-blue': [830, 330, { side: blue, cut: 55 }],
  'draft-center': [220, 330, { cut: 24 }],
  'draft-red': [830, 330, { side: red, cut: 55, mirrored: true }],
  'header-editorial': [1768, 228, { cut: 32 }],
  'header-main': [1768, 132, { cut: 23 }],
  'interview-name': [1060, 220, { cut: 33 }],
  'lineup-blue': [800, 130, { side: blue, cut: 27 }],
  'lineup-red': [800, 130, { side: red, cut: 27, mirrored: true }],
  nameplate: [760, 120, { cut: 18 }],
  'panel-focus': [1100, 650, { cut: 32 }],
  'panel-interview': [1280, 270, { cut: 38, mirrored: true }],
  'panel-tall': [420, 770, { cut: 16 }],
  'panel-wide': [1120, 620, { cut: 36 }],
  'roster-blue': [872, 100, { side: blue, cut: 19 }],
  'roster-red': [872, 100, { side: red, cut: 19, mirrored: true }],
  scoreboard: [928, 252, { cut: 31 }],
  ticker: [1768, 60, { cut: 15, slim: true }],
};

function surface(w, h, { silver, side, cut, mirrored, slim }) {
  const base = silver ? '#a9b6c8' : side === blue ? blueNavy : side === red ? redNavy : panel;
  const cornerLight = side || pale;
  const m = slim ? 2 : 4;
  const facetInset = Math.min(h * .42, w * .35);
  const outline = [[m, m], [w - m - cut * .5, m], [w - m, m + cut], [w - m, h - m], [m + cut * .5, h - m], [m, h - m - cut]];
  const border = [[9, 9], [w - 11 - cut * .5, 9], [w - 9, 11 + cut], [w - 9, h - 9], [10 + cut * .5, h - 9], [9, h - 11 - cut]];
  const defs = [
    gradient('metal', 0, 0, w * .41, h, silver ?
      [[0, '#b7c5d6'], [.2, '#a8b8cc'], [.58, '#9dacc0'], [.81, '#91a3b9'], [1, '#8395ad']] :
      [[0, '#1d2a3d'], [.22, base], [.53, '#0d1625'], [.78, base], [1, '#0a101b']]),
    gradient('sheen', w, 0, w * .3, h, [[0, side || steel, .21], [.30, side || steel, .08], [1, navy, 0]]),
    gradient('trim', 0, 0, w, h, [[0, bronze, .86], [.13, gold, .79], [.46, bronze, .24], [.73, gold, .45], [1, gold, .74]]),
    gradient('cut', w - cut * .72, 1, w, cut + 9, [[0, arc, 0], [.47, arc, .60], [.73, '#e3ffff', .82], [1, arc, 0]]),
    gradient('side-line', w, 0, w * .45, h * .2, [[0, cornerLight, .90], [.23, cornerLight, .53], [1, cornerLight, 0]]),
    '<clipPath id="inset"><path d="' + pathData(outline) + 'Z"/></clipPath>',
    hex,
  ].join('');
  const top = [[w - Math.min(w * .30, 310), 5], [w - 9 - cut * .5, 5], [w - 5, 5 + cut], [w - 5, h * .7]];
  const bottom = [[m, h - cut - m], [m + cut * .48, h - m], [Math.min(w * .30, 230), h - m]];
  const decoration = face(outline, 'url(#metal)') +
    '<g clip-path="url(#inset)">' +
    face([[w * .73, 0], [w, 0], [w, h], [w - cut * .7, h], [w - cut * .2 - facetInset, cut]], 'url(#sheen)') +
    face([[0, h * .46], [cut * .62, h * .65], [cut * 1.31, h - 9], [w * .37, h], [0, h]], silver ? '#50647b' : '#263953', 'none', .22) +
    '<g opacity=".31"><rect width="' + Math.max(16, cut * 1.4) + '" height="' + h + '" fill="url(#hex)"/></g></g>' +
    face(outline, 'none', 'url(#trim)') + (slim ? '' : face(border, 'none', silver ? '#7f8da0' : '#304159', .65)) +
    trace(bottom, 'url(#trim)', 1.6, .94) +
    trace(top, side ? 'url(#side-line)' : 'url(#trim)', 2, .94) +
    trace([[w - m - cut * .5 - 3, m + 4], [w - m - 3, m + cut + 4]], 'url(#cut)', 2) +
    (w < h * .6 ? '' : '<g opacity=".76">' + diamond(w - 13 - cut, m + 8, slim ? 2 : 3, silver ? bronze : gold) + '</g>');
  return svg(w, h, defs, rectangle(w, h, ink) +
    (mirrored ? '<g transform="translate(' + w + ' 0) scale(-1 1)">' + decoration + '</g>' : decoration));
}

async function normalizedPng(source, seed, transparent = false) {
  let image = sharp(Buffer.from(source));
  if (!transparent) image = image.removeAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  if (!transparent) {
    // Luma-only fine grain breaks up 8-bit gradients. A lower frequency layer gives
    // the metal a faint irregular finish without introducing colored pixels.
    const rng = seededRandom(seed);
    const pitch = 12;
    const columns = Math.ceil(info.width / pitch) + 1;
    const grain = Float32Array.from({ length: columns * (Math.ceil(info.height / pitch) + 1) }, () => rng() - .5);
    for (let y = 0; y < info.height; y++) {
      const row = Math.floor(y / pitch) * columns;
      const v = (y % pitch) / pitch;
      for (let x = 0; x < info.width; x++) {
        const cell = row + Math.floor(x / pitch);
        const u = (x % pitch) / pitch;
        const upper = grain[cell] * (1 - u) + grain[cell + 1] * u;
        const lower = grain[cell + columns] * (1 - u) + grain[cell + columns + 1] * u;
        const delta = Math.round((rng() - .5) * 3 + (upper * (1 - v) + lower * v) * 3.8);
        const pixel = (y * info.width + x) * info.channels;
        for (let channel = 0; channel < 3; channel++) {
          data[pixel + channel] = Math.min(255, Math.max(0, data[pixel + channel] + delta));
        }
      }
    }
  }
  // Match the store's normalization so reimporting the exported ZIP keeps its identity.
  return sharp(data, { raw: info }).png().toBuffer();
}

const template = BUILTIN_STYLE_RECORDS.find(({ manifest }) => manifest.id === 'glacier-aurora').manifest;
const manifest = validateStyleManifest({
  ...template, id: 'rift-signature', name: '裂隙曜金', version: '2.0.0', author: 'RiftCast Style Collection',
  description: '曜黑与深海军蓝构成夜间导播室，青色裂隙照亮层叠切面与黄铜镶边。蓝红方以侧光区分，四幅独立构图适配赛前、首发、赛程与赛后画面。',
  palette, fonts: { body: 'modern', display: 'modern' },
  appearance: {
    countdownNumber: { color: ink, fontWeight: 800, letterSpacing: -.03 },
    countdownMessage: { color: ink, fontWeight: 800 },
    draftTimer: { color: pale },
    lineupGame: { color: pale, backgroundColor: ink },
    reportGame: { color: pale, backgroundColor: panel },
    reportHeadingBlue: { color: blue, backgroundColor: blueNavy },
    reportHeadingRed: { color: red, backgroundColor: redNavy },
  },
});
const output = path.resolve(process.argv[2] || 'verification-output/rift-signature-build');
const { assets } = manifest;
assert.deepEqual(Object.keys(assets), [...Object.keys(backgrounds), 'frame-full', ...Object.keys(surfaces)].sort());
const artwork = {};
for (const [id, profile] of Object.entries(backgrounds)) artwork[id] = await normalizedPng(background(profile), profile.seed);
artwork['frame-full'] = await normalizedPng(frame(), 0, true);
for (const [i, [id, [w, h, profile]]] of Object.entries(surfaces).entries()) {
  artwork[id] = await normalizedPng(surface(w, h, profile), 5179 + i * 103);
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hashes = Object.fromEntries(Object.entries(assets).map(([id, file]) => [file, hash(artwork[id])]));
const revision = hash(JSON.stringify({ manifest, hashes }));
const archiveName = 'RiftCast-2.0.0-rift-signature.riftstyle.zip';
const archive = writeBuiltinStyleArchive(manifest, id => artwork[id]);
const entry = { manifest, revision, hashes, archiveName, archiveSha256: hash(archive) };
const revisionDir = path.join(output, revision);
await mkdir(path.join(revisionDir, 'assets'), { recursive: true });
for (const [id, file] of Object.entries(assets)) await writeFile(path.join(revisionDir, file), artwork[id]);
await writeFile(path.join(output, 'catalog-entry.json'), JSON.stringify(entry, null, 2) + '\n');
await writeFile(path.join(output, archiveName), archive);
console.log('Rift Signature ' + revision + ' · ' + Object.keys(assets).length + ' PNGs · ' + output);
