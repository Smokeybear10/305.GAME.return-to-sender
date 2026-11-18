import {
  CatmullRomCurve3, Color, CylinderGeometry, DataTexture, ExtrudeGeometry,
  Group, InstancedMesh, LatheGeometry, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, RepeatWrapping,
  Quaternion, RGBAFormat, Shape, SphereGeometry, SRGBColorSpace, TorusGeometry, TubeGeometry,
  Vector2, Vector3,
} from '@iwsdk/core';
import { bevelBox, placeOnSurface, surfaceFrame } from '../scene-assets/lib/hardsurface.js';

export type CannonModel = {
  root: Group;
  barrel: Group;
  hat: Group;
  key: Group;
  muzzle: Object3D;
  target: Object3D;
  update(time: number, charge: number, recoil: number, defeated: boolean, dt?: number): void;
  aimAt(point: Vector3): void;
  strike(defeated: boolean): void;
  reset(): void;
};

type CannonCharacter = 'captain' | 'gunner';

function paintedTexture(base: string, seed: number) {
  const side = 128;
  const data = new Uint8Array(side * side * 4);
  const color = new Color(base);
  let randomState = seed;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      const noise = randomState / 4294967296;
      const brush = Math.sin(x * 0.31 + Math.sin(y * 0.1) * 0.65) * 0.018;
      const mottling = Math.sin(x * 0.09) * Math.sin(y * 0.13) * 0.027;
      const wear = noise > 0.992 ? 0.14 : 0;
      const variation = 0.98 + (noise - 0.5) * 0.065 + brush + mottling + wear;
      const index = (y * side + x) * 4;
      data[index] = Math.min(255, Math.pow(color.r, 1 / 2.2) * 255 * variation);
      data[index + 1] = Math.min(255, Math.pow(color.g, 1 / 2.2) * 255 * variation);
      data[index + 2] = Math.min(255, Math.pow(color.b, 1 / 2.2) * 255 * variation);
      data[index + 3] = 255;
    }
  }
  const texture = new DataTexture(data, side, side, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

const red = new MeshStandardMaterial({ map: paintedTexture('#963f32', 73), roughness: 0.73, metalness: 0.05 });
const redDark = new MeshStandardMaterial({ color: '#6d2e27', roughness: 0.81 });
const teal = new MeshStandardMaterial({ map: paintedTexture('#41645b', 141), roughness: .8 });
const tealDark = new MeshStandardMaterial({ color: '#293f39', roughness: .87 });
const soot = new MeshStandardMaterial({ color: '#554737', roughness: 1 });
const brass = new MeshStandardMaterial({ map: paintedTexture('#bb9450', 98), roughness: 0.4, metalness: 0.63 });
const brassDark = new MeshStandardMaterial({ color: '#73522d', roughness: 0.59, metalness: 0.45 });
const cream = new MeshStandardMaterial({ map: paintedTexture('#e2cfa8', 13), roughness: 0.87 });
const featherCream = new MeshStandardMaterial({ color: '#e9dcb9', roughness: 0.91 });
const ink = new MeshStandardMaterial({ color: '#302822', roughness: 0.76 });
const bore = new MeshStandardMaterial({ color: '#211c19', roughness: 0.89 });
const walnut = new MeshStandardMaterial({ map: paintedTexture('#483225', 27), roughness: 0.81 });
const cheekPaint = new MeshStandardMaterial({ color: '#b96947', roughness: 0.9 });
const eyeIvory = new MeshStandardMaterial({ color: '#eadbb8', roughness: 0.8 });
const sphere = new SphereGeometry(1, 20, 12);
const smallSphere = new SphereGeometry(1, 12, 8);

function part(parent: Object3D, name: string, geometry: Mesh['geometry'], material: MeshStandardMaterial, position: [number, number, number], scale?: [number, number, number], shadow = false) {
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function lineGeometry(points: [number, number, number][], radius: number, segments = 20) {
  return new TubeGeometry(new CatmullRomCurve3(points.map(point => new Vector3(...point))), segments, radius, 6, false);
}

function shapeGeometry(shape: Shape, depth = 0.008) {
  return new ExtrudeGeometry(shape, { depth, steps: 1, bevelEnabled: true, bevelSegments: 2, bevelSize: 0.002, bevelThickness: 0.002, curveSegments: 12 });
}

function buildCarriage(root: Group, coat: MeshStandardMaterial, trim: MeshStandardMaterial) {
  const carriage = new Group();
  carriage.name = 'Carriage';
  root.add(carriage);
  const cheek = new Shape();
  cheek.moveTo(-0.17, 0.02);
  cheek.lineTo(0.16, 0.02);
  cheek.quadraticCurveTo(0.19, 0.025, 0.16, 0.08);
  cheek.lineTo(0.055, 0.19);
  cheek.quadraticCurveTo(0.025, 0.21, -0.015, 0.18);
  cheek.lineTo(-0.16, 0.11);
  cheek.closePath();
  const sideGeometry = shapeGeometry(cheek, 0.034);
  for (const side of [-1, 1]) {
    const board = part(carriage, `CarriageCheek${side}`, sideGeometry, coat, [side * 0.12 - 0.017, 0.07, 0]);
    board.rotation.y = Math.PI / 2;
    const frame = surfaceFrame(new Vector3(side * 0.13, 0.235, -0.015), new Vector3(side, 0, 0), new Vector3(0, 0, side));
    const pivot = part(carriage, `Trunnion${side}`, new CylinderGeometry(0.033, 0.036, 0.017, 24), brass, [0, 0, 0]);
    const mount = new Group();
    mount.name = `TrunnionMount${side}`;
    carriage.add(mount);
    placeOnSurface(mount, frame);
    mount.add(pivot);
    pivot.rotation.x = Math.PI / 2;
    const wheel = new Group();
    wheel.name = `Wheel${side}`;
    wheel.position.set(side * 0.16, 0.098, 0.005);
    wheel.rotation.y = side * Math.PI / 2;
    carriage.add(wheel);
    part(wheel, 'WalnutTread', new TorusGeometry(0.076, 0.022, 10, 32), walnut, [0, 0, 0], undefined, true);
    part(wheel, 'BrassWheelRim', new TorusGeometry(0.079, 0.006, 6, 32), brass, [0, 0, 0.018]);
    const spoke = bevelBox(0.013, 0.13, 0.019, 0.003);
    for (let index = 0; index < 3; index++) {
      const mesh = part(wheel, `Spoke${index}`, spoke, trim, [0, 0, 0]);
      mesh.rotation.z = index * Math.PI / 3;
    }
    const hub = part(wheel, 'AxleCap', new CylinderGeometry(0.022, 0.026, 0.033, 20), brass, [0, 0, 0.015]);
    hub.rotation.x = Math.PI / 2;
  }
  part(carriage, 'CrossMember', bevelBox(0.28, 0.038, 0.15, 0.008), walnut, [0, 0.096, 0]);
  part(carriage, 'RearCrossMember', bevelBox(0.26, 0.032, 0.055, 0.006), brassDark, [0, 0.13, -0.15]);
  const axle = part(carriage, 'Axle', new CylinderGeometry(0.012, 0.012, 0.34, 12), brassDark, [0, 0.098, 0.005]);
  axle.rotation.z = Math.PI / 2;
  return carriage;
}

function buildBarrel(root: Group, coat: MeshStandardMaterial) {
  const barrel = new Group();
  barrel.name = 'Barrel';
  barrel.position.set(0, 0.252, 0.018);
  root.add(barrel);
  const profile = [
    [0.002, -0.056], [0.048, -0.056], [0.066, -0.043], [0.071, -0.015],
    [0.071, 0.016], [0.064, 0.032], [0.057, 0.17], [0.062, 0.199],
    [0.07, 0.204], [0.072, 0.216], [0.071, 0.229], [0.063, 0.236],
    [0.05, 0.236], [0.048, 0.226], [0.048, 0.035], [0.002, 0.035],
  ];
  const shell = part(barrel, 'TurnedRedBarrel', new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), 40), coat, [0, 0, 0], undefined, true);
  shell.rotation.x = Math.PI / 2;
  part(barrel, 'MuzzleBrassLip', new TorusGeometry(0.059, 0.011, 10, 40), brass, [0, 0, 0.235]);
  part(barrel, 'RearBarrelCollar', new TorusGeometry(0.0685, 0.006, 8, 32), brass, [0, 0, 0.015]);
  const boreBack = part(barrel, 'BoreRecess', new CylinderGeometry(0.0475, 0.0475, 0.004, 28), bore, [0, 0, 0.038]);
  boreBack.rotation.x = Math.PI / 2;
  const muzzle = new Object3D();
  muzzle.name = 'Muzzle';
  muzzle.position.set(0, 0, 0.249);
  barrel.add(muzzle);
  return barrel;
}

