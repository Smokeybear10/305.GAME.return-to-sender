import { AnimatedHand, Group, Matrix4, MeshStandardMaterial, Quaternion, SkinnedMesh, Vector3, type World } from '@iwsdk/core';

const gloveMaterial = new MeshStandardMaterial({ color: '#c4b99f', roughness: .88, metalness: 0 });

class TheaterHand extends AnimatedHand {
  static assetKeyPrefix = 'return-to-sender-glove';

  override init(): void {
    this.model.traverse(object => {
      if (!(object instanceof SkinnedMesh)) return;
      object.material = gloveMaterial;
      object.frustumCulled = false;
      object.castShadow = false;
      object.receiveShadow = false;
    });
  }
}

type PalmState = { tracked: boolean; raised: boolean; poseReset: boolean };

type HandFilter = {
  position: Vector3;
  rotation: Quaternion;
  previousPosition: Vector3;
  previousRotation: Quaternion;
  speed: number;
  angularSpeed: number;
  valid: boolean;
};

const createFilter = (): HandFilter => ({
  position: new Vector3(), rotation: new Quaternion(),
  previousPosition: new Vector3(), previousRotation: new Quaternion(),
  speed: 0, angularSpeed: 0, valid: false,
});

export class PalmInput {
  private readonly result: PalmState = { tracked: false, raised: false, poseReset: false };
  private readonly filters = { left: createFilter(), right: createFilter() };
  private referenceSpace?: XRReferenceSpace;
  private readonly onReferenceReset = () => this.reset();
  private readonly wristPosition = new Vector3();
  private readonly middlePosition = new Vector3();
  private readonly indexPosition = new Vector3();
  private readonly pinkyPosition = new Vector3();
  private readonly center = new Vector3();
  private readonly up = new Vector3();
  private readonly right = new Vector3();
  private readonly normal = new Vector3();
  private readonly wristNormal = new Vector3();
  private readonly orientation = new Quaternion();
  private readonly palmMatrix = new Matrix4();
  private readonly parentInverse = new Matrix4();
  private readonly unusedScale = new Vector3();
  private readonly headPosition = new Vector3();
  private leftHeight = 0;
  private rightHeight = 0;

  constructor(private readonly world: World) {
    world.input.xr.visualAdapters.hand.left.updateVisualImplementation(TheaterHand);
    world.input.xr.visualAdapters.hand.right.updateVisualImplementation(TheaterHand);
  }

  reset(): void {
    this.filters.left.valid = this.filters.right.valid = false;
  }

  dispose(): void {
    this.referenceSpace?.removeEventListener('reset', this.onReferenceReset);
    this.referenceSpace = undefined;
    this.reset();
  }

  update(left: Group, right: Group, delta = 1 / 90): PalmState {
    const frame = this.world.xrFrame;
    const referenceSpace = this.world.xrReferenceSpace;
    this.result.tracked = false;
    this.result.raised = false;
    this.result.poseReset = false;
    if (!frame?.getJointPose || !referenceSpace) {
      left.visible = false;
      right.visible = false;
      this.reset();
      return this.result;
    }
    if (referenceSpace !== this.referenceSpace) {
      this.referenceSpace?.removeEventListener('reset', this.onReferenceReset);
      this.referenceSpace = referenceSpace;
      referenceSpace.addEventListener('reset', this.onReferenceReset);
      this.reset();
    }
    if (delta > .08) this.reset();
    const dt = Math.max(1 / 240, Math.min(delta, .05));

    this.world.player.updateWorldMatrix(true, false);
    const leftTracked = this.updateHand('left', left, frame, referenceSpace, dt);
    const rightTracked = this.updateHand('right', right, frame, referenceSpace, dt);
    this.filters.left.valid = leftTracked;
    this.filters.right.valid = rightTracked;
    this.result.tracked = leftTracked && rightTracked;
    if (!this.result.tracked) return this.result;

    this.world.player.head.getWorldPosition(this.headPosition);
    const raisedHeight = this.headPosition.y - 0.12;
    this.result.raised = this.leftHeight > raisedHeight && this.rightHeight > raisedHeight;
    return this.result;
  }

