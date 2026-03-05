'use strict';
// ============================================================
//  CLICKER — Complete Idle / Clicker Game
//  Single HTML file, vanilla JS, no frameworks
// ============================================================

// ===== NUMBER FORMATTING =====
const SUFFS = ['','K','M','B','T','Qa','Qi','Sx','Sp','Oc','No','De','Ud','Dd','Tr','Qa2','Qi2','Sx2','Sp2','Oc2','No2','Vi','Uu','Du2','Tr2'];
function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return '0';
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + fmt(-n);
  if (n === 0) return '0';
  if (n < 1000) return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n).toString());
  const exp = Math.floor(Math.log10(n));
  const tier = Math.floor(exp / 3);
  if (tier >= SUFFS.length || exp >= 90) return n.toExponential(3).replace('e+','e');
  const val = n / Math.pow(1000, tier);
  return val.toFixed(val < 10 ? 2 : val < 100 ? 1 : 0) + SUFFS[tier];
}
function fmtBig(n) {
  // For very large numbers (1e100+), always use scientific
  if (!isFinite(n) || n < 1e90) return fmt(n);
  const exp = Math.floor(Math.log10(n));
  const mantissa = n / Math.pow(10, exp);
  return mantissa.toFixed(3) + 'e' + exp;
}
function fmtPct(n) { return (n * 100).toFixed(1) + '%'; }

// ===== GAME STATE =====
const G = {
  // Core
  stage: 1,
  gold: 0,
  totalDamage: 0,
  resets: 0,
  essence: 0,
  darkMatter: 0,
  // Wave
  wave: 1,
  enemyHP: 10,
  enemyMaxHP: 10,
  totalWavesCleared: 0,
  // Stats
  baseDmg: 1,
  critChance: 0.05,
  critMult: 2,
  autoDPS: 0,
  attackSpeed: 1,
  // Stage 1 — Weapon upgrades
  weapons: {
    sword: 0, bow: 0, staff: 0, armor: 0, rune: 0,
    autoAttack: false
  },
  // Stage 2 — Squad units
  units: { tank: 0, mage: 0, assassin: 0, support: 0 },
  unitSynergies: { shieldwall: false, arcane: false, shadow: false },
  // Stage 3 — Armies
  armies: { infantry: 0, cavalry: 0, siege: 0 },
  armyBonuses: { formation: false, charge: false, bombardment: false },
  // Stage 4 — Galactic
  planets: {
    alpha: false, beta: false, gamma: false,
    blackhole: false, neutron: false, void: false
  },
  // Stage 5 — Laws of Reality
  laws: {
    power: false, time: false, void: false,
    infinity: false, creation: false, entropy: false
  },
  // Stage 6 — Universal Conflict
  absolutes: {
    chronos: { defeated: false, hp: 1e300, maxHp: 1e300 },
    logos: { defeated: false, hp: 1e300 * 10, maxHp: 1e300 * 10 },
    aether: { defeated: false, hp: 1e300 * 100, maxHp: 1e300 * 100 }
  },
  multiverse: { rift: false, loop: false, fracture: false },
  // Meta progression
  essenceUpgrades: {
    dmgMult: 0, autoStart: false, goldMult: 0,
    waveStart: 0, critBonus: 0, essenceBoost: 0,
    clickPower: 0, darkMult: 0
  },
  // Absolute rewards (persistent within a run)
  absRewards: { chronosMult: 1, logosClickMult: 1, aetherReady: false },
  // Tracking
  lastTime: 0,
  gameTime: 0,
  enemiesKilled: 0,
};

// ===== EVOLUTION THRESHOLDS =====
const THRESHOLDS = [
  1e9,    // Stage 1 → 2
  1e18,   // Stage 2 → 3
  1e36,   // Stage 3 → 4
  1e72,   // Stage 4 → 5
  1e144,  // Stage 5 → 6
  1e300,  // Stage 6 → 7
  Infinity // Stage 7 (reset available)
];

const STAGE_NAMES = [
  '', 'Hero', 'Squad', 'Armies',
  'Galactic Armies', 'Unified Divine Entity',
  'Universal Conflict', 'Singularity'
];
const STAGE_COLORS = [
  '', 'var(--s1)', 'var(--s2)', 'var(--s3)',
  'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)'
];

// ===== WEAPON UPGRADE DEFINITIONS =====
const WEAPONS = [
  // sword and rune effects are no-ops: damage is computed from counts in getClickDamage()
  { id: 'sword',  name: 'Iron Sword',      icon: '⚔',  desc: '+10 click dmg & +3 auto DPS (stacks)', baseCost: 4,    costMult: 1.38,  effect: () => {} },
  { id: 'bow',    name: 'Hunter Bow',       icon: '🏹', desc: '+3% crit chance',   baseCost: 8,    costMult: 1.50,  effect: () => { G.critChance += 0.03; } },
  { id: 'staff',  name: 'Magic Staff',      icon: '🪄', desc: 'Crit multiplier +0.5x', baseCost: 16,  costMult: 1.60, effect: () => { G.critMult += 0.5; } },
  { id: 'armor',  name: 'Battle Armor',     icon: '🛡', desc: '+12% auto DPS',     baseCost: 10,   costMult: 1.38,  effect: () => {} },
  { id: 'rune',   name: 'Power Rune',       icon: '💎', desc: 'x2 click dmg & +60% auto DPS (stacks)', baseCost: 50,   costMult: 1.85,   effect: () => {} },
  { id: 'autoAttack', name: 'Auto-Attack',  icon: '⚡', desc: 'Unlock passive auto-DPS (scales with swords & armor)', baseCost: 10, costMult: 1, oneTime: true, effect: () => { G.weapons.autoAttack = true; } }
];

// ===== UNIT DEFINITIONS (Stage 2) =====
const UNIT_DEFS = {
  tank:     { name: 'Tank',     icon: '🛡', dps: 180,   baseCost: 1e8,   costMult: 1.12, desc: 'Tanky fighter. Every 5: +10% all unit damage' },
  mage:     { name: 'Mage',     icon: '✨', dps: 480,  baseCost: 3e8,   costMult: 1.14, desc: 'Arcane blaster, high DPS. Every 3: +2 Crit %' },
  assassin: { name: 'Assassin', icon: '🗡', dps: 360,  baseCost: 2e8,   costMult: 1.13, desc: '+5% crit each. Every 4: +30% damage' },
  support:  { name: 'Support',  icon: '⚡', dps: 100,   baseCost: 8e7,   costMult: 1.10, desc: 'Multiplies all other unit DPS by 1.15x each' }
};

// ===== ARMY DEFINITIONS (Stage 3) =====
const ARMY_DEFS = {
  infantry: { name: 'Infantry', icon: '⚔', dps: 2000,   baseCost: 1e15,  costMult: 1.10, desc: 'Steady DPS. Every 10: +15% all army damage' },
  cavalry:  { name: 'Cavalry',  icon: '🐴', dps: 6000,  baseCost: 6e15,  costMult: 1.11, desc: 'Fast DPS. Every 5: +20% attack speed' },
  siege:    { name: 'Siege',    icon: '💣', dps: 20000,  baseCost: 2e16,  costMult: 1.12, desc: 'Massive DPS. Every 2: +30% crit multiplier' }
};

// ===== PLANET DEFINITIONS (Stage 4) =====
const PLANET_DEFS = [
  { id: 'alpha',    name: 'Planet Alpha',   desc: '+200% all DPS',           cost: 100,   effect: 'dps200' },
  { id: 'beta',     name: 'Planet Beta',    desc: 'Crit damage x3',          cost: 250,   effect: 'critx3' },
  { id: 'gamma',    name: 'Planet Gamma',   desc: 'All units DPS x5',        cost: 500,   effect: 'unitsx5' },
  { id: 'blackhole',name: 'Black Hole',     desc: 'x10 all damage',          cost: 1500,  effect: 'allx10' },
  { id: 'neutron',  name: 'Neutron Star',   desc: 'Auto-DPS x50',            cost: 2000,  effect: 'autox50' },
  { id: 'void',     name: 'Void Realm',     desc: 'Dark Matter x3 from bosses', cost: 3000, effect: 'dmx3' }
];

// ===== LAWS OF REALITY (Stage 5) =====
const LAW_DEFS = [
  { id: 'power',    name: 'Law of Power',    desc: 'Click damage x20',         goldCost: 1e30, dmCost: 500 },
  { id: 'time',     name: 'Law of Time',     desc: 'Attack speed x10',         goldCost: 1e31, dmCost: 800 },
  { id: 'void',     name: 'Law of Void',     desc: 'Enemies take 3x damage',   goldCost: 1e32, dmCost: 1200 },
  { id: 'infinity', name: 'Law of Infinity', desc: 'Auto-DPS x1000',           goldCost: 1e33, dmCost: 2000 },
  { id: 'creation', name: 'Law of Creation', desc: 'Gold from waves x20',      goldCost: 1e34, dmCost: 3000 },
  { id: 'entropy',  name: 'Law of Entropy',  desc: 'All multipliers stack x5', goldCost: 1e35, dmCost: 5000 },
  // Stage 3 Extended - More progression paths (VERY STRONG)
  { id: 'harmony',  name: 'Law of Harmony',  desc: 'Units & weapons synergy: +300% combined damage', goldCost: 1e36, dmCost: 7000 },
  { id: 'momentum', name: 'Law of Momentum', desc: 'Wave streaks give +5% damage (max +500%)', goldCost: 1e37, dmCost: 8500 },
  { id: 'resonance',name: 'Law of Resonance',desc: 'Army DPS x500 (armies DOMINATE)', goldCost: 1e38, dmCost: 10000 },
  { id: 'evolution', name: 'Law of Evolution', desc: 'Units level up: each tier grants +150% unit damage', goldCost: 1e39, dmCost: 12000 },
  { id: 'dominion', name: 'Law of Dominion', desc: 'Total units affect all damage (+5% per 100 units)', goldCost: 1e40, dmCost: 15000 },
  { id: 'ascension', name: 'Law of Ascension', desc: 'Each law unlocked: +200% total DPS', goldCost: 1e41, dmCost: 18000 },
  { id: 'convergence', name: 'Law of Convergence', desc: 'All acquired laws amplify each other: x10x multiplier', goldCost: 1e42, dmCost: 22000 },
  { id: 'transcendence', name: 'Law of Transcendence', desc: 'Ultimate power: All DPS sources x1000, Gold reward x500', goldCost: 1e43, dmCost: 30000 }
];

// ===== ABSOLUTE DEFINITIONS (Stage 6) =====
const ABSOLUTE_DEFS = [
  {
    id: 'chronos', name: 'Chronos — Lord of Time',
    desc: 'An ancient being who bends time itself.',
    hp: 1e300, reward: 'Time Warp: +500% DPS for 10s'
  },
  {
    id: 'logos', name: 'Logos — Mind of the Universe',
    desc: 'Pure intellect given divine form.',
    hp: 1e301, reward: 'Logos Echo: +1000% click damage'
  },
  {
    id: 'aether', name: 'Aether — Fabric of Reality',
    desc: 'The substance from which all things are woven.',
    hp: 1e302, reward: 'Aether Surge: Unlock Singularity threshold'
  }
];

// ===== MULTIVERSE MODIFIERS (Stage 6) =====
const MV_DEFS = [
  { id: 'rift',    name: 'Multiverse Rift',   desc: '+1 Damage Dimension (x10,000 total DPS)', goldCost: 1e200 },
  { id: 'loop',    name: 'Temporal Loop',     desc: 'Each wave cleared this run: +0.1% damage', goldCost: 1e210 },
  { id: 'fracture',name: 'Reality Fracture',  desc: 'Bosses drop 20x resources', goldCost: 1e220 }
];

// ===== ESSENCE UPGRADE DEFINITIONS =====
const ESSENCE_UPGRADES = [
  { id: 'dmgMult',    name: 'Primordial Force',  desc: '+25% all damage per level', cost: (lvl) => Math.pow(3, lvl), maxLvl: 20 },
  { id: 'goldMult',   name: 'Gilded Memory',     desc: '+20% gold per level',       cost: (lvl) => Math.pow(3, lvl) * 0.5, maxLvl: 20 },
  { id: 'critBonus',  name: 'Eternal Precision', desc: '+2% crit chance per level', cost: (lvl) => Math.pow(4, lvl), maxLvl: 10 },
  { id: 'clickPower', name: 'Infinite Might',    desc: '+50% click damage per lvl', cost: (lvl) => Math.pow(2.5, lvl), maxLvl: 15 },
  { id: 'waveStart',  name: 'Veteran',           desc: 'Start at wave +5 per level',cost: (lvl) => Math.pow(5, lvl), maxLvl: 10 },
  { id: 'autoStart',  name: 'Autonomous',        desc: 'Start with auto-attack unlocked', cost: () => 2, maxLvl: 1 },
  { id: 'essenceBoost',name: 'Resonance',        desc: '+25% Essence gain per level', cost: (lvl) => Math.pow(4, lvl), maxLvl: 10 },
  { id: 'darkMult',   name: 'Void Affinity',     desc: '+50% Dark Matter per level', cost: (lvl) => Math.pow(5, lvl), maxLvl: 8 }
];

// ===== ENEMY NAMES BY STAGE =====
const ENEMY_NAMES = {
  1: ['Slime','Goblin','Skeleton','Orc','Troll','Dragon Whelp','Shadow','Demon'],
  2: ['War Golem','Iron Guardian','Battle Mage','Dark Knight','Warlord','Siege Giant','Blood Mage','Soul Eater'],
  3: ['Legion Vanguard','Siege Engine','Cavalry Commander','Iron Juggernaut','War Titan','Death Army','Lich General','Void Soldier'],
  4: ['Stellar Parasite','Cosmic Horror','Dark Star','Void Leviathan','Galaxy Eater','Quantum Beast','Space Kraken','Solar Tyrant'],
  5: ['Reality Fragment','Dimension Tear','Existence Glitch','Cosmic Law','Universal Error','Divine Paradox','God Remnant','Eternal Void'],
  6: ['Rogue Absolute','Time Rift Entity','Logic Paradox','Reality Shatter','Cosmic Aberration','Multiverse Ghost','Quantum Nightmare','Entropy Beast'],
  7: ['Singularity Echo','Void Remnant','Universal Collapse','Dark Origin','End of All','Final Paradox','Nothingness','The Last']
};
const BOSS_NAMES = {
  1: ['Ancient Dragon','Lich King','Demon Lord','Shadow Titan','Undead Emperor','Void Gate Keeper'],
  2: ['War Marshal','Iron Overlord','Plague General','Death Titan','Blood King','Siege Emperor'],
  3: ['Legion Supreme','Siege God','Army of Apocalypse','Iron God-King','War Deity','Death Marshal'],
  4: ['Galactic Overlord','Dark Star God','Void Emperor','Cosmic Destroyer','Galaxy Shaper','Stellar God'],
  5: ['God of Laws','Reality Master','Divine Emperor','Universal Sovereign','Cosmic Law Breaker','Existence Shaper'],
  6: ['Absolute Tyrant','Multiverse Destroyer','Reality Eater','Universal Chaos','Entropy God','Void Absolute'],
  7: ['Pre-Singularity','Universal Architect','Origin Beast','Alpha Omega','First and Last','Eternal Return']
};


// ===== STAGE BACKGROUNDS =====
function getStageBG_REMOVED() {
  const W=800, H=500;
  const defs = (content) => `<defs>${content}</defs>`;
  const LG = (id,x1,y1,x2,y2,...stops) => {
    let g=`<linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">`;
    stops.forEach(([o,c])=>g+=`<stop offset="${o}" stop-color="${c}"/>`);
    return g+'</linearGradient>';
  };
  const RG = (id,...stops) => {
    let g=`<radialGradient id="${id}" cx="50%" cy="50%" r="60%">`;
    stops.forEach(([o,c,op])=>g+=`<stop offset="${o}" stop-color="${c}" stop-opacity="${op??1}"/>`);
    return g+'</radialGradient>';
  };

  if (stage===1) {
    // Medieval Kingdom — rolling hills, castle, blue sky
    let s=defs(LG('sky',0,0,0,100,'0%','#1a3a60','50%','#3a70a0','100%','#6aacb8')
              +LG('gr',0,0,0,100,'0%','#2a5a18','100%','#1a3810'));
    s+='<rect width="800" height="500" fill="url(#sky)"/>';
    // clouds
    s+='<ellipse cx="150" cy="80" rx="80" ry="22" fill="white" opacity=".12"/>';
    s+='<ellipse cx="560" cy="60" rx="100" ry="26" fill="white" opacity=".1"/>';
    s+='<ellipse cx="340" cy="95" rx="60" ry="18" fill="white" opacity=".08"/>';
    // far hills (dark green)
    s+='<path d="M0 280 Q100 230 200 260 Q300 290 400 240 Q500 200 600 250 Q700 280 800 240 L800 500 L0 500 Z" fill="#2a4820"/>';
    // castle silhouette
    s+='<rect x="340" y="180" width="120" height="120" fill="#182010"/>';
    s+='<rect x="330" y="160" width="25" height="40" fill="#182010"/>';
    s+='<rect x="365" y="150" width="25" height="50" fill="#182010"/>';
    s+='<rect x="395" y="160" width="25" height="40" fill="#182010"/>';
    s+='<rect x="455" y="165" width="22" height="38" fill="#182010"/>';
    s+='<rect x="340" y="200" width="8" height="12" fill="#4a7828" opacity=".5"/>';// window lit
    s+='<rect x="420" y="205" width="8" height="12" fill="#4a7828" opacity=".4"/>';
    // near hills
    s+='<path d="M0 340 Q150 290 300 330 Q450 370 600 320 Q700 290 800 310 L800 500 L0 500 Z" fill="#1e3818"/>';
    s+='<path d="M0 400 Q200 360 400 390 Q600 420 800 380 L800 500 L0 500 Z" fill="#162e12"/>';
    // ground mist
    s+='<rect x="0" y="440" width="800" height="60" fill="#3a6028" opacity=".4"/>';
    return s;
  }
  if (stage===2) {
    // Dark Forest — night, dense pine silhouettes, torch glow
    let s=defs(LG('nsky',0,0,0,100,'0%','#04081a','40%','#080e24','100%','#0e1430'));
    s+='<rect width="800" height="500" fill="url(#nsky)"/>';
    // stars
    const sr=[[80,40],[200,25],[340,60],[470,30],[600,50],[720,35],[150,80],[420,70],[660,90],[280,110]];
    sr.forEach(([x,y])=>s+=`<circle cx="${x}" cy="${y}" r="1.2" fill="white" opacity=".6"/>`);
    s+='<circle cx="80" cy="55" rx="18" r="18" fill="#d8e8ff" opacity=".08"/>'; // moon
    s+='<circle cx="80" cy="55" r="16" fill="#080e24"/>'; // moon shadow
    s+='<circle cx="90" cy="52" r="16" fill="#d8e8ff" opacity=".08"/>'; // crescent
    // torches in distance
    [[250,260],[400,240],[580,255]].forEach(([x,y])=>{
      s+=`<ellipse cx="${x}" cy="${y}" rx="20" ry="15" fill="#ff8820" opacity=".08" filter="url(#tf)"/>`;
      s+=`<circle cx="${x}" cy="${y}" r="3" fill="#ffaa40" opacity=".5"/>`;
    });
    s+='<filter id="tf"><feGaussianBlur stdDeviation="6"/></filter>';
    // tree rows (back to front)
    const treeLine=(y,h,col,cnt)=>{
      let t='';
      for(let i=0;i<cnt;i++){const x=i*(800/cnt)+Math.sin(i*3.7)*15;t+=`<polygon points="${x},${y} ${x+h/2},${y+h} ${x-h/2},${y+h}" fill="${col}"/>`;}
      return t;
    };
    s+=treeLine(140,140,'#08100c',12);
    s+=treeLine(210,160,'#060e0a',10);
    s+=treeLine(280,180,'#050c08',9);
    s+=treeLine(350,200,'#040a06',8);
    // ground mist
    s+='<rect x="0" y="420" width="800" height="80" fill="#080f10" opacity=".7"/>';
    s+='<ellipse cx="400" cy="460" rx="450" ry="40" fill="#0e2018" opacity=".5"/>';
    return s;
  }
  if (stage===3) {
    // Scorched Battlefield — red sky, smoke, ruins, fire
    let s=defs(LG('bsky',0,0,0,100,'0%','#1a0800','35%','#480e04','70%','#6a1a08','100%','#2a0c04')
              +LG('gnd',0,0,0,100,'0%','#1c1008','100%','#0c0804'));
    s+='<rect width="800" height="500" fill="url(#bsky)"/>';
    s+='<filter id="smk"><feGaussianBlur stdDeviation="18"/></filter>';
    // smoke columns
    [[180,300],[400,280],[620,310],[100,320],[700,290]].forEach(([x,y])=>{
      s+=`<ellipse cx="${x}" cy="${y}" rx="45" ry="80" fill="#383028" opacity=".35" filter="url(#smk)"/>`;
      s+=`<ellipse cx="${x}" cy="${y-60}" rx="35" ry="60" fill="#282020" opacity=".25" filter="url(#smk)"/>`;
    });
    // ruins
    [[150,350,60,90],[280,370,40,70],[500,345,70,85],[640,355,50,75]].forEach(([x,y,w,h])=>{
      s+=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1a0c06"/>`;
      s+=`<rect x="${x+5}" y="${y-15}" width="${w*.35}" height="18" fill="#1a0c06"/>`;
      s+=`<rect x="${x+w*.6}" y="${y-10}" width="${w*.3}" height="13" fill="#1a0c06"/>`;
    });
    // fire
    s+='<filter id="fi"><feGaussianBlur stdDeviation="4"/></filter>';
    [[200,355],[390,340],[580,360]].forEach(([x,y])=>{
      s+=`<ellipse cx="${x}" cy="${y}" rx="15" ry="25" fill="#ff6010" opacity=".5" filter="url(#fi)"/>`;
      s+=`<ellipse cx="${x}" cy="${y+5}" rx="8" ry="15" fill="#ffb040" opacity=".6" filter="url(#fi)"/>`;
    });
    // ground
    s+='<path d="M0 400 Q200 380 400 400 Q600 420 800 400 L800 500 L0 500 Z" fill="url(#gnd)"/>';
    s+='<ellipse cx="400" cy="480" rx="420" ry="30" fill="#ff4010" opacity=".05" filter="url(#fi)"/>';
    return s;
  }
  if (stage===4) {
    // Galactic — deep space, nebulae, stars, planets
    let s=defs(RG('neb1','0%','#2808a0','50%','#1404c0',.5,'100%','#080040',0)
              +RG('neb2','0%','#a03080','50%','#602080',.4,'100%','#200820',0)
              +LG('plt',0,0,100,0,'0%','#5070c0','100%','#203060'));
    s+='<rect width="800" height="500" fill="#020008"/>';
    // nebula patches
    s+='<ellipse cx="200" cy="200" rx="200" ry="140" fill="url(#neb1)" opacity=".4"/>';
    s+='<ellipse cx="600" cy="300" rx="180" ry="120" fill="url(#neb2)" opacity=".35"/>';
    s+='<ellipse cx="700" cy="100" rx="120" ry="80" fill="url(#neb1)" opacity=".25"/>';
    // stars
    for(let i=0;i<80;i++){
      const x=Math.abs(Math.sin(i*37.3)*800), y=Math.abs(Math.cos(i*53.7)*500);
      const r=Math.abs(Math.sin(i*.7))*.8+.3, op=(.3+Math.abs(Math.cos(i*.9))*.5).toFixed(2);
      s+=`<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${r.toFixed(1)}" fill="white" opacity="${op}"/>`;
    }
    // planets
    s+='<circle cx="650" cy="130" r="55" fill="url(#plt)"/>';
    s+='<circle cx="650" cy="130" r="55" fill="none" stroke="#8090e0" stroke-width=".5" opacity=".4"/>';
    s+='<ellipse cx="650" cy="135" rx="90" ry="14" fill="none" stroke="#a0a8e0" stroke-width="1" opacity=".3"/>';
    s+='<circle cx="180" cy="380" r="30" fill="#408060" opacity=".6"/>';
    s+='<circle cx="180" cy="380" r="30" fill="none" stroke="#60c080" stroke-width=".5" opacity=".3"/>';
    return s;
  }
  if (stage===5) {
    // Divine — golden clouds, light rays, heavenly
    let s=defs(LG('hsky',0,0,0,100,'0%','#080820','30%','#201840','70%','#503810','100%','#806020')
              +LG('ray',0,0,100,0,'0%','#fff8c0','100%','#fff8c0',0));
    s+='<rect width="800" height="500" fill="url(#hsky)"/>';
    s+='<filter id="rb"><feGaussianBlur stdDeviation="20"/></filter>';
    // light rays from top
    [[200,-20,40,500],[400,-20,60,500],[600,-20,40,500],[100,-20,25,400],[700,-20,25,400]].forEach(([x,y,w,h])=>{
      s+=`<polygon points="${x-w/2},${y} ${x+w/2},${y} ${x+w*3},${y+h} ${x-w*3},${y+h}" fill="#ffd840" opacity=".06" filter="url(#rb)"/>`;
    });
    // golden clouds
    [[200,180,120,40],[500,150,150,45],[700,200,100,35],[100,220,90,30],[380,250,110,38]].forEach(([x,y,rx,ry])=>{
      s+=`<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#c0900a" opacity=".18"/>`;
      s+=`<ellipse cx="${x}" cy="${y-10}" rx="${rx*.7}" ry="${ry*.7}" fill="#e0b020" opacity=".15"/>`;
    });
    // temple pillars silhouette
    [[100,420],[200,420],[580,420],[680,420]].forEach(([x,y])=>{
      s+=`<rect x="${x}" y="${y-120}" width="18" height="120" fill="#4a3808" opacity=".5"/>`;
      s+=`<rect x="${x-10}" y="${y-135}" width="38" height="18" fill="#4a3808" opacity=".5"/>`;
      s+=`<rect x="${x-5}" y="${y}" width="28" height="12" fill="#4a3808" opacity=".5"/>`;
    });
    // god light center
    s+='<ellipse cx="400" cy="0" rx="200" ry="300" fill="#ffd060" opacity=".04" filter="url(#rb)"/>';
    return s;
  }
  if (stage===6) {
    // Multiverse — reality tears, aurora, cosmic chaos
    let s=defs(LG('mvsky',0,0,0,100,'0%','#020008','50%','#060418','100%','#0c0828'));
    s+='<rect width="800" height="500" fill="url(#mvsky)"/>';
    s+='<filter id="aur"><feGaussianBlur stdDeviation="12"/></filter>';
    // aurora bands
    [[0,'#4020e0',.15],[25,'#8020c0',.12],[45,'#2040c0',.1],[60,'#e02080',.08],[75,'#20c080',.07]].forEach(([y,col,op])=>{
      s+=`<path d="M0 ${y*5} Q200 ${y*5-40} 400 ${y*5+20} Q600 ${y*5+50} 800 ${y*5-30} L800 ${y*5+60} Q600 ${y*5+80} 400 ${y*5+50} Q200 ${y*5+30} 0 ${y*5+60} Z" fill="${col}" opacity="${op}" filter="url(#aur)"/>`;
    });
    // reality tears (white cracks)
    [[100,150,200,250],[350,80,420,180],[550,200,650,300],[200,350,300,430]].forEach(([x1,y1,x2,y2])=>{
      const mx=(x1+x2)/2, my=(y1+y2)/2;
      s+=`<path d="M${x1} ${y1} L${mx-20} ${my} L${x2} ${y2}" stroke="white" stroke-width=".8" fill="none" opacity=".4"/>`;
      s+=`<path d="M${x1+5} ${y1+10} L${mx} ${my+15} L${x2-5} ${y2+10}" stroke="#a0c0ff" stroke-width=".4" fill="none" opacity=".25"/>`;
    });
    // floating geometric shards
    [[300,200,'#4020a0'],[500,150,'#802080'],[150,300,'#204080'],[650,280,'#608040']].forEach(([x,y,col])=>{
      s+=`<polygon points="${x},${y-25} ${x+20},${y+15} ${x-20},${y+15}" fill="${col}" opacity=".3"/>`;
    });
    return s;
  }
  if (stage===7) {
    // Singularity — pure void, geometric horror, white fractures
    let s='<rect width="800" height="500" fill="#000000"/>';
    // grid (faint)
    for(let i=0;i<=16;i++){
      s+=`<line x1="${i*50}" y1="0" x2="${i*50}" y2="500" stroke="white" stroke-width=".3" opacity="${i%4===0?.12:.04}"/>`;
    }
    for(let i=0;i<=10;i++){
      s+=`<line x1="0" y1="${i*50}" x2="800" y2="${i*50}" stroke="white" stroke-width=".3" opacity="${i%4===0?.12:.04}"/>`;
    }
    // singularity point
    s+='<circle cx="400" cy="250" r="6" fill="white" opacity=".8"/>';
    s+='<circle cx="400" cy="250" r="30" fill="none" stroke="white" stroke-width=".6" opacity=".4"/>';
    s+='<circle cx="400" cy="250" r="80" fill="none" stroke="white" stroke-width=".4" opacity=".2"/>';
    s+='<circle cx="400" cy="250" r="200" fill="none" stroke="white" stroke-width=".3" opacity=".1"/>';
    // fracture lines from center
    const angles=[0,45,90,135,180,225,270,315];
    angles.forEach(a=>{
      const rad=a*Math.PI/180, x2=400+Math.cos(rad)*500, y2=250+Math.sin(rad)*400;
      s+=`<line x1="400" y1="250" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="white" stroke-width=".5" opacity=".2"/>`;
    });
    return s;
  }
  return '';
}

