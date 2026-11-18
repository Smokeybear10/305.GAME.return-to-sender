import { BufferAttribute, BufferGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial } from '@iwsdk/core';

export type CatchCueModel = { root: Group; update: (visibility: number, progress: number) => void };

const bracketPositions: number[] = [];
const tickPositions: number[] = [];
for (let quarter = 0; quarter < 4; quarter++) {
  const center = quarter * Math.PI / 2;
  for (let segment = 0; segment < 16; segment++) {
    const start = center - .43 + segment / 16 * .86;
    const end = center - .43 + (segment + 1) / 16 * .86;
    const width0 = .001 + Math.sin(segment / 16 * Math.PI) * .0015;
    const width1 = .001 + Math.sin((segment + 1) / 16 * Math.PI) * .0015;
    const ax = Math.cos(start), ay = Math.sin(start);
    const bx = Math.cos(end), by = Math.sin(end);
    bracketPositions.push(
      ax * (.104 - width0), ay * (.104 - width0), 0, ax * .104, ay * .104, 0, bx * .104, by * .104, 0,
      ax * (.104 - width0), ay * (.104 - width0), 0, bx * .104, by * .104, 0, bx * (.104 - width1), by * (.104 - width1), 0,
    );
  }
  const x = Math.cos(center), y = Math.sin(center);
  const innerX = x * .077, innerY = y * .077, outerX = x * .086, outerY = y * .086;
  const dx = -y * .0012, dy = x * .0012;
  tickPositions.push(
    innerX - dx, innerY - dy, .0005, outerX - dx, outerY - dy, .0005, outerX + dx, outerY + dy, .0005,
    innerX - dx, innerY - dy, .0005, outerX + dx, outerY + dy, .0005, innerX + dx, innerY + dy, .0005,
  );
}
const bracketGeometry = new BufferGeometry();
bracketGeometry.setAttribute('position', new BufferAttribute(new Float32Array(bracketPositions), 3));
bracketGeometry.computeVertexNormals();
const tickGeometry = new BufferGeometry();
tickGeometry.setAttribute('position', new BufferAttribute(new Float32Array(tickPositions), 3));
tickGeometry.computeVertexNormals();

export function createCatchCue(): CatchCueModel {
  const root = new Group();
  root.name = 'CatchCue';
  const material = new MeshBasicMaterial({ color: '#ebdfbf', transparent: true, opacity: .65, depthWrite: false, side: DoubleSide, toneMapped: false });
  const brackets = new Mesh(bracketGeometry, material);
  brackets.name = 'CatchBrackets';
  const ticks = new Mesh(tickGeometry, material);
  ticks.name = 'ChargeTicks';
  root.add(brackets, ticks);
  return bindCatchCue(root);
}

export function bindCatchCue(root: Group): CatchCueModel {
  const brackets = root.getObjectByName('CatchBrackets') as Mesh<BufferGeometry, MeshBasicMaterial>;
  const ticks = root.getObjectByName('ChargeTicks') as Mesh<BufferGeometry, MeshBasicMaterial>;
  brackets.material = brackets.material.clone();
  ticks.material = ticks.material.clone();
  return {
    root,
    update(visibility, progress) {
      const alpha = Math.min(1, Math.max(0, visibility));
      const charge = Math.min(1, Math.max(0, progress));
      root.visible = alpha > .001;
      brackets.material.opacity = alpha * (.36 + charge * .34);
      ticks.material.opacity = alpha * (.35 + charge * .5);
      ticks.scale.setScalar(1.1 - charge * .34);
    },
  };
}
