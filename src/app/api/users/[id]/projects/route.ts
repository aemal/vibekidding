import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// GET - Get all projects by a specific user
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const currentUserId = url.searchParams.get("currentUserId");

    const projects = await prisma.project.findMany({
      where: { creatorId: id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        emoji: true,
        prompt: true,
        playCount: true,
        createdAt: true,
        updatedAt: true,
        creatorId: true,
        creator: {
          select: {
            id: true,
            username: true,
            createdAt: true,
          },
        },
        _count: {
          select: { likes: true },
        },
        likes: currentUserId
          ? {
              where: { userId: currentUserId },
              select: { id: true },
            }
          : false,
      },
    });

    // Get the creator's game count
    const gameCount = projects.length;

    // Transform the response
    const transformedProjects = projects.map((project) => ({
      id: project.id,
      name: project.name,
      emoji: project.emoji,
      prompt: project.prompt,
      playCount: project.playCount,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      creatorId: project.creatorId,
      creator: {
        ...project.creator,
        createdAt: project.creator.createdAt.toISOString(),
        gameCount,
      },
      likeCount: project._count.likes,
      isLikedByUser: currentUserId
        ? (project.likes as { id: string }[]).length > 0
        : false,
      isOwner: currentUserId === project.creatorId,
    }));

    return NextResponse.json(transformedProjects);
  } catch (error) {
    console.error("Failed to fetch user projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch user projects" },
      { status: 500 }
    );
  }
}


