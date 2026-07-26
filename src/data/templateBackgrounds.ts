/** Ornate synagogue-board backgrounds as SVG data URLs (no external assets). */

function svgUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}

function goldColumn(x: number, flip = false): string {
  const tx = flip ? `translate(${x + 56},0) scale(-1,1)` : `translate(${x},0)`;
  return `
    <g transform="${tx}">
      <rect x="18" y="40" width="20" height="980" fill="url(#colShaft)"/>
      <rect x="14" y="40" width="4" height="980" fill="#8a6a1a" opacity="0.35"/>
      <rect x="38" y="40" width="4" height="980" fill="#fff3c4" opacity="0.25"/>
      <path d="M8 40 C20 10 36 10 48 40 L48 70 L8 70 Z" fill="url(#colCap)"/>
      <ellipse cx="28" cy="38" rx="26" ry="10" fill="#d4af37"/>
      <path d="M4 1020 L52 1020 L44 1080 L12 1080 Z" fill="url(#colBase)"/>
      <circle cx="28" cy="200" r="3" fill="#fff6d0" opacity="0.5"/>
      <circle cx="28" cy="420" r="3" fill="#fff6d0" opacity="0.5"/>
      <circle cx="28" cy="640" r="3" fill="#fff6d0" opacity="0.5"/>
      <circle cx="28" cy="860" r="3" fill="#fff6d0" opacity="0.5"/>
    </g>`;
}

/** Classic parchment with Corinthian-style gold columns */
export const BG_GOLD_COLUMNS = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f6edd8"/>
      <stop offset="45%" stop-color="#efe2c4"/>
      <stop offset="100%" stop-color="#e2d0a8"/>
    </linearGradient>
    <linearGradient id="colShaft" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#a8892e"/>
      <stop offset="35%" stop-color="#e8c75a"/>
      <stop offset="70%" stop-color="#c9a227"/>
      <stop offset="100%" stop-color="#8a6a1a"/>
    </linearGradient>
    <linearGradient id="colCap" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f0d878"/><stop offset="100%" stop-color="#b8942a"/>
    </linearGradient>
    <linearGradient id="colBase" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d4af37"/><stop offset="100%" stop-color="#7a5a14"/>
    </linearGradient>
    <pattern id="fiber" width="80" height="80" patternUnits="userSpaceOnUse">
      <path d="M0 40 Q20 38 40 42 T80 40" stroke="#c4a878" stroke-width="0.6" fill="none" opacity="0.25"/>
      <path d="M10 0 Q12 20 8 40 T12 80" stroke="#b89868" stroke-width="0.5" fill="none" opacity="0.18"/>
    </pattern>
  </defs>
  <rect width="1920" height="1080" fill="url(#paper)"/>
  <rect width="1920" height="1080" fill="url(#fiber)"/>
  <rect x="70" y="24" width="1780" height="1032" fill="none" stroke="#c9a227" stroke-width="6" opacity="0.55" rx="8"/>
  <rect x="82" y="36" width="1756" height="1008" fill="none" stroke="#8a6a1a" stroke-width="2" opacity="0.35" rx="4"/>
  ${goldColumn(8)}
  ${goldColumn(1856, true)}
</svg>
`);

/** Warm cream board with gold ornate frame (Chabad classic) */
export const BG_CHABAD_CREAM = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="cbg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f3e6cf"/><stop offset="100%" stop-color="#ddc9a0"/>
    </linearGradient>
    <linearGradient id="gframe" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f2d56b"/><stop offset="50%" stop-color="#b8942a"/><stop offset="100%" stop-color="#f0d060"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#cbg)"/>
  <rect x="40" y="40" width="1840" height="1000" fill="none" stroke="url(#gframe)" stroke-width="14" rx="18"/>
  <rect x="58" y="58" width="1804" height="964" fill="none" stroke="#6b4e12" stroke-width="3" opacity="0.45" rx="12"/>
  <path d="M960 28 C980 48 980 48 1000 28 C980 48 980 48 960 68 C940 48 940 48 960 28Z" fill="#c9a227"/>
  <circle cx="120" cy="120" r="18" fill="none" stroke="#c9a227" stroke-width="3" opacity="0.5"/>
  <circle cx="1800" cy="120" r="18" fill="none" stroke="#c9a227" stroke-width="3" opacity="0.5"/>
  <circle cx="120" cy="960" r="18" fill="none" stroke="#c9a227" stroke-width="3" opacity="0.5"/>
  <circle cx="1800" cy="960" r="18" fill="none" stroke="#c9a227" stroke-width="3" opacity="0.5"/>
</svg>
`);

