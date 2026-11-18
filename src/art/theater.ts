import {
  BufferGeometry, ConeGeometry, CylinderGeometry, DataTexture, DoubleSide, ExtrudeGeometry,
  Float32BufferAttribute, Group, Material, Matrix4, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D,
  LinearFilter, LinearMipmapLinearFilter, Path, PlaneGeometry, RepeatWrapping, RGBAFormat,
  Shape, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector3,
} from '@iwsdk/core';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bevelBox } from '../scene-assets/lib/hardsurface.js';
import { theaterTexture } from './theater-textures.js';

export type TheaterModel = {
  root: Group;
  cannonSpots: Vector3[];
  fort: Group;
  resident: Group;
  shutter: Group;
  update(time: number, celebrating: boolean, endingTime?: number): void;
};

const woodMap = theaterTexture('wood');
const paperMap = theaterTexture('paper');
const clothMap = theaterTexture('cloth');
const walnut = new MeshStandardMaterial({ color: '#4c2c21', map: woodMap, roughness: 0.62 });
function stageGrain() {
  const width = 256, height = 512;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width, v = y / height;
      const bend = Math.sin(v * 5.4) * .015 + Math.sin(v * 13.2) * .004;
      const knot = Math.exp(-((v - .36) ** 2) * 70) * Math.exp(-((u - .58) ** 2) * 22);
      const ring = Math.sin((u + bend + knot * .045) * 84 + Math.sin(u * 23) * 2.5);
      const pore = Math.pow(Math.max(0, Math.sin((u + bend) * 363)), 18);
      const broad = Math.sin(u * 17 + bend * 14) * 3;
      const value = 220 + ring * 2.4 + broad - pore * 2.5 - knot * 4;
      const i = (y * width + x) * 4;
      pixels[i] = value; pixels[i + 1] = value; pixels[i + 2] = value; pixels[i + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, width, height, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.minFilter = LinearMipmapLinearFilter; texture.magFilter = LinearFilter;
  texture.anisotropy = 4; texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

const floorGrain = stageGrain();
const floorWood = new MeshStandardMaterial({ color: '#78604a', map: floorGrain, roughness: .82, bumpMap: floorGrain, bumpScale: .00035 });
const floorVariants = ['#78604a', '#735c47', '#7b624b', '#755d47', '#7e644c', '#79614b'].map((color) => {
  const material = floorWood.clone(); material.color.set(color); return material;
});
const darkWood = new MeshStandardMaterial({ color: '#30241e', map: woodMap, roughness: 0.92 });
const gold = new MeshStandardMaterial({ color: '#b99253', metalness: 0.68, roughness: 0.36 });
const oldGold = new MeshStandardMaterial({ color: '#8c6d40', metalness: 0.5, roughness: 0.57 });
const paper = new MeshStandardMaterial({ color: '#c9b18a', map: paperMap, roughness: 0.97 });
const palePaper = new MeshStandardMaterial({ color: '#e8d5b1', map: paperMap, roughness: 0.97 });
const paperReturn = new MeshStandardMaterial({ color: '#a98e68', map: paperMap, roughness: 1 });
const palePaperReturn = new MeshStandardMaterial({ color: '#c0a780', map: paperMap, roughness: 1 });
const paperFace = paper.clone(); paperFace.vertexColors = true;
const palePaperFace = palePaper.clone(); palePaperFace.vertexColors = true;
const paperEdge = new MeshStandardMaterial({ color: '#96764f', roughness: 1 });
const red = new MeshStandardMaterial({ color: '#9e342f', map: clothMap, roughness: 0.87 });
const curtainMaterial = new MeshPhysicalMaterial({ color: '#741e2a', map: clothMap, roughness: 1, sheen: .65, sheenColor: '#c3655b', sheenRoughness: .85, side: DoubleSide });
const scenicBlue = new MeshStandardMaterial({ color: '#243f46', map: paperMap, roughness: 1 });
const distantHill = new MeshStandardMaterial({ color: '#37565a', map: paperMap, roughness: 1 });
const nearHill = new MeshStandardMaterial({ color: '#5b6d64', map: paperMap, roughness: 1 });
const printedGold = new MeshStandardMaterial({ color: '#d3a44e', roughness: 0.91 });
const ink = new MeshStandardMaterial({ color: '#47372a', roughness: 1 });
const raincoat = new MeshStandardMaterial({ color: '#d6a32b', map: paperMap, roughness: 0.88 });
const skin = new MeshStandardMaterial({ color: '#e6bc88', roughness: 0.9 });
const lampGlass = new MeshStandardMaterial({ color: '#ffedc3', emissive: '#e8a544', emissiveIntensity: .65, roughness: .32 });

function mesh(parent: Object3D, name: string, geometry: BufferGeometry, material: Material, x = 0, y = 0, z = 0, shadow = false): Mesh {
  const result = new Mesh(geometry, material);
  result.name = name;
  result.position.set(x, y, z);
  result.castShadow = shadow;
  result.receiveShadow = true;
  parent.add(result);
  return result;
}

function block(parent: Object3D, name: string, width: number, height: number, depth: number, material: Material, x = 0, y = 0, z = 0, bevel = 0.006): Mesh {
  return mesh(parent, name, bevelBox(width, height, depth, bevel, bevel, 3), material, x, y, z, true);
}

function cutout(parent: Object3D, name: string, shape: Shape, thickness: number, material: Material, x = 0, y = 0, z = 0): Mesh {
  return mesh(parent, name, new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 16 }), material, x, y, z, true);
}

