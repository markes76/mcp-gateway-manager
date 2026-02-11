import { useEffect, useMemo, useState } from "react";

import type { ThemeMode } from "@mcp-gateway/domain";
import type {
  ActivityEntry,
  AssistantSuggestionResponse,
  GatewayStateResponse,
  MatrixPolicyInput,
  SupportedPlatform,
  SyncPlanPreviewResponse,
  UserConfigResponse
} from "@mcp-gateway/ipc-contracts";

import { StatusPill } from "@/components/StatusPill";
import { ThemeToggle } from "@/components/ThemeToggle";
import { buildPolicyFromAssistantInput } from "@/lib/assistant";
import {
  addPolicyDefinitionForPlatform,
  buildSyncRequestPayload,
  derivePoliciesFromState,
  hasPlatformDefinition,
  isPolicySharedAcrossPlatforms,
  removePolicyDefinitionForPlatform,
  sharePolicyAcrossAllPlatforms,
  SUPPORTED_PLATFORMS
} from "@/lib/matrix";
import { applyTheme } from "@/lib/theme";

type PageKey = "dashboard" | "assistant" | "matrix" | "registry" | "activity" | "settings";

type AssistantScope = "all" | "selected";

const pages: Array<{ key: PageKey; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "assistant", label: "Assistant" },
  { key: "matrix", label: "Platform Matrix" },
  { key: "registry", label: "MCP Registry" },
  { key: "activity", label: "Activity Log" },
  { key: "settings", label: "Settings" }
];

function labelForPlatform(platform: SupportedPlatform): string {
  switch (platform) {
    case "claude":
      return "Claude";
    case "cursor":
      return "Cursor";
    case "codex":
      return "Codex";
    default:
      return platform;
  }
}

function labelForActivityType(type: ActivityEntry["type"]): string {
  switch (type) {
    case "sync-apply":
      return "Sync Apply";
    case "assistant-analysis":
      return "Assistant Analysis";
    case "settings-update":
      return "Settings Update";
    case "platform-restart":
      return "Platform Restart";
    default:
      return type;
  }
}

function defaultAssistantPlatformSelection(): Record<SupportedPlatform, boolean> {
  return {
    claude: true,
    cursor: true,
    codex: true
  };
}

function emptyPathInputs(): Record<SupportedPlatform, string> {
  return {
    claude: "",
    cursor: "",
    codex: ""
  };
}

function toPathInputs(config: UserConfigResponse | null): Record<SupportedPlatform, string> {
  if (!config) {
    return emptyPathInputs();
  }

  return {
    claude: config.platforms.claude.configPathOverride ?? "",
    cursor: config.platforms.cursor.configPathOverride ?? "",
    codex: config.platforms.codex.configPathOverride ?? ""
  };
}

function emptyAdditionalPathInputs(): Record<SupportedPlatform, string[]> {
  return {
    claude: [],
    cursor: [],
    codex: []
  };
}

function toAdditionalPathInputs(config: UserConfigResponse | null): Record<SupportedPlatform, string[]> {
  if (!config) {
    return emptyAdditionalPathInputs();
  }

  return {
    claude: [...config.platforms.claude.additionalConfigPaths],
    cursor: [...config.platforms.cursor.additionalConfigPaths],
    codex: [...config.platforms.codex.additionalConfigPaths]
  };
}

function sanitizePathInput(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value);
}

function toAssistantEnvInputs(
  suggestion: AssistantSuggestionResponse,
  current: Record<string, string>
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const hint of suggestion.requiredEnvVars) {
    next[hint.name] = current[hint.name] ?? "";
  }
  return next;
}

function upsertPolicyRows(current: MatrixPolicyInput[], incoming: MatrixPolicyInput): MatrixPolicyInput[] {
  const existingIndex = current.findIndex((policy) => policy.name === incoming.name);

  if (existingIndex === -1) {
    return [...current, incoming].sort((a, b) => a.name.localeCompare(b.name));
  }

  const next = [...current];
  next[existingIndex] = incoming;
  return next;
}

function describeDefinition(policy: MatrixPolicyInput, platform: SupportedPlatform): string {
  const definition = policy.platformDefinitions[platform];
  if (!definition) {
    return "Not configured";
  }

  const argsText = definition.args?.length ? ` ${definition.args.join(" ")}` : "";
  const envKeys = definition.env ? Object.keys(definition.env) : [];
  const envText = envKeys.length > 0 ? ` | env: ${envKeys.join(", ")}` : "";
  const enabledText = policy.platformEnabled[platform] ? "enabled" : "disabled";

  return `${definition.command}${argsText} | ${enabledText}${envText}`;
}

