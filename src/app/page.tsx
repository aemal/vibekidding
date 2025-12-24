"use client";

import { useEffect, useState } from "react";
import { Plus, Sparkles, Rocket, Trophy, Users, User } from "lucide-react";
import Link from "next/link";
import ProjectCard from "@/components/ProjectCard";
import { ProjectSummary } from "@/types";
import { useUser } from "@/lib/UserContext";

type ViewFilter = "all" | "mine";

export default function Dashboard() {
  const { userId, username, isLoading: isUserLoading, gameCount } = useUser();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");

  useEffect(() => {
    if (userId) {
      fetchProjects();
    }
  }, [userId]);

  const fetchProjects = async () => {
    if (!userId) return;
    try {
      const response = await fetch(`/api/projects?userId=${userId}`);
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
    if (!userId) return;
    try {
      const response = await fetch(`/api/projects/${id}?userId=${userId}`, {
        method: "DELETE",
      });
      if (response.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  };

  const handleLike = async (projectId: string, liked: boolean) => {
    if (!userId) return;
    try {
      if (liked) {
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
      throw error;
    }
  };

  const createNewProject = async () => {
    if (!userId) return;
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "My New Creation",
          htmlContent: "",
          prompt: "",
          creatorId: userId,
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

  const filteredProjects =
    viewFilter === "all"
      ? projects
      : projects.filter((p) => p.isOwner);

  const myProjectCount = projects.filter((p) => p.isOwner).length;

  if (isUserLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-500 font-semibold">Loading VibeKidding...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-6 lg:p-10">
      {/* Header */}
      <header className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-6">
          <div className="text-center md:text-left">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-2 md:mb-3">
              <span className="rainbow-text">VibeKidding</span> 🎮
            </h1>
            <p className="text-lg md:text-xl text-gray-600 flex items-center justify-center md:justify-start gap-2">
              <Sparkles className="text-yellow-500" size={20} />
              Create awesome stuff with your voice!
              <Rocket className="text-pink-500" size={20} />
            </p>
          </div>

          {/* User info & Create button */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {username && (
              <Link
                href={`/builder/${userId}`}
                className="flex items-center gap-2 bg-white/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-sm hover:shadow-md transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 flex items-center justify-center">
                  <User size={16} className="text-white" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-gray-800 text-sm">{username}</p>
                  <p className="text-xs text-gray-500">{gameCount} games</p>
                </div>
              </Link>
            )}
            <button
              onClick={createNewProject}
              className="btn-primary flex items-center gap-2 text-base md:text-xl px-6 md:px-8 py-3 md:py-4"
            >
              <Plus size={24} />
              Create New!
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-6 flex flex-wrap items-center justify-center md:justify-start gap-3">
          <Link
            href="/leaderboard"
            className="flex items-center gap-2 bg-gradient-to-r from-yellow-400 to-orange-400 text-white font-bold px-4 py-2 rounded-full hover:scale-105 transition-transform shadow-md"
          >
            <Trophy size={18} />
            <span className="hidden sm:inline">Game Leaderboard</span>
            <span className="sm:hidden">Games</span>
          </Link>
          <Link
            href="/leaderboard?type=builders"
            className="flex items-center gap-2 bg-gradient-to-r from-blue-400 to-purple-400 text-white font-bold px-4 py-2 rounded-full hover:scale-105 transition-transform shadow-md"
          >
            <Users size={18} />
            <span className="hidden sm:inline">Builder Leaderboard</span>
            <span className="sm:hidden">Builders</span>
          </Link>
        </nav>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="spinner mb-4"></div>
            <p className="text-gray-500 font-semibold">
              Loading creations...
            </p>
          </div>
        ) : projects.length === 0 ? (
          <div className="card p-8 md:p-12 text-center max-w-xl mx-auto">
            <div className="text-6xl md:text-8xl mb-6">🎨</div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-4">
              No creations yet!
            </h2>
            <p className="text-gray-500 text-base md:text-lg mb-8">
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
            {/* Filter tabs */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
              <div className="tab-switcher">
                <button
                  onClick={() => setViewFilter("all")}
                  className={`tab-btn ${viewFilter === "all" ? "active" : ""}`}
                >
                  🌍 All Games ({projects.length})
                </button>
                <button
                  onClick={() => setViewFilter("mine")}
                  className={`tab-btn ${viewFilter === "mine" ? "active" : ""}`}
                >
                  ⭐ My Games ({myProjectCount})
                </button>
              </div>
            </div>

            {filteredProjects.length === 0 ? (
              <div className="card p-8 text-center">
                <div className="text-5xl mb-4">🎮</div>
                <p className="text-gray-600 font-medium">
                  {viewFilter === "mine"
                    ? "You haven't created any games yet. Click 'Create New!' to get started!"
                    : "No games found."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                {filteredProjects.map((project, index) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onDelete={handleDelete}
                    onLike={handleLike}
                    index={index}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Fun footer */}
      <footer className="max-w-7xl mx-auto mt-12 md:mt-20 text-center text-gray-500">
        <p className="flex items-center justify-center gap-2 text-sm md:text-base">
          Made with ❤️ for awesome kids everywhere! 🌈
        </p>
      </footer>
    </main>
  );
}
