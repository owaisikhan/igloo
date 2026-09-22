// Small deterministic value-noise helpers used to generate terrain and rocks.

const hash = (n: number) => {
  const s = Math.sin(n) * 43758.5453123;
  return s - Math.floor(s);
};

const fade = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const noise2 = (x: number, y: number) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const h = (i: number, j: number) => hash(i * 127.1 + j * 311.7);
  return lerp(
    lerp(h(ix, iy), h(ix + 1, iy), fx),
    lerp(h(ix, iy + 1), h(ix + 1, iy + 1), fx),
    fy,
  );
};

export const noise3 = (x: number, y: number, z: number) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const fz = fade(z - iz);
  const h = (i: number, j: number, k: number) =>
    hash(i * 127.1 + j * 311.7 + k * 74.7);
  const plane = (k: number) =>
    lerp(
      lerp(h(ix, iy, k), h(ix + 1, iy, k), fx),
      lerp(h(ix, iy + 1, k), h(ix + 1, iy + 1, k), fx),
      fy,
    );
  return lerp(plane(iz), plane(iz + 1), fz);
};

export const fbm2 = (x: number, y: number, octaves = 5) => {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x * freq, y * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
};

export const fbm3 = (x: number, y: number, z: number, octaves = 4) => {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(x * freq, y * freq, z * freq);
    freq *= 2.1;
    amp *= 0.5;
  }
  return sum;
};

/** Seeded PRNG (mulberry32) so layouts are stable between reloads. */
export const createRandom = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
