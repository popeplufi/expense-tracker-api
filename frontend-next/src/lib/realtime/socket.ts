import { io, type Socket } from "socket.io-client";

const WS_BASE = process.env.NEXT_PUBLIC_GATEWAY_WS_BASE ?? "http://127.0.0.1:4000";

export function connectGatewaySocket(accessToken: string): Socket {
  return io(WS_BASE, {
    path: "/ws",
    transports: ["websocket", "polling"],
    auth: {
      token: accessToken,
    },
  });
}
