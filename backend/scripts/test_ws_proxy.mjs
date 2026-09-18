import net from 'net';
import WebSocket, { createWebSocketStream } from 'ws';
import { PrismaClient } from '@prisma/client';

const NEON_HOST = 'ep-autumn-mountain-b3n96xau.c-4.ap-southeast-1.aws.neon.tech';
const PROXY_PORT = 5433;

const server = net.createServer((tcpSocket) => {
  console.log('New client connection on proxy');
  const webSocket = new WebSocket(`wss://${NEON_HOST}/v1`);
  const wsStream = createWebSocketStream(webSocket);

  tcpSocket.pipe(wsStream).pipe(tcpSocket);

  tcpSocket.on('error', (err) => console.log('TCP error:', err.message));
  wsStream.on('error', (err) => console.log('WS error:', err.message));
});

server.listen(PROXY_PORT, '127.0.0.1', async () => {
  console.log(`Proxy listening on 127.0.0.1:${PROXY_PORT}`);

  // Test Prisma connecting through the proxy!
  const proxyUrl = `postgresql://neondb_owner:npg_BO4ljSbrzqU5@127.0.0.1:${PROXY_PORT}/neondb?sslmode=disable`;
  const prisma = new PrismaClient({ datasources: { db: { url: proxyUrl } } });

  try {
    const res = await prisma.$queryRaw`SELECT 1 as connected, now() as server_time`;
    console.log('PRISMA OVER WS PROXY SUCCESS:', res);
  } catch (err) {
    console.error('PRISMA OVER WS PROXY FAILED:', err.message);
  } finally {
    await prisma.$disconnect();
    server.close();
  }
});
