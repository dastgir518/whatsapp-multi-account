declare module "@wma/gateway/create-gateway" {
  import type { Server as HttpServer } from "http";
  import type { Express } from "express";
  import type { Server as SocketServer } from "socket.io";

  export type GatewayOptions = {
    corsOrigin?: string | string[] | boolean;
    rootDir?: string;
  };

  export function createGateway(
    httpServer: HttpServer,
    opts?: GatewayOptions
  ): {
    app: Express;
    io: SocketServer;
    sessions: {
      restoreConnectedAccounts(): Promise<void>;
    };
  };

  export function isGatewayPath(urlPath: string): boolean;
}
