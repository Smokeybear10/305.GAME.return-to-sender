import { AssetManager, CanvasTexture, Group, MathUtils, Mesh, Quaternion, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, createSystem } from '@iwsdk/core';
import { bindCannon, type CannonModel } from './art/cannon';
import { bindTheater, type TheaterModel } from './art/theater';
import { bindPortal, createTrajectory, type PortalModel } from './art/portal';
import { bindCatchCue, type CatchCueModel } from './art/catch-cue';
import { PalmInput } from './hand-input';
import { ToyAudio } from './sound';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const sides = ['left', 'right'] as const;
const titles = ['A lesson in manners', 'Mind the shutters', 'The last word'];
const radius = .026;
const transferDuration = .11;
const windupDuration = 1.2;
const windupTicks = [0, .25, .46, .64, .79, .92, 1.03, 1.11] as const;
const catchPatterns = [
  [[.25, 1.12]],
  [[.38, 1.12], [.20, 1.30]],
  [[.20, 1.30], [.38, 1.06], [.38, 1.30]],
] as const;
const axes = ['x', 'y', 'z'] as const;
const forward = new Vector3(0, 0, 1);
type Phase = 'ready' | 'playing' | 'intermission' | 'won' | 'lost';
type CannonState = { model: CannonModel; life: number; fireAt: number; recoil: number; target: Vector3; windStep: number; shot: number; catchPoint: Vector3; incoming: Ball | null; cue: CatchCueModel };
type Ball = { mesh: Mesh; ghost: Mesh; active: boolean; returned: boolean; velocity: Vector3; previous: Vector3; age: number; transfer: number; entrance: number; offset: Vector3; lock: number; source: number; catchPoint: Vector3 };

export class ReturnGame extends createSystem({}) {
  private theater!: TheaterModel;
  private cannons: CannonState[] = [];
  private portals: PortalModel[] = [];
  private balls: Ball[] = [];
  private trajectory = createTrajectory();
  private secondTrajectory = createTrajectory();
  private guide = Array.from({ length: 28 }, () => new Vector3());
  private palms!: PalmInput;
  private audio = new ToyAudio();
  private audioSource = new Vector3();
  private audioOffset = new Vector3();
  private listenerPosition = new Vector3();
  private listenerRotation = new Quaternion();
  private phase: Phase = 'ready';
  private act = 0;
  private health = 5;
  private returns = 0;
  private hits = 0;
  private streak = 0;
  private runBest = 0;
  private bestStreak = 0;
  private practice = true;
  private finaleShot = 0;
  private finaleNext = 0;
  private finalePending = false;
  private endingTime = 0;
  private shutterTargetX = .37;
  private shutterFrame!: Group;
  private elapsed = 0;
  private clock = 0;
  private nextAct = 0;
  private selected = 0;
  private paused = false;
  private tracked = true;
  private ready = false;
  private dragging = false;
  private helpPaused = false;
  private hovered = -1;
  private activePointer: number | null = null;
  private dragOffset = new Vector3();
  private aimPoints = [new Vector3(), new Vector3()];
  private projected = new Vector3();
  private canvasBounds = { left: 0, top: 0, width: 1, height: 1 };
  private feedbackTime = 0;
  private guideStatus: 'clear' | 'target' | 'blocked' = 'clear';
  private guideCount = 0;
  private xr = false;
  private raisedTime = 0;
  private gestureArmed = true;
  private activity = [0, 0];
  private pointer = { x: 0, y: 0 };
  private normal = new Vector3();
  private startPoint = new Vector3();
  private direction = new Vector3();
  private temp = new Vector3();
  private point = new Vector3();
  private inverse = new Quaternion();
  private previousPortalPositions = [new Vector3(), new Vector3()];
  private previousPortalRotations = [new Quaternion(), new Quaternion()];
  private sweepPosition = new Vector3();
  private sweepRotation = new Quaternion();
  private sweepNormal = new Vector3();
  private sweepPoint = new Vector3();
  private sweepOffset = new Vector3();
  private captureOffset = new Vector3();
  private portalSweepActive = false;
  private sweepSession: XRSession | null = null;
  private resetPortalSweep = () => { this.portalSweepActive = false; this.palms?.reset(); };
  private shutterOpen = 0;
  private shutterOpenUntil = 0;
  private statusText = '';
  private statusCanvas = document.createElement('canvas');
  private statusTexture!: CanvasTexture;
  private statusSprite!: Sprite;

  init() {
    this.setup().catch((error: unknown) => {
      $('loading').textContent = `The stage could not load. ${error instanceof Error ? error.message : 'Please reload.'}`;
      console.error(error);
    });
  }