function polygon(points: [number, number][]): Shape {
  const shape = new Shape();
  shape.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => shape.lineTo(x, y));
  shape.closePath();
  return shape;
}

function arch(width: number, height: number): Shape {
  const shape = new Shape();
  const radius = width / 2;
  shape.moveTo(-radius, 0);
  shape.lineTo(radius, 0);
  shape.lineTo(radius, height - radius);
  shape.absarc(0, height - radius, radius, 0, Math.PI, false);
  shape.lineTo(-radius, 0);
  return shape;
}

function crown(parent: Object3D, size: number, x: number, y: number, z: number): void {
  const s = size;
  cutout(parent, 'Printed crown', polygon([
    [-s * .48, -s * .2], [-s * .6, s * .32], [-s * .25, s * .1], [0, s * .51],
    [s * .25, s * .1], [s * .6, s * .32], [s * .48, -s * .2],
  ]), 0.001, printedGold, x, y, z);
}

function battlement(width: number, height: number, teeth: number): Shape {
  const points: [number, number][] = [[-width / 2, 0], [width / 2, 0], [width / 2, height]];
  const step = width / (teeth * 2 - 1);
  for (let i = teeth * 2 - 2; i >= 0; i--) {
    const x = -width / 2 + i * step;
    const y = i % 2 ? height - step * .82 : height;
    points.push([x + step, y], [x, y]);
  }
  points.push([-width / 2, 0]);
  return polygon(points);
}

function banner(parent: Object3D, width: number, height: number, x: number, y: number, z: number): void {
  const shape = polygon([[-width / 2, 0], [width / 2, 0], [width / 2, -height], [0, -height * .8], [-width / 2, -height]]);
  cutout(parent, 'Scarlet paper banner', shape, .003, red, x, y, z);
  crown(parent, width * .55, x, y - height * .39, z + .0035);
  block(parent, 'Banner top fold', width + .012, .008, .008, oldGold, x, y + .004, z + .005, .001);
}

function flag(parent: Object3D, x: number, y: number, z: number, size: number): Group {
  const group = new Group();
  group.name = 'Folded pennant';
  group.position.set(x, y, z);
  parent.add(group);
  mesh(group, 'Flagstaff', new CylinderGeometry(.003, .003, size * 1.8, 6), oldGold, 0, size * .9, 0);
  mesh(group, 'Flagstaff finial', new SphereGeometry(.007, 8, 6), gold, 0, size * 1.83, 0);
  const cloth = cutout(group, 'Paper flag', polygon([[0, 0], [size, -size * .12], [size * .82, -size * .35], [size, -size * .55], [0, -size * .48]]), .002, red, .003, size * 1.68, 0);
  cloth.rotation.y = -.24;
  return group;
}

