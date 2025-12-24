import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// GET single project
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const currentUserId = url.searchParams.get("userId");

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
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
        likes: currentUserId
          ? {
              where: { userId: currentUserId },
              select: { id: true },
            }
          : undefined,
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const response = {
      id: project.id,
      name: project.name,
      emoji: project.emoji,
      htmlContent: project.htmlContent,
      prompt: project.prompt,
      playCount: project.playCount,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      creatorId: project.creatorId,
      creator: {
        id: project.creator.id,
        username: project.creator.username,
        createdAt: project.creator.createdAt.toISOString(),
        gameCount: project.creator._count.projects,
      },
      likeCount: project._count.likes,
      isLikedByUser: currentUserId && project.likes
        ? project.likes.length > 0
        : false,
      isOwner: currentUserId === project.creatorId,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to fetch project:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

// PUT update project
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { name, emoji, htmlContent, prompt, userId } = await request.json();

    // Check ownership
    const existingProject = await prisma.project.findUnique({
      where: { id },
      select: { creatorId: true, htmlContent: true, prompt: true },
    });

    if (!existingProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (existingProject.creatorId !== userId) {
      return NextResponse.json(
        { error: "You don't have permission to edit this project" },
        { status: 403 }
      );
    }

    // If htmlContent is being updated, save the current state as a version first
    if (htmlContent !== undefined) {
      // Only save version if there's existing content (not for initial creation)
      if (existingProject.htmlContent) {
        await prisma.version.create({
          data: {
            projectId: id,
            htmlContent: existingProject.htmlContent,
            prompt: existingProject.prompt,
          },
        });
      }
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(emoji && { emoji }),
        ...(htmlContent !== undefined && { htmlContent }),
        ...(prompt !== undefined && { prompt }),
      },
      include: {
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

    return NextResponse.json({
      ...project,
      creator: {
        ...project.creator,
        gameCount: project.creator._count.projects,
      },
      likeCount: project._count.likes,
      isOwner: true,
    });
  } catch (error) {
    console.error("Failed to update project:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}

// DELETE project
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    // Check ownership
    const existingProject = await prisma.project.findUnique({
      where: { id },
      select: { creatorId: true },
    });

    if (!existingProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (existingProject.creatorId !== userId) {
      return NextResponse.json(
        { error: "You don't have permission to delete this project" },
        { status: 403 }
      );
    }

    await prisma.project.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete project:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}
