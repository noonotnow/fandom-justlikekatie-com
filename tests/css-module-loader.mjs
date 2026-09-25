export async function load(url, context, nextLoad) {
  if (url.endsWith('.css')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export default new Proxy({}, { get: (_target, key) => String(key) });',
    };
  }
  return nextLoad(url, context);
}