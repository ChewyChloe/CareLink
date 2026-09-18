import net from 'net';
import WebSocket, { createWebSocketStream } from 'ws';
import { spawn } from 'child_process';

const NEON_HOST = 'ep-autumn-mountain-b3n96xau.c-4.ap-southeast-1.aws.neon.tech';
const PROXY_PORT = 5433;

const server = net.createServer((tcpSocket) => {
  const webSocket = new WebSocket(`wss://${NEON_HOST}/v1`);
  const wsStream = createWebSocketStream(webSocket);

  tcpSocket.pipe(wsStream).pipe(tcpSocket);

  tcpSocket.on('error', () => {});
  wsStream.on('error', () => {});
});

server.listen(PROXY_PORT, '127.0.0.1', () => {
  const proxyUrl = `postgresql://neondb_owner:npg_BO4ljSbrzqU5@127.0.0.1:${PROXY_PORT}/neondb?sslmode=disable`;

  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log(`Proxy running on 127.0.0.1:${PROXY_PORT}`);
    return;
  }

  const env = {
    ...process.env,
    DATABASE_URL: proxyUrl,
    DATABASE_URL_UNPOOLED: proxyUrl,
  };

  const [cmd, ...cmdArgs] = args;
  const child = spawn(cmd, cmdArgs, {
    stdio: 'inherit',
    env,
    shell: true,
  });

  child.on('exit', (code) => {
    server.close(() => {
      process.exit(code || 0);
    });
  });
});
