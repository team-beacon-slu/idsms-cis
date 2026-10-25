// The living beacon: a 2.5D coast behind every dashboard page, painted in the layered
// manner of Firewatch and Alto's Adventure. By day a clear spring afternoon in the app's
// blues, by night a navy-to-teal sky full of stars; on a headland the BEACON lighthouse
// turns its light.
//
// Depth: five ranges, paler and bluer with distance, each faceted lit/shadow towards the
// light and dissolving into mist at its foot; treelines on the near ranges; a stratified
// headland; two-tone pines; cumulus clouds with lit tops and shaded flat bases.
// Physics: one light line (LIGHT_X), the sun high by day and the moon by night, so the
// reflection on the water, the glow and every lit face agree.
//
// Speed: the scenery is one static SVG, painted once. Only small layers move (clouds,
// three wave bands, glints, birds, twinkling stars, the beam and its halo), each by
// transform or opacity alone, so the compositor animates them. No script, no WebGL.
// Everything is generated from fixed seeds, so the server and the browser agree.
//
// Frame: x -1600..1600, y 0..900 (horizon at 610), the window's full height, anchored
// bottom-right. The lamp is at (1360, 286): 92.5% across, 31.78% down.

import "./coast-scene.css";

const HORIZON = 610;
const LIGHT_X = 700;

type Pt = [number, number];

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
const r1 = (n: number) => Math.round(n * 10) / 10;
const poly = (pts: Pt[]) => "M" + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(" L") + "Z";
const circle = (x: number, y: number, r: number) =>
  `M${r1(x - r)} ${r1(y)}a${r1(r)} ${r1(r)} 0 1 0 ${r1(2 * r)} 0a${r1(r)} ${r1(r)} 0 1 0 ${r1(-2 * r)} 0`;
function yOn(pts: Pt[], x: number) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    if (x >= ax && x <= bx) return ay + ((by - ay) * (x - ax)) / Math.max(1e-6, bx - ax);
  }
  return pts[pts.length - 1][1];
}

// A mountain range: peaks of varied height and width whose slopes break into rocky
// steps; each peak gets a lit facet on the side facing the light, and the highest
// peaks a cap of snow.
function ridge(
  seed: number,
  x0: number,
  x1: number,
  lo: number,
  hi: number,
  step: Pt,
  snowAbove = -1
) {
  const rnd = seeded(seed);
  const pts: Pt[] = [];
  const lit: string[] = [];
  const snow: string[] = [];
  const slope = (a: Pt, b: Pt) => {
    const out: Pt[] = [];
    for (const t of [0.22, 0.45, 0.7]) {
      const j = (rnd() - 0.5) * Math.abs(b[1] - a[1]) * 0.2;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t + j]);
    }
    return out;
  };
  let valley: Pt = [x0, lo + (hi - lo) * (0.6 + rnd() * 0.4)];
  pts.push(valley);
  while (valley[0] < x1) {
    const w = step[0] + rnd() * (step[1] - step[0]);
    const apex: Pt = [valley[0] + w * (0.35 + rnd() * 0.3), lo + (hi - lo) * rnd() * 0.5];
    const next: Pt = [Math.min(x1, valley[0] + w), lo + (hi - lo) * (0.55 + rnd() * 0.45)];
    const up = slope(valley, apex);
    const down = slope(apex, next);
    pts.push(...up, apex, ...down, next);
    const faceRight = apex[0] < LIGHT_X;
    const side = faceRight ? [...down, next] : [...up].reverse().concat([valley]);
    const crease: Pt = [
      apex[0] + (faceRight ? 1 : -1) * w * 0.05,
      apex[1] + (side[side.length - 1][1] - apex[1]) * 0.85,
    ];
    lit.push(poly([apex, ...side.slice(0, -1), crease]));
    if (snowAbove > 0 && apex[1] < snowAbove) {
      const depth = (snowAbove - apex[1]) * 0.55 + 10;
      const l: Pt = [apex[0] - depth * 0.9, apex[1] + depth];
      const r: Pt = [apex[0] + depth * 0.9, apex[1] + depth];
      snow.push(
        poly([
          apex,
          r,
          [apex[0] + depth * 0.45, apex[1] + depth * 0.7],
          [apex[0] + depth * 0.1, apex[1] + depth * 0.95],
          [apex[0] - depth * 0.3, apex[1] + depth * 0.65],
          l,
        ])
      );
    }
    valley = next;
  }
  const outline =
    `M${x0} ${HORIZON + 4} L` +
    pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join(" L") +
    ` L${x1} ${HORIZON + 4}Z`;
  return { pts, outline, lit: lit.join(" "), snow: snow.join(" ") };
}

// A pine in two tones: the whole tree, then the half that faces the light.
function pine(x: number, base: number, h: number) {
  const w = h * 0.36;
  const p = (dx: number, dy: number): Pt => [x + dx * w, base - dy * h];
  const tiers: [number, number][] = [
    [0.28, 0.68],
    [0.16, 0.68],
    [0.42, 0.36],
    [0.26, 0.36],
    [0.5, 0],
  ];
  const right = tiers.map(([dx, dy]) => p(dx, dy));
  const left = tiers.map(([dx, dy]) => p(-dx, dy)).reverse();
  const whole = poly([p(0, 1), ...right, ...left]);
  const litSide = x < LIGHT_X ? [p(0, 1), ...right, p(0, 0)] : [p(0, 1), p(0, 0), ...left];
  return { whole, lit: poly(litSide) };
}
function forest(
  seed: number,
  x0: number,
  x1: number,
  baseAt: (x: number) => number,
  hMin: number,
  hMax: number,
  gap: number
) {
  const rnd = seeded(seed);
  const whole: string[] = [];
  const lit: string[] = [];
  for (let x = x0; x < x1; x += gap * (0.5 + rnd() * 0.9)) {
    const t = pine(x, baseAt(x) + 3, hMin + (hMax - hMin) * rnd());
    whole.push(t.whole);
    lit.push(t.lit);
  }
  return { whole: whole.join(" "), lit: lit.join(" ") };
}

// A soft cloud: many small puffs over a few long wisps, blurred in drawing (cs-soft)
// so the edges feather like real vapour; no hard base.
function cloud(seed: number, cx: number, cy: number, s: number) {
  const rnd = seeded(seed);
  const w = 300 * s;
  const puffs: string[] = [];
  const wisps: string[] = [];
  for (let i = 0; i < 18; i++) {
    const t = rnd();
    const x = cx - w / 2 + w * t;
    const lift = Math.sin(Math.PI * t) * (24 + rnd() * 20) * s;
    puffs.push(
      circle(x, cy - lift - rnd() * 10 * s, (12 + rnd() * 24 + Math.sin(Math.PI * t) * 16) * s)
    );
  }
  for (let i = 0; i < 3; i++) {
    const ww = w * (0.7 + rnd() * 0.6);
    const x = cx - ww / 2 + (rnd() - 0.5) * 60 * s;
    const y = cy + 4 * s + i * 7 * s;
    const h = (6 + rnd() * 6) * s;
    wisps.push(
      `M${r1(x)} ${r1(y)}q${r1(ww / 2)} ${r1(-h)} ${r1(ww)} 0q${r1(-ww / 2)} ${r1(h * 0.8)} ${r1(-ww)} 0Z`
    );
  }
  return { puffs: puffs.join(" "), wisps: wisps.join(" ") };
}

const STARS = (() => {
  const rnd = seeded(7);
  return Array.from({ length: 170 }, () => [
    r1(-1600 + rnd() * 3200),
    r1(rnd() * rnd() * 540),
    r1(0.5 + rnd() * rnd() * 1.6),
  ]);
})();
const TWINKLE = (() => {
  const rnd = seeded(91);
  return Array.from({ length: 28 }, () => [
    r1(-1600 + rnd() * 3200),
    r1(rnd() * 380),
    r1(1.2 + rnd() * 1.1),
  ]);
})();