  private async setup() {
    for (const [kind, assetId] of [['complaint', 'voice-complaint'], ['taunt', 'voice-taunt']] as const) {
      void AssetManager.loadAudioById(assetId)
        .then(buffer => this.audio.setCharacterVoice(kind, buffer))
        .catch((error: unknown) => console.warn(`Could not load ${assetId}; continuing with game sounds.`, error));
    }
    this.theater = bindTheater(this.world.requireSceneObject<Group>('theater'));
    this.shutterFrame = this.theater.root.getObjectByName('ShutterFrame') as Group;
    try {
      const saved = Number(localStorage.getItem('return-to-sender.best-streak'));
      if (Number.isInteger(saved) && saved >= 0 && saved <= 8) this.bestStreak = saved;
    } catch { /* Storage can be disabled by the browser. */ }
    this.portals = sides.map(side => bindPortal(this.world.requireSceneObject<Group>(`portal-${side}`)));
    this.cannons = sides.map(side => ({ model: bindCannon(this.world.requireSceneObject<Group>(`cannon-${side}`)), life: 1, fireAt: 0, recoil: 0, target: new Vector3(), windStep: 0, shot: 0, catchPoint: new Vector3(), incoming: null, cue: bindCatchCue(this.world.requireSceneObject<Group>(`catch-cue-${side}`)) }));
    for (const cannon of this.cannons) cannon.cue.update(0, 0);
    this.palms = new PalmInput(this.world);
    this.cleanupFuncs.push(() => this.palms.dispose());
    for (let i = 0; i < 8; i++) {
      const mesh = await this.world.assets.instantiate<Mesh>('ball');
      const ghost = mesh.clone();
      mesh.name = `Cannonball ${i + 1}`; ghost.name = `Emerging cannonball ${i + 1}`;
      mesh.visible = ghost.visible = false; mesh.castShadow = ghost.castShadow = true;
      this.world.createTransformEntity(mesh); this.world.createTransformEntity(ghost);
      this.balls.push({ mesh, ghost, active: false, returned: false, velocity: new Vector3(), previous: new Vector3(), age: 0, transfer: 0, entrance: 0, offset: new Vector3(), lock: 0, source: -1, catchPoint: new Vector3() });
    }
    this.world.createTransformEntity(this.trajectory.root);
    this.world.createTransformEntity(this.secondTrajectory.root);
    this.statusCanvas.width = 1024; this.statusCanvas.height = 160;
    this.statusTexture = new CanvasTexture(this.statusCanvas); this.statusTexture.colorSpace = SRGBColorSpace;
    this.statusSprite = new Sprite(new SpriteMaterial({ map: this.statusTexture, transparent: true, depthTest: false, toneMapped: false }));
    this.statusSprite.position.set(0, 1.94, -1.25); this.statusSprite.scale.set(1.05, .164, 1); this.statusSprite.visible = false;
    this.world.createTransformEntity(this.statusSprite);
    const container = $('scene-container');
    const desktopFov = this.camera.fov;
    const resize = new ResizeObserver(() => {
      if (this.renderer.xr.isPresenting) return;
      const width = container.clientWidth;
      const height = Math.max(1, container.clientHeight);
      this.renderer.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.fov = MathUtils.radToDeg(2 * Math.atan(Math.tan(MathUtils.degToRad(desktopFov) / 2) * Math.max(1, 1.65 / this.camera.aspect)));
      this.camera.updateProjectionMatrix();
      this.readCanvasBounds();
    });
    resize.observe(container);
    this.cleanupFuncs.push(() => resize.disconnect());
    this.bindControls(); this.resetPortals(); this.ready = true; this.updateHud();
    $('loading').classList.add('loaded'); document.body.dataset.ready = 'true';
    if (import.meta.env.DEV) Object.defineProperty(window, '__rts', { configurable: true, get: () => this.debugState() });
    this.setMessage('Raise both hands to start.');
    const supported = navigator.xr ? await navigator.xr.isSessionSupported('immersive-vr').catch(() => false) : false;
    $('vr').toggleAttribute('disabled', !supported);
    document.body.dataset.vrSupported = String(supported);
    $('vr-note').textContent = supported ? 'Hand tracking available' : 'VR requires a supported headset';
  }

  private debugState() {
    const canvas = this.renderer.domElement.getBoundingClientRect();
    const screen = (position: Vector3) => {
      position.project(this.camera);
      return { x: canvas.left + (position.x + 1) * canvas.width * .5, y: canvas.top + (1 - position.y) * canvas.height * .5 };
    };
    return {
      phase: this.phase, act: this.act, clock: this.clock, elapsed: this.elapsed, health: this.health,
      returns: this.returns, hits: this.hits, paused: this.paused, tracked: this.tracked, xr: this.xr,
      streak: this.streak, runBest: this.runBest, bestStreak: this.bestStreak, practice: this.practice,
      finaleShot: this.finaleShot, finaleNext: this.finaleNext, finalePending: this.finalePending, endingTime: this.endingTime,
      selected: this.selected, dragging: this.dragging, hovered: this.hovered,
      guide: { status: this.guideStatus, count: this.guideCount },
      camera: { position: this.camera.position.toArray(), quaternion: this.camera.quaternion.toArray(), fov: this.camera.fov, aspect: this.camera.aspect },
      canvas: { left: canvas.left, top: canvas.top, width: canvas.width, height: canvas.height },
      screenPoints: {
        portals: this.portals.map(p => screen(p.root.getWorldPosition(new Vector3()))),
        targets: this.cannons.map(c => screen(c.model.target.getWorldPosition(new Vector3()))),
      },
      portals: this.portals.map((p, i) => ({ position: p.root.position.toArray(), quaternion: p.root.quaternion.toArray(), aim: this.aimPoints[i].toArray() })),
      cannons: this.cannons.map(c => ({ life: c.life, fireAt: c.fireAt, shot: c.shot, catchPoint: c.catchPoint.toArray(), muzzle: c.model.muzzle.getWorldPosition(new Vector3()).toArray(), cue: { visible: c.cue.root.visible, position: c.cue.root.position.toArray() }, reaction: c.model.root.userData.reaction, barrelRotation: c.model.barrel.rotation.toArray(), hatPosition: c.model.hat.position.toArray(), target: c.model.target.getWorldPosition(new Vector3()).toArray() })),
      balls: this.balls.filter(b => b.active).map(b => ({ source: b.source, catchPoint: b.catchPoint.toArray(), position: b.mesh.position.toArray(), velocity: b.velocity.toArray(), returned: b.returned, transfer: b.transfer, ghost: { visible: b.ghost.visible, position: b.ghost.position.toArray(), scale: b.ghost.scale.toArray() } })),
      shutterX: this.theater.shutter.position.x, shutterY: this.theater.shutter.position.y,
      curtainClosure: this.theater.root.userData.curtainClosure, render: this.renderer.info.render,
    };
  }

