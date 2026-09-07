import { arch, cpus, hostname, platform, totalmem } from 'node:os';
import { request } from 'node:http';
import type { AgentSystemInfo } from './protocol/index.js';
import { DOCKER_SOCKET_PATH } from './config.js';

interface DockerVersionResponse {
    Version?: string;
    ApiVersion?: string;
    Os?: string;
}

function readDockerVersion(): Promise<DockerVersionResponse | null> {
    return new Promise((resolve) => {
        const req = request(
            { socketPath: DOCKER_SOCKET_PATH, path: '/version', method: 'GET', timeout: 5_000 },
            (res) => {
                const chunks: Buffer[] = [];

                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as DockerVersionResponse);
                    } catch {
                        resolve(null);
                    }
                });
            },
        );

        req.on('timeout', () => req.destroy());
        req.on('error', () => resolve(null));
        req.end();
    });
}

export async function collectSystemInfo(): Promise<AgentSystemInfo> {
    const version = await readDockerVersion();

    return {
        hostname: hostname(),
        platform: platform(),
        architecture: arch(),
        dockerVersion: version?.Version,
        dockerApiVersion: version?.ApiVersion,
        operatingSystem: version?.Os,
        totalMemoryBytes: totalmem(),
        cpuCount: cpus().length,
    };
}

export async function isDockerReachable(): Promise<boolean> {
    return (await readDockerVersion()) !== null;
}