  private updateHand(side: 'left' | 'right', portal: Group, frame: XRFrame, referenceSpace: XRReferenceSpace, dt: number): boolean {
    portal.visible = false;
    const hand = this.world.input.xr.getPrimaryInputSource(side)?.hand;
    if (!hand || !frame.getJointPose) return false;
    const wrist = hand.get('wrist');
    const middle = hand.get('middle-finger-metacarpal');
    const index = hand.get('index-finger-metacarpal');
    const pinky = hand.get('pinky-finger-metacarpal');
    if (!wrist || !middle || !index || !pinky) return false;
    const wristPose = frame.getJointPose(wrist, referenceSpace);
    const middlePose = frame.getJointPose(middle, referenceSpace);
    const indexPose = frame.getJointPose(index, referenceSpace);
    const pinkyPose = frame.getJointPose(pinky, referenceSpace);
    if (!wristPose || !middlePose || !indexPose || !pinkyPose) return false;

    this.wristPosition.copy(wristPose.transform.position);
    this.middlePosition.copy(middlePose.transform.position);
    this.indexPosition.copy(indexPose.transform.position);
    this.pinkyPosition.copy(pinkyPose.transform.position);
    this.orientation.copy(wristPose.transform.orientation);
    if (!Number.isFinite(this.wristPosition.lengthSq() + this.middlePosition.lengthSq()
      + this.indexPosition.lengthSq() + this.pinkyPosition.lengthSq() + this.orientation.lengthSq())
      || this.orientation.lengthSq() < 0.0001) return false;

    this.orientation.normalize();
    // WebXR joint -Y points out of the palm; use it to disambiguate the joint-plane normal.
    this.wristNormal.set(0, -1, 0).applyQuaternion(this.orientation);
    this.up.subVectors(this.middlePosition, this.wristPosition);
    this.right.subVectors(this.indexPosition, this.pinkyPosition);
    this.normal.crossVectors(this.right, this.up);
    if (this.up.lengthSq() < 0.000025 || this.normal.lengthSq() < 0.000000001) return false;
    this.normal.normalize();
    if (this.normal.dot(this.wristNormal) < 0) this.normal.negate();
    this.right.crossVectors(this.up, this.normal).normalize();
    this.up.crossVectors(this.normal, this.right).normalize();
    this.center.addVectors(this.wristPosition, this.middlePosition).multiplyScalar(0.5);
    this.center.addScaledVector(this.normal, 0.05);

    // The portal lies in local XY, with local +Z facing out of the tracked palm.
    this.palmMatrix.makeBasis(this.right, this.up, this.normal).setPosition(this.center);
    this.palmMatrix.premultiply(this.world.player.matrixWorld);
    const height = this.palmMatrix.elements[13];
    if (side === 'left') this.leftHeight = height;
    else this.rightHeight = height;
    if (portal.parent) {
      portal.parent.updateWorldMatrix(true, false);
      this.parentInverse.copy(portal.parent.matrixWorld).invert();
      this.palmMatrix.premultiply(this.parentInverse);
    }
    this.palmMatrix.decompose(portal.position, portal.quaternion, this.unusedScale);
    this.stabilize(this.filters[side], portal, dt);
    portal.visible = true;
    return true;
  }

  private stabilize(filter: HandFilter, portal: Group, dt: number): void {
    const distance = filter.previousPosition.distanceTo(portal.position);
    const angle = filter.previousRotation.angleTo(portal.quaternion);
    if (!filter.valid || distance > .18 || angle > 1.2) {
      filter.position.copy(portal.position);
      filter.rotation.copy(portal.quaternion);
      filter.speed = filter.angularSpeed = 0;
      this.result.poseReset = true;
    } else {
      const velocityBlend = 1 - Math.exp(-2 * Math.PI * 8 * dt);
      filter.speed += (distance / dt - filter.speed) * velocityBlend;
      filter.angularSpeed += (angle / dt - filter.angularSpeed) * velocityBlend;
      const positionBlend = 1 - Math.exp(-2 * Math.PI * (8 + filter.speed * 12) * dt);
      const rotationBlend = 1 - Math.exp(-2 * Math.PI * (6 + filter.angularSpeed * 1.6) * dt);
      filter.position.lerp(portal.position, positionBlend);
      filter.rotation.slerp(portal.quaternion, rotationBlend);
    }
    filter.previousPosition.copy(portal.position);
    filter.previousRotation.copy(portal.quaternion);
    portal.position.copy(filter.position);
    portal.quaternion.copy(filter.rotation);
  }
}
