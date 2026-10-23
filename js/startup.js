import { loading, loadGeography } from './kazan-runtime.js';
import { loadEngine } from './kazan-engine.js';

try {
  await Promise.all([loadEngine(), loadGeography()]);
  const { startup } = await import('./main.js');
  await startup;
} catch (error) {
  loading.fail(error);
}