// Five ranges, back to front.
const R0 = ridge(41, -1600, 1600, 380, 560, [260, 460]);
const R1 = ridge(3, -1600, 1600, 410, 585, [190, 360], 452);
const R2 = ridge(11, -1600, 1600, 470, 600, [130, 260]);
const R3 = ridge(23, -1600, 1020, 520, 604, [100, 210]);
const R4 = ridge(37, -1600, 980, 560, 608, [70, 160]);
const TREES_R3 = forest(53, -1600, 1000, (x) => yOn(R3.pts, x), 7, 14, 9);
const TREES_R4 = forest(59, -1600, 960, (x) => yOn(R4.pts, x), 10, 20, 11);

// The headland: outline, top edge (where the grass, pines and buildings sit), strata.
const HEAD: Pt[] = [
  [955, 900],
  [972, 830],
  [986, 772],
  [1006, 728],
  [1022, 690],
  [1046, 652],
  [1066, 620],
  [1092, 586],
  [1112, 548],
  [1132, 512],
  [1150, 470],
  [1172, 462],
  [1260, 458],
  [1400, 452],
  [1520, 448],
  [1600, 446],
  [1600, 900],
];
const headTop = (x: number) => (x < 1150 ? yOn(HEAD.slice(0, 11), x) : 470 - (x - 1150) * 0.054);
// The rock face as low-poly facets: a jittered grid split into triangles, each shaded
// light, mid or dark (lighter on the side towards the light), with thin dark crevices.
const ROCK = (() => {
  const rnd = seeded(71);
  const cols = 16;
  const rows = 12;
  const x0 = 940;
  const y0 = 440;
  const cw = 680 / cols;
  const rh = 470 / rows;
  const v: Pt[][] = [];
  for (let j = 0; j <= rows; j++) {
    v.push([]);
    for (let i = 0; i <= cols; i++) {
      v[j].push([x0 + i * cw + (rnd() - 0.5) * cw * 0.7, y0 + j * rh + (rnd() - 0.5) * rh * 0.7]);
    }
  }
  const tones: string[][] = [[], [], []];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = v[j][i],
        b = v[j][i + 1],
        c = v[j + 1][i + 1],
        d = v[j + 1][i];
      const flip = rnd() > 0.5;
      const tris: Pt[][] = flip
        ? [
            [a, b, c],
            [a, c, d],
          ]
        : [
            [a, b, d],
            [b, c, d],
          ];
      for (const t of tris) {
        // The light comes from the left: faces further left are lit more often.
        const bias = 1 - i / cols;
        const r = rnd() + bias * 0.35;
        tones[r > 0.95 ? 0 : r > 0.55 ? 1 : 2].push(poly(t));
      }
    }
  }
  return {
    lit: tones[0].join(" "),
    mid: tones[1].join(" "),
    dark: tones[2].join(" "),
    all: [...tones[0], ...tones[1], ...tones[2]].join(" "),
  };
})();
const CRACKS = (() => {
  const rnd = seeded(83);
  const lines: string[] = [];
  for (let i = 0; i < 8; i++) {
    let x = 1000 + rnd() * 560;
    let y = 480 + rnd() * 330;
    let d = `M${r1(x)} ${r1(y)}`;
    for (let k = 0; k < 4; k++) {
      x += (rnd() - 0.5) * 16;
      y += 12 + rnd() * 18;
      d += ` L${r1(x)} ${r1(y)}`;
    }
    lines.push(d);
  }
  return lines.join(" ");
})();
const GRASS_CAP = (() => {
  const rnd = seeded(97);
  const top: Pt[] = [];
  for (let x = 1112; x <= 1600; x += 8) top.push([x, headTop(x) - 2 - rnd() * 4]);
  const under = top.map(([x]): Pt => [x, headTop(x) + 10 + rnd() * 8]).reverse();
  return poly([...top, ...under]);
})();
const PINES_HEAD = forest(5, 1180, 1600, (x) => headTop(x), 30, 72, 20);
const PINES_SHORE = forest(
  17,
  -1600,
  430,
  (x) => 842 - Math.sin((x + 1600) / 300) * 26,
  64,
  140,
  24
);
const SHRUBS = (() => {
  const rnd = seeded(101);
  const out: string[] = [];
  for (let x = 1170; x < 1600; x += 22 + rnd() * 30)
    out.push(circle(x, headTop(x) - 3, 5 + rnd() * 6));
  return out.join(" ");
})();

