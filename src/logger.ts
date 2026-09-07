import pino from 'pino';

export const logger = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service: 'nexploy-agent' },
    redact: {
        paths: ['token', 'agentToken', 'authorization'],
        censor: '***',
    },
    ...(process.env.NODE_ENV !== 'production' && {
        transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
    }),
});

export type Logger = typeof logger;