  private bindControls() {
    const on = <K extends keyof HTMLElementEventMap>(element: HTMLElement, event: K, listener: (event: HTMLElementEventMap[K]) => void) => {
      element.addEventListener(event, listener); this.cleanupFuncs.push(() => element.removeEventListener(event, listener));
    };
    on($('start'), 'click', () => this.start()); on($('replay'), 'click', () => this.start());
    on($('pause'), 'click', () => this.togglePause());
    on($('select-left'), 'click', () => { if (this.desktopActive()) this.select(0); });
    on($('select-right'), 'click', () => { if (this.desktopActive()) this.select(1); });
    on($('sound'), 'click', () => {
      this.audio.unlock(); this.audio.setEnabled(!this.audio.enabled);
      $('sound').setAttribute('aria-label', this.audio.enabled ? 'Turn sound off' : 'Turn sound on');
      $('sound').textContent = this.audio.enabled ? 'Sound on' : 'Sound off'; $('sound').style.opacity = this.audio.enabled ? '1' : '.4';
    });
    on($('vr'), 'click', () => { this.audio.unlock(); this.world.launchXR(); });
    const help = $<HTMLDialogElement>('help');
    on($('help-button'), 'click', () => {
      this.helpPaused = !this.paused && (this.phase === 'playing' || this.phase === 'intermission');
      if (this.helpPaused) this.togglePause();
      help.showModal();
    });
    on($('close-help'), 'click', () => help.close());
    on(help, 'close', () => {
      if (this.helpPaused && this.paused) this.togglePause();
      this.helpPaused = false;
    });
    const down = (event: KeyboardEvent) => {
      if (help.open || this.xr || event.repeat) return;
      if (event.code === 'Space') { event.preventDefault(); this.phase === 'ready' ? this.start() : this.togglePause(); }
      if (event.code === 'KeyR' && this.phase !== 'ready') this.start();
      if (!this.desktopActive()) return;
      if (event.code === 'KeyQ') this.select(0); if (event.code === 'KeyE') this.select(1);
      if (event.code === 'ArrowUp' || event.code === 'ArrowDown') event.preventDefault();
    };
    window.addEventListener('keydown', down);
    this.cleanupFuncs.push(() => window.removeEventListener('keydown', down));
    const canvas = this.renderer.domElement;
    const pointer = (event: PointerEvent) => {
      this.readCanvasBounds();
      this.pointer.x = (event.clientX - this.canvasBounds.left) / this.canvasBounds.width * 2 - 1;
      this.pointer.y = -(event.clientY - this.canvasBounds.top) / this.canvasBounds.height * 2 + 1;
    };
    const move = (event: PointerEvent) => {
      if (!this.desktopActive()) return;
      pointer(event);
      this.hovered = this.portalAtPointer(event.clientX, event.clientY);
      canvas.style.cursor = this.dragging ? 'grabbing' : this.hovered >= 0 ? 'grab' : 'crosshair';
      if (this.dragging || this.hovered < 0) this.movePortal();
    };
    on(canvas, 'pointerdown', event => {
      if (event.button !== 0 || !this.desktopActive()) return;
      pointer(event);
      this.hovered = this.portalAtPointer(event.clientX, event.clientY);
      if (this.hovered < 0) { this.movePortal(); return; }
      this.select(this.hovered);
      const portal = this.portals[this.selected].root;
      if (!this.pointerAtDepth(portal.position.z)) return;
      this.dragOffset.copy(portal.position).sub(this.point);
      this.dragging = true; this.activePointer = event.pointerId;
      canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing';
    });
    on(canvas, 'pointermove', move);
    on(canvas, 'pointerup', () => this.endDrag());
    on(canvas, 'pointercancel', () => this.endDrag());
    on(canvas, 'lostpointercapture', () => this.endDrag());
    on(canvas, 'pointerleave', () => { if (!this.dragging) { this.hovered = -1; canvas.style.cursor = 'default'; } });
    const wheel = (event: WheelEvent) => {
      if (!this.desktopActive()) return;
      event.preventDefault();
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.canvasBounds.height : 1;
      this.changeDepth(MathUtils.clamp(event.deltaY * units * .0006, -.08, .08));
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    const blur = () => {
      this.resetPortalSweep();
      this.endDrag(); this.helpPaused = false;
      if ((this.phase === 'playing' || this.phase === 'intermission') && !this.xr) {
        this.paused = true; this.updateHud(); this.setMessage('Paused. Press Space to resume.');
      }
    };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', this.resetPortalSweep);
    this.cleanupFuncs.push(
      () => canvas.removeEventListener('wheel', wheel),
      () => window.removeEventListener('blur', blur),
      () => document.removeEventListener('visibilitychange', this.resetPortalSweep),
      () => this.sweepSession?.removeEventListener('visibilitychange', this.resetPortalSweep),
      () => this.audio.dispose(),
    );
  }

  private select(index: number) {
    if (index !== this.selected) this.endDrag();
    this.selected = index;
    $('select-left').classList.toggle('selected', index === 0); $('select-right').classList.toggle('selected', index === 1);
    $('select-left').setAttribute('aria-pressed', String(index === 0)); $('select-right').setAttribute('aria-pressed', String(index === 1));
  }

  private desktopActive() {
    return !this.xr && !this.paused && !$<HTMLDialogElement>('help').open && (this.phase === 'playing' || this.phase === 'intermission');
  }

  private readCanvasBounds() {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.canvasBounds.left = rect.left; this.canvasBounds.top = rect.top;
    this.canvasBounds.width = Math.max(1, rect.width); this.canvasBounds.height = Math.max(1, rect.height);
  }

  private portalAtPointer(x: number, y: number) {
    let nearest = Infinity, hit = -1;
    for (let i = 0; i < this.portals.length; i++) {
      const portal = this.portals[i].root;
      if (!portal.visible) continue;
      portal.getWorldPosition(this.temp);
      this.projected.copy(this.temp).project(this.camera);
      if (this.projected.z < -1 || this.projected.z > 1) continue;
      const px = this.canvasBounds.left + (this.projected.x + 1) * this.canvasBounds.width * .5;
      const py = this.canvasBounds.top + (1 - this.projected.y) * this.canvasBounds.height * .5;
      this.normal.setFromMatrixColumn(this.camera.matrixWorld, 0);
      this.point.copy(this.temp).addScaledVector(this.normal, .12).project(this.camera);
      const pickRadius = Math.max(24, Math.abs(this.point.x - this.projected.x) * this.canvasBounds.width * .5);
      const distance = (x - px) ** 2 + (y - py) ** 2;
      if (distance <= pickRadius ** 2 && distance < nearest) { nearest = distance; hit = i; }
    }
    return hit;
  }

  private endDrag() {
    const pointer = this.activePointer;
    this.activePointer = null; this.dragging = false;
    const canvas = this.renderer.domElement;
    if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
    canvas.style.cursor = this.desktopActive() && this.hovered >= 0 ? 'grab' : 'default';
  }

  private pointerAtDepth(z: number) {
    this.startPoint.setFromMatrixPosition(this.camera.matrixWorld);
    this.direction.set(this.pointer.x, this.pointer.y, .5).unproject(this.camera).sub(this.startPoint).normalize();
    if (Math.abs(this.direction.z) < .001) return false;
    this.point.copy(this.startPoint).addScaledVector(this.direction, (z - this.startPoint.z) / this.direction.z);
    return true;
  }

  private movePortal() {
    const portal = this.portals[this.selected].root;
    this.cannons[0].model.target.getWorldPosition(this.temp);
    if (!this.pointerAtDepth(this.dragging ? portal.position.z : this.temp.z)) return;
    if (this.dragging) {
      this.point.add(this.dragOffset);
      portal.position.x = MathUtils.clamp(this.point.x, -.8, .8); portal.position.y = MathUtils.clamp(this.point.y, .85, 1.65);
    } else {
      this.point.x = MathUtils.clamp(this.point.x, -1.35, 1.35); this.point.y = MathUtils.clamp(this.point.y, .8, 2);
      this.aimPoints[this.selected].copy(this.point);
    }
    portal.lookAt(this.aimPoints[this.selected]);
  }

  private changeDepth(amount: number) {
    const portal = this.portals[this.selected].root;
    portal.position.z = MathUtils.clamp(portal.position.z + amount, -1.02, -.36);
    portal.lookAt(this.aimPoints[this.selected]);
  }

  private resetPortals() {
    this.resetPortalSweep();
    this.portals[0].root.position.set(-.25, 1.12, -.65); this.portals[1].root.position.set(.25, 1.12, -.65);
    for (let i = 0; i < this.portals.length; i++) {
      const portal = this.portals[i].root;
      portal.rotation.set(0, Math.PI, 0); portal.visible = true;
      this.aimPoints[i].copy(portal.position); this.aimPoints[i].z -= 1;
    }
  }

  private start() {
    if (!this.ready || (this.phase === 'won' && this.endingTime < 3.5)) return;
    this.resetPortalSweep();
    this.audio.stop(); this.audio.unlock(); this.phase = 'playing'; this.act = 0; this.health = 5; this.returns = 0; this.hits = 0; this.elapsed = 0; this.clock = 0; this.paused = false;
    this.streak = 0; this.runBest = 0; this.practice = true; this.finaleShot = 0; this.finaleNext = 0; this.finalePending = false; this.endingTime = 0;
    this.endDrag(); this.helpPaused = false; this.feedbackTime = 0; $('feedback').classList.add('hidden');
    this.gestureArmed = false; this.clearBalls(); this.beginAct();
    if (!this.xr) this.resetPortals();
    document.body.classList.add('playing'); document.body.classList.remove('ended');
    $('intro').classList.add('hidden'); $('ending').classList.add('hidden'); $('hud').classList.remove('hidden'); $('controls').classList.remove('hidden'); $('instruction').classList.remove('hidden');
    this.select(1); this.setMessage(this.xr ? 'First, catch the slow shot.' : 'Practice shot. Catch with the left portal and aim the right at a cannon.'); this.updateHud();
  }

  private beginAct() {
    for (let i = 0; i < 2; i++) {
      const cannon = this.cannons[i]; cannon.model.reset(); cannon.life = this.act === 2 ? 2 : 1;
      cannon.fireAt = this.clock + 3 + i * (this.act === 2 ? 1.8 : 3); cannon.recoil = 0; cannon.windStep = 0; cannon.shot = 0; cannon.incoming = null;
      this.chooseCatchPoint(i); cannon.cue.update(0, 0);
    }
    if (this.practice) this.cannons[1].fireAt = Infinity;
    this.theater.shutter.visible = this.act > 0;
    this.shutterFrame.visible = this.act > 0;
    this.shutterTargetX = .37; this.theater.shutter.position.x = .37; this.shutterFrame.position.x = -.28;
    if (this.act === 2) this.scheduleFinale(0, 3);
    this.shutterOpen = 0; this.shutterOpenUntil = 0; this.theater.shutter.position.y = 1.30; this.updateHud();
  }

  private scheduleFinale(preferred: number, delay: number) {
    const shooter = this.cannons[preferred].life > 0 ? preferred : 1 - preferred;
    if (this.cannons[shooter].life <= 0) return;
    this.finaleNext = shooter; this.finalePending = false;
    for (const cannon of this.cannons) cannon.fireAt = Infinity;
    this.cannons[shooter].fireAt = this.clock + delay;
    this.shutterTargetX = shooter === 0 ? -.37 : .37;
  }

  private resolveShot(ball: Ball) {
    const shooter = ball.source;
    this.removeBall(ball);
    if (this.practice) {
      this.cannons[0].fireAt = this.clock + 2;
    } else if (this.act === 2 && this.finalePending) {
      this.scheduleFinale(1 - shooter, 2.2);
    }
  }

  private breakStreak() {
    if (this.streak === 0) return;
    this.streak = 0; this.updateHud();
  }

  private scoreHit() {
    this.hits++; this.streak++;
    this.runBest = Math.max(this.runBest, this.streak);
    if (this.streak <= this.bestStreak) return;
    this.bestStreak = this.streak;
    try { localStorage.setItem('return-to-sender.best-streak', String(this.bestStreak)); }
    catch { /* Keep the score for this session when storage is unavailable. */ }
  }

  private togglePause() {
    if (this.phase !== 'playing' && this.phase !== 'intermission') return;
    this.resetPortalSweep();
    this.paused = !this.paused; this.endDrag(); this.updateHud();
    this.setMessage(this.paused ? 'Paused. Press Space to resume.' : this.act > 0 ? 'Follow the catch marks. Aim around the shutter.' : 'Catch with one portal. Aim the other at a cannon.');
  }

  private clearBalls() { for (const ball of this.balls) this.removeBall(ball); }

  private soundSide(source: Vector3): -1 | 0 | 1 {
    const listener = this.xr ? this.world.player.head : this.camera;
    listener.getWorldPosition(this.listenerPosition);
    listener.getWorldQuaternion(this.listenerRotation).invert();
    this.audioOffset.subVectors(source, this.listenerPosition).applyQuaternion(this.listenerRotation);
    return this.audioOffset.x < -.08 ? -1 : this.audioOffset.x > .08 ? 1 : 0;
  }

  private chooseCatchPoint(index: number) {
    const cannon = this.cannons[index];
    const pattern = catchPatterns[this.act];
    const [x, y] = pattern[(cannon.shot + index) % pattern.length];
    cannon.catchPoint.set(index === 0 ? -x : x, y, -.65);
  }

  private updateCatchCues() {
    for (const cannon of this.cannons) {
      let visibility = 0, progress = 0;
      const incoming = cannon.incoming;
      if (this.phase === 'playing') {
        if (incoming && incoming.mesh.position.z <= incoming.catchPoint.z + radius) {
          cannon.cue.root.position.copy(incoming.catchPoint);
          visibility = 1; progress = 1;
        } else if (cannon.life > 0) {
          progress = MathUtils.clamp(1 - (cannon.fireAt - this.clock) / windupDuration, 0, 1);
          visibility = Math.min(1, progress * 5);
          cannon.cue.root.position.copy(cannon.catchPoint);
        }
      }
      cannon.cue.update(visibility, progress);
    }
  }

  private fire(index: number) {
    const cannon = this.cannons[index]; const ball = this.balls.find(item => !item.active); if (!ball) return;
    cannon.model.muzzle.getWorldPosition(ball.mesh.position); ball.catchPoint.copy(cannon.catchPoint); ball.source = index; cannon.incoming = ball;
    ball.velocity.copy(ball.catchPoint).sub(ball.mesh.position).normalize().multiplyScalar(this.practice ? .36 : this.act === 2 ? .72 : .48);
    ball.mesh.visible = ball.active = true; ball.mesh.scale.setScalar(1); ball.ghost.visible = false;
    ball.returned = false; ball.age = 0; ball.transfer = 0; ball.lock = .25;
    cannon.recoil = 1;
    if ((index === 1) === (this.shutterTargetX > 0)) this.shutterOpenUntil = this.clock + .7;
    this.audio.play('fire', this.soundSide(ball.mesh.position)); cannon.fireAt = this.practice || this.act === 2 ? Infinity : this.clock + 8; cannon.windStep = 0;
    if (this.act === 2) { this.finaleShot++; this.finalePending = true; }
    cannon.shot++; this.chooseCatchPoint(index);
  }

  private capture(ball: Ball, index: number, offset: Vector3) {
    const portal = this.portals[index].root;
    ball.transfer = transferDuration; ball.entrance = index;
    ball.offset.copy(offset); ball.offset.z = 0;
    ball.mesh.position.copy(ball.offset).applyQuaternion(portal.quaternion).add(portal.position);
    const exit = this.portals[1 - index].root;
    this.normal.copy(forward).applyQuaternion(exit.quaternion);
    ball.ghost.position.copy(ball.offset).applyQuaternion(exit.quaternion).add(exit.position).addScaledVector(this.normal, .006);
    ball.ghost.scale.setScalar(.001);
    if (this.cannons[ball.source].incoming === ball) this.cannons[ball.source].incoming = null;
    ball.returned = true; ball.ghost.visible = true; this.returns++; this.activity[index] = 1; this.activity[1 - index] = .25;
    this.audio.play('catch', this.soundSide(portal.getWorldPosition(this.audioSource))); this.showFeedback('Caught', 'catch'); this.updateHud();
    if (this.returns === 1) this.setMessage(this.xr ? 'Hold your aim.' : 'Keep the exit aimed until the ball returns.');
  }

  private rememberPortalPoses() {
    for (let i = 0; i < this.portals.length; i++) {
      this.previousPortalPositions[i].copy(this.portals[i].root.position);
      this.previousPortalRotations[i].copy(this.portals[i].root.quaternion);
    }
  }

  private portalDistance(ball: Ball, index: number, fraction: number) {
    const portal = this.portals[index].root;
    this.sweepPosition.lerpVectors(this.previousPortalPositions[index], portal.position, fraction);
    this.sweepRotation.slerpQuaternions(this.previousPortalRotations[index], portal.quaternion, fraction);
    this.sweepNormal.copy(forward).applyQuaternion(this.sweepRotation);
    this.sweepPoint.lerpVectors(ball.previous, ball.mesh.position, fraction).sub(this.sweepPosition);
    return this.sweepPoint.dot(this.sweepNormal);
  }

  private portalIntersection(ball: Ball, index: number) {
    const portal = this.portals[index];
    const angle = this.previousPortalRotations[index].angleTo(portal.root.quaternion);
    const segments = Math.max(1, Math.ceil(angle / (Math.PI / 12)));
    let start = 0;
    let before = this.portalDistance(ball, index, start);
    for (let step = 1; step <= segments; step++) {
      const end = step / segments;
      const after = this.portalDistance(ball, index, end);
      if (before > 0 && after <= 0) {
        let fraction = start + (end - start) * before / (before - after);
        if (angle > 1e-5) {
          let low = start, high = end;
          for (let iteration = 0; iteration < 10; iteration++) {
            fraction = (low + high) * .5;
            if (this.portalDistance(ball, index, fraction) > 0) low = fraction;
            else high = fraction;
          }
          fraction = (low + high) * .5;
        }
        this.portalDistance(ball, index, fraction);
        this.inverse.copy(this.sweepRotation).invert();
        this.sweepOffset.copy(this.sweepPoint).applyQuaternion(this.inverse);
        if (this.sweepOffset.x ** 2 + this.sweepOffset.y ** 2 <= (portal.apertureRadius - radius * .65) ** 2) return fraction;
      }
      start = end; before = after;
    }
    return Infinity;
  }

  private intersectsShutter(a: Vector3, b: Vector3) {
    return this.shutterIntersection(a, b) !== Infinity;
  }

  private shutterIntersection(a: Vector3, b: Vector3) {
    if (this.act === 0 || !this.theater.shutter.visible) return Infinity;
    const shutter = this.theater.shutter.position;
    // Both collision and preview use the same conservative swept-sphere box test.
    let near = 0, far = 1;
    for (const axis of axes) {
      const extent = (axis === 'x' ? .15 : axis === 'y' ? .16 : .0125) + radius;
      const delta = b[axis] - a[axis];
      if (Math.abs(delta) < 1e-7) { if (Math.abs(a[axis] - shutter[axis]) > extent) return Infinity; continue; }
      const p = (shutter[axis] - extent - a[axis]) / delta; const q = (shutter[axis] + extent - a[axis]) / delta;
      near = Math.max(near, Math.min(p, q)); far = Math.min(far, Math.max(p, q)); if (near > far) return Infinity;
    }
    return near;
  }

  private cannonIntersection(a: Vector3, b: Vector3, cannon: CannonState) {
    this.temp.subVectors(b, a); this.point.subVectors(a, cannon.target);
    const length = this.temp.lengthSq();
    const offset = this.point.lengthSq() - .14 ** 2;
    if (offset <= 0) return 0;
    if (length < 1e-8) return Infinity;
    const projection = this.point.dot(this.temp);
    const discriminant = projection ** 2 - length * offset;
    if (discriminant < 0) return Infinity;
    const fraction = (-projection - Math.sqrt(discriminant)) / length;
    return fraction >= 0 && fraction <= 1 ? fraction : Infinity;
  }

  private blockReturn(ball: Ball) {
    const cannon = this.cannons[this.shutterTargetX > 0 ? 1 : 0];
    this.breakStreak(); this.resolveShot(ball); this.audio.play('wood'); this.showFeedback('Blocked', 'miss');
    if (ball.returned && cannon.life > 0) this.audio.playCharacter('taunt', this.soundSide(cannon.model.root.getWorldPosition(this.audioSource)));
  }

  private updateBall(ball: Ball, dt: number) {
    if (!ball.active) return;
    ball.age += dt; ball.lock = Math.max(0, ball.lock - dt);
    if (ball.transfer > 0) {
      ball.transfer = Math.max(0, ball.transfer - dt); const progress = 1 - ball.transfer / transferDuration;
      const entrance = this.portals[ball.entrance].root;
      ball.mesh.position.copy(ball.offset).applyQuaternion(entrance.quaternion).add(entrance.position);
      const exit = this.portals[1 - ball.entrance].root; this.normal.copy(forward).applyQuaternion(exit.quaternion);
      ball.ghost.position.copy(ball.offset).applyQuaternion(exit.quaternion).add(exit.position).addScaledVector(this.normal, radius * progress + .006);
      ball.mesh.scale.setScalar(Math.max(.001, 1 - progress)); ball.ghost.scale.setScalar(Math.max(.001, progress));
      if (this.intersectsShutter(exit.position, ball.ghost.position)) { this.blockReturn(ball); return; }
      if (ball.transfer === 0) { ball.mesh.position.copy(ball.ghost.position); ball.mesh.scale.setScalar(1); ball.ghost.visible = false; ball.velocity.copy(this.normal).multiplyScalar(1.65); ball.lock = .16; this.activity[1 - ball.entrance] = 1; this.audio.play('release', this.soundSide(exit.getWorldPosition(this.audioSource))); }
      return;
    }
    ball.previous.copy(ball.mesh.position); ball.mesh.position.addScaledVector(ball.velocity, dt); ball.mesh.rotateX(dt * 4); ball.mesh.rotateZ(dt * 2.4);
    if (this.intersectsShutter(ball.previous, ball.mesh.position)) { this.blockReturn(ball); this.setMessage(this.xr ? 'Move your aiming hand to the side.' : 'Drag the exit portal sideways to clear the shutter.'); return; }
    if (ball.lock === 0) {
      let entrance = -1, firstHit = Infinity;
      for (let i = 0; i < 2; i++) {
        const portal = this.portals[i].root; if (!portal.visible) continue;
        const fraction = this.portalIntersection(ball, i);
        if (fraction < firstHit) {
          firstHit = fraction; entrance = i;
          this.captureOffset.copy(this.sweepOffset);
        }
      }
      if (entrance >= 0) { this.capture(ball, entrance, this.captureOffset); return; }
    }
    if (ball.returned) {
      for (const cannon of this.cannons) {
        if (cannon.life <= 0) continue;
        cannon.model.target.getWorldPosition(cannon.target); this.direction.copy(ball.mesh.position).sub(ball.previous);
        const fraction = MathUtils.clamp(this.temp.copy(cannon.target).sub(ball.previous).dot(this.direction) / Math.max(this.direction.lengthSq(), 1e-8), 0, 1);
        this.point.copy(ball.previous).addScaledVector(this.direction, fraction);
        if (this.point.distanceToSquared(cannon.target) < .14 ** 2) {
          cannon.life--; cannon.model.strike(cannon.life === 0); this.scoreHit();
          const firstHit = this.practice;
          if (firstHit) {
            this.practice = false;
            for (const next of this.cannons) next.fireAt = next.life > 0 ? this.clock + 2.5 : Infinity;
          }
          this.resolveShot(ball); this.audio.play(cannon.life === 0 ? 'down' : 'hit', this.soundSide(cannon.target));
          if (cannon === this.cannons[0] && cannon.life === 0) this.audio.playCharacter('complaint', this.soundSide(cannon.target));
          this.showFeedback(this.streak > 1 ? `${this.streak} in a row` : cannon.life === 0 ? 'Cannon down' : 'Hit', 'hit');
          this.setMessage(firstHit ? 'That’s it. Now the other cannon.' : this.act === 2 ? (this.hits === 7 ? 'One last return.' : 'Watch the next catch mark.') : cannon.life === 0 ? (this.xr ? 'Catch the next shot.' : 'Keep a portal in the next shot’s path.') : 'One more hit.'); this.updateHud(); return;
        }
      }
    }
    if (!ball.returned && ball.previous.z < -.2 && ball.mesh.position.z >= -.2) {
      if (this.practice) {
        this.resolveShot(ball); this.setMessage(this.xr ? 'No rush. Put a palm at the pale mark.' : 'No damage in practice. Move the left portal to the pale mark.'); return;
      }
      this.health--; this.breakStreak(); this.theater.fort.rotation.z = .025; this.audio.play('wood'); this.resolveShot(ball); this.updateHud();
      this.showFeedback('Village hit', 'miss');
      if (this.health <= 0) this.finish(false); else this.setMessage(this.xr ? 'Catch at the pale mark.' : 'Move a portal into the next shot’s path.'); return;
    }
    if (ball.age > 12 || ball.mesh.position.z < -2.65 || ball.mesh.position.z > .65 || Math.abs(ball.mesh.position.x) > 1.65 || ball.mesh.position.y < .75 || ball.mesh.position.y > 2.5) {
      this.breakStreak(); this.resolveShot(ball);
      if (this.practice) this.setMessage(this.xr ? 'Point your other palm at a cannon.' : 'Aim the exit portal at a cannon. The dotted line shows the shot.');
    }
  }

  private removeBall(ball: Ball) {
    if (ball.source >= 0 && this.cannons[ball.source].incoming === ball) this.cannons[ball.source].incoming = null;
    ball.active = false; ball.mesh.visible = ball.ghost.visible = false; ball.mesh.scale.setScalar(1); ball.transfer = 0; }

  private finish(won: boolean) {
    this.phase = won ? 'won' : 'lost'; this.clearBalls(); this.gestureArmed = false; this.raisedTime = 0; this.endingTime = 0; this.audio.play(won ? 'win' : 'lose');
    this.endDrag();
    document.body.classList.remove('playing'); document.body.classList.add('ended'); $('ending').classList.toggle('hidden', won); $('controls').classList.add('hidden');
    $('ending-eyebrow').textContent = won ? 'All three acts complete' : 'Try again'; $('ending-title').textContent = won ? this.health === 5 ? 'Perfect defense.' : 'Village saved.' : 'Village lost.';
    $('ending-description').textContent = won ? this.runBest === 8 ? 'Eight straight hits. Not a scratch on the village.' : `${this.health}/5 village. Can you land all eight returns in a row?` : 'Keep one portal in the firing lane while you aim the other.';
    $('ending-streak').textContent = `${this.runBest} / 8`; $('ending-best').textContent = `${this.bestStreak} / 8`;
    this.setMessage(this.xr ? this.vrMessage() : won ? 'All cannons defeated.' : 'Five shots reached the village.'); this.updateHud();
  }

  private showFeedback(message: string, tone: 'catch' | 'hit' | 'miss') {
    const feedback = $('feedback');
    feedback.textContent = message; feedback.dataset.tone = tone;
    feedback.classList.remove('hidden'); this.feedbackTime = .85;
  }

  private setMessage(message: string) {
    if (message === this.statusText) return;
    this.statusText = message; $('instruction').textContent = message;
    this.paintStatus();
  }

  private vrMessage() {
    switch (this.phase) {
      case 'ready': return this.tracked ? 'Raise both hands to start.' : 'Bring both hands into view.';
      case 'won': return this.endingTime < 3.5 ? this.health === 5 ? 'Perfect defense.' : 'Village saved.' : this.tracked ? `Best ${this.bestStreak}/8. Raise both hands to replay.` : 'Bring your hands into view to replay.';
      case 'lost': return this.tracked ? 'Village lost. Raise both hands to retry.' : 'Village lost. Bring your hands into view.';
      case 'intermission': return this.tracked ? 'Next act in 3 seconds.' : 'Bring both hands into view to continue.';
      case 'playing': return !this.tracked ? 'Paused. Bring both hands into view.' : this.practice ? 'First, catch the slow shot.' : this.act === 2 ? 'Watch the catch marks. Cover changes sides.' : this.act === 1 ? 'Aim around the shutter.' : 'Catch in one hand. Aim with the other.';
    }
  }

  private paintStatus() {
    const message = this.statusText;
    const ctx = this.statusCanvas.getContext('2d'); if (!ctx || !this.statusTexture) return;
    ctx.clearRect(0, 0, 1024, 160);
    ctx.fillStyle = 'rgba(22,23,21,.88)'; ctx.fillRect(112, 4, 800, 52);
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = '600 26px Arial, sans-serif'; ctx.fillStyle = '#f1eadb';
    ctx.fillText(`ACT ${this.act + 1}`, 134, 31);
    ctx.font = '24px Arial, sans-serif'; ctx.fillStyle = '#c1bdb1';
    ctx.fillText('Village', 324, 31);
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.arc(433 + i * 29, 30, 8, 0, Math.PI * 2);
      ctx.fillStyle = i < this.health ? '#e8d5a7' : '#55564e'; ctx.fill();
    }
    ctx.textAlign = 'right'; ctx.fillStyle = '#f1eadb';
    ctx.fillText(`${this.streak} in a row`, 890, 31);
    ctx.font = '500 34px Arial, sans-serif'; ctx.textAlign = 'center';
    const width = Math.min(984, ctx.measureText(message).width + 40);
    ctx.fillStyle = 'rgba(22,23,21,.88)'; ctx.fillRect((1024 - width) / 2, 74, width, 60);
    ctx.fillStyle = '#f5f0e4'; ctx.fillText(message, 512, 105, 944);
    this.statusTexture.needsUpdate = true;
  }