function buildFace(root: Group, character: CannonCharacter) {
  const face = new Group();
  face.name = 'Face';
  root.add(face);
  part(face, 'PaintedWoodHead', sphere, cream, [0, 0.353, -0.02], character === 'gunner' ? [.12, .081, .09] : [.108, .09, .09], true);
  for (const side of [-1, 1]) {
    part(face, `RosyCheek${side}`, smallSphere, cheekPaint, [side * 0.083, 0.344, 0.045], [0.021, 0.013, 0.004]);
    const eye = part(face, `Eye${side}`, sphere, eyeIvory, [side * 0.038, 0.372, 0.063], [0.028, 0.019, 0.008]);
    eye.rotation.z = side * -0.13;
    part(face, `Pupil${side}`, smallSphere, ink, [side * 0.031, 0.373, 0.071], [0.006, 0.01, 0.004]);
    const browPoints: [number, number, number][] = [
      [side * 0.012, 0.397, 0.064], [side * 0.029, 0.391, 0.067],
      [side * 0.05, 0.394, 0.061], [side * 0.067, 0.405, 0.05],
    ];
    part(face, `ArchEyebrow${side}`, lineGeometry(browPoints, 0.0042), ink, [0, 0, 0]);
  }
  part(face, 'Nose', sphere, cream, [0, 0.346, 0.076], [0.022, 0.023, 0.023]);
  const moustache = new Shape();
  moustache.moveTo(0, 0.001);
  moustache.bezierCurveTo(-0.025, 0.019, -0.029, -0.006, -0.045, -0.003);
  moustache.bezierCurveTo(-0.06, -0.003, -0.065, 0.011, -0.061, 0.021);
  moustache.bezierCurveTo(-0.08, -0.002, -0.058, -0.025, -0.037, -0.019);
  moustache.quadraticCurveTo(-0.014, -0.01, 0, -0.006);
  moustache.quadraticCurveTo(0.014, -0.01, 0.037, -0.019);
  moustache.bezierCurveTo(0.058, -0.025, 0.08, -0.002, 0.061, 0.021);
  moustache.bezierCurveTo(0.065, 0.011, 0.06, -0.003, 0.045, -0.003);
  moustache.bezierCurveTo(0.029, -0.006, 0.025, 0.019, 0, 0.001);
  moustache.closePath();
  const whiskers = part(face, 'CurledMoustache', shapeGeometry(moustache, 0.006), ink, [0, 0.329, 0.072]);
  if (character === 'gunner') {
    whiskers.scale.set(.73, 1.5, 1);
    whiskers.rotation.z = .09;
    face.getObjectByName('ArchEyebrow1')!.position.y = .008;
  } else {
    const monocle = part(face, 'CaptainMonocle', new TorusGeometry(.023, .0028, 5, 24), brass, [.038, .372, .071]);
    monocle.scale.y = .85;
  }
  const damage = new Group();
  damage.name = 'DamageMark';
  damage.visible = false;
  face.add(damage);
  const patch = new Group();
  patch.name = 'CheekScuffMount';
  damage.add(patch);
  placeOnSurface(patch, surfaceFrame(new Vector3(-.074, .345, .051), new Vector3(-.4, 0, 1).normalize(), new Vector3(1, 0, .4).normalize()));
  part(patch, 'CheekScuff', sphere, soot, [0, 0, .001], [.021, .016, .002]);
  part(patch, 'PaintChip', bevelBox(.022, .003, .001, .0005), cream, [0, .002, .003]);
  return face;
}

