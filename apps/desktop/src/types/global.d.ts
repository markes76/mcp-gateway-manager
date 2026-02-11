import type { GatewayApi } from "@mcp-gateway/ipc-contracts";

declare global {
  interface Window {
    mcpGateway: GatewayApi;
  }
}

export {};
