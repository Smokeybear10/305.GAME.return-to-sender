type CharacterVoice = 'complaint' | 'taunt';
type ToySound = 'fire' | 'catch' | 'release' | 'hit' | 'down' | 'wood' | 'win' | 'lose';

export class ToyAudio {
  enabled = true;
  private context?: AudioContext;
  private master?: GainNode;
  private compressor?: DynamicsCompressorNode;
  private voices = new Set<AudioScheduledSourceNode>();
  private channels: StereoPannerNode[] = [];
  private output?: AudioNode;
  private noiseBuffer?: AudioBuffer;
  private disposed = false;
  private characterClips = new Map<CharacterVoice, AudioBuffer>();
  private spoken = new Set<CharacterVoice>();

  unlock(): void {
    if (this.disposed) return;
    if (!this.context) {
      try {
        this.context = new AudioContext({ latencyHint: 'interactive' });
        this.master = this.context.createGain();
        this.compressor = this.context.createDynamicsCompressor();
        this.master.gain.value = this.enabled ? .22 : 0;
        this.compressor.threshold.value = -16;
        this.compressor.knee.value = 20;
        this.compressor.ratio.value = 4;
        this.compressor.attack.value = .002;
        this.compressor.release.value = .12;
        this.channels = [-.65, 0, .65].map(pan => {
          const channel = this.context!.createStereoPanner();
          channel.pan.value = pan;
          channel.connect(this.master!);
          return channel;
        });
        this.output = this.channels[1];
        this.noiseBuffer = this.context.createBuffer(1, Math.ceil(this.context.sampleRate * .3), this.context.sampleRate);
        const samples = this.noiseBuffer.getChannelData(0);
        let seed = 731;
        for (let i = 0; i < samples.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          samples[i] = seed / 2147483648 - 1;
        }
        this.master.connect(this.compressor);
        this.compressor.connect(this.context.destination);
      } catch {
        this.context = undefined;
        return;
      }
    }
    if (this.context.state === 'suspended') {
      void this.context.resume().catch(() => undefined);
    }
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
    if (!this.context || !this.master || this.context.state === 'closed') return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(value ? .22 : 0, now, .015);
  }

  play(kind: ToySound, side: -1 | 0 | 1 = 0): void {
    if (!this.enabled || this.disposed || this.context?.state !== 'running') return;
    this.output = this.channels[side + 1];
    const now = this.context.currentTime + .004;
    switch (kind) {
      case 'fire':
        this.noise(now, .075, .18, 900);
        this.tone(164, now, .17, .48, 'sine', 49);
        this.tone(315, now, .062, .1, 'triangle', 130);
        this.tone(1320, now, .017, .035);
        break;
      case 'catch':
        this.woodenNote(620, now, .09, .24);
        this.tone(420, now, .065, .07, 'sine', 840);
        break;
      case 'release':
        this.noise(now, .055, .055, 2800);
        this.woodenNote(930, now, .11, .18);
        break;
      case 'hit':
        this.noise(now, .045, .28, 2100);
        this.woodenNote(185, now, .13, .46);
        this.tone(793, now, .24, .16, 'sine', 744);
        this.tone(1231, now, .16, .065);
        break;
      case 'down':
        this.noise(now, .075, .3, 1700);
        this.woodenNote(156, now, .18, .48);
        this.tone(695, now, .38, .19, 'sine', 310);
        this.tone(1087, now, .25, .08, 'sine', 502);
        this.woodenNote(330, now + .14, .07, .16);
        this.woodenNote(247, now + .23, .1, .1);
        break;
      case 'wood':
        this.noise(now, .055, .17, 1100);
        this.woodenNote(172, now, .1, .35);
        this.tone(87, now + .009, .075, .14, 'sine', 65);
        break;
      case 'win':
        [349.23, 440, 523.25, 698.46].forEach((frequency, index) => {
          this.woodenNote(frequency, now + .3 + index * .17, index === 3 ? .85 : .3, .24);
        });
        this.tone(349.23, now + .81, .8, .055);
        this.tone(523.25, now + .81, .75, .065);
        break;
      case 'lose':
        [261.63, 233.08, 174.61].forEach((frequency, index) => {
          this.woodenNote(frequency, now + index * .16, index === 2 ? .37 : .2, .2);
        });
        break;
    }
  }

  setCharacterVoice(kind: CharacterVoice, buffer: AudioBuffer): void {
    if (this.disposed) return;
    this.characterClips.set(kind, buffer);
  }

  playCharacter(kind: CharacterVoice, side: -1 | 0 | 1): void {
    const context = this.context;
    const buffer = this.characterClips.get(kind);
    if (!this.enabled || this.disposed || context?.state !== 'running' || !buffer || this.spoken.has(kind)) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = 2.8;
    source.connect(gain); gain.connect(this.channels[side + 1]);
    this.spoken.add(kind); this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source); source.disconnect(); gain.disconnect();
    };
    source.start(context.currentTime + .28);
  }

  windTick(step: number, side: -1 | 0 | 1): void {
    if (!this.enabled || this.disposed || this.context?.state !== 'running') return;
    this.output = this.channels[side + 1];
    const now = this.context.currentTime + .004;
    this.tone(780 + step * 37, now, .027, .09 + step * .005, 'triangle', 610 + step * 29);
    this.tone(1470 + step * 15, now, .018, .035);
  }

  stop(): void {
    for (const voice of this.voices) voice.stop();
    this.voices.clear();
    this.spoken.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop();
    this.characterClips.clear();
    for (const channel of this.channels) channel.disconnect();
    this.channels.length = 0;
    this.master?.disconnect();
    this.compressor?.disconnect();
    if (this.context && this.context.state !== 'closed') {
      void this.context.close().catch(() => undefined);
    }
  }

  private noise(when: number, duration: number, level: number, cutoff: number): void {
    const context = this.context;
    if (!context || !this.output || !this.noiseBuffer || this.voices.size >= 64) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = 'lowpass'; filter.frequency.value = cutoff; filter.Q.value = .6;
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(level, when + .002);
    envelope.gain.exponentialRampToValueAtTime(.0001, when + duration);
    source.connect(filter); filter.connect(envelope); envelope.connect(this.output);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source); source.disconnect(); filter.disconnect(); envelope.disconnect();
    };
    source.start(when); source.stop(when + duration + .012);
  }

  private woodenNote(frequency: number, when: number, duration: number, level: number): void {
    this.tone(frequency, when, duration, level, 'sine', frequency * .97);
    this.tone(frequency * 2.76, when, duration * .28, level * .15);
    this.tone(frequency * 5.41, when, duration * .12, level * .045);
  }

  private tone(
    frequency: number,
    when: number,
    duration: number,
    level: number,
    type: OscillatorType = 'sine',
    endFrequency = frequency,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master || this.voices.size >= 64) return;
    const source = context.createOscillator();
    const envelope = context.createGain();
    source.type = type;
    source.frequency.setValueAtTime(frequency, when);
    source.frequency.exponentialRampToValueAtTime(endFrequency, when + duration);
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(level, when + .003);
    envelope.gain.exponentialRampToValueAtTime(.0001, when + duration);
    source.connect(envelope);
    envelope.connect(this.output ?? master);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      envelope.disconnect();
    };
    source.start(when);
    source.stop(when + duration + .012);
  }
}
