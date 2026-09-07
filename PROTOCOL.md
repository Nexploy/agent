# Agent tunnel protocol

Version `1`. One WebSocket connection carries every Docker API exchange for one environment.

## Handshake

The agent opens `wss://<nexploy>/api/ws/agent` with:

| Header | Value |
| --- | --- |
| `Authorization` | `Bearer <agent token>` |
| `x-nexploy-agent-protocol` | protocol version, currently `1` |
| `x-nexploy-agent-system` | base64url JSON with the host and Docker details |

Nexploy answers `401` for an unknown or revoked token and `426` for an unsupported protocol version. On success the
socket is proxied to `docker-api`; there is no application-level handshake message.

`x-nexploy-agent-system` decodes to:

```json
{
  "agentVersion": "0.1.0",
  "hostname": "srv-1",
  "platform": "linux",
  "architecture": "x64",
  "dockerVersion": "27.3.1",
  "dockerApiVersion": "1.47",
  "operatingSystem": "linux",
  "totalMemoryBytes": 8232062976,
  "cpuCount": 4
}
```

## Framing

Text frames are unused. Every binary frame is:

```
byte  0      frame type
bytes 1..4   channel id, uint32 big endian
bytes 5..    payload
```

| Type | Name | Payload |
| --- | --- | --- |
| `0x01` | `OPEN` | empty — opens a channel |
| `0x02` | `DATA` | up to 64 KiB of raw Docker API bytes |
| `0x03` | `WINDOW` | uint32 big endian, bytes the receiver consumed |
| `0x04` | `FIN` | empty — no more data on this channel from the sender |
| `0x05` | `RESET` | empty — the channel is aborted |

`docker-api` is the initiator and uses odd channel ids; the agent only answers, never opens a channel.

## Flow control

Each channel starts with a 1 MiB send window. A sender may only emit `DATA` while its window is positive and
decrements it by the payload size. The receiver sends a `WINDOW` update once it has handed 512 KiB to its consumer.
This keeps a large image pull from starving an interactive terminal on the same tunnel.

## Lifecycle

- `docker-api` sends `OPEN` for every new connection on the environment's Unix socket; the agent connects to
  `/var/run/docker.sock` and pipes both directions.
- `FIN` half-closes one direction, which the Docker API relies on for hijacked streams.
- `RESET` aborts a channel; closing the WebSocket destroys every channel on it.
- The agent reconnects with exponential backoff between 1 s and 30 s.
