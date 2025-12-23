"use client";

import { useEffect, useState } from "react";
import { Plus, Sparkles, Rocket } from "lucide-react";
import Link from "next/link";
import ProjectCard from "@/components/ProjectCard";
import { ProjectSummary } from "@/types";

export default function Dashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await fetch("/api/projects");
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  };

  const createNewProject = async () => {
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "My New Creation",
          htmlContent: "",
          prompt: "",
        }),
      });
      if (response.ok) {
        const project = await response.json();
        window.location.href = `/project/${project.id}`;
      }
    } catch (error) {
      console.error("Failed to create project:", error);
    }
  };

  return (
    <main className="min-h-screen p-6 md:p-10">
      {/* Header */}
      <header className="max-w-7xl mx-auto mb-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <h1 className="text-5xl md:text-6xl font-extrabold mb-3">
              <span className="rainbow-text">VibeKidding</span> 🎮
            </h1>
            <p className="text-xl text-gray-600 flex items-center justify-center md:justify-start gap-2">
              <Sparkles className="text-yellow-500" />
              Create awesome stuff with your voice!
              <Rocket className="text-pink-500" />
            </p>
          </div>

          <button
            onClick={createNewProject}
            className="btn-primary flex items-center gap-3 text-xl px-8 py-4"
          >
            <Plus size={28} />
            Create New!
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="spinner mb-4"></div>
            <p className="text-gray-500 font-semibold">
              Loading your creations...
            </p>
          </div>
        ) : projects.length === 0 ? (
          <div className="card p-12 text-center max-w-xl mx-auto">
            <div className="text-8xl mb-6">🎨</div>
            <h2 className="text-3xl font-bold text-gray-800 mb-4">
              No creations yet!
            </h2>
            <p className="text-gray-500 text-lg mb-8">
              Ready to make something amazing? Click the button above to start
              creating with your voice!
            </p>
            <button
              onClick={createNewProject}
              className="btn-secondary inline-flex items-center gap-2"
            >
              <Sparkles size={20} />
              Start Creating!
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-gray-700 mb-6 flex items-center gap-2">
              <span>🌟</span> Your Creations ({projects.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {projects.map((project, index) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onDelete={handleDelete}
                  index={index}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Fun footer */}
      <footer className="max-w-7xl mx-auto mt-20 text-center text-gray-500">
        <p className="flex items-center justify-center gap-2">
          Made with ❤️ for awesome kids everywhere! 🌈
        </p>
      </footer>
    </main>
  );
}