function buildHat(root: Group, character: CannonCharacter) {
  if (character === 'gunner') return buildGunnerHat(root);
  const hat = new Group();
  hat.name = 'Hat';
  hat.position.set(0, 0.424, -0.02);
  hat.rotation.z = -0.065;
  root.add(hat);
  const profile = [[0, 0.007], [0.115, 0.007], [0.12, 0.015], [0.124, 0.06], [0.133, 0.178], [0.13, 0.19], [0.12, 0.194], [0, 0.194]];
  part(hat, 'RedShakoCrown', new LatheGeometry(profile.map(([x, y]) => new Vector2(x, y)), 40), red, [0, 0, 0], undefined, true);
  const brim = part(hat, 'LeatherBrim', sphere, walnut, [0, 0.003, 0.019], [0.151, 0.015, 0.129], true);
  brim.rotation.x = -0.045;
  for (const [y, radius] of [[0.024, 0.1215], [0.18, 0.1325]]) {
    const rim = part(hat, `BrassShakoBand${y}`, new TorusGeometry(radius, 0.0055, 8, 40), brass, [0, y, 0]);
    rim.rotation.x = Math.PI / 2;
  }
  const badgeMount = new Group();
  badgeMount.name = 'BadgeMount';
  hat.add(badgeMount);
  placeOnSurface(badgeMount, surfaceFrame(new Vector3(0, 0.106, 0.128), new Vector3(0, 0, 1), new Vector3(1, 0, 0)));
  part(badgeMount, 'BrassBadge', sphere, brass, [0, 0, 0], [0.025, 0.033, 0.008]);
  part(badgeMount, 'BadgeInset', sphere, redDark, [0, 0, 0.006], [0.018, 0.025, 0.004]);
  const crown = new Shape();
  crown.moveTo(-0.011, -0.007);
  crown.lineTo(-0.014, 0.008);
  crown.lineTo(-0.005, 0.002);
  crown.lineTo(0, 0.013);
  crown.lineTo(0.005, 0.002);
  crown.lineTo(0.014, 0.008);
  crown.lineTo(0.011, -0.007);
  crown.closePath();
  part(badgeMount, 'CrownEmblem', shapeGeometry(crown, 0.002), brass, [0, 0, 0.01]);
  part(hat, 'ChinChain', lineGeometry([[-0.096, 0.055, 0.082], [-0.055, 0.04, 0.114], [0, 0.033, 0.123], [0.055, 0.04, 0.114], [0.096, 0.055, 0.082]], 0.0037, 28), brass, [0, 0, 0]);
  for (const side of [-1, 1]) part(hat, `ChainButton${side}`, smallSphere, brass, [side * 0.096, 0.058, 0.084], [0.009, 0.012, 0.006]);
  const plume = new Group();
  plume.name = 'FeatherPlume';
  plume.position.set(-0.025, 0.188, 0);
  plume.rotation.z = -0.18;
  hat.add(plume);
  const feather = new Shape();
  feather.moveTo(0, 0);
  feather.bezierCurveTo(-0.023, 0.028, -0.032, 0.061, -0.02, 0.103);
  feather.quadraticCurveTo(-0.016, 0.123, -0.006, 0.132);
  feather.lineTo(-0.002, 0.112);
  feather.quadraticCurveTo(0.008, 0.128, 0.017, 0.126);
  feather.lineTo(0.012, 0.101);
  feather.quadraticCurveTo(0.029, 0.113, 0.032, 0.101);
  feather.bezierCurveTo(0.037, 0.08, 0.026, 0.044, 0.005, 0);
  feather.closePath();
  const plumeGeometry = shapeGeometry(feather, 0.012);
  part(plume, 'SculptedFeather', plumeGeometry, featherCream, [0, 0, 0]);
  part(plume, 'FeatherRachis', lineGeometry([[0, 0, 0.013], [0.005, 0.04, 0.014], [0.002, 0.08, 0.014], [-0.004, 0.113, 0.013]], 0.0025), cream, [0, 0, 0]);
  for (const side of [-1, 1]) {
    part(plume, `FeatherVein${side}`, lineGeometry([[0.003, 0.034, 0.015], [side * 0.013, 0.06, 0.015], [side * 0.019, 0.085, 0.014]], 0.0017, 16), cream, [0, 0, 0]);
  }
  const socket = part(plume, 'FeatherSocket', new CylinderGeometry(0.01, 0.014, 0.024, 16), brass, [0, 0.006, 0.006]);
  socket.rotation.z = -0.12;
  return hat;
}

