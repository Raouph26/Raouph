// ─────────────────────────────────────────────────────────────────────────────
// Looks. One grammar — flat shading, heavy fog, a single key light and a rim —
// varied by palette and light only. Each look also grades the final image.
// ─────────────────────────────────────────────────────────────────────────────

export const LOOKS = {
  // moonlit hub: deep blue night, a big pale moon, lanterns do the rest
  hub: { fog: 0.022, fogCol: 0x1a2638, skyTop: 0x040914, skyHor: 0x2a3a58, exposure: 1.15, fill: 0.3,
    key: 2.1, keyCol: 0xb8ccff, amb: 1.3, ambSky: 0x4f6f9e, ambGnd: 0x1b1f22, rim: 1.8, rimCol: 0x8fd8ff, sun: 200, ele: 30,
    moon: true, sunVis: .35, glow: 0x3a5a8a, cloud: .45, cloudCol: 0x5a6f96, cloudShade: 0x10182a,
    bloom: .8, vignette: .5, sat: 1.05, contrast: 1.06, tint: [1, 1, 1.02] },
  // the pond at golden hour: low warm sun through green haze
  verdigris: { fog: 0.016, fogCol: 0x6f8a70, skyTop: 0x2f6488, skyHor: 0xe8c08a, exposure: 1.12, fill: 0.26,
    key: 3.4, keyCol: 0xffc47e, amb: 1.25, ambSky: 0x7fb0c0, ambGnd: 0x3a3421, rim: 1.4, rimCol: 0x9fe0c8, sun: 205, ele: 11,
    moon: false, sunVis: .8, glow: 0xff9448, cloud: .55, cloudCol: 0xffe2c0, cloudShade: 0x5a6a80,
    bloom: .7, vignette: .42, sat: 1.12, contrast: 1.06, tint: [1.03, 1.0, .95] },
  // the comment section: a storm at dusk, cold light, bruised clouds
  ashen: { fog: 0.02, fogCol: 0x3a4256, skyTop: 0x141c32, skyHor: 0x7888a8, exposure: 1.1, fill: 0.28,
    key: 2.8, keyCol: 0xe4ecff, amb: 1.2, ambSky: 0x6a7ea8, ambGnd: 0x2a2620, rim: 1.6, rimCol: 0xffb07a, sun: 150, ele: 16,
    moon: false, sunVis: .6, glow: 0xd08a6a, cloud: .9, cloudCol: 0xa8b4cc, cloudShade: 0x222a40,
    bloom: .55, vignette: .55, sat: .9, contrast: 1.1, tint: [.98, 1, 1.05] },
  // the office: clean hazy daylight, soft shadows
  bone: { fog: 0.014, fogCol: 0xc8ccc8, skyTop: 0x6e9fd0, skyHor: 0xe6e2d8, exposure: .82, fill: 0.14,
    key: 3.0, keyCol: 0xfff0d6, amb: 1.7, ambSky: 0xb8cce0, ambGnd: 0x8a8070, rim: .8, rimCol: 0xffffff, sun: 60, ele: 48,
    moon: false, sunVis: 1, glow: 0xffe8c8, cloud: .4, cloudCol: 0xffffff, cloudShade: 0x9aa6b8,
    bloom: .35, vignette: .3, sat: 1.0, contrast: 1.02, tint: [1.02, 1, .97] },
  // the feed: neon night, sodium light, a magenta glow of screens on the horizon
  sodium: { fog: 0.02, fogCol: 0x1a1020, skyTop: 0x05060f, skyHor: 0x4a2050, exposure: 1.3, fill: 0.45,
    key: 3.8, keyCol: 0xffae5a, amb: .6, ambSky: 0x5a3a7a, ambGnd: 0x0d0808, rim: 1.4, rimCol: 0x5ad8ff, sun: 118, ele: 26,
    moon: true, sunVis: 0, glow: 0xff4aa0, cloud: .35, cloudCol: 0x6a3a7a, cloudShade: 0x0a0812,
    bloom: .95, vignette: .62, sat: 1.18, contrast: 1.1, tint: [1.03, 1, 1] },
  // the server farm: a red end-of-the-world sunset
  ember: { fog: 0.022, fogCol: 0x3a1410, skyTop: 0x12050a, skyHor: 0xa8481e, exposure: 1.2, fill: 0.36,
    key: 3.0, keyCol: 0xff9050, amb: .8, ambSky: 0x6a4a5a, ambGnd: 0x140807, rim: 2.6, rimCol: 0xff5a3a, sun: 175, ele: 7,
    moon: false, sunVis: 1, glow: 0xff5a1a, cloud: .7, cloudCol: 0xff9a60, cloudShade: 0x2a0a0a,
    bloom: 1.0, vignette: .6, sat: 1.15, contrast: 1.1, tint: [1.05, .98, .94] },
  silhouette: { fog: 0.04, fogCol: 0xb9c3cf, skyTop: 0xdfe6ee, skyHor: 0xb9c3cf, exposure: .95, fill: 0,
    key: 3.3, keyCol: 0xffffff, amb: .2, ambSky: 0x8fa2b8, ambGnd: 0x1a1a1a, rim: 0, rimCol: 0xffffff, sun: 190, ele: 13,
    moon: false, sunVis: 0, glow: 0xffffff, cloud: 0, cloudCol: 0xffffff, cloudShade: 0xffffff,
    bloom: .35, vignette: .35, sat: .15, contrast: 1.25, tint: [1, 1, 1.02] },
};