function paperTower(parent: Object3D, name: string, width: number, height: number, depth: number, x: number, z: number, material: Material, gate = false): Group {
  const group = new Group();
  group.name = name;
  group.position.set(x, 0, z);
  parent.add(group);
  const shape = battlement(width, height, 4);
  if (gate) {
    const hole = new Path();
    const r = width * .19;
    const h = height * .31;
    hole.moveTo(-r, .001);
    hole.lineTo(-r, h - r);
    hole.absarc(0, h - r, r, Math.PI, 0, true);
    hole.lineTo(r, .001);
    hole.closePath();
    shape.holes.push(hole);
  }
  const faceMaterial = material === palePaper ? palePaperFace : paperFace;
  const returnMaterial = material === palePaper ? palePaperReturn : paperReturn;
  const front = cutout(group, 'Cut-card front', shape, .012, faceMaterial, 0, 0, depth / 2);
  const normals = front.geometry.getAttribute('normal');
  const colors = new Float32Array(normals.count * 3);
  for (let vertex = 0; vertex < normals.count; vertex++) {
    const edge = Math.abs(normals.getZ(vertex)) < .5;
    colors.set(edge ? [.72, .66, .58] : [1, 1, 1], vertex * 3);
  }
  front.geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  cutout(group, 'Cut-card back', battlement(width, height, 4), .012, returnMaterial, 0, 0, -depth / 2);
  block(group, 'Left folded return', .012, height * .91, depth, returnMaterial, -width / 2 + .006, height * .455, 0, .001);
  block(group, 'Right folded return', .012, height * .91, depth, returnMaterial, width / 2 - .006, height * .455, 0, .001);
  for (const side of [-1, 1]) {
    block(group, 'Scored vertical fold', .002, height * .87, .0015, paperEdge, side * width * .44, height * .435, depth / 2 + .013, .0005);
  }
  return group;
}

function makeFort(): Group {
  const fort = new Group();
  fort.name = 'Paper fort';
  fort.position.set(0, .74, -.24);
  const center = paperTower(fort, 'Fort gate tower', .152, .256, .112, 0, 0, palePaper, true);
  banner(center, .067, .103, 0, .226, .07);
  flag(center, 0, .255, -.02, .042);
  for (const side of [-1, 1]) {
    const tower = paperTower(fort, side < 0 ? 'Fort west turret' : 'Fort east turret', .075, .177, .083, side * .134, 0, paper);
    mesh(tower, 'Folded scarlet roof', new ConeGeometry(.061, .086, 4), red, 0, .209, 0, true).rotation.y = Math.PI / 4;
    mesh(tower, 'Turret finial', new SphereGeometry(.005, 8, 6), oldGold, 0, .256, 0);
    cutout(tower, 'Printed arrow slit', arch(.012, .032), .001, ink, 0, .107, .055);
    block(fort, 'Folded connecting wall', .09, .112, .014, palePaper, side * .08, .056, .035, .002);
  }
  return fort;
}

function makeResident(): Group {
  const resident = new Group();
  resident.name = 'Resident';
  resident.position.set(.023, .74, -.095);
  const body = polygon([[-.017, 0], [.018, 0], [.014, .046], [.009, .055], [-.01, .055], [-.015, .044]]);
  cutout(resident, 'Yellow raincoat', body, .012, raincoat, 0, .009, -.006);
  mesh(resident, 'Hood', new SphereGeometry(.016, 14, 10), raincoat, 0, .071, 0, true).scale.set(1, 1.05, .7);
  mesh(resident, 'Face', new SphereGeometry(.0125, 14, 10), skin, 0, .071, .006).scale.set(1, .86, .5);
  for (const side of [-1, 1]) {
    mesh(resident, 'Boot', new SphereGeometry(.008, 10, 6), ink, side * .01, .005, .003).scale.set(.8, .6, 1.4);
    mesh(resident, 'Eye', new SphereGeometry(.0015, 6, 4), ink, side * .0042, .072, .0125);
  }
  const arm = new Group();
  arm.name = 'Resident waving arm';
  arm.position.set(.014, .047, 0);
  resident.add(arm);
  block(arm, 'Coat sleeve', .009, .029, .009, raincoat, .004, -.011, 0, .003);
  mesh(arm, 'Paper hand', new SphereGeometry(.005, 8, 6), skin, .004, -.027, 0);
  block(resident, 'Quiet coat sleeve', .009, .03, .008, raincoat, -.018, .033, 0, .003).rotation.z = -.15;
  block(resident, 'Coat seam', .001, .038, .001, oldGold, 0, .035, .0067, .0002);
  return resident;
}

