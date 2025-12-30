"use client";

import { ProjectSummary } from "@/types";
import { Trash2, ExternalLink, Heart, Play, User, Gamepad2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import ConfirmDialog from "./ConfirmDialog";

interface ProjectCardProps {
  project: ProjectSummary;
  onDelete?: (id: string) => void;
  onLike?: (id: string, liked: boolean) => void;
  index: number;
  showOwnerControls?: boolean;
}

const cardColors = [
  "from-pink-400 to-purple-500",
  "from-cyan-400 to-blue-500",
  "from-green-400 to-emerald-500",
  "from-orange-400 to-red-500",
  "from-yellow-400 to-orange-500",
  "from-indigo-400 to-purple-600",
];

export default function ProjectCard({
  project,
  onDelete,
  onLike,
  index,
  showOwnerControls = true,
}: ProjectCardProps) {
  const colorClass = cardColors[index % cardColors.length];
  const [isLiking, setIsLiking] = useState(false);
  const [liked, setLiked] = useState(project.isLikedByUser);
  const [likeCount, setLikeCount] = useState(project.likeCount);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  };

  const formatFullDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleLike = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isLiking) return;

    setIsLiking(true);
    const newLiked = !liked;
    
    // Optimistic update
    setLiked(newLiked);
    setLikeCount((prev) => (newLiked ? prev + 1 : prev - 1));

    try {
      if (onLike) {
        await onLike(project.id, newLiked);
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

  return (
    <div
      className="card group hover:scale-[1.02] transition-all duration-300"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <Link href={`/project/${project.id}`} className="block">
        <div
          className={`h-24 rounded-t-[22px] bg-gradient-to-r ${colorClass} flex items-center justify-center relative`}
        >
          <span className="text-5xl">{project.emoji || "🎮"}</span>
          {/* Owner badge */}
          {project.isOwner && (
            <span className="absolute top-2 left-2 bg-white/90 text-purple-600 text-xs font-bold px-2 py-1 rounded-full">
              Your Game
            </span>
          )}
        </div>
      </Link>

      <div className="p-4">
        <Link href={`/project/${project.id}`}>
          <h3 className="text-lg font-bold text-gray-800 mb-1 truncate hover:text-purple-600 transition-colors">
            {project.name}
          </h3>
        </Link>

        {/* Creator info */}
        <Link
          href={`/builder/${project.creator.id}`}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-purple-600 transition-colors mb-2"
          onClick={(e) => e.stopPropagation()}
        >
          <User size={14} />
          <span className="font-medium">{project.creator.username}</span>
          <span className="text-gray-400">·</span>
          <Gamepad2 size={14} />
          <span>{project.creator.gameCount}</span>
        </Link>

        <p className="text-gray-500 text-sm mb-3 line-clamp-2 min-h-[2.5rem]">
          {project.prompt || "No description yet..."}
        </p>

        {/* Stats row */}
        <div className="flex items-center justify-between text-xs text-gray-400 mb-3 pb-2 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <button
              onClick={handleLike}
              disabled={isLiking}
              className={`flex items-center gap-1 transition-colors ${
                liked
                  ? "text-red-500 hover:text-red-600"
                  : "text-gray-400 hover:text-red-400"
              }`}
            >
              <Heart
                size={16}
                className={liked ? "fill-current" : ""}
              />
              <span className="font-medium">{likeCount}</span>
            </button>
            <span className="flex items-center gap-1 text-gray-400">
              <Play size={14} className="fill-current" />
              <span>{project.playCount}</span>
            </span>
          </div>
          <span title={formatFullDate(project.updatedAt)}>
            {formatDate(project.updatedAt)}
          </span>
        </div>

        {/* Actions row */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            Created {formatDate(project.createdAt)}
          </span>

          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Link
              href={`/preview/${project.id}`}
              target="_blank"
              className="p-2 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
              title="Play in new tab"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={16} />
            </Link>
            {showOwnerControls && project.isOwner && onDelete && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
                className="p-2 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                title="Delete"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete this creation?"
        message="Are you sure you want to delete this creation? This action cannot be undone."
        confirmText="Delete"
        cancelText="Keep it"
        confirmVariant="danger"
        icon={<Trash2 size={32} />}
        onConfirm={() => {
          setShowDeleteConfirm(false);
          if (onDelete) {
            onDelete(project.id);
          }
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
