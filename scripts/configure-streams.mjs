import { loadStreamConfig, writeGeneratedConfig, initializePrivateConfig } from './stream-config.mjs';

try {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--init', '--defaults', '--check'].includes(arg))) throw Error('Usage: node scripts/configure-streams.mjs [--init] [--defaults] [--check]');
  if (args.includes('--init')) {
    const result = await initializePrivateConfig();
    console.log(result.created ? 'Created private .local/stream-providers.env (mode 0600).' : 'Private stream configuration already exists; preserved it.');
  }
  const config = await loadStreamConfig({ defaultsOnly: args.includes('--defaults') });
  if (!args.includes('--check')) await writeGeneratedConfig(config);
  console.log(`Validated ${config.catalog.providers.length} stream providers. ${args.includes('--check') ? 'No files generated.' : 'Generated public provider settings and native filter rules.'}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
