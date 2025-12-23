"use client";

import { ProjectSummary } from "@/types";
import { Trash2, ExternalLink } from "lucide-react";
import Link from "next/link";

interface ProjectCardProps {
  project: ProjectSummary;
  onDelete: (id: string) => void;
  index: number;
}

const cardColors = [
  "from-pink-400 to-purple-500",
  "from-cyan-400 to-blue-500",
  "from-green-400 to-emerald-500",
  "from-orange-400 to-red-500",
  "from-yellow-400 to-orange-500",
  "from-indigo-400 to-purple-600",
];

const emojis = ["🚀", "🎮", "🌟", "🎨", "🦄", "🌈", "🎪", "🎯", "🎸", "🎭"];

export default function ProjectCard({
  project,
  onDelete,
  index,
}: ProjectCardProps) {
  const colorClass = cardColors[index % cardColors.length];
  const emoji = emojis[index % emojis.length];

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div
      className="card group hover:scale-[1.02] transition-all duration-300"
      style={{ animationDelay: `${index * 0.1}s` }}
    >
      <Link href={`/project/${project.id}`} className="block">
        <div
          className={`h-24 rounded-t-[22px] bg-gradient-to-r ${colorClass} flex items-center justify-center`}
        >
          <span className="text-5xl">{emoji}</span>
        </div>
      </Link>

      <div className="p-5">
        <Link href={`/project/${project.id}`}>
          <h3 className="text-xl font-bold text-gray-800 mb-2 truncate hover:text-purple-600 transition-colors">
            {project.name}
          </h3>
        </Link>

        <p className="text-gray-500 text-sm mb-3 line-clamp-2 min-h-[2.5rem]">
          {project.prompt || "No description yet..."}
        </p>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {formatDate(project.updatedAt)}
          </span>

          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <Link
              href={`/preview/${project.id}`}
              target="_blank"
              className="p-2 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink size={16} />
            </Link>
            <button
              onClick={(e) => {
                e.preventDefault();
                if (confirm("Are you sure you want to delete this creation?")) {
                  onDelete(project.id);
                }
              }}
              className="p-2 rounded-full bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

