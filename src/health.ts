import { createServer } from 'node:http';
import { HEALTH_PORT } from './config.js';
import { logger } from './logger.js';
import { isTunnelConnected } from './tunnel.js';

export function startHealthServer(): void {
    if (HEALTH_PORT <= 0) return;

    const server = createServer((req, res) => {
        if (req.url === '/healthz') {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
            return;
        }

        if (req.url === '/readyz') {
            const connected = isTunnelConnected();

            res.writeHead(connected ? 200 : 503, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ status: connected ? 'connected' : 'disconnected' }));
            return;
        }

        res.writeHead(404).end();
    });

    server.listen(HEALTH_PORT, () => logger.info({ port: HEALTH_PORT }, 'Health endpoint listening'));
}