// Clouds: fixed in the still sky, and the drifting band (the same seeds drawn again
// 1600 to the right, so the loop is seamless).
const SKY_CLOUDS = [
  cloud(5, -1100, 300, 1.3),
  cloud(9, -250, 230, 0.95),
  cloud(13, 1120, 250, 1.15),
];
const DRIFT_CLOUDS = [
  cloud(21, 360, 150, 0.85),
  cloud(25, 1150, 210, 0.65),
  cloud(21, 1960, 150, 0.85),
  cloud(25, 2750, 210, 0.65),
];

const WAVE_A =
  "M0 20 Q100 6 200 20 T400 20 T600 20 T800 20 T1000 20 T1200 20 T1400 20 T1600 20 T1800 20 T2000 20 T2200 20 T2400 20 T2600 20 T2800 20 T3000 20 T3200 20 V40 H0Z";
const WAVE_B =
  "M0 26 Q140 6 280 26 T560 26 T840 26 T1120 26 T1400 26 T1680 26 T1960 26 T2240 26 T2520 26 T2800 26 T3080 26 T3360 26 V60 H0Z";
const BIRD = (x: number, y: number, s: number) =>
  `M${x - 9 * s} ${y - 3 * s} Q${x - 4 * s} ${y - 6 * s} ${x} ${y} Q${x + 4 * s} ${y - 6 * s} ${x + 9 * s} ${y - 3 * s} Q${x + 4 * s} ${y - 3 * s} ${x} ${y + 1.4 * s} Q${x - 4 * s} ${y - 3 * s} ${x - 9 * s} ${y - 3 * s}Z`;
const FLOCK = [
  [380, 330, 1.2],
  [410, 316, 1],
  [432, 338, 0.9],
  [360, 352, 0.8],
  [456, 322, 0.75],
  [480, 346, 0.7],
  [330, 340, 0.7],
]
  .map(([x, y, s]) => BIRD(x, y, s))
  .join(" ");

function Clouds({ clouds, id }: { clouds: ReturnType<typeof cloud>[]; id: string }) {
  return (
    <>
      <defs>
        <filter id={id} x="-20%" y="-60%" width="140%" height="220%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <g filter={`url(#${id})`} style={{ opacity: "var(--cs-cloud-alpha)" }}>
        {clouds.map((c, i) => (
          <g key={i}>
            <path d={c.wisps} fill="var(--cs-cloud-shade)" />
            <path d={c.puffs} fill="var(--cs-cloud)" />
          </g>
        ))}
      </g>
    </>
  );
}