function makeCurtain(side: number): Group {
  const group = new Group();
  group.name = side < 0 ? 'West velvet drape' : 'East velvet drape';
  const geometry = new PlaneGeometry(1, 1, 44, 26);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const u = position.getX(i) + .5;
    const v = position.getY(i) + .5;
    const gathered = (side < 0 ? .12 : .18) * Math.sin(v * Math.PI);
    position.setXYZ(i,
      side * (1.06 + u * .51 + gathered * (1 - u)),
      .765 + v * 1.61 + .013 * Math.sin(u * Math.PI * 7) + (side > 0 ? (1 - v) * .022 : 0),
      -2.18 + Math.cos(u * Math.PI * 14) * (.031 + .025 * (1 - v)) - .055 * Math.sin(v * Math.PI),
    );
  }
  geometry.computeVertexNormals();
  mesh(group, 'Heavy pleated velvet', geometry, curtainMaterial).receiveShadow = false;
  const tie = mesh(group, 'Curtain tieback', new TorusGeometry(.093, .009, 7, 36, Math.PI * 1.5), gold, side * 1.32, 1.27, -2.16);
  tie.rotation.x = Math.PI / 2;
  tie.scale.x = 1.25;
  mesh(group, 'Tassel neck', new CylinderGeometry(.009, .013, .046, 10), gold, side * 1.23, 1.22, -2.08);
  mesh(group, 'Tassel fringe', new ConeGeometry(.018, .059, 12), oldGold, side * 1.23, 1.174, -2.08);
  return group;
}

function makeValance(): Group {
  const group = new Group();
  group.name = 'Velvet valance';
  for (const [center, depth] of [[-.87, .19], [0, .24], [.87, .17]]) {
    const geometry = new PlaneGeometry(1, 1, 36, 10);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const u = position.getX(i) + .5;
      const v = position.getY(i) + .5;
      const sag = Math.sin(u * Math.PI);
      position.setXYZ(i, center + (u - .5) * .97, 2.4 - sag * (.08 + v * depth), -2.12 + Math.cos(v * 26) * .018 + sag * .035);
    }
    geometry.computeVertexNormals();
    mesh(group, 'Scalloped velvet swag', geometry, curtainMaterial).receiveShadow = false;
  }
  return group;
}

function makeClosingCurtain(side: number): Group {
  const group = new Group();
  group.name = side < 0 ? 'West closing curtain' : 'East closing curtain';
  group.position.set(side * 1.57, .76, side < 0 ? -2.22 : -2.216);
  const geometry = new PlaneGeometry(1, 1, 48, 16);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const u = position.getX(i) + .5;
    const v = position.getY(i) + .5;
    position.setXYZ(i,
      -side * u * 1.585,
      v * 1.61 + .009 * Math.sin(u * Math.PI * 16),
      Math.cos(u * Math.PI * 16) * (.025 + .012 * (1 - v)),
    );
  }
  geometry.computeVertexNormals();
  mesh(group, 'Traveling velvet folds', geometry, curtainMaterial).receiveShadow = false;
  group.visible = false;
  group.scale.x = .01;
  return group;
}

function makeBackdrop(): Group {
  const group = new Group();
  group.name = 'Folded paper kingdom';
  group.position.y = .74;
  cutout(group, 'Distant painted hills', polygon([
    [-1.48, 0], [1.48, 0], [1.48, .51], [1.21, .66], [.92, .58], [.61, .81],
    [.33, .72], [.06, .91], [-.31, .74], [-.57, .89], [-.89, .68], [-1.18, .76], [-1.48, .61],
  ]), .009, distantHill, 0, .17, -2.59);
  cutout(group, 'Near painted hills', polygon([
    [-1.46, 0], [1.46, 0], [1.46, .39], [1.14, .46], [.78, .38], [.42, .57],
    [.03, .48], [-.31, .61], [-.68, .43], [-1.01, .54], [-1.46, .44],
  ]), .01, nearHill, 0, .13, -2.51);
  const moon = mesh(group, 'Painted setting moon', new CylinderGeometry(.098, .098, .003, 32), palePaper, -.8, 1.23, -2.61);
  moon.rotation.x = Math.PI / 2;
  cutout(group, 'Rear crenellated wall', battlement(2.5, .37, 16), .023, paper, 0, 0, -2.4);
  const center = paperTower(group, 'Royal gatehouse', .57, .97, .19, 0, -2.33, paper, true);
  banner(center, .197, .342, 0, .842, .114);
  flag(center, 0, .97, -.04, .115);
  cutout(center, 'Recessed wooden gate', arch(.196, .291), .012, darkWood, 0, 0, -.08);
  for (let i = -2; i <= 2; i++) {
    block(center, 'Gate plank joint', .003, .202, .002, walnut, i * .033, .101, -.065, .0005);
  }
  for (const side of [-1, 1]) {
    const tower = paperTower(group, side < 0 ? 'West castle flat' : 'East castle flat', side < 0 ? .32 : .29, side < 0 ? .69 : .79, .15, side * .67, side < 0 ? -2.38 : -2.34, palePaper);
    cutout(tower, 'Printed tower window', arch(.045, .12), .001, ink, 0, .39, .09);
    banner(tower, .11, .21, 0, .31, .092);
    const outer = paperTower(group, side < 0 ? 'West watchtower' : 'East folding turret', .22, side < 0 ? .55 : .43, .11, side * 1.03, -2.4, paper);
    if (side < 0) flag(outer, -.03, .55, -.01, .061);
    if (side > 0) cutout(tower, 'Upper arrow slit', arch(.026, .061), .001, ink, .057, .64, .09);
  }
  for (let i = -5; i <= 5; i++) {
    if (Math.abs(i) <= 1) continue;
    block(group, 'Pencilled masonry course', .075, .003, .001, paperEdge, i * .21, .12 + (i % 2 ? .025 : 0), -2.374, .0004);
  }
  return group;
}

function makeShutter(root: Group): Group {
  const frame = new Group();
  frame.name = 'ShutterFrame';
  frame.position.x = -.28;
  frame.visible = false;
  root.add(frame);
  for (const side of [-1, 1]) {
    const x = .65 + side * .176;
    block(frame, 'Shutter brass runner', .015, 1.13, .03, oldGold, x, 1.315, -1.12, .004);
    block(frame, 'Runner mounting foot', .065, .025, .13, walnut, x, .7525, -1.14, .005);
    mesh(frame, 'Runner cap', new SphereGeometry(.018, 10, 8), gold, x, 1.895, -1.12);
  }
  block(frame, 'Shutter overhead rail', .393, .027, .036, gold, .65, 1.87, -1.12, .005);
  const shutter = new Group();
  shutter.name = 'Shutter';
  shutter.position.set(.37, 1.3, -1.12);
  shutter.visible = false;
  root.add(shutter);
  block(shutter, 'Sliding painted shield', .3, .32, .025, red, 0, 0, 0, .009);
  for (const side of [-1, 1]) {
    block(shutter, 'Shield edge binding', .013, .29, .006, gold, side * .135, 0, .015, .003);
  }
  block(shutter, 'Upper shield binding', .285, .015, .006, gold, 0, .143, .015, .003);
  block(shutter, 'Lower shield binding', .285, .015, .006, gold, 0, -.143, .015, .003);
  crown(shutter, .1, 0, .012, .016);
  return shutter;
}

