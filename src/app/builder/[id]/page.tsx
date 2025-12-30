"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Gamepad2, Heart, Play, Trophy, Calendar, Star } from "lucide-react";
import Link from "next/link";
import ProjectCard from "@/components/ProjectCard";
import { ProjectSummary, User } from "@/types";
import { useUser } from "@/lib/UserContext";

export default function BuilderProfile() {
  const params = useParams();
  const builderId = params.id as string;
  const { userId } = useUser();

  const [builder, setBuilder] = useState<User | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalLikes, setTotalLikes] = useState(0);
  const [totalPlays, setTotalPlays] = useState(0);

  const isOwnProfile = userId === builderId;

  useEffect(() => {
    if (userId) {
      fetchBuilderData();
    }
  }, [builderId, userId]);

  const fetchBuilderData = async () => {
    try {
      // Fetch builder info
      const builderResponse = await fetch(`/api/users/${builderId}`);
      if (builderResponse.ok) {
        const builderData = await builderResponse.json();
        setBuilder(builderData);
      }

      // Fetch builder's projects
      const projectsResponse = await fetch(
        `/api/users/${builderId}/projects?currentUserId=${userId}`
      );
      if (projectsResponse.ok) {
        const projectsData = await projectsResponse.json();
        setProjects(projectsData);

        // Calculate totals
        const likes = projectsData.reduce(
          (sum: number, p: ProjectSummary) => sum + p.likeCount,
          0
        );
        const plays = projectsData.reduce(
          (sum: number, p: ProjectSummary) => sum + p.playCount,
          0
        );
        setTotalLikes(likes);
        setTotalPlays(plays);
      }
    } catch (error) {
      console.error("Failed to fetch builder data:", error);
    } finally {
      setIsLoading(false);
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
        setTotalLikes((prev) => prev + 1);
      } else {
        await fetch(`/api/projects/${projectId}/like?userId=${userId}`, {
          method: "DELETE",
        });
        setTotalLikes((prev) => prev - 1);
      }
    } catch (error) {
      throw error;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  };

  if (isLoading || !userId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="spinner mx-auto mb-4"></div>
          <p className="text-gray-500 font-semibold">Loading builder profile...</p>
        </div>
      </div>
    );
  }

  if (!builder) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="card p-8 text-center max-w-md">
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            Builder not found
          </h2>
          <p className="text-gray-500 mb-6">
            This builder doesn&apos;t seem to exist.
          </p>
          <Link href="/" className="btn-primary inline-flex items-center gap-2">
            <ArrowLeft size={18} />
            Go Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-4 md:p-6 lg:p-10">
      {/* Header */}
      <header className="max-w-7xl mx-auto mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-purple-600 transition-colors mb-6"
        >
          <ArrowLeft size={20} />
          <span className="font-medium">Back to Home</span>
        </Link>

        {/* Profile card */}
        <div className="card p-6 md:p-8 bg-gradient-to-r from-purple-50 to-pink-50">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            {/* Avatar */}
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 flex items-center justify-center shadow-lg">
              <span className="text-4xl md:text-5xl">
                {builder.username.charAt(0).toUpperCase()}
              </span>
            </div>

            {/* Info */}
            <div className="flex-1 text-center md:text-left">
              <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 mb-3">
                <h1 className="text-2xl md:text-3xl font-extrabold text-gray-800">
                  {builder.username}
                </h1>
                {isOwnProfile && (
                  <span className="bg-purple-100 text-purple-600 text-sm font-bold px-3 py-1 rounded-full">
                    <Star size={14} className="inline mr-1" />
                    That&apos;s you!
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-gray-600 mb-4">
                <span className="flex items-center gap-1.5">
                  <Calendar size={16} />
                  Joined {formatDate(builder.createdAt)}
                </span>
              </div>

              {/* Stats */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 md:gap-6">
                <div className="bg-white rounded-xl px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-purple-600">
                    <Gamepad2 size={20} />
                    <span className="text-2xl font-bold">{projects.length}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Games Created</p>
                </div>
                <div className="bg-white rounded-xl px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-red-500">
                    <Heart size={20} className="fill-current" />
                    <span className="text-2xl font-bold">{totalLikes}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Total Likes</p>
                </div>
                <div className="bg-white rounded-xl px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-green-500">
                    <Play size={20} className="fill-current" />
                    <span className="text-2xl font-bold">{totalPlays}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Total Plays</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Games */}
      <div className="max-w-7xl mx-auto">
        <h2 className="text-xl md:text-2xl font-bold text-gray-700 mb-6 flex items-center gap-2">
          <Trophy size={24} className="text-yellow-500" />
          {isOwnProfile ? "Your Creations" : `${builder.username}'s Creations`} ({projects.length})
        </h2>

        {projects.length === 0 ? (
          <div className="card p-8 text-center">
            <div className="text-6xl mb-4">🎨</div>
            <p className="text-gray-600 font-medium">
              {isOwnProfile
                ? "You haven't created any games yet. Go create something awesome!"
                : "This builder hasn't created any games yet."}
            </p>
            {isOwnProfile && (
              <Link
                href="/"
                className="btn-primary inline-flex items-center gap-2 mt-4"
              >
                Start Creating!
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {projects.map((project, index) => (
              <ProjectCard
                key={project.id}
                project={project}
                onLike={handleLike}
                index={index}
                showOwnerControls={false}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}