/** Blue + gold ornate (headers feel) */
export const BG_BLUE_GOLD = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f7f1e4"/><stop offset="100%" stop-color="#e8dcc4"/>
    </linearGradient>
    <linearGradient id="ribbon" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2a4578"/><stop offset="100%" stop-color="#1a2f55"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#bbg)"/>
  <rect x="0" y="0" width="1920" height="72" fill="url(#ribbon)"/>
  <rect x="0" y="72" width="1920" height="8" fill="#d4af37"/>
  <rect x="48" y="100" width="1824" height="932" fill="none" stroke="#d4af37" stroke-width="8" rx="10"/>
  <rect x="60" y="112" width="1800" height="908" fill="none" stroke="#1a2f55" stroke-width="2" opacity="0.35" rx="6"/>
</svg>
`);

/** Maroon / Ramot triptych parchment */
export const BG_MAROON_PARCHMENT = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="mbg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#faf3e8"/><stop offset="100%" stop-color="#ead7c0"/>
    </linearGradient>
    <linearGradient id="mcol" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#6e1f32"/><stop offset="50%" stop-color="#9a3a4e"/><stop offset="100%" stop-color="#5a1828"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#mbg)"/>
  <rect x="0" y="0" width="48" height="1080" fill="url(#mcol)"/>
  <rect x="1872" y="0" width="48" height="1080" fill="url(#mcol)"/>
  <rect x="48" y="0" width="1824" height="28" fill="#6e1f32"/>
  <rect x="48" y="1052" width="1824" height="28" fill="#6e1f32"/>
  <rect x="70" y="50" width="1780" height="980" fill="none" stroke="#c9a227" stroke-width="5" opacity="0.65" rx="6"/>
</svg>
`);

/** Bright Caribbean / Cozumel blue with lanterns */
export const BG_COZUMEL = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sea2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3ec6f0"/><stop offset="55%" stop-color="#1490c8"/><stop offset="100%" stop-color="#0a5f9a"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="20%" r="50%">
      <stop offset="0%" stop-color="#ffe08a" stop-opacity="0.35"/><stop offset="100%" stop-color="#ffe08a" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#sea2)"/>
  <rect width="1920" height="1080" fill="url(#glow)"/>
  <g fill="#ffc93c" opacity="0.9">
    <path d="M220 0 L240 90 L200 90 Z"/><rect x="215" y="90" width="30" height="50" rx="4"/>
    <path d="M1680 0 L1700 90 L1660 90 Z"/><rect x="1675" y="90" width="30" height="50" rx="4"/>
  </g>
  <rect x="80" y="140" width="1760" height="840" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.35" rx="16"/>
  <circle cx="100" cy="160" r="5" fill="#fff" opacity="0.7"/>
  <circle cx="1820" cy="160" r="5" fill="#fff" opacity="0.7"/>
  <circle cx="100" cy="960" r="5" fill="#fff" opacity="0.7"/>
  <circle cx="1820" cy="960" r="5" fill="#fff" opacity="0.7"/>
</svg>
`);

/** Soft aerial campus / wooded landscape */
export const BG_CAMPUS_AERIAL = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8eb8d8"/><stop offset="40%" stop-color="#b7c9a8"/><stop offset="100%" stop-color="#5a7a48"/>
    </linearGradient>
    <radialGradient id="clearing" cx="55%" cy="48%" r="35%">
      <stop offset="0%" stop-color="#c8b898"/><stop offset="70%" stop-color="#6a8a50" stop-opacity="0.85"/><stop offset="100%" stop-color="#3a5a30" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#sky)"/>
  <ellipse cx="1050" cy="520" rx="520" ry="280" fill="url(#clearing)"/>
  <ellipse cx="400" cy="700" rx="380" ry="220" fill="#3d5c32" opacity="0.7"/>
  <ellipse cx="1500" cy="780" rx="420" ry="200" fill="#2f4a28" opacity="0.65"/>
  <rect x="880" y="430" width="220" height="120" rx="8" fill="#d8cfc0" opacity="0.55"/>
  <circle cx="990" cy="470" r="55" fill="#e8dfd0" opacity="0.45"/>
</svg>
`);