export function createTheater(): TheaterModel {
  const root = new Group();
  root.name = 'Theater';
  const table = new Group();
  table.name = 'Walnut stage';
  root.add(table);
  block(table, 'Stage foundation', 3.08, .104, 2.74, walnut, 0, .65, -1.34, .028);
  const joins = [.82, 1.58, 1.14, 2.05, .62, 1.72, 1.26, .91, 1.94, 1.41, .73, 1.81, 1.07, 2.16, 1.48];
  for (let i = 0; i < joins.length; i++) {
    const lengths = [joins[i], 2.69 - joins[i]];
    let front = .005;
    for (let section = 0; section < lengths.length; section++) {
      const length = lengths[section] - .0025;
      const geometry = bevelBox(.199, .039, length, .0018, .0018, 1);
      const positions = geometry.getAttribute('position');
      const uv = geometry.getAttribute('uv');
      for (let vertex = 0; vertex < positions.count; vertex++) {
        uv.setXY(vertex, positions.getX(vertex) / .23 + i * .173, positions.getZ(vertex) / 2.7 + i * .31 + section * .47);
      }
      mesh(table, `Joined stage board ${i + 1}.${section + 1}`, geometry,
        floorVariants[(i * 5 + section * 2) % floorVariants.length],
        (i - 7) * .202, .7205, front - lengths[section] / 2, true);
      front -= lengths[section];
    }
  }
  block(table, 'Front carved apron', 3.14, .184, .078, walnut, 0, .633, .038, .024);
  block(table, 'Front upper bead', 3.17, .023, .055, gold, 0, .716, .063, .008);
  block(table, 'Front lower bead', 3.12, .019, .034, oldGold, 0, .551, .068, .006);
  for (const side of [-1, 1]) {
    block(table, 'Side raised molding', .032, .035, 2.76, oldGold, side * 1.55, .734, -1.34, .008);
    for (const z of [-.07, -2.52]) {
      block(table, 'Stage leg', .12, .54, .12, darkWood, side * 1.39, .327, z, .018);
    }
    block(table, 'Apron recessed panel', .72, .088, .011, darkWood, side * .91, .632, .081, .014);
    block(table, 'Apron inlaid panel', .67, .062, .013, walnut, side * .91, .632, .088, .012);
  }
  crown(table, .092, 0, .63, .083);
  const footlights = new Group();
  footlights.name = 'Brass footlights';
  table.add(footlights);
  const cup = new CylinderGeometry(.023, .018, .013, 12);
  const bulb = new SphereGeometry(.013, 12, 8);
  for (let index = 0; index < 7; index++) {
    const x = (index - 3) * .35;
    mesh(footlights, 'Brass lamp socket', cup, oldGold, x, .746, .052);
    mesh(footlights, 'Frosted footlight bulb', bulb, lampGlass, x, .76, .052).scale.y = .88;
  }

  const proscenium = new Group();
  proscenium.name = 'Carved proscenium';
  root.add(proscenium);
  block(proscenium, 'Painted midnight backing', 3.15, 1.74, .052, scenicBlue, 0, 1.58, -2.65, .01);
  for (const side of [-1, 1]) {
    block(proscenium, 'Theater column', .16, 1.83, .17, walnut, side * 1.58, 1.61, -2.17, .025);
    block(proscenium, 'Column recessed flute', .065, 1.45, .015, scenicBlue, side * 1.58, 1.59, -2.075, .016);
    block(proscenium, 'Column gold fillet', .018, 1.57, .015, gold, side * 1.53, 1.61, -2.072, .005);
    block(proscenium, 'Column plinth', .21, .09, .23, walnut, side * 1.58, .796, -2.16, .017);
    block(proscenium, 'Column capital', .23, .082, .23, walnut, side * 1.58, 2.428, -2.16, .018);
    block(proscenium, 'Column capital gold rim', .235, .014, .235, oldGold, side * 1.58, 2.465, -2.16, .006);
  }
  block(proscenium, 'Theater crown beam', 3.42, .143, .21, walnut, 0, 2.52, -2.17, .033);
  block(proscenium, 'Crown beam gold upper molding', 3.45, .026, .23, gold, 0, 2.584, -2.17, .009);
  block(proscenium, 'Crown beam gold lower molding', 3.39, .019, .222, oldGold, 0, 2.456, -2.17, .007);
  const crest = mesh(proscenium, 'Crown beam oval crest', new SphereGeometry(.13, 24, 16), walnut, 0, 2.53, -2.032, true);
  crest.scale.set(1.6, .79, .16);
  crown(proscenium, .103, 0, 2.525, -2.007);
  root.add(makeCurtain(-1), makeCurtain(1), makeValance(), makeBackdrop(), makeClosingCurtain(-1), makeClosingCurtain(1));

  for (const side of [-1, 1]) {
    const platform = new Group();
    platform.name = side < 0 ? 'West cannon rostrum' : 'East cannon rostrum';
    platform.position.set(side * .76, .74, -1.5);
    root.add(platform);
    block(platform, 'Rostrum carved body', .60, .207, .52, walnut, 0, .104, 0, .025);
    block(platform, 'Rostrum top deck', .64, .039, .56, floorWood, 0, .2305, 0, .013);
    block(platform, 'Rostrum gold lip', .655, .013, .571, oldGold, 0, .21, 0, .004);
    block(platform, 'Rostrum recessed front', .43, .106, .009, darkWood, 0, .103, .265, .012);
    for (const s of [-1, 1]) {
      block(platform, 'Rostrum front stile', .034, .163, .018, oldGold, s * .253, .112, .269, .005);
    }
    const apron = polygon([[-.108, 0], [.108, 0], [.108, -.15], [0, -.12], [-.108, -.15]]);
    cutout(platform, 'Rostrum scarlet pennant', apron, .003, red, 0, .232, .289);
    crown(platform, .064, 0, .169, .294);
  }

  root.add(makeFort(), makeResident());
  makeShutter(root);
  const articulated = new Set(['Paper fort', 'Resident', 'Shutter', 'ShutterFrame', 'West closing curtain', 'East closing curtain']);
  root.children.filter((child) => !articulated.has(child.name)).forEach(batchStaticSurfaces);
  return bindTheater(root);
}