function buildGunnerHat(root: Group) {
  const hat = new Group();
  hat.name = 'Hat';
  hat.position.set(0, .424, -.02);
  hat.rotation.z = .12;
  root.add(hat);
  const crown = new Shape();
  crown.moveTo(-.15, .012);
  crown.bezierCurveTo(-.19, .04, -.17, .087, -.132, .083);
  crown.quadraticCurveTo(-.08, .068, -.054, .115);
  crown.quadraticCurveTo(0, .148, .059, .105);
  crown.quadraticCurveTo(.105, .075, .164, .095);
  crown.quadraticCurveTo(.19, .046, .143, .012);
  crown.quadraticCurveTo(0, -.005, -.15, .012);
  crown.closePath();
  part(hat, 'GunnerBicorn', shapeGeometry(crown, .068), tealDark, [0, 0, -.045], undefined, true);
  const brim = part(hat, 'WornLeatherBrim', sphere, walnut, [0, .006, .008], [.165, .013, .105], true);
  brim.rotation.z = -.035;
  part(hat, 'BicornGoldPiping', lineGeometry([[-.15, .026, .027], [-.12, .069, .027], [-.052, .105, .027], [0, .128, .027], [.058, .096, .027], [.143, .08, .027]], .0034, 28), brass, [0, 0, 0]);
  const cockade = new Group();
  cockade.name = 'CockadeMount';
  hat.add(cockade);
  placeOnSurface(cockade, surfaceFrame(new Vector3(-.038, .079, .028), new Vector3(0, 0, 1), new Vector3(1, 0, 0)));
  part(cockade, 'IvoryCockade', new TorusGeometry(.017, .006, 7, 20), cream, [0, 0, .003]);
  part(cockade, 'CockadeButton', smallSphere, brass, [0, 0, .007], [.01, .01, .004]);
  const ribbons = new Shape();
  ribbons.moveTo(-.009, -.012); ribbons.lineTo(-.015, -.049); ribbons.lineTo(-.003, -.041);
  ribbons.lineTo(.003, -.047); ribbons.lineTo(.012, -.012); ribbons.closePath();
  part(cockade, 'CockadeRibbon', shapeGeometry(ribbons, .002), red, [0, 0, .001]);
  return hat;
}

