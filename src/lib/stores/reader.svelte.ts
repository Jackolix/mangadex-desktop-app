// Shared reactive state for the reader — used to signal layout to hide chrome
let isFullscreen = $state(false);

export const readerState = {
  get isFullscreen() { return isFullscreen; },
  setFullscreen(v: boolean) { isFullscreen = v; },
};
