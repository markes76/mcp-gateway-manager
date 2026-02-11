import { describe, expect, it } from "vitest";

import { IPCChannels } from "../src/index";

describe("IPCChannels", () => {
  it("exposes stable, namespaced channels", () => {
    expect(IPCChannels.healthCheck).toBe("gateway:health-check");
    expect(IPCChannels.getThemePreference).toBe("gateway:get-theme-preference");
    expect(IPCChannels.setThemePreference).toBe("gateway:set-theme-preference");
    expect(IPCChannels.loadGatewayState).toBe("gateway:load-state");
    expect(IPCChannels.pickConfigFilePath).toBe("gateway:pick-config-file-path");
    expect(IPCChannels.getUserConfig).toBe("gateway:get-user-config");
    expect(IPCChannels.updateUserConfig).toBe("gateway:update-user-config");
    expect(IPCChannels.getActivityLog).toBe("gateway:get-activity-log");
    expect(IPCChannels.previewSync).toBe("gateway:preview-sync");
    expect(IPCChannels.applySync).toBe("gateway:apply-sync");
    expect(IPCChannels.restartPlatforms).toBe("gateway:restart-platforms");
    expect(IPCChannels.assistantSuggestFromUrl).toBe("gateway:assistant-suggest-from-url");
  });
});