function updateStageBG() {
  if (window.PhaserBattle) PhaserBattle.setStage(G.stage);
}

// ===== WAVE SYSTEM =====
function getEnemyHP(wave, stage) {
  // Stage 1 base starts at 20 HP so first wave requires actual clicks.
  // Each wave +16%. Boss x10. Later stages scale exponentially in base.
  // Adjusted lower than before to account for higher unit DPS
  const stageBase = stage === 1 ? 20 : Math.pow(10, (stage - 1) * 8.8);
  const waveScale = Math.pow(1.16, wave - 1);
  const isBoss = wave % 10 === 0;
  return stageBase * waveScale * (isBoss ? 10 : 1);
}
function getEnemyGold(wave, stage) {
  const isBoss = wave % 10 === 0;
  // Stage 1: baseline that makes reaching 1e9 achievable in ~30-45 min with balanced play
  // Stage 2: jump to reach 1e18 in similar time with units
  // Stage 3: further scale to reach 1e36 with armies
  const earlyBoost = stage === 1 ? 1000 : stage === 2 ? 1e6 : 1;
  const base = Math.pow(10, (stage - 1) * 8.5) * wave * earlyBoost;
  const bossBonus = isBoss ? 12 : 1;  // 12x for bosses to encourage clearing
  const planet_void = G.planets.void ? 3 : 1;
  const mv_fracture = G.multiverse.fracture && isBoss ? 20 : 1;
  const law_creation = G.laws.creation ? 20 : 1;
  const essGold = 1 + G.essenceUpgrades.goldMult * 0.2;
  return base * bossBonus * planet_void * mv_fracture * law_creation * essGold;
}
function getDarkMatterFromBoss(wave) {
  const base = Math.max(1, Math.floor(wave / 5));
  const planet_void = G.planets.void ? 3 : 1;
  const mv_fracture = G.multiverse.fracture ? 20 : 1;
  const darkMult = 1 + G.essenceUpgrades.darkMult * 0.5;
  return base * planet_void * mv_fracture * darkMult;
}

function newWave() {
  G.enemyMaxHP = getEnemyHP(G.wave, G.stage);
  G.enemyHP = G.enemyMaxHP;
  updateEnemyDisplay();
  updateMonsterSVG(); // update monster art for new wave
}

function killEnemy() {
  const isBoss = G.wave % 10 === 0;
  const gold = getEnemyGold(G.wave, G.stage);
  G.gold += gold;
  G.enemiesKilled++;
  G.totalWavesCleared++;

  // Dark Matter from bosses (Stage 4+)
  if (isBoss && G.stage >= 4) {
    G.darkMatter += getDarkMatterFromBoss(G.wave);
  }

  // Animate death, then advance wave
  triggerMonsterDeath(() => {
    G.wave++;
    newWave();
    checkEvolution();
  });
}

// ===== DAMAGE CALCULATION =====
function getClickDamage() {
  let dmg = G.baseDmg;
  // Sword adds +10 per stack, scaling with stack count
  dmg += G.weapons.sword * 10 * (1 + G.weapons.sword * 0.15);
  // Rune doublings
  for (let i = 0; i < G.weapons.rune; i++) dmg *= 2;
  // Planet/law bonuses
  if (G.laws.power) dmg *= 20;
  if (G.laws.entropy) dmg *= 5;
  if (G.planets.blackhole) dmg *= 10;
  // Absolute: Logos reward
  dmg *= G.absRewards.logosClickMult;
  // Essence
  dmg *= (1 + G.essenceUpgrades.clickPower * 0.5);
  dmg *= (1 + G.essenceUpgrades.dmgMult * 0.25);
  return dmg;
}

function getAutoDPS() {
  if (!G.weapons.autoAttack && !G.essenceUpgrades.autoStart) return 0;
  let dps = 2; // reduced base from 8 - need more swords/armor for progression

  // Weapon scaling - Moderate early game
  dps += G.weapons.sword * 20;  // reduced from 25
  dps *= (1 + G.weapons.rune * 2.5);  // reduced from 3.0

  // Weapon armor bonus - Reasonable scaling
  dps *= (1 + G.weapons.armor * 0.8);  // reduced from 1.0

  // Units (Stage 2) - Balanced for new costs
  if (G.stage >= 2) {
    const suppMult = Math.pow(1.12, G.units.support);  // reduced from 1.15
    const unitMultiplier = 1.3 + G.units.support * 0.3;  // reduced from 1.5 + 0.5  
    
    dps += (G.units.tank * UNIT_DEFS.tank.dps * 2.5) * suppMult * unitMultiplier;  // reduced from 3x
    dps += (G.units.mage * UNIT_DEFS.mage.dps * 2.5) * suppMult * unitMultiplier;
    dps += (G.units.assassin * UNIT_DEFS.assassin.dps * 2.5) * suppMult * unitMultiplier;
    dps *= (1 + G.units.support * 0.25);  // reduced from 0.3
    
    // Synergies - Conditional bonuses
    if (G.unitSynergies.shieldwall && G.units.tank >= 5) dps += G.units.tank * UNIT_DEFS.tank.dps * 4;  // reduced from 5
    if (G.unitSynergies.arcane && G.units.mage >= 5) dps += G.units.mage * UNIT_DEFS.mage.dps * 2.5;  // reduced from 3
  }

  // Armies (Stage 3) - Balanced multipliers
  if (G.stage >= 3) {
    const infBonus = 1 + Math.floor(G.armies.infantry / 10) * 0.12;  // reduced from 0.15
    dps += (G.armies.infantry * ARMY_DEFS.infantry.dps * 3.5) * infBonus;  // reduced from 4x
    dps += (G.armies.cavalry * ARMY_DEFS.cavalry.dps * 4.5);  // reduced from 5x
    dps += (G.armies.siege * ARMY_DEFS.siege.dps * 5);  // reduced from 6x
    dps *= (1 + (G.armies.infantry + G.armies.cavalry + G.armies.siege) * 0.04);  // reduced from 0.05
    if (G.armyBonuses.formation) dps *= 2.2;  // reduced from 2.5
    if (G.armyBonuses.charge) dps *= 1.8;  // reduced from 2.0
    if (G.armyBonuses.bombardment) dps *= 1.3;  // reduced from 1.4
  }

  // Planet bonuses (Stage 4)
  if (G.planets.alpha) dps *= 3;
  if (G.planets.gamma) dps *= 5;
  if (G.planets.blackhole) dps *= 10;
  if (G.planets.neutron) dps *= 50;

  // Laws (Stage 5)
  if (G.laws.power) dps *= 20;
  if (G.laws.infinity) dps *= 1000;
  if (G.laws.entropy) dps *= 5;
  if (G.laws.time) dps *= 10;

  // Multiverse (Stage 6)
  if (G.multiverse.rift) dps *= 10000;
  if (G.multiverse.loop) dps *= (1 + G.totalWavesCleared * 0.001);

  // Absolute: Chronos reward (auto-DPS only)
  dps *= G.absRewards.chronosMult;

  // Essence: dmgMult applies to all damage; clickPower is click-only
  dps *= (1 + G.essenceUpgrades.dmgMult * 0.25);

  return dps;
}

function getCritChance() {
  let c = G.critChance;
  if (G.stage >= 2) c += G.units.assassin * 0.015;
  if (G.unitSynergies.shadow && G.units.assassin >= 5) c += 0.10;
  c += G.essenceUpgrades.critBonus * 0.02;
  return Math.min(c, 0.95);
}

function getCritMult() {
  let m = G.critMult;
  if (G.planets.beta) m *= 3;
  if (G.stage >= 3) m += Math.floor(G.armies.siege / 2) * 0.15;
  return m;
}

function dealDamage(dmg) {
  if (G.enemyHP <= 0) return; // already dying — prevent cascade kills each frame
  // Apply law of void (enemies take 3x)
  if (G.laws.void) dmg *= 3;
  G.enemyHP -= dmg;
  G.totalDamage += dmg;
  if (G.enemyHP <= 0) {
    G.enemyHP = 0;
    killEnemy();
  } else {
    updateEnemyDisplay();
  }
}

// ===== CLICK HANDLER =====
function handleClick(evt) {
  let dmg = getClickDamage();
  let isCrit = Math.random() < getCritChance();
  if (isCrit) dmg *= getCritMult();
  dealDamage(dmg);
  // Floater
  spawnFloater(evt.clientX, evt.clientY, (isCrit ? '✦ CRIT ' : '') + fmt(dmg), isCrit ? '#ffd700' : 'var(--text)');
  // Battle scene animation
  triggerHeroAttack();
}

