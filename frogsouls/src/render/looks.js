// ─────────────────────────────────────────────────────────────────────────────
// Looks. One grammar — flat shading, heavy fog, a single key light and a rim —
// varied by palette and light only. Each look also grades the final image.
// ─────────────────────────────────────────────────────────────────────────────

export const LOOKS = {
  hub: { fog: 0.028, fogCol: 0x101820, skyTop: 0x05080f, skyHor: 0x1a2a38, exposure: 1.1, fill: 0.32,
    key: 1.9, keyCol: 0xbcd2ff, amb: 1.2, ambSky: 0x4a6a8e, ambGnd: 0x1b221c, rim: 1.6, rimCol: 0x7fd0c0, sun: 200, ele: 42,
    moon: true, bloom: .75, vignette: .55, sat: 1.0, contrast: 1.05, tint: [1, 1, 1] },
  verdigris: { fog: 0.028, fogCol: 0x20362c, skyTop: 0x0e1a15, skyHor: 0x3c5c48, exposure: 1.2, fill: 0.3,
    key: 2.3, keyCol: 0xc8e08a, amb: 1.3, ambSky: 0x3f7a68, ambGnd: 0x151b12, rim: 1.7, rimCol: 0x2f8f86, sun: 305, ele: 24,
    moon: false, bloom: .6, vignette: .5, sat: 1.05, contrast: 1.05, tint: [.96, 1.03, .98] },
  ashen: { fog: 0.024, fogCol: 0x1a1c22, skyTop: 0x0e1016, skyHor: 0x3a3e48, exposure: 1.08, fill: 0.24,
    key: 2.4, keyCol: 0xffe9c4, amb: 1.15, ambSky: 0x5d6b8a, ambGnd: 0x2a231b, rim: 1.3, rimCol: 0x6f93cc, sun: 40, ele: 50,
    moon: false, bloom: .45, vignette: .55, sat: .7, contrast: 1.08, tint: [1, 1, 1.03] },
  bone: { fog: 0.017, fogCol: 0xcac4b2, skyTop: 0xe8e2d0, skyHor: 0xcac4b2, exposure: .9, fill: 0.1,
    key: 1.7, keyCol: 0xfff6e2, amb: 2.1, ambSky: 0xbfb9a6, ambGnd: 0x8a8474, rim: .6, rimCol: 0xd8d2c0, sun: 75, ele: 70,
    moon: false, bloom: .25, vignette: .3, sat: .85, contrast: .98, tint: [1.02, 1, .96] },
  sodium: { fog: 0.02, fogCol: 0x0d0a07, skyTop: 0x050403, skyHor: 0x1c130a, exposure: 1.3, fill: 0.5,
    key: 4.0, keyCol: 0xffb257, amb: .42, ambSky: 0x3a2a15, ambGnd: 0x0a0705, rim: .7, rimCol: 0x4a6aa8, sun: 118, ele: 26,
    moon: false, bloom: .85, vignette: .7, sat: 1.1, contrast: 1.12, tint: [1.05, 1, .92] },
  ember: { fog: 0.026, fogCol: 0x1a0d0b, skyTop: 0x070303, skyHor: 0x3a1208, exposure: 1.25, fill: 0.42,
    key: 1.6, keyCol: 0xff8c4a, amb: .55, ambSky: 0x6b2a1c, ambGnd: 0x120807, rim: 3.0, rimCol: 0xd1452e, sun: 250, ele: 18,
    moon: false, bloom: .9, vignette: .62, sat: 1.12, contrast: 1.1, tint: [1.06, .97, .92] },
  silhouette: { fog: 0.04, fogCol: 0xb9c3cf, skyTop: 0xdfe6ee, skyHor: 0xb9c3cf, exposure: .95, fill: 0,
    key: 3.3, keyCol: 0xffffff, amb: .2, ambSky: 0x8fa2b8, ambGnd: 0x1a1a1a, rim: 0, rimCol: 0xffffff, sun: 190, ele: 13,
    moon: false, bloom: .35, vignette: .35, sat: .15, contrast: 1.25, tint: [1, 1, 1.02] },
};
