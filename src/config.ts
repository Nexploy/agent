import { AGENT_WS_PATH } from './protocol/index.js';
import { logger } from './logger.js';

function required(name: string): string {
    const value = process.env[name];

    if (!value) {
        logger.error({ variable: name }, 'Missing required environment variable');
        process.exit(1);
    }

    return value;
}

function toWebSocketUrl(baseUrl: string): string {
    const url = new URL(AGENT_WS_PATH, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

    return url.toString();
}

export const NEXPLOY_URL = required('NEXPLOY_URL');

export const AGENT_TOKEN = required('NEXPLOY_AGENT_TOKEN');

export const TUNNEL_URL = toWebSocketUrl(NEXPLOY_URL);

export const DOCKER_SOCKET_PATH = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';

export const INSECURE_SKIP_TLS_VERIFY = process.env.NEXPLOY_INSECURE_SKIP_TLS_VERIFY === 'true';

export const HEALTH_PORT = Number(process.env.NEXPLOY_AGENT_HEALTH_PORT ?? 9091);

export const RECONNECT_MIN_DELAY_MS = 1_000;

export const RECONNECT_MAX_DELAY_MS = 30_000;