export function CoastScene() {
  return (
    <div className="coast-scene" aria-hidden="true">
      <div className="coast-frame">
        <svg className="coast-still" viewBox="-1600 0 3200 900" preserveAspectRatio="none">
          <defs>
            <linearGradient id="cs-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--cs-sky-1)" />
              <stop offset="0.38" stopColor="var(--cs-sky-2)" />
              <stop offset="0.6" stopColor="var(--cs-sky-3)" />
              <stop offset="0.68" stopColor="var(--cs-sky-4)" />
            </linearGradient>
            <linearGradient id="cs-sea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--cs-sea-1)" />
              <stop offset="0.45" stopColor="var(--cs-sea-2)" />
              <stop offset="1" stopColor="var(--cs-sea-3)" />
            </linearGradient>
            <radialGradient id="cs-glow" cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="var(--cs-glow)" stopOpacity="0.7" />
              <stop offset="0.4" stopColor="var(--cs-glow)" stopOpacity="0.25" />
              <stop offset="1" stopColor="var(--cs-glow)" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="cs-mist" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--cs-mist)" stopOpacity="0" />
              <stop offset="1" stopColor="var(--cs-mist)" stopOpacity="0.9" />
            </linearGradient>
            <linearGradient id="cs-path" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--cs-glint)" stopOpacity="0.75" />
              <stop offset="1" stopColor="var(--cs-glint)" stopOpacity="0" />
            </linearGradient>
            {(
              [
                ["cs-r0", 380, "--cs-ridge-0"],
                ["cs-r1", 410, "--cs-ridge-1"],
                ["cs-r2", 470, "--cs-ridge-2"],
                ["cs-r3", 520, "--cs-ridge-3"],
                ["cs-r4", 560, "--cs-ridge-4"],
              ] as const
            ).map(([id, top, token]) => (
              <linearGradient
                key={id}
                id={id}
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1={top}
                x2="0"
                y2={HORIZON}
              >
                <stop offset="0" stopColor={`var(${token})`} />
                <stop offset="0.55" stopColor={`var(${token})`} />
                <stop offset="1" stopColor="var(--cs-mist)" />
              </linearGradient>
            ))}
            <linearGradient
              id="cs-lit"
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="380"
              x2="0"
              y2={HORIZON}
            >
              <stop offset="0" stopColor="var(--cs-ridge-lit)" stopOpacity="0.55" />
              <stop offset="1" stopColor="var(--cs-ridge-lit)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="cs-rim" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--cs-rim)" stopOpacity="0.85" />
              <stop offset="1" stopColor="var(--cs-rim)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="cs-headshade" x1="0" y1="0" x2="1" y2="0.6">
              <stop offset="0" stopColor="var(--cs-head)" />
              <stop offset="1" stopColor="var(--cs-head-deep)" />
            </linearGradient>
            <filter id="cs-pathblur" x="-50%" y="-10%" width="200%" height="120%">
              <feGaussianBlur stdDeviation="22 6" />
            </filter>
            <linearGradient id="cs-towerbody" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--cs-tower-lit)" />
              <stop offset="0.45" stopColor="var(--cs-tower)" />
              <stop offset="1" stopColor="var(--cs-tower-dark)" />
            </linearGradient>
            <linearGradient id="cs-bandbody" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--cs-band)" />
              <stop offset="0.5" stopColor="var(--cs-band)" />
              <stop offset="1" stopColor="var(--cs-band-dark)" />
            </linearGradient>
            <clipPath id="cs-head-clip">
              <path d={poly(HEAD)} />
            </clipPath>
          </defs>

          {/* Sky; stars by night; the glow and the great light on the light line. */}
          <rect x="-1600" width="3200" height={HORIZON + 4} fill="url(#cs-sky)" />
          <g fill="var(--cs-star)">
            {STARS.map(([x, y, r], i) => (
              <circle key={i} cx={x} cy={y} r={r} />
            ))}
          </g>
          <ellipse cx={LIGHT_X} cy="300" rx="760" ry="420" fill="url(#cs-glow)" />
          <g>
            <circle cx={LIGHT_X} cy="150" r="320" fill="var(--cs-sun)" opacity="0.05" />
            <circle cx={LIGHT_X} cy="150" r="200" fill="var(--cs-sun)" opacity="0.07" />
            <circle cx={LIGHT_X} cy="150" r="110" fill="var(--cs-sun)" opacity="0.12" />
            <circle cx={LIGHT_X} cy="150" r="72" fill="var(--cs-sun)" opacity="0.35" />
            <circle cx={LIGHT_X} cy="150" r="52" fill="var(--cs-sun)" />
          </g>
          <g>
            <circle cx={LIGHT_X} cy="150" r="130" fill="var(--cs-moon)" opacity="0.06" />
            <circle cx={LIGHT_X} cy="150" r="70" fill="var(--cs-moon)" opacity="0.1" />
            <path
              d={`M${LIGHT_X + 24} 116 a40 40 0 1 0 6 70 a32 32 0 1 1 -6 -70z`}
              fill="var(--cs-moon)"
            />
          </g>
          <Clouds clouds={SKY_CLOUDS} id="cs-soft-sky" />

          {/* Five ranges, paler with distance; lit faces and snow catch the light, and
              each range dissolves into the mist pooled at its foot. */}
          <path d={R0.outline} fill="url(#cs-r0)" />
          <path d={R0.lit} fill="url(#cs-lit)" opacity="0.6" />
          <rect x="-1600" y="500" width="3200" height="114" fill="url(#cs-mist)" opacity="0.55" />
          <path d={R1.outline} fill="url(#cs-r1)" />
          <path d={R1.lit} fill="url(#cs-lit)" />
          <path d={R1.snow} fill="var(--cs-snow)" />
          <rect x="-1600" y="530" width="3200" height="84" fill="url(#cs-mist)" opacity="0.55" />
          <path d={R2.outline} fill="url(#cs-r2)" />
          <path d={R2.lit} fill="url(#cs-lit)" opacity="0.85" />
          <rect x="-1600" y="566" width="3200" height="48" fill="url(#cs-mist)" opacity="0.5" />
          <path d={R3.outline} fill="url(#cs-r3)" />
          <path d={R3.lit} fill="url(#cs-lit)" opacity="0.7" />
          <path d={TREES_R3.whole} fill="var(--cs-ridge-3)" />
          <path d={R4.outline} fill="url(#cs-r4)" />
          <path d={R4.lit} fill="url(#cs-lit)" opacity="0.55" />
          <path d={TREES_R4.whole} fill="var(--cs-treeline)" />
          <path d={TREES_R4.lit} fill="var(--cs-treeline-lit)" />

          {/* The sea; the light's reflection straight below its source; a far sail. */}
          <rect x="-1600" y={HORIZON} width="3200" height={900 - HORIZON} fill="url(#cs-sea)" />
          <rect
            x="-1600"
            y={HORIZON}
            width="3200"
            height="22"
            fill="var(--cs-mist)"
            opacity="0.35"
          />
          <path
            d={`M${LIGHT_X - 70} ${HORIZON} L${LIGHT_X + 70} ${HORIZON} L${LIGHT_X + 240} 900 L${LIGHT_X - 240} 900Z`}
            fill="url(#cs-path)"
            filter="url(#cs-pathblur)"
            opacity="0.55"
          />
          <g>
            <path d="M-312 640 h44 l-6 7 h-32z" fill="var(--cs-hull)" />
            <path d="M-292 638 V600 L-270 636Z" fill="var(--cs-sail)" />
            <path d="M-295 638 V608 L-310 636Z" fill="var(--cs-sail)" opacity="0.8" />
          </g>

          {/* The headland: shaded rock with strata and cracks, a lit rim on the face
              towards the light, a grass cap with shrubs, pines, and surf at its foot. */}
          <path d={poly(HEAD)} fill="url(#cs-headshade)" />
          <g clipPath="url(#cs-head-clip)">
            <path d={ROCK.dark} fill="var(--cs-rock-dark)" />
            <path d={ROCK.mid} fill="var(--cs-rock-mid)" />
            <path d={ROCK.lit} fill="var(--cs-rock-lit)" />
            <path
              d={ROCK.all}
              fill="none"
              stroke="var(--cs-crack)"
              strokeWidth="0.8"
              strokeLinejoin="round"
            />
            <path
              d={CRACKS}
              fill="none"
              stroke="var(--cs-crack)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M955 900 L972 830 L986 772 L1006 728 L1022 690 L1046 652 L1066 620 L1092 586 L1112 548 L1132 512 L1150 470 L1180 470 L1150 540 L1120 600 L1090 660 L1060 720 L1030 790 L1004 900Z"
              fill="url(#cs-rim)"
            />
          </g>
          <path d={GRASS_CAP} fill="var(--cs-grass)" />
          <path d={SHRUBS} fill="var(--cs-grass-dark)" />
          <path d={PINES_HEAD.whole} fill="var(--cs-pine)" />
          <path d={PINES_HEAD.lit} fill="var(--cs-pine-lit)" />

          {/* The BEACON lighthouse: a stone footing, a tapered tower shaded round its
              form, navy and white bands, windows and a door, the gallery and its rail,
              a glowing lantern with mullions, and a domed cap. Lamp at (1360, 286). */}
          <path d="M1328 472 h64 l4 8 h-72z" fill="var(--cs-stone)" />
          <path d="M1336 472 L1384 472 L1376 314 L1344 314Z" fill="url(#cs-towerbody)" />
          <path d="M1338.6 436 L1381.4 436 L1380.1 410 L1339.9 410Z" fill="url(#cs-bandbody)" />
          <path d="M1341.4 382 L1378.6 382 L1377.4 356 L1342.6 356Z" fill="url(#cs-bandbody)" />
          <rect x="1352" y="452" width="12" height="20" rx="6" fill="var(--cs-door)" />
          <rect x="1356" y="420" width="7" height="10" rx="2" fill="var(--cs-window)" />
          <rect x="1357" y="392" width="6" height="9" rx="2" fill="var(--cs-window)" />
          <rect x="1357.5" y="336" width="5" height="8" rx="2" fill="var(--cs-window)" />
          <rect x="1328" y="306" width="64" height="8" rx="2" fill="var(--cs-tower-dark)" />
          <path
            d="M1331 306 V297 M1339 306 V297 M1347 306 V297 M1355 306 V297 M1365 306 V297 M1373 306 V297 M1381 306 V297 M1389 306 V297 M1329 297 H1391"
            stroke="var(--cs-tower-dark)"
            strokeWidth="1.8"
          />
          <rect x="1342" y="272" width="36" height="26" rx="3" fill="var(--cs-lamp)" />
          <path
            d="M1351 272 V298 M1360 272 V298 M1369 272 V298"
            stroke="var(--cs-tower-dark)"
            strokeWidth="1.4"
            opacity="0.6"
          />
          <path d="M1338 273 Q1360 244 1382 273Z" fill="var(--cs-tower)" />
          <circle cx="1360" cy="246" r="4" fill="var(--cs-tower-dark)" />
          <path d="M1360 242 V232" stroke="var(--cs-tower-dark)" strokeWidth="2" />

          {/* The keeper's house beside it, with a lit window and a chimney. */}
          <path d="M1420 452 h70 v22 h-70z" fill="var(--cs-wall)" />
          <path d="M1490 452 h14 v22 h-14z" fill="var(--cs-wall-shade)" />
          <path d="M1412 453 l45 -22 l55 22z" fill="var(--cs-roof)" />
          <rect x="1478" y="428" width="8" height="14" fill="var(--cs-roof)" />
          <rect x="1436" y="459" width="10" height="9" fill="var(--cs-window)" />
          <rect x="1460" y="459" width="10" height="9" fill="var(--cs-window)" />

          {/* The near shore: a dark rise of two-tone pines that frames the view. */}
          <path
            d="M-1600 900 L-1600 812 Q-1300 770 -1000 806 Q-700 838 -400 818 Q-100 800 220 852 L440 900Z"
            fill="var(--cs-shore)"
          />
          <path d={PINES_SHORE.whole} fill="var(--cs-shore-pine)" />
          <path d={PINES_SHORE.lit} fill="var(--cs-shore-pine-lit)" />
          <rect x="-1600" y="868" width="3200" height="32" fill="var(--cs-sea-3)" opacity="0.45" />
        </svg>
      </div>

      {/* Moving layers, full width so wide windows have no seam. Transform/opacity only. */}
      <div className="coast-clouds">
        <svg viewBox="0 0 3200 300" preserveAspectRatio="none">
          <Clouds clouds={DRIFT_CLOUDS} id="cs-soft-drift" />
        </svg>
      </div>
      <div className="coast-band-far">
        <div className="coast-wave">
          <svg viewBox="0 0 3200 40" preserveAspectRatio="none">
            <path d={WAVE_A} fill="var(--cs-wave-far)" />
          </svg>
        </div>
      </div>
      <div className="coast-band-mid">
        <div className="coast-wave">
          <svg viewBox="0 0 3200 40" preserveAspectRatio="none">
            <path d={WAVE_A} fill="var(--cs-wave-mid)" />
          </svg>
        </div>
      </div>
      <div className="coast-wave coast-wave-near">
        <svg viewBox="0 0 3360 60" preserveAspectRatio="none">
          <path d={WAVE_B} fill="var(--cs-wave-near)" />
        </svg>
      </div>

      {/* Layers placed on the frame: twinkling stars, glints, the flock, the light. */}
      <div className="coast-frame">
        <svg className="coast-twinkle" viewBox="-1600 0 3200 900" preserveAspectRatio="none">
          <g fill="var(--cs-star)">
            {TWINKLE.map(([x, y, r], i) => (
              <circle key={i} cx={x} cy={y} r={r} />
            ))}
          </g>
        </svg>
        <svg className="coast-glints" viewBox="-1600 0 3200 900" preserveAspectRatio="none">
          <g fill="var(--cs-glint)">
            <path
              d="M672 621h22M704 621h14M684 628h30"
              stroke="var(--cs-glint)"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              d="M636 677h34M684 677h18M716 677h40M660 690h26M700 690h30"
              stroke="var(--cs-glint)"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path
              d="M610 744h44M670 744h26M712 744h56M640 762h30M690 762h48"
              stroke="var(--cs-glint)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </g>
        </svg>
        <svg
          className="coast-glints coast-glints-b"
          viewBox="-1600 0 3200 900"
          preserveAspectRatio="none"
        >
          <g fill="var(--cs-glint)">
            <path
              d="M662 638h24M698 638h30"
              stroke="var(--cs-glint)"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              d="M676 655h18M706 655h22"
              stroke="var(--cs-glint)"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            <path
              d="M640 706h30M684 706h40M736 706h22"
              stroke="var(--cs-glint)"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            <path
              d="M600 792h50M668 792h30M716 792h62M630 812h40"
              stroke="var(--cs-glint)"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          </g>
        </svg>
        <svg className="coast-birds" viewBox="-1600 0 3200 900" preserveAspectRatio="none">
          <path d={FLOCK} fill="var(--cs-bird)" />
        </svg>
        {/* The light: a wide bloom and a bright core round the lantern, and the beam
            (one soft wedge with a brighter core, painted once and only scaled). */}
        <div className="coast-light">
          <div className="coast-bloom" />
          <div className="coast-halo" />
          <div className="coast-beam">
            <svg viewBox="0 0 1000 200" preserveAspectRatio="none">
              <defs>
                <linearGradient id="cs-beam-soft" x1="1" y1="0" x2="0" y2="0">
                  <stop offset="0" stopColor="var(--cs-beam-core)" stopOpacity="0.95" />
                  <stop offset="0.3" stopColor="var(--cs-beam)" stopOpacity="0.7" />
                  <stop offset="1" stopColor="var(--cs-beam)" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="cs-beam-core" x1="1" y1="0" x2="0" y2="0">
                  <stop offset="0" stopColor="var(--cs-beam-core)" stopOpacity="1" />
                  <stop offset="0.55" stopColor="var(--cs-beam-core)" stopOpacity="0.35" />
                  <stop offset="1" stopColor="var(--cs-beam-core)" stopOpacity="0" />
                </linearGradient>
                <filter id="cs-beam-blur" x="-5%" y="-30%" width="110%" height="160%">
                  <feGaussianBlur stdDeviation="10 5" />
                </filter>
              </defs>
              <polygon
                points="0,6 1000,92 1000,108 0,194"
                fill="url(#cs-beam-soft)"
                filter="url(#cs-beam-blur)"
              />
              <polygon
                points="0,74 1000,97 1000,103 0,126"
                fill="url(#cs-beam-core)"
                filter="url(#cs-beam-blur)"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