  private updateHud() {
    $('act-label').textContent = ['ACT I', 'ACT II', 'ACT III'][this.act]; $('act-title').textContent = titles[this.act];
    $('health').textContent = String(this.health); $('returns').textContent = String(this.streak).padStart(2, '0'); $('pause').textContent = this.paused ? 'Resume' : 'Pause';
    document.body.dataset.phase = this.phase; document.body.dataset.act = String(this.act + 1); document.body.dataset.health = String(this.health); document.body.dataset.returns = String(this.returns); document.body.dataset.hits = String(this.hits); document.body.dataset.paused = String(this.paused); this.paintStatus();
  }

  private updateGuide() {
    const count = this.xr ? 2 : 1;
    const visible = this.phase === 'playing' && !this.paused && !$<HTMLDialogElement>('help').open && (!this.xr || this.tracked);
    for (const cannon of this.cannons) cannon.model.target.getWorldPosition(cannon.target);
    for (let hand = 0; hand < count; hand++) {
      const portal = this.portals[this.xr ? hand : this.selected].root;
      this.direction.copy(forward).applyQuaternion(portal.quaternion);
      let status: 'clear' | 'target' | 'blocked' = 'clear';
      let length = this.guide.length;
      for (let i = 0; i < this.guide.length; i++) {
        this.guide[i].copy(portal.position).addScaledVector(this.direction, radius + .006 + i * .065);
        if (i === 0) continue;
        const start = this.guide[i - 1], end = this.guide[i];
        let intersection = this.shutterIntersection(start, end);
        if (intersection !== Infinity) status = 'blocked';
        for (const cannon of this.cannons) {
          if (cannon.life <= 0) continue;
          const hit = this.cannonIntersection(start, end, cannon);
          if (hit < intersection) { intersection = hit; status = 'target'; }
        }
        if (intersection !== Infinity) {
          end.lerpVectors(start, end, intersection); length = i + 1; break;
        }
      }
      const trajectory = hand === 0 ? this.trajectory : this.secondTrajectory;
      trajectory.set(this.guide, visible && portal.visible, status, length);
      if (!this.xr) {
        this.guideStatus = status; this.guideCount = length;
        this.projected.copy(this.guide[length - 1]).project(this.camera);
        const reticle = $('aim-reticle');
        const onScreen = Math.abs(this.projected.x) < .97 && Math.abs(this.projected.y) < .95 && this.projected.z > -1 && this.projected.z < 1;
        reticle.classList.toggle('hidden', !visible || !onScreen);
        reticle.style.left = `${this.canvasBounds.left + (this.projected.x + 1) * this.canvasBounds.width * .5}px`;
        reticle.style.top = `${this.canvasBounds.top + (1 - this.projected.y) * this.canvasBounds.height * .5}px`;
        if (reticle.dataset.state !== status) reticle.dataset.state = status;
        const label = $('aim-label');
        const text = status === 'target' ? 'On target' : status === 'blocked' ? 'Blocked' : 'Aim';
        if (label.textContent !== text) label.textContent = text;
      }
    }
    if (!this.xr) this.secondTrajectory.root.visible = false;
  }