function buildImpact(root: Group) {
  const impact = new Group();
  impact.name = 'ImpactBurst';
  impact.position.set(0, .32, .13);
  impact.visible = false;
  impact.userData.iwsdkPreviewBounds = 'exclude';
  root.add(impact);
  const chips = new InstancedMesh(bevelBox(.012, .028, .005, .002), new MeshBasicMaterial({ color: '#ebd2a1', transparent: true, opacity: 1, depthWrite: false }), 10);
  chips.name = 'PaintFlakes';
  chips.frustumCulled = false;
  impact.add(chips);
  const ring = new Mesh(new TorusGeometry(.07, .0035, 4, 28), new MeshBasicMaterial({ color: '#f3dfb3', transparent: true, opacity: 1, depthWrite: false }));
  ring.name = 'ImpactRing';
  impact.add(ring);
}

function buildKey(root: Group) {
  const key = new Group();
  key.name = 'WindingKey';
  key.position.set(-0.192, 0.243, -0.038);
  root.add(key);
  const assembly = new Group();
  assembly.name = 'KeyAssembly';
  assembly.rotation.y = -Math.PI / 2;
  key.add(assembly);
  const shaft = part(assembly, 'KeyShaft', new CylinderGeometry(0.008, 0.008, 0.09, 12), brassDark, [0, 0, -0.022]);
  shaft.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    part(assembly, `KeyBow${side}`, new TorusGeometry(0.025, 0.007, 8, 24), brass, [0, side * 0.026, 0.025], [0.78, 1, 1]);
  }
  part(assembly, 'KeyBridge', bevelBox(0.022, 0.035, 0.015, 0.004), brass, [0, 0, 0.025]);
  return key;
}

