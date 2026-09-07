import { MUX_FRAME_HEADER_BYTES } from './constants.js';

export const MuxFrameType = {
    Open: 0x01,
    Data: 0x02,
    Window: 0x03,
    Fin: 0x04,
    Reset: 0x05,
} as const;

export type MuxFrameTypeValue = (typeof MuxFrameType)[keyof typeof MuxFrameType];

export interface MuxFrame {
    type: MuxFrameTypeValue;
    channelId: number;
    payload: Buffer;
}

const KNOWN_TYPES = new Set<number>(Object.values(MuxFrameType));

export function encodeFrame(type: MuxFrameTypeValue, channelId: number, payload?: Buffer): Buffer {
    const body = payload ?? Buffer.alloc(0);
    const frame = Buffer.allocUnsafe(MUX_FRAME_HEADER_BYTES + body.length);

    frame.writeUInt8(type, 0);
    frame.writeUInt32BE(channelId, 1);

    if (body.length > 0) body.copy(frame, MUX_FRAME_HEADER_BYTES);

    return frame;
}

export function encodeWindowFrame(channelId: number, delta: number): Buffer {
    const payload = Buffer.allocUnsafe(4);
    payload.writeUInt32BE(delta, 0);

    return encodeFrame(MuxFrameType.Window, channelId, payload);
}

export function decodeFrame(raw: Buffer): MuxFrame | null {
    if (raw.length < MUX_FRAME_HEADER_BYTES) return null;

    const type = raw.readUInt8(0);

    if (!KNOWN_TYPES.has(type)) return null;

    return {
        type: type as MuxFrameTypeValue,
        channelId: raw.readUInt32BE(1),
        payload: raw.subarray(MUX_FRAME_HEADER_BYTES),
    };
}

export function readWindowDelta(payload: Buffer): number | null {
    return payload.length >= 4 ? payload.readUInt32BE(0) : null;
}
