// Six visual directions. One grammar — flat shading, heavy fog, single key plus
// rim — varied only by palette and light. The HUD and the floor rings stay
// constant across all of them; that's what makes six looks read as one game.

export const LOOKS = {
  ashen: { name:'Ashen',
    fog:0.022, fogCol:0x14161c, bg:0x14161c, exposure:1.05,
    key:2.5, keyCol:0xffe9c4, amb:1.15, ambSky:0x5d6b8a, ambGnd:0x2a231b,
    rim:1.25, rimCol:0x6f93cc, sun:40, ele:52, ground:0x3a3732, pillar:0x3b3733 },

  verdigris: { name:'Verdigris',
    fog:0.031, fogCol:0x16241f, bg:0x16241f, exposure:1.18,
    key:2.3, keyCol:0xc8e08a, amb:1.30, ambSky:0x3f7a68, ambGnd:0x151b12,
    rim:1.70, rimCol:0x2f8f86, sun:305, ele:22, ground:0x32412f, pillar:0x283530 },

  bone: { name:'Bone',
    fog:0.017, fogCol:0xcac4b2, bg:0xcac4b2, exposure:0.88,
    key:1.7, keyCol:0xfff6e2, amb:2.10, ambSky:0xbfb9a6, ambGnd:0x8a8474,
    rim:0.60, rimCol:0xd8d2c0, sun:75, ele:70, ground:0x9a9483, pillar:0xa8a190 },

  sodium: { name:'Sodium',
    fog:0.014, fogCol:0x0d0a07, bg:0x0d0a07, exposure:1.30,
    key:4.0, keyCol:0xffb257, amb:0.38, ambSky:0x3a2a15, ambGnd:0x0a0705,
    rim:0.55, rimCol:0x4a6aa8, sun:118, ele:26, ground:0x2e2620, pillar:0x241e18 },

  ember: { name:'Ember',
    fog:0.026, fogCol:0x160d0c, bg:0x160d0c, exposure:1.25,
    key:1.5, keyCol:0xff8c4a, amb:0.52, ambSky:0x6b2a1c, ambGnd:0x120807,
    rim:3.00, rimCol:0xd1452e, sun:250, ele:17, ground:0x2a1f1c, pillar:0x221816 },

  silhouette: { name:'Silhouette',
    fog:0.040, fogCol:0xb9c3cf, bg:0xb9c3cf, exposure:0.95,
    key:3.3, keyCol:0xffffff, amb:0.22, ambSky:0x8fa2b8, ambGnd:0x1a1a1a,
    rim:0.0, rimCol:0xffffff, sun:190, ele:13, ground:0x232528, pillar:0x191b1e },

  // the hub sits between worlds — its own quiet, neutral look
  hub: { name:'The Lily',
    fog:0.030, fogCol:0x10161b, bg:0x10161b, exposure:1.12,
    key:1.9, keyCol:0xbcd2e8, amb:1.35, ambSky:0x46647e, ambGnd:0x1b201c,
    rim:1.5, rimCol:0x7fd0c0, sun:200, ele:58, ground:0x2b3a38, pillar:0x24302f },
};