function spawnFloater(x, y, text, color) {
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = text;
  el.style.left = (x + (Math.random() - 0.5) * 30) + 'px';
  el.style.top = (y - 20) + 'px';
  el.style.color = color;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

// ===== WEAPON UNIT COST CALCULATION =====
function getWeaponCost(w) {
  const def = WEAPONS.find(x => x.id === w.id);
  const count = G.weapons[w.id];
  if (w.oneTime) return def.baseCost;
  return Math.floor(def.baseCost * Math.pow(def.costMult, count));
}
function getUnitCost(id, qty = 1) {
  const d = UNIT_DEFS[id];
  let cost = 0;
  const current = G.units[id];
  for (let i = 0; i < qty; i++) {
    cost += Math.floor(d.baseCost * Math.pow(d.costMult, current + i));
  }
  return cost;
}
function getArmyCost(id, qty = 1) {
  const d = ARMY_DEFS[id];
  let cost = 0;
  const current = G.armies[id];
  for (let i = 0; i < qty; i++) {
    cost += Math.floor(d.baseCost * Math.pow(d.costMult, current + i));
  }
  return cost;
}

// ===== STAGE TRANSITIONS =====
function checkEvolution() {
  const threshold = THRESHOLDS[G.stage - 1];
  if (G.totalDamage >= threshold && G.stage < 7) {
    evolveStage();
  }
}

function evolveStage() {
  G.stage++;
  showOverlay(`STAGE ${G.stage}: ${STAGE_NAMES[G.stage].toUpperCase()}`, getStageEvolveText(G.stage));
  rebuildUI();
  // Animate hero transformation
  triggerHeroEvolve();
  updateStageBG();
  updateMonsterSVG();
  // Enable reset button at stage 7
  document.getElementById('reset-btn').disabled = G.stage < 7;
}

function getStageEvolveText(s) {
  const texts = {
    2: 'You have grown beyond a single hero. Recruit your squad!',
    3: 'Your squad becomes a legendary army. Lead them to conquest!',
    4: 'Your armies span galaxies. Conquer the cosmos with Dark Matter!',
    5: 'You have transcended individuality. Bend the Laws of Reality!',
    6: 'Other divine entities challenge your existence. Face the Absolutes!',
    7: 'You approach the Singularity. Trigger the Universal Collapse to ascend!'
  };
  return texts[s] || 'A new stage of power awaits.';
}

function showOverlay(title, sub) {
  const ov = document.getElementById('stage-overlay');
  const col = STAGE_COLORS[G.stage];
  document.getElementById('overlay-title').textContent = title;
  document.getElementById('overlay-title').style.color = col;
  document.getElementById('overlay-sub').textContent = sub;
  ov.classList.add('show');
  setTimeout(() => ov.classList.remove('show'), 3000);
}

// ===== SINGULARITY RESET =====
function calcEssenceGain() {
  const base = Math.floor(Math.log10(Math.max(G.totalDamage, 10)) * 2);
  const boost = 1 + G.essenceUpgrades.essenceBoost * 0.25;
  return Math.max(1, Math.floor(base * boost));
}

function triggerCollapse() {
  const gain = calcEssenceGain();
  G.essence += gain;
  G.resets++;
  notify(`Universe collapsed! Gained ${gain} Essence. Cycle ${G.resets} complete.`);

  // Save essence and meta upgrades, reset everything else
  const savedEss = G.essence;
  const savedResets = G.resets;
  const savedEssUpg = JSON.parse(JSON.stringify(G.essenceUpgrades));
  const savedEssMultTotal = savedEssUpg;

  // Reset G to initial state
  G.stage = 1;
  G.gold = 0;
  G.totalDamage = 0;
  G.darkMatter = 0;
  G.wave = 1 + G.essenceUpgrades.waveStart * 5;
  G.totalWavesCleared = 0;
  G.baseDmg = 1;
  G.critChance = 0.05;
  G.critMult = 2;
  G.autoDPS = 0;
  G.attackSpeed = 1;
  G.enemiesKilled = 0;

  // Restore persistent
  G.essence = savedEss;
  G.resets = savedResets;
  G.essenceUpgrades = savedEssUpg;

  // Reset non-persistent
  G.weapons = { sword: 0, bow: 0, staff: 0, armor: 0, rune: 0, autoAttack: G.essenceUpgrades.autoStart };
  G.units = { tank: 0, mage: 0, assassin: 0, support: 0 };
  G.unitSynergies = { shieldwall: false, arcane: false, shadow: false };
  G.armies = { infantry: 0, cavalry: 0, siege: 0 };
  G.armyBonuses = { formation: false, charge: false, bombardment: false };
  G.planets = { alpha: false, beta: false, gamma: false, blackhole: false, neutron: false, void: false };
  G.laws = { power: false, time: false, void: false, infinity: false, creation: false, entropy: false };
  G.absRewards = { chronosMult: 1, logosClickMult: 1, aetherReady: false };
  G.absolutes = {
    chronos: { defeated: false, hp: 1e300, maxHp: 1e300 },
    logos: { defeated: false, hp: 1e301, maxHp: 1e301 },
    aether: { defeated: false, hp: 1e302, maxHp: 1e302 }
  };
  G.multiverse = { rift: false, loop: false, fracture: false };

  document.getElementById('reset-btn').disabled = true;
  newWave();
  rebuildUI();
  triggerHeroEvolve(); // reset back to stage 1 hero
  showOverlay('UNIVERSAL COLLAPSE', 'The cycle begins anew. Your Essence persists...');
}

// ===== ESSENCE UPGRADES =====
function buyEssenceUpgrade(id) {
  const def = ESSENCE_UPGRADES.find(x => x.id === id);
  const current = typeof G.essenceUpgrades[id] === 'boolean'
    ? (G.essenceUpgrades[id] ? 1 : 0)
    : G.essenceUpgrades[id];
  const maxLvl = def.maxLvl || 1;
  if (current >= maxLvl) return;
  const cost = def.cost(current);
  if (G.essence < cost) { notify('Not enough Essence!'); return; }
  G.essence -= cost;
  if (typeof G.essenceUpgrades[id] === 'boolean') {
    G.essenceUpgrades[id] = true;
  } else {
    G.essenceUpgrades[id]++;
  }
  notify(`Upgraded: ${def.name}`);
  renderMetaPanel();
}

// ===== NOTIFICATIONS =====
let notifTimer = null;
function notify(msg) {
  const el = document.getElementById('notif');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(notifTimer);
  notifTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ===== UI: ENEMY =====
function updateEnemyDisplay() {
  const isBoss = G.wave % 10 === 0;
  const pct = G.enemyMaxHP > 0 ? Math.max(0, G.enemyHP / G.enemyMaxHP * 100) : 0;
  document.getElementById('enemy-hp-fill').style.width = pct + '%';
  document.getElementById('enemy-hp-text').textContent = fmtBig(Math.max(0, G.enemyHP)) + ' / ' + fmtBig(G.enemyMaxHP);
  document.getElementById('wave-num').textContent = G.wave;
  document.getElementById('wave-gold').textContent = fmt(getEnemyGold(G.wave, G.stage));
  document.getElementById('next-boss').textContent = Math.ceil(G.wave / 10) * 10;
  document.getElementById('boss-label').style.display = isBoss ? 'block' : 'none';

  const names = isBoss ? BOSS_NAMES[G.stage] : ENEMY_NAMES[G.stage];
  const nameIdx = Math.floor((G.wave - 1) / (isBoss ? 1 : 1)) % names.length;
  document.getElementById('enemy-name').textContent = (isBoss ? '👑 ' : '') + names[nameIdx % names.length];
  document.getElementById('enemy-name').style.color = isBoss ? 'var(--red)' : 'var(--text)';
}

// ===== UI: HEADER =====
function updateHeader() {
  const stage = G.stage;
  const col = STAGE_COLORS[stage];
  const badge = document.getElementById('stage-badge');
  badge.textContent = `STAGE ${stage}: ${STAGE_NAMES[stage].toUpperCase()}`;
  badge.style.color = col;
  badge.style.borderColor = col;

  document.getElementById('gold-badge-val').textContent = fmt(G.gold);
  const dmgEl = document.getElementById('dmg-badge-val');
  if (dmgEl) dmgEl.textContent = fmtBig(G.totalDamage);

  // Essence / DM visibility
  const hasEss = G.essence > 0 || G.resets > 0;
  document.getElementById('h-ess-wrap').style.display = hasEss ? '' : 'none';
  document.getElementById('h-essence').textContent = fmt(G.essence);
  const hasDM = G.stage >= 4;
  document.getElementById('h-dm-wrap').style.display = hasDM ? '' : 'none';
  document.getElementById('h-dm').textContent = fmt(G.darkMatter);

  // Evolution bar
  const threshold = THRESHOLDS[stage - 1];
  let pct = 0;
  let label = '';
  if (stage < 7) {
    const prevThresh = stage > 1 ? THRESHOLDS[stage - 2] : 0;
    const range = threshold - prevThresh;
    pct = Math.min(100, (G.totalDamage - prevThresh) / range * 100);
    if (pct < 0) pct = 0;
    label = fmtBig(G.totalDamage) + ' / ' + fmtBig(threshold) + ' total damage';
    document.getElementById('evo-fill').style.background = col;
  } else {
    pct = 100;
    label = 'Singularity Reached — Trigger Collapse!';
    document.getElementById('evo-fill').style.background = 'var(--s7)';
  }
  document.getElementById('evo-fill').style.width = pct + '%';
  document.getElementById('evo-label2').textContent = label;

  // Click button stage color — tint border only, keep designed text color
  const btn = document.getElementById('click-btn');
  btn.style.borderColor = col;

  // Header DPS row
  const autoDPS = getAutoDPS();
  document.getElementById('dps-click').textContent = fmtBig(getClickDamage());
  document.getElementById('dps-auto').textContent = fmtBig(autoDPS);
  const eps = G.enemyMaxHP > 0 ? (autoDPS / G.enemyMaxHP).toFixed(3) : '0';
  document.getElementById('dps-eps').textContent = eps;
}

// ===== UI: STATS PANEL =====
function updateStats() {
  document.getElementById('s-clickdmg').textContent = fmtBig(getClickDamage());
  document.getElementById('s-autodps').textContent = fmtBig(getAutoDPS());
  document.getElementById('s-crit').textContent = fmtPct(getCritChance());
  document.getElementById('s-critm').textContent = getCritMult().toFixed(1) + 'x';
  const dmRow = document.getElementById('s-dm-row');
  if (G.stage >= 4) { dmRow.style.display = ''; document.getElementById('s-dm').textContent = fmt(G.darkMatter); }
  else dmRow.style.display = 'none';
}

// ===== UI: UPGRADES PANEL (Left) =====
function renderUpgradesPanel() {
  const area = document.getElementById('upgrades-area');
  area.innerHTML = '';
  if (G.stage === 1) renderStage1Upgrades(area);
  else if (G.stage === 2) renderStage2Upgrades(area);
  else if (G.stage === 3) renderStage3Upgrades(area);
  else if (G.stage === 4) renderStage4Upgrades(area);
  else if (G.stage === 5) renderStage5Upgrades(area);
  else if (G.stage === 6) renderStage6Upgrades(area);
  else if (G.stage === 7) renderStage7Upgrades(area);
}

function renderStage1Upgrades(area) {
  WEAPONS.forEach(w => {
    const count = w.oneTime ? (G.weapons[w.id] ? 1 : 0) : G.weapons[w.id];
    const cost = getWeaponCost(w);
    const bought = w.oneTime && G.weapons[w.id];
    const lvlTier = count >= 10 ? '10' : count >= 6 ? '6' : count >= 3 ? '3' : '0';
    const btn = document.createElement('button');
    btn.className = 'upg-btn' + (bought ? ' bought' : '');
    btn.dataset.lvl = lvlTier;
    btn.disabled = bought || G.gold < cost;
    btn.innerHTML = `<div class="upg-name">
        <span class="upg-icon">${w.icon || ''}</span>${w.name}
        ${!w.oneTime && count > 0 ? '<span class="upg-count">x' + count + '</span>' : ''}
      </div>
      <div class="upg-desc">${w.desc}</div>
      <div class="upg-cost">${bought ? '✓ Bought' : '🪙 ' + fmt(cost)}</div>`;
    if (!bought) {
      btn.onclick = () => {
        const c = getWeaponCost(w);
        if (G.gold < c) return;
        G.gold -= c;
        if (w.oneTime) { G.weapons[w.id] = true; } else { G.weapons[w.id]++; }
        w.effect();
        renderUpgradesPanel();
        updateHeroSVG();
      };
    }
    area.appendChild(btn);
  });
}

function renderStage2Upgrades(area) {
  // Show weapon upgrades at top
  renderStage1Upgrades(area);
  // Synergy upgrades
  const syns = [
    { id: 'shieldwall', name: 'Shield Wall', desc: 'Requires 5 Tanks: Tank DPS x2', cost: 5000 },
    { id: 'arcane',     name: 'Arcane Link', desc: 'Requires 5 Mages: Mage DPS x1.5', cost: 8000 },
    { id: 'shadow',     name: 'Shadow Pact', desc: 'Requires 5 Assassins: +10% crit', cost: 6000 }
  ];
  const title = document.createElement('div');
  title.className = 'sec-title';
  title.style.margin = '8px 0 4px';
  title.textContent = 'SYNERGIES';
  area.appendChild(title);
  syns.forEach(s => {
    const active = G.unitSynergies[s.id];
    const btn = document.createElement('button');
    btn.className = 'upg-btn' + (active ? ' bought' : '');
    btn.disabled = active || G.gold < s.cost;
    btn.innerHTML = `<div class="upg-name">${s.name}</div><div class="upg-desc">${s.desc}</div><div class="upg-cost">${active ? '✓ Active' : '🪙 ' + fmt(s.cost)}</div>`;
    if (!active) btn.onclick = () => {
      if (G.gold < s.cost) return;
      G.gold -= s.cost;
      G.unitSynergies[s.id] = true;
      renderUpgradesPanel();
    };
    area.appendChild(btn);
  });
}

function renderStage3Upgrades(area) {
  // Army bonuses
  const bonuses = [
    { id: 'formation',   name: 'Battle Formation',   desc: 'All armies +50% DPS',       cost: 1e9 },
    { id: 'charge',      name: 'Grand Charge',        desc: 'All armies +30% DPS',       cost: 5e9 },
    { id: 'bombardment', name: 'Siege Bombardment',   desc: 'All armies +40% DPS',       cost: 2e10 }
  ];
  bonuses.forEach(b => {
    const active = G.armyBonuses[b.id];
    const btn = document.createElement('button');
    btn.className = 'upg-btn' + (active ? ' bought' : '');
    btn.disabled = active || G.gold < b.cost;
    btn.innerHTML = `<div class="upg-name">${b.name}</div><div class="upg-desc">${b.desc}</div><div class="upg-cost">${active ? '✓ Active' : '🪙 ' + fmt(b.cost)}</div>`;
    if (!active) btn.onclick = () => {
      if (G.gold < b.cost) return;
      G.gold -= b.cost;
      G.armyBonuses[b.id] = true;
      renderUpgradesPanel();
    };
    area.appendChild(btn);
  });
}

function renderStage4Upgrades(area) {
  // Planet conquest
  PLANET_DEFS.forEach(p => {
    const conquered = G.planets[p.id];
    const card = document.createElement('div');
    card.className = 'planet-card' + (conquered ? ' conquered' : '');
    card.innerHTML = `<div class="planet-name">🪐 ${p.name}</div>
      <div class="planet-desc">${p.desc}</div>
      <button class="planet-buy" ${conquered || G.darkMatter < p.cost ? 'disabled' : ''}>
        ${conquered ? '✓ Conquered' : '⬡ ' + fmt(p.cost) + ' Dark Matter'}
      </button>`;
    if (!conquered) {
      card.querySelector('.planet-buy').onclick = () => {
        if (G.darkMatter < p.cost) { notify('Not enough Dark Matter!'); return; }
        G.darkMatter -= p.cost;
        G.planets[p.id] = true;
        notify(`Conquered: ${p.name}!`);
        renderUpgradesPanel();
      };
    }
    area.appendChild(card);
  });
}

function renderStage5Upgrades(area) {
  // Laws of Reality
  const title = document.createElement('div');
  title.className = 'sec-title';
  title.textContent = 'LAWS OF REALITY';
  area.appendChild(title);
  LAW_DEFS.forEach(l => {
    const active = G.laws[l.id];
    const card = document.createElement('div');
    card.className = 'law-card' + (active ? ' active' : '');
    card.innerHTML = `<div class="law-name">⚖ ${l.name}</div>
      <div class="law-desc">${l.desc}</div>
      <button class="law-buy" ${active || (G.gold < l.goldCost || G.darkMatter < l.dmCost) ? 'disabled' : ''}>
        ${active ? '✓ ENACTED' : '🪙 ' + fmtBig(l.goldCost) + ' + ⬡ ' + fmt(l.dmCost) + ' DM'}
      </button>`;
    if (!active) {
      card.querySelector('.law-buy').onclick = () => {
        if (G.gold < l.goldCost || G.darkMatter < l.dmCost) { notify('Not enough resources!'); return; }
        G.gold -= l.goldCost;
        G.darkMatter -= l.dmCost;
        G.laws[l.id] = true;
        notify(`Enacted: ${l.name}!`);
        renderUpgradesPanel();
      };
    }
    area.appendChild(card);
  });
}

function renderStage6Upgrades(area) {
  // Multiverse modifiers
  const title = document.createElement('div');
  title.className = 'sec-title';
  title.textContent = 'MULTIVERSE MODIFIERS';
  area.appendChild(title);
  MV_DEFS.forEach(m => {
    const active = G.multiverse[m.id];
    const card = document.createElement('div');
    card.className = 'mv-card';
    card.innerHTML = `<div class="mv-name">🌀 ${m.name}</div>
      <div class="mv-desc">${m.desc}</div>
      <button class="mv-buy ${active ? 'active' : ''}" ${active || G.gold < m.goldCost ? 'disabled' : ''}>
        ${active ? '✓ ACTIVE' : '🪙 ' + fmtBig(m.goldCost)}
      </button>`;
    if (!active) {
      card.querySelector('.mv-buy').onclick = () => {
        if (G.gold < m.goldCost) { notify('Not enough Gold!'); return; }
        G.gold -= m.goldCost;
        G.multiverse[m.id] = true;
        notify(`Activated: ${m.name}!`);
        renderUpgradesPanel();
      };
    }
    area.appendChild(card);
  });
}

function renderStage7Upgrades(area) {
  // Show all previous upgrades summary
  const info = document.createElement('div');
  info.style.cssText = 'color:var(--text2);font-size:11px;line-height:2;padding:6px';
  info.innerHTML = `<b style="color:var(--s7)">Singularity State</b><br>
    All previous powers are consolidated.<br>
    Trigger the Universal Collapse to reset and gain Essence.`;
  area.appendChild(info);
}

// ===== UI: CENTER STAGE CONTENT =====
function renderStageCenter() {
  const area = document.getElementById('stage-center');
  area.innerHTML = '';
  if (G.stage === 2) renderSquadCenter(area);
  else if (G.stage === 3) renderArmyCenter(area);
  else if (G.stage === 6) renderAbsoluteCenter(area);
  else if (G.stage === 7) renderSingularityCenter(area);
}

function renderSquadCenter(area) {
  const title = document.createElement('div');
  title.className = 'sec-title';
  title.textContent = 'SQUAD RECRUITMENT';
  area.appendChild(title);
  Object.entries(UNIT_DEFS).forEach(([id, def]) => {
    const count = G.units[id];
    const cost1 = getUnitCost(id, 1);
    const cost10 = getUnitCost(id, 10);
    const card = document.createElement('div');
    card.className = 'unit-card';
    card.innerHTML = `
      <div class="unit-header">
        <span class="unit-name">${def.icon} ${def.name}</span>
        <span class="unit-count">${count}</span>
      </div>
      <div class="unit-stats">${def.desc}<br>DPS: ${fmt(def.dps)} each</div>
      <div class="unit-buy-row">
        <button class="unit-buy" data-id="${id}" data-qty="1" ${G.gold < cost1 ? 'disabled' : ''}>
          +1 (🪙${fmt(cost1)})
        </button>
        <button class="unit-buy" data-id="${id}" data-qty="10" ${G.gold < cost10 ? 'disabled' : ''}>
          +10 (🪙${fmt(cost10)})
        </button>
      </div>`;
    card.querySelectorAll('.unit-buy').forEach(btn => {
      btn.onclick = () => {
        const qty = parseInt(btn.dataset.qty);
        const cost = getUnitCost(btn.dataset.id, qty);
        if (G.gold < cost) return;
        G.gold -= cost;
        G.units[btn.dataset.id] += qty;
        updateHeroSVG();
        renderStageCenter();
      };
    });
    area.appendChild(card);
  });
}

function renderArmyCenter(area) {
  const title = document.createElement('div');
  title.className = 'sec-title';
  title.textContent = 'ARMY COMMAND';
  area.appendChild(title);
  Object.entries(ARMY_DEFS).forEach(([id, def]) => {
    const count = G.armies[id];
    const cost1 = getArmyCost(id, 1);
    const cost50 = getArmyCost(id, 50);
    const card = document.createElement('div');
    card.className = 'unit-card';
    card.innerHTML = `
      <div class="unit-header">
        <span class="unit-name">${def.icon} ${def.name}</span>
        <span class="unit-count">${count}</span>
      </div>
      <div class="unit-stats">${def.desc}<br>DPS: ${fmt(def.dps)} each</div>
      <div class="unit-buy-row">
        <button class="unit-buy" data-id="${id}" data-qty="1" ${G.gold < cost1 ? 'disabled' : ''}>
          +1 (🪙${fmt(cost1)})
        </button>
        <button class="unit-buy" data-id="${id}" data-qty="50" ${G.gold < cost50 ? 'disabled' : ''}>
          +50 (🪙${fmt(cost50)})
        </button>
      </div>`;
    card.querySelectorAll('.unit-buy').forEach(btn => {
      btn.onclick = () => {
        const qty = parseInt(btn.dataset.qty);
        const cost = getArmyCost(btn.dataset.id, qty);
        if (G.gold < cost) return;
        G.gold -= cost;
        G.armies[btn.dataset.id] += qty;
        updateHeroSVG();
        renderStageCenter();
      };
    });
    area.appendChild(card);
  });
}

function renderAbsoluteCenter(area) {
  const title = document.createElement('div');
  title.className = 'sec-title';
  title.textContent = 'THE ABSOLUTES';
  area.appendChild(title);
  ABSOLUTE_DEFS.forEach(a => {
    const state = G.absolutes[a.id];
    const pct = state.hp / state.maxHp * 100;
    const card = document.createElement('div');
    card.className = 'absolute-card';
    card.innerHTML = `
      <div class="absolute-name">${a.name}</div>
      <div class="absolute-desc">${a.desc}</div>
      <div class="absolute-hp-bar">
        <div class="absolute-hp-fill" style="width:${state.defeated ? 0 : pct}%"></div>
      </div>
      <div style="font-size:10px;color:var(--text2);margin-bottom:6px">
        ${state.defeated ? '✓ Defeated' : fmtBig(Math.max(0, state.hp)) + ' / ' + fmtBig(state.maxHp)}
      </div>
      <div style="font-size:10px;color:var(--gold);margin-bottom:6px">Reward: ${a.reward}</div>
      <button class="absolute-buy" ${state.defeated ? 'disabled' : ''} data-id="${a.id}">
        ${state.defeated ? '✓ CONQUERED' : '⚔ CHALLENGE'}
      </button>`;
    if (!state.defeated) {
      card.querySelector('.absolute-buy').onclick = () => {
        // Deal 10x click + 1s auto DPS as burst damage
        const dmgPerClick = getClickDamage() * 10 + getAutoDPS() * 1;
        G.absolutes[a.id].hp -= dmgPerClick;
        G.totalDamage += dmgPerClick;
        spawnFloater(
          window.innerWidth / 2, window.innerHeight / 2,
          fmtBig(dmgPerClick), 'var(--s6)'
        );
        if (G.absolutes[a.id].hp <= 0) {
          G.absolutes[a.id].hp = 0;
          G.absolutes[a.id].defeated = true;
          notify(`Defeated: ${a.name}! ${a.reward}`);
          // Apply reward effects via permanent multiplier fields
          if (a.id === 'chronos') G.absRewards.chronosMult = 6;
          if (a.id === 'logos')   G.absRewards.logosClickMult = 11;
          // aether: softens threshold so 1e300 is reachable
          if (a.id === 'aether')  G.absRewards.aetherReady = true;
        }
        // Clear and rebuild stage center to avoid duplicate appends
        renderStageCenter();
        updateStats();
      };
    }
    area.appendChild(card);
  });
}

function renderSingularityCenter(area) {
  const gain = calcEssenceGain();
  const panel = document.createElement('div');
  panel.id = 'singularity-panel';
  panel.innerHTML = `
    <h2>✦ SINGULARITY ✦</h2>
    <p>The universe has reached its limit. You stand at the precipice of total collapse.<br><br>
    All your power, all your armies, all your laws — compressed into a single point of pure Essence.<br><br>
    From nothing, you shall rise again. Stronger.</p>
    <div class="stat-row" style="justify-content:center;gap:20px;margin:10px 0">
      <div><div style="color:var(--text2);font-size:10px">Total Damage</div><div style="color:var(--s7);font-weight:bold">${fmtBig(G.totalDamage)}</div></div>
      <div><div style="color:var(--text2);font-size:10px">Cycles Done</div><div style="color:var(--s7);font-weight:bold">${G.resets}</div></div>
    </div>
    <div id="essence-preview">+${gain} Essence</div>
    <p style="color:var(--text2);font-size:10px;margin-top:6px">Total Essence after reset: ${fmt(G.essence + gain)}</p>
    <button id="collapse-btn">⟳ TRIGGER COLLAPSE</button>`;
  panel.querySelector('#collapse-btn').onclick = () => triggerCollapse();
  area.appendChild(panel);
}

// ===== UI: META PANEL =====
function renderMetaPanel() {
  const area = document.getElementById('meta-area');
  area.innerHTML = '';
  document.getElementById('r-cycles').textContent = G.resets;
  document.getElementById('r-essence').textContent = fmt(G.essence);

  ESSENCE_UPGRADES.forEach(def => {
    const current = typeof G.essenceUpgrades[def.id] === 'boolean'
      ? (G.essenceUpgrades[def.id] ? 1 : 0)
      : (G.essenceUpgrades[def.id] || 0);
    const maxLvl = def.maxLvl || 1;
    const maxed = current >= maxLvl;
    const cost = maxed ? 0 : def.cost(current);
    const btn = document.createElement('button');
    btn.className = 'essence-upg-btn';
    btn.disabled = maxed || G.essence < cost;
    btn.innerHTML = `
      <div class="upg-name">${def.name} ${maxed ? '(MAX)' : current > 0 ? `[Lv ${current}/${maxLvl}]` : ''}</div>
      <div class="upg-desc">${def.desc}</div>
      <div class="upg-cost">${maxed ? '✓ Maxed' : '✦ ' + fmt(cost) + ' Essence'}</div>`;
    if (!maxed) btn.onclick = () => buyEssenceUpgrade(def.id);
    area.appendChild(btn);
  });

  // Stage info
  renderStageInfo();
}

function renderStageInfo() {
  const area = document.getElementById('stage-info-area');
  const infos = {
    1: `<b style="color:var(--s1)">Hero Stage</b><br>• Click to deal damage<br>• Buy weapon upgrades<br>• Boss every 10 waves<br>• Unlock auto-attack!<br>• Reach 1B total damage`,
    2: `<b style="color:var(--s2)">Squad Stage</b><br>• Recruit Tank/Mage/Assassin/Support<br>• Each unit adds auto-DPS<br>• Support multiplies others<br>• Buy synergy upgrades<br>• Reach 1e18 total damage`,
    3: `<b style="color:var(--s3)">Armies Stage</b><br>• Command Infantry/Cavalry/Siege<br>• Infantry: army-wide bonuses<br>• Cavalry: speed bonuses<br>• Siege: crit multipliers<br>• Reach 1e36 total damage`,
    4: `<b style="color:var(--s4)">Galactic Stage</b><br>• Conquer planets with Dark Matter<br>• DM drops from bosses<br>• Planets give massive bonuses<br>• Black Hole = x10 all<br>• Reach 1e72 total damage`,
    5: `<b style="color:var(--s5)">Divine Stage</b><br>• Enact Laws of Reality<br>• Each Law transforms combat<br>• Law of Entropy x5 all multi<br>• Combined effects are godlike<br>• Reach 1e144 total damage`,
    6: `<b style="color:var(--s6)">Conflict Stage</b><br>• Challenge the Absolutes<br>• Unlock Multiverse Modifiers<br>• Defeat all 3 Absolutes<br>• Rift = x10,000 DPS bonus<br>• Reach 1e300 total damage`,
    7: `<b style="color:var(--s7)">Singularity</b><br>• Maximum power achieved<br>• Trigger Universal Collapse<br>• Gain Essence permanently<br>• Each cycle makes you stronger<br>• The loop is eternal`
  };
  area.innerHTML = infos[G.stage] || '';
}

// ===== FULL UI REBUILD (on stage change) =====
function rebuildUI() {
  updateHeader();
  updateStats();
  renderUpgradesPanel();
  renderStageCenter();
  renderMetaPanel();
  updateEnemyDisplay();
}

// ===== SAVE / LOAD =====
function saveGame() {
  try {
    const save = {
      v: 2,
      stage: G.stage, gold: G.gold, totalDamage: G.totalDamage,
      resets: G.resets, essence: G.essence, darkMatter: G.darkMatter,
      wave: G.wave, totalWavesCleared: G.totalWavesCleared,
      baseDmg: G.baseDmg, critChance: G.critChance, critMult: G.critMult,
      enemiesKilled: G.enemiesKilled,
      weapons: G.weapons, units: G.units, unitSynergies: G.unitSynergies,
      armies: G.armies, armyBonuses: G.armyBonuses,
      planets: G.planets, laws: G.laws,
      absolutes: G.absolutes, multiverse: G.multiverse,
      absRewards: G.absRewards, essenceUpgrades: G.essenceUpgrades
    };
    localStorage.setItem('ascension_loop_save', JSON.stringify(save));
  } catch(e) {}
}

function loadGame() {
  try {
    const raw = localStorage.getItem('ascension_loop_save');
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || s.v !== 2) return false;
    Object.assign(G, s);
    // Restore non-serializable
    G.lastTime = 0;
    G.gameTime = 0;
    return true;
  } catch(e) { return false; }
}

// ===== GAME LOOP =====
let lastRenderTime = 0;
let lastSaveTime = 0;
function gameLoop(timestamp) {
  if (G.lastTime === 0) G.lastTime = timestamp;
  const dt = Math.min((timestamp - G.lastTime) / 1000, 1); // seconds, cap at 1s
  G.lastTime = timestamp;
  G.gameTime += dt;

  // Auto DPS applied every frame based on delta time
  const autoDPS = getAutoDPS();
  if (autoDPS > 0) {
    dealDamage(autoDPS * dt);
  }

  // Update header + stats every 100ms (smooth number display)
  if (timestamp - lastRenderTime > 100) {
    updateHeader();
    updateStats();
    lastRenderTime = timestamp;
  }

  // Autosave every 15 seconds
  if (G.gameTime - lastSaveTime > 15) {
    saveGame();
    lastSaveTime = G.gameTime;
  }

  requestAnimationFrame(gameLoop);
}

// ============================================================
//  BATTLE SCENE — Hero & Monster SVG art + animations
// ============================================================

// --- Hero SVG definitions per stage ---
function getHeroSVG(stage) {
  const sw = (G.weapons && G.weapons.sword)  || 0;
  const ar = (G.weapons && G.weapons.armor)  || 0;
  const bo = (G.weapons && G.weapons.bow)    || 0;
  const st = (G.weapons && G.weapons.staff)  || 0;
  const ru = (G.weapons && G.weapons.rune)   || 0;

  // Tier 1 unlocks on first purchase; then +1 tier every 3 more upgrades.
  function gt(c, max) { return c === 0 ? 0 : Math.min(max, Math.floor((c - 1) / 3) + 1); }
  const wTier  = gt(sw, 4); // sword  tier 0-4
  const arTier = gt(ar, 4); // armor  tier 0-4
  const bwTier = gt(bo, 3); // quiver tier 0-3
  const stTier = gt(st, 3); // book   tier 0-3
  const ruTier = gt(ru, 3); // amulet tier 0-3
  const lTier  = gt(ar, 2); // legs follow armor, max 2
  const hTier  = arTier;    // helmet follows armor

  // Stage accent color
  const hues = [0, 205, 280, 28, 175, 50, 290];
  const hue  = hues[stage - 1] ?? 205;
  const sc   = 'hsl(' + hue + ',70%,58%)';
  const sm   = 'hsl(' + hue + ',50%,35%)';
  const sd   = 'hsl(' + hue + ',30%,18%)';
  const skin = stage <= 2 ? '#c8a070' : stage <= 4 ? '#b09050' : stage <= 6 ? '#88b0c8' : '#c0c8ff';

  let s = '<defs>';
  s += '<radialGradient id="halo" cx="50%" cy="55%" r="55%"><stop offset="0%" stop-color="' + sm + '" stop-opacity="0.45"/><stop offset="100%" stop-color="' + sd + '" stop-opacity="0"/></radialGradient>';
  if (wTier >= 3 || stTier >= 3 || ruTier >= 3)
    s += '<filter id="wg"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
  s += '</defs>';
  s += '<rect width="70" height="130" fill="url(#halo)"/>';

  // ── QUIVER (bow) ── drawn BEFORE body so it appears behind ────────────────
  if (bwTier >= 1) {
    const qb = ['#6b3a18','#3a2210','#1a1428'][bwTier - 1];
    const qt = ['#7d4828','#4a2e18','#2a2040'][bwTier - 1];
    const qs = ['#553010','#8a6030','#8060c0'][bwTier - 1];
    const qa = ['#8a6030','#c8a050','#60a0ff'][bwTier - 1];
    // Quiver body behind left arm
    s += '<rect x="3" y="62" width="10" height="34" rx="3.5" fill="' + qb + '"/>';
    s += '<ellipse cx="8" cy="63" rx="5" ry="2.5" fill="' + qt + '"/>';
    // Shoulder strap
    s += '<line x1="8" y1="62" x2="21" y2="59" stroke="' + qs + '" stroke-width="1.8"/>';
    // Arrows
    const nArr = bwTier >= 2 ? 3 : 2;
    for (let i = 0; i < nArr; i++) {
      const ax = 5 + i * 2.5;
      const ay = 55 - i * 2;
      s += '<line x1="' + ax + '" y1="' + ay + '" x2="' + (ax + 0.5) + '" y2="65" stroke="' + qa + '" stroke-width="1"/>';
      // Fletching
      s += '<line x1="' + (ax - 1) + '" y1="' + (ay + 3) + '" x2="' + ax + '" y2="' + ay + '" stroke="' + qs + '" stroke-width="1.2"/>';
      if (bwTier >= 3) // glowing tips
        s += '<ellipse cx="' + ax + '" cy="' + ay + '" rx="1.8" ry="1" fill="' + sc + '" opacity=".9" filter="url(#wg)"/>';
    }
    if (bwTier >= 2) { // metal bands
      s += '<rect x="3" y="73" width="10" height="2" rx="1" fill="' + qs + '" opacity=".8"/>';
      s += '<rect x="3" y="82" width="10" height="2" rx="1" fill="' + qs + '" opacity=".8"/>';
    }
    if (bwTier >= 3) { // enchanted glow
      s += '<rect x="3" y="62" width="10" height="34" rx="3.5" fill="' + sc + '" opacity=".1"/>';
    }
  }

  // ── LEGS ──────────────────────────────────────────────────────────────────
  const legCols = [
    ['#6e4828','#4a3018','#321e0c'],
    ['#707e8c','#3e4c58','#303e4a'],
    ['#303840','#1c2430','#141c24'],
  ];
  const [lc, ld, lb] = legCols[Math.min(2, lTier)];
  s += '<rect x="25" y="91" width="9" height="29" rx="2" fill="' + lc + '"/>';
  s += '<rect x="36" y="91" width="9" height="29" rx="2" fill="' + ld + '"/>';
  if (lTier >= 1) {
    s += '<rect x="25" y="101" width="9" height="3" rx="1" fill="' + ld + '"/>';
    s += '<rect x="36" y="101" width="9" height="3" rx="1" fill="' + lb + '"/>';
  }
  s += '<rect x="23" y="117" width="13" height="7" rx="2.5" fill="' + lb + '"/>';
  s += '<rect x="34" y="117" width="13" height="7" rx="2.5" fill="' + lb + '"/>';

  // ── BODY ARMOR ────────────────────────────────────────────────────────────
  const bp = [
    ['#7a4e28','#9a6238',null,null],
    ['#788898','#8898a8','#788898','#586878'],
    ['#485868','#586878','#485868','#384858'],
    ['#202830','#28333e','#202830','#181e28'],
    [sd, sm, sd, sc],
  ];
  const [bc1, bc2, ps, lv] = bp[arTier] || bp[0];
  if (arTier === 0) {
    s += '<rect x="21" y="60" width="28" height="33" rx="3" fill="' + bc1 + '"/>';
    s += '<rect x="27" y="62" width="16" height="29" fill="' + bc2 + '"/>';
  } else {
    s += '<rect x="20" y="59" width="30" height="34" rx="3" fill="' + bc1 + '"/>';
    s += '<path d="M22 59 L48 59 L45 93 L25 93 Z" fill="' + bc2 + '" opacity=".85"/>';
    s += '<line x1="35" y1="59" x2="35" y2="93" stroke="' + (lv || bc1) + '" stroke-width="1.3"/>';
    if (arTier >= 2) {
      s += '<path d="M10 57 L21 57 L22 73 L11 73 Z" fill="' + bc2 + '" stroke="' + lv + '" stroke-width=".6"/>';
      s += '<path d="M49 57 L60 57 L59 73 L48 73 Z" fill="' + bc2 + '" stroke="' + lv + '" stroke-width=".6"/>';
      s += '<rect x="11" y="64" width="9" height="6" fill="' + lv + '"/>';
      s += '<rect x="50" y="64" width="9" height="6" fill="' + lv + '"/>';
    } else {
      s += '<rect x="14" y="60" width="9" height="12" rx="3" fill="' + (ps || bc1) + '"/>';
      s += '<rect x="47" y="60" width="9" height="12" rx="3" fill="' + (ps || bc1) + '"/>';
    }
    if (arTier >= 4) {
      s += '<path d="M28 73 Q35 69 42 73" stroke="' + sc + '" fill="none" stroke-width=".9" opacity=".75"/>';
      s += '<path d="M28 83 Q35 79 42 83" stroke="' + sc + '" fill="none" stroke-width=".9" opacity=".75"/>';
      s += '<circle cx="16" cy="64" r="3" fill="' + sc + '" opacity=".85"/>';
      s += '<circle cx="54" cy="64" r="3" fill="' + sc + '" opacity=".85"/>';
    }
  }

  // ── ARMS ──────────────────────────────────────────────────────────────────
  const armC = arTier >= 1 ? (arTier >= 2 ? '#8898a8' : '#5a6878') : '#7a4e28';
  s += '<rect x="12" y="62" width="10" height="24" rx="3" fill="' + armC + '"/>';
  s += '<rect x="48" y="62" width="10" height="24" rx="3" fill="' + armC + '"/>';
  if (arTier >= 3) {
    s += '<circle cx="17" cy="77" r="3" fill="' + sc + '" opacity=".6"/>';
    s += '<circle cx="53" cy="77" r="3" fill="' + sc + '" opacity=".6"/>';
  }
  s += '<ellipse cx="17" cy="88" rx="4.5" ry="3.5" fill="' + skin + '"/>';
  s += '<ellipse cx="53" cy="88" rx="4.5" ry="3.5" fill="' + skin + '"/>';

  // ── MAGIC BOOK / ORB (staff) — left hand ─────────────────────────────────
  if (stTier >= 1) {
    if (stTier === 1) {
      // Leather tome
      s += '<rect x="5" y="73" width="13" height="18" rx="1.5" fill="#5a3818"/>';
      s += '<rect x="6" y="74" width="11" height="16" rx="1" fill="#6a4828"/>';
      s += '<line x1="11.5" y1="73" x2="11.5" y2="91" stroke="#3a2008" stroke-width="1.5"/>';
      s += '<rect x="15" y="79" width="2.5" height="7" rx="1" fill="#c8a060" opacity=".4"/>';
    } else if (stTier === 2) {
      // Ancient tome — dark leather, clasps, symbol
      s += '<rect x="4" y="71" width="14" height="20" rx="2" fill="#2a1c10"/>';
      s += '<rect x="5" y="72" width="12" height="18" rx="1.5" fill="#3a2818"/>';
      s += '<rect x="5.5" y="72.5" width="4" height="17" fill="#2a1c10"/>';
      s += '<rect x="17" y="78" width="2" height="7" rx="1" fill="#c0a030" opacity=".8"/>';
      s += '<path d="M10 77 L12 75 L14 77 L12 79 Z" fill="' + sc + '" opacity=".7"/>';
      s += '<circle cx="12" cy="83" r="1.5" fill="' + sc + '" opacity=".6"/>';
    } else {
      // Arcane grimoire — glowing runes, floating feel
      s += '<rect x="4" y="70" width="14" height="21" rx="2" fill="#0e0818" filter="url(#wg)"/>';
      s += '<rect x="5" y="71" width="12" height="19" rx="1.5" fill="#1a1028"/>';
      s += '<rect x="5.5" y="71.5" width="4" height="18" fill="#0e0818"/>';
      s += '<rect x="9.5" y="72" width="7" height="18" fill="' + sc + '" opacity=".12"/>';
      s += '<text x="13" y="78" text-anchor="middle" font-size="4.5" fill="' + sc + '" opacity=".9">ᚱ</text>';
      s += '<text x="13" y="84" text-anchor="middle" font-size="4.5" fill="' + sc + '" opacity=".8">ᚠ</text>';
      s += '<text x="13" y="90" text-anchor="middle" font-size="4.5" fill="' + sc + '" opacity=".7">ᛟ</text>';
      s += '<rect x="4" y="70" width="14" height="21" rx="2" fill="' + sc + '" opacity=".07"/>';
    }
  }

  // ── SWORD (right hand) ────────────────────────────────────────────────────
  const wPal = [
    null,
    ['#b0b0a8','#808078','#c8c8c0'],
    ['#686870','#484850','#909098'],
    ['#303038','#202028','#484850'],
    [sd, sm, sc],
  ];
  if (wTier >= 1) {
    const [blade, guard, tip] = wPal[wTier];
    if (wTier <= 2) {
      s += '<rect x="57.5" y="55" width="4" height="42" rx="1.2" fill="' + blade + '"/>';
      s += '<rect x="52" y="70" width="15" height="3" rx="1" fill="' + guard + '"/>';
      s += '<polygon points="59.5,49 57.5,57 61.5,57" fill="' + tip + '"/>';
    } else if (wTier === 3) {
      s += '<rect x="57" y="44" width="5" height="54" rx="1.5" fill="' + blade + '"/>';
      s += '<rect x="50" y="65" width="18" height="3.5" rx="1.5" fill="' + guard + '"/>';
      s += '<polygon points="59.5,37 57,47 62,47" fill="' + tip + '"/>';
      s += '<line x1="57" y1="44" x2="62" y2="98" stroke="' + tip + '" stroke-width=".4" opacity=".5"/>';
    } else {
      // Runic blade
      s += '<rect x="57" y="42" width="5" height="57" rx="2.5" fill="' + blade + '" stroke="' + sc + '" stroke-width=".8" filter="url(#wg)"/>';
      s += '<rect x="50" y="62" width="18" height="3.5" rx="1.5" fill="' + guard + '" stroke="' + sc + '" stroke-width=".7"/>';
      s += '<polygon points="59.5,34 57,46 62,46" fill="' + sc + '" filter="url(#wg)"/>';
      s += '<line x1="59.5" y1="50" x2="59.5" y2="93" stroke="' + sc + '" stroke-width=".8" opacity=".65"/>';
      s += '<path d="M56 62 L59.5 57 L63 62" stroke="' + sc + '" fill="none" stroke-width=".9"/>';
      s += '<path d="M56 76 L59.5 71 L63 76" stroke="' + sc + '" fill="none" stroke-width=".9"/>';
    }
  }

  // ── NECK ──────────────────────────────────────────────────────────────────
  s += '<rect x="29" y="50" width="12" height="12" rx="3" fill="' + skin + '"/>';

  // ── AMULET (rune) — pendant on neck chain ─────────────────────────────────
  if (ruTier >= 1) {
    const rChain = ['#b89020','#9040e0','#30b0e8'][ruTier - 1];
    const rGem   = ['#e8a030','#c060ff','#80eeff'][ruTier - 1];
    // Thin chain draping over chest
    s += '<path d="M31 57 Q35 63 39 57" stroke="' + rChain + '" fill="none" stroke-width=".9" opacity=".85"/>';
    // Diamond pendant
    s += '<polygon points="35,60 33,64 35,67 37,64" fill="' + rGem + '" opacity=".95"/>';
    s += '<polygon points="35,60 33,64 35,62 37,64" fill="' + rChain + '" opacity=".5"/>';
    if (ruTier >= 2) {
      // Ornate setting around gem
      s += '<circle cx="35" cy="63.5" r="5" fill="none" stroke="' + rChain + '" stroke-width=".7" opacity=".7"/>';
    }
    if (ruTier >= 3) {
      // Glowing halo
      s += '<circle cx="35" cy="63.5" r="6" fill="' + rGem + '" opacity=".18" filter="url(#wg)"/>';
      s += '<polygon points="35,60 33,64 35,67 37,64" fill="' + rGem + '" filter="url(#wg)" opacity=".7"/>';
    }
  }

  // ── HEAD / HELMET — follows arTier ────────────────────────────────────────
  if (hTier === 0) {
    s += '<ellipse cx="35" cy="35" rx="12" ry="14" fill="' + skin + '"/>';
    s += '<path d="M23 29 Q27 16 35 15 Q43 16 47 29 Q43 20 35 19 Q27 20 23 29 Z" fill="#5a3820"/>';
    s += '<ellipse cx="30" cy="31" rx="2.5" ry="3" fill="white"/><ellipse cx="40" cy="31" rx="2.5" ry="3" fill="white"/>';
    s += '<ellipse cx="30" cy="32" rx="1.5" ry="2" fill="#3060a0"/><ellipse cx="40" cy="32" rx="1.5" ry="2" fill="#3060a0"/>';
    s += '<circle cx="30.6" cy="31" r=".7" fill="white"/><circle cx="40.6" cy="31" r=".7" fill="white"/>';
  } else if (hTier === 1) {
    s += '<ellipse cx="35" cy="35" rx="12" ry="14" fill="' + skin + '"/>';
    s += '<path d="M23 30 Q23 16 35 15 Q47 16 47 30 L45 30 Q45 19 35 19 Q25 19 25 30 Z" fill="#6a7888"/>';
    s += '<rect x="23" y="28" width="24" height="5" rx="1" fill="#5a6878"/>';
    s += '<rect x="33" y="28" width="4" height="10" rx="1" fill="#7a8898"/>';
    s += '<ellipse cx="30" cy="34" rx="2.5" ry="2.5" fill="white"/><ellipse cx="40" cy="34" rx="2.5" ry="2.5" fill="white"/>';
    s += '<ellipse cx="30" cy="34" rx="1.5" ry="1.5" fill="#3060a0"/><ellipse cx="40" cy="34" rx="1.5" ry="1.5" fill="#3060a0"/>';
  } else if (hTier === 2) {
    s += '<ellipse cx="35" cy="35" rx="14" ry="16" fill="' + skin + '"/>';
    s += '<path d="M21 27 Q21 13 35 12 Q49 13 49 27" fill="#485868" stroke="#384858" stroke-width=".8"/>';
    s += '<rect x="21" y="25" width="28" height="8" rx="1.5" fill="#404e5e"/>';
    s += '<rect x="22" y="27" width="26" height="3.5" rx="1" fill="#0a1018"/>';
    s += '<rect x="26" y="27.5" width="8" height="2" rx=".8" fill="#3050a0" opacity=".8"/>';
    s += '<rect x="36" y="27.5" width="8" height="2" rx=".8" fill="#3050a0" opacity=".8"/>';
    s += '<path d="M29 12 Q35 3 41 12" stroke="#902020" fill="none" stroke-width="2"/>';
  } else if (hTier === 3) {
    s += '<ellipse cx="35" cy="35" rx="14" ry="16" fill="' + skin + '"/>';
    s += '<path d="M21 27 Q21 12 35 11 Q49 12 49 27" fill="#181e24" stroke="#242c36" stroke-width=".8"/>';
    s += '<rect x="21" y="25" width="28" height="8" rx="1.5" fill="#1a2028"/>';
    s += '<rect x="22" y="27" width="26" height="3.5" rx="1" fill="#05080c"/>';
    s += '<rect x="26" y="27.5" width="8" height="2" rx=".8" fill="#203880" opacity=".7"/>';
    s += '<rect x="36" y="27.5" width="8" height="2" rx=".8" fill="#203880" opacity=".7"/>';
  } else { // hTier === 4
    // Runic crown
    s += '<ellipse cx="35" cy="35" rx="14" ry="16" fill="' + sd + '" stroke="' + sc + '" stroke-width=".7"/>';
    s += '<path d="M21 25 Q21 11 35 10 Q49 11 49 25" fill="' + sm + '" stroke="' + sc + '" stroke-width=".7"/>';
    s += '<polygon points="27,11 23,1 31,11" fill="' + sc + '"/>';
    s += '<polygon points="35,11 35,0 35,11" fill="' + sc + '"/>';
    s += '<polygon points="43,11 47,1 39,11" fill="' + sc + '"/>';
    s += '<rect x="22" y="25" width="26" height="5.5" rx="1.5" fill="#060810"/>';
    s += '<ellipse cx="29" cy="27.5" rx="4" ry="2" fill="' + sc + '" opacity=".95"/>';
    s += '<ellipse cx="41" cy="27.5" rx="4" ry="2" fill="' + sc + '" opacity=".95"/>';
    s += '<text x="35" y="22" text-anchor="middle" font-size="5" fill="' + sc + '" opacity=".75">ᚱ</text>';
  }

  // Stage aura
  if (stage >= 4) s += '<ellipse cx="35" cy="65" rx="33" ry="63" fill="none" stroke="' + sc + '" stroke-width=".5" opacity=".2"/>';
  if (stage >= 6) s += '<ellipse cx="35" cy="65" rx="34" ry="64" fill="none" stroke="' + sc + '" stroke-width="1" opacity=".3"/>';

  return s;
}

// --- Army SVG visualization for Stage 2 ---
function getArmySVG() {
  // Render unit squad formation
  const totalUnits = G.units.tank + G.units.mage + G.units.assassin + G.units.support;
  const scale = 1 + Math.min(totalUnits, 100) * 0.003; // grows with unit count
  
  // Stage color
  const hues = [0, 205, 280, 28, 175, 50, 290];
  const hue  = hues[1]; // Stage 2 = index 1
  const sc   = 'hsl(' + hue + ',70%,58%)';
  const sm   = 'hsl(' + hue + ',50%,35%)';
  
  let s = '<defs>';
  s += '<radialGradient id="armyGlow" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="' + sm + '" stop-opacity="0.3"/><stop offset="100%" stop-color="' + sc + '" stop-opacity="0"/></radialGradient>';
  s += '<filter id="armyShine"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
  s += '</defs>';
  
  // Background glow circle
  s += '<circle cx="35" cy="65" r="' + (35 * scale) + '" fill="url(#armyGlow)"/>';
  
  // Tank (bottom-left) - Heavy armored unit
  if (G.units.tank > 0) {
    const tankScale = Math.min(1.2 + (G.units.tank * 0.003), 2);
    const tankX = 20, tankY = 85;
    s += '<g transform="translate(' + tankX + ',' + tankY + ') scale(' + tankScale + ')">';
    s += '<rect x="-10" y="-12" width="20" height="24" rx="3" fill="#6a7888" stroke="#4a5868" stroke-width="0.8"/>';
    s += '<rect x="-8" y="-10" width="16" height="8" fill="#8a9aa8" opacity="0.8"/>';
    s += '<polygon points="-10,8 10,8 8,-8 -8,-8" fill="#7a8898"/>';
    s += '<circle cx="-4" cy="2" r="2" fill="#c8a050" opacity="0.7"/>';
    s += '<circle cx="4" cy="2" r="2" fill="#c8a050" opacity="0.7"/>';
    s += '</g>';
    // Tank count badge
    if (G.units.tank > 1) {
      s += '<text x="' + (tankX + 8) + '" y="' + (tankY + 18) + '" font-size="8" fill="' + sc + '" font-weight="bold" text-anchor="middle">' + G.units.tank + '</text>';
    }
  }
  
  // Mage (top-middle) - Magical damage
  if (G.units.mage > 0) {
    const mageScale = Math.min(1.1 + (G.units.mage * 0.002), 1.8);
    const mageX = 35, mageY = 30;
    s += '<g transform="translate(' + mageX + ',' + mageY + ') scale(' + mageScale + ')">';
    s += '<polygon points="0,-14 -8,6 8,6" fill="#5a3aa8" stroke="#8a5aea" stroke-width="0.8"/>';
    s += '<rect x="-6" y="2" width="12" height="14" rx="2" fill="#4a2a88"/>';
    s += '<circle cx="0" cy="5" r="3" fill="#80eeff" opacity="0.8" filter="url(#armyShine)"/>';
    s += '<path d="M-3 12 Q0 14 3 12" stroke="#80eeff" fill="none" stroke-width="1" opacity="0.6"/>';
    s += '</g>';
    // Mage count badge
    if (G.units.mage > 1) {
      s += '<text x="' + (mageX + 8) + '" y="' + (mageY - 20) + '" font-size="8" fill="' + sc + '" font-weight="bold" text-anchor="middle">' + G.units.mage + '</text>';
    }
  }
  
  // Assassin (bottom-right) - Fast striker
  if (G.units.assassin > 0) {
    const assScale = Math.min(1.15 + (G.units.assassin * 0.0025), 1.9);
    const assX = 50, assY = 85;
    s += '<g transform="translate(' + assX + ',' + assY + ') scale(' + assScale + ')">';
    s += '<ellipse cx="0" cy="-8" rx="6" ry="8" fill="#3a2a18"/>';
    s += '<rect x="-7" y="0" width="14" height="18" rx="2" fill="#2a1a0a"/>';
    s += '<polygon points="-2,-8 2,-8 6,0 -6,0" fill="#1a0a00"/>';
    s += '<line x1="8" y1="-4" x2="14" y2="-8" stroke="#e8a030" stroke-width="1.5" opacity="0.9"/>';
    s += '<line x1="8" y1="4" x2="14" y2="8" stroke="#e8a030" stroke-width="1.5" opacity="0.9"/>';
    s += '</g>';
    // Assassin count badge
    if (G.units.assassin > 1) {
      s += '<text x="' + (assX + 8) + '" y="' + (assY + 18) + '" font-size="8" fill="' + sc + '" font-weight="bold" text-anchor="middle">' + G.units.assassin + '</text>';
    }
  }
  
  // Support (center) - Buff aura
  if (G.units.support > 0) {
    const supScale = Math.min(1 + (G.units.support * 0.005), 2.2);
    const supX = 35, supY = 65;
    s += '<g transform="translate(' + supX + ',' + supY + ') scale(' + supScale + ')">';
    s += '<circle cx="0" cy="0" r="6" fill="#e8c830" opacity="0.7"/>';
    s += '<circle cx="0" cy="0" r="8" fill="none" stroke="#f0d840" stroke-width="1" opacity="0.5"/>';
    s += '<path d="M-4 -6 L4 -6 L0 4 Z" fill="#f8d840" opacity="0.8"/>';
    s += '<path d="M0 -8 L0 -12 M-5 -4 L-8 -4 M5 -4 L8 -4" stroke="#f8d840" stroke-width="0.8" opacity="0.6"/>';
    s += '</g>';
    // Support count badge
    if (G.units.support > 1) {
      s += '<text x="' + (supX - 12) + '" y="' + (supY + 8) + '" font-size="8" fill="' + sc + '" font-weight="bold" text-anchor="middle">' + G.units.support + '</text>';
    }
  }
  
  // Unit count label at bottom
  if (totalUnits > 0) {
    s += '<text x="35" y="115" font-size="10" fill="' + sc + '" font-weight="bold" text-anchor="middle">Squad: ' + totalUnits + '</text>';
    const avgDps = getAutoDPS();
    s += '<text x="35" y="127" font-size="8" fill="' + sm + '" font-weight="bold" text-anchor="middle" opacity="0.9">DPS: ' + fmt(avgDps) + '</text>';
  } else {
    s += '<text x="35" y="70" font-size="11" fill="' + sc + '" font-weight="bold" text-anchor="middle" opacity="0.7">Buy Units to Build Squad</text>';
  }
  
  return s;
}

// --- Monster SVG definitions per stage (close-up face portraits) ---
function getMonsterSVG(stage, waveNum, isBoss) {
  // viewBox 0 0 160 190. Portrait = face (y:15-155) + shoulders (y:145-190).
  // v=0,1 normal variant; v=2,3 alt variant. Boss gets border glow.
  const v = waveNum % 4;
  const alt = v >= 2;

  function G_(id,...stops){
    let out=`<radialGradient id="${id}" cx="45%" cy="35%" r="65%">`;
    stops.forEach(([off,col,op])=>out+=`<stop offset="${off}" stop-color="${col}" stop-opacity="${op??1}"/>`);
    return out+'</radialGradient>';
  }
  function LG_(id,x1,y1,x2,y2,...stops){
    let out=`<linearGradient id="${id}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">`;
    stops.forEach(([off,col,op])=>out+=`<stop offset="${off}" stop-color="${col}" stop-opacity="${op??1}"/>`);
    return out+'</linearGradient>';
  }
  function EYE(cx,cy,rx,ry,irisCol,pupilRx,glowCol){
    let e='';
    e+=`<ellipse cx="${cx}" cy="${cy}" rx="${rx+3}" ry="${ry+3}" fill="#050005"/>`;
    e+=`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${irisCol}" filter="url(#eg)"/>`;
    e+=`<ellipse cx="${cx}" cy="${cy}" rx="${pupilRx}" ry="${ry*.9}" fill="#020002"/>`;
    e+=`<ellipse cx="${cx-.25*rx}" cy="${cy-.3*ry}" rx="${rx*.2}" ry="${ry*.18}" fill="rgba(255,255,220,.55)"/>`;
    if(glowCol) e+=`<ellipse cx="${cx}" cy="${cy}" rx="${rx+5}" ry="${ry+5}" fill="none" stroke="${glowCol}" stroke-width="1.5" opacity=".35" filter="url(#eg)"/>`;
    return e;
  }
  function BOSS_BORDER(col){
    return `<rect x="1" y="1" width="158" height="188" rx="7" fill="none" stroke="${col}" stroke-width="2.5" opacity=".7"/><rect x="3" y="3" width="154" height="184" rx="6" fill="none" stroke="${col}" stroke-width="1" opacity=".3"/>`;
  }

  let d='<defs>';
  d+='<filter id="eg"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
  d+='<filter id="soft"><feGaussianBlur stdDeviation="1.2"/></filter>';

  // ════════════════════════════════════════════════════════════════════════
  // STAGE 1 — Imp (red demon) / Zombie Hound (alt)
  // ════════════════════════════════════════════════════════════════════════
  if (stage===1) {
    if (!alt) {
      // ── Fallen Imp portrait ──────────────────────────────────────────
      d+=G_('bg','0%','#3a0808','70%','#100000','100%','#050000');
      d+=G_('sk','0%','#c04020','45%','#922010','100%','#5a1208');
      d+=G_('ie','0%','#ffee50','40%','#d09010','100%','#7a4a00');
      d+='</defs>';
      let s='<rect width="160" height="190" fill="url(#bg)"/>';
      // atmosphere
      s+='<ellipse cx="80" cy="100" rx="72" ry="85" fill="#5a0a0a" opacity=".12"/>';
      // shoulders
      s+='<ellipse cx="80" cy="208" rx="80" ry="38" fill="url(#sk)"/>';
      s+='<ellipse cx="80" cy="200" rx="65" ry="28" fill="#8a2a14"/>';
      // neck
      s+='<rect x="63" y="145" width="34" height="22" rx="8" fill="#7a2010"/>';
      // bat ears
      s+='<path d="M30 72 L5 38 L26 92 Z" fill="#5a1808"/><path d="M130 72 L155 38 L134 92 Z" fill="#5a1808"/>';
      s+='<path d="M30 72 L11 42 L27 86 Z" fill="#8c2a18" opacity=".6"/><path d="M130 72 L149 42 L133 86 Z" fill="#8c2a18" opacity=".6"/>';
      // horns
      s+='<path d="M60 22 Q52 8 46 2 Q44 -1 50 3 Q55 0 56 12 Q58 18 65 26" fill="#301008"/>';
      s+='<path d="M100 22 Q108 8 114 2 Q116 -1 110 3 Q105 0 104 12 Q102 18 95 26" fill="#301008"/>';
      s+='<path d="M60 22 Q54 10 49 4" stroke="#5a2010" stroke-width="1" fill="none"/>';
      s+='<path d="M100 22 Q106 10 111 4" stroke="#5a2010" stroke-width="1" fill="none"/>';
      // head
      s+='<ellipse cx="80" cy="90" rx="52" ry="60" fill="url(#sk)"/>';
      s+='<ellipse cx="90" cy="98" rx="42" ry="50" fill="#b83820" opacity=".25"/>';
      // brow
      s+='<path d="M40 72 Q58 64 80 67 Q102 64 120 72" fill="none" stroke="#6a1a08" stroke-width="4" stroke-linecap="round"/>';
      // eye sockets
      s+=EYE(56,87,17,14,'url(#ie)',4,'#ffdd00');
      s+=EYE(104,87,17,14,'url(#ie)',4,'#ffdd00');
      // nose
      s+='<ellipse cx="80" cy="110" rx="9" ry="7" fill="#6a1a08"/>';
      s+='<ellipse cx="74" cy="112" rx="5.5" ry="4" fill="#100000"/><ellipse cx="86" cy="112" rx="5.5" ry="4" fill="#100000"/>';
      // mouth + fangs
      s+='<path d="M44 130 Q80 150 116 130" fill="#100000"/>';
      s+='<path d="M44 130 Q80 148 116 130 Q80 158 44 130 Z" fill="#0a0000"/>';
      s+='<polygon points="53,130 57,130 55,145" fill="#f0ead0"/>';
      s+='<polygon points="65,134 69,133 67,148" fill="#f0ead0"/>';
      s+='<polygon points="77,136 81,136 79,151" fill="#f0ead0"/>';
      s+='<polygon points="91,133 95,134 93,148" fill="#f0ead0"/>';
      s+='<polygon points="103,130 107,130 105,145" fill="#f0ead0"/>';
      s+='<polygon points="58,144 62,144 60,131" fill="#d8d2b8" opacity=".7"/>';
      s+='<polygon points="74,149 78,149 76,134" fill="#d8d2b8" opacity=".7"/>';
      s+='<polygon points="88,149 92,149 90,134" fill="#d8d2b8" opacity=".7"/>';
      s+='<polygon points="100,144 104,144 102,131" fill="#d8d2b8" opacity=".7"/>';
      if (isBoss) s+=BOSS_BORDER('#ff6020');
      return d+s;
    } else {
      // ── Plague Zombie portrait ───────────────────────────────────────
      d+=G_('bg','0%','#0e1e0a','70%','#050e04','100%','#020402');
      d+=G_('sk','0%','#60882a','50%','#3a5a18','100%','#1a2e08');
      d+=G_('ie','0%','#88ff40','40%','#40a010','100%','#206008');
      d+='</defs>';
      let s='<rect width="160" height="190" fill="url(#bg)"/>';
      s+='<ellipse cx="80" cy="100" rx="70" ry="82" fill="#2a4a10" opacity=".14"/>';
      s+='<ellipse cx="80" cy="205" rx="78" ry="35" fill="#3a5018"/>';
      s+='<ellipse cx="80" cy="198" rx="62" ry="26" fill="#4a6020"/>';
      s+='<rect x="64" y="146" width="32" height="21" rx="7" fill="#3a5018"/>';
      // rotten head
      s+='<ellipse cx="80" cy="88" rx="48" ry="55" fill="url(#sk)"/>';
      s+='<ellipse cx="86" cy="96" rx="38" ry="45" fill="#4a7020" opacity=".3"/>';
      // exposed bone patches
      s+='<ellipse cx="52" cy="82" rx="10" ry="8" fill="#d8d0b8" opacity=".4"/>';
      s+='<ellipse cx="108" cy="78" rx="8" ry="6" fill="#d8d0b8" opacity=".35"/>';
      // torn flesh marks
      s+='<path d="M42 100 Q50 94 48 108" stroke="#1a0e06" stroke-width="2.5" fill="none"/>';
      s+='<path d="M112 96 Q118 104 114 112" stroke="#1a0e06" stroke-width="2" fill="none"/>';
      // eyes
      s+=EYE(54,86,16,13,'url(#ie)',3.5,'#70ff30');
      s+=EYE(106,86,16,13,'url(#ie)',3.5,'#70ff30');
      // nose hole
      s+='<path d="M75 108 Q80 115 85 108 Q80 104 75 108 Z" fill="#0a0800"/>';
      // mouth (rotting)
      s+='<path d="M48 125 Q80 140 112 125" fill="#080802"/>';
      s+='<polygon points="55,125 58,125 56.5,138" fill="#ccc8a8"/>';
      s+='<polygon points="67,128 70,128 68.5,141" fill="#ccc8a8"/>';
      s+='<polygon points="90,128 93,128 91.5,141" fill="#ccc8a8"/>';
      s+='<polygon points="102,125 105,125 103.5,138" fill="#ccc8a8"/>';
      s+='<path d="M58,136 L72,137" stroke="#0a0800" stroke-width="1.5"/>';
      s+='<path d="M88,137 L102,136" stroke="#0a0800" stroke-width="1.5"/>';
      // maggot dots
      s+='<circle cx="42" cy="76" r="2" fill="#88aa50" opacity=".5"/>';
      s+='<circle cx="118" cy="82" r="1.5" fill="#88aa50" opacity=".45"/>';
      if (isBoss) s+=BOSS_BORDER('#80ff40');
      return d+s;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // STAGE 2 — Skull Knight / Spectral Wraith
  // ════════════════════════════════════════════════════════════════════════
  if (stage===2) {
    if (!alt) {
      // ── Bone Knight ─────────────────────────────────────────────────
      d+=G_('bg','0%','#0a0e18','65%','#050810','100%','#020305');
      d+=G_('sk','0%','#d8d0b8','50%','#a89878','100%','#6a5a38');
      d+=LG_('ar','0','0','100','0','0%','#2a3848','100%','#151e28');
      d+=G_('ie','0%','#80b8ff','40%','#3060c0','100%','#102050');
      d+='</defs>';
      let s='<rect width="160" height="190" fill="url(#bg)"/>';
      // armor shoulders
      s+='<rect x="-10" y="148" width="82" height="50" rx="8" fill="url(#ar)"/>';
      s+='<rect x="88" y="148" width="82" height="50" rx="8" fill="url(#ar)"/>';
      s+='<rect x="30" y="152" width="100" height="42" fill="url(#ar)"/>';
      s+='<rect x="5" y="150" width="68" height="10" rx="3" fill="#3a4858"/>';
      s+='<rect x="87" y="150" width="68" height="10" rx="3" fill="#3a4858"/>';
      s+='<rect x="32" y="155" width="96" height="8" rx="2" fill="#2a3848"/>';
      // neck gorget
      s+='<rect x="60" y="140" width="40" height="18" rx="5" fill="#2a3848"/>';
      s+='<rect x="64" y="142" width="32" height="14" rx="4" fill="#1e2a38"/>';
      // skull
      s+='<ellipse cx="80" cy="82" rx="50" ry="55" fill="url(#sk)"/>';
      s+='<ellipse cx="80" cy="72" rx="46" ry="44" fill="#c8c0a8" opacity=".4"/>';
      // skull cracks
      s+='<path d="M72 20 L68 45" stroke="#8a7a58" stroke-width="1" opacity=".6"/>';
      s+='<path d="M88 22 L92 48" stroke="#8a7a58" stroke-width="1" opacity=".5"/>';
      s+='<path d="M55 55 L60 68" stroke="#8a7a58" stroke-width="1.2" opacity=".5"/>';
      // brow ridge (bone protruding)
      s+='<path d="M30 68 Q55 58 80 62 Q105 58 130 68" fill="#c0b898" stroke="#a09070" stroke-width=".8"/>';
      // cheekbones
      s+='<ellipse cx="42" cy="100" rx="16" ry="12" fill="#c8c0a8" opacity=".5"/>';
      s+='<ellipse cx="118" cy="100" rx="16" ry="12" fill="#c8c0a8" opacity=".5"/>';
      // hollow eye sockets
      s+='<ellipse cx="56" cy="84" rx="20" ry="17" fill="#050810"/>';
      s+='<ellipse cx="104" cy="84" rx="20" ry="17" fill="#050810"/>';
      // blue flame in sockets
      s+=EYE(56,85,16,13,'url(#ie)',3,'#40a0ff');
      s+=EYE(104,85,16,13,'url(#ie)',3,'#40a0ff');
      // flame wisps
      s+='<ellipse cx="56" cy="70" rx="6" ry="10" fill="#4080e0" opacity=".18" filter="url(#eg)"/>';
      s+='<ellipse cx="104" cy="70" rx="6" ry="10" fill="#4080e0" opacity=".18" filter="url(#eg)"/>';
      // nasal cavity
      s+='<path d="M74 105 Q80 114 86 105 Q80 100 74 105 Z" fill="#080808"/>';
      // jaw + teeth
      s+='<path d="M34 120 Q60 130 80 132 Q100 130 126 120 Q104 143 80 145 Q56 143 34 120 Z" fill="url(#sk)"/>';
      s+='<line x1="34" y1="120" x2="126" y2="120" stroke="#a09070" stroke-width=".7"/>';
      s+='<polygon points="46,120 50,120 48,132" fill="#f8f4e8"/>';
      s+='<polygon points="57,122 61,122 59,134" fill="#f8f4e8"/>';
      s+='<polygon points="68,123 72,123 70,136" fill="#f8f4e8"/>';
      s+='<polygon points="79,124 83,124 81,137" fill="#f8f4e8"/>';
      s+='<polygon points="90,123 94,123 92,136" fill="#f8f4e8"/>';
      s+='<polygon points="101,122 105,122 103,134" fill="#f8f4e8"/>';
      s+='<polygon points="112,120 116,120 114,132" fill="#f8f4e8"/>';
      if (isBoss) s+=BOSS_BORDER('#8080ff');
      return d+s;
    } else {
      // ── Spectral Wraith ──────────────────────────────────────────────
      d+=G_('bg','0%','#080820','60%','#040412','100%','#010106');
      d+=G_('sk','0%','#8090c8','45%','#404880','100%','#202438');
      d+=G_('ie','0%','#ffffff','30%','#c0e0ff','100%','#4080d0');
      d+='</defs>';
      let s='<rect width="160" height="190" fill="url(#bg)"/>';
      // star field
      for(let i=0;i<18;i++){
        const x=10+Math.sin(i*37)*70+70, y=5+Math.cos(i*53)*80+80;
        s+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r=".8" fill="white" opacity="${(.3+Math.abs(Math.sin(i*.9))*.5).toFixed(2)}"/>`;
      }
      // ghostly form dissolving at edges
      s+='<ellipse cx="80" cy="200" rx="60" ry="30" fill="#303860" opacity=".3"/>';
      s+='<rect x="50" y="148" width="60" height="45" rx="15" fill="url(#sk)" opacity=".5"/>';
      // ghostly robes wisps
      s+='<path d="M20 140 Q40 120 60 145 Q50 165 20 175 Z" fill="#3040b0" opacity=".2"/>';
      s+='<path d="M140 140 Q120 120 100 145 Q110 165 140 175 Z" fill="#3040b0" opacity=".2"/>';
      // head (translucent)
      s+='<ellipse cx="80" cy="85" rx="50" ry="58" fill="url(#sk)" opacity=".6"/>';
      s+='<ellipse cx="80" cy="80" rx="44" ry="48" fill="#5868a0" opacity=".3"/>';
      // ethereal glow around head
      s+='<ellipse cx="80" cy="85" rx="58" ry="66" fill="none" stroke="#4060c0" stroke-width="2" opacity=".2" filter="url(#eg)"/>';
      // eyes (pure white glow)
      s+=EYE(56,84,17,14,'url(#ie)',2.5,'#ffffff');
      s+=EYE(104,84,17,14,'url(#ie)',2.5,'#ffffff');
      // hollow facial features
      s+='<path d="M72 108 Q80 116 88 108 Q80 103 72 108 Z" fill="#060614" opacity=".7"/>';
      s+='<path d="M46 125 Q80 138 114 125" fill="none" stroke="#3050b8" stroke-width="1.5" opacity=".6"/>';
      // teeth (barely visible, ethereal)
      for(let i=0;i<7;i++){
        const tx=50+i*10;
        s+=`<polygon points="${tx},125 ${tx+3},125 ${tx+1.5},137" fill="#c8d0f8" opacity=".35"/>`;
      }
      // rising ethereal mist
      s+='<ellipse cx="80" cy="165" rx="55" ry="10" fill="#2030a0" opacity=".1" filter="url(#soft)"/>';
      if (isBoss) s+=BOSS_BORDER('#a0c0ff');
      return d+s;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // STAGE 3 — Volcanic Titan / Stone Golem
  // ════════════════════════════════════════════════════════════════════════
  if (stage===3) {
    if (!alt) {
      // ── Fire Titan ──────────────────────────────────────────────────
      d+=G_('bg','0%','#120400','60%','#080200','100%','#030100');
      d+=G_('sk','0%','#282020','40%','#181412','100%','#0e0c0a');
      d+=LG_('lava','0','0','0','100','0%','#ff6000','50%','#c02000','100%','#400800');
      d+=G_('ie','0%','#ffffff','20%','#fff060','50%','#ff8010','100%','#c02000');
      d+='</defs>';
      let s='<rect width="160" height="190" fill="url(#bg)"/>';
      // ground lava glow
      s+='<ellipse cx="80" cy="195" rx="90" ry="40" fill="#ff4000" opacity=".18" filter="url(#soft)"/>';
      // massive shoulders
      s+='<path d="M-15 155 Q20 138 60 148 L60 190 L-15 190 Z" fill="url(#sk)"/>';
      s+='<path d="M175 155 Q140 138 100 148 L100 190 L175 190 Z" fill="url(#sk)"/>';
      s+='<rect x="58" y="148" width="44" height="42" fill="#181412"/>';
      // lava cracks on shoulders
      s+='<path d="M5 158 Q30 148 55 155" stroke="url(#lava)" stroke-width="2" fill="none" opacity=".7"/>';
      s+='<path d="M105 155 Q130 148 158 158" stroke="url(#lava)" stroke-width="2" fill="none" opacity=".7"/>';
      // neck — thick pillar
      s+='<rect x="55" y="130" width="50" height="25" rx="6" fill="#181412"/>';
      s+='<path d="M58 130 Q80 126 102 130" stroke="url(#lava)" stroke-width="1.5" fill="none" opacity=".6"/>';
      // MASSIVE horns
      s+='<path d="M38 35 Q10 -5 2 -20 Q0 -25 8 -18 Q16 -20 18 -8 Q22 10 42 38" fill="#0c0806" stroke="#3a1a0a" stroke-width="1.5"/>';
      s+='<path d="M122 35 Q150 -5 158 -20 Q160 -25 152 -18 Q144 -20 142 -8 Q138 10 118 38" fill="#0c0806" stroke="#3a1a0a" stroke-width="1.5"/>';
      // lava in horn grooves
      s+='<path d="M38 35 Q14 0 6 -15" stroke="url(#lava)" stroke-width=".8" fill="none" opacity=".5"/>';
      s+='<path d="M122 35 Q146 0 154 -15" stroke="url(#lava)" stroke-width=".8" fill="none" opacity=".5"/>';
      // head (enormous)
      s+='<ellipse cx="80" cy="85" rx="58" ry="65" fill="url(#sk)"/>';
      // lava network cracks on face
      s+='<path d="M40 60 L50 78 L44 95" stroke="url(#lava)" stroke-width="2.5" fill="none" opacity=".8"/>';
      s+='<path d="M120 60 L110 78 L116 95" stroke="url(#lava)" stroke-width="2.5" fill="none" opacity=".8"/>';
      s+='<path d="M60 30 L70 50" stroke="url(#lava)" stroke-width="1.8" fill="none" opacity=".6"/>';
      s+='<path d="M100 30 L90 50" stroke="url(#lava)" stroke-width="1.8" fill="none" opacity=".6"/>';
      s+='<path d="M55 100 Q65 115 75 108" stroke="url(#lava)" stroke-width="2" fill="none" opacity=".7"/>';
      s+='<path d="M105 100 Q95 115 85 108" stroke="url(#lava)" stroke-width="2" fill="none" opacity=".7"/>';
      // forehead bulge
      s+='<ellipse cx="80" cy="52" rx="30" ry="16" fill="#201a16" opacity=".6"/>';
      // molten eyes
      s+=EYE(54,88,20,17,'url(#ie)',4,'#ff8020');
      s+=EYE(106,88,20,17,'url(#ie)',4,'#ff8020');
      // nose slits
      s+='<ellipse cx="74" cy="115" rx="7" ry="5" fill="#0a0604"/>';
      s+='<ellipse cx="86" cy="115" rx="7" ry="5" fill="#0a0604"/>';
      // open maw with fire
      s+='<path d="M38 133 Q80 158 122 133 Q100 175 80 178 Q60 175 38 133 Z" fill="#100804"/>';
      s+='<ellipse cx="80" cy="158" rx="30" ry="15" fill="#ff5000" opacity=".4" filter="url(#eg)"/>';
      s+='<ellipse cx="80" cy="155" rx="20" ry="10" fill="#ff8020" opacity=".3" filter="url(#eg)"/>';
      // lower teeth (massive)
      s+='<polygon points="50,133 54,133 52,146" fill="#b0a888"/>';
      s+='<polygon points="63,138 67,138 65,152" fill="#b0a888"/>';
      s+='<polygon points="77,140 81,140 79,154" fill="#b0a888"/>';
      s+='<polygon points="91,138 95,138 93,152" fill="#b0a888"/>';
      s+='<polygon points="106,133 110,133 108,146" fill="#b0a888"/>';
      if (isBoss) s+=BOSS_BORDER('#ff6000');
      return d+s;
    } else {
      // ── Stone Colossus ───────────────────────────────────────────────
      d+=G_('bg','0%','#0c1018','65%','#080c10','100%','#040608');
      d+=G_('sk','0%','#6878a0','45%','#384868','100%','#182030');
      d+=G_('ie','0%','#60ff80','35%','#20b040','100%','#086020');
      d+='</defs>';
      let s='<rect width="160" height="190" fill="url(#bg)"/>';
      s+='<ellipse cx="80" cy="190" rx="85" ry="35" fill="#2a3850" opacity=".25"/>';
      // stone shoulders with rune carvings
      s+='<path d="M-5 150 Q25 135 62 148 L62 190 L-5 190 Z" fill="#384858"/>';
      s+='<path d="M165 150 Q135 135 98 148 L98 190 L165 190 Z" fill="#384858"/>';
      s+='<rect x="60" y="148" width="40" height="42" fill="#2e3e50"/>';
      // rune marks on shoulders
      s+='<text x="28" y="172" font-size="12" fill="#60ff80" opacity=".4">ᚱ</text>';
      s+='<text x="118" y="172" font-size="12" fill="#60ff80" opacity=".4">ᛗ</text>';
      // neck
      s+='<rect x="58" y="132" width="44" height="22" rx="5" fill="#384858"/>';
      // cracked stone head
      s+='<ellipse cx="80" cy="85" rx="55" ry="62" fill="url(#sk)"/>';
      // stone surface shading
      s+='<ellipse cx="62" cy="68" rx="28" ry="32" fill="#6878a0" opacity=".2"/>';
      // deep cracks
      s+='<path d="M55 20 L52 55 L60 75" stroke="#1a2838" stroke-width="3" fill="none" opacity=".7"/>';
      s+='<path d="M105 22 L108 57 L100 78" stroke="#1a2838" stroke-width="2.5" fill="none" opacity=".6"/>';
      s+='<path d="M70 90 L80 105 L90 90" stroke="#1a2838" stroke-width="2" fill="none" opacity=".5"/>';
      // glowing rune on forehead
      s+='<text x="80" y="54" text-anchor="middle" font-size="18" fill="#60ff80" opacity=".6" filter="url(#eg)">ᚱ</text>';
      // brow plates
      s+='<path d="M30 72 Q55 62 80 66 Q105 62 130 72" fill="#4a5870" stroke="#2e3e50" stroke-width="1"/>';
      // eyes
      s+=EYE(54,87,19,16,'url(#ie)',3.5,'#40ff60');
      s+=EYE(106,87,19,16,'url(#ie)',3.5,'#40ff60');
      // nose slabs
      s+='<rect x="73" y="108" width="14" height="10" rx="3" fill="#2e3e50"/>';
      // mouth (stone grinding)
      s+='<path d="M42 126 Q80 142 118 126" fill="#1a2838"/>';
      s+='<polygon points="50,126 54,126 52,138" fill="#8898a8"/>';
      s+='<polygon points="63,130 67,129 65,141" fill="#8898a8"/>';
      s+='<polygon points="77,131 81,131 79,143" fill="#8898a8"/>';
      s+='<polygon points="91,130 95,129 93,141" fill="#8898a8"/>';
      s+='<polygon points="106,126 110,126 108,138" fill="#8898a8"/>';
      if (isBoss) s+=BOSS_BORDER('#60ff80');
      return d+s;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // STAGE 4 — Plague Lich / Shadow Assassin Lord
  // ════════════════════════════════════════════════════════════════════════
  if (stage===4) {
    if (!alt) {
      // ── Plague Lich ──────────────────────────────────────────────────
      d+=G_('bg','0%','#100820','60%','#080514','100%','#030208');
      d+=G_('sk','0%','#90a050','45%','#586028','100%','#2e3015');
      d+=G_('ie','0%','#e0ff60','35%','#a0d020','100%','#508010');
      d+='</defs>';
      let s='<rect width="160" height="190" fill="url(#bg)"/>';
      // green mist
      s+='<ellipse cx="80" cy="160" rx="80" ry="50" fill="#204010" opacity=".12" filter="url(#soft)"/>';
      // robe shoulders (tattered)
      s+='<path d="M0 155 Q35 140 65 150 L62 190 L0 190 Z" fill="#1e1e12"/>';
      s+='<path d="M160 155 Q125 140 95 150 L98 190 L160 190 Z" fill="#1e1e12"/>';
      s+='<rect x="60" y="150" width="40" height="40" fill="#161610"/>';
      // tattered edge
      s+='<path d="M0 155 Q15 148 30 154 Q45 144 60 150" stroke="#2a2818" stroke-width="1" fill="none"/>';
      // neck (gaunt)
      s+='<rect x="66" y="136" width="28" height="18" rx="4" fill="#404020"/>';
      // bone crown
      s+='<path d="M28 35 L38 15 L48 38" fill="#c8c0a0"/>';
      s+='<path d="M56 28 L62 10 L68 30" fill="#c8c0a0"/>';
      s+='<path d="M72 24 L80 8 L88 24" fill="#c8c0a0"/>';
      s+='<path d="M92 28 L98 10 L104 30" fill="#c8c0a0"/>';
      s+='<path d="M112 35 L122 15 L132 38" fill="#c8c0a0"/>';
      // head (gaunt, elongated)
      s+='<ellipse cx="80" cy="88" rx="46" ry="60" fill="url(#sk)"/>';
      s+='<ellipse cx="80" cy="75" rx="36" ry="42" fill="#7a8840" opacity=".3"/>';
      // dark veins
      s+='<path d="M45 65 Q55 72 48 88" stroke="#1a1808" stroke-width="1.5" fill="none" opacity=".7"/>';
      s+='<path d="M115 65 Q105 72 112 88" stroke="#1a1808" stroke-width="1.5" fill="none" opacity=".7"/>';
      s+='<path d="M58 40 Q65 55 60 70" stroke="#1a1808" stroke-width="1" fill="none" opacity=".5"/>';
      s+='<path d="M102 40 Q95 55 100 70" stroke="#1a1808" stroke-width="1" fill="none" opacity=".5"/>';
      // hollow cheeks
      s+='<ellipse cx="44" cy="104" rx="12" ry="10" fill="#202010" opacity=".5"/>';
      s+='<ellipse cx="116" cy="104" rx="12" ry="10" fill="#202010" opacity=".5"/>';
      // stitching marks
      s+='<path d="M66 60 L67 80" stroke="#101008" stroke-width="2" stroke-dasharray="3 2" opacity=".6"/>';
      s+='<path d="M94 62 L93 80" stroke="#101008" stroke-width="2" stroke-dasharray="3 2" opacity=".5"/>';
      // eyes
      s+=EYE(54,86,17,14,'url(#ie)',3,'#c0ff30');
      s+=EYE(106,86,17,14,'url(#ie)',3,'#c0ff30');
      // nose (skeletal triangle)
      s+='<path d="M74 108 Q80 118 86 108 Q80 103 74 108 Z" fill="#0e0e06"/>';
      // mouth (stitched shut + partially open)
      s+='<path d="M50 125 Q80 136 110 125" fill="#0a0a04"/>';
      s+='<line x1="52" y1="125" x2="50" y2="133" stroke="#0a0a04" stroke-width="1.5"/>';
      s+='<line x1="62" y1="128" x2="60" y2="136" stroke="#0a0a04" stroke-width="1.5"/>';
      s+='<line x1="72" y1="130" x2="70" y2="138" stroke="#0a0a04" stroke-width="1.5"/>';
      s+='<line x1="88" y1="130" x2="86" y2="138" stroke="#0a0a04" stroke-width="1.5"/>';
      s+='<polygon points="56,125 60,125 58,137" fill="#e0dcc0"/>';
      s+='<polygon points="76,130 80,130 78,142" fill="#e0dcc0"/>';
      s+='<polygon points="100,128 104,128 102,140" fill="#e0dcc0"/>';
      // poison drip
      s+='<ellipse cx="80" cy="145" rx="4" ry="5" fill="#80c020" opacity=".5" filter="url(#soft)"/>';
      if (isBoss) s+=BOSS_BORDER('#c0ff40');
      return d+s;
    } else {
      // ── Corrupted Seraph ─────────────────────────────────────────────
      d+=G_('bg','0%','#1a0820','60%','#0e0514','100%','#040208');
      d+=G_('sk','0%','#d8c0f0','45%','#a080c8','100%','#603888');
      d+=G_('ie','0%','#ffffff','25%','#e060ff','100%','#801aaa');
      d+='</defs>';
      let s='<rect width="160" height="190" fill="url(#bg)"/>';
      // cosmic mist
      s+='<ellipse cx="80" cy="120" rx="85" ry="90" fill="#3010a0" opacity=".08" filter="url(#soft)"/>';
      // broken halo
      s+='<circle cx="80" cy="40" r="46" fill="none" stroke="#c060f8" stroke-width="2.5" opacity=".4" stroke-dasharray="8 4"/>';
      s+='<circle cx="80" cy="40" r="50" fill="none" stroke="#e0a0ff" stroke-width=".8" opacity=".25"/>';
      // tattered wing stubs
      s+='<path d="M14 90 Q-10 60 5 30 Q15 20 25 40 Q18 55 22 78 Z" fill="#604088" opacity=".35"/>';
      s+='<path d="M146 90 Q170 60 155 30 Q145 20 135 40 Q142 55 138 78 Z" fill="#604088" opacity=".35"/>';
      // shoulders (corrupted armor)
      s+='<path d="M0 152 Q30 138 62 148 L60 190 L0 190 Z" fill="#3a1858"/>';
      s+='<path d="M160 152 Q130 138 98 148 L100 190 L160 190 Z" fill="#3a1858"/>';
      s+='<rect x="58" y="148" width="44" height="42" fill="#2a1244"/>';
      // corruption tendrils from face
      s+='<path d="M32 88 Q15 72 8 55" stroke="#a030e0" stroke-width="1.5" fill="none" opacity=".4"/>';
      s+='<path d="M128 88 Q145 72 152 55" stroke="#a030e0" stroke-width="1.5" fill="none" opacity=".4"/>';
      // head
      s+='<ellipse cx="80" cy="88" rx="50" ry="58" fill="url(#sk)"/>';
      s+='<ellipse cx="72" cy="75" rx="32" ry="38" fill="#d0b0e8" opacity=".25"/>';
      // dark corruption marks
      s+='<path d="M45 68 Q55 80 48 96" stroke="#4010a0" stroke-width="2.5" fill="none" opacity=".7"/>';
      s+='<path d="M115 68 Q105 80 112 96" stroke="#4010a0" stroke-width="2.5" fill="none" opacity=".6"/>';
      // eyes
      s+=EYE(55,86,18,15,'url(#ie)',2.5,'#e060ff');
      s+=EYE(105,86,18,15,'url(#ie)',2.5,'#e060ff');
      // nose
      s+='<path d="M75 110 Q80 118 85 110 Q80 105 75 110 Z" fill="#200838"/>';
      // mouth
      s+='<path d="M46 127 Q80 140 114 127" fill="#180828"/>';
      s+='<polygon points="52,127 56,127 54,140" fill="#e8d8ff"/>';
      s+='<polygon points="67,130 71,130 69,143" fill="#e8d8ff"/>';
      s+='<polygon points="80,131 84,131 82,144" fill="#e8d8ff"/>';
      s+='<polygon points="93,130 97,130 95,143" fill="#e8d8ff"/>';
      s+='<polygon points="106,127 110,127 108,140" fill="#e8d8ff"/>';
      if (isBoss) s+=BOSS_BORDER('#e060ff');
      return d+s;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // STAGE 5 — Eye Horror / Soul Reaper
  // ════════════════════════════════════════════════════════════════════════
  if (stage===5) {
    if (!alt) {
      // ── Eye Horror (many eyes) ───────────────────────────────────────
      d+=G_('bg','0%','#050018','60%','#020010','100%','#010008');
      d+=G_('sk','0%','#182858','45%','#0c1a3c','100%','#060e20');
      d+=G_('ie','0%','#ff8040','30%','#c03010','100%','#400c00');
      d+=G_('ie2','0%','#40ff80','30%','#10b030','100%','#005010');
      d+=G_('ie3','0%','#ffff40','30%','#c0a000','100%','#504000');
      d+='</defs>';
      let s='<rect width="160" height="190" fill="url(#bg)"/>';
      // deep void background
      s+='<ellipse cx="80" cy="100" rx="78" ry="88" fill="#0a0a30" opacity=".3"/>';
      s+='<ellipse cx="80" cy="95" rx="62" ry="72" fill="#040420" opacity=".4"/>';
      // tentacle/mass shoulders
      s+='<path d="M0 165 Q40 135 65 152 Q50 175 0 190 Z" fill="url(#sk)"/>';
      s+='<path d="M160 165 Q120 135 95 152 Q110 175 160 190 Z" fill="url(#sk)"/>';
      s+='<rect x="62" y="152" width="36" height="38" fill="url(#sk)"/>';
      // tentacles
      s+='<path d="M30 165 Q20 150 15 130" stroke="#0c1840" stroke-width="8" fill="none" opacity=".6" stroke-linecap="round"/>';
      s+='<path d="M130 165 Q140 150 145 130" stroke="#0c1840" stroke-width="8" fill="none" opacity=".6" stroke-linecap="round"/>';
      s+='<path d="M20 158 Q10 140 18 115" stroke="#0c1840" stroke-width="5" fill="none" opacity=".4" stroke-linecap="round"/>';
      s+='<path d="M140 158 Q150 140 142 115" stroke="#0c1840" stroke-width="5" fill="none" opacity=".4" stroke-linecap="round"/>';
      // main head mass
      s+='<ellipse cx="80" cy="88" rx="58" ry="66" fill="url(#sk)"/>';
      s+='<ellipse cx="80" cy="82" rx="48" ry="54" fill="#101830" opacity=".5"/>';
      // scattered EYES — the main feature
      // Large central pair
      s+=EYE(56,82,18,15,'url(#ie)',3.5,'#ff6020');
      s+=EYE(104,82,18,15,'url(#ie)',3.5,'#ff6020');
      // Medium eyes above
      s+=EYE(36,68,11,9,'url(#ie2)',2.5,'#30ff60');
      s+=EYE(124,68,11,9,'url(#ie2)',2.5,'#30ff60');
      // Small eyes scattered
      s+=EYE(68,56,8,7,'url(#ie3)',2,'#ffff30');
      s+=EYE(92,56,8,7,'url(#ie3)',2,'#ffff30');
      s+=EYE(80,44,7,6,'url(#ie)',1.8,'#ff6020');
      s+=EYE(46,102,9,7,'url(#ie2)',2,'#30ff60');
      s+=EYE(114,102,9,7,'url(#ie3)',2,'#ffff30');
      // tiny eyes
      s+=EYE(28,88,5,4,'url(#ie3)',1.2,'#ffff20');
      s+=EYE(132,85,5,4,'url(#ie2)',1.2,'#30ff60');
      s+=EYE(80,34,5,4,'url(#ie)',1.2,'#ff5020');
      // no nose, just a slit
      s+='<path d="M76 112 Q80 118 84 112 Q80 108 76 112 Z" fill="#030010"/>';
      // wide lipless mouth
      s+='<path d="M38 130 Q80 148 122 130 Q100 165 80 167 Q60 165 38 130 Z" fill="#030010"/>';
      // teeth rows
      for(let i=0;i<8;i++){const tx=43+i*11; s+=`<polygon points="${tx},130 ${tx+5},130 ${tx+2.5},143" fill="#d0c8e8" opacity=".6"/>`;}
      if (isBoss) s+=BOSS_BORDER('#ff6040');
      return d+s;
    } else {
      // ── Soul Reaper ──────────────────────────────────────────────────
      d+=G_('bg','0%','#0a0810','60%','#050408','100%','#020204');
      d+=G_('sk','0%','#4a4060','45%','#28203c','100%','#120e1e');
      d+=G_('ie','0%','#e0e0ff','25%','#8080e0','100%','#202060');
      d+='</defs>';
      let s='<rect width="160" height="190" fill="url(#bg)"/>';
      // shadow aura
      s+='<ellipse cx="80" cy="105" rx="80" ry="95" fill="#1a0a30" opacity=".2" filter="url(#soft)"/>';
      // scythe suggestion in bg
      s+='<path d="M5 10 Q40 -20 80 20 Q120 60 140 120" stroke="#302048" stroke-width="4" fill="none" opacity=".3"/>';
      // hood shape
      s+='<path d="M8 85 Q30 8 80 5 Q130 8 152 85 Q140 148 80 155 Q20 148 8 85 Z" fill="#1e1628"/>';
      s+='<path d="M15 88 Q36 15 80 12 Q124 15 145 88 Q134 148 80 148 Q26 148 15 88 Z" fill="url(#sk)"/>';
      // hood shadow
      s+='<ellipse cx="80" cy="55" rx="42" ry="40" fill="#0e0818" opacity=".7"/>';
      // deep void face in hood shadow
      s+='<ellipse cx="80" cy="90" rx="38" ry="42" fill="#060410" opacity=".6"/>';
      // floating scythe-like horns
      s+='<path d="M25 48 Q8 22 16 8 Q20 2 24 10 Q22 18 30 32 Q35 44 40 52" fill="#1e1628"/>';
      s+='<path d="M135 48 Q152 22 144 8 Q140 2 136 10 Q138 18 130 32 Q125 44 120 52" fill="#1e1628"/>';
      // eyes (white glowing from shadow)
      s+=EYE(55,87,17,13,'url(#ie)',2.5,'#c0c0ff');
      s+=EYE(105,87,17,13,'url(#ie)',2.5,'#c0c0ff');
      // ghost light wisps from eyes
      s+='<ellipse cx="55" cy="72" rx="8" ry="14" fill="#6060e0" opacity=".12" filter="url(#eg)"/>';
      s+='<ellipse cx="105" cy="72" rx="8" ry="14" fill="#6060e0" opacity=".12" filter="url(#eg)"/>';
      // skull-like mouth
      s+='<path d="M50 115 Q80 128 110 115" fill="#040308"/>';
      for(let i=0;i<6;i++){const tx=54+i*10; s+=`<polygon points="${tx},115 ${tx+5},115 ${tx+2.5},126" fill="#c0b8d8" opacity=".5"/>`;}
      // floating souls
      s+='<circle cx="25" cy="65" r="4" fill="#8080e0" opacity=".3" filter="url(#soft)"/>';
      s+='<circle cx="135" cy="72" r="3" fill="#8080e0" opacity=".25" filter="url(#soft)"/>';
      s+='<circle cx="30" cy="130" r="3" fill="#6060c0" opacity=".2" filter="url(#soft)"/>';
      if (isBoss) s+=BOSS_BORDER('#b0a0ff');
      return d+s;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // STAGE 6 — Cosmic Leviathan / Void Devourer
  // ════════════════════════════════════════════════════════════════════════
  if (stage===6) {
    if (!alt) {
      // ── Cosmic Leviathan ─────────────────────────────────────────────
      d+=LG_('bg','0','0','0','100','0%','#040220','50%','#020118','100%','#010010');
      d+=G_('sk','0%','#202868','45%','#101440','100%','#060820');
      d+=G_('ie','0%','#ffffff','15%','#c0d8ff','40%','#4080ff','100%','#001880');
      d+=G_('nebula','0%','#4010a0','50%','#2008b0','100%','#100860');
      d+='</defs>';
      let s='<rect width="160" height="190" fill="url(#bg)"/>';
      // starfield
      const stars=[[12,8],[34,15],[58,5],[90,18],[115,8],[142,14],[8,42],[28,38],[156,40],
                   [145,88],[158,120],[5,105],[18,140],[148,155],[30,168],[140,170]];
      stars.forEach(([x,y])=>s+=`<circle cx="${x}" cy="${y}" r="1" fill="white" opacity=".5"/>`);
      // nebula clouds
      s+='<ellipse cx="30" cy="50" rx="25" ry="20" fill="#3008a8" opacity=".15" filter="url(#soft)"/>';
      s+='<ellipse cx="130" cy="40" rx="22" ry="18" fill="#0820c0" opacity=".15" filter="url(#soft)"/>';
      s+='<ellipse cx="80" cy="15" rx="35" ry="15" fill="#6020a0" opacity=".12" filter="url(#soft)"/>';
      // cosmic body/shoulders
      s+='<ellipse cx="80" cy="200" rx="85" ry="45" fill="url(#sk)"/>';
      s+='<ellipse cx="80" cy="195" rx="70" ry="35" fill="#141840"/>';
      // reality tear across shoulders
      s+='<path d="M5 155 Q45 142 80 148 Q115 142 155 155" stroke="#6040ff" stroke-width="1.5" fill="none" opacity=".5"/>';
      s+='<path d="M12 160 Q40 150 80 154 Q120 150 148 160" stroke="#4020e0" stroke-width=".8" fill="none" opacity=".35"/>';
      // neck (void column)
      s+='<rect x="60" y="140" width="40" height="18" rx="8" fill="#0e1030"/>';
      s+='<ellipse cx="80" cy="148" rx="18" ry="5" fill="#6040ff" opacity=".2" filter="url(#soft)"/>';
      // cosmic head — semi-void
      s+='<ellipse cx="80" cy="85" rx="56" ry="65" fill="url(#sk)"/>';
      s+='<ellipse cx="80" cy="80" rx="46" ry="52" fill="#181e58" opacity=".4"/>';
      // nebula inside face
      s+='<ellipse cx="80" cy="80" rx="38" ry="44" fill="url(#nebula)" opacity=".2"/>';
      // star points on face
      for(let i=0;i<8;i++){
        const a=i/8*Math.PI*2, r=30, x2=80+Math.cos(a)*r, y2=80+Math.sin(a)*r;
        s+=`<circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="1.2" fill="white" opacity=".3"/>`;
      }
      // galaxy eyes (the showpiece)
      s+=EYE(52,82,22,18,'url(#ie)',3,'#80c0ff');
      s+=EYE(108,82,22,18,'url(#ie)',3,'#80c0ff');
      // galaxy spiral inside eyes (simplified)
      s+='<path d="M52 78 Q56 82 52 86 Q48 82 52 78" stroke="#c0e0ff" stroke-width=".6" fill="none" opacity=".6"/>';
      s+='<path d="M108 78 Q112 82 108 86 Q104 82 108 78" stroke="#c0e0ff" stroke-width=".6" fill="none" opacity=".6"/>';
      // no visible nose — void
      s+='<ellipse cx="80" cy="112" rx="8" ry="6" fill="#040218" opacity=".8"/>';
      // cosmic maw
      s+='<path d="M40 128 Q80 148 120 128 Q100 168 80 170 Q60 168 40 128 Z" fill="#040218"/>';
      s+='<ellipse cx="80" cy="150" rx="28" ry="14" fill="#2020a0" opacity=".3" filter="url(#eg)"/>';
      // stars visible through open maw
      for(let i=0;i<6;i++){
        const x2=52+i*12, y2=138+Math.sin(i)*6;
        s+=`<circle cx="${x2}" cy="${y2.toFixed(0)}" r="1.2" fill="white" opacity=".5"/>`;
      }
      if (isBoss) s+=BOSS_BORDER('#6040ff');
      return d+s;
    } else {
      // ── Void Devourer ────────────────────────────────────────────────
      d+=G_('bg','0%','#000010','60%','#00000a','100%','#000005');
      d+=G_('ie','0%','#ff0020','25%','#c00018','100%','#400008');
      d+='</defs>';
      let s='<rect width="160" height="190" fill="url(#bg)"/>';
      // void tendrils from all sides
      s+='<path d="M0 80 Q20 85 0 95" stroke="#200010" stroke-width="12" fill="none"/>';
      s+='<path d="M160 75 Q140 80 160 90" stroke="#200010" stroke-width="10" fill="none"/>';
      s+='<path d="M30 0 Q35 20 28 0" stroke="#200010" stroke-width="8" fill="none"/>';
      s+='<path d="M130 0 Q125 20 132 0" stroke="#200010" stroke-width="8" fill="none"/>';
      // pure void body
      s+='<ellipse cx="80" cy="100" rx="72" ry="85" fill="#000008"/>';
      s+='<ellipse cx="80" cy="200" rx="80" ry="40" fill="#100010"/>';
      s+='<rect x="55" y="148" width="50" height="45" fill="#0a000a"/>';
      // event horizon around head
      s+='<ellipse cx="80" cy="85" rx="65" ry="72" fill="none" stroke="#ff0020" stroke-width=".8" opacity=".25" filter="url(#eg)"/>';
      s+='<ellipse cx="80" cy="85" rx="58" ry="64" fill="none" stroke="#ff0020" stroke-width=".4" opacity=".15"/>';
      // head — almost invisible, hints of form
      s+='<ellipse cx="80" cy="85" rx="54" ry="62" fill="#080008"/>';
      // the red eyes (only visible feature)
      s+=EYE(50,82,22,18,'url(#ie)',4,'#ff1020');
      s+=EYE(110,82,22,18,'url(#ie)',4,'#ff1020');
      // eye glow bleeding into void
      s+='<ellipse cx="50" cy="82" rx="35" ry="30" fill="#c00010" opacity=".06" filter="url(#soft)"/>';
      s+='<ellipse cx="110" cy="82" rx="35" ry="30" fill="#c00010" opacity=".06" filter="url(#soft)"/>';
      // barely visible mouth
      s+='<path d="M42 128 Q80 145 118 128" fill="none" stroke="#400018" stroke-width="2" opacity=".5"/>';
      for(let i=0;i<7;i++){
        const tx=47+i*11;
        s+=`<line x1="${tx}" y1="128" x2="${tx}" y2="140" stroke="#300010" stroke-width="1" opacity=".4"/>`;
      }
      if (isBoss) s+=BOSS_BORDER('#ff1020');
      return d+s;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // STAGE 7 — The Absolute / Omega Fracture
  // ════════════════════════════════════════════════════════════════════════
  if (stage===7) {
    if (!alt) {
      // ── The Absolute (geometric horror) ─────────────────────────────
      d+=LG_('bg','0','0','0','100','0%','#101010','50%','#060606','100%','#000000');
      d+=G_('ie','0%','#000000','100%','#000000');
      d+='</defs>';
      let s='<rect width="160" height="190" fill="url(#bg)"/>';
      // fractal geometry — the "face"
      s+='<polygon points="80,5 150,145 10,145" fill="none" stroke="white" stroke-width=".6" opacity=".8"/>';
      s+='<polygon points="80,25 135,140 25,140" fill="none" stroke="white" stroke-width=".4" opacity=".5"/>';
      s+='<polygon points="80,45 118,135 42,135" fill="none" stroke="white" stroke-width=".3" opacity=".3"/>';
      // inverted
      s+='<polygon points="80,145 10,5 150,5" fill="none" stroke="white" stroke-width=".5" opacity=".6"/>';
      s+='<polygon points="80,125 28,10 132,10" fill="none" stroke="white" stroke-width=".3" opacity=".35"/>';
      // central void circle
      s+='<circle cx="80" cy="75" r="28" fill="#000000"/>';
      s+='<circle cx="80" cy="75" r="28" fill="none" stroke="white" stroke-width=".8" opacity=".9"/>';
      s+='<circle cx="80" cy="75" r="18" fill="none" stroke="white" stroke-width=".4" opacity=".6"/>';
      // eyes — pure void black
      s+='<circle cx="65" cy="72" r="8" fill="white"/><circle cx="65" cy="72" r="7" fill="black"/>';
      s+='<circle cx="95" cy="72" r="8" fill="white"/><circle cx="95" cy="72" r="7" fill="black"/>';
      // horizontal scan lines (glitch)
      for(let i=0;i<12;i++){
        const y2=20+i*14;
        s+=`<line x1="0" y1="${y2}" x2="160" y2="${y2}" stroke="white" stroke-width=".3" opacity="${(.05+Math.abs(Math.sin(i))*0.08).toFixed(2)}"/>`;
      }
      // shattering cracks
      s+='<path d="M80 75 L28 10 L15 30" stroke="white" stroke-width=".5" fill="none" opacity=".6"/>';
      s+='<path d="M80 75 L140 18 L155 38" stroke="white" stroke-width=".5" fill="none" opacity=".5"/>';
      s+='<path d="M80 75 L20 145 L5 165" stroke="white" stroke-width=".5" fill="none" opacity=".6"/>';
      s+='<path d="M80 75 L155 148 L160 170" stroke="white" stroke-width=".5" fill="none" opacity=".5"/>';
      // shoulders area (white geometric)
      s+='<rect x="0" y="155" width="160" height="35" fill="black"/>';
      s+='<line x1="0" y1="155" x2="160" y2="155" stroke="white" stroke-width="1" opacity=".8"/>';
      // void mouth — three lines
      s+='<line x1="50" y1="120" x2="110" y2="120" stroke="white" stroke-width="1.5" opacity=".7"/>';
      s+='<line x1="55" y1="127" x2="105" y2="127" stroke="white" stroke-width=".8" opacity=".5"/>';
      s+='<line x1="60" y1="133" x2="100" y2="133" stroke="white" stroke-width=".5" opacity=".3"/>';
      if (isBoss) s+=BOSS_BORDER('white');
      return d+s;
    } else {
      // ── Omega Fracture ───────────────────────────────────────────────
      d+=LG_('bg','0','0','100','100','0%','#000000','50%','#0c000c','100%','#000000');
      d+=G_('ie','0%','#ff00ff','40%','#8800aa','100%','#220022');
      d+='</defs>';
      let s='<rect width="160" height="190" fill="url(#bg)"/>';
      // reality grid
      for(let i=0;i<9;i++){
        const x2=i*20, op=(.1+Math.abs(Math.sin(i*.7))*.1).toFixed(2);
        s+=`<line x1="${x2}" y1="0" x2="${x2}" y2="190" stroke="#ff00ff" stroke-width=".4" opacity="${op}"/>`;
      }
      for(let i=0;i<10;i++){
        const y2=i*20, op=(.08+Math.abs(Math.cos(i*.6))*.08).toFixed(2);
        s+=`<line x1="0" y1="${y2}" x2="160" y2="${y2}" stroke="#ff00ff" stroke-width=".3" opacity="${op}"/>`;
      }
      // fracture lines
      s+='<path d="M80 0 L62 48 L15 55 L58 90 L44 140" stroke="#ff00ff" stroke-width="1.5" fill="none" opacity=".7"/>';
      s+='<path d="M80 0 L98 48 L145 55 L102 90 L116 140" stroke="#ff00ff" stroke-width="1.5" fill="none" opacity=".7"/>';
      s+='<path d="M0 95 L55 85 L80 95 L105 85 L160 95" stroke="#ff00ff" stroke-width="1" fill="none" opacity=".5"/>';
      // central entity
      s+='<polygon points="80,20 105,85 80,110 55,85" fill="#0a000a"/>';
      s+='<polygon points="80,20 105,85 80,110 55,85" fill="none" stroke="#ff00ff" stroke-width=".8" opacity=".8"/>';
      // eyes
      s+=EYE(62,72,12,10,'url(#ie)',2.5,'#ff00ff');
      s+=EYE(98,72,12,10,'url(#ie)',2.5,'#ff00ff');
      // glitch artifacts
      s+='<rect x="20" y="50" width="40" height="3" fill="#ff00ff" opacity=".12"/>';
      s+='<rect x="100" y="105" width="35" height="2" fill="#ff00ff" opacity=".1"/>';
      s+='<rect x="10" y="130" width="25" height="2" fill="#ff00ff" opacity=".08"/>';
      // shoulders void
      s+='<rect x="0" y="155" width="160" height="35" fill="#0a000a"/>';
      s+='<line x1="0" y1="155" x2="160" y2="155" stroke="#ff00ff" stroke-width="1" opacity=".6"/>';
      // mouth slashes
      s+='<line x1="46" y1="120" x2="114" y2="120" stroke="#ff00ff" stroke-width="1.5" opacity=".6"/>';
      s+='<line x1="52" y1="128" x2="108" y2="128" stroke="#ff00ff" stroke-width=".8" opacity=".4"/>';
      if (isBoss) s+=BOSS_BORDER('#ff00ff');
      return d+s;
    }
  }

  return '';
}


// --- Battle scene render functions ---
function updateHeroSVG() {
  const svg = document.getElementById('hero-svg');
  if (!svg) return;
  // Stage 2: Show army formation instead of hero
  if (G.stage === 2) {
    svg.innerHTML = getArmySVG();
  } else {
    svg.innerHTML = getHeroSVG(G.stage);
  }
  const col = STAGE_COLORS[G.stage];
  const panel = document.getElementById('hero-panel');
  if (panel) panel.style.setProperty('--stage-col', col);
  const nm = document.getElementById('hero-name');
  if (nm) { nm.textContent = STAGE_NAMES[G.stage]; nm.style.color = col; }
  // Gear icons
  const gr = document.getElementById('hero-gear-row');
  if (gr) {
    const w = G.weapons || {};
    let icons = '';
    if (w.sword  > 0) icons += '⚔'.repeat(Math.min(w.sword,3));
    if (w.armor  > 0) icons += '🛡'.repeat(Math.min(w.armor,2));
    if (w.rune   > 0) icons += '💎';
    if (w.autoAttack)  icons += '⚡';
    gr.textContent = icons;
  }
}

function updateMonsterSVG() {
  const isBoss = G.wave % 10 === 0;
  const _names = isBoss ? BOSS_NAMES[G.stage] : ENEMY_NAMES[G.stage];
  const nameIdx = (G.wave - 1) % (_names ? _names.length : 8);
  if (window.PhaserBattle) PhaserBattle.setMonster(G.stage, nameIdx, isBoss);
  const names = isBoss ? BOSS_NAMES[G.stage] : ENEMY_NAMES[G.stage];
  const nameEl = document.getElementById('monster-name-text');
  const bossEl = document.getElementById('boss-badge-portrait');
  if (nameEl && names) nameEl.textContent = names[nameIdx % names.length];
  if (bossEl) bossEl.style.display = isBoss ? 'inline' : 'none';
}

// Hero strike animation
function triggerHeroAttack() {
  const hero = document.getElementById('hero-svg');
  if (hero) {
    hero.classList.remove('hero-strike');
    void hero.offsetWidth;
    hero.classList.add('hero-strike');
    setTimeout(() => hero.classList.remove('hero-strike'), 420);
  }
  setTimeout(() => { if (window.PhaserBattle) PhaserBattle.playHit(); }, 100);
}

// Monster death animation (Phaser)
function triggerMonsterDeath(cb) {
  if (window.PhaserBattle) {
    PhaserBattle.playDeath(() => { updateMonsterSVG(); cb && cb(); });
  } else {
    updateMonsterSVG(); cb && cb();
  }
}

// Hero stage-up flash
function triggerHeroEvolve() {
  const hero = document.getElementById('hero-svg');
  if (!hero) return;
  hero.classList.remove('hero-evolve');
  void hero.offsetWidth;
  updateHeroSVG();
  hero.classList.add('hero-evolve');
  setTimeout(() => hero.classList.remove('hero-evolve'), 800);
}

// ===== HARD RESET =====
function hardReset() {
  if (!confirm('HARD RESET: This will erase ALL progress including Essence and meta-upgrades. Cannot be undone!')) return;
  localStorage.removeItem('ascension_loop_save');
  location.reload();
}

// ===== INIT =====
function init() {
  const loaded = loadGame();
  if (!loaded) {
    // Fresh start — apply auto-start essence upgrade
    G.weapons.autoAttack = G.essenceUpgrades.autoStart;
    G.wave = 1 + (G.essenceUpgrades.waveStart || 0) * 5;
  }

  newWave();
  rebuildUI();

  // Click handler
  document.getElementById('click-btn').addEventListener('click', handleClick);

  // Hard reset button
  document.getElementById('hard-reset-btn').addEventListener('click', hardReset);

  // Reset button
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (G.stage < 7) return;
    if (confirm('Trigger Universal Collapse? This resets your run but you keep Essence!')) {
      triggerCollapse();
    }
  });

  // Start game loop
  requestAnimationFrame(gameLoop);

  // Periodic full UI refresh (every 2s)
  setInterval(() => {
    renderUpgradesPanel();
    renderStageCenter();
    renderMetaPanel();
  }, 2000);

  // Initialize battle scene characters
  updateHeroSVG();
  updateMonsterSVG();
  updateStageBG();

  notify('Welcome to Clicker! Click to begin your journey.');
}

// Start when DOM ready

// ═══════════════════════════════════════════════════════════════════════════
// PHASER INTEGRATION — Background + Monster Scenes
// ═══════════════════════════════════════════════════════════════════════════
(function() {
  let _bgScene = null;
  let _monScene = null;

  // Pending state (set before Phaser scenes are ready)
  window._pendingStage = 1;
  window._pendingMonster = { s: 1, v: 0, b: false };

  window.PhaserBattle = {
    setStage(s) {
      window._pendingStage = s;
      if (_bgScene) _bgScene.setStage(s);
    },
    setMonster(s, v, b) {
      window._pendingMonster = { s, v, b };
      if (_monScene) _monScene.setMonster(s, v, b);
    },
    playHit() { if (_monScene) _monScene.playHit(); },
    playDeath(cb) { if (_monScene) _monScene.playDeath(cb); else { cb && cb(); } },
  };

  // ── BG SCENE ────────────────────────────────────────────────────────────
  class BgScene extends Phaser.Scene {
    constructor() { super('BgScene'); }

    create() {
      _bgScene = this;
      this.t = 0;
      this.stage = 1;
      this.staticGfx = this.add.graphics();
      this.animGfx = this.add.graphics();
      this.particles = [];
      this.setStage(window._pendingStage || 1);
    }

    update(_, delta) {
      this.t += delta / 1000;
      this.animGfx.clear();
      this._drawAnim();
      this._updateParticles(delta / 1000);
    }

    setStage(s) {
      this.stage = s;
      this.particles = [];
      this._drawStatic();
      this._spawnParticles();
    }

    _drawStatic() {
      const g = this.staticGfx, W = this.scale.width, H = this.scale.height;
      g.clear();
      const sky = [
        [0x3a70a0,0x87ceeb,0x5aaa40,0x2a6018], // S1 field
        [0x04081a,0x080e24,0x181828,0x101018], // S2 cave
        [0x010108,0x050215,0x090615,0x050010], // S3 deep cave
        [0x050308,0x0a0810,0x120e18,0x0a0810], // S4 dungeon
        [0x1a0000,0x0d0000,0x200500,0x150000], // S5 hell
        [0x000010,0x000020,0x000005,0x000000], // S6 cosmos
        [0x000000,0x000000,0x020205,0x000000], // S7 void
      ][this.stage - 1];
      g.fillGradientStyle(sky[0], sky[1], sky[2], sky[3], 1);
      g.fillRect(0, 0, W, H);

      switch (this.stage) {
        case 1: this._s1Static(g, W, H); break;
        case 2: this._s2Static(g, W, H); break;
        case 3: this._s3Static(g, W, H); break;
        case 4: this._s4Static(g, W, H); break;
        case 5: this._s5Static(g, W, H); break;
        case 6: this._s6Static(g, W, H); break;
        case 7: this._s7Static(g, W, H); break;
      }
    }

    _drawAnim() {
      const g = this.animGfx, t = this.t, W = this.scale.width, H = this.scale.height;
      switch (this.stage) {
        case 1: this._s1Anim(g,W,H,t); break;
        case 2: this._s2Anim(g,W,H,t); break;
        case 3: this._s3Anim(g,W,H,t); break;
        case 4: this._s4Anim(g,W,H,t); break;
        case 5: this._s5Anim(g,W,H,t); break;
        case 6: this._s6Anim(g,W,H,t); break;
        case 7: this._s7Anim(g,W,H,t); break;
      }
    }

    // ── Stage 1: Rolling Meadow ──────────────────────────────────────────
    _s1Static(g, W, H) {
      // Far hills
      g.fillStyle(0x2a4820);
      g.fillEllipse(W*0.2, H*0.72, W*0.6, H*0.28);
      g.fillEllipse(W*0.75, H*0.74, W*0.5, H*0.22);
      // Castle silhouette
      const cx = W*0.15, cby = H*0.62;
      g.fillStyle(0x182010);
      g.fillRect(cx-22, cby, 44, H*0.4);
      g.fillRect(cx-28, cby-14, 56, 14);
      for(let i=0;i<6;i++) g.fillRect(cx-28+i*10, cby-24, 7, 11);
      g.fillRect(cx-9, cby-50, 18, 56);
      g.fillTriangle(cx-11, cby-50, cx+11, cby-50, cx, cby-70);
      // Near hills + ground
      g.fillStyle(0x3a6828);
      g.fillEllipse(W*0.5, H*0.82, W*0.9, H*0.28);
      g.fillStyle(0x2d5520);
      g.fillRect(0, H*0.86, W, H*0.14);
    }
    _s1Anim(g, W, H, t) {
      // Clouds
      [{x:0.08,y:0.14,w:130,spd:0.025},{x:0.42,y:0.09,w:100,spd:0.018},{x:0.72,y:0.18,w:160,spd:0.03}]
        .forEach(c => {
          const cx = ((c.x + t*c.spd) % 1.4 - 0.2) * W;
          g.fillStyle(0xffffff, 0.85);
          g.fillEllipse(cx, H*c.y, c.w, 38);
          g.fillEllipse(cx-32, H*c.y+6, 80, 28);
          g.fillEllipse(cx+42, H*c.y+5, 72, 26);
        });
      // Sun + rays
      g.fillStyle(0xffff80, 0.9); g.fillCircle(W*0.87, H*0.1, 32);
      for(let i=0;i<8;i++) {
        const a = (i/8)*Math.PI*2 + t*0.15;
        g.lineStyle(2, 0xffff80, 0.25+Math.sin(t+i)*0.1);
        g.lineBetween(W*0.87, H*0.1, W*0.87+Math.cos(a)*56, H*0.1+Math.sin(a)*56);
      }
    }

    // ── Stage 2: Underground Cave ─────────────────────────────────────────
    _s2Static(g, W, H) {
      // Stone wall tiles
      g.fillStyle(0x252535);
      for(let row=0;row<Math.ceil(H/40);row++) {
        const off = (row%2)*40;
        for(let col=0;col<Math.ceil(W/80)+1;col++) {
          g.fillRect(col*80-off+2, row*40+2, 75, 35);
        }
      }
      g.lineStyle(1, 0x0a0a15, 0.8);
      for(let row=0;row<Math.ceil(H/40)+1;row++) {
        const off=(row%2)*40;
        for(let col=0;col<Math.ceil(W/80)+1;col++) g.strokeRect(col*80-off, row*40, 80, 40);
      }
      // Stalactites
      g.fillStyle(0x18182a);
      for(let i=0;i<14;i++) {
        const sx = W*(i+0.5)/14;
        const h = 35+Math.sin(i*1.9)*20;
        g.fillTriangle(sx-14, 0, sx+14, 0, sx, h);
      }
      // Stalagmites
      for(let i=0;i<9;i++) {
        const sx = W*(i+0.5)/9;
        const h = 18+Math.cos(i*2.3)*12;
        g.fillTriangle(sx-9, H, sx+9, H, sx, H-h);
      }
      // Torch brackets
      g.fillStyle(0x604020);
      g.fillRect(W*0.08-4, H*0.42, 8, 28);
      g.fillRect(W*0.92-4, H*0.42, 8, 28);
    }
    _s2Anim(g, W, H, t) {
      [W*0.08, W*0.92].forEach(tx => {
        const fl = 0.8 + Math.sin(t*9+tx)*0.2;
        const ty = H*0.42;
        g.fillStyle(0xff4400, 0.25*fl); g.fillEllipse(tx, ty-16, 32, 52);
        g.fillStyle(0xff8800, 0.5*fl);  g.fillEllipse(tx, ty-9, 20, 36);
        g.fillStyle(0xffcc00, 0.75*fl); g.fillEllipse(tx, ty-2, 10, 20);
        g.fillStyle(0xffffff, 0.5*fl);  g.fillCircle(tx, ty, 3);
        g.fillStyle(0xff6600, 0.04*fl); g.fillEllipse(tx, ty, W*0.35, H*0.35);
      });
      // Drips
      for(let i=0;i<6;i++) {
        const ph = (t*2.2 + i*0.75) % 1;
        const dx = W*(0.1+i*0.16);
        g.fillStyle(0x5599cc, ph*0.7); g.fillCircle(dx, ph*H*0.55+5, 2.5);
      }
    }

    // ── Stage 3: Crystal Cavern ───────────────────────────────────────────
    _s3Static(g, W, H) {
      // Crystal clusters
      const crys = [[0.05,0x00ffcc],[0.14,0x0088ff],[0.85,0x4400ff],[0.94,0x00ffcc],[0.5,0x0088ff]];
      crys.forEach(([xf,cc]) => {
        const cx = W*xf, s = 55+Math.sin(xf*10)*20;
        g.fillStyle(cc, 0.08); g.fillEllipse(cx, H*0.95, s*2.5, s*1.5);
        g.fillStyle(cc, 0.65);
        g.fillTriangle(cx-s*0.4, H, cx+s*0.4, H, cx, H-s*1.6);
        g.fillTriangle(cx-s*0.2, H, cx+s*0.3, H, cx+s*0.1, H-s*0.85);
        g.fillStyle(0xffffff, 0.25);
        g.fillTriangle(cx-s*0.12, H-s*0.25, cx, H-s*1.5, cx-s*0.08, H-s*0.55);
      });
      g.fillStyle(0x050510); g.fillRect(0, H*0.9, W, H*0.1);
      // Background glow pools
      g.fillStyle(0x002244, 0.3); g.fillEllipse(W*0.3, H*0.7, 200, 80);
      g.fillStyle(0x004433, 0.3); g.fillEllipse(W*0.7, H*0.65, 180, 70);
    }
    _s3Anim(g, W, H, t) {
      // Floating bioluminescent particles
      for(let i=0;i<22;i++) {
        const px = W*(((i*0.391+t*0.04+i*0.07)%1.0+1)%1);
        const py = H*(((i*0.619+t*0.025*(i%3+1))%0.85)+0.08);
        const br = 0.4+Math.sin(t*2.5+i)*0.5;
        const cc = [0x00ffcc,0x0088ff,0x8800ff][i%3];
        g.fillStyle(cc, br*0.65); g.fillCircle(px, py, 2.2+Math.sin(t*3+i)*0.8);
      }
      // Crystal pulse overlay
      g.fillStyle(0x00ffcc, 0.02+Math.sin(t*1.5)*0.015); g.fillRect(0,0,W,H);
    }

    // ── Stage 4: Dark Dungeon ─────────────────────────────────────────────
    _s4Static(g, W, H) {
      // Brick walls
      g.fillStyle(0x181418);
      for(let row=0;row<Math.ceil(H/35);row++) {
        const off=(row%2)*45;
        for(let col=0;col<Math.ceil(W/90)+1;col++) g.fillRect(col*90-off+1,row*35+1,88,33);
      }
      g.lineStyle(1,0x0a080a,0.9);
      for(let row=0;row<Math.ceil(H/35)+1;row++) {
        const off=(row%2)*45;
        for(let col=0;col<Math.ceil(W/90)+1;col++) g.strokeRect(col*90-off,row*35,90,35);
      }
      // Stone floor
      g.fillStyle(0x151015); g.fillRect(0,H*0.8,W,H*0.2);
      g.lineStyle(1,0x201820);
      for(let x=0;x<W;x+=55) g.lineBetween(x,H*0.8,x,H);
      for(let y=H*0.8;y<H;y+=35) g.lineBetween(0,y,W,y);
      // Chains
      g.lineStyle(3,0x404040);
      for(let i=0;i<3;i++) {
        const cx = W*(0.18+i*0.32);
        for(let j=0;j<6;j++) { g.fillStyle(0x505050); g.fillEllipse(cx, j*28, 10, 16); }
      }
      // Skull decoration
      g.fillStyle(0xd0c8b0);
      g.fillCircle(W*0.12, H*0.38, 13);
      g.fillStyle(0x0a080a);
      g.fillEllipse(W*0.12-5, H*0.38-2, 7,7); g.fillEllipse(W*0.12+5, H*0.38-2, 7,7);
      for(let i=0;i<4;i++) g.fillRect(W*0.12-6+i*4, H*0.38+8, 3,6);
    }
    _s4Anim(g, W, H, t) {
      [W*0.04, W*0.96].forEach(tx => {
        const fl = 0.8+Math.sin(t*7+tx)*0.2;
        const ty = H*0.48;
        g.fillStyle(0x00ff40,0.18*fl); g.fillEllipse(tx,ty-14,28,48);
        g.fillStyle(0x40ff20,0.4*fl);  g.fillEllipse(tx,ty-7,16,30);
        g.fillStyle(0xccff80,0.7*fl);  g.fillEllipse(tx,ty-2,7,15);
        g.fillStyle(0x003300,0.03*fl); g.fillEllipse(tx,ty,W*0.45,H*0.45);
      });
      // Fog wisps
      for(let i=0;i<5;i++) {
        const fx = (W*(i*0.3+t*0.025*(i%2?1:-1)))%W;
        g.fillStyle(0x100810, 0.18); g.fillEllipse(fx, H*0.88, 220, 42);
      }
    }

    // ── Stage 5: Hellscape ────────────────────────────────────────────────
    _s5Static(g, W, H) {
      // Lava glow
      g.fillStyle(0x200000); g.fillRect(0,H*0.72,W,H*0.28);
      g.fillGradientStyle(0x200000,0x200000,0xff3000,0xff5000,1);
      g.fillRect(0,H*0.8,W,H*0.2);
      // Rock spires
      g.fillStyle(0x0d0000);
      [{x:0.05,h:0.42},{x:0.17,h:0.58},{x:0.81,h:0.46},{x:0.93,h:0.62}].forEach(s => {
        const sx=W*s.x;
        g.fillTriangle(sx-28,H,sx+28,H,sx,H*(1-s.h));
        g.fillTriangle(sx-16,H,sx+14,H,sx+7,H*(1-s.h+0.06));
      });
      // Background demon silhouette
      g.fillStyle(0x100000,0.45);
      g.fillEllipse(W*0.85,H*0.52,58,78);
      g.fillTriangle(W*0.82,H*0.32,W*0.84,H*0.16,W*0.80,H*0.34);
      g.fillTriangle(W*0.88,H*0.32,W*0.86,H*0.16,W*0.90,H*0.34);
    }
    _s5Anim(g, W, H, t) {
      // Lava surface
      for(let i=0;i<11;i++) {
        const lx=W*(i*0.11+(t*0.018*(i%2?1:-1))%1);
        const p=0.28+Math.sin(t*2+i)*0.18;
        g.fillStyle(0xff5000,p*0.55); g.fillEllipse(lx,H*0.84,85,22);
      }
      // Fire columns
      for(let col=0;col<4;col++) {
        const fx=W*(0.08+col*0.28);
        for(let i=0;i<7;i++) {
          const fi=(t*2.5+i*0.18+col)%1;
          const fy=H*0.8-fi*H*0.38;
          const fsz=22*(1-fi)+5;
          g.fillStyle(i%2?0xff3000:0xff7000,(1-fi)*0.55);
          g.fillEllipse(fx+Math.sin(t*3+i)*9, fy, fsz, fsz*1.6);
        }
      }
      // Ash particles
      for(let i=0;i<18;i++) {
        const ax=W*((i*0.179+t*0.025)%1);
        const ay=H*((i*0.137+t*0.013)%0.72);
        g.fillStyle(0x404040,0.38); g.fillCircle(ax,ay,2);
      }
    }

    // ── Stage 6: Deep Space ───────────────────────────────────────────────
    _s6Static(g, W, H) {
      // Static star field
      for(let i=0;i<140;i++) {
        const px=((Math.sin(i*237.1)*W)%W+W)%W;
        const py=((Math.cos(i*137.5)*H)%H+H)%H;
        const br=0.25+((i*71)%100)/100*0.75;
        g.fillStyle(0xffffff,br); g.fillCircle(px,py,i%10<2?2:1);
      }
      // Nebula clouds
      [{x:0.22,y:0.3,rx:160,ry:90,c:0x4400ff,a:0.07},{x:0.7,y:0.6,rx:190,ry:110,c:0xff0088,a:0.055},{x:0.5,y:0.2,rx:200,ry:75,c:0x00ffff,a:0.045}]
        .forEach(n=>{
          g.fillStyle(n.c,n.a); g.fillEllipse(W*n.x,H*n.y,n.rx,n.ry);
          g.fillStyle(n.c,n.a*0.45); g.fillEllipse(W*n.x+20,H*n.y+10,n.rx*1.4,n.ry*1.4);
        });
      // Planets
      g.fillStyle(0x8844aa,0.72); g.fillCircle(W*0.82,H*0.18,27);
      g.fillStyle(0x664488,0.45); g.fillEllipse(W*0.82,H*0.18,88,14);
      g.fillStyle(0x8844aa,0.72); g.fillCircle(W*0.82,H*0.18,27);
      g.fillStyle(0x4488ff,0.62); g.fillCircle(W*0.14,H*0.72,16);
    }
    _s6Anim(g, W, H, t) {
      // Twinkling stars
      for(let i=0;i<35;i++) {
        const px=((Math.sin(i*237.1)*W)%W+W)%W;
        const py=((Math.cos(i*137.5)*H)%H+H)%H;
        const tw=0.4+Math.sin(t*2.5+i*0.7)*0.6;
        g.fillStyle(0xffffff,tw); g.fillCircle(px,py,1.5);
      }
      // Shooting star
      const sst=(t*0.28)%1;
      if(sst<0.12) {
        const ss=sst/0.12;
        g.lineStyle(2,0xffffff,1-ss);
        g.lineBetween(W*0.9-ss*W*0.55,H*0.08+ss*H*0.28,W*0.9-ss*W*0.55+28,H*0.08+ss*H*0.28-14);
      }
      // Nebula shimmer
      g.fillStyle(0x8800ff,0.025+Math.sin(t*0.6)*0.018); g.fillEllipse(W*0.22,H*0.3,210,100);
    }

    // ── Stage 7: The Void ─────────────────────────────────────────────────
    _s7Static(g, W, H) {
      g.fillStyle(0x000000); g.fillRect(0,0,W,H);
      // Geometric grid
      g.lineStyle(1,0x0000ff,0.07);
      for(let x=0;x<W;x+=60) g.lineBetween(x,0,x,H);
      for(let y=0;y<H;y+=60) g.lineBetween(0,y,W,y);
      // Radiating cracks
      const cx=W/2, cy=H/2;
      g.lineStyle(1,0x8080ff,0.18);
      for(let i=0;i<16;i++) {
        const a=(i/16)*Math.PI*2;
        const mx=cx+Math.cos(a+0.1)*Math.max(W,H)*0.28, my=cy+Math.sin(a+0.1)*Math.max(W,H)*0.28;
        g.lineBetween(cx,cy,mx,my);
        g.lineBetween(mx,my,cx+Math.cos(a)*Math.max(W,H)*0.9,cy+Math.sin(a)*Math.max(W,H)*0.9);
      }
    }
    _s7Anim(g, W, H, t) {
      const cx=W/2, cy=H/2;
      // Pulsing cracks
      const p=0.08+Math.sin(t*2)*0.08;
      g.lineStyle(1,0xffffff,p);
      for(let i=0;i<16;i++) {
        const a=(i/16)*Math.PI*2;
        g.lineBetween(cx,cy,cx+Math.cos(a)*Math.max(W,H),cy+Math.sin(a)*Math.max(W,H));
      }
      // Absorbed particles
      for(let i=0;i<18;i++) {
        const fi=(t*1.3+i/18)%1;
        const a=(i/18)*Math.PI*2+t*0.18;
        const r=(1-fi)*W*0.48;
        g.fillStyle(0x8080ff,(1-fi)*0.55); g.fillCircle(cx+Math.cos(a)*r,cy+Math.sin(a)*r,3*(1-fi)+1);
      }
      // Central glow
      g.fillStyle(0x4040ff,0.04+Math.sin(t*3)*0.03); g.fillEllipse(cx,cy,280,280);
    }

    // ── Particles ────────────────────────────────────────────────────────
    _spawnParticles() {
      const W=this.scale.width, H=this.scale.height;
      const cfgs=[
        {n:8,c:0xffffff,vx:0.012,vy:-0.025,sz:1.5},
        {n:10,c:0x4488cc,vx:0,vy:-0.03,sz:2},
        {n:20,c:0x00ffcc,vx:0,vy:-0.015,sz:1.8},
        {n:6,c:0x404040,vx:0.01,vy:-0.01,sz:3},
        {n:16,c:0xff4000,vx:0,vy:-0.04,sz:2.5},
        {n:30,c:0x8888ff,vx:0.002,vy:0,sz:1},
        {n:14,c:0x8080ff,vx:0.015,vy:-0.02,sz:2},
      ][this.stage-1];
      this.particles=[];
      for(let i=0;i<cfgs.n;i++) {
        this.particles.push({
          x:Math.random()*W, y:H*0.9+Math.random()*H*0.1,
          vx:(Math.random()-0.5)*cfgs.vx*W, vy:-cfgs.vy*H*(0.4+Math.random()*0.8),
          color:cfgs.c, size:cfgs.sz*(0.5+Math.random()), life:Math.random(),
        });
      }
    }

    _updateParticles(dt) {
      const W=this.scale.width, H=this.scale.height, g=this.animGfx;
      this.particles.forEach(p=>{
        p.x+=p.vx; p.y+=p.vy;
        p.life=Math.min(1,p.life+dt*0.3);
        if(p.y<-10||p.x<-20||p.x>W+20) { p.x=Math.random()*W; p.y=H*0.95; p.life=0; }
        const a=Math.min(p.life,(1-p.life)*3)*0.6;
        if(a>0) { g.fillStyle(p.color,a); g.fillCircle(p.x,p.y,p.size); }
      });
    }
  }

  // ── MONSTER SCENE ────────────────────────────────────────────────────────
  class MonsterScene extends Phaser.Scene {
    constructor() { super('MonsterScene'); }

    create() {
      _monScene = this;
      this.g = this.add.graphics();
      this.t = 0; this.stage=1; this.variant=0; this.isBoss=false;
      this.hitFlash=0; this.dying=false; this.deathParts=[];
      const pm = window._pendingMonster||{s:1,v:0,b:false};
      this.setMonster(pm.s, pm.v, pm.b);
    }

    update(_, delta) {
      const dt=delta/1000;
      this.t+=dt;
      if(this.hitFlash>0) this.hitFlash=Math.max(0,this.hitFlash-dt*8);
      const g=this.g; g.clear();
      const W=this.scale.width, H=this.scale.height;
      const cx=W/2, cy=H*0.48;
      if(this.dying) { this._updateDeath(dt); return; }
      this._drawMonster(g,cx,cy,this.t,this.isBoss);
      if(this.hitFlash>0) {
        g.fillStyle(0xff0000,this.hitFlash*0.35);
        g.fillRect(0,0,W,H);
      }
    }

    setMonster(s,v,b) { this.stage=s; this.enemyType=v; this.isBoss=b; this.dying=false; this.deathParts=[]; }
    playHit() { this.hitFlash=1; this.cameras.main.shake(90,0.009); }

    playDeath(cb) {
      const W=this.scale.width,H=this.scale.height;
      this.dying=true; this.deathParts=[];
      const colors=[0x60ff60,0x4060ff,0x00ffcc,0x9040ff,0xff4000,0x8000ff,0xffffff];
      const col=colors[(this.stage-1)%colors.length];
      for(let i=0;i<28;i++) {
        this.deathParts.push({
          x:W/2+(Math.random()-.5)*70, y:H*0.48+(Math.random()-.5)*70,
          vx:(Math.random()-.5)*340, vy:(Math.random()-.5)*340-90,
          life:1, color:col, size:4+Math.random()*7,
        });
      }
      this.time.delayedCall(380, ()=>{ this.dying=false; cb&&cb(); });
    }

    _updateDeath(dt) {
      const g=this.g;
      this.deathParts.forEach(p=>{
        p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=220*dt; p.life-=dt*2.4;
        if(p.life>0){g.fillStyle(p.color,p.life);g.fillCircle(p.x,p.y,p.size*p.life);}
      });
    }

    _drawMonster(g,cx,cy,t,boss) {
      const sc=boss?1.22:1.0;
      if(this.stage===1){
        // Stage 1: 8 distinct monster types matching ENEMY_NAMES[1]
        const S1=[this._slime,this._goblin,this._skeleton,this._orc,
                  this._troll,this._dragonWhelp,this._shadow,this._demon];
        const fn=(S1[this.enemyType%8]||this._slime).bind(this);
        // Demon in s1 is a mini version
        const scMod=(this.enemyType%8===7)?0.78:1.0;
        fn(g,cx,cy,t,boss,sc*scMod);
      } else {
        switch(this.stage){
          case 2: this._bat(g,cx,cy,t,boss,sc); break;
          case 3: this._crystalGolem(g,cx,cy,t,boss,sc); break;
          case 4: this._wraith(g,cx,cy,t,boss,sc); break;
          case 5: this._demon(g,cx,cy,t,boss,sc); break;
          case 6: this._voidEntity(g,cx,cy,t,boss,sc); break;
          case 7: this._singularity(g,cx,cy,t,boss,sc); break;
        }
      }
    }


    // ── S1 type 1: Goblin ──────────────────────────────────────────────────
    _goblin(g,cx,cy,t,boss,sc){
      const bob=Math.sin(t*2.6)*5, y=cy+5+bob;
      const gc=boss?0x1a6a00:0x3aaa18, dk=boss?0x0d3a00:0x1d6008;
      g.fillStyle(0x000000,0.2); g.fillEllipse(cx,cy+52*sc,56*sc,10*sc);
      // Legs
      g.fillStyle(dk);
      g.fillRect(cx-14*sc,y+22*sc,11*sc,22*sc); g.fillRect(cx+3*sc,y+22*sc,11*sc,22*sc);
      g.fillStyle(0x2a1808);
      g.fillRect(cx-16*sc,y+40*sc,16*sc,9*sc); g.fillRect(cx+0*sc,y+40*sc,16*sc,9*sc);
      // Body
      g.fillStyle(gc); g.fillEllipse(cx,y+10*sc,42*sc,38*sc);
      // Arms
      const as=Math.sin(t*2.6)*9;
      g.fillStyle(gc);
      g.fillRect(cx-26*sc,y-2*sc+as,11*sc,18*sc); g.fillRect(cx+15*sc,y-2*sc-as,11*sc,18*sc);
      g.fillStyle(dk); g.fillCircle(cx-20*sc,y+16*sc+as,6*sc); g.fillCircle(cx+20*sc,y+16*sc-as,6*sc);
      // Club
      const cs=Math.sin(t*2.6+0.6)*12;
      g.fillStyle(0x5a3010); g.fillRect(cx+22*sc,y-8*sc-cs,7*sc,26*sc);
      g.fillStyle(0x3a2008); g.fillCircle(cx+25*sc,y-12*sc-cs,10*sc);
      // Big ears
      g.fillStyle(gc);
      g.fillTriangle(cx-20*sc,y-28*sc,cx-38*sc,y-52*sc,cx-10*sc,y-36*sc);
      g.fillTriangle(cx+20*sc,y-28*sc,cx+38*sc,y-52*sc,cx+10*sc,y-36*sc);
      g.fillStyle(boss?0x60ff40:0xff9090,0.35);
      g.fillTriangle(cx-20*sc,y-30*sc,cx-36*sc,y-50*sc,cx-11*sc,y-37*sc);
      g.fillTriangle(cx+20*sc,y-30*sc,cx+36*sc,y-50*sc,cx+11*sc,y-37*sc);
      // Head
      g.fillStyle(gc); g.fillEllipse(cx,y-22*sc,44*sc,40*sc);
      // Eyes
      g.fillStyle(boss?0xff2000:0xffee00);
      g.fillCircle(cx-10*sc,y-24*sc,6*sc); g.fillCircle(cx+10*sc,y-24*sc,6*sc);
      g.fillStyle(0x000000);
      g.fillCircle(cx-10*sc,y-24*sc,3*sc); g.fillCircle(cx+10*sc,y-24*sc,3*sc);
      g.fillStyle(0xffffff,0.7); g.fillCircle(cx-8*sc,y-26*sc,1.5*sc); g.fillCircle(cx+12*sc,y-26*sc,1.5*sc);
      // Nose
      g.fillStyle(dk,0.7); g.fillEllipse(cx,y-18*sc,10*sc,7*sc);
      // Teeth
      g.fillStyle(0xddd8b0);
      g.fillRect(cx-6*sc,y-12*sc,4*sc,5*sc); g.fillRect(cx+2*sc,y-12*sc,4*sc,5*sc);
      if(boss){
        g.fillStyle(0x804000);
        g.fillTriangle(cx-12*sc,y-40*sc,cx-20*sc,y-60*sc,cx-4*sc,y-42*sc);
        g.fillTriangle(cx+12*sc,y-40*sc,cx+20*sc,y-60*sc,cx+4*sc,y-42*sc);
      }
    }

    // ── S1 type 2: Skeleton ────────────────────────────────────────────────
    _skeleton(g,cx,cy,t,boss,sc){
      const bob=Math.sin(t*1.8)*4, y=cy+5+bob;
      const bone=boss?0xfffde8:0xf0ead8, dk=boss?0xd0c0a0:0xc8bca0;
      g.fillStyle(0x000000,0.18); g.fillEllipse(cx,cy+56*sc,50*sc,10*sc);
      // Leg bones
      g.fillStyle(bone);
      g.fillRect(cx-13*sc,y+20*sc,7*sc,28*sc); g.fillRect(cx+6*sc,y+20*sc,7*sc,28*sc);
      g.fillStyle(dk); g.fillCircle(cx-10*sc,y+30*sc,5*sc); g.fillCircle(cx+10*sc,y+30*sc,5*sc);
      g.fillStyle(bone);
      g.fillEllipse(cx-10*sc,y+48*sc,13*sc,7*sc); g.fillEllipse(cx+10*sc,y+48*sc,13*sc,7*sc);
      // Pelvis
      g.fillStyle(dk,0.8); g.fillEllipse(cx,y+18*sc,26*sc,11*sc);
      // Spine
      g.fillStyle(bone);
      for(let i=0;i<5;i++) g.fillRect(cx-3*sc,y+6*sc-i*7*sc,6*sc,5*sc);
      // Ribs
      g.lineStyle(1.8*sc,bone,0.88);
      for(let i=0;i<4;i++){
        const ry=y-2*sc-i*6.5*sc;
        g.lineBetween(cx-3*sc,ry,cx-18*sc,ry+4*sc);
        g.lineBetween(cx+3*sc,ry,cx+18*sc,ry+4*sc);
      }
      // Arms
      const as=Math.sin(t*1.8)*11;
      g.fillStyle(bone);
      g.fillRect(cx-27*sc,y-24*sc+as,6*sc,22*sc); g.fillRect(cx+21*sc,y-24*sc-as,6*sc,22*sc);
      g.fillStyle(dk); g.fillCircle(cx-20*sc,y-28*sc,4*sc); g.fillCircle(cx+20*sc,y-28*sc,4*sc);
      // Skull
      g.fillStyle(bone); g.fillEllipse(cx,y-40*sc,42*sc,44*sc);
      // Eye sockets
      g.fillStyle(0x000000);
      g.fillEllipse(cx-11*sc,y-43*sc,14*sc,12*sc); g.fillEllipse(cx+11*sc,y-43*sc,14*sc,12*sc);
      // Eye glow
      const eg=0.55+Math.sin(t*3.1)*0.45;
      g.fillStyle(boss?0xff2020:0x20ff80,eg);
      g.fillEllipse(cx-11*sc,y-43*sc,8*sc,7*sc); g.fillEllipse(cx+11*sc,y-43*sc,8*sc,7*sc);
      // Nasal cavity
      g.fillStyle(0x000000,0.65); g.fillTriangle(cx-3*sc,y-33*sc,cx+3*sc,y-33*sc,cx,y-27*sc);
      // Jaw + teeth
      g.fillStyle(bone); g.fillRect(cx-13*sc,y-22*sc,26*sc,6*sc);
      g.fillStyle(0x000000,0.45);
      for(let i=0;i<4;i++) g.fillRect(cx-11*sc+i*6*sc,y-22*sc,2.5*sc,6*sc);
      if(boss){
        // Lich crown
        g.fillStyle(0xd4a800);
        g.fillRect(cx-18*sc,y-63*sc,36*sc,7*sc);
        for(let i=0;i<5;i++) g.fillTriangle(cx-16*sc+i*8*sc,y-63*sc,cx-12*sc+i*8*sc,y-63*sc,cx-14*sc+i*8*sc,y-76*sc);
        // Purple gems in crown
        g.fillStyle(0xaa00ff);
        for(let i=0;i<3;i++) g.fillCircle(cx-10*sc+i*10*sc,y-60*sc,3*sc);
      }
    }

    // ── S1 type 3: Orc ────────────────────────────────────────────────────
    _orc(g,cx,cy,t,boss,sc){
      const bob=Math.sin(t*1.4)*3, y=cy+8+bob;
      const oc=boss?0x1a6000:0x2e8a18, dk=boss?0x0d3800:0x1a5010;
      g.fillStyle(0x000000,0.25); g.fillEllipse(cx,cy+58*sc,72*sc,13*sc);
      // Boots
      g.fillStyle(0x3a2010);
      g.fillRect(cx-22*sc,y+44*sc,20*sc,12*sc); g.fillRect(cx+2*sc,y+44*sc,20*sc,12*sc);
      // Legs
      g.fillStyle(dk);
      g.fillRect(cx-20*sc,y+24*sc,16*sc,26*sc); g.fillRect(cx+4*sc,y+24*sc,16*sc,26*sc);
      // Belt
      g.fillStyle(0x3a2010); g.fillRect(cx-24*sc,y+18*sc,48*sc,8*sc);
      g.fillStyle(0xcccc00); g.fillRect(cx-4*sc,y+19*sc,8*sc,6*sc);
      // Body (massive)
      g.fillStyle(oc); g.fillEllipse(cx,y+6*sc,70*sc,52*sc);
      g.lineStyle(2,dk,0.32);
      g.lineBetween(cx,y-4*sc,cx,y+24*sc);
      g.lineBetween(cx-24*sc,y+2*sc,cx,y+8*sc); g.lineBetween(cx+24*sc,y+2*sc,cx,y+8*sc);
      // Arms
      const as=Math.sin(t*1.4)*8;
      g.fillStyle(oc);
      g.fillEllipse(cx-42*sc,y+as,22*sc,38*sc); g.fillEllipse(cx+42*sc,y-as,22*sc,38*sc);
      g.fillStyle(dk); g.fillCircle(cx-42*sc,y+18*sc+as,11*sc); g.fillCircle(cx+42*sc,y+18*sc-as,11*sc);
      // Shoulder pads
      g.fillStyle(0x505060);
      g.fillEllipse(cx-32*sc,y-12*sc,22*sc,13*sc); g.fillEllipse(cx+32*sc,y-12*sc,22*sc,13*sc);
      g.fillStyle(0x707080,0.55);
      g.fillTriangle(cx-26*sc,y-18*sc,cx-40*sc,y-18*sc,cx-33*sc,y-28*sc);
      g.fillTriangle(cx+26*sc,y-18*sc,cx+40*sc,y-18*sc,cx+33*sc,y-28*sc);
      // Head
      g.fillStyle(oc); g.fillEllipse(cx,y-28*sc,50*sc,46*sc);
      g.fillStyle(dk,0.65); g.fillEllipse(cx,y-36*sc,44*sc,13*sc);
      // Eyes
      g.fillStyle(boss?0xff2000:0xffcc00);
      g.fillCircle(cx-12*sc,y-32*sc,6*sc); g.fillCircle(cx+12*sc,y-32*sc,6*sc);
      g.fillStyle(0x000000); g.fillCircle(cx-11*sc,y-32*sc,3*sc); g.fillCircle(cx+13*sc,y-32*sc,3*sc);
      // Tusks
      g.fillStyle(0xeeddbb);
      g.fillTriangle(cx-10*sc,y-14*sc,cx-4*sc,y-14*sc,cx-7*sc,y-2*sc);
      g.fillTriangle(cx+4*sc,y-14*sc,cx+10*sc,y-14*sc,cx+7*sc,y-2*sc);
      // Axe
      const aSwing=Math.sin(t*1.4+1)*10;
      g.fillStyle(0x606060); g.fillRect(cx+46*sc,y-28*sc-aSwing,5*sc,44*sc);
      g.fillStyle(0x909090);
      g.fillTriangle(cx+42*sc,y-22*sc-aSwing,cx+64*sc,y-34*sc-aSwing,cx+64*sc,y-8*sc-aSwing);
      if(boss){
        g.fillStyle(0x505060);
        g.fillRect(cx-24*sc,y-52*sc,48*sc,13*sc);
        g.fillStyle(0x707080);
        g.fillTriangle(cx-22*sc,y-52*sc,cx-30*sc,y-76*sc,cx-14*sc,y-52*sc);
        g.fillTriangle(cx+14*sc,y-52*sc,cx+22*sc,y-76*sc,cx+30*sc,y-52*sc);
      }
    }

    // ── S1 type 4: Troll ──────────────────────────────────────────────────
    _troll(g,cx,cy,t,boss,sc){
      const bob=Math.sin(t*1.1)*3, y=cy+12+bob;
      const tc=boss?0x506070:0x6a7e82, dk=boss?0x2a3040:0x445058, lt=boss?0x80a0c0:0x9ab4ba;
      g.fillStyle(0x000000,0.28); g.fillEllipse(cx,cy+60*sc,86*sc,15*sc);
      // Feet
      g.fillStyle(dk);
      g.fillEllipse(cx-16*sc,y+60*sc,30*sc,13*sc); g.fillEllipse(cx+16*sc,y+60*sc,30*sc,13*sc);
      // Legs
      g.fillStyle(dk);
      g.fillRect(cx-24*sc,y+32*sc,21*sc,30*sc); g.fillRect(cx+3*sc,y+32*sc,21*sc,30*sc);
      // Body
      g.fillStyle(tc); g.fillEllipse(cx,y+14*sc,88*sc,66*sc);
      // Rocky texture
      g.fillStyle(lt,0.25);
      g.fillCircle(cx-22*sc,y+8*sc,13*sc); g.fillCircle(cx+18*sc,y+18*sc,10*sc);
      g.fillCircle(cx-6*sc,y+24*sc,11*sc); g.fillCircle(cx+28*sc,y,8*sc);
      g.fillStyle(dk,0.18);
      g.fillCircle(cx-30*sc,y+20*sc,8*sc); g.fillCircle(cx+10*sc,y+6*sc,6*sc);
      // Arms dragging
      g.fillStyle(tc);
      g.fillEllipse(cx-52*sc,y+22*sc,26*sc,40*sc); g.fillEllipse(cx+52*sc,y+22*sc,26*sc,40*sc);
      g.fillStyle(dk);
      g.fillEllipse(cx-52*sc,y+44*sc,22*sc,11*sc); g.fillEllipse(cx+52*sc,y+44*sc,22*sc,11*sc);
      // Head (square)
      g.fillStyle(tc); g.fillEllipse(cx,y-30*sc,66*sc,56*sc);
      g.fillStyle(dk,0.55); g.fillRect(cx-28*sc,y-40*sc,56*sc,13*sc);
      // Eyes
      g.fillStyle(boss?0xff3000:0xddaa00);
      g.fillCircle(cx-14*sc,y-36*sc,7*sc); g.fillCircle(cx+14*sc,y-36*sc,7*sc);
      g.fillStyle(0x000000); g.fillCircle(cx-13*sc,y-36*sc,3.5*sc); g.fillCircle(cx+15*sc,y-36*sc,3.5*sc);
      // Nose
      g.fillStyle(dk); g.fillEllipse(cx,y-22*sc,22*sc,13*sc);
      g.fillStyle(0x000000,0.5); g.fillCircle(cx-6*sc,y-22*sc,3.5*sc); g.fillCircle(cx+6*sc,y-22*sc,3.5*sc);
      // Mouth + jagged teeth
      g.fillStyle(dk,0.8); g.fillRect(cx-18*sc,y-11*sc,36*sc,8*sc);
      g.fillStyle(0xddddcc);
      for(let i=0;i<4;i++) g.fillTriangle(cx-14*sc+i*10*sc,y-11*sc,cx-10*sc+i*10*sc,y-11*sc,cx-12*sc+i*10*sc,y-5*sc);
      if(boss){
        g.fillStyle(0x404050);
        for(let i=0;i<5;i++){
          const sx=cx-24*sc+i*12*sc;
          g.fillTriangle(sx-5*sc,y-24*sc,sx+5*sc,y-24*sc,sx,y-46*sc);
        }
      }
    }

    // ── S1 type 5: Dragon Whelp ────────────────────────────────────────────
    _dragonWhelp(g,cx,cy,t,boss,sc){
      const bob=Math.sin(t*3.1)*6, y=cy+8+bob;
      const dc=boss?0xa02800:0xe05018, dk=boss?0x601800:0x902808, sc2=boss?0xcc3010:0xff7040;
      g.fillStyle(0x000000,0.2); g.fillEllipse(cx,cy+54*sc,60*sc,11*sc);
      // Wings flapping
      const flap=Math.sin(t*6)*18;
      g.fillStyle(boss?0x600000:0x9a2010,0.82);
      g.fillTriangle(cx-18*sc,y-8*sc,cx-66*sc,y-flap*sc-20*sc,cx-32*sc,y+22*sc);
      g.fillTriangle(cx-20*sc,y-12*sc,cx-66*sc,y-flap*sc-20*sc,cx-50*sc,y-flap*sc-2*sc);
      g.fillTriangle(cx+18*sc,y-8*sc,cx+66*sc,y-flap*sc-20*sc,cx+32*sc,y+22*sc);
      g.fillTriangle(cx+20*sc,y-12*sc,cx+66*sc,y-flap*sc-20*sc,cx+50*sc,y-flap*sc-2*sc);
      g.lineStyle(1,dk,0.32);
      g.lineBetween(cx-18*sc,y-8*sc,cx-66*sc,y-flap*sc-20*sc);
      g.lineBetween(cx+18*sc,y-8*sc,cx+66*sc,y-flap*sc-20*sc);
      // Tail
      g.fillStyle(dc);
      g.fillEllipse(cx-22*sc,y+26*sc,18*sc,13*sc);
      g.fillEllipse(cx-32*sc,y+34*sc,13*sc,10*sc);
      g.fillEllipse(cx-40*sc,y+40*sc,9*sc,7*sc);
      g.fillStyle(sc2); g.fillTriangle(cx-18*sc,y+22*sc,cx-26*sc,y+22*sc,cx-22*sc,y+15*sc);
      // Body
      g.fillStyle(dc); g.fillEllipse(cx,y+8*sc,50*sc,42*sc);
      g.fillStyle(boss?0xd06040:0xffa070,0.65); g.fillEllipse(cx+4*sc,y+12*sc,28*sc,24*sc);
      // Scales
      g.fillStyle(sc2,0.38);
      for(let i=0;i<6;i++) g.fillCircle(cx-14*sc+(i%3)*14*sc,y+2*sc+Math.floor(i/3)*10*sc,5*sc);
      // Legs
      g.fillStyle(dk);
      g.fillRect(cx-20*sc,y+26*sc,9*sc,16*sc); g.fillRect(cx+11*sc,y+26*sc,9*sc,16*sc);
      g.fillStyle(0xddddbb);
      g.fillTriangle(cx-20*sc,y+42*sc,cx-13*sc,y+42*sc,cx-17*sc,y+50*sc);
      g.fillTriangle(cx+11*sc,y+42*sc,cx+18*sc,y+42*sc,cx+14*sc,y+50*sc);
      // Neck+head
      g.fillStyle(dc); g.fillEllipse(cx+14*sc,y-16*sc,24*sc,32*sc);
      g.fillEllipse(cx+18*sc,y-36*sc,40*sc,32*sc);
      g.fillStyle(dk); g.fillEllipse(cx+22*sc,y-30*sc,22*sc,14*sc);
      g.fillStyle(0x000000,0.45);
      g.fillCircle(cx+14*sc,y-32*sc,2.5*sc); g.fillCircle(cx+24*sc,y-32*sc,2.5*sc);
      g.fillStyle(boss?0xff4000:0xffcc00); g.fillCircle(cx+8*sc,y-40*sc,8*sc);
      g.fillStyle(0x000000); g.fillCircle(cx+9*sc,y-40*sc,4*sc);
      g.fillStyle(0xffffff,0.8); g.fillCircle(cx+7*sc,y-42*sc,2*sc);
      g.fillStyle(dk);
      g.fillTriangle(cx+6*sc,y-50*sc,cx+16*sc,y-50*sc,cx+11*sc,y-66*sc);
      if(boss){
        // Fire breath
        const fi=(t*2.2)%1;
        g.fillStyle(0xff6000,(1-fi)*0.55); g.fillCircle(cx+40*sc+fi*18,y-28*sc,(18-fi*12)*sc);
        g.fillStyle(0xffee00,(1-fi)*0.3); g.fillCircle(cx+44*sc+fi*14,y-28*sc,(9-fi*6)*sc);
      }
    }

    // ── S1 type 6: Shadow ─────────────────────────────────────────────────
    _shadow(g,cx,cy,t,boss,sc){
      const fl=Math.sin(t*2.1)*8, y=cy+fl;
      const pulse=0.55+Math.sin(t*3.4)*0.45;
      const bodyCol=boss?0x200040:0x0a0015, glowCol=boss?0x6600cc:0x330066;
      // Outer glow
      g.fillStyle(boss?0x4400aa:0x220055,0.16+Math.sin(t*2)*0.08);
      g.fillEllipse(cx,y,150*sc,140*sc);
      // Wispy tendrils below
      for(let i=0;i<6;i++){
        const wave=Math.sin(t*2.5+i*1.1)*13*sc;
        g.fillStyle(glowCol,(0.5-i*0.07)*pulse);
        g.fillEllipse(cx+wave+(i-2.5)*13*sc,y+42*sc+i*5*sc,(18-i*2.5)*sc,16*sc);
      }
      // Body silhouette
      g.fillStyle(bodyCol);
      g.fillEllipse(cx,y+10*sc,70*sc,80*sc);
      g.fillEllipse(cx,y-28*sc,56*sc,52*sc);
      // Soft glow border
      g.fillStyle(boss?0x8800ff:0x440088,0.2*pulse);
      g.fillEllipse(cx,y+10*sc,82*sc,92*sc);
      g.fillEllipse(cx,y-28*sc,66*sc,60*sc);
      // Claws
      for(let side=-1;side<=1;side+=2){
        const ax=cx+side*38*sc, ay=y+2*sc;
        g.fillStyle(boss?0x5500bb:0x280044,0.88);
        g.fillEllipse(ax,ay,18*sc,28*sc);
        for(let c=0;c<3;c++) g.fillTriangle(ax+(c-1)*7*sc,ay+13*sc,ax+(c-1)*7*sc+4*sc,ay+13*sc,ax+(c-1)*7*sc+2*sc,ay+24*sc);
      }
      // Eye halo
      const eyeC=boss?0xff0044:0xcc00ff, eyeGl=boss?0xff6688:0xbb44ff;
      g.fillStyle(eyeC,0.18*pulse);
      g.fillEllipse(cx-14*sc,y-30*sc,30*sc,20*sc); g.fillEllipse(cx+14*sc,y-30*sc,30*sc,20*sc);
      // Eyes
      g.fillStyle(eyeC,pulse);
      g.fillEllipse(cx-14*sc,y-30*sc,18*sc,12*sc); g.fillEllipse(cx+14*sc,y-30*sc,18*sc,12*sc);
      g.fillStyle(eyeGl,1);
      g.fillEllipse(cx-14*sc,y-30*sc,8*sc,6*sc); g.fillEllipse(cx+14*sc,y-30*sc,8*sc,6*sc);
      if(boss){
        // Spike aura
        g.lineStyle(1.5,0x8800ff,0.55);
        for(let i=0;i<8;i++){
          const a=(i/8)*Math.PI*2+t*0.5;
          g.lineBetween(cx+Math.cos(a)*40*sc,y+Math.sin(a)*36*sc,cx+Math.cos(a)*62*sc,y+Math.sin(a)*56*sc);
        }
      }
    }

        // ── S1: Slime ──────────────────────────────────────────────────────────
    _slime(g,cx,cy,t,boss,sc){
      const bob=Math.sin(t*2.2)*7, sq=1+Math.sin(t*2.2)*0.06;
      const rx=58*sc*sq, ry=44*sc/sq, y=cy+22+bob;
      // Shadow
      g.fillStyle(0x000000,0.25); g.fillEllipse(cx,cy+70*sc,rx*1.6,16);
      // Glow
      g.fillStyle(boss?0x20ff00:0x20c800,0.22); g.fillEllipse(cx,y,rx*2+20,ry*2+20);
      // Body
      g.fillStyle(boss?0x30c000:0x52d035); g.fillEllipse(cx,y,rx*2,ry*2);
      // Highlight
      g.fillStyle(0xc0ff80,0.55); g.fillEllipse(cx-rx*0.2,y-ry*0.3,rx*0.75,ry*0.52);
      // Eyes
      const ey=y-ry*0.1, blink=Math.sin(t*1.15)>0.96?0.08:1;
      g.fillStyle(0xffffff); g.fillCircle(cx-18*sc,ey,12*sc); g.fillCircle(cx+18*sc,ey,12*sc);
      g.fillStyle(boss?0xff2020:0x204080);
      g.fillCircle(cx-16*sc,ey,6*sc*blink); g.fillCircle(cx+20*sc,ey,6*sc*blink);
      g.fillStyle(0xffffff,0.8); g.fillCircle(cx-14*sc,ey-2,2*sc); g.fillCircle(cx+22*sc,ey-2,2*sc);
      if(boss){
        g.fillStyle(0x40ff00,0.9);
        for(let i=0;i<5;i++){
          const a=(-0.55+i*0.28)*Math.PI, px=cx+Math.cos(a)*rx*0.92, py=y+Math.sin(a)*ry*0.88;
          g.fillTriangle(px-7,py,px+7,py,px,py-20);
        }
      }
    }

    // ── S2: Cave Bat ───────────────────────────────────────────────────────
    _bat(g,cx,cy,t,boss,sc){
      const flap=Math.sin(t*9)*26*sc, bob=Math.sin(t*2)*5, y=cy+bob;
      // Wings
      const wc=boss?0x600060:0x303050;
      g.fillStyle(wc);
      g.fillTriangle(cx-20*sc,y,cx-85*sc,y-flap,cx-55*sc,y+32*sc);
      g.fillTriangle(cx-22*sc,y-5,cx-85*sc,y-flap,cx-45*sc,y-flap-8);
      g.fillTriangle(cx+20*sc,y,cx+85*sc,y-flap,cx+55*sc,y+32*sc);
      g.fillTriangle(cx+22*sc,y-5,cx+85*sc,y-flap,cx+45*sc,y-flap-8);
      // Wing veins
      g.lineStyle(1,boss?0xa000a0:0x6060a0,0.35);
      g.lineBetween(cx-20*sc,y,cx-85*sc,y-flap); g.lineBetween(cx+20*sc,y,cx+85*sc,y-flap);
      // Body
      g.fillStyle(boss?0x500040:0x252540); g.fillEllipse(cx,y,50*sc,62*sc);
      // Ears
      g.fillStyle(boss?0x800060:0x404060);
      g.fillTriangle(cx-15*sc,y-28*sc,cx-5*sc,y-52*sc,cx-3*sc,y-28*sc);
      g.fillTriangle(cx+15*sc,y-28*sc,cx+5*sc,y-52*sc,cx+3*sc,y-28*sc);
      g.fillStyle(boss?0xff80ff:0xff8080,0.55);
      g.fillTriangle(cx-13*sc,y-30*sc,cx-6*sc,y-48*sc,cx-4*sc,y-30*sc);
      g.fillTriangle(cx+13*sc,y-30*sc,cx+6*sc,y-48*sc,cx+4*sc,y-30*sc);
      // Eyes
      const ey=y-6;
      g.fillStyle(boss?0xff4000:0xffaa00); g.fillCircle(cx-10*sc,ey,8*sc); g.fillCircle(cx+10*sc,ey,8*sc);
      g.fillStyle(0x000000); g.fillCircle(cx-10*sc,ey,4*sc); g.fillCircle(cx+10*sc,ey,4*sc);
      g.fillStyle(0xffffff,0.75); g.fillCircle(cx-8*sc,ey-2,2*sc); g.fillCircle(cx+12*sc,ey-2,2*sc);
      // Fangs
      g.fillStyle(0xffffff);
      g.fillTriangle(cx-8*sc,y+20*sc,cx-4*sc,y+20*sc,cx-6*sc,y+33*sc);
      g.fillTriangle(cx+4*sc,y+20*sc,cx+8*sc,y+20*sc,cx+6*sc,y+33*sc);
    }

    // ── S3: Crystal Golem ─────────────────────────────────────────────────
    _crystalGolem(g,cx,cy,t,boss,sc){
      const pulse=0.82+Math.sin(t*2.2)*0.18, y=cy+Math.sin(t*1.6)*5;
      const gc=boss?0xff00ff:0x00ffcc;
      // Outer glow
      g.fillStyle(gc,0.12*pulse); g.fillEllipse(cx,y,165*sc,165*sc);
      // Crystal spikes
      g.fillStyle(boss?0xcc00ff:0x00ccff,0.82);
      for(let i=0;i<(boss?10:8);i++){
        const a=(i/(boss?10:8))*Math.PI*2+t*0.22;
        const r=58*sc+Math.sin(t*3.5+i)*9*sc;
        const px=cx+Math.cos(a)*r, py=y+Math.sin(a)*r;
        g.fillTriangle(cx+Math.cos(a+0.14)*26*sc,y+Math.sin(a+0.14)*26*sc,cx+Math.cos(a-0.14)*26*sc,y+Math.sin(a-0.14)*26*sc,px,py);
      }
      // Body
      g.fillStyle(boss?0x3d0060:0x0d2040); g.fillEllipse(cx,y,82*sc,92*sc);
      // Face plate
      g.fillStyle(boss?0x8800cc:0x004488,0.72); g.fillEllipse(cx,y-4*sc,62*sc,56*sc);
      // Eyes grid
      g.fillStyle(gc,pulse);
      [[-14,-9],[-4,-14],[14,-9],[4,-14],[-10,5],[10,5]].forEach(([ex,ey2])=>{
        g.fillCircle(cx+ex*sc,y+ey2*sc,4.5*sc*pulse);
        g.fillStyle(0xffffff,0.5); g.fillCircle(cx+ex*sc-1,y+ey2*sc-1,1.5*sc);
        g.fillStyle(gc,pulse);
      });
      // Inner glow
      g.fillStyle(gc,0.35*pulse); g.fillCircle(cx,y,20*sc);
      g.fillStyle(0xffffff,0.55*pulse); g.fillCircle(cx,y,5*sc);
    }

    // ── S4: Dungeon Wraith ────────────────────────────────────────────────
    _wraith(g,cx,cy,t,boss,sc){
      const float=Math.sin(t*1.9)*11, y=cy+float;
      // Tail wisps
      for(let i=0;i<6;i++){
        const wave=Math.sin(t*2.2+i*0.9)*22*sc;
        const my=y+62*sc+i*18*sc, alpha=(1-i/6)*0.38;
        g.fillStyle(boss?0x8800aa:0x4400aa,alpha);
        g.fillEllipse(cx+wave,my,(42-i*6)*sc,24*sc);
      }
      // Body robe
      g.fillStyle(boss?0x200030:0x100020); g.fillEllipse(cx,y+12*sc,72*sc,92*sc);
      // Hood
      g.fillStyle(boss?0x300040:0x180030); g.fillEllipse(cx,y-24*sc,67*sc,67*sc);
      g.fillStyle(0x000000,0.82); g.fillEllipse(cx,y-14*sc,46*sc,46*sc);
      // Eyes
      const eg=0.65+Math.sin(t*3.2)*0.35;
      g.fillStyle(boss?0xff0044:0xaa00ff,eg);
      g.fillEllipse(cx-13*sc,y-20*sc,17*sc,10*sc); g.fillEllipse(cx+13*sc,y-20*sc,17*sc,10*sc);
      g.fillStyle(boss?0xff4488:0xcc44ff,eg*0.8);
      g.fillEllipse(cx-13*sc,y-20*sc,8*sc,5*sc); g.fillEllipse(cx+13*sc,y-20*sc,8*sc,5*sc);
      // Chains
      g.lineStyle(2,0x404040);
      for(let i=0;i<3;i++){
        const ox=(i-1)*20*sc;
        for(let j=0;j<4;j++){g.fillStyle(0x505050);g.fillRect(cx+ox-3,y+j*12*sc,6,8);}
      }
      if(boss){
        g.fillStyle(0xddddcc); g.fillEllipse(cx,y-20*sc,33*sc,28*sc);
        g.fillStyle(0x000000); g.fillEllipse(cx-8*sc,y-22*sc,9,9); g.fillEllipse(cx+8*sc,y-22*sc,9,9);
        g.fillStyle(0xff0044,0.8); g.fillEllipse(cx-8*sc,y-22*sc,5,5); g.fillEllipse(cx+8*sc,y-22*sc,5,5);
      }
    }

    // ── S5: Demon ─────────────────────────────────────────────────────────
    _demon(g,cx,cy,t,boss,sc){
      const wp=Math.sin(t*2.2)*16, y=cy+10;
      // Fire aura
      for(let i=0;i<10;i++){
        const a=t*1.6+i*(Math.PI*2/10);
        const r=58*sc+Math.sin(t*3.5+i)*11*sc;
        const fx=cx+Math.cos(a)*r, fy=y+Math.sin(a)*r*0.52;
        g.fillStyle(i%2?0xff4000:0xff8000,0.25+Math.sin(t*4+i)*0.18); g.fillCircle(fx,fy,9*sc);
      }
      // Wings
      g.fillStyle(boss?0x400000:0x200010);
      g.fillTriangle(cx-20*sc,y,cx-95*sc,y-wp-52,cx-52*sc,y+42*sc);
      g.fillTriangle(cx-42*sc,y-10,cx-95*sc,y-wp-52,cx-72*sc,y-wp-18);
      g.fillTriangle(cx+20*sc,y,cx+95*sc,y-wp-52,cx+52*sc,y+42*sc);
      g.fillTriangle(cx+42*sc,y-10,cx+95*sc,y-wp-52,cx+72*sc,y-wp-18);
      g.lineStyle(1,0x800000,0.45);
      g.lineBetween(cx-20*sc,y,cx-95*sc,y-wp-52);
      g.lineBetween(cx+20*sc,y,cx+95*sc,y-wp-52);
      // Body
      g.fillStyle(boss?0x800000:0xa02020); g.fillEllipse(cx,y+5*sc,62*sc,82*sc);
      g.fillStyle(boss?0x600000:0x802020,0.45);
      g.fillEllipse(cx-13*sc,y,22*sc,30*sc); g.fillEllipse(cx+13*sc,y,22*sc,30*sc);
      // Head
      g.fillStyle(boss?0x900000:0xb03030); g.fillEllipse(cx,y-46*sc,52*sc,52*sc);
      // Horns
      g.fillStyle(boss?0x300000:0x401010);
      g.fillTriangle(cx-15*sc,y-56*sc,cx-26*sc,y-92*sc,cx-5*sc,y-58*sc);
      g.fillTriangle(cx+15*sc,y-56*sc,cx+26*sc,y-92*sc,cx+5*sc,y-58*sc);
      // Eyes
      const eb=0.88+Math.sin(t*4.5)*0.12;
      g.fillStyle(0xff8000,eb); g.fillEllipse(cx-13*sc,y-48*sc,15*sc,11*sc); g.fillEllipse(cx+13*sc,y-48*sc,15*sc,11*sc);
      g.fillStyle(0xff2000); g.fillCircle(cx-13*sc,y-48*sc,4.5*sc); g.fillCircle(cx+13*sc,y-48*sc,4.5*sc);
      g.fillStyle(0xffff00,0.8); g.fillCircle(cx-11*sc,y-50*sc,2*sc); g.fillCircle(cx+15*sc,y-50*sc,2*sc);
      // Flame particles
      for(let i=0;i<7;i++){
        const fi=(t*3+i/7)%1;
        const fy2=y+42*sc-fi*85*sc;
        g.fillStyle(i%2?0xff6000:0xff3000,(1-fi)*0.65);
        g.fillEllipse(cx+(Math.sin(t*3+i)*12),fy2,22*(1-fi)+5,28*(1-fi)+4);
      }
    }

    // ── S6: Void Entity ───────────────────────────────────────────────────
    _voidEntity(g,cx,cy,t,boss,sc){
      const y=cy, n=boss?8:6;
      // Outer glow
      g.fillStyle(0x5000a0,0.12+Math.sin(t*2)*0.08); g.fillEllipse(cx,y,165*sc,165*sc);
      // Tentacles
      for(let i=0;i<n;i++){
        const a=(i/n)*Math.PI*2+t*0.32;
        const wave=Math.sin(t*2.2+i)*17;
        const r=65*sc;
        const sx=cx+Math.cos(a)*r, sy=y+Math.sin(a)*r;
        const ex=cx+Math.cos(a+0.5)*(r+40*sc)+Math.cos(a+1.2)*wave;
        const ey2=y+Math.sin(a+0.5)*(r+40*sc)+Math.sin(a+1.2)*wave;
        g.lineStyle(boss?11*sc:8*sc,boss?0x8800ff:0x5500aa,0.82);
        g.lineBetween(sx,sy,ex,ey2);
        g.fillStyle(boss?0xcc00ff:0x8800cc); g.fillCircle(ex,ey2,7*sc);
      }
      // Core body
      g.fillStyle(0x050010); g.fillCircle(cx,y,56*sc);
      // Stars inside
      for(let i=0;i<18;i++){
        const a=(i/18)*Math.PI*2+t*0.12;
        const r2=(((i*31.3)%40)+5)*sc;
        g.fillStyle(0xffffff,(Math.sin(t*2+i)*0.4+0.6));
        g.fillCircle(cx+Math.cos(a)*r2,y+Math.sin(a)*r2,1.5);
      }
      // Orbiting orbs
      const norbs=boss?4:3;
      for(let i=0;i<norbs;i++){
        const a=t*1.6+i*(Math.PI*2/norbs);
        const ox=cx+Math.cos(a)*72*sc, oy=y+Math.sin(a)*42*sc;
        g.fillStyle(boss?0xff00ff:0x8800ff,0.72); g.fillCircle(ox,oy,9*sc);
        g.fillStyle(0xffffff,0.45); g.fillCircle(ox-2,oy-2,3);
      }
      // Multiple eyes
      [[-15,-10],[5,-18],[18,0],[-8,12],[15,15]].forEach(([ex,ey2])=>{
        g.fillStyle(boss?0xff00ff:0x8800ff,0.75+Math.sin(t*3)*0.25);
        g.fillCircle(cx+ex*sc,y+ey2*sc,5.5*sc);
        g.fillStyle(0x000000); g.fillCircle(cx+ex*sc,y+ey2*sc,2*sc);
      });
    }

    // ── S7: Singularity ───────────────────────────────────────────────────
    _singularity(g,cx,cy,t,boss,sc){
      const pulse=0.65+Math.sin(t*3.5)*0.35, y=cy;
      // Reality cracks
      g.lineStyle(1,0xffffff,0.08);
      for(let i=0;i<10;i++){
        const a=(i/10)*Math.PI*2+t*0.06;
        g.lineBetween(cx,y,cx+Math.cos(a)*110*sc,y+Math.sin(a)*110*sc);
      }
      // Rotating rings
      const rings=boss?[
        {r:92*sc,sides:8,c:0x8080ff,spd:0.5},{r:74*sc,sides:6,c:0x4040ff,spd:-0.85},{r:56*sc,sides:4,c:0x0000ff,spd:1.25},
      ]:[
        {r:80*sc,sides:6,c:0x6060ff,spd:0.5},{r:60*sc,sides:4,c:0x4040ff,spd:-0.85},
      ];
      rings.forEach(({r,sides,c,spd})=>{
        g.lineStyle(2,c,0.72); g.beginPath();
        for(let i=0;i<=sides;i++){
          const a=(i/sides)*Math.PI*2+t*spd;
          const px=cx+Math.cos(a)*r, py=y+Math.sin(a)*r;
          i===0?g.moveTo(px,py):g.lineTo(px,py);
        }
        g.closePath(); g.strokePath();
      });
      // Absorption particles
      for(let i=0;i<12;i++){
        const fi=(t*1.6+i/12)%1;
        const a=(i/12)*Math.PI*2;
        const r=82*sc*(1-fi);
        g.fillStyle(0xffffff,(1-fi)*0.8); g.fillCircle(cx+Math.cos(a)*r,y+Math.sin(a)*r,3*(1-fi));
      }
      // Core
      g.fillStyle(0x000000); g.fillCircle(cx,y,40*sc);
      g.fillStyle(0x0000ff,0.28); g.fillCircle(cx,y,34*sc);
      g.fillStyle(0x4040ff,0.5*pulse); g.fillCircle(cx,y,20*sc);
      g.fillStyle(0xffffff,pulse); g.fillCircle(cx,y,boss?12*sc:8*sc);
      g.fillStyle(0xffffff,1); g.fillCircle(cx,y,4*sc);
      // Lens flare
      g.fillStyle(0xffffff,0.22*pulse);
      g.fillRect(cx-65*sc,y-1,130*sc,2); g.fillRect(cx-1,y-65*sc,2,130*sc);
    }
  }

  // ── Launch Phaser games ──────────────────────────────────────────────────
  window.addEventListener('load', function() {
    const bgMount = document.getElementById('stage-bg');
    if (bgMount) {
      new Phaser.Game({
        type: Phaser.CANVAS,
        parent: 'stage-bg',
        backgroundColor: '#000000',
        scene: BgScene,
        scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      });
    }
    const monMount = document.getElementById('monster-panel');
    if (monMount) {
      new Phaser.Game({
        type: Phaser.CANVAS,
        width: 350, height: 280,
        transparent: true,
        parent: 'monster-panel',
        scene: MonsterScene,
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      });
    }
  });
})();

document.addEventListener('DOMContentLoaded', init);