/** Dark wood ark with curtain */
export const BG_ARK_WOOD = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="wood" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5a1818"/><stop offset="40%" stop-color="#3a0e0e"/><stop offset="100%" stop-color="#2a0808"/>
    </linearGradient>
    <pattern id="grain" width="120" height="40" patternUnits="userSpaceOnUse">
      <path d="M0 20 Q30 16 60 22 T120 20" stroke="#7a3030" stroke-width="1.2" fill="none" opacity="0.35"/>
    </pattern>
    <linearGradient id="curtain" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f5ead0"/><stop offset="100%" stop-color="#c9a86a" stop-opacity="0.15"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#wood)"/>
  <rect width="1920" height="1080" fill="url(#grain)"/>
  <path d="M0 0 Q240 140 480 0 Q720 140 960 0 Q1200 140 1440 0 Q1680 140 1920 0 L1920 160 Q1680 80 1440 160 Q1200 80 960 160 Q720 80 480 160 Q240 80 0 160 Z" fill="url(#curtain)" opacity="0.85"/>
  <rect x="60" y="180" width="1800" height="840" fill="none" stroke="#d4af37" stroke-width="5" opacity="0.55" rx="8"/>
</svg>
`);

/** Soft Jerusalem stone */
export const BG_JERUSALEM_STONE = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="stone" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ebe6dc"/><stop offset="100%" stop-color="#d2c8b4"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#stone)"/>
  <g stroke="#b8a888" stroke-width="2" fill="none" opacity="0.45">
    <rect x="40" y="40" width="440" height="220" rx="4"/>
    <rect x="500" y="40" width="520" height="220" rx="4"/>
    <rect x="1040" y="40" width="400" height="220" rx="4"/>
    <rect x="1460" y="40" width="420" height="220" rx="4"/>
    <rect x="40" y="280" width="520" height="240" rx="4"/>
    <rect x="580" y="280" width="380" height="240" rx="4"/>
    <rect x="980" y="280" width="460" height="240" rx="4"/>
    <rect x="1460" y="280" width="420" height="240" rx="4"/>
    <rect x="40" y="540" width="380" height="260" rx="4"/>
    <rect x="440" y="540" width="500" height="260" rx="4"/>
    <rect x="960" y="540" width="420" height="260" rx="4"/>
    <rect x="1400" y="540" width="480" height="260" rx="4"/>
    <rect x="40" y="820" width="560" height="220" rx="4"/>
    <rect x="620" y="820" width="420" height="220" rx="4"/>
    <rect x="1060" y="820" width="400" height="220" rx="4"/>
    <rect x="1480" y="820" width="400" height="220" rx="4"/>
  </g>
</svg>
`);

/** Deep Shabbat night with gold sparkles */
export const BG_SHABBAT_NIGHT = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="night" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#1c2a40"/><stop offset="100%" stop-color="#070b14"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#night)"/>
  <g fill="#d4af37">
    <circle cx="200" cy="120" r="2" opacity="0.7"/><circle cx="400" cy="80" r="1.5" opacity="0.5"/>
    <circle cx="700" cy="140" r="2" opacity="0.6"/><circle cx="1100" cy="90" r="1.5" opacity="0.55"/>
    <circle cx="1400" cy="130" r="2" opacity="0.65"/><circle cx="1700" cy="70" r="1.5" opacity="0.5"/>
    <circle cx="300" cy="900" r="2" opacity="0.4"/><circle cx="1600" cy="950" r="2" opacity="0.4"/>
  </g>
  <rect x="70" y="70" width="1780" height="940" fill="none" stroke="#c9a227" stroke-width="3" opacity="0.4" rx="12"/>
