import { prisma } from "@/lib/db";
import { isPowerUser, POWER_USER_ID } from "@/lib/constants";
import { NextResponse } from "next/server";

// GET - Get user by ID
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Special case for power user - return admin info without database query
    if (isPowerUser(id)) {
      return NextResponse.json({
        id: POWER_USER_ID,
        username: "⚡ Power Admin",
        createdAt: new Date().toISOString(),
        gameCount: 0,
        totalLikes: 0,
        isPowerUser: true,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: { projects: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Calculate total likes received
    const totalLikes = await prisma.like.count({
      where: {
        project: {
          creatorId: id,
        },
      },
    });

    return NextResponse.json({
      ...user,
      gameCount: user._count.projects,
      totalLikes,
      isPowerUser: false,
    });
  } catch (error) {
    console.error("Failed to fetch user:", error);
    return NextResponse.json(
      { error: "Failed to fetch user" },
      { status: 500 }
    );
  }
}


