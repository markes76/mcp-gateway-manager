import { PageHeader } from "@/components/layout/PageHeader";

interface HelpSectionProps {
  title: string;
  children: React.ReactNode;
}

function HelpSection({ title, children }: HelpSectionProps) {
  return (
    <section className="section">
      <h3 className="section-title">{title}</h3>
      <div className="card" style={{ fontSize: "var(--text-sm)", lineHeight: 1.65, color: "var(--text-secondary)" }}>
        {children}
      </div>
    </section>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-2)" }}>
      <span
        style={{
          flexShrink: 0,
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "var(--accent)",
          color: "#fff",
          fontSize: "var(--text-xs)",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {n}
      </span>
      <span>{children}</span>
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd
      style={{
        display: "inline-block",
        padding: "1px 6px",
        fontSize: "var(--text-xs)",
        fontFamily: "var(--font-mono)",
        background: "var(--surface-hover)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)"
      }}
    >
      {children}
    </kbd>
  );
}

export function HelpPage() {
  return (
    <>
      <PageHeader title="Help" />
      <div className="main-content" style={{ maxWidth: 640 }}>
        {/* Getting Started */}
        <HelpSection title="Getting Started">
          <p>
            <strong>MCP Gateway Manager</strong> makes it easy to install and manage
            MCP (Model Context Protocol) servers across all your AI platforms — Claude,
            Cursor, and Codex — from a single interface.
          </p>
          <p style={{ marginTop: "var(--space-2)" }}>
            Instead of manually editing JSON config files for each platform, you add
            servers once and sync them everywhere.
          </p>
        </HelpSection>

        {/* Adding Servers — Smart Mode */}
        <HelpSection title="Adding Servers — Smart Mode">
          <p style={{ marginBottom: "var(--space-3)" }}>
            The fastest way to add an MCP server. Paste a URL or package name and let
            the system figure out the configuration.
          </p>
          <Step n={1}>
            Go to <strong>Sync</strong> and make sure the <strong>Smart</strong> toggle is selected.
          </Step>
          <Step n={2}>
            Paste an npm package name, GitHub URL, or any MCP server URL into the input field.
          </Step>
          <Step n={3}>
            Click <strong>Analyze</strong>. The system will parse the URL and (if the AI model
            is downloaded) use local intelligence to extract the correct command, arguments,
            and required environment variables.
          </Step>
          <Step n={4}>
            Review the pre-filled configuration. Adjust anything that doesn't look right.
          </Step>
          <Step n={5}>
            Click <strong>Add to Matrix</strong> to queue the server for syncing.
          </Step>
          <p style={{ marginTop: "var(--space-2)", color: "var(--text-muted)" }}>
            Tip: Download the AI model in <strong>Settings</strong> for smarter analysis.
            Without it, pattern matching still works but produces less detailed results.
          </p>
        </HelpSection>

        {/* Adding Servers — Manual Mode */}
        <HelpSection title="Adding Servers — Manual Mode">
          <p style={{ marginBottom: "var(--space-3)" }}>
            For experienced users who know the exact command and arguments.
          </p>
          <Step n={1}>
            Go to <strong>Sync</strong> and select the <strong>Manual</strong> toggle.
          </Step>
          <Step n={2}>
            Fill in the server name, command (e.g. <code>npx</code>), and arguments
            (e.g. <code>-y @modelcontextprotocol/server-filesystem</code>).
          </Step>
          <Step n={3}>
            Choose whether to enable for all platforms or select specific ones.
          </Step>
          <Step n={4}>
            Click <strong>Add to Matrix</strong>.
          </Step>
        </HelpSection>

        {/* Syncing */}
        <HelpSection title="Syncing Across Platforms">
          <p style={{ marginBottom: "var(--space-3)" }}>
            After adding servers to the matrix, you need to sync them to your platforms.
          </p>
          <Step n={1}>
            Click <strong>Preview</strong> in the Sync page header to see what changes will be
            applied to each platform's config file.
          </Step>
          <Step n={2}>
            Review the preview. It shows how many operations will be applied to each platform.
          </Step>
          <Step n={3}>
            Click <strong>Apply Sync</strong> to write the changes. A backup is created
            automatically before any modification.
          </Step>
          <p style={{ marginTop: "var(--space-2)", color: "var(--text-muted)" }}>
            You can revert any sync operation from the <strong>Activity</strong> page.
          </p>
        </HelpSection>

        {/* AI Model */}
        <HelpSection title="AI Model">
          <p>
            The app includes an optional local AI model (<strong>Qwen 2.5 1.5B</strong>) that
            runs entirely on your machine. No API keys, no cloud services, completely free.
          </p>
          <p style={{ marginTop: "var(--space-2)" }}>
            <strong>What it does:</strong> When you use Smart mode to add an MCP server, the
            AI model reads the package documentation and extracts the correct configuration —
            command, arguments, and required environment variables.
          </p>
          <p style={{ marginTop: "var(--space-2)" }}>
            <strong>Download:</strong> Go to <strong>Settings → AI Model</strong> and click
            Download. The model is ~900 MB and downloads in the background. You can continue
            using the app while it downloads.
          </p>
          <p style={{ marginTop: "var(--space-2)" }}>
            <strong>Without the model:</strong> Smart mode still works using URL pattern
            matching, but the results are less detailed.
          </p>
        </HelpSection>

        {/* Servers Page */}
        <HelpSection title="Servers Overview">
          <p>
            The <strong>Servers</strong> page shows all MCP servers currently in your matrix.
            Each server card shows its name, command, which platforms it's enabled for, and
            its current status.
          </p>
          <p style={{ marginTop: "var(--space-2)" }}>
            You can toggle servers on/off per platform, edit their configuration, or remove
            them from the matrix entirely.
          </p>
        </HelpSection>

        {/* Activity */}
        <HelpSection title="Activity & Revisions">
          <p>
            The <strong>Activity</strong> page is a timeline of everything that happened —
            syncs, settings changes, analyses, and reverts.
          </p>
          <p style={{ marginTop: "var(--space-2)" }}>
            Every sync operation creates a revision. You can click <strong>Revert</strong> on
            any revision to restore the previous platform configs from their automatic backups.
          </p>
        </HelpSection>

        {/* Platform Config Paths */}
        <HelpSection title="Platform Config Paths">
          <p>
            By default, the app detects where each platform stores its MCP configuration:
          </p>
          <ul style={{ margin: "var(--space-2) 0", paddingLeft: "var(--space-4)" }}>
            <li><strong>Claude:</strong> <code>~/.claude/claude_desktop_config.json</code></li>
            <li><strong>Cursor:</strong> <code>~/.cursor/mcp.json</code></li>
            <li><strong>Codex:</strong> <code>~/.codex/config.json</code></li>
          </ul>
          <p>
            If your configs are in non-standard locations, override the paths in{" "}
            <strong>Settings → Platform Config Paths</strong>.
          </p>
        </HelpSection>

        {/* About */}
        <HelpSection title="About">
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--space-1) var(--space-4)" }}>
            <span style={{ color: "var(--text-muted)" }}>Version</span>
            <span>2.0.0</span>
            <span style={{ color: "var(--text-muted)" }}>License</span>
            <span>MIT</span>
            <span style={{ color: "var(--text-muted)" }}>AI Model</span>
            <span>Qwen 2.5 1.5B Instruct (Q4_K_M) — Apache 2.0</span>
            <span style={{ color: "var(--text-muted)" }}>Runtime</span>
            <span>Electron + React + node-llama-cpp</span>
            <span style={{ color: "var(--text-muted)" }}>Source</span>
            <span>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  window.mcpGateway.openPath({ path: "https://github.com/markes76/mcp-gateway-manager" });
                }}
                style={{ color: "var(--accent)", textDecoration: "none" }}
              >
                github.com/markes76/mcp-gateway-manager
              </a>
            </span>
          </div>
        </HelpSection>
      </div>
    </>
  );
}
