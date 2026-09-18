import { startTunnel } from 'untun';

async function main() {
  console.log('Starting untun tunnel for port 5173 (Vite dev server)...');
  console.log('Vite proxies /api and /webhooks to backend on port 3000');
  try {
    const tunnel = await startTunnel({ hostname: '127.0.0.1', port: 5173 });
    const url = await tunnel.getURL();
    console.log(`\n========================================`);
    console.log(`TUNNEL_READY: ${url}`);
    console.log(`Webhook URL:  ${url}/webhooks/line`);
    console.log(`MINI App URL: ${url}/timeline`);
    console.log(`========================================\n`);
    console.log('Set this webhook URL in LINE Developers Console:');
    console.log(`  ${url}/webhooks/line`);
    console.log('\nPress Ctrl+C to stop.\n');
  } catch (err) {
    console.error('TUNNEL_ERROR:', err);
  }
}

main();