export function bindTheater(root: Group): TheaterModel {
  const fort = root.getObjectByName('Paper fort') as Group;
  const resident = root.getObjectByName('Resident') as Group;
  const arm = root.getObjectByName('Resident waving arm') as Group;
  const shutter = root.getObjectByName('Shutter') as Group;
  const pennant = fort.getObjectByName('Folded pennant') as Group;
  const westCurtain = root.getObjectByName('West closing curtain') as Group;
  const eastCurtain = root.getObjectByName('East closing curtain') as Group;
  return {
    root, fort, resident, shutter,
    cannonSpots: [new Vector3(-.76, .99, -1.5), new Vector3(.76, .99, -1.5)],
    update(_time, celebrating, endingTime = 0) {
      const t = celebrating ? endingTime : 0;
      arm.rotation.z = celebrating ? 2.25 + Math.sin(t * 10) * .38 : -.13;
      resident.position.y = .74 + (celebrating ? Math.max(0, Math.sin(t * 7)) * .018 : 0);
      resident.rotation.y = celebrating ? Math.sin(t * 3.2) * .22 : 0;
      pennant.rotation.z = celebrating ? Math.sin(t * 8) * .10 * Math.min(t * 3, 1) : 0;
      const travel = Math.max(0, Math.min(1, (t - 2) / 1.25));
      const eased = travel * travel * (3 - 2 * travel);
      westCurtain.visible = eastCurtain.visible = celebrating && travel > 0;
      westCurtain.scale.x = eastCurtain.scale.x = .01 + eased * .99;
      root.userData.curtainClosure = eased;
    },
  };
}

function batchStaticSurfaces(group: Object3D): void {
  group.updateWorldMatrix(true, true);
  const inverse = group.matrixWorld.clone().invert();
  const transform = new Matrix4();
  type StaticBatch = { material: Material; shadow: boolean; receives: boolean; meshes: Mesh[] };
  const batches = new Map<string, StaticBatch>();
  group.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return;
    const attributes = Object.keys(object.geometry.attributes).sort().join(',');
    const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}:${attributes}`;
    const batch: StaticBatch = batches.get(key) ?? {
      material: object.material,
      shadow: object.castShadow,
      receives: object.receiveShadow,
      meshes: [],
    };
    batch.meshes.push(object);
    batches.set(key, batch);
  });
  let index = 0;
  for (const batch of batches.values()) {
    if (batch.meshes.length < 2) continue;
    const geometries = batch.meshes.map((source) => {
      const geometry = source.geometry.index ? source.geometry.toNonIndexed() : source.geometry.clone();
      transform.multiplyMatrices(inverse, source.matrixWorld);
      geometry.applyMatrix4(transform);
      geometry.clearGroups();
      return geometry;
    });
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((source) => source.dispose());
    if (!geometry) continue;
    const combined = new Mesh(geometry, batch.material);
    combined.name = `${group.name} · static surfaces ${++index}`;
    combined.castShadow = batch.shadow;
    combined.receiveShadow = batch.receives;
    batch.meshes.forEach((source) => source.removeFromParent());
    group.add(combined);
  }
}