export function createCannon(character: CannonCharacter = 'captain'): CannonModel {
  const root = new Group();
  root.name = character === 'captain' ? 'CaptainCannon' : 'GunnerCannon';
  root.userData.character = character;
  const coat = character === 'captain' ? red : teal;
  const trim = character === 'captain' ? redDark : tealDark;
  buildCarriage(root, coat, trim);
  part(root, 'OfficerJacket', sphere, coat, [0, 0.241, -0.057], [0.11, 0.122, 0.085], true);
  for (const side of [-1, 1]) {
    part(root, `Epaulette${side}`, sphere, brass, [side * 0.088, 0.304, -0.025], [0.036, 0.012, 0.051]);
  }
  buildBarrel(root, coat);
  buildFace(root, character);
  buildHat(root, character);
  buildKey(root);
  buildImpact(root);
  const target = new Object3D();
  target.name = 'Target';
  target.position.set(0, 0.32, 0.025);
  root.add(target);
  return bindCannon(root);
}

export function bindCannon(root: Group): CannonModel {
  const barrel = root.getObjectByName('Barrel') as Group;
  const hat = root.getObjectByName('Hat') as Group;
  const key = root.getObjectByName('WindingKey') as Group;
  const face = root.getObjectByName('Face') as Group;
  const carriage = root.getObjectByName('Carriage') as Group;
  const muzzle = root.getObjectByName('Muzzle')!;
  const target = root.getObjectByName('Target')!;
  const leftPupil = root.getObjectByName('Pupil-1')!;
  const rightPupil = root.getObjectByName('Pupil1')!;
  const damage = root.getObjectByName('DamageMark')!;
  const impact = root.getObjectByName('ImpactBurst')!;
  const chips = root.getObjectByName('PaintFlakes') as InstancedMesh;
  const ring = root.getObjectByName('ImpactRing') as Mesh<TorusGeometry, MeshBasicMaterial>;
  const chipMaterial = (chips.material as MeshBasicMaterial).clone();
  chips.material = chipMaterial;
  ring.material = ring.material.clone();
  const transform = new Object3D();
  const boreForward = new Vector3(0, 0, 1);
  const aimDirection = new Vector3();
  const aimRotation = new Quaternion();
  const desiredAim = new Quaternion();
  const directions = Array.from({ length: 10 }, (_, i) => new Vector3(Math.cos(i * 2.39996), Math.sin(i * 2.39996), .35 + i % 3 * .18));
  const gunner = root.userData.character === 'gunner';
  const restTilt = gunner ? .12 : -.065;
  const lean = gunner ? -1 : 1;
  let lastTime = -1, windingAngle = 0, hitAge = 10, impactAge = 10, defeatAge = -1;
  let damaged = false, finishingStrike = false, aiming = false;
  const reset = () => {
    lastTime = -1; windingAngle = 0; hitAge = impactAge = 10; defeatAge = -1;
    damaged = finishingStrike = aiming = false;
    aimRotation.identity(); desiredAim.identity();
    impact.visible = damage.visible = false;
    barrel.position.set(0, .252, .018); barrel.rotation.set(0, 0, 0);
    hat.position.set(0, .424, -.02); hat.rotation.set(0, 0, restTilt);
    key.rotation.x = 0;
    face.position.set(0, 0, 0); face.rotation.set(0, 0, 0);
    carriage.position.set(0, 0, 0); carriage.rotation.set(0, 0, 0);
    leftPupil.position.set(-.031, .373, .071); rightPupil.position.set(.031, .373, .071);
    root.userData.reaction = 'ready';
  };
  const aimAt = (point: Vector3) => {
    aiming = true;
    root.worldToLocal(aimDirection.copy(point)).sub(barrel.position).normalize();
    desiredAim.setFromUnitVectors(boreForward, aimDirection);
  };
  const strike = (defeated: boolean) => {
    hitAge = impactAge = 0;
    damaged = true; finishingStrike = defeated;
    damage.visible = impact.visible = true;
    root.userData.reaction = defeated ? 'defeated' : 'struck';
  };
  const update = (time: number, charge: number, recoil: number, defeated: boolean, dt?: number) => {
    const delta = dt === undefined ? (lastTime < 0 ? 0 : Math.min(.05, Math.max(0, time - lastTime))) : Math.max(0, dt);
    lastTime = time;
    if (!defeated && defeatAge >= 0) reset();
    hitAge = Math.min(10, hitAge + delta); impactAge = Math.min(10, impactAge + delta);
    windingAngle += delta * charge * 11;
    if (!defeated) aimRotation.slerp(desiredAim, 1 - Math.exp(-12 * delta));
    const punch = Math.exp(-hitAge * 15);
    const wobble = Math.sin(hitAge * 37) * Math.exp(-hitAge * 7);
    key.rotation.x = windingAngle - punch * 1.8 * lean;
    barrel.position.z = .018 - recoil * .055 - punch * .045;
    barrel.rotation.set((aiming ? 0 : -charge * .025) + recoil * .045 + punch * .17, wobble * .06, wobble * .09 * lean);
    carriage.position.y = Math.max(0, wobble) * .006;
    carriage.rotation.z = wobble * .022 * lean;
    face.position.z = -punch * .018;
    face.rotation.z = wobble * .025 * lean;
    damage.visible = damaged;
    impact.visible = impactAge < .55;
    if (impact.visible) {
      const spread = finishingStrike ? 1.35 : 1;
      const remaining = Math.max(0, 1 - impactAge / .55);
      chipMaterial.opacity = remaining;
      for (let i = 0; i < 10; i++) {
        const direction = directions[i];
        transform.position.copy(direction).multiplyScalar((.035 + impactAge * .42) * spread);
        transform.position.y -= impactAge * impactAge * .6;
        transform.rotation.set(impactAge * (i % 2 ? 9 : -7), i * .65 + impactAge * 5, i * 2.39996);
        transform.scale.setScalar(Math.min(1, remaining * 3));
        transform.updateMatrix(); chips.setMatrixAt(i, transform.matrix);
      }
      chips.instanceMatrix.needsUpdate = true;
      ring.visible = impactAge < .22;
      ring.scale.setScalar(.6 + impactAge * 8);
      ring.material.opacity = Math.max(0, 1 - impactAge / .22) * .8;
    }
    if (defeated) {
      defeatAge = Math.min(2, Math.max(0, defeatAge) + delta);
      const flight = Math.min(1.1, defeatAge);
      const rise = flight < .85 ? 1.7 * flight - 2.6 * flight * flight : -.435;
      hat.position.set(lean * flight * .24, Math.max(.12, .424 + rise), -.02 - flight * .095);
      hat.rotation.set(flight * 1.8, flight * .5 * lean, restTilt - flight * 1.2 * lean);
      barrel.rotation.x += Math.min(.2, flight * .45);
      face.rotation.z -= lean * Math.min(.06, flight * .12);
      leftPupil.position.y = rightPupil.position.y = .38;
      leftPupil.position.x = -.025; rightPupil.position.x = .025;
      barrel.quaternion.premultiply(aimRotation);
      return;
    }
    const anticipation = charge * charge;
    const tremble = Math.sin(windingAngle * 5) * anticipation;
    const nod = Math.sin(hitAge * 20) * Math.exp(-hitAge * 8);
    hat.position.set(-lean * (punch * .012 + anticipation * .004), .424 + anticipation * .007 + tremble * .003 + Math.max(0, nod) * .018, -.02);
    hat.rotation.set(punch * -.12, 0, restTilt + (damaged ? .13 * lean : 0) - anticipation * .065 * lean + tremble * .012 + wobble * .12);
    face.rotation.z += tremble * .003;
    leftPupil.position.y = .373 + punch * .009;
    rightPupil.position.y = .373 - punch * .006;
    barrel.quaternion.premultiply(aimRotation);
    if (hitAge > .7) root.userData.reaction = damaged ? 'damaged' : charge > .1 ? 'winding' : 'ready';
  };
  return { root, barrel, hat, key, muzzle, target, update, aimAt, strike, reset };
}
