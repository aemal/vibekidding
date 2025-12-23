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
} from "lucide-react";
import Link from "next/link";
import Microphone from "@/components/Microphone";
import Preview from "@/components/Preview";
import CodeView from "@/components/CodeView";
import VersionHistory from "@/components/VersionHistory";
import { Project } from "@/types";

type ViewMode = "preview" | "code";

export default function ProjectEditor() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [isSaving, setIsSaving] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}`);
      if (response.ok) {
        const data = await response.json();
        setProject(data);
        setEditedName(data.name);
      } else if (response.status === 404) {
        router.push("/");
      }
    } catch (error) {
      console.error("Failed to fetch project:", error);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, router]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  const handleTranscript = useCallback(
    async (transcript: string) => {
      setIsGenerating(true);
      setError(null);

      try {
        // Generate code from transcript
        const generateResponse = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: transcript }),
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
    [projectId]
  );

  const saveName = async () => {
    if (!editedName.trim() || editedName === project?.name) {
      setIsEditingName(false);
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editedName.trim() }),
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

  if (isLoading) {
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
      <header className="bg-white/80 backdrop-blur-md shadow-sm p-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Left section */}
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft size={24} className="text-gray-600" />
            </Link>

            {/* Project name */}
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="text-xl font-bold bg-white border-2 border-purple-300 rounded-lg px-3 py-1 focus:outline-none focus:border-purple-500"
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
                  <Check size={20} />
                </button>
                <button
                  onClick={() => {
                    setIsEditingName(false);
                    setEditedName(project.name);
                  }}
                  className="p-1 text-red-600 hover:bg-red-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditingName(true)}
                className="flex items-center gap-2 group"
              >
                <h1 className="text-xl font-bold text-gray-800">
                  {project.name}
                </h1>
                <Pencil
                  size={16}
                  className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </button>
            )}
          </div>

          {/* Center - View toggle */}
          <div className="tab-switcher">
            <button
              onClick={() => setViewMode("preview")}
              className={`tab-btn flex items-center gap-2 ${
                viewMode === "preview" ? "active" : ""
              }`}
            >
              <Eye size={18} />
              <span className="hidden sm:inline">Preview</span>
            </button>
            <button
              onClick={() => setViewMode("code")}
              className={`tab-btn flex items-center gap-2 ${
                viewMode === "code" ? "active" : ""
              }`}
            >
              <Code2 size={18} />
              <span className="hidden sm:inline">Code</span>
            </button>
          </div>

          {/* Right section */}
          <div className="flex items-center gap-2">
            <Link
              href={`/preview/${project.id}`}
              target="_blank"
              className="btn-secondary flex items-center gap-2 py-2 px-4 text-sm"
            >
              <ExternalLink size={18} />
              <span className="hidden sm:inline">Open Full Screen</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 max-w-7xl mx-auto w-full min-h-0">
        {/* Left side - Microphone controls */}
        <div className="lg:w-96 shrink-0 order-2 lg:order-1">
          <div className="card p-6 lg:sticky lg:top-24">
            <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">
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
              <div className="mt-6 p-4 bg-purple-50 rounded-xl">
                <p className="text-sm text-gray-500 mb-1">Last request:</p>
                <p className="text-purple-700 font-medium">{project.prompt}</p>
              </div>
            )}

            <div className="mt-6 p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl border-2 border-yellow-200">
              <h3 className="font-bold text-orange-600 mb-2">💡 Try saying:</h3>
              <ul className="text-sm text-gray-600 space-y-1">
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

        {/* Right side - Preview/Code */}
        <div className="flex-1 min-h-[600px] order-1 lg:order-2">
          <div className="card h-full overflow-hidden min-h-[600px]">
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

