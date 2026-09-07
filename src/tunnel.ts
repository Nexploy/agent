import { connect } from 'node:net';
import WebSocket from 'ws';
import {
    AGENT_PROTOCOL_HEADER,
    AGENT_PROTOCOL_VERSION,
    AGENT_SYSTEM_HEADER,
    encodeAgentSystemInfo,
    MuxSession,
    MUX_MAX_WS_PAYLOAD_BYTES,
    type MuxChannel,
} from './protocol/index.js';
import {
    AGENT_TOKEN,
    DOCKER_SOCKET_PATH,
    INSECURE_SKIP_TLS_VERIFY,
    RECONNECT_MAX_DELAY_MS,
    RECONNECT_MIN_DELAY_MS,
    TUNNEL_URL,
} from './config.js';
import { collectSystemInfo } from './systemInfo.js';
import { logger } from './logger.js';
import { AGENT_VERSION } from './version.js';

let socket: WebSocket | null = null;
let session: MuxSession | null = null;
let reconnectDelay = RECONNECT_MIN_DELAY_MS;
let stopped = false;

function bridgeChannel(channel: MuxChannel): void {
    const dockerSocket = connect({ path: DOCKER_SOCKET_PATH });

    dockerSocket.on('error', (error) => {
        logger.error({ error: error.message }, 'Docker socket error');
        channel.destroy(error);
    });

    channel.on('error', () => dockerSocket.destroy());

    dockerSocket.on('connect', () => {
        channel.pipe(dockerSocket);
        dockerSocket.pipe(channel);
    });
}

async function openConnection(): Promise<void> {
    const system = await collectSystemInfo();

    const ws = new WebSocket(TUNNEL_URL, {
        headers: {
            Authorization: `Bearer ${AGENT_TOKEN}`,
            [AGENT_PROTOCOL_HEADER]: String(AGENT_PROTOCOL_VERSION),
            [AGENT_SYSTEM_HEADER]: encodeAgentSystemInfo({ ...system, agentVersion: AGENT_VERSION }),
        },
        maxPayload: MUX_MAX_WS_PAYLOAD_BYTES,
        rejectUnauthorized: !INSECURE_SKIP_TLS_VERIFY,
        followRedirects: true,
    });

    socket = ws;

    const muxSession = new MuxSession(
        {
            sendBinary: (data) => {
                if (ws.readyState === WebSocket.OPEN) ws.send(data, { binary: true });
            },
            isOpen: () => ws.readyState === WebSocket.OPEN,
        },
        'responder',
    );

    session = muxSession;

    muxSession.on('channel', bridgeChannel);

    ws.on('open', () => {
        logger.info({ url: TUNNEL_URL }, 'Tunnel established');
        reconnectDelay = RECONNECT_MIN_DELAY_MS;
    });

    ws.on('message', (raw: Buffer, isBinary: boolean) => {
        if (!isBinary) return;

        muxSession.handleBinary(raw);
    });

    ws.on('unexpected-response', (_request, response) => {
        logger.error({ status: response.statusCode }, 'Tunnel refused by the server');
        ws.terminate();
    });

    ws.on('close', (code, reason) => {
        logger.warn({ code, reason: reason.length ? reason.toString() : undefined }, 'Tunnel closed');
        muxSession.close('Tunnel closed');
        socket = null;
        session = null;
        scheduleReconnect();
    });

    ws.on('error', (error) => {
        logger.error({ error: error.message }, 'Tunnel error');
    });
}

function scheduleReconnect(): void {
    if (stopped) return;

    const delay = reconnectDelay;
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_DELAY_MS);

    logger.info({ delaySeconds: Math.round(delay / 1000) }, 'Reconnecting');

    setTimeout(() => {
        void openConnection().catch((error: Error) => {
            logger.error({ error: error.message }, 'Failed to reconnect');
            scheduleReconnect();
        });
    }, delay);
}

export async function startTunnel(): Promise<void> {
    await openConnection().catch((error: Error) => {
        logger.error({ error: error.message }, 'Failed to connect');
        scheduleReconnect();
    });
}

export function isTunnelConnected(): boolean {
    return socket?.readyState === WebSocket.OPEN;
}

export function stopTunnel(): void {
    stopped = true;
    session?.close('Agent shutting down');
    socket?.close(1001, 'agent shutdown');
}
