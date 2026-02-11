import { contextBridge, ipcRenderer } from "electron";

import type { ThemeMode } from "@mcp-gateway/domain";
import {
  type AssistantSuggestRequest,
  type AssistantSuggestionResponse,
  type ActivityLogResponse,
  IPCChannels,
  type ApplySyncResponse,
  type GatewayStateResponse,
  type GatewayApi,
  type HealthCheckResponse,
  type PathActionRequest,
  type PathActionResponse,
  type PickConfigFileRequest,
  type PickConfigFileResponse,
  type RestartPlatformsRequest,
  type RestartPlatformsResponse,
  type SyncPlanPreviewResponse,
  type SyncRequestPayload,
  type UpdateUserConfigRequest,
  type ThemePreferenceResponse
} from "@mcp-gateway/ipc-contracts";

const gatewayApi: GatewayApi = {
  healthCheck: async (): Promise<HealthCheckResponse> =>
    ipcRenderer.invoke(IPCChannels.healthCheck),
  getThemePreference: async (): Promise<ThemePreferenceResponse> =>
    ipcRenderer.invoke(IPCChannels.getThemePreference),
  setThemePreference: async (mode: ThemeMode): Promise<ThemePreferenceResponse> =>
    ipcRenderer.invoke(IPCChannels.setThemePreference, mode),
  loadGatewayState: async (): Promise<GatewayStateResponse> =>
    ipcRenderer.invoke(IPCChannels.loadGatewayState),
  pickConfigFilePath: async (
    payload: PickConfigFileRequest
  ): Promise<PickConfigFileResponse> => ipcRenderer.invoke(IPCChannels.pickConfigFilePath, payload),
  revealPath: async (payload: PathActionRequest): Promise<PathActionResponse> =>
    ipcRenderer.invoke(IPCChannels.revealPath, payload),
  openPath: async (payload: PathActionRequest): Promise<PathActionResponse> =>
    ipcRenderer.invoke(IPCChannels.openPath, payload),
  getUserConfig: async () => ipcRenderer.invoke(IPCChannels.getUserConfig),
  updateUserConfig: async (payload: UpdateUserConfigRequest) =>
    ipcRenderer.invoke(IPCChannels.updateUserConfig, payload),
  getActivityLog: async (): Promise<ActivityLogResponse> =>
    ipcRenderer.invoke(IPCChannels.getActivityLog),
  previewSync: async (payload: SyncRequestPayload): Promise<SyncPlanPreviewResponse> =>
    ipcRenderer.invoke(IPCChannels.previewSync, payload),
  applySync: async (payload: SyncRequestPayload): Promise<ApplySyncResponse> =>
    ipcRenderer.invoke(IPCChannels.applySync, payload),
  restartPlatforms: async (
    payload: RestartPlatformsRequest
  ): Promise<RestartPlatformsResponse> =>
    ipcRenderer.invoke(IPCChannels.restartPlatforms, payload),
  assistantSuggestFromUrl: async (
    payload: AssistantSuggestRequest
  ): Promise<AssistantSuggestionResponse> =>
    ipcRenderer.invoke(IPCChannels.assistantSuggestFromUrl, payload)
};

contextBridge.exposeInMainWorld("mcpGateway", gatewayApi);
