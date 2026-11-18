import {
  BufferAttribute, BufferGeometry, CircleGeometry, Color, DataTexture, DoubleSide,
  Group, InstancedMesh, LatheGeometry, LinearFilter, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, RepeatWrapping, RGBAFormat, ShaderMaterial,
  SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3,
} from '@iwsdk/core';

export type PortalModel = {
  root: Group;
  apertureRadius: number;
  update: (time: number, activity: number, selected?: boolean) => void;
};

const apertureRadius = 0.087;
const rimProfile = [
  [0.087, -0.004], [0.088, -0.006], [0.091, -0.006],
  [0.092, -0.004], [0.108, -0.004], [0.111, -0.006],
  [0.113, -0.004], [0.114, -0.001], [0.114, 0.001],
  [0.113, 0.004], [0.111, 0.006], [0.108, 0.004],
  [0.092, 0.004], [0.091, 0.006], [0.088, 0.006],
  [0.087, 0.004], [0.087, -0.004],
];
const rimGeometry = new LatheGeometry(rimProfile.map(([r, z]) => new Vector2(r, z)), 96);
rimGeometry.rotateX(Math.PI / 2);
const beadGeometry = new TorusGeometry(0.1105, 0.001, 5, 96);
const innerLipGeometry = new TorusGeometry(0.089, 0.0009, 5, 96);
const rivetGeometry = new SphereGeometry(0.0025, 10, 6);
const apertureGeometry = new CircleGeometry(apertureRadius, 64);

