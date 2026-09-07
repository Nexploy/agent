import { DOCKER_SOCKET_PATH, TUNNEL_URL } from './config.js';
import { isDockerReachable } from './systemInfo.js';
import { startTunnel, stopTunnel } from './tunnel.js';
import { startHealthServer } from './health.js';
import { logger } from './logger.js';
import { AGENT_VERSION } from './version.js';

async function main(): Promise<void> {
    logger.info({ url: TUNNEL_URL, version: AGENT_VERSION }, 'Starting Nexploy agent');

    if (!(await isDockerReachable())) {
        logger.error(
            { socketPath: DOCKER_SOCKET_PATH },
            'Docker daemon unreachable, mount it with -v /var/run/docker.sock:/var/run/docker.sock',
        );
        process.exit(1);
    }

    startHealthServer();

    await startTunnel();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
        logger.info({ signal }, 'Shutting down');
        stopTunnel();
        process.exit(0);
    });
}

void main();
