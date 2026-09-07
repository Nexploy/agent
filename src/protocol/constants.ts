export const AGENT_PROTOCOL_VERSION = 1;

export const AGENT_WS_PATH = '/api/ws/agent';

export const AGENT_TUNNEL_PATH = '/ws/agent/tunnel';

export const AGENT_PROTOCOL_HEADER = 'x-nexploy-agent-protocol';

export const AGENT_ID_HEADER = 'x-nexploy-agent-id';

export const AGENT_SYSTEM_HEADER = 'x-nexploy-agent-system';

export const AGENT_ENVIRONMENT_HEADER = 'x-nexploy-agent-environment';

export const AGENT_TOKEN_PREFIX = 'nxa_';

export const AGENT_HEARTBEAT_INTERVAL_MS = 20_000;

export const AGENT_STALE_CONNECTION_MS = 90_000;

export const AGENT_HELLO_TIMEOUT_MS = 15_000;

export const MUX_FRAME_HEADER_BYTES = 5;

export const MUX_MAX_PAYLOAD_BYTES = 64 * 1024;

export const MUX_INITIAL_WINDOW_BYTES = 1024 * 1024;

export const MUX_MAX_WS_PAYLOAD_BYTES = MUX_MAX_PAYLOAD_BYTES + MUX_FRAME_HEADER_BYTES;