function brassTexture() {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  let seed = 912;
  for (let i = 0; i < size * size; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = i % size;
    const y = Math.floor(i / size);
    const grain = Math.sin(y * 1.7 + x * 0.06) * 0.018;
    const shade = 0.88 + seed / 4294967296 * 0.12 + grain;
    const offset = i * 4;
    pixels[offset] = Math.min(255, Math.round(204 * shade));
    pixels[offset + 1] = Math.round(159 * shade);
    pixels[offset + 2] = Math.round(84 * shade);
    pixels[offset + 3] = 255;
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const brass = new MeshStandardMaterial({
  color: '#efdcba', map: brassTexture(), metalness: 0.65, roughness: 0.38,
});
const raisedBrass = new MeshStandardMaterial({ color: '#d9b778', metalness: 0.62, roughness: 0.33 });
const engravedBrass = new MeshStandardMaterial({ color: '#6d4b27', metalness: 0.45, roughness: 0.64 });
const darkRed = new MeshStandardMaterial({ color: '#903e31', metalness: 0.05, roughness: 0.72 });

function leafGeometry() {
  const points = [
    [-0.0002, -0.0042, 0], [-0.002, -0.001, 0], [-0.0015, 0.002, 0],
    [0, 0.0048, 0], [0.0018, 0.0015, 0], [0.0014, -0.0018, 0],
    [0, 0, 0.0006],
  ];
  const vertices: number[] = [];
  for (let i = 0; i < 6; i++) vertices.push(...points[(i + 1) % 6], ...points[i], ...points[6]);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
  geometry.computeVertexNormals();
  return geometry;
}

const leaf = leafGeometry();
const placement = new Object3D();

function createApertureMaterial(side: 'left' | 'right') {
  return new ShaderMaterial({
    uniforms: {
      time: { value: 0 }, activity: { value: 0 }, selected: { value: 0 },
      tint: { value: new Color(side === 'left' ? '#47cedf' : '#efa65b') },
    },
    vertexShader: `varying vec2 vUv;
      varying vec3 vLocalEye;
      void main() {
        vUv = uv;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vec3 toEye = -viewPosition.xyz;
        vec3 x = modelViewMatrix[0].xyz;
        vec3 y = modelViewMatrix[1].xyz;
        vec3 z = modelViewMatrix[2].xyz;
        vLocalEye = position + vec3(
          dot(toEye, x) / dot(x, x),
          dot(toEye, y) / dot(y, y),
          dot(toEye, z) / dot(z, z));
        gl_Position = projectionMatrix * viewPosition;
      }`,
    fragmentShader: `varying vec2 vUv;
      varying vec3 vLocalEye;
      uniform float time;
      uniform float activity;
      uniform float selected;
      uniform vec3 tint;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        vec3 eye = vLocalEye / 0.087;
        float facing = abs(eye.z) / max(length(eye), 0.001);
        vec2 ray = (p - eye.xy) / max(abs(eye.z), 0.45);
        ray = mix(p * 0.28, clamp(ray, vec2(-3.0), vec2(3.0)), smoothstep(0.07, 0.30, facing));
        float a = max(dot(ray, ray), 0.00001);
        float b = dot(p, ray);
        float c = dot(p, p) - 1.01;
        float depth = min(24.0, (-b + sqrt(max(0.0, b * b - a * c))) / a);
        vec2 wall = p + ray * depth;
        float angle = atan(wall.y, wall.x + 0.00001);
        float falloff = exp(-depth * 0.23);
        float stream = pow(0.5 + 0.5 * sin(angle * 3.0 - depth * 0.80 + time * 0.65), 14.0);
        float wisps = pow(0.5 + 0.5 * sin(angle * 7.0 + depth * 0.47 - time * 0.43), 10.0);
        float lip = exp(-pow((r - 0.978) * 95.0, 2.0));
        float edge = smoothstep(0.75, 1.0, r);
        float ripple = exp(-pow((r - (1.0 - activity) * 1.2) * 17.0, 2.0)) * activity;
        vec3 color = tint * (0.012 + falloff * (0.10 + stream * 0.27 + wisps * 0.055));
        color += tint * edge * edge * (0.12 + selected * 0.10 + activity * 0.25);
        color += mix(tint, vec3(1.0), 0.45) * lip * (1.1 + activity * 0.65);
        color += mix(tint, vec3(1.0), 0.62) * ripple * 0.8;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthWrite: true, side: DoubleSide,
  });
}

export function createPortal(side: 'left' | 'right'): PortalModel {
  const root = new Group();
  root.name = side === 'left' ? 'LeftPortal' : 'RightPortal';
  const edgeColor = side === 'left' ? '#47cedf' : '#efa65b';
  const luminousLip = new MeshStandardMaterial({ color: edgeColor, emissive: edgeColor, emissiveIntensity: 0.7, metalness: 0.25, roughness: 0.3 });
  const frame = new Mesh(rimGeometry, brass);
  frame.name = 'SteppedBrassFrame';
  frame.castShadow = true;
  frame.receiveShadow = true;
  root.add(frame);
  for (let faceIndex = 0; faceIndex < 2; faceIndex++) {
    const face = new Group();
    face.name = faceIndex === 0 ? 'FrontChasing' : 'BackChasing';
    face.rotation.y = faceIndex * Math.PI;
    const outerBead = new Mesh(beadGeometry, raisedBrass);
    outerBead.name = 'OuterBead';
    outerBead.position.z = 0.006;
    const innerLip = new Mesh(innerLipGeometry, luminousLip);
    innerLip.name = 'InnerBead';
    innerLip.position.z = 0.006;
    face.add(outerBead, innerLip);
    const rivets = new InstancedMesh(rivetGeometry, raisedBrass, 10);
    rivets.name = 'DomedRivets';
    for (let index = 0; index < 10; index++) {
      const angle = index / 10 * Math.PI * 2 + Math.PI / 2;
      placement.position.set(Math.cos(angle) * 0.100, Math.sin(angle) * 0.100, 0.0045);
      placement.rotation.set(0, 0, 0);
      placement.scale.set(1, 1, 0.62);
      placement.updateMatrix();
      rivets.setMatrixAt(index, placement.matrix);
    }
    face.add(rivets);
    const leaves = new InstancedMesh(leaf, engravedBrass, 20);
    leaves.name = 'EngravedLaurels';
    for (let index = 0; index < 20; index++) {
      const arc = Math.floor(index / 10);
      const angle = 0.40 + index % 10 * 0.10 + arc * 1.44;
      placement.position.set(Math.cos(angle) * 0.100, Math.sin(angle) * 0.100, 0.0047);
      placement.rotation.set(0, 0, angle - Math.PI / 2 + (index % 2 ? 0.65 : -0.65));
      placement.scale.setScalar(1);
      placement.updateMatrix();
      leaves.setMatrixAt(index, placement.matrix);
    }
    face.add(leaves);
    const marker = new Mesh(new TorusGeometry(0.0042, 0.001, 6, 16), darkRed);
    marker.name = 'EnamelMakersMark';
    marker.position.set(0, -0.100, 0.0054);
    marker.scale.x = side === 'left' ? 0.65 : 1;
    face.add(marker);
    root.add(face);
  }
  const aperture = new Mesh(apertureGeometry, createApertureMaterial(side));
  aperture.name = 'Aperture';
  aperture.renderOrder = 1;
  aperture.userData.iwsdkPreviewBounds = 'exclude';
  root.add(aperture);
  const selection = new Mesh(
    new TorusGeometry(0.118, 0.0017, 6, 72),
    new MeshBasicMaterial({ color: edgeColor, transparent: true, opacity: 0, depthWrite: false }),
  );
  selection.name = 'SelectionAccent';
  selection.visible = false;
  selection.userData.iwsdkPreviewBounds = 'exclude';
  root.add(selection);
  return bindPortal(root);
}

export function bindPortal(root: Group): PortalModel {
  const aperture = root.getObjectByName('Aperture') as Mesh<CircleGeometry, ShaderMaterial>;
  aperture.material = aperture.material.clone();
  const uniforms = aperture.material.uniforms;
  const selection = root.getObjectByName('SelectionAccent') as Mesh<TorusGeometry, MeshBasicMaterial>;
  selection.material = selection.material.clone();
  return {
    root, apertureRadius,
    update(time, activity, selected = false) {
      const pulse = Math.min(1, Math.max(0, activity));
      uniforms.time.value = time;
      uniforms.activity.value = pulse;
      uniforms.selected.value = selected ? 1 : 0;
      selection.visible = selected || pulse > 0.02;
      selection.material.opacity = Math.max(selected ? 0.7 : 0, pulse * 0.9);
      selection.scale.setScalar(pulse > .02 ? 1 + (1 - pulse) * .18 : 1);
    },
  };
}

function stripedTexture() {
  const width = 512;
  const height = 256;
  const pixels = new Uint8Array(width * height * 4);
  let seed = 607;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const u = x / width;
      const v = y / height;
      const stripe = Math.sin(u * Math.PI * 6 + v * Math.PI * 3);
      const paint = Math.min(1, Math.max(0, stripe * 32 + 0.5));
      const grain = 0.96 + seed / 4294967296 * 0.04;
      const index = (y * width + x) * 4;
      pixels[index] = Math.round((233 + (159 - 233) * paint) * grain);
      pixels[index + 1] = Math.round((215 + (60 - 215) * paint) * grain);
      pixels[index + 2] = Math.round((177 + (43 - 177) * paint) * grain);
      pixels[index + 3] = 255;
    }
  }
  const texture = new DataTexture(pixels, width, height, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.magFilter = texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

const ballMaterial = new MeshStandardMaterial({
  map: stripedTexture(), roughness: 0.64, metalness: 0,
});
const ballGeometry = new SphereGeometry(0.026, 32, 20);

export function createBall(radius = 0.026): Mesh {
  const ball = new Mesh(ballGeometry, ballMaterial);
  ball.name = 'StripedWoodenBall';
  ball.scale.setScalar(radius / 0.026);
  ball.rotation.set(0.24, 0.12, 0.35);
  ball.castShadow = true;
  ball.receiveShadow = true;
  return ball;
}

export type TrajectoryModel = {
  root: Group;
  set: (points: Vector3[], visible: boolean, status?: 'clear' | 'target' | 'blocked', count?: number) => void;
};

export function createTrajectory(): TrajectoryModel {
  const root = new Group();
  root.name = 'ReturnTrajectory';
  root.visible = false;
  const material = new MeshBasicMaterial({ color: '#d8c7a1', transparent: true, opacity: 0.56, depthWrite: false });
  const dots = new InstancedMesh(
    new SphereGeometry(0.0028, 6, 4),
    material,
    28,
  );
  dots.name = 'TrajectoryBeads';
  dots.frustumCulled = false;
  dots.userData.iwsdkPreviewBounds = 'exclude';
  const transform = new Object3D();
  const endpointMaterial = new MeshBasicMaterial({ color: '#d8c7a1', transparent: true, opacity: 0.8, depthWrite: false, depthTest: false });
  const endpoint = new Group();
  endpoint.name = 'AimEndpoint';
  endpoint.userData.iwsdkPreviewBounds = 'exclude';
  const reticle = new Mesh(new TorusGeometry(0.026, 0.0016, 5, 40), endpointMaterial);
  reticle.name = 'AimRing';
  reticle.renderOrder = 4;
  const center = new Mesh(new SphereGeometry(0.003, 6, 4), endpointMaterial);
  center.name = 'AimCenter';
  center.renderOrder = 4;
  endpoint.add(reticle, center);
  const direction = new Vector3();
  const forward = new Vector3(0, 0, 1);
  root.add(dots, endpoint);
  return {
    root,
    set(points, visible, status = 'clear', count = points.length) {
      const length = Math.max(0, Math.min(28, points.length, Math.floor(count)));
      root.visible = visible && length > 0;
      if (!root.visible) return;
      const color = status === 'target' ? '#b5d2b0' : status === 'blocked' ? '#cf7968' : '#d8c7a1';
      material.color.set(color);
      endpointMaterial.color.set(color);
      endpointMaterial.opacity = status === 'clear' ? 0.45 : 0.92;
      dots.count = length;
      for (let index = 0; index < dots.count; index++) {
        transform.position.copy(points[index]);
        transform.scale.setScalar(1 - index / Math.max(1, dots.count) * 0.6);
        transform.updateMatrix();
        dots.setMatrixAt(index, transform.matrix);
      }
      dots.instanceMatrix.needsUpdate = true;
      endpoint.visible = length > 1;
      if (endpoint.visible) {
        endpoint.position.copy(points[length - 1]);
        direction.subVectors(points[length - 1], points[length - 2]);
        if (direction.lengthSq() > 1e-8) endpoint.quaternion.setFromUnitVectors(forward, direction.normalize());
      }
    },
  };
}
