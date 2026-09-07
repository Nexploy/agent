import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

function readPackageVersion(): string {
    try {
        const require = createRequire(import.meta.url);
        const manifest = JSON.parse(readFileSync(require.resolve('../package.json'), 'utf8')) as { version?: string };

        return manifest.version ?? '0.0.0';
    } catch {
        return '0.0.0';
    }
}

export const AGENT_VERSION = process.env.AGENT_VERSION || readPackageVersion();