export default function App() {
  const [activePage, setActivePage] = useState<PageKey>("dashboard");
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const [healthStatus, setHealthStatus] = useState("Checking runtime...");

  const [gatewayState, setGatewayState] = useState<GatewayStateResponse | null>(null);
  const [policies, setPolicies] = useState<MatrixPolicyInput[]>([]);
  const [isLoadingState, setIsLoadingState] = useState(true);
  const [stateError, setStateError] = useState<string | null>(null);

  const [preview, setPreview] = useState<SyncPlanPreviewResponse | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);
  const [restartMessage, setRestartMessage] = useState<string | null>(null);

  const [assistantUrl, setAssistantUrl] = useState("");
  const [assistantSuggestion, setAssistantSuggestion] = useState<AssistantSuggestionResponse | null>(null);
  const [assistantName, setAssistantName] = useState("");
  const [assistantCommand, setAssistantCommand] = useState("");
  const [assistantArgs, setAssistantArgs] = useState("");
  const [assistantEnabled, setAssistantEnabled] = useState(true);
  const [assistantScope, setAssistantScope] = useState<AssistantScope>("all");
  const [assistantPlatforms, setAssistantPlatforms] = useState<Record<SupportedPlatform, boolean>>(
    defaultAssistantPlatformSelection()
  );
  const [assistantEnvValues, setAssistantEnvValues] = useState<Record<string, string>>({});
  const [assistantMessage, setAssistantMessage] = useState<string | null>(null);

  const [userConfig, setUserConfig] = useState<UserConfigResponse | null>(null);
  const [settingsPaths, setSettingsPaths] = useState<Record<SupportedPlatform, string>>(emptyPathInputs());
  const [settingsAdditionalPaths, setSettingsAdditionalPaths] = useState<Record<SupportedPlatform, string[]>>(
    emptyAdditionalPathInputs()
  );
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(false);
  const [activityMessage, setActivityMessage] = useState<string | null>(null);

  const loadGatewayState = async (): Promise<{
    state: GatewayStateResponse;
    derivedPolicies: MatrixPolicyInput[];
  } | null> => {
    setIsLoadingState(true);
    setStateError(null);

    try {
      const state = await window.mcpGateway.loadGatewayState();
      const derivedPolicies = derivePoliciesFromState(state);
      setGatewayState(state);
      setPolicies(derivedPolicies);
      return { state, derivedPolicies };
    } catch (error) {
      setStateError(error instanceof Error ? error.message : "Failed to load gateway state.");
      return null;
    } finally {
      setIsLoadingState(false);
    }
  };

  const loadUserConfig = async (): Promise<void> => {
    setIsLoadingSettings(true);
    setSettingsMessage(null);

    try {
      const config = await window.mcpGateway.getUserConfig();
      setUserConfig(config);
      setSettingsPaths(toPathInputs(config));
      setSettingsAdditionalPaths(toAdditionalPathInputs(config));
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "Failed to load settings.");
    } finally {
      setIsLoadingSettings(false);
    }
  };

  const loadActivityLog = async (): Promise<void> => {
    setIsLoadingActivity(true);
    setActivityMessage(null);

    try {
      const response = await window.mcpGateway.getActivityLog();
      setActivityEntries(response.entries);
    } catch (error) {
      setActivityMessage(error instanceof Error ? error.message : "Failed to load activity log.");
    } finally {
      setIsLoadingActivity(false);
    }
  };

  useEffect(() => {
    void window.mcpGateway
      .healthCheck()
      .then((response) => {
        setHealthStatus(`Runtime healthy at ${new Date(response.timestamp).toLocaleTimeString()}`);
      })
      .catch(() => {
        setHealthStatus("Runtime check failed");
      });

    void window.mcpGateway
      .getThemePreference()
      .then(({ mode }) => {
        setThemeMode(mode);
        applyTheme(mode);
      })
      .catch(() => {
        setThemeMode("system");
        applyTheme("system");
      });

    void loadGatewayState();
    void loadUserConfig();
  }, []);

  useEffect(() => {
    if (activePage === "activity") {
      void loadActivityLog();
    }

    if (activePage === "settings") {
      void loadUserConfig();
    }
  }, [activePage]);

  useEffect(() => {
    applyTheme(themeMode);
  }, [themeMode]);

  const pageHeadline = useMemo(() => {
    switch (activePage) {
      case "dashboard":
        return "Single control plane for local MCP operations.";
      case "assistant":
        return "Analyze URLs or plain-language questions and generate nearly ready MCP config.";
      case "matrix":
        return "Enable, disable, share, or isolate MCP servers by platform before apply.";
      case "registry":
        return "Inspect all MCP definitions and platform-specific command details.";
      case "activity":
        return "Audit settings updates, assistant analysis, and sync apply operations.";
      case "settings":
        return "Customize platform config paths and local safety defaults.";
      default:
        return "";
    }
  }, [activePage]);

  const handleThemeChange = async (mode: ThemeMode): Promise<void> => {
    setIsSavingTheme(true);
    try {
      const result = await window.mcpGateway.setThemePreference(mode);
      setThemeMode(result.mode);
    } finally {
      setIsSavingTheme(false);
    }
  };

  const handleGlobalToggle = (policyName: string, enabled: boolean): void => {
    setPolicies((current) =>
      current.map((policy) => {
        if (policy.name !== policyName) {
          return policy;
        }

        const platformEnabled = { ...policy.platformEnabled };
        for (const platform of SUPPORTED_PLATFORMS) {
          if (hasPlatformDefinition(policy, platform)) {
            platformEnabled[platform] = enabled;
          }
        }

        return {
          ...policy,
          globalEnabled: enabled,
          platformEnabled
        };
      })
    );
    setPreview(null);
  };

  const handlePlatformToggle = (
    policyName: string,
    platform: SupportedPlatform,
    enabled: boolean
  ): void => {
    setPolicies((current) =>
      current.map((policy) => {
        if (policy.name !== policyName || !hasPlatformDefinition(policy, platform)) {
          return policy;
        }

        const platformEnabled = {
          ...policy.platformEnabled,
          [platform]: enabled
        };

        const globalEnabled = SUPPORTED_PLATFORMS.some((candidate) => {
          return hasPlatformDefinition(policy, candidate) && platformEnabled[candidate];
        });

        return {
          ...policy,
          globalEnabled,
          platformEnabled
        };
      })
    );
    setPreview(null);
  };

  const handleAddPlatformDefinition = (policyName: string, platform: SupportedPlatform): void => {
    setPolicies((current) =>
      current.map((policy) => {
        if (policy.name !== policyName) {
          return policy;
        }

        return addPolicyDefinitionForPlatform(policy, platform);
      })
    );
    setPreview(null);
  };

  const handleRemovePlatformDefinition = (policyName: string, platform: SupportedPlatform): void => {
    const confirmed = window.confirm(
      `Remove ${labelForPlatform(platform)} definition for '${policyName}'? This change is applied only after you run Apply Sync.`
    );

    if (!confirmed) {
      return;
    }

    setPolicies((current) =>
      current.flatMap((policy) => {
        if (policy.name !== policyName) {
          return [policy];
        }

        const updated = removePolicyDefinitionForPlatform(policy, platform);
        return updated ? [updated] : [];
      })
    );
    setPreview(null);
  };

  const handleShareAcrossAllPlatforms = (policyName: string): void => {
    setPolicies((current) =>
      current.map((policy) => {
        if (policy.name !== policyName) {
          return policy;
        }

        return sharePolicyAcrossAllPlatforms(policy);
      })
    );
    setPreview(null);
  };

  const handlePreview = async (): Promise<void> => {
    if (!gatewayState) {
      return;
    }

    setIsPreviewing(true);
    setApplyMessage(null);

    try {
      const payload = buildSyncRequestPayload(policies, gatewayState);
      const result = await window.mcpGateway.previewSync(payload);
      setPreview(result);
    } catch (error) {
      setApplyMessage(error instanceof Error ? error.message : "Failed to preview sync plan.");
    } finally {
      setIsPreviewing(false);
    }
  };

  const maybeRestartUpdatedPlatforms = async (platforms: SupportedPlatform[]): Promise<void> => {
    const uniquePlatforms = [...new Set(platforms)];

    if (uniquePlatforms.length === 0) {
      setRestartMessage(null);
      return;
    }

    const autoRestartablePlatforms = uniquePlatforms.filter((platform) => platform !== "codex");
    const manualRestartPlatforms = uniquePlatforms.filter((platform) => platform === "codex");
    const platformLabel = uniquePlatforms.map((platform) => labelForPlatform(platform)).join(", ");

    if (autoRestartablePlatforms.length === 0 && manualRestartPlatforms.length > 0) {
      setRestartMessage(
        "Codex configuration changed. Restart Codex manually when you are ready to avoid interrupting the current Codex session."
      );
      return;
    }

    const autoRestartLabel = autoRestartablePlatforms.map((platform) => labelForPlatform(platform)).join(", ");
    const confirmed = window.confirm(
      [
        `Configuration changed for: ${platformLabel}.`,
        `Restart now for: ${autoRestartLabel}.`,
        "Safe mode restart will request normal app quit, then relaunch.",
        "Restart now?"
      ].join("\n")
    );

    if (!confirmed) {
      setRestartMessage(`Restart ${platformLabel} manually later to load the latest MCP configuration.`);
      return;
    }

    try {
      const response = await window.mcpGateway.restartPlatforms({
        platforms: autoRestartablePlatforms,
        force: false
      });

      const failed = response.results.filter((result) => !result.restarted);
      const codexNote =
        manualRestartPlatforms.length > 0
          ? " Restart Codex manually to load the new MCP configuration."
          : "";
      if (failed.length === 0) {
        setRestartMessage(`Restarted ${autoRestartLabel}.${codexNote}`);
      } else {
        setRestartMessage(`${failed.map((result) => result.message).join(" | ")}${codexNote}`);
      }

      if (activePage === "activity") {
        await loadActivityLog();
      }
    } catch (error) {
      setRestartMessage(
        error instanceof Error
          ? `Auto-restart failed: ${error.message}`
          : "Auto-restart failed for one or more platforms."
      );
    }
  };

  const handleApply = async (): Promise<void> => {
    if (!gatewayState) {
      return;
    }

    setIsApplying(true);
    setApplyMessage(null);
    setRestartMessage(null);

    try {
      const payload = buildSyncRequestPayload(policies, gatewayState);
      const result = await window.mcpGateway.applySync(payload);
      setApplyMessage(
        `Applied ${result.operations.length} platform update(s) at ${new Date(result.appliedAt).toLocaleTimeString()}.`
      );
      await maybeRestartUpdatedPlatforms(result.operations.map((operation) => operation.platform));
      await loadGatewayState();
      if (activePage === "activity") {
        await loadActivityLog();
      }
      setPreview(null);
    } catch (error) {
      setApplyMessage(error instanceof Error ? error.message : "Failed to apply sync plan.");
    } finally {
      setIsApplying(false);
    }
  };

  const handleAnalyzeAssistantUrl = async (): Promise<void> => {
    if (assistantUrl.trim().length === 0) {
      setAssistantMessage("Provide an MCP URL, package name, or plain-language configuration question.");
      return;
    }

    setAssistantMessage("Analyzing with Codex Internal...");

    try {
      const suggestion = await window.mcpGateway.assistantSuggestFromUrl({
        input: assistantUrl
      });

      setAssistantSuggestion(suggestion);
      setAssistantName(suggestion.suggestedName);
      setAssistantCommand(suggestion.suggestedCommand);
      setAssistantArgs(suggestion.suggestedArgs.join(" "));
      setAssistantPlatforms(defaultAssistantPlatformSelection());
      setAssistantEnabled(true);
      setAssistantScope("all");
      setAssistantEnvValues((current) => toAssistantEnvInputs(suggestion, current));
      setAssistantMessage(
        `Detected ${suggestion.sourceKind} via ${suggestion.provider} (${suggestion.mode}). Review and apply when ready.`
      );
    } catch (error) {
      setAssistantMessage(
        error instanceof Error
          ? `Codex Internal analysis failed: ${error.message}`
          : "Codex Internal analysis failed."
      );
    }
  };

  const handleAssistantPlatformToggle = (platform: SupportedPlatform, checked: boolean): void => {
    setAssistantPlatforms((current) => ({
      ...current,
      [platform]: checked
    }));
  };

  const handleAssistantEnvValueChange = (name: string, value: string): void => {
    setAssistantEnvValues((current) => ({
      ...current,
      [name]: value
    }));
  };

  const buildAssistantPolicyCandidate = (): MatrixPolicyInput | null => {
    const name = assistantName.trim();
    const command = assistantCommand.trim();

    if (name.length === 0 || command.length === 0) {
      setAssistantMessage("Name and command are required.");
      return null;
    }

    if (
      assistantScope === "selected" &&
      SUPPORTED_PLATFORMS.every((platform) => assistantPlatforms[platform] === false)
    ) {
      setAssistantMessage("Select at least one platform when using selected scope.");
      return null;
    }

    const missingRequiredEnvVars =
      assistantSuggestion?.requiredEnvVars
        .filter((hint) => hint.required)
        .map((hint) => hint.name)
        .filter((nameValue) => (assistantEnvValues[nameValue] ?? "").trim().length === 0) ?? [];

    if (missingRequiredEnvVars.length > 0) {
      setAssistantMessage(`Missing required values: ${missingRequiredEnvVars.join(", ")}.`);
      return null;
    }

    const nextPolicy = buildPolicyFromAssistantInput({
      name,
      command,
      argsText: assistantArgs,
      enabled: assistantEnabled,
      envValues: assistantEnvValues,
      scope: assistantScope,
      selectedPlatforms: assistantPlatforms
    });

    const definitionCount = Object.keys(nextPolicy.platformDefinitions).length;
    if (definitionCount === 0) {
      setAssistantMessage("No platform definitions were created. Adjust scope and platform selection.");
      return null;
    }

    return nextPolicy;
  };

  const handleAddAssistantPolicy = (): void => {
    const nextPolicy = buildAssistantPolicyCandidate();
    if (!nextPolicy) {
      return;
    }

    setPolicies((current) => upsertPolicyRows(current, nextPolicy));
    setPreview(null);
    setApplyMessage(`Added '${nextPolicy.name}' to matrix. Preview and apply when ready.`);
    setAssistantMessage(`'${nextPolicy.name}' is ready in Platform Matrix.`);
    setActivePage("matrix");
  };

  const handleAssistantConfirmAndApply = async (): Promise<void> => {
    const nextPolicy = buildAssistantPolicyCandidate();
    if (!nextPolicy) {
      return;
    }

    if (!gatewayState) {
      setAssistantMessage("Gateway state is still loading. Try again in a moment.");
      return;
    }

    const stagedPolicies = upsertPolicyRows(policies, nextPolicy);
    const payload = buildSyncRequestPayload(stagedPolicies, gatewayState);

    setIsPreviewing(true);
    setAssistantMessage("Generating sync preview...");

    try {
      const previewResult = await window.mcpGateway.previewSync(payload);
      setPreview(previewResult);

      if (previewResult.totalOperations === 0) {
        setPolicies(stagedPolicies);
        setAssistantMessage(
          `No configuration changes detected for '${nextPolicy.name}'. Policy was staged in matrix.`
        );
        setActivePage("matrix");
        return;
      }

      const confirmed = window.confirm(
        [
          `Apply ${previewResult.totalOperations} operation(s) now?`,
          `Claude: ${previewResult.byPlatform.claude.operationCount}`,
          `Cursor: ${previewResult.byPlatform.cursor.operationCount}`,
          `Codex: ${previewResult.byPlatform.codex.operationCount}`
        ].join("\n")
      );

      if (!confirmed) {
        setPolicies(stagedPolicies);
        setAssistantMessage(`Apply canceled. '${nextPolicy.name}' is staged in Platform Matrix.`);
        setActivePage("matrix");
        return;
      }

      setIsApplying(true);
      setRestartMessage(null);
      const applyResult = await window.mcpGateway.applySync(payload);
      setApplyMessage(
        `Applied ${applyResult.operations.length} platform update(s) at ${new Date(applyResult.appliedAt).toLocaleTimeString()}.`
      );
      setAssistantMessage(
        `'${nextPolicy.name}' was applied successfully across ${applyResult.operations.length} platform update(s).`
      );
      await maybeRestartUpdatedPlatforms(applyResult.operations.map((operation) => operation.platform));
      await loadGatewayState();
      await loadActivityLog();
      setActivePage("matrix");
    } catch (error) {
      setAssistantMessage(
        error instanceof Error ? `Confirm & apply failed: ${error.message}` : "Confirm & apply failed."
      );
    } finally {
      setIsPreviewing(false);
      setIsApplying(false);
    }
  };

  const handleSaveSettings = async (): Promise<void> => {
    const invalidPlatforms = SUPPORTED_PLATFORMS.filter((platform) => {
      const value = settingsPaths[platform].trim();
      return value.length > 0 && !isAbsolutePath(value);
    });

    const invalidAdditionalPathPlatforms = SUPPORTED_PLATFORMS.filter((platform) =>
      settingsAdditionalPaths[platform].some((pathValue) => !isAbsolutePath(pathValue))
    );

    if (invalidPlatforms.length > 0 || invalidAdditionalPathPlatforms.length > 0) {
      const combined = [...new Set([...invalidPlatforms, ...invalidAdditionalPathPlatforms])];
      setSettingsMessage(
        `Use absolute paths for: ${combined.map((platform) => labelForPlatform(platform)).join(", ")}.`
      );
      return;
    }

    setIsSavingSettings(true);
    setSettingsMessage(null);

    try {
      const updated = await window.mcpGateway.updateUserConfig({
        platforms: {
          claude: {
            configPathOverride: sanitizePathInput(settingsPaths.claude),
            additionalConfigPaths: settingsAdditionalPaths.claude
          },
          cursor: {
            configPathOverride: sanitizePathInput(settingsPaths.cursor),
            additionalConfigPaths: settingsAdditionalPaths.cursor
          },
          codex: {
            configPathOverride: sanitizePathInput(settingsPaths.codex),
            additionalConfigPaths: settingsAdditionalPaths.codex
          }
        }
      });

      setUserConfig(updated);
      setSettingsPaths(toPathInputs(updated));
      setSettingsAdditionalPaths(toAdditionalPathInputs(updated));
      setSettingsMessage(
        `Settings saved at ${new Date(updated.savedAt ?? new Date().toISOString()).toLocaleTimeString()}.`
      );
      const loaded = await loadGatewayState();

      if (loaded) {
        const shouldPreviewMerge = window.confirm(
          "Path configuration was updated. Generate a sync/merge preview now?"
        );

        if (shouldPreviewMerge) {
          setActivePage("matrix");
          setIsPreviewing(true);
          try {
            const payload = buildSyncRequestPayload(loaded.derivedPolicies, loaded.state);
            const previewResult = await window.mcpGateway.previewSync(payload);
            setPreview(previewResult);
            setApplyMessage(`Merge preview generated with ${previewResult.totalOperations} operation(s).`);
          } catch (error) {
            setApplyMessage(
              error instanceof Error ? error.message : "Failed to preview sync plan after settings update."
            );
          } finally {
            setIsPreviewing(false);
          }
        }
      }
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleBrowseOverridePath = async (platform: SupportedPlatform): Promise<void> => {
    try {
      const selected = await window.mcpGateway.pickConfigFilePath({ platform });
      if (!selected.path) {
        return;
      }

      setSettingsPaths((current) => ({
        ...current,
        [platform]: selected.path ?? ""
      }));
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "Unable to browse for config file.");
    }
  };

  const handleAddAdditionalPath = async (platform: SupportedPlatform): Promise<void> => {
    try {
      const selected = await window.mcpGateway.pickConfigFilePath({ platform });
      if (!selected.path) {
        return;
      }
      const selectedPath = selected.path;

      setSettingsAdditionalPaths((current) => {
        const next = new Set(current[platform]);
        next.add(selectedPath);
        return {
          ...current,
          [platform]: [...next]
        };
      });
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : "Unable to browse for config file.");
    }
  };

  const handleRemoveAdditionalPath = (platform: SupportedPlatform, targetPath: string): void => {
    setSettingsAdditionalPaths((current) => ({
      ...current,
      [platform]: current[platform].filter((value) => value !== targetPath)
    }));
  };

  const renderDashboard = () => {
    const detectedPlatforms = gatewayState?.platforms.filter((platform) => platform.found).length ?? 0;
    const totalPlatforms = gatewayState?.platforms.length ?? 3;
    const activePolicies = policies.filter((policy) => policy.globalEnabled).length;

    return (
      <section className="content-grid">
        <article className="card card-hero">
          <h3>Workspace Readiness</h3>
          <p>
            One control plane for Claude, Cursor, and Codex with typed sync previews, backups, and apply logs.
          </p>
          <ul>
            <li>Assistant can analyze URL docs or natural-language MCP configuration requests.</li>
            <li>Platform Matrix supports per-platform add/remove/disable and one-click sharing.</li>
            <li>Settings and activity are persisted locally for transparent operations.</li>
          </ul>
        </article>

        <article className="card">
          <h3>Theme Controls</h3>
          <ThemeToggle isSaving={isSavingTheme} mode={themeMode} onChange={handleThemeChange} />
        </article>

        <article className="card">
          <h3>State Snapshot</h3>
          <p>
            {detectedPlatforms} of {totalPlatforms} platform configs currently detected.
          </p>
          <p>{activePolicies} MCP policy row(s) currently enabled.</p>
          {gatewayState?.lastAppliedAt ? (
            <p>Last apply: {new Date(gatewayState.lastAppliedAt).toLocaleString()}</p>
          ) : (
            <p>No sync apply has been executed in this session.</p>
          )}
        </article>
      </section>
    );
  };

  const renderAssistantPage = () => {
    return (
      <section className="content-grid assistant-grid">
        <article className="card card-hero">
          <h3>MCP Analyze</h3>
          <p>
            Paste documentation or package URL, or ask a plain-language question such as &ldquo;How do I
            configure Tavily MCP?&rdquo;
          </p>
          <div className="field-grid">
            <label className="form-field">
              <span>MCP URL Or Question</span>
              <input
                className="text-input"
                onChange={(event) => setAssistantUrl(event.target.value)}
                placeholder="https://www.npmjs.com/package/@acme/mcp-server or 'configure Tavily MCP for all platforms'"
                type="text"
                value={assistantUrl}
              />
            </label>
            <button className="action-button" onClick={() => void handleAnalyzeAssistantUrl()} type="button">
              Analyze & Suggest
            </button>
          </div>
          {assistantSuggestion ? (
            <div className="assistant-insight">
              <p>
                Source: <strong>{assistantSuggestion.sourceKind}</strong> | Provider:{" "}
                <strong>{assistantSuggestion.provider}</strong> ({assistantSuggestion.mode}) | Docs fetched:{" "}
                <strong>{assistantSuggestion.docsContextUsed ? "Yes" : "No"}</strong>
              </p>
              <p>{assistantSuggestion.summary}</p>
              {assistantSuggestion.installSteps.length > 0 ? (
                <>
                  <p className="helper-text">Suggested setup steps:</p>
                  <ul>
                    {assistantSuggestion.installSteps.map((step, index) => (
                      <li key={`${step}-${index}`}>{step}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {assistantSuggestion.questions.length > 0 ? (
                <ul>
                  {assistantSuggestion.questions.map((question) => (
                    <li key={question.id}>{question.text}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </article>

        <article className="card card-hero">
          <h3>Configuration</h3>
          <div className="field-grid assistant-form-grid">
            <label className="form-field">
              <span>Server Name</span>
              <input
                className="text-input"
                onChange={(event) => setAssistantName(event.target.value)}
                type="text"
                value={assistantName}
              />
            </label>

            <label className="form-field">
              <span>Command</span>
              <input
                className="text-input"
                onChange={(event) => setAssistantCommand(event.target.value)}
                type="text"
                value={assistantCommand}
              />
            </label>

            <label className="form-field">
              <span>Args (space separated)</span>
              <input
                className="text-input"
                onChange={(event) => setAssistantArgs(event.target.value)}
                type="text"
                value={assistantArgs}
              />
            </label>

            <label className="form-field checkbox-field">
              <input
                checked={assistantEnabled}
                onChange={(event) => setAssistantEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>Enable server by default</span>
            </label>

            {assistantSuggestion?.requiredEnvVars.length ? (
              <div className="form-field assistant-env-field">
                <span>Required API Keys / Env Vars</span>
                <div className="assistant-env-list">
                  {assistantSuggestion.requiredEnvVars.map((hint) => (
                    <label className="form-field" key={hint.name}>
                      <span>
                        {hint.name}
                        {hint.required ? <strong className="required-chip">Required</strong> : null}
                      </span>
                      <input
                        className="text-input"
                        onChange={(event) =>
                          handleAssistantEnvValueChange(hint.name, event.target.value)
                        }
                        placeholder={hint.example ?? "Enter value"}
                        type="password"
                        value={assistantEnvValues[hint.name] ?? ""}
                      />
                      <small className="helper-text">{hint.description}</small>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <p className="helper-text">
                No required API keys detected by the assistant for this source.
              </p>
            )}

            <div className="form-field">
              <span>Scope</span>
              <div className="assistant-scope-options">
                <label>
                  <input
                    checked={assistantScope === "all"}
                    name="assistant-scope"
                    onChange={() => setAssistantScope("all")}
                    type="radio"
                  />
                  <span>All platforms</span>
                </label>
                <label>
                  <input
                    checked={assistantScope === "selected"}
                    name="assistant-scope"
                    onChange={() => setAssistantScope("selected")}
                    type="radio"
                  />
                  <span>Selected platforms</span>
                </label>
              </div>
            </div>

            {assistantScope === "selected" ? (
              <div className="form-field">
                <span>Selected Platforms</span>
                <div className="assistant-platforms">
                  {SUPPORTED_PLATFORMS.map((platform) => (
                    <label className="assistant-platform-option" key={platform}>
                      <input
                        checked={assistantPlatforms[platform]}
                        onChange={(event) =>
                          handleAssistantPlatformToggle(platform, event.target.checked)
                        }
                        type="checkbox"
                      />
                      <span>{labelForPlatform(platform)}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="matrix-actions">
            <button
              className="action-button"
              disabled={isPreviewing || isApplying}
              onClick={handleAddAssistantPolicy}
              type="button"
            >
              Add To Matrix
            </button>
            <button
              className="action-button action-button-primary"
              disabled={isPreviewing || isApplying}
              onClick={() => void handleAssistantConfirmAndApply()}
              type="button"
            >
              {isPreviewing || isApplying ? "Working..." : "Confirm & Apply"}
            </button>
          </div>
          {assistantMessage ? <p>{assistantMessage}</p> : null}
        </article>
      </section>
    );
  };

  const renderMatrixPage = () => {
    if (isLoadingState) {
      return (
        <section className="content-grid">
          <article className="card card-hero">
            <h3>Loading Platform State</h3>
            <p>Reading configuration files and constructing matrix view.</p>
          </article>
        </section>
      );
    }

    if (stateError) {
      return (
        <section className="content-grid">
          <article className="card card-hero">
            <h3>Unable To Load Platform State</h3>
            <p>{stateError}</p>
            <button className="action-button" onClick={() => void loadGatewayState()} type="button">
              Retry
            </button>
          </article>
        </section>
      );
    }

    const state = gatewayState;
    if (!state) {
      return (
        <section className="content-grid">
          <article className="card card-hero">
            <h3>No Data Available</h3>
            <p>Gateway state is unavailable. Retry loading to continue.</p>
          </article>
        </section>
      );
    }

    return (
      <section className="content-grid matrix-grid">
        <article className="card card-hero">
          <h3>Platform Status</h3>
          <div className="platform-status-grid">
            {state.platforms.map((platform) => (
              <div className="platform-status-item" key={platform.platform}>
                <h4>{labelForPlatform(platform.platform)}</h4>
                <p>{platform.found ? "Configuration detected" : "Using fallback path"}</p>
                <code>{platform.configPath}</code>
                {platform.error ? <p className="error-text">{platform.error}</p> : null}
              </div>
            ))}
          </div>
        </article>

        <article className="card card-hero">
          <h3>Server Matrix</h3>
          {policies.length === 0 ? (
            <p>No MCP servers found in current configs. Use Assistant to add and scope a new MCP.</p>
          ) : (
            <table className="matrix-table">
              <thead>
                <tr>
                  <th>MCP Server</th>
                  <th>Mode</th>
                  <th>Global</th>
                  <th>Claude</th>
                  <th>Cursor</th>
                  <th>Codex</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr key={policy.name}>
                    <td className="server-name">{policy.name}</td>
                    <td>
                      <div className="mode-cell">
                        <span
                          className={
                            isPolicySharedAcrossPlatforms(policy)
                              ? "mode-pill mode-pill-shared"
                              : "mode-pill mode-pill-custom"
                          }
                        >
                          {isPolicySharedAcrossPlatforms(policy) ? "Shared" : "Custom"}
                        </span>
                        <button
                          className="inline-link"
                          onClick={() => handleShareAcrossAllPlatforms(policy.name)}
                          type="button"
                        >
                          Share all
                        </button>
                      </div>
                    </td>
                    <td>
                      <input
                        checked={policy.globalEnabled}
                        onChange={(event) => handleGlobalToggle(policy.name, event.target.checked)}
                        type="checkbox"
                      />
                    </td>
                    {SUPPORTED_PLATFORMS.map((platform) => {
                      const hasDefinition = hasPlatformDefinition(policy, platform);
                      return (
                        <td key={platform}>
                          {hasDefinition ? (
                            <div className="platform-cell">
                              <input
                                checked={policy.platformEnabled[platform]}
                                onChange={(event) =>
                                  handlePlatformToggle(policy.name, platform, event.target.checked)
                                }
                                type="checkbox"
                              />
                              <button
                                className="chip-button"
                                onClick={() => handleRemovePlatformDefinition(policy.name, platform)}
                                title={`Remove ${labelForPlatform(platform)} definition`}
                                type="button"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <button
                              className="chip-button"
                              onClick={() => handleAddPlatformDefinition(policy.name, platform)}
                              type="button"
                            >
                              Add
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>

        <article className="card">
          <h3>Plan And Apply</h3>
          <div className="matrix-actions">
            <button
              className="action-button"
              disabled={isPreviewing || isApplying}
              onClick={() => void handlePreview()}
              type="button"
            >
              {isPreviewing ? "Previewing..." : "Preview Sync"}
            </button>
            <button
              className="action-button action-button-primary"
              disabled={isApplying || isPreviewing}
              onClick={() => void handleApply()}
              type="button"
            >
              {isApplying ? "Applying..." : "Apply Sync"}
            </button>
          </div>
          {preview ? (
            <div className="preview-box">
              <p>Total operations: {preview.totalOperations}</p>
              <ul>
                {SUPPORTED_PLATFORMS.map((platform) => (
                  <li key={platform}>
                    {labelForPlatform(platform)}: {preview.byPlatform[platform].operationCount}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {applyMessage ? <p>{applyMessage}</p> : null}
          {restartMessage ? <p>{restartMessage}</p> : null}
        </article>
      </section>
    );
  };

  const renderRegistryPage = () => {
    return (
      <section className="content-grid">
        <article className="card card-hero">
          <h3>Managed MCP Registry</h3>
          <p>
            Read-only view of current MCP definitions across platforms. Use Platform Matrix to edit and apply.
          </p>
        </article>

        <article className="card card-hero">
          {policies.length === 0 ? (
            <p>No servers in registry yet. Use Assistant to add one and then apply sync.</p>
          ) : (
            <div className="registry-grid">
              {policies.map((policy) => (
                <article className="registry-item" key={policy.name}>
                  <h4>{policy.name}</h4>
                  <ul>
                    {SUPPORTED_PLATFORMS.map((platform) => (
                      <li key={platform}>
                        <strong>{labelForPlatform(platform)}:</strong>{" "}
                        <code>{describeDefinition(policy, platform)}</code>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </article>
      </section>
    );
  };

  const renderActivityPage = () => {
    return (
      <section className="content-grid">
        <article className="card card-hero">
          <h3>Activity Log</h3>
          <p>Recent actions are stored locally to support non-destructive review and troubleshooting.</p>
          <div className="matrix-actions">
            <button
              className="action-button"
              disabled={isLoadingActivity}
              onClick={() => void loadActivityLog()}
              type="button"
            >
              {isLoadingActivity ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          {activityMessage ? <p className="error-text">{activityMessage}</p> : null}
        </article>

        <article className="card card-hero">
          {isLoadingActivity ? (
            <p>Loading activity entries...</p>
          ) : activityEntries.length === 0 ? (
            <p>No activity recorded yet.</p>
          ) : (
            <table className="activity-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {activityEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{new Date(entry.timestamp).toLocaleString()}</td>
                    <td>{labelForActivityType(entry.type)}</td>
                    <td>{entry.title}</td>
                    <td>{entry.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      </section>
    );
  };

  const renderSettingsPage = () => {
    return (
      <section className="content-grid">
        <article className="card card-hero">
          <h3>Platform Paths</h3>
          <p>
            Set optional absolute path overrides for platform configuration files. Leave empty to use
            auto-detected defaults.
          </p>
          <p>
            You can also add extra MCP JSON sources per platform. The matrix will pull MCPs from these files and
            let you merge them into your primary config via Preview/Apply Sync.
          </p>
        </article>

        <article className="card card-hero">
          <div className="field-grid">
            {SUPPORTED_PLATFORMS.map((platform) => {
              const effectivePath =
                gatewayState?.platforms.find((snapshot) => snapshot.platform === platform)?.configPath ??
                "Unavailable";
              const overrideValue = userConfig?.platforms[platform].configPathOverride;

              return (
                <div className="settings-platform-block" key={platform}>
                  <label className="form-field">
                    <span>{labelForPlatform(platform)} Primary Config (write target)</span>
                    <input
                      className="text-input"
                      onChange={(event) =>
                        setSettingsPaths((current) => ({
                          ...current,
                          [platform]: event.target.value
                        }))
                      }
                      placeholder={effectivePath}
                      type="text"
                      value={settingsPaths[platform]}
                    />
                    <small className="helper-text">
                      {overrideValue ? `Current override: ${overrideValue}` : `Detected path: ${effectivePath}`}
                    </small>
                  </label>
                  <div className="matrix-actions">
                    <button
                      className="action-button"
                      disabled={isSavingSettings || isLoadingSettings}
                      onClick={() => void handleBrowseOverridePath(platform)}
                      type="button"
                    >
                      Browse Primary File
                    </button>
                  </div>

                  <div className="form-field">
                    <span>{labelForPlatform(platform)} Additional MCP Sources</span>
                    {settingsAdditionalPaths[platform].length === 0 ? (
                      <small className="helper-text">No additional sources added.</small>
                    ) : (
                      <ul className="settings-path-list">
                        {settingsAdditionalPaths[platform].map((pathValue) => (
                          <li key={pathValue}>
                            <code>{pathValue}</code>
                            <button
                              className="chip-button"
                              onClick={() => handleRemoveAdditionalPath(platform, pathValue)}
                              type="button"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="matrix-actions">
                      <button
                        className="action-button"
                        disabled={isSavingSettings || isLoadingSettings}
                        onClick={() => void handleAddAdditionalPath(platform)}
                        type="button"
                      >
                        Browse + Add Source
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="matrix-actions">
            <button
              className="action-button"
              disabled={isSavingSettings || isLoadingSettings}
              onClick={() => {
                setSettingsPaths(toPathInputs(userConfig));
                setSettingsAdditionalPaths(toAdditionalPathInputs(userConfig));
              }}
              type="button"
            >
              Revert Draft
            </button>
            <button
              className="action-button"
              disabled={isSavingSettings || isLoadingSettings}
              onClick={() => {
                setSettingsPaths(emptyPathInputs());
                setSettingsAdditionalPaths(emptyAdditionalPathInputs());
              }}
              type="button"
            >
              Clear Overrides
            </button>
            <button
              className="action-button action-button-primary"
              disabled={isSavingSettings || isLoadingSettings}
              onClick={() => void handleSaveSettings()}
              type="button"
            >
              {isSavingSettings ? "Saving..." : "Save Settings"}
            </button>
          </div>
          {isLoadingSettings ? <p>Loading settings...</p> : null}
          {settingsMessage ? <p>{settingsMessage}</p> : null}
        </article>
      </section>
    );
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>MCP Gateway Manager</h1>
        <p className="subtitle">Claude, Cursor, and Codex in one control surface.</p>

        <nav aria-label="Primary">
          <ul>
            {pages.map((page) => (
              <li key={page.key}>
                <button
                  className={page.key === activePage ? "nav-button nav-button-active" : "nav-button"}
                  onClick={() => setActivePage(page.key)}
                  type="button"
                >
                  {page.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="main-panel">
        <header className="main-header">
          <div>
            <h2>{pages.find((page) => page.key === activePage)?.label}</h2>
            <p>{pageHeadline}</p>
          </div>
          <StatusPill kind="ok" label={healthStatus} />
        </header>

        {activePage === "dashboard" ? renderDashboard() : null}
        {activePage === "assistant" ? renderAssistantPage() : null}
        {activePage === "matrix" ? renderMatrixPage() : null}
        {activePage === "registry" ? renderRegistryPage() : null}
        {activePage === "activity" ? renderActivityPage() : null}
        {activePage === "settings" ? renderSettingsPage() : null}
      </main>
    </div>
  );
}
