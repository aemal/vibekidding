import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// 5 minutes in milliseconds
const PLAY_COOLDOWN_MS = 5 * 60 * 1000;

// POST - Record a game play
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id },
      select: { playCount: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check for recent play from this user (anti-cheat)
    const cooldownTime = new Date(Date.now() - PLAY_COOLDOWN_MS);
    const recentPlay = await prisma.gamePlay.findFirst({
      where: {
        userId,
        projectId: id,
        playedAt: {
          gte: cooldownTime,
        },
      },
    });

    if (recentPlay) {
      // Don't count as a new play, but don't error either
      return NextResponse.json({
        counted: false,
        playCount: project.playCount,
        message: "Play already recorded recently",
      });
    }

    // Record the play and increment count
    await prisma.$transaction([
      prisma.gamePlay.create({
        data: {
          userId,
          projectId: id,
        },
      }),
      prisma.project.update({
        where: { id },
        data: {
          playCount: {
            increment: 1,
          },
        },
      }),
    ]);

    return NextResponse.json({
      counted: true,
      playCount: project.playCount + 1,
    });
  } catch (error) {
    console.error("Failed to record play:", error);
    return NextResponse.json(
      { error: "Failed to record play" },
      { status: 500 }
    );
  }
}


