import { EventEmitter } from 'node:events';
import { Duplex } from 'node:stream';
import { MUX_INITIAL_WINDOW_BYTES, MUX_MAX_PAYLOAD_BYTES } from './constants.js';
import { decodeFrame, encodeFrame, encodeWindowFrame, MuxFrameType, readWindowDelta } from './frames.js';
import type { MuxFrameTypeValue } from './frames.js';

export interface MuxTransport {
    sendBinary(data: Buffer): void;
    isOpen(): boolean;
}

export type MuxRole = 'initiator' | 'responder';

interface PendingWrite {
    data: Buffer;
    offset: number;
    callback: (error?: Error | null) => void;
}

export class MuxChannel extends Duplex {
    readonly channelId: number;

    private readonly session: MuxSession;
    private sendWindow = MUX_INITIAL_WINDOW_BYTES;
    private pending: PendingWrite | null = null;
    private inbound: Buffer[] = [];
    private flowing = false;
    private unackedBytes = 0;
    private remoteEnded = false;
    private resetSent = false;

    constructor(channelId: number, session: MuxSession) {
        super({ allowHalfOpen: true });
        this.channelId = channelId;
        this.session = session;
    }

    override _read(): void {
        this.flowing = true;
        this.drainInbound();
    }

    override _write(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
        if (this.pending) {
            callback(new Error('A write is already in flight on this channel'));
            return;
        }

        if (!this.session.isOpen()) {
            callback(new Error('Agent tunnel is closed'));
            return;
        }

        this.pending = { data: chunk, offset: 0, callback };
        this.flushPending();
    }

    override _final(callback: (error?: Error | null) => void): void {
        this.session.sendFrame(MuxFrameType.Fin, this.channelId);
        callback();
    }

    override _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
        if (!this.resetSent && !this.remoteEnded) {
            this.resetSent = true;
            this.session.sendFrame(MuxFrameType.Reset, this.channelId);
        }

        this.pending?.callback(error ?? new Error('Channel destroyed'));
        this.pending = null;
        this.inbound = [];
        this.session.forgetChannel(this.channelId);

        callback(error);
    }

    receiveData(payload: Buffer): void {
        if (payload.length === 0) return;

        this.inbound.push(payload);
        this.drainInbound();
    }

    receiveWindow(delta: number): void {
        this.sendWindow += delta;
        this.flushPending();
    }

    receiveFin(): void {
        this.remoteEnded = true;
        this.inbound.push(Buffer.alloc(0));
        this.drainInbound();
    }

    receiveReset(): void {
        this.remoteEnded = true;
        this.destroy(new Error('Channel reset by the remote side'));
    }

    failWith(error: Error): void {
        this.remoteEnded = true;
        this.destroy(error);
    }

    private drainInbound(): void {
        if (!this.flowing) return;

        while (this.inbound.length > 0) {
            const next = this.inbound[0] as Buffer;

            if (next.length === 0) {
                this.inbound.shift();

                if (this.remoteEnded && this.inbound.length === 0) {
                    this.flowing = false;
                    this.push(null);
                    return;
                }

                continue;
            }

            this.inbound.shift();
            this.ackBytes(next.length);

            if (!this.push(next)) {
                this.flowing = false;
                return;
            }
        }
    }

    private ackBytes(bytes: number): void {
        this.unackedBytes += bytes;

        if (this.unackedBytes < MUX_INITIAL_WINDOW_BYTES / 2) return;

        this.session.sendWindowUpdate(this.channelId, this.unackedBytes);
        this.unackedBytes = 0;
    }

    private flushPending(): void {
        const pending = this.pending;

        if (!pending) return;

        while (pending.offset < pending.data.length && this.sendWindow > 0) {
            const size = Math.min(MUX_MAX_PAYLOAD_BYTES, pending.data.length - pending.offset, this.sendWindow);
            const slice = pending.data.subarray(pending.offset, pending.offset + size);

            this.session.sendFrame(MuxFrameType.Data, this.channelId, slice);

            pending.offset += size;
            this.sendWindow -= size;
        }

        if (pending.offset < pending.data.length) return;

        this.pending = null;
        pending.callback();
    }
}

export class MuxSession extends EventEmitter {
    private readonly transport: MuxTransport;
    private readonly channels = new Map<number, MuxChannel>();
    private nextChannelId: number;
    private closed = false;

    constructor(transport: MuxTransport, role: MuxRole) {
        super();
        this.transport = transport;
        this.nextChannelId = role === 'initiator' ? 1 : 2;
    }

    isOpen(): boolean {
        return !this.closed && this.transport.isOpen();
    }

    get openChannelCount(): number {
        return this.channels.size;
    }

    openChannel(): MuxChannel {
        if (!this.isOpen()) throw new Error('Agent tunnel is closed');

        const channelId = this.nextChannelId;
        this.nextChannelId += 2;

        const channel = new MuxChannel(channelId, this);
        this.channels.set(channelId, channel);

        this.sendFrame(MuxFrameType.Open, channelId);

        return channel;
    }

    handleBinary(raw: Buffer): void {
        const frame = decodeFrame(raw);

        if (!frame) return;

        if (frame.type === MuxFrameType.Open) {
            if (this.channels.has(frame.channelId)) return;

            const channel = new MuxChannel(frame.channelId, this);
            this.channels.set(frame.channelId, channel);
            this.emit('channel', channel);
            return;
        }

        const channel = this.channels.get(frame.channelId);

        if (!channel) {
            if (frame.type !== MuxFrameType.Reset) this.sendFrame(MuxFrameType.Reset, frame.channelId);
            return;
        }

        switch (frame.type) {
            case MuxFrameType.Data:
                channel.receiveData(frame.payload);
                return;
            case MuxFrameType.Window: {
                const delta = readWindowDelta(frame.payload);
                if (delta !== null) channel.receiveWindow(delta);
                return;
            }
            case MuxFrameType.Fin:
                channel.receiveFin();
                return;
            case MuxFrameType.Reset:
                channel.receiveReset();
                return;
        }
    }

    sendFrame(type: MuxFrameTypeValue, channelId: number, payload?: Buffer): void {
        if (!this.isOpen()) return;

        this.transport.sendBinary(encodeFrame(type, channelId, payload));
    }

    sendWindowUpdate(channelId: number, delta: number): void {
        if (!this.isOpen()) return;

        this.transport.sendBinary(encodeWindowFrame(channelId, delta));
    }

    forgetChannel(channelId: number): void {
        this.channels.delete(channelId);
    }

    close(reason = 'Agent tunnel closed'): void {
        if (this.closed) return;

        this.closed = true;

        for (const channel of [...this.channels.values()]) {
            channel.failWith(new Error(reason));
        }

        this.channels.clear();
    }
}
