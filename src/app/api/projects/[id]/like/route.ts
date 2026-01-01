import { prisma } from "@/lib/db";
import { isPowerUser } from "@/lib/constants";
import { NextResponse } from "next/server";

// POST - Like a project
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

    // Power user can't like (they don't exist in DB)
    if (isPowerUser(userId)) {
      return NextResponse.json(
        { error: "Power users cannot like games" },
        { status: 403 }
      );
    }

    // Check if project exists
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check if already liked
    const existingLike = await prisma.like.findUnique({
      where: {
        userId_projectId: {
          userId,
          projectId: id,
        },
      },
    });

    if (existingLike) {
      return NextResponse.json(
        { error: "Already liked this project" },
        { status: 400 }
      );
    }

    // Create the like
    await prisma.like.create({
      data: {
        userId,
        projectId: id,
      },
    });

    // Get updated like count
    const likeCount = await prisma.like.count({
      where: { projectId: id },
    });

    return NextResponse.json({ liked: true, likeCount });
  } catch (error) {
    console.error("Failed to like project:", error);
    return NextResponse.json(
      { error: "Failed to like project" },
      { status: 500 }
    );
  }
}

// DELETE - Unlike a project
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    // Power user can't unlike (they can't like in the first place)
    if (isPowerUser(userId)) {
      return NextResponse.json(
        { error: "Power users cannot unlike games" },
        { status: 403 }
      );
    }

    // Delete the like if it exists
    await prisma.like.deleteMany({
      where: {
        userId,
        projectId: id,
      },
    });

    // Get updated like count
    const likeCount = await prisma.like.count({
      where: { projectId: id },
    });

    return NextResponse.json({ liked: false, likeCount });
  } catch (error) {
    console.error("Failed to unlike project:", error);
    return NextResponse.json(
      { error: "Failed to unlike project" },
      { status: 500 }
    );
  }
}