</svg>
`);

/** Negev sand dunes */
export const BG_NEGEV = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f2e4cc"/><stop offset="55%" stop-color="#e0c49a"/><stop offset="100%" stop-color="#c9a070"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#sand)"/>
  <path d="M0 700 Q400 620 800 720 T1600 680 T1920 740 L1920 1080 L0 1080 Z" fill="#b89060" opacity="0.45"/>
  <path d="M0 820 Q500 760 1000 840 T1920 800 L1920 1080 L0 1080 Z" fill="#a07848" opacity="0.35"/>
</svg>
`);

/** Tzfat misty blue */
export const BG_TZFAT = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a2838"/><stop offset="100%" stop-color="#0e1622"/>
    </linearGradient>
    <radialGradient id="haze" cx="70%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#6e9bc3" stop-opacity="0.35"/><stop offset="100%" stop-color="#6e9bc3" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#mist)"/>
  <rect width="1920" height="1080" fill="url(#haze)"/>
  <rect x="60" y="60" width="1800" height="960" fill="none" stroke="#6e9bc3" stroke-width="2" opacity="0.35" rx="10"/>
</svg>
`);

/** Forest grove */
export const BG_GROVE = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="forest" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#dce8d4"/><stop offset="100%" stop-color="#9fb892"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#forest)"/>
  <g fill="#3d5c38" opacity="0.25">
    <ellipse cx="200" cy="900" rx="160" ry="280"/><ellipse cx="480" cy="920" rx="140" ry="260"/>
    <ellipse cx="1500" cy="910" rx="170" ry="270"/><ellipse cx="1750" cy="930" rx="130" ry="250"/>
  </g>
</svg>
`);

/** Kinneret water */
export const BG_KINNERET = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="water" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#d7efec"/><stop offset="50%" stop-color="#9fd0c8"/><stop offset="100%" stop-color="#4a9a92"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#water)"/>
  <path d="M0 400 Q480 360 960 420 T1920 380" fill="none" stroke="#fff" stroke-width="3" opacity="0.35"/>
  <path d="M0 520 Q480 480 960 540 T1920 500" fill="none" stroke="#fff" stroke-width="2" opacity="0.25"/>
</svg>
`);

/** Wedding / simcha champagne with sparkles */
export const BG_WEDDING = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="champ" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#fff8ec"/><stop offset="100%" stop-color="#e8d5b0"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#champ)"/>
  <g fill="#c9a227" opacity="0.55">
    <circle cx="180" cy="160" r="3"/><circle cx="320" cy="240" r="2"/><circle cx="500" cy="120" r="2.5"/>
    <circle cx="1400" cy="180" r="3"/><circle cx="1600" cy="260" r="2"/><circle cx="1750" cy="140" r="2.5"/>
    <circle cx="960" cy="80" r="4"/>
  </g>
  <rect x="80" y="80" width="1760" height="920" fill="none" stroke="#b8943c" stroke-width="4" opacity="0.45" rx="14"/>
</svg>
`);

/** Quiet remembrance gray */
export const BG_REMEMBRANCE = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="quiet" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f2f2f2"/><stop offset="100%" stop-color="#d8d8d8"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#quiet)"/>
  <rect x="100" y="100" width="1720" height="880" fill="none" stroke="#888" stroke-width="2" opacity="0.35" rx="4"/>
</svg>
`);

/** Modern clean grid */
export const BG_MODERN = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <rect width="1920" height="1080" fill="#f4f6f8"/>
  <g stroke="#c5ced8" stroke-width="1" opacity="0.5">
    <path d="M0 270 H1920 M0 540 H1920 M0 810 H1920"/>
    <path d="M480 0 V1080 M960 0 V1080 M1440 0 V1080"/>
  </g>
  <rect x="0" y="0" width="1920" height="8" fill="#2563a8"/>
</svg>
`);

/** Night TV deep blue */
export const BG_NIGHT_TV = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="tv" cx="50%" cy="45%" r="65%">
      <stop offset="0%" stop-color="#163050"/><stop offset="100%" stop-color="#060c18"/>
    </radialGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#tv)"/>
  <rect x="50" y="50" width="1820" height="980" fill="none" stroke="#4ea1d3" stroke-width="2" opacity="0.3" rx="10"/>
