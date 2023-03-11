import { TransformStream } from "@yume-chan/stream-extra";
import Struct from "@yume-chan/struct";

export enum AdbCommand {
    Auth = 0x48545541, // 'AUTH'
    Close = 0x45534c43, // 'CLSE'
    Connect = 0x4e584e43, // 'CNXN'
    OK = 0x59414b4f, // 'OKAY'
    Open = 0x4e45504f, // 'OPEN'
    Write = 0x45545257, // 'WRTE'
}

export const AdbPacketHeader = new Struct({ littleEndian: true })
    .uint32("command")
    .uint32("arg0")
    .uint32("arg1")
    .uint32("payloadLength")
    .uint32("checksum")
    .int32("magic");

export type AdbPacketHeader = (typeof AdbPacketHeader)["TDeserializeResult"];

type AdbPacketHeaderInit = (typeof AdbPacketHeader)["TInit"];

export const AdbPacket = new Struct({ littleEndian: true })
    .fields(AdbPacketHeader)
    .uint8Array("payload", { lengthField: "payloadLength" });

export type AdbPacket = (typeof AdbPacket)["TDeserializeResult"];

/**
 * `AdbPacketData` contains all the useful fields of `AdbPacket`.
 *
 * `AdbBackend#connect` will return a `ReadableStream<AdbPacketData>`,
 * so each backend can encode `AdbPacket` in different ways.
 *
 * `AdbBackend#connect` will return a `WritableStream<AdbPacketInit>`,
 * however, `AdbPacketDispatcher` will transform `AdbPacketData` to `AdbPacketInit` for you,
 * so `AdbSocket#writable#write` only needs `AdbPacketData`.
 */
export type AdbPacketData = Omit<
    (typeof AdbPacket)["TInit"],
    "checksum" | "magic"
>;

export type AdbPacketInit = (typeof AdbPacket)["TInit"];

export function calculateChecksum(payload: Uint8Array): number {
    return payload.reduce((result, item) => result + item, 0);
}

export class AdbPacketSerializeStream extends TransformStream<
    AdbPacketInit,
    Uint8Array
> {
    public constructor() {
        super({
            transform: (init, controller) => {
                // This syntax is ugly, but I don't want to create a new object.
                (init as unknown as AdbPacketHeaderInit).payloadLength =
                    init.payload.byteLength;

                controller.enqueue(
                    AdbPacketHeader.serialize(
                        init as unknown as AdbPacketHeaderInit
                    )
                );

                if (init.payload.byteLength) {
                    // USB protocol preserves packet boundaries,
                    // so we must write payload separately as native ADB does,
                    // otherwise the read operation on device will fail.
                    controller.enqueue(init.payload);
                }
            },
        });
    }
}
