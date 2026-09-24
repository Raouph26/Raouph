// ─────────────────────────────────────────────────────────────────────────────
// Five worlds, four bosses each, then a world boss that only unlocks when the
// four are dead. Every boss is a recognizable archetype — never a named real
// person: satire that ships, and that nobody's lawyer can pull.
//
// Bosses differ by ARCHETYPE (which moves they own and how they space), not by
// numbers alone — a bigger health bar is not a new fight.
// ─────────────────────────────────────────────────────────────────────────────

export const ARCHETYPES = {
  // slow, enormous, punishes greed. Roll through, hit twice, leave.
  brute:     { moves:['slam','sweep','stomp'],          speed:2.3, cd:[1.05,0.7,0.45], poise:140, scale:2.15 },
  // fast, relentless, parry bait. The fight that teaches timing.
  duelist:   { moves:['doubleSwipe','lunge','slam'],    speed:3.6, cd:[0.72,0.46,0.28], poise:80,  scale:1.65 },
  // closes distance constantly. Punishes healing and hesitation.
  hound:     { moves:['lunge','doubleSwipe'],           speed:4.4, cd:[0.55,0.36,0.22], poise:64,  scale:1.45 },
  // zones you out with wide arcs. Rewards staying inside its reach.
  sweeper:   { moves:['sweep','slam','doubleSwipe'],    speed:2.8, cd:[0.9,0.6,0.4],   poise:105, scale:1.9 },
  // everything, badly telegraphed on purpose — the world-boss archetype.
  sovereign: { moves:['slam','doubleSwipe','lunge','sweep','stomp'],
                                                        speed:3.4, cd:[0.7,0.45,0.25], poise:170, scale:2.45 },
};

const b = (id, name, epithet, archetype, hp, extra = {}) =>
  ({ id, name, epithet, archetype, hp, ...extra });

export const WORLDS = [
  {
    id:'commons', name:'The Grey Commons', look:'ashen',
    blurb:'Where everyone agrees, loudly, about nothing.',
    bosses:[
      b('moderator','THE MODERATOR','keeper of the rules that changed',        'duelist', 620),
      b('commenter','THE COMMENTER','has read the headline',                   'hound',   680),
      b('consensus','THE CONSENSUS','a crowd wearing one face',                'sweeper', 790),
      b('anon','THE ANON','no name, no stake, no mercy',                       'brute',   880),
    ],
    boss: b('discourse','THE DISCOURSE','it was never about the topic',        'sovereign',1750, {look:'ashen'}),
  },
  {
    id:'feed', name:'The Sunken Feed', look:'verdigris',
    blurb:'A swamp that scrolls. Nothing here ever finishes.',
    bosses:[
      b('influencer','THE INFLUENCER','grateful, blessed, sponsored',          'hound',   740),
      b('algorithm','THE ALGORITHM','gives you exactly what you fed it',       'sweeper', 860),
      b('engagement','THE ENGAGEMENT','feeds on the reply, not the post',      'duelist', 820),
      b('archive','THE ARCHIVE','remembers what you deleted',                  'brute',   980),
    ],
    boss: b('drowned','THE DROWNED CHORUS','ten thousand voices, one mouth',   'sovereign',2100, {look:'verdigris'}),
  },
  {
    id:'openplan', name:'The Open Plan', look:'bone',
    blurb:'Flat white light, no shadows, nowhere to sit down.',
    bosses:[
      b('synergy','THE SYNERGY','circles back',                                'duelist', 880),
      b('consultant','THE CONSULTANT','bills for the diagnosis',               'hound',   920),
      b('quarter','THE QUARTER','ends, always, too soon',                      'sweeper', 1010),
      b('restructure','THE RESTRUCTURE','regrets to inform you',               'brute',   1120),
    ],
    boss: b('board','THE BOARD','nine faces, one decision, made already',      'sovereign',2450, {look:'bone'}),
  },
  {
    id:'gilded', name:'The Gilded Cell', look:'sodium',
    blurb:'One warm light on an island. Everything else is dark on purpose.',
    bosses:[
      b('concierge','THE CONCIERGE','has never once said no',                  'hound',   1010),
      b('auditor','THE AUDITOR','finds nothing, every time',                   'duelist', 1080),
      b('donor','THE DONOR','a wing with his name on it',                      'sweeper', 1180),
      b('nda','THE NDA','a mouth sewn shut and paid for',                      'brute',   1290),
    ],
    boss: b('financier','THE FINANCIER','the helicopter is already running',   'sovereign',2900, {look:'sodium'}),
  },
  {
    id:'furnace', name:'The Furnace', look:'ember',
    blurb:'It is burning and everyone is telling you it is fine.',
    bosses:[
      b('prophet','THE PROPHET','has a whitepaper',                            'duelist', 1180),
      b('hustle','THE HUSTLE','sleeps when dead, allegedly',                   'hound',   1240),
      b('growth','THE GROWTH','up and to the right, forever',                  'sweeper', 1360),
      b('runoff','THE RUNOFF','the part nobody priced in',                     'brute',   1480),
    ],
    // the last fight strips the colour out of the game entirely
    boss: b('quiet','THE QUIET','nothing is burning anymore',                  'sovereign',3400, {look:'silhouette'}),
  },
];

export const ALL_FIGHTS = WORLDS.flatMap(w =>
  [...w.bosses.map(x => ({ ...x, world:w.id, look:x.look ?? w.look })),
   { ...w.boss, world:w.id, look:w.boss.look ?? w.look, isWorldBoss:true }]);

export function fightById(id){ return ALL_FIGHTS.find(f => f.id === id); }
export function worldById(id){ return WORLDS.find(w => w.id === id); }
