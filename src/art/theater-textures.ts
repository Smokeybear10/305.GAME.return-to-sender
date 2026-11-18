import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType } from '@iwsdk/core';

export function theaterTexture(kind: 'wood' | 'paper' | 'cloth', seed = 23): DataTexture {
  const size = 256;
  const pixels = new Uint8Array(size * size * 4);
  let state = seed;
  const random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const n = random() - 0.5;
      const bend = .002 * Math.sin(v * 9) + .001 * Math.sin(v * 23 + u * 11);
      const grain = Math.sin((u + bend) * 240 + Math.sin(u * 39) * 2.1);
      const broad = Math.sin(u * 17 + Math.sin(v * 3.2) * .25) * .5;
      const pores = Math.pow(Math.max(0, Math.sin(u * 391 + bend * 310)), 12);
      const weave = ((x % 3 === 0 ? -1 : 0) + (y % 3 === 0 ? -1 : 0));
      const value = kind === 'wood' ? 210 + grain * 2.5 + broad * 6 - pores * 5 + n * 3
        : kind === 'paper' ? 235 + n * 5 + Math.sin(x * 0.23) * Math.sin(y * 0.18) * .8
        : 221 + n * 9 + weave * 5;
      const i = (y * size + x) * 4;
      pixels[i] = value;
      pixels[i + 1] = value;
      pixels[i + 2] = value;
      pixels[i + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat, UnsignedByteType);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
