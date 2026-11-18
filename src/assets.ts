import { AssetType, defineAssets } from '@iwsdk/core';
import { createCannon } from './art/cannon';
import { createCatchCue } from './art/catch-cue';
import { createTheater } from './art/theater';
import { createBall, createPortal } from './art/portal';
export default defineAssets({
  'voice-complaint': { url: `${import.meta.env.BASE_URL}audio/cannon-left.wav`, type: AssetType.Audio, priority: 'lazy' },
  'voice-taunt': { url: `${import.meta.env.BASE_URL}audio/cannon-right.wav`, type: AssetType.Audio, priority: 'lazy' },
  theater: createTheater().root,
  cannon: createCannon().root,
  'cannon-captain': createCannon('captain').root,
  'cannon-gunner': createCannon('gunner').root,
  'portal-left': createPortal('left').root,
  'portal-right': createPortal('right').root,
  ball: createBall(),
  'catch-cue': createCatchCue().root,
});
