import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// GET - Get leaderboard data
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") || "games";
    const limit = parseInt(url.searchParams.get("limit") || "20");

    if (type === "games") {
      // Games leaderboard - sorted by likes
      const games = await prisma.project.findMany({
        take: limit,
        orderBy: [
          {
            likes: {
              _count: "desc",
            },
          },
          { playCount: "desc" },
          { createdAt: "desc" },
        ],
        select: {
          id: true,
          name: true,
          emoji: true,
          playCount: true,
          createdAt: true,
          creator: {
            select: {
              id: true,
              username: true,
              createdAt: true,
              _count: {
                select: { projects: true },
              },
            },
          },
          _count: {
            select: { likes: true },
          },
        },
      });

      const transformedGames = games.map((game) => ({
        id: game.id,
        name: game.name,
        emoji: game.emoji,
        playCount: game.playCount,
        likeCount: game._count.likes,
        createdAt: game.createdAt.toISOString(),
        creator: {
          id: game.creator.id,
          username: game.creator.username,
          createdAt: game.creator.createdAt.toISOString(),
          gameCount: game.creator._count.projects,
        },
      }));

      return NextResponse.json(transformedGames);
    } else if (type === "builders") {
      // Builders leaderboard
      const builders = await prisma.user.findMany({
        take: limit,
        select: {
          id: true,
          username: true,
          createdAt: true,
          _count: {
            select: { projects: true },
          },
          projects: {
            select: {
              playCount: true,
              _count: {
                select: { likes: true },
              },
            },
          },
        },
      });

      // Calculate totals and sort
      const transformedBuilders = builders
        .map((builder) => {
          const totalLikes = builder.projects.reduce(
            (sum, p) => sum + p._count.likes,
            0
          );
          const totalPlays = builder.projects.reduce(
            (sum, p) => sum + p.playCount,
            0
          );

          return {
            id: builder.id,
            username: builder.username,
            gameCount: builder._count.projects,
            totalLikes,
            totalPlays,
          };
        })
        // Sort by: total likes (primary), games count (secondary), total plays (tertiary)
        .sort((a, b) => {
          if (b.totalLikes !== a.totalLikes) return b.totalLikes - a.totalLikes;
          if (b.gameCount !== a.gameCount) return b.gameCount - a.gameCount;
          return b.totalPlays - a.totalPlays;
        })
        .slice(0, limit);

      return NextResponse.json(transformedBuilders);
    }

    return NextResponse.json(
      { error: "Invalid leaderboard type" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Failed to fetch leaderboard:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}

