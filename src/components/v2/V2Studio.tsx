"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Input, TextArea } from "@heroui/react";
import {
  ArrowLeft,
  ArrowRight,
  Boxes,
  Check,
  ChevronRight,
  Code2,
  ExternalLink,
  FileCode2,
  FolderOpen,
  History,
  LayoutGrid,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquare,
  Mic,
  Moon,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Settings2,
  Send,
  Sparkles,
  Sun,
  Terminal,
  X,
} from "lucide-react";
import {
  api,
  type ProjectDetail,
  type StudioProject,
  type StudioSession,
} from "./api";
import { ProviderSettings } from "./ProviderSettings";
import { ProjectEnvironment } from "./ProjectEnvironment";
import { ProjectShare } from "./ProjectShare";
import { StudioAuth } from "./StudioAuth";
import { BrowserDictation } from "@/components/demo/BrowserDictation";
import { SamanthaVoice } from "./SamanthaVoice";
import "@/app/v2-theme.css";

type Panel = "preview" | "code" | "activity" | "versions" | "settings";
const activeJob = (detail: ProjectDetail | null) =>
  detail?.job?.status === "queued" || detail?.job?.status === "running";
const statusLabel = (project: StudioProject) =>
  ({
    idle: "Draft",
    generating: "Writing code",
    building: "Building",
    ready: "Ready",
    error: "Needs attention",
  })[project.status];
function relativeDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export function V2Studio() {
  const [accountSettings, setAccountSettings] = useState(false);
  const [session, setSession] = useState<StudioSession | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [prompt, setPrompt] = useState("");
  const [panel, setPanel] = useState<Panel>("preview");
  const [mobilePanel, setMobilePanel] = useState<"chat" | "work">("chat");
  const [sidebar, setSidebar] = useState(false);
  const [dark, setDark] = useState(false);
  const [voice, setVoice] = useState<"dictation" | "samantha" | null>(null);
  const [filePath, setFilePath] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [previewKey, setPreviewKey] = useState(0);
  const [pendingNavigation, setPendingNavigation] = useState<
    string | null | undefined
  >(undefined);
  const selection = useRef<string | null>(null);
  const editBase = useRef<{
    versionId?: string;
    files: ProjectDetail["files"];
  } | null>(null);
  const drafts = useRef<Record<string, string>>({});
  const mounted = useRef(true);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const dirty = Object.keys(edits).length > 0;
  const locked = busy || activeJob(detail);
  const currentFile =
    detail?.files.find((file) => file.path === filePath) || detail?.files[0];
  const loadSession = useCallback(async () => {
    setSessionError("");
    try {
      setSession(await api<StudioSession>("/api/v2/auth/session"));
    } catch (e) {
      setSessionError(
        e instanceof Error ? e.message : "Studio is unavailable.",
      );
    }
  }, []);
  const loadProjects = useCallback(async () => {
    const response = await api<{ projects: StudioProject[] }>(
      "/api/v2/projects",
    );
    if (mounted.current) setProjects(response.projects);
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const response = await api<ProjectDetail>(
      `/api/v2/projects/${encodeURIComponent(id)}`,
    );
    if (mounted.current && selection.current === id) {
      setDetail(response);
      setProjects((previous) => [
        response.project,
        ...previous.filter((p) => p.id !== id),
      ]);
    }
    return response;
  }, []);
  useEffect(() => {
    mounted.current = true;
    queueMicrotask(() => {
      if (!mounted.current) return;
      void loadSession();
      try {
        setDark(localStorage.getItem("vibekidding-v2-theme") === "dark");
      } catch {}
    });
    return () => {
      mounted.current = false;
    };
  }, [loadSession]);
  useEffect(() => {
    if (!session?.user) return;
    let live = true;
    queueMicrotask(() => {
      if (!live) return;
      setLoading(true);
      const initialIdea = new URLSearchParams(window.location.search).get(
        "idea",
      );
      if (initialIdea) setPrompt(initialIdea.slice(0, 12000));
      const initialProject = new URLSearchParams(window.location.search).get(
        "project",
      );
      if (initialProject && /^[a-zA-Z0-9_-]{1,80}$/.test(initialProject)) {
        selection.current = initialProject;
        setSelected(initialProject);
        void loadDetail(initialProject).catch((e) => setError(e.message));
      }
      loadProjects()
        .catch((e) => setError(e.message))
        .finally(() => {
          if (live) setLoading(false);
        });
    });
    return () => {
      live = false;
    };
  }, [session?.user, loadProjects, loadDetail]);
  useEffect(() => {
    if (!selected) return;
    const timer = setInterval(() => {
      void loadDetail(selected).catch((e) => setError(e.message));
    }, 2500);
    return () => clearInterval(timer);
  }, [selected, loadDetail]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function navigate(id: string | null, force = false) {
    if (dirty && !force) {
      setPendingNavigation(id);
      return;
    }
    setAccountSettings(false);
    drafts.current[selection.current || "new"] = prompt;
    selection.current = id;
    window.history.replaceState(
      null,
      "",
      id ? `?project=${encodeURIComponent(id)}` : window.location.pathname,
    );
    setSelected(id);
    setDetail(null);
    setEdits({});
    editBase.current = null;
    setFilePath("");
    setPrompt(drafts.current[id || "new"] || "");
    setError("");
    setNotice("");
    setSidebar(false);
    setVoice(null);
    setMobilePanel("chat");
    if (id) {
      setLoading(true);
      loadDetail(id)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }
  }
  function toggleTheme() {
    setDark(!dark);
    try {
      localStorage.setItem(
        "vibekidding-v2-theme",
        String(!dark ? "dark" : "light"),
      );
    } catch {}
  }
  async function sendPrompt() {
    if (!prompt.trim() || locked) return;
    if (dirty) {
      setError(
        "Save or discard your file edits before asking for another change.",
      );
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await api<{ project: StudioProject }>(
        selected ? `/api/v2/projects/${selected}/revise` : "/api/v2/projects",
        { method: "POST", body: JSON.stringify({ prompt: prompt.trim() }) },
      );
      setPrompt("");
      drafts.current[selection.current || "new"] = "";
      selection.current = response.project.id;
      window.history.replaceState(
        null,
        "",
        `?project=${encodeURIComponent(response.project.id)}`,
      );
      setSelected(response.project.id);
      setProjects((previous) => [
        response.project,
        ...previous.filter((p) => p.id !== response.project.id),
      ]);
      await loadDetail(response.project.id);
      setPanel("activity");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start this build.");
    } finally {
      setBusy(false);
    }
  }
  async function saveFiles() {
    if (!detail || !dirty || locked) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/v2/projects/${detail.project.id}/files`, {
        method: "PUT",
        body: JSON.stringify({
          expectedVersionId:
            editBase.current?.versionId ?? detail.project.currentVersionId,
          files: (editBase.current?.files ?? detail.files).map((file) => ({
            ...file,
            content: edits[file.path] ?? file.content,
          })),
        }),
      });
      setEdits({});
      editBase.current = null;
      await loadDetail(detail.project.id);
      setNotice(
        "Files saved as a new version. Deploy to update the running app.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Files could not be saved. Your edits are still here.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function deploy(versionId?: string) {
    if (!selected || locked) return;
    if (dirty) {
      setError("Save your file edits before deploying.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/v2/projects/${selected}/deploy`, {
        method: "POST",
        body: JSON.stringify({ versionId }),
      });
      await loadDetail(selected);
      setPanel("activity");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not deploy this version.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (dirty && !window.confirm("Leave without saving your file edits?"))
      return;
    try {
      await api("/api/v2/auth/logout", { method: "POST" });
      selection.current = null;
      setSelected(null);
      setAccountSettings(false);
      setDetail(null);
      setProjects([]);
      setEdits({});
      await loadSession();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
    }
  }
  const theme = dark ? "dark" : "light";
  if (!session)
    return (
      <div className="v2-root" data-theme={theme}>
        <main className="v2-loading">
          <Boxes size={34} />
          <h1>Opening your studio</h1>
          {sessionError ? (
            <>
              <p role="alert">{sessionError}</p>
              <Button onPress={() => void loadSession()}>Try again</Button>
            </>
          ) : (
            <LoaderCircle className="v2-spin" />
          )}
        </main>
      </div>
    );
  if (!session.user)
    return (
      <div className="v2-root" data-theme={theme}>
        <StudioAuth
          key={session.inviteOnly ? "invited" : "local"}
          setupRequired={session.setupRequired}
          inviteOnly={session.inviteOnly}
          localTestAccess={session.localTestAccess}
          onAuthenticated={() => void loadSession()}
        />
      </div>
    );
  return (
    <div className="v2-root" data-theme={theme}>
      <div className="v2-shell">
        {sidebar && (
          <Button
            className="v2-sidebar-backdrop"
            aria-label="Close project menu"
            onPress={() => setSidebar(false)}
          />
        )}
        <aside className={`v2-sidebar ${sidebar ? "is-open" : ""}`}>
          <Link className="v2-brand" href="/">
            <span className="v2-brand-mark">
              <Boxes size={22} />
            </span>
            <span>
              VibeKidding<small>YOUR CREATIVE STUDIO</small>
            </span>
          </Link>
          <Button className="v2-new-project" onPress={() => navigate(null)}>
            <Plus size={18} /> New project
          </Button>
          <div className="v2-sidebar-label">WORKSPACE</div>
          <Button
            className={`v2-nav ${!selected ? "is-active" : ""}`}
            onPress={() => navigate(null)}
          >
            <LayoutGrid size={18} /> All projects <span>{projects.length}</span>
          </Button>
          <div className="v2-sidebar-label">RECENT PROJECTS</div>
          <nav className="v2-recent" aria-label="Recent projects">
            {projects.slice(0, 12).map((project) => (
              <Button
                key={project.id}
                className={`v2-nav ${selected === project.id ? "is-active" : ""}`}
                onPress={() => navigate(project.id)}
              >
                <FolderOpen size={17} />
                <span className="v2-project-name">{project.name}</span>
                {["generating", "building"].includes(project.status) && (
                  <LoaderCircle className="v2-spin" size={13} />
                )}
              </Button>
            ))}
            {projects.length === 0 && (
              <p className="v2-muted v2-empty-recent">
                Your next idea starts here.
              </p>
            )}
          </nav>
          <div className="v2-sidebar-bottom">
            <Button
              className="v2-nav"
              onPress={() => {
                setAccountSettings(true);
                setSidebar(false);
              }}
            >
              <Settings2 size={18} /> AI settings
            </Button>
            <div className="v2-account">
              <span className="v2-avatar">
                {session.user.username.slice(0, 2).toUpperCase()}
              </span>
              <span>
                <strong>{session.user.username}</strong>
                <small>Personal workspace</small>
              </span>
              <Button
                isIconOnly
                variant="ghost"
                aria-label="Sign out"
                onPress={() => void signOut()}
              >
                <LogOut size={17} />
              </Button>
            </div>
          </div>
        </aside>
        <main className="v2-main">
          <header className="v2-topbar">
            <Button
              className="v2-mobile-menu"
              isIconOnly
              variant="ghost"
              aria-label="Open project menu"
              onPress={() => setSidebar(true)}
            >
              <Menu size={20} />
            </Button>
            <div className="v2-breadcrumb">
              <Boxes size={16} />
              <span>Workspace</span>
              <ChevronRight size={14} />
              <strong>
                {accountSettings
                  ? "AI settings"
                  : detail?.project.name || (selected ? "Project" : "Overview")}
              </strong>
            </div>
            <div className="v2-topbar-actions">
              <span className="v2-server-badge">
                <span /> Self-hosted studio
              </span>
              <Button
                isIconOnly
                variant="ghost"
                aria-label={dark ? "Use light theme" : "Use dark theme"}
                onPress={toggleTheme}
              >
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </Button>
            </div>
          </header>
          {error && (
            <div className="v2-notice v2-error" role="alert">
              <span>{error}</span>
              <Button
                isIconOnly
                variant="ghost"
                aria-label="Dismiss error"
                onPress={() => setError("")}
              >
                <X size={16} />
              </Button>
            </div>
          )}
          {notice && (
            <div className="v2-notice" role="status">
              <Check size={17} />
              {notice}
              <Button
                isIconOnly
                variant="ghost"
                aria-label="Dismiss message"
                onPress={() => setNotice("")}
              >
                <X size={16} />
              </Button>
            </div>
          )}
          {accountSettings ? (
            <ProviderSettings onClose={() => setAccountSettings(false)} />
          ) : !selected ? (
            <div className="v2-dashboard">
              <section className="v2-welcome">
                <span className="v2-eyebrow">
                  <Sparkles size={14} /> A LITTLE IDEA CAN BECOME ANYTHING
                </span>
                <h1>What would you like to build?</h1>
                <p>
                  A useful tool. A beautiful page. A game to play together.{" "}
                  <br />
                  Describe it in your own words, and let’s make it real.
                </p>
                <div className="v2-idea-composer">
                  <label className="v2-sr-only" htmlFor="v2-new-prompt">
                    Describe your new application
                  </label>
                  <TextArea
                    id="v2-new-prompt"
                    ref={promptRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="I’d like to make…"
                    maxLength={12000}
                    disabled={busy}
                    rows={4}
                  />
                  <div className="v2-composer-tools">
                    <Button
                      variant="ghost"
                      onPress={() => setVoice(voice ? null : "dictation")}
                      aria-label="Voice input"
                    >
                      <Mic size={18} /> Talk it through
                    </Button>
                    <Button
                      className="v2-primary"
                      isDisabled={busy || !prompt.trim()}
                      onPress={() => void sendPrompt()}
                    >
                      {busy ? (
                        <LoaderCircle className="v2-spin" size={17} />
                      ) : (
                        <ArrowRight size={17} />
                      )}{" "}
                      Build my idea
                    </Button>
                  </div>
                </div>
                {voice && voicePanel()}
                <div className="v2-idea-chips">
                  {[
                    "A landing page for my business",
                    "A photo journal for our family",
                    "A multiplayer word game",
                  ].map((idea) => (
                    <Button
                      key={idea}
                      variant="ghost"
                      onPress={() => {
                        setPrompt(idea);
                        promptRef.current?.focus();
                      }}
                    >
                      {idea}
                      <ArrowRight size={13} />
                    </Button>
                  ))}
                </div>
              </section>
              <section className="v2-projects-section">
                <div className="v2-section-heading">
                  <div>
                    <h2>
                      Your projects <span>{projects.length}</span>
                    </h2>
                    <p>Pick up an idea and keep making it yours.</p>
                  </div>
                  <div className="v2-search">
                    <Search size={17} />
                    <Input
                      aria-label="Search projects"
                      placeholder="Search projects"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </div>
                {loading ? (
                  <p className="v2-loading-inline">
                    <LoaderCircle className="v2-spin" size={18} /> Loading
                    projects…
                  </p>
                ) : projects.length === 0 ? (
                  <div className="v2-empty-projects">
                    <FolderOpen size={30} />
                    <h3>Your first project is one idea away.</h3>
                    <p>
                      Describe it above. We’ll keep its files and versions here.
                    </p>
                  </div>
                ) : (
                  <div className="v2-project-grid">
                    {projects
                      .filter((p) =>
                        `${p.name} ${p.description}`
                          .toLowerCase()
                          .includes(search.toLowerCase()),
                      )
                      .map((project, index) => (
                        <Button
                          className="v2-project-card"
                          key={project.id}
                          onPress={() => navigate(project.id)}
                        >
                          <div className={`v2-project-art tone-${index % 4}`}>
                            <Code2 size={34} />
                            <span
                              className={`v2-status status-${project.status}`}
                            >
                              {statusLabel(project)}
                            </span>
                          </div>
                          <div className="v2-project-info">
                            <h3>{project.name}</h3>
                            <p>
                              {project.description ||
                                "A new idea taking shape."}
                            </p>
                            <div>
                              <span>
                                Updated {relativeDate(project.updatedAt)}
                              </span>
                              <ArrowRight size={17} />
                            </div>
                          </div>
                        </Button>
                      ))}
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="v2-workspace">
              <div className="v2-workspace-heading">
                <div>
                  <Button
                    variant="ghost"
                    isIconOnly
                    aria-label="Back to projects"
                    onPress={() => navigate(null)}
                  >
                    <ArrowLeft size={18} />
                  </Button>
                  <div>
                    <h1>{detail?.project.name || "Opening project…"}</h1>
                    <span
                      className={`v2-status status-${detail?.project.status || "idle"}`}
                    >
                      {detail ? statusLabel(detail.project) : "Loading"}
                    </span>
                  </div>
                </div>
                <div>
                  {detail?.project.currentVersionId && (
                    <a
                      className="v2-link-button"
                      href={`/api/v2/projects/${encodeURIComponent(detail.project.id)}/download`}
                    >
                      Download source
                    </a>
                  )}
                  {detail?.project.previewUrl && (
                    <a
                      className="v2-link-button"
                      href={detail.project.previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink size={16} /> Open app
                    </a>
                  )}
                  <Button
                    className="v2-primary"
                    isDisabled={
                      !detail || locked || dirty || !detail.files.length
                    }
                    onPress={() => void deploy()}
                  >
                    <Rocket size={16} /> Deploy
                  </Button>
                </div>
              </div>
              {detail?.project.previewUrl && (
                <ProjectShare
                  key={`${detail.project.id}:${detail.project.previewUrl}`}
                  previewUrl={detail.project.previewUrl}
                />
              )}
              <div className="v2-mobile-tabs">
                <Button
                  variant="ghost"
                  aria-pressed={mobilePanel === "chat"}
                  onPress={() => setMobilePanel("chat")}
                >
                  <MessageSquare size={16} /> Conversation
                </Button>
                <Button
                  variant="ghost"
                  aria-pressed={mobilePanel === "work"}
                  onPress={() => setMobilePanel("work")}
                >
                  <Code2 size={16} /> Workspace
                </Button>
              </div>
              <div className="v2-workspace-grid">
                <section
                  className={`v2-conversation ${mobilePanel === "chat" ? "mobile-active" : ""}`}
                >
                  <div className="v2-pane-title">
                    <span className="v2-samantha-avatar">
                      <Sparkles size={16} />
                    </span>
                    <div>
                      <strong>Build with Samantha</strong>
                      <small>From a thought to a working app</small>
                    </div>
                  </div>
                  <div className="v2-message-list" aria-live="polite">
                    {loading && !detail ? (
                      <p>Loading your conversation…</p>
                    ) : (
                      <>
                        <div className="v2-assistant-intro">
                          <Sparkles size={18} />
                          <p>
                            This is your project’s conversation. Describe what
                            you’d like to add or change.
                          </p>
                        </div>
                        {detail?.messages.map((message, index) => (
                          <article
                            className={`v2-message ${message.role}`}
                            key={`${message.createdAt}-${index}`}
                          >
                            <strong>
                              {message.role === "user" ? "You" : "Samantha"}
                            </strong>
                            <p>{message.content}</p>
                          </article>
                        ))}
                        {locked && (
                          <div className="v2-building-indicator">
                            <LoaderCircle className="v2-spin" size={16} />
                            {busy
                              ? "Sending your request…"
                              : detail?.project.status === "building"
                                ? "Building your application…"
                                : "Working on your project…"}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="v2-chat-composer">
                    <label className="v2-sr-only" htmlFor="v2-revision-prompt">
                      Describe a change
                    </label>
                    <TextArea
                      id="v2-revision-prompt"
                      ref={promptRef}
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="What should we change or add?"
                      rows={3}
                      maxLength={12000}
                      disabled={locked}
                    />
                    <div className="v2-composer-tools">
                      <Button
                        isIconOnly
                        variant="ghost"
                        aria-label="Show voice input"
                        onPress={() => setVoice(voice ? null : "dictation")}
                      >
                        <Mic size={18} />
                      </Button>
                      <small>
                        {dirty
                          ? "Save file edits before revising"
                          : "Changes create a new version"}
                      </small>
                      <Button
                        isIconOnly
                        className="v2-primary"
                        aria-label="Send change request"
                        isDisabled={locked || !prompt.trim() || dirty}
                        onPress={() => void sendPrompt()}
                      >
                        <Send size={17} />
                      </Button>
                    </div>
                    {voice && voicePanel()}
                  </div>
                </section>
                <section
                  className={`v2-work-pane ${mobilePanel === "work" ? "mobile-active" : ""}`}
                >
                  <div
                    className="v2-work-tabs"
                    role="group"
                    aria-label="Project workspace"
                  >
                    {(
                      [
                        { id: "preview", name: "Preview", icon: Play },
                        { id: "code", name: "Code", icon: Code2 },
                        { id: "activity", name: "Build log", icon: Terminal },
                        { id: "versions", name: "Versions", icon: History },
                        { id: "settings", name: "Settings", icon: Settings2 },
                      ] as const
                    ).map((tab) => (
                      <Button
                        aria-pressed={panel === tab.id}
                        key={tab.id}
                        variant="ghost"
                        onPress={() => setPanel(tab.id)}
                      >
                        <tab.icon size={15} />
                        {tab.name}
                      </Button>
                    ))}
                  </div>
                  {panel === "settings" && detail && (
                    <ProjectEnvironment
                      key={detail.project.id}
                      projectId={detail.project.id}
                      disabled={locked}
                    />
                  )}
                  {panel === "preview" && (
                    <div className="v2-preview">
                      <div className="v2-preview-toolbar">
                        <span>
                          {detail?.project.previewUrl
                            ? "Running application"
                            : "Preview appears after a successful deployment"}
                        </span>
                        <Button
                          isIconOnly
                          variant="ghost"
                          aria-label="Refresh preview"
                          onPress={() => setPreviewKey((n) => n + 1)}
                          isDisabled={!detail?.project.previewUrl}
                        >
                          <RefreshCw size={15} />
                        </Button>
                      </div>
                      {detail?.project.previewUrl ? (
                        <iframe
                          key={`${detail.project.deployedVersionId}-${previewKey}`}
                          src={detail.project.previewUrl}
                          title={`${detail.project.name} application preview`}
                          allow="clipboard-write"
                        />
                      ) : (
                        <div className="v2-preview-empty">
                          <span>
                            <Boxes size={38} />
                          </span>
                          <h2>
                            {locked
                              ? "Your idea is taking shape."
                              : "A home for your next idea."}
                          </h2>
                          <p>
                            {locked
                              ? "You can follow the real build progress in the build log."
                              : detail?.project.error ||
                                "Once your project builds and deploys, you can try it right here."}
                          </p>
                          <Button
                            variant="ghost"
                            onPress={() => setPanel("activity")}
                          >
                            View build log <ArrowRight size={15} />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                  {panel === "code" && (
                    <div className="v2-code-panel">
                      <div className="v2-code-actions">
                        <span>
                          {detail?.files.length || 0} files
                          {dirty ? " · Unsaved changes" : ""}
                        </span>
                        <Button
                          variant="ghost"
                          isDisabled={!dirty || locked}
                          onPress={() => {
                            setEdits({});
                            editBase.current = null;
                          }}
                        >
                          Discard edits
                        </Button>
                        <Button
                          className="v2-primary"
                          isDisabled={!dirty || locked}
                          onPress={() => void saveFiles()}
                        >
                          <Save size={15} /> Save
                        </Button>
                      </div>
                      <div className="v2-editor-grid">
                        <nav aria-label="Project files">
                          {detail?.files.map((file) => (
                            <Button
                              key={file.path}
                              variant="ghost"
                              className={
                                currentFile?.path === file.path
                                  ? "is-active"
                                  : ""
                              }
                              onPress={() => setFilePath(file.path)}
                            >
                              <FileCode2 size={14} />
                              <span>{file.path}</span>
                              {edits[file.path] !== undefined && (
                                <i aria-label="Unsaved" />
                              )}
                            </Button>
                          ))}
                        </nav>
                        <div className="v2-editor">
                          {currentFile ? (
                            <>
                              <div>{currentFile.path}</div>
                              <TextArea
                                aria-label={`Edit ${currentFile.path}`}
                                value={
                                  edits[currentFile.path] ?? currentFile.content
                                }
                                onChange={(e) => {
                                  const value = e.target.value;
                                  if (!editBase.current)
                                    editBase.current = {
                                      versionId:
                                        detail?.project.currentVersionId,
                                      files: detail?.files ?? [],
                                    };
                                  setEdits((previous) => {
                                    const next = { ...previous };
                                    if (value === currentFile.content)
                                      delete next[currentFile.path];
                                    else next[currentFile.path] = value;
                                    return next;
                                  });
                                }}
                                spellCheck={false}
                                autoCapitalize="off"
                                disabled={locked}
                              />
                            </>
                          ) : (
                            <p className="v2-muted">
                              Source files will appear after generation.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {panel === "activity" && (
                    <div className="v2-activity">
                      <div className="v2-section-heading">
                        <h2>Build activity</h2>
                        <span className="v2-status">
                          {detail?.job?.status || "No build yet"}
                        </span>
                      </div>
                      <p>Output from the latest generation and deployment.</p>
                      <pre aria-label="Build output">
                        {detail?.job?.logs?.join("\n") ||
                          "No build output yet."}
                      </pre>
                      {detail?.job?.error && (
                        <p className="v2-error" role="alert">
                          {detail.job.error}
                        </p>
                      )}
                    </div>
                  )}
                  {panel === "versions" && (
                    <div className="v2-versions">
                      <h2>Version history</h2>
                      <p>
                        Every generated change and file save creates a version.
                      </p>
                      {detail?.versions.map((version, index) => (
                        <article key={version.id}>
                          <span className="v2-version-icon">
                            <History size={18} />
                          </span>
                          <div>
                            <h3>
                              Version {detail.versions.length - index}
                              {detail.project.deployedVersionId ===
                                version.id && (
                                <span className="v2-status">Live</span>
                              )}
                            </h3>
                            <p>{version.prompt || "Saved file changes"}</p>
                            <small>
                              {relativeDate(version.createdAt)} ·{" "}
                              {version.fileCount} files
                            </small>
                          </div>
                          <Button
                            variant="ghost"
                            isDisabled={
                              locked ||
                              dirty ||
                              detail.project.deployedVersionId === version.id
                            }
                            onPress={() => void deploy(version.id)}
                          >
                            Deploy
                          </Button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}
        </main>
      </div>
      {pendingNavigation !== undefined && (
        <div className="v2-modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="v2-unsaved-title"
            className="v2-dialog"
          >
            <h2 id="v2-unsaved-title">Keep your file changes?</h2>
            <p>
              You have unsaved edits. Stay here to save them, or leave and
              discard the edits.
            </p>
            <div>
              <Button
                variant="ghost"
                onPress={() => setPendingNavigation(undefined)}
              >
                Keep editing
              </Button>
              <Button
                className="v2-primary"
                onPress={() => {
                  navigate(pendingNavigation, true);
                  setPendingNavigation(undefined);
                }}
              >
                Discard and leave
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
  function voicePanel() {
    return (
      <div className="v2-voice-panel">
        <div className="v2-voice-tabs">
          <Button
            variant="ghost"
            aria-pressed={voice === "dictation"}
            onPress={() => setVoice("dictation")}
          >
            Dictate
          </Button>
          <Button
            variant="ghost"
            aria-pressed={voice === "samantha"}
            onPress={() => setVoice("samantha")}
          >
            Samantha
          </Button>
          <Button
            variant="ghost"
            isIconOnly
            aria-label="Close voice input"
            onPress={() => setVoice(null)}
          >
            <X size={15} />
          </Button>
        </div>
        {voice === "dictation" ? (
          <BrowserDictation
            disabled={locked}
            contextKey={selected || "new"}
            language="en-US"
            maxLength={Math.max(0, 12000 - prompt.length)}
            onTranscript={(text) =>
              setPrompt((previous) =>
                `${previous}${previous ? " " : ""}${text}`.slice(0, 12000),
              )
            }
          />
        ) : (
          <SamanthaVoice
            disabled={locked}
            contextKey={selected || "new"}
            maxIdeaLength={12000}
            onIdea={(text) => {
              setPrompt((previous) =>
                `${previous}${previous ? "\n\n" : ""}${text}`.slice(0, 12000),
              );
              setVoice(null);
              promptRef.current?.focus();
            }}
          />
        )}
      </div>
    );
  }
}
