// Hand-drawn crayon doodles (original artwork, inline SVG).
// Every drawing uses a 100×100 viewBox and the shared #crayon filter defined in
// index.html, which roughens edges and adds paper-grain speckles.
'use strict';

(function () {
  const C = {
    green: '#7cc576', leaf: '#5aaa4e', frog: '#8fdb7e', frogBelly: '#c8f5b0', frogDark: '#3f6b38',
    blue: '#9aa5d6', pink: '#f2678a', blush: '#f4a7bf', mauve: '#df8fc6', rose: '#d98b8f',
    yellow: '#ffd93b', sun: '#ffd65a', orange: '#f7a541', beak: '#f28a2e',
    red: '#e0604f', apple: '#f25563', brown: '#c9925e', brownDark: '#a8703f', tan: '#e3b98a',
    ink: '#4a3424', seed: '#5a2a2e', sky: '#3fb0e8',
  };

  const wrap = (inner) => `<svg viewBox="0 0 100 100" aria-hidden="true"><g filter="url(#crayon)">${inner}</g></svg>`;
  const polar = (r, deg) => [50 + r * Math.cos(deg * Math.PI / 180), 50 + r * Math.sin(deg * Math.PI / 180)];

  const flower = (color, center = C.sun) => {
    const angles = [0, 72, 144, 216, 288];
    const petal = (a, extra) => `<ellipse cx="50" cy="27" rx="13" ry="19" transform="rotate(${a} 50 50)" ${extra}/>`;
    return wrap(
      angles.map(a => petal(a, 'fill="#fffdf7"')).join('') +
      angles.map(a => petal(a, `fill="none" stroke="${color}" stroke-width="7"`)).join('') +
      `<circle cx="50" cy="50" r="11" fill="${center}"/>`);
  };

  const sun = () => wrap(
    [0, 45, 90, 135, 180, 225, 270, 315].map(a => {
      const [x1, y1] = polar(34, a), [x2, y2] = polar(45, a);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${C.orange}" stroke-width="6" stroke-linecap="round"/>`;
    }).join('') +
    `<circle cx="50" cy="50" r="24" fill="${C.sun}"/>
     <circle cx="43" cy="47" r="2.2" fill="#b8692e"/><circle cx="57" cy="47" r="2.2" fill="#b8692e"/>
     <path d="M42 55 Q50 62 58 55" stroke="#b8692e" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);

  const chick = () => wrap(
    `<path d="M30 40 Q50 16 70 40 L86 32 Q84 52 72 58 Q66 76 50 76 Q34 76 28 58 Q16 52 14 32 Z" fill="${C.yellow}"/>
     <path d="M40 44 q4 -3.5 8 0 M54 44 q4 -3.5 8 0" stroke="#c98a1a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
     <path d="M45 50 L55 50 L50 56 Z" fill="${C.beak}"/>
     <path d="M44 76 v8 M40 86 l4 -2 l4 2 M57 76 v8 M53 86 l4 -2 l4 2" stroke="${C.beak}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);

  const strawberry = () => wrap(
    `<path d="M50 30 C72 26 86 44 81 60 C77 78 61 90 50 90 C39 90 23 78 19 60 C14 44 28 26 50 30Z" fill="${C.pink}"/>
     <path d="M50 34 L34 22 L44 28 L40 12 L50 24 L60 12 L56 28 L66 22 Z" fill="${C.green}"/>` +
    [[38, 46, -20], [52, 42, 10], [64, 50, 25], [32, 60, -15], [46, 58, 5], [60, 64, 20], [40, 74, -10], [54, 78, 15]]
      .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="1.8" ry="3.6" transform="rotate(${r} ${x} ${y})" fill="${C.seed}"/>`).join(''));

  const apple = () => wrap(
    `<path d="M50 34 C40 24 18 28 20 52 C22 74 38 88 50 82 C62 88 78 74 80 52 C82 28 60 24 50 34Z" fill="${C.apple}"/>
     <path d="M50 34 Q49 26 52 22" stroke="${C.brownDark}" stroke-width="3" fill="none" stroke-linecap="round"/>
     <path d="M52 30 Q56 14 70 15 Q66 29 52 30Z" fill="${C.green}"/>`);

  const tulips = () => wrap(
    `<path d="M38 48 V94 M76 56 V94" stroke="${C.leaf}" stroke-width="5" stroke-linecap="round"/>
     <path d="M38 82 Q18 70 6 82 Q22 94 38 88Z M38 80 Q58 66 72 76 Q56 90 38 86Z M76 84 Q90 74 98 82 Q88 92 76 90Z" fill="${C.leaf}"/>
     <path d="M20 18 L30 30 L38 12 L46 30 L56 18 Q60 50 38 52 Q16 50 20 18Z" fill="${C.red}"/>
     <path d="M64 38 L70 45 L76 34 L82 45 L88 38 Q90 58 76 59 Q62 58 64 38Z" fill="${C.mauve}"/>`);

  const butterfly = () => wrap(
    `<path d="M50 50 C38 20 8 22 12 44 C15 58 34 58 50 50Z M50 50 C62 20 92 22 88 44 C85 58 66 58 50 50Z" fill="${C.red}"/>
     <path d="M50 53 C34 58 18 74 28 84 C38 92 48 72 50 53Z M50 53 C66 58 82 74 72 84 C62 92 52 72 50 53Z" fill="${C.red}"/>
     <ellipse cx="29" cy="42" rx="7" ry="4.5" fill="#fffdf7"/><ellipse cx="71" cy="42" rx="7" ry="4.5" fill="#fffdf7"/>
     <rect x="45.5" y="40" width="9" height="24" rx="4.5" fill="${C.mauve}"/>`);

  const frog = () => wrap(
    `<path d="M24 82 l-8 10 M30 84 l-4 12 M76 82 l8 10 M70 84 l4 12" stroke="${C.leaf}" stroke-width="4" stroke-linecap="round"/>
     <ellipse cx="50" cy="62" rx="33" ry="27" fill="${C.frog}"/>
     <circle cx="33" cy="36" r="12.5" fill="${C.frog}"/><circle cx="67" cy="36" r="12.5" fill="${C.frog}"/>
     <circle cx="33" cy="36" r="5" fill="${C.frogDark}"/><circle cx="67" cy="36" r="5" fill="${C.frogDark}"/>
     <ellipse cx="50" cy="70" rx="17" ry="13" fill="${C.frogBelly}"/>
     <circle cx="27" cy="54" r="5" fill="${C.frogBelly}"/><circle cx="73" cy="54" r="5" fill="${C.frogBelly}"/>
     <path d="M41 50 Q50 58 59 50" stroke="${C.frogDark}" stroke-width="2.8" fill="none" stroke-linecap="round"/>`);

  const bear = () => wrap(
    `<path d="M36 64 L20 54 M64 64 L82 56 M42 84 L38 96 M58 84 L66 94" stroke="${C.brown}" stroke-width="11" stroke-linecap="round"/>
     <ellipse cx="50" cy="70" rx="18" ry="20" fill="${C.brown}"/>
     <circle cx="34" cy="17" r="7.5" fill="${C.brown}"/><circle cx="66" cy="17" r="7.5" fill="${C.brown}"/>
     <circle cx="34" cy="17" r="3.5" fill="${C.brownDark}"/><circle cx="66" cy="17" r="3.5" fill="${C.brownDark}"/>
     <circle cx="50" cy="34" r="21" fill="${C.brown}"/>
     <path d="M32 52 Q50 60 68 52 L67 58 Q50 66 33 58Z M56 58 L62 72 L68 70 L62 57Z" fill="${C.blush}"/>
     <ellipse cx="50" cy="41" rx="7" ry="5" fill="${C.tan}"/>
     <circle cx="42" cy="32" r="2.4" fill="${C.ink}"/><circle cx="58" cy="32" r="2.4" fill="${C.ink}"/>
     <ellipse cx="50" cy="39" rx="2.6" ry="2" fill="${C.ink}"/>
     <circle cx="35" cy="41" r="4.2" fill="#f08a5d"/><circle cx="65" cy="41" r="4.2" fill="#f08a5d"/>`);

  // The Claude Code creature, redrawn in crayon: same blocky silhouette (body, side arms,
  // four little legs, tall eyes) with softened corners, its coral color, and blush cheeks.
  const claude = () => wrap(
    `<rect x="4" y="45" width="18" height="13" rx="5" fill="#d97757"/>
     <rect x="78" y="45" width="18" height="13" rx="5" fill="#d97757"/>
     <rect x="18" y="64" width="7" height="17" rx="3.2" fill="#d97757"/><rect x="29" y="64" width="7" height="17" rx="3.2" fill="#d97757"/>
     <rect x="64" y="64" width="7" height="17" rx="3.2" fill="#d97757"/><rect x="75" y="64" width="7" height="17" rx="3.2" fill="#d97757"/>
     <rect x="15" y="22" width="70" height="46" rx="10" fill="#d97757"/>
     <rect x="28" y="34" width="7" height="12" rx="3.5" fill="#4a3424"/><rect x="65" y="34" width="7" height="12" rx="3.5" fill="#4a3424"/>
     <ellipse cx="25" cy="52" rx="5" ry="3.4" fill="#f4a7bf"/><ellipse cx="75" cy="52" rx="5" ry="3.4" fill="#f4a7bf"/>
     <path d="M45 50 Q50 54 55 50" stroke="#4a3424" stroke-width="2.4" fill="none" stroke-linecap="round"/>`);

  // ---- file-type icons -------------------------------------------------------------
  // .py -> a slice of (py)pie with whipped cream
  const pie = () => wrap(
    `<path d="M5 58 L91 45 L92 72 L6 82 Z" fill="#d9692c"/>
     <path d="M6 82 L92 72 L92 80 L7 90 Z" fill="#e9a85c"/>
     <path d="M5 58 L62 27 Q84 27 91 45 Z" fill="#f5ac5e"/>
     <path d="M62 27 Q87 25 94 43 L94 77" stroke="#e9a85c" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
     <circle cx="26" cy="68" r="1.9" fill="#a8461a"/><circle cx="44" cy="73" r="1.7" fill="#a8461a"/><circle cx="64" cy="64" r="1.9" fill="#a8461a"/><circle cx="80" cy="69" r="1.6" fill="#a8461a"/>
     <ellipse cx="57" cy="44" rx="17" ry="6" fill="#d98a3e"/>
     <ellipse cx="57" cy="40" rx="16" ry="7.5" fill="#f3dcae"/>
     <ellipse cx="57" cy="38.5" rx="13.5" ry="6" fill="#fff6e0"/>
     <ellipse cx="57" cy="32" rx="10" ry="5.5" fill="#f3dcae"/>
     <ellipse cx="57" cy="31" rx="8" ry="4.3" fill="#fffaf0"/>
     <path d="M51 28 Q57 15 63 27 Z" fill="#f3dcae"/>
     <path d="M53 27 Q57 18 61 26 Z" fill="#fffaf0"/>`);

  // .md -> a band-aid (an "MD") with cherries on the pad
  const bandaid = () => wrap(
    `<g transform="rotate(-38 50 50)">
       <rect x="6" y="33" width="88" height="34" rx="17" fill="#f6b8d0"/>
       <rect x="33" y="37" width="34" height="26" rx="6" fill="#fffdf8"/>
       ${[[14, 44], [20, 50], [14, 56], [24, 43], [24, 57], [86, 44], [80, 50], [86, 56], [76, 43], [76, 57]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.7" fill="#b9708c"/>`).join('')}
       <path d="M47 50 Q49 43 53 41 M55 49 Q54 44 53 41" stroke="#3f9a3a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
       <path d="M53 41 Q58 37 61 40 Q57 43 53 41 Z" fill="#5aaa4e"/>
       <circle cx="46" cy="53" r="5" fill="#e8364a"/><circle cx="56" cy="52" r="5" fill="#e8364a"/>
       <circle cx="44.5" cy="51.5" r="1.3" fill="#ff8f9c"/><circle cx="54.5" cy="50.5" r="1.3" fill="#ff8f9c"/>
     </g>`);

  // .json -> crayon curly braces
  const braces = () => wrap(
    `<path d="M41 18 Q29 18 29 30 L29 41 Q29 50 20 50 Q29 50 29 59 L29 70 Q29 82 41 82" stroke="#e0a020" stroke-width="8.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
     <path d="M59 18 Q71 18 71 30 L71 41 Q71 50 80 50 Q71 50 71 59 L71 70 Q71 82 59 82" stroke="#e0a020" stroke-width="8.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);

  // .ipynb -> spiral notebook
  const notebook = () => wrap(
    `<rect x="24" y="12" width="58" height="78" rx="7" fill="#9aa5d6"/>
     <rect x="40" y="28" width="32" height="13" rx="3" fill="#fffdf8"/>
     <rect x="44" y="33" width="20" height="3" rx="1.5" fill="#b8bfe3"/>
     ${[20, 31, 42, 53, 64, 75].map(y => `<circle cx="24" cy="${y}" r="4.2" fill="none" stroke="#5c5470" stroke-width="2.6"/>`).join('')}`);

  // .txt -> sheet of lined paper
  const paper = () => wrap(
    `<path d="M20 10 H66 L82 26 V90 H20 Z" fill="#f7ecd2"/>
     <path d="M66 10 V26 H82 Z" fill="#e6d3a8"/>
     ${[36, 46, 56, 66, 76].map(y => `<rect x="26" y="${y}" width="50" height="2.6" rx="1.3" fill="#8fb7e0"/>`).join('')}
     <rect x="33" y="14" width="2.6" height="72" fill="#f28b82"/>`);

  // .csv -> gingham picnic blanket (it's a grid)
  const blanket = () => wrap(
    `<rect x="12" y="18" width="76" height="64" rx="6" fill="#fde2e0"/>
     ${[20, 38, 56, 74].map(x => `<rect x="${x}" y="18" width="9" height="64" fill="#f28b82" opacity=".55"/>`).join('')}
     ${[26, 44, 62].map(y => `<rect x="12" y="${y}" width="76" height="9" fill="#f28b82" opacity=".55"/>`).join('')}
     ${[16, 26, 36, 46, 56, 66, 76, 86].map(x => `<rect x="${x - 1.2}" y="82" width="2.4" height="7" rx="1.2" fill="#f28b82"/>`).join('')}`);

  // .yaml -> a yam
  const yam = () => wrap(
    `<g transform="rotate(-24 50 50)">
       <path d="M10 52 Q14 30 46 30 Q78 28 90 46 Q92 62 76 68 Q52 76 26 70 Q8 66 10 52 Z" fill="#b8613a"/>
       <ellipse cx="86" cy="54" rx="6" ry="12" fill="#f6a25a"/>
       <path d="M30 40 q4 3 8 1 M50 64 q4 -3 8 -1 M62 40 q3 3 7 2" stroke="#8a4424" stroke-width="2.4" fill="none" stroke-linecap="round"/>
       <path d="M10 54 q-6 2 -8 6" stroke="#8a4424" stroke-width="2.4" fill="none" stroke-linecap="round"/>
     </g>`);

  // .sh -> a seashell (scallop)
  const seashell = () => wrap(
    `<path d="M50 86 L14 44 Q50 0 86 44 Z" fill="#f7b5a3"/>
     ${[[22, 38], [33, 25], [50, 19], [67, 25], [78, 38]].map(([x, y]) => `<path d="M50 84 L${x} ${y}" stroke="#e38672" stroke-width="3.2" stroke-linecap="round"/>`).join('')}
     <rect x="38" y="80" width="24" height="10" rx="4" fill="#ee9c86"/>`);

  // .js -> coffee mug (Java...script)
  const coffee = () => wrap(
    `<path d="M66 44 Q86 44 84 58 Q82 70 66 68" stroke="#8fb7e0" stroke-width="7" fill="none" stroke-linecap="round"/>
     <rect x="20" y="36" width="50" height="50" rx="9" fill="#8fb7e0"/>
     <ellipse cx="45" cy="39" rx="22" ry="5.5" fill="#7a4a2a"/>
     <path d="M36 28 q-5 -7 0 -13 q5 -6 0 -12 M50 28 q-5 -7 0 -13 q5 -6 0 -12" stroke="#c9b9a4" stroke-width="3" fill="none" stroke-linecap="round"/>
     <circle cx="40" cy="62" r="5" fill="#f6b8d0"/>`);

  // .ts -> teacup on a saucer, with a tea-bag tag
  const teacup = () => wrap(
    `<ellipse cx="48" cy="84" rx="40" ry="7" fill="#9aa5d6"/>
     <path d="M72 50 Q88 50 86 62 Q84 72 70 70" stroke="#f6b8d0" stroke-width="6.5" fill="none" stroke-linecap="round"/>
     <path d="M14 46 H82 Q80 80 48 82 Q16 80 14 46 Z" fill="#f6b8d0"/>
     <ellipse cx="48" cy="46" rx="34" ry="6" fill="#d9a441"/>
     <path d="M30 46 Q26 54 24 60" stroke="#c9b9a4" stroke-width="1.6" fill="none"/>
     <rect x="18" y="58" width="11" height="12" rx="2" fill="#ffd65a"/>
     <circle cx="56" cy="64" r="4" fill="#fffdf8"/>`);

  // .html -> a tiny house (where the page lives)
  const house = () => wrap(
    `<rect x="22" y="46" width="56" height="42" rx="3" fill="#f5c26b"/>
     <path d="M12 52 L50 16 L88 52 Z" fill="#e0604f"/>
     <rect x="64" y="22" width="9" height="16" fill="#b8613a"/>
     <rect x="43" y="62" width="14" height="26" rx="3" fill="#8a5a3a"/>
     <rect x="28" y="56" width="11" height="11" rx="2" fill="#8fb7e0"/>
     <rect x="61" y="56" width="11" height="11" rx="2" fill="#8fb7e0"/>`);

  // .css -> paint palette
  const palette = () => wrap(
    `<path d="M50 14 C82 14 94 40 88 58 C84 70 70 64 64 74 C58 86 40 90 26 80 C10 70 8 42 22 27 C30 19 40 14 50 14 Z" fill="#e8c39a"/>
     <circle cx="58" cy="70" r="6.5" fill="#fdfaf3"/>
     <circle cx="33" cy="36" r="7.5" fill="#e0604f"/><circle cx="52" cy="28" r="7.5" fill="#ffd65a"/>
     <circle cx="71" cy="36" r="7.5" fill="#7cc576"/><circle cx="76" cy="53" r="7" fill="#6d7fd0"/>
     <circle cx="28" cy="57" r="7.5" fill="#df8fc6"/>`);

  // .toml -> a tomato
  const tomato = () => wrap(
    `<circle cx="50" cy="58" r="33" fill="#e8483e"/>
     <ellipse cx="36" cy="46" rx="7" ry="4.5" fill="#ff8f80" transform="rotate(-30 36 46)"/>
     <path d="M50 28 L42 20 L48 30 L34 28 L46 34 L40 42 L50 35 L60 42 L54 34 L66 28 L52 30 L58 20 Z" fill="#5aaa4e"/>
     <path d="M50 30 Q50 20 54 14" stroke="#3f8a3a" stroke-width="3.5" fill="none" stroke-linecap="round"/>`);

  // .rs -> a crab (Rust's mascot vibe)
  const crab = () => wrap(
    `${[0, 1, 2].map(i => `<path d="M30 ${60 + i * 7} L${12 - i * 2} ${66 + i * 9}" stroke="#d8503c" stroke-width="4" stroke-linecap="round"/><path d="M70 ${60 + i * 7} L${88 + i * 2} ${66 + i * 9}" stroke="#d8503c" stroke-width="4" stroke-linecap="round"/>`).join('')}
     <path d="M32 50 L22 38 M68 50 L78 38" stroke="#e8604a" stroke-width="5" stroke-linecap="round"/>
     <circle cx="18" cy="30" r="11" fill="#e8604a"/><circle cx="82" cy="30" r="11" fill="#e8604a"/>
     <path d="M18 30 L8 22 L14 34 Z M82 30 L92 22 L86 34 Z" fill="#fdfaf3"/>
     <ellipse cx="50" cy="60" rx="27" ry="18" fill="#e8604a"/>
     <path d="M43 44 V36 M57 44 V36" stroke="#e8604a" stroke-width="3.5" stroke-linecap="round"/>
     <circle cx="43" cy="34" r="5" fill="#fffdf8"/><circle cx="57" cy="34" r="5" fill="#fffdf8"/>
     <circle cx="43.5" cy="34.5" r="2.4" fill="#4a3424"/><circle cx="57.5" cy="34.5" r="2.4" fill="#4a3424"/>
     <path d="M44 64 Q50 69 56 64" stroke="#8a2a1c" stroke-width="2.5" fill="none" stroke-linecap="round"/>`);

  // images -> a little picture frame with a landscape
  const frame = () => wrap(
    `<rect x="12" y="18" width="76" height="64" rx="5" fill="#c9925e"/>
     <rect x="21" y="27" width="58" height="46" rx="2" fill="#bfe3f5"/>
     <path d="M21 73 L40 48 L52 62 L60 54 L79 73 Z" fill="#7cc576"/>
     <circle cx="66" cy="38" r="6" fill="#ffd65a"/>`);

  // .pdf -> a sealed letter
  const letter = () => wrap(
    `<rect x="10" y="24" width="80" height="54" rx="6" fill="#f9cfa0"/>
     <path d="M12 28 L50 56 L88 28" stroke="#e3a86a" stroke-width="4.5" fill="none" stroke-linejoin="round" stroke-linecap="round"/>
     <path d="M12 76 L40 52 M88 76 L60 52" stroke="#e3a86a" stroke-width="3" fill="none" stroke-linecap="round"/>
     <circle cx="50" cy="56" r="8.5" fill="#e0604f"/>
     <path d="M50 60 l-4 -4 a2.6 2.6 0 0 1 4 -3 a2.6 2.6 0 0 1 4 3 Z" fill="#ffd2d2"/>`);

  // .gitignore -> a closed (sleepy) eye
  const eye = () => wrap(
    `<path d="M14 44 Q50 76 86 44" stroke="#4a3424" stroke-width="6" fill="none" stroke-linecap="round"/>
     ${[[26, 58, 20, 70], [38, 64, 35, 77], [50, 66, 50, 80], [62, 64, 65, 77], [74, 58, 80, 70]].map(([a, b, c, d]) => `<path d="M${a} ${b} L${c} ${d}" stroke="#4a3424" stroke-width="4" stroke-linecap="round"/>`).join('')}
     <ellipse cx="24" cy="38" rx="6" ry="3.5" fill="#f4a7bf"/><ellipse cx="76" cy="38" rx="6" ry="3.5" fill="#f4a7bf"/>`);

  // .env -> a padlock (secrets)
  const padlock = () => wrap(
    `<path d="M33 46 V33 Q33 15 50 15 Q67 15 67 33 V46" stroke="#a7a3b5" stroke-width="8.5" fill="none" stroke-linecap="round"/>
     <rect x="22" y="42" width="56" height="44" rx="9" fill="#ffd65a"/>
     <circle cx="50" cy="60" r="6" fill="#8a5a3a"/>
     <rect x="47" y="60" width="6" height="14" rx="3" fill="#8a5a3a"/>`);

  const sparkle = (color = C.sun) => wrap(
    `<path d="M50 22 L55 45 L78 50 L55 55 L50 78 L45 55 L22 50 L45 45Z" fill="${color}"/>`);

  const blob = () => wrap(
    `<path d="M30 20 Q46 14 50 34 Q54 60 38 80 Q24 92 18 70 Q14 44 30 20Z" fill="${C.yellow}"/>
     <path d="M52 30 Q72 20 82 40 Q86 56 70 64 Q84 74 72 88 Q58 96 50 76 Q46 52 52 30Z" fill="${C.orange}"/>
     <path d="M18 70 Q10 82 22 90 Q34 94 38 80Z" fill="${C.sky}"/>`);

  // Standalone copy of the crayon filter, so a doodle can become a self-contained image.
  const CRAYON_FILTER = `<filter id="crayon" x="-15%" y="-15%" width="130%" height="130%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="wobble"/>
    <feDisplacementMap in="SourceGraphic" in2="wobble" scale="3.5" xChannelSelector="R" yChannelSelector="G" result="rough"/>
    <feTurbulence type="fractalNoise" baseFrequency="1.9" numOctaves="1" seed="9" result="grain"/>
    <feColorMatrix in="grain" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 -2.2 1.25" result="flecks"/>
    <feComposite in="flecks" in2="rough" operator="in" result="paperFlecks"/>
    <feMerge><feMergeNode in="rough"/><feMergeNode in="paperFlecks"/></feMerge></filter>`;
  const srcCache = {};
  // Doodle as an <img>-ready data URL. The browser rasterizes an image once and reuses the
  // bitmap, so moving/animating it never re-runs the (expensive) crayon filter.
  window.DOODLE_SRC = (name) => {
    if (!srcCache[name]) {
      let svg = window.DOODLES[name]();
      svg = svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ' + (/\swidth=/.test(svg.slice(0, svg.indexOf('>'))) ? '' : 'width="200" height="200" '));
      svg = svg
        .replace(/(<svg[^>]*>)/, `$1<defs>${CRAYON_FILTER}</defs>`);
      srcCache[name] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }
    return srcCache[name];
  };

  const crop = (fn) => () => fn().replace('viewBox="0 0 100 100"', 'viewBox="6 6 88 88" width="176" height="176"');
  window.DOODLES = {
    flowerGreen: () => flower(C.green),
    flowerBlue: () => flower(C.blue),
    flowerRose: () => flower(C.rose),
    flowerPink: () => flower(C.blush),
    claude,
    pie, bandaid, braces, notebook, paper, blanket, yam, seashell, coffee, teacup, house, palette, tomato, crab, frame, letter, eye, padlock,
    // Tightly cropped versions for small file icons
    pieIcon: () => pie().replace('viewBox="0 0 100 100"', 'viewBox="2 14 96 80" width="192" height="160"'),
    bandaidIcon: () => bandaid().replace('viewBox="0 0 100 100"', 'viewBox="8 8 84 84" width="168" height="168"'),
    notebookIcon: crop(notebook), paperIcon: crop(paper), blanketIcon: crop(blanket), yamIcon: crop(yam), seashellIcon: crop(seashell),
    coffeeIcon: crop(coffee), teacupIcon: crop(teacup), houseIcon: crop(house), paletteIcon: crop(palette), tomatoIcon: crop(tomato),
    crabIcon: crop(crab), frameIcon: crop(frame), letterIcon: crop(letter), eyeIcon: crop(eye), padlockIcon: crop(padlock),
    bracesIcon: () => braces().replace('viewBox="0 0 100 100"', 'viewBox="12 12 76 76" width="152" height="152"'),
    // Tightly cropped Claude creature for small inline icons (no blank margin).
    claudeIcon: () => claude().replace('viewBox="0 0 100 100"', 'viewBox="1 18 98 66" width="196" height="132"'),
    sun, chick, strawberry, apple, tulips, butterfly, frog, bear, blob,
    sparkle: () => sparkle(),
    sparklePink: () => sparkle(C.blush),
  };
})();
