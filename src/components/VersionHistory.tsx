"use client";

import { useState, useEffect } from "react";
import { History, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { Version } from "@/types";

interface VersionHistoryProps {
  projectId: string;
  onRestore: () => void;
}

export default function VersionHistory({
  projectId,
  onRestore,
}: VersionHistoryProps) {
  const [versions, setVersions] = useState<Version[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchVersions();
    }
  }, [isOpen, projectId]);

  const fetchVersions = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/versions`);
      if (response.ok) {
        const data = await response.json();
        setVersions(data);
      }
    } catch (error) {
      console.error("Failed to fetch versions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (versionId: string) => {
    if (!confirm("Are you sure you want to restore this version? Your current work will be saved as a new version.")) {
      return;
    }

    setRestoringId(versionId);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/versions/${versionId}`,
        {
          method: "POST",
        }
      );

      if (response.ok) {
        onRestore();
        fetchVersions(); // Refresh the versions list
      }
    } catch (error) {
      console.error("Failed to restore version:", error);
    } finally {
      setRestoringId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const truncatePrompt = (prompt: string, maxLength: number = 40) => {
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + "...";
  };

  return (
    <div className="mt-6">
      {/* Toggle button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 hover:border-blue-300 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-blue-700">Version History</span>
          {versions.length > 0 && (
            <span className="bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
              {versions.length}
            </span>
          )}
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-blue-600" />
        ) : (
          <ChevronDown className="w-5 h-5 text-blue-600" />
        )}
      </button>

      {/* Versions list */}
      {isOpen && (
        <div className="mt-2 bg-white rounded-xl border-2 border-gray-100 overflow-hidden">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500">
              <div className="spinner mx-auto mb-2 w-6 h-6"></div>
              Loading history...
            </div>
          ) : versions.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <p className="text-2xl mb-2">📝</p>
              <p>No previous versions yet!</p>
              <p className="text-sm">Versions are saved when you create something new.</p>
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {versions.map((version, index) => (
                <div
                  key={version.id}
                  className={`flex items-center justify-between p-3 hover:bg-gray-50 ${
                    index !== versions.length - 1 ? "border-b border-gray-100" : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {truncatePrompt(version.prompt)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {formatDate(version.createdAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleRestore(version.id)}
                    disabled={restoringId === version.id}
                    className={`ml-3 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                      ${
                        restoringId === version.id
                          ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                          : "bg-green-100 text-green-700 hover:bg-green-200 hover:scale-105"
                      }
                    `}
                    title="Restore this version"
                  >
                    <RotateCcw
                      className={`w-4 h-4 ${
                        restoringId === version.id ? "animate-spin" : ""
                      }`}
                    />
                    <span>{restoringId === version.id ? "..." : "Restore"}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

