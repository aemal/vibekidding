"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Trophy,
  Heart,
  Play,
  Gamepad2,
  Users,
  Crown,
  Star,
} from "lucide-react";
import Link from "next/link";
import { LeaderboardGame, LeaderboardBuilder } from "@/types";
import { useUser } from "@/lib/UserContext";

type LeaderboardType = "games" | "builders";

const rankEmojis = ["🥇", "🥈", "🥉"];
const rankColors = [
  "from-yellow-400 to-amber-500",
  "from-gray-300 to-gray-400",
  "from-amber-600 to-orange-700",
];

export default function Leaderboard() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen p-4 md:p-6 lg:p-10">
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-col items-center justify-center py-20">
              <div className="spinner mb-4"></div>
              <p className="text-gray-500 font-semibold">Loading leaderboard...</p>
            </div>
          </div>
        </main>
      }
    >
      <LeaderboardContent />
    </Suspense>
  );
}

function LeaderboardContent() {
  const searchParams = useSearchParams();
  const typeParam = searchParams.get("type");
  const { userId } = useUser();

  const [activeTab, setActiveTab] = useState<LeaderboardType>(
    typeParam === "builders" ? "builders" : "games"
  );
  const [games, setGames] = useState<LeaderboardGame[]>([]);
  const [builders, setBuilders] = useState<LeaderboardBuilder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard();
  }, [activeTab]);

  const fetchLeaderboard = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/leaderboard?type=${activeTab}&limit=50`);
      if (response.ok) {
        const data = await response.json();
        if (activeTab === "games") {
          setGames(data);
        } else {
          setBuilders(data);
        }
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-6 lg:p-10">
      {/* Header */}
      <header className="max-w-4xl mx-auto mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-600 hover:text-purple-600 transition-colors mb-6"
        >
          <ArrowLeft size={20} />
          <span className="font-medium">Back to Home</span>
        </Link>

        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-extrabold mb-3">
            <span className="rainbow-text">Leaderboard</span> 🏆
          </h1>
          <p className="text-gray-600 text-lg">
            See the top games and builders in VibeKidding!
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex justify-center">
          <div className="tab-switcher">
            <button
              onClick={() => setActiveTab("games")}
              className={`tab-btn flex items-center gap-2 ${
                activeTab === "games" ? "active" : ""
              }`}
            >
              <Trophy size={18} />
              <span>Top Games</span>
            </button>
            <button
              onClick={() => setActiveTab("builders")}
              className={`tab-btn flex items-center gap-2 ${
                activeTab === "builders" ? "active" : ""
              }`}
            >
              <Users size={18} />
              <span>Top Builders</span>
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="spinner mb-4"></div>
            <p className="text-gray-500 font-semibold">Loading leaderboard...</p>
          </div>
        ) : activeTab === "games" ? (
          <GamesLeaderboard games={games} userId={userId} />
        ) : (
          <BuildersLeaderboard builders={builders} userId={userId} />
        )}
      </div>
    </main>
  );
}

function GamesLeaderboard({
  games,
  userId,
}: {
  games: LeaderboardGame[];
  userId: string | null;
}) {
  if (games.length === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="text-6xl mb-4">🎮</div>
        <p className="text-gray-600 font-medium">
          No games have been created yet. Be the first!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {games.map((game, index) => {
        const isTopThree = index < 3;
        const isOwn = game.creator.id === userId;

        return (
          <Link
            key={game.id}
            href={`/project/${game.id}`}
            className={`card p-4 flex items-center gap-4 hover:scale-[1.01] transition-all ${
              isTopThree ? "border-2" : ""
            } ${
              index === 0
                ? "border-yellow-400 bg-yellow-50"
                : index === 1
                ? "border-gray-300 bg-gray-50"
                : index === 2
                ? "border-amber-600 bg-amber-50"
                : ""
            }`}
          >
            {/* Rank */}
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                isTopThree
                  ? `bg-gradient-to-r ${rankColors[index]} text-white`
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {isTopThree ? (
                <span className="text-2xl">{rankEmojis[index]}</span>
              ) : (
                <span className="font-bold">{index + 1}</span>
              )}
            </div>

            {/* Game emoji */}
            <div className="text-4xl shrink-0">{game.emoji}</div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-gray-800 truncate">{game.name}</h3>
                {isOwn && (
                  <span className="bg-purple-100 text-purple-600 text-xs font-bold px-2 py-0.5 rounded-full">
                    Yours
                  </span>
                )}
              </div>
              <span
                className="text-sm text-gray-500 hover:text-purple-600 transition-colors cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  window.location.href = `/builder/${game.creator.id}`;
                }}
              >
                by {game.creator.username}
              </span>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 shrink-0">
              <div className="text-center">
                <div className="flex items-center gap-1 text-red-500">
                  <Heart size={16} className="fill-current" />
                  <span className="font-bold">{game.likeCount}</span>
                </div>
                <p className="text-xs text-gray-400">likes</p>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 text-green-500">
                  <Play size={16} className="fill-current" />
                  <span className="font-bold">{game.playCount}</span>
                </div>
                <p className="text-xs text-gray-400">plays</p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function BuildersLeaderboard({
  builders,
  userId,
}: {
  builders: LeaderboardBuilder[];
  userId: string | null;
}) {
  if (builders.length === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="text-6xl mb-4">👷</div>
        <p className="text-gray-600 font-medium">
          No builders yet. Start building!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {builders.map((builder, index) => {
        const isTopThree = index < 3;
        const isOwn = builder.id === userId;

        return (
          <Link
            key={builder.id}
            href={`/builder/${builder.id}`}
            className={`card p-4 flex items-center gap-4 hover:scale-[1.01] transition-all ${
              isTopThree ? "border-2" : ""
            } ${
              index === 0
                ? "border-yellow-400 bg-yellow-50"
                : index === 1
                ? "border-gray-300 bg-gray-50"
                : index === 2
                ? "border-amber-600 bg-amber-50"
                : ""
            }`}
          >
            {/* Rank */}
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                isTopThree
                  ? `bg-gradient-to-r ${rankColors[index]} text-white`
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {isTopThree ? (
                <span className="text-2xl">{rankEmojis[index]}</span>
              ) : (
                <span className="font-bold">{index + 1}</span>
              )}
            </div>

            {/* Avatar */}
            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-400 to-pink-400 flex items-center justify-center shrink-0">
              <span className="text-xl text-white font-bold">
                {builder.username.charAt(0).toUpperCase()}
              </span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-gray-800 truncate">
                  {builder.username}
                </h3>
                {isOwn && (
                  <span className="bg-purple-100 text-purple-600 text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Star size={12} />
                    You
                  </span>
                )}
                {index === 0 && (
                  <Crown size={16} className="text-yellow-500" />
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 md:gap-4 shrink-0">
              <div className="text-center">
                <div className="flex items-center gap-1 text-purple-500">
                  <Gamepad2 size={16} />
                  <span className="font-bold">{builder.gameCount}</span>
                </div>
                <p className="text-xs text-gray-400 hidden sm:block">games</p>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 text-red-500">
                  <Heart size={16} className="fill-current" />
                  <span className="font-bold">{builder.totalLikes}</span>
                </div>
                <p className="text-xs text-gray-400 hidden sm:block">likes</p>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 text-green-500">
                  <Play size={16} className="fill-current" />
                  <span className="font-bold">{builder.totalPlays}</span>
                </div>
                <p className="text-xs text-gray-400 hidden sm:block">plays</p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

