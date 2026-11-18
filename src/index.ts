import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { ReturnGame } from './game';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions)
  .then(world => { world.registerSystem(ReturnGame); })
  .catch((error: unknown) => {
    const loading = document.getElementById('loading');
    if (loading) loading.textContent = `The stage could not load. ${error instanceof Error ? error.message : 'Please reload.'}`;
    console.error(error);
  });