</svg>
`);

/** Aged parchment scroll */
export const BG_PARCHMENT = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="aged" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f4ead4"/><stop offset="50%" stop-color="#e6d3ae"/><stop offset="100%" stop-color="#d4bc90"/>
    </linearGradient>
    <pattern id="stain" width="200" height="200" patternUnits="userSpaceOnUse">
      <circle cx="40" cy="60" r="30" fill="#c4a878" opacity="0.08"/>
      <circle cx="150" cy="140" r="40" fill="#b89868" opacity="0.06"/>
    </pattern>
  </defs>
  <rect width="1920" height="1080" fill="url(#aged)"/>
  <rect width="1920" height="1080" fill="url(#stain)"/>
  <rect x="90" y="60" width="1740" height="960" fill="none" stroke="#a8893d" stroke-width="4" opacity="0.4" rx="6"/>
</svg>
`);

/** Gold sanctuary dark elegant */
export const BG_GOLD_SANCTUARY = svgUrl(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="sanct" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="#243044"/><stop offset="100%" stop-color="#0c121c"/>
    </radialGradient>
    <linearGradient id="gline" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#d4af37" stop-opacity="0"/><stop offset="50%" stop-color="#d4af37"/><stop offset="100%" stop-color="#d4af37" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1920" height="1080" fill="url(#sanct)"/>
  <rect x="100" y="80" width="1720" height="3" fill="url(#gline)"/>
  <rect x="100" y="997" width="1720" height="3" fill="url(#gline)"/>
  ${goldColumn(20)}
  ${goldColumn(1844, true)}
</svg>
`);

/**
 * Photo backgrounds live in /public/template-bgs (webp).
 * SVG helpers above remain available as fallbacks for offline/dev.
 */
const PHOTO = {
  goldColumns: '/template-bgs/gold-columns.webp',
  chabadCream: '/template-bgs/chabad-cream.webp',
  blueGold: '/template-bgs/chabad-cream.webp',
  maroonParchment: '/template-bgs/maroon-parchment.webp',
  cozumel: '/template-bgs/cozumel-blue.webp',
  campusAerial: '/template-bgs/campus-aerial.webp',
  arkWood: '/template-bgs/ark-wood.webp',
  jerusalemStone: '/template-bgs/jerusalem-stone.webp',
  shabbatNight: '/template-bgs/shabbat-night.webp',
  negev: '/template-bgs/negev.webp',
  tzfat: '/template-bgs/shabbat-night.webp',
  grove: '/template-bgs/campus-aerial.webp',
  kinneret: '/template-bgs/cozumel-blue.webp',
  wedding: '/template-bgs/wedding.webp',
  remembrance: '/template-bgs/jerusalem-stone.webp',
  modern: BG_MODERN,
  nightTv: '/template-bgs/gold-sanctuary.webp',
  parchment: '/template-bgs/parchment.webp',
  goldSanctuary: '/template-bgs/gold-sanctuary.webp',
} as const;

export const TEMPLATE_BACKGROUNDS = PHOTO;

export type TemplateBackgroundKey = keyof typeof TEMPLATE_BACKGROUNDS;

/** Soft fallbacks if a photo fails to load */
export const TEMPLATE_BACKGROUND_FALLBACKS: Partial<Record<TemplateBackgroundKey, string>> = {
  goldColumns: BG_GOLD_COLUMNS,
  chabadCream: BG_CHABAD_CREAM,
  blueGold: BG_BLUE_GOLD,
  maroonParchment: BG_MAROON_PARCHMENT,
  cozumel: BG_COZUMEL,
  campusAerial: BG_CAMPUS_AERIAL,
  arkWood: BG_ARK_WOOD,
  jerusalemStone: BG_JERUSALEM_STONE,
  shabbatNight: BG_SHABBAT_NIGHT,
  negev: BG_NEGEV,
  tzfat: BG_TZFAT,
  grove: BG_GROVE,
  kinneret: BG_KINNERET,
  wedding: BG_WEDDING,
  remembrance: BG_REMEMBRANCE,
  parchment: BG_PARCHMENT,
  goldSanctuary: BG_GOLD_SANCTUARY,
  nightTv: BG_NIGHT_TV,
};