  update(delta: number, time: number) {
    if (!this.ready) return;
    const dt = Math.min(delta, .035); const xr = this.renderer.xr.isPresenting;
    const continuingSweep = this.portalSweepActive && xr === this.xr;
    this.rememberPortalPoses();
    if (this.feedbackTime > 0) { this.feedbackTime = Math.max(0, this.feedbackTime - delta); if (this.feedbackTime === 0) $('feedback').classList.add('hidden'); }
    if (xr !== this.xr) {
      this.sweepSession?.removeEventListener('visibilitychange', this.resetPortalSweep);
      this.sweepSession = xr ? this.world.session ?? null : null;
      this.sweepSession?.addEventListener('visibilitychange', this.resetPortalSweep);
      this.xr = xr; this.palms.reset(); this.endDrag();
      document.body.classList.toggle('xr', xr); this.statusSprite.visible = xr;
      this.raisedTime = 0; this.gestureArmed = true;
      if (xr) {
        this.paused = false;
        this.setMessage(this.vrMessage());
      } else {
        this.resetPortals(); this.paused = this.phase === 'playing' || this.phase === 'intermission';
        this.setMessage(this.paused ? 'Paused. Resume here or enter VR to continue.' : this.phase === 'won' ? 'Village saved.' : this.phase === 'lost' ? 'Village lost.' : 'Choose Play or Enter VR to begin.');
      }
      this.updateHud();
    }
    if (xr) {
      const input = this.palms.update(this.portals[0].root, this.portals[1].root, delta);
      if (input.poseReset) this.portalSweepActive = false;
      if (input.tracked !== this.tracked) { this.tracked = input.tracked; this.setMessage(this.vrMessage()); }
      if (!input.raised) this.gestureArmed = true; this.raisedTime = input.raised && input.tracked ? this.raisedTime + dt : 0;
      if (this.phase === 'won' && this.endingTime < 3.5) { this.gestureArmed = false; this.raisedTime = 0; }
      if (this.raisedTime > .85 && this.gestureArmed && this.phase !== 'playing' && this.phase !== 'intermission') this.start();
    } else if (this.desktopActive()) {
      if (this.input.keyboard.getKeyPressed('ArrowUp')) this.changeDepth(-dt * .35);
      if (this.input.keyboard.getKeyPressed('ArrowDown')) this.changeDepth(dt * .35);
    }
    const running = !this.paused && (!xr || this.tracked) && !document.hidden && (!xr || this.world.session?.visibilityState === 'visible');
    if (!xr || !running || !continuingSweep || !this.portalSweepActive) this.rememberPortalPoses();
    this.portalSweepActive = xr && running && this.phase === 'playing';
    for (let i = 0; i < 2; i++) {
      this.activity[i] = Math.max(0, this.activity[i] - dt * 5); this.portals[i].update(time, this.activity[i], !xr && this.phase === 'playing' && i === this.selected); const cannon = this.cannons[i];
      if (running) cannon.recoil = Math.max(0, cannon.recoil - dt * 3);
      const charge = this.phase === 'playing' && cannon.life > 0 ? MathUtils.clamp(1 - (cannon.fireAt - this.clock) / windupDuration, 0, 1) : 0;
      if (this.phase === 'playing' && cannon.life > 0) cannon.model.aimAt(cannon.catchPoint);
      cannon.model.update(time, charge, cannon.recoil, cannon.life <= 0, running ? dt : 0);
    }
    this.updateCatchCues();
    if (running && this.phase === 'won') {
      const revealing = this.endingTime < 3.5;
      this.endingTime += dt;
      if (revealing && this.endingTime >= 3.5) { $('ending').classList.remove('hidden'); this.setMessage(this.xr ? this.vrMessage() : 'All eight hits landed. Play again to beat your best streak.'); }
    }
    this.theater.update(time, this.phase === 'won', this.endingTime); this.theater.fort.rotation.z *= Math.exp(-dt * 8); this.updateGuide();
    if (!running) return;
    if (this.phase === 'intermission') { this.clock += dt; if (this.clock >= this.nextAct) { this.act++; this.phase = 'playing'; this.beginAct(); this.setMessage(this.xr ? this.vrMessage() : this.act === 1 ? 'The catch marks move. Drag a portal to meet each shot.' : 'Three shot positions. Two hits per cannon.'); } return; }
    if (this.phase !== 'playing') return;
    this.clock += dt; this.elapsed += dt;
    for (let i = 0; i < 2; i++) {
      const cannon = this.cannons[i];
      if (cannon.life <= 0) continue;
      if (this.clock >= cannon.fireAt) { this.fire(i); continue; }
      const winding = this.clock - cannon.fireAt + windupDuration;
      if (cannon.windStep < windupTicks.length && winding >= windupTicks[cannon.windStep]) {
        cannon.model.root.getWorldPosition(this.audioSource);
        this.audio.windTick(cannon.windStep++, this.soundSide(this.audioSource));
      }
    }
    const covered = this.cannons[this.shutterTargetX > 0 ? 1 : 0]; const wantsOpen = this.act > 0 && (this.clock < this.shutterOpenUntil || (covered.life > 0 && covered.fireAt - this.clock < .75));
    this.theater.shutter.position.x = MathUtils.damp(this.theater.shutter.position.x, this.shutterTargetX, 7, dt);
    this.shutterFrame.position.x = this.theater.shutter.position.x - .65;
    this.shutterOpen = MathUtils.damp(this.shutterOpen, wantsOpen ? 1 : 0, 12, dt); this.theater.shutter.position.y = 1.30 + this.shutterOpen * .42;
    for (const ball of this.balls) this.updateBall(ball, dt);
    if (this.phase === 'playing' && this.cannons[0].life <= 0 && this.cannons[1].life <= 0) { this.clearBalls(); if (this.act === 2) this.finish(true); else { this.phase = 'intermission'; this.nextAct = this.clock + 3; this.setMessage('Next act in 3 seconds.'); this.updateHud(); } }
  }
}
