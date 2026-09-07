import { z } from 'zod';

export const agentSystemInfoSchema = z.object({
    agentVersion: z.string().max(64).optional(),
    hostname: z.string().max(255).optional(),
    platform: z.string().max(64).optional(),
    architecture: z.string().max(64).optional(),
    dockerVersion: z.string().max(64).optional(),
    dockerApiVersion: z.string().max(64).optional(),
    operatingSystem: z.string().max(64).optional(),
    totalMemoryBytes: z.number().nonnegative().optional(),
    cpuCount: z.number().int().nonnegative().optional(),
});

export type AgentSystemInfo = z.infer<typeof agentSystemInfoSchema>;

const MAX_SYSTEM_HEADER_BYTES = 4096;

export function encodeAgentSystemInfo(system: AgentSystemInfo): string {
    return Buffer.from(JSON.stringify(system), 'utf8').toString('base64url');
}

export function decodeAgentSystemInfo(header: string | undefined): AgentSystemInfo {
    if (!header || header.length > MAX_SYSTEM_HEADER_BYTES) return {};

    try {
        const parsed = agentSystemInfoSchema.safeParse(JSON.parse(Buffer.from(header, 'base64url').toString('utf8')));

        return parsed.success ? parsed.data : {};
    } catch {
        return {};
    }
}
