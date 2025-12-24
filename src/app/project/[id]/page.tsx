"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Code2,
  Eye,
  ExternalLink,
  Pencil,
  Check,
  X,
  Heart,
  Play,
  User,
  Gamepad2,
  Lock,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import Microphone from "@/components/Microphone";
import Preview from "@/components/Preview";
import CodeView from "@/components/CodeView";
import VersionHistory from "@/components/VersionHistory";
import EmojiPicker from "@/components/EmojiPicker";
import { Project } from "@/types";
import { useUser } from "@/lib/UserContext";

type ViewMode = "preview" | "code";

export default function ProjectEditor() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { userId } = useUser();

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isLiking, setIsLiking] = useState(false);

  const isOwner = project?.isOwner ?? false;

  const fetchProject = useCallback(async () => {
    if (!userId) return;
    try {
      const response = await fetch(`/api/projects/${projectId}?userId=${userId}`);
      if (response.ok) {
        const data = await response.json();
        setProject(data);
        setEditedName(data.name);
        setLiked(data.isLikedByUser || false);
        setLikeCount(data.likeCount || 0);
      } else if (response.status === 404) {
        router.push("/");
      }
    } catch (error) {
      console.error("Failed to fetch project:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, router, userId]);

  // Record play when viewing the project
  useEffect(() => {
    if (userId && projectId) {
      fetch(`/api/projects/${projectId}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      }).catch(console.error);
    }
  }, [userId, projectId]);

  useEffect(() => {
    if (userId) {
      fetchProject();
    }
  }, [fetchProject, userId]);

  const handleTranscript = useCallback(
    async (transcript: string) => {
      if (!isOwner) return;
      setIsGenerating(true);
      setError(null);

      try {
        // Generate code from transcript, including existing code for context
        const generateResponse = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: transcript,
            existingCode: project?.htmlContent || undefined,
          }),
        });

        if (!generateResponse.ok) {
          throw new Error("Failed to generate code");
        }

        const { htmlContent } = await generateResponse.json();

        // Save the project
        const saveResponse = await fetch(`/api/projects/${projectId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            htmlContent,
            prompt: transcript,
            userId,
          }),
        });

        if (saveResponse.ok) {
          const updatedProject = await saveResponse.json();
          setProject(updatedProject);
        }
      } catch (error) {
        console.error("Failed to generate:", error);
        setError(
          "Oops! Something went wrong. Make sure the API key is set up!"
        );
      } finally {
        setIsGenerating(false);
      }
    },
    [projectId, project?.htmlContent, isOwner, userId]
  );

  const saveName = async () => {
    if (!isOwner || !editedName.trim() || editedName === project?.name) {
      setIsEditingName(false);
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editedName.trim(), userId }),
      });

      if (response.ok) {
        const updatedProject = await response.json();
        setProject(updatedProject);
      }
    } catch (error) {
      console.error("Failed to save name:", error);
    } finally {
      setIsSaving(false);
      setIsEditingName(false);
    }
  };

  const saveEmoji = async (emoji: string) => {
    if (!isOwner) return;
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji, userId }),
      });

      if (response.ok) {
        const updatedProject = await response.json();
        setProject(updatedProject);
      }
    } catch (error) {
      console.error("Failed to save emoji:", error);
    }
  };

  const handleLike = async () => {
    if (!userId || isLiking) return;
    setIsLiking(true);
    const newLiked = !liked;

    // Optimistic update
    setLiked(newLiked);
    setLikeCount((prev) => (newLiked ? prev + 1 : prev - 1));

    try {
      if (newLiked) {
        await fetch(`/api/projects/${projectId}/like`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
      } else {
        await fetch(`/api/projects/${projectId}/like?userId=${userId}`, {
          method: "DELETE",
        });
      }
    } catch (error) {
      // Revert on error
      setLiked(!newLiked);
      setLikeCount((prev) => (newLiked ? prev - 1 : prev + 1));
      console.error("Failed to toggle like:", error);
    } finally {
      setIsLiking(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading || !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-500 font-semibold">Loading your creation...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm p-3 md:p-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 md:gap-4">
          {/* Left section */}
          <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
            <Link
              href="/"
              className="p-2 hover:bg-gray-100 rounded-full transition-colors shrink-0"
              title="Back to Dashboard"
            >
              <ArrowLeft size={20} className="text-gray-600 md:w-6 md:h-6" />
            </Link>

            {/* Emoji picker - only editable for owner */}
            {isOwner ? (
              <EmojiPicker
                selectedEmoji={project.emoji}
                onSelect={saveEmoji}
              />
            ) : (
              <span className="text-2xl md:text-3xl">{project.emoji}</span>
            )}

            {/* Project name */}
            {isEditingName && isOwner ? (
              <div className="flex items-center gap-2 min-w-0">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="text-base md:text-xl font-bold bg-white border-2 border-purple-300 rounded-lg px-2 py-1 focus:outline-none focus:border-purple-500 min-w-0 flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") {
                      setIsEditingName(false);
                      setEditedName(project.name);
                    }
                  }}
                />
                <button
                  onClick={saveName}
                  disabled={isSaving}
                  className="p-1 text-green-600 hover:bg-green-100 rounded-full"
                >
                  <Check size={18} />
                </button>
                <button
                  onClick={() => {
                    setIsEditingName(false);
                    setEditedName(project.name);
                  }}
                  className="p-1 text-red-600 hover:bg-red-100 rounded-full"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 min-w-0">
                {isOwner ? (
                  <button
                    onClick={() => setIsEditingName(true)}
                    className="flex items-center gap-2 group min-w-0"
                  >
                    <h1 className="text-base md:text-xl font-bold text-gray-800 truncate">
                      {project.name}
                    </h1>
                    <Pencil
                      size={14}
                      className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    />
                  </button>
                ) : (
                  <div className="flex items-center gap-2 min-w-0">
                    <h1 className="text-base md:text-xl font-bold text-gray-800 truncate">
                      {project.name}
                    </h1>
                    <Lock size={14} className="text-gray-400 shrink-0" title="View only" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Center - View toggle */}
          <div className="tab-switcher shrink-0">
            <button
              onClick={() => setViewMode("preview")}
              className={`tab-btn flex items-center gap-1 md:gap-2 px-3 md:px-5 ${
                viewMode === "preview" ? "active" : ""
              }`}
            >
              <Eye size={16} />
              <span className="hidden sm:inline">Preview</span>
            </button>
            <button
              onClick={() => setViewMode("code")}
              className={`tab-btn flex items-center gap-1 md:gap-2 px-3 md:px-5 ${
                viewMode === "code" ? "active" : ""
              }`}
            >
              <Code2 size={16} />
              <span className="hidden sm:inline">Code</span>
            </button>
          </div>

          {/* Right section */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Like button */}
            <button
              onClick={handleLike}
              disabled={isLiking}
              className={`flex items-center gap-1 px-3 py-2 rounded-full transition-all ${
                liked
                  ? "bg-red-100 text-red-500 hover:bg-red-200"
                  : "bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-400"
              }`}
            >
              <Heart size={18} className={liked ? "fill-current" : ""} />
              <span className="font-bold text-sm">{likeCount}</span>
            </button>
            <Link
              href={`/preview/${project.id}`}
              target="_blank"
              className="btn-secondary flex items-center gap-2 py-2 px-3 md:px-4 text-sm"
            >
              <ExternalLink size={16} />
              <span className="hidden md:inline">Full Screen</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Creator info bar */}
      <div className="bg-white/60 backdrop-blur-sm border-b border-gray-100 py-2 px-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-sm">
          <Link
            href={`/builder/${project.creator?.id}`}
            className="flex items-center gap-2 text-gray-600 hover:text-purple-600 transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 flex items-center justify-center">
              <User size={12} className="text-white" />
            </div>
            <span className="font-medium">{project.creator?.username}</span>
            <span className="text-gray-400">·</span>
            <Gamepad2 size={14} />
            <span>{project.creator?.gameCount} games</span>
          </Link>
          <div className="flex flex-wrap items-center gap-3 md:gap-4 text-gray-500">
            <span className="flex items-center gap-1">
              <Play size={14} className="fill-current" />
              {project.playCount} plays
            </span>
            <span className="flex items-center gap-1" title={`Created: ${formatDate(project.createdAt)}`}>
              <Calendar size={14} />
              <span className="hidden sm:inline">Created</span> {new Date(project.createdAt).toLocaleDateString()}
            </span>
            <span className="text-gray-400 hidden md:inline">
              Updated {formatDate(project.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Read-only banner */}
      {!isOwner && (
        <div className="bg-gradient-to-r from-orange-100 to-yellow-100 border-b border-orange-200 py-2 px-4">
          <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 text-orange-700 text-sm font-medium">
            <Lock size={14} />
            <span>This is someone else&apos;s creation. You can view and play, but not edit.</span>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 max-w-7xl mx-auto w-full min-h-0">
        {/* Left side - Microphone controls (only for owner) */}
        {isOwner && (
          <div className="lg:w-96 shrink-0 order-2 lg:order-1">
            <div className="card p-4 md:p-6 lg:sticky lg:top-36">
              <h2 className="text-lg md:text-xl font-bold text-gray-800 mb-4 md:mb-6 text-center">
                🎤 Voice Creator
              </h2>

              <Microphone
                onTranscript={handleTranscript}
                isGenerating={isGenerating}
              />

              {error && (
                <div className="mt-4 p-4 bg-red-50 rounded-xl border-2 border-red-200">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              {project.prompt && (
                <div className="mt-4 md:mt-6 p-3 md:p-4 bg-purple-50 rounded-xl">
                  <p className="text-sm text-gray-500 mb-1">Last request:</p>
                  <p className="text-purple-700 font-medium text-sm md:text-base">{project.prompt}</p>
                </div>
              )}

              <div className="mt-4 md:mt-6 p-3 md:p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border-2 border-yellow-200">
                <h3 className="font-bold text-orange-600 mb-2 text-sm md:text-base">💡 Try saying:</h3>
                <ul className="text-xs md:text-sm text-gray-600 space-y-1">
                  <li>• &quot;Make a rainbow button that bounces&quot;</li>
                  <li>• &quot;Create a 3D spinning cube game&quot;</li>
                  <li>• &quot;Draw a cute cat that moves&quot;</li>
                  <li>• &quot;Make a 3D space with planets&quot;</li>
                  <li>• &quot;Make fireworks when I click&quot;</li>
                </ul>
              </div>

              {/* Version History */}
              <VersionHistory
                projectId={projectId}
                onRestore={fetchProject}
              />
            </div>
          </div>
        )}

        {/* Right side - Preview/Code */}
        <div className={`flex-1 min-h-[400px] md:min-h-[600px] order-1 lg:order-2 ${!isOwner ? 'lg:max-w-4xl lg:mx-auto' : ''}`}>
          <div className="card h-full overflow-hidden min-h-[400px] md:min-h-[600px]">
            {viewMode === "preview" ? (
              <Preview htmlContent={project.htmlContent} />
            ) : (
              <CodeView code={project.htmlContent} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
