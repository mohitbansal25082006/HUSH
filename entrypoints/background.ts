import { startBackground } from '../src/background/index';

export default defineBackground({
  type: 'module',
  main() {
    startBackground();
  },
});
