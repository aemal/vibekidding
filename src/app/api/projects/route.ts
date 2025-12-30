import { prisma } from "@/lib/db";
import { isPowerUser } from "@/lib/constants";
import { NextResponse } from "next/server";

// Random emojis for new projects
const RANDOM_EMOJIS = ["🎮", "🚀", "🌈", "⭐", "🦄", "🎨", "🎲", "🐱", "🦊", "💖"];

// GET all projects
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const currentUserId = url.searchParams.get("userId");

    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        emoji: true,
        prompt: true,
        playCount: true,
        isSelected: true,
        createdAt: true,
        updatedAt: true,
        creatorId: true,
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
          : false,
      },
    });

    // Check if current user is power user (server-side validation)
    const userIsPowerUser = isPowerUser(currentUserId);

    // Transform the response
    const transformedProjects = projects.map((project) => ({
      id: project.id,
      name: project.name,
      emoji: project.emoji,
      prompt: project.prompt,
      playCount: project.playCount,
      isSelected: project.isSelected,
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
      isLikedByUser: currentUserId
        ? (project.likes as { id: string }[]).length > 0
        : false,
      isOwner: currentUserId === project.creatorId,
    }));

    return NextResponse.json({
      projects: transformedProjects,
      isPowerUser: userIsPowerUser,
    });
  } catch (error) {
    console.error("Failed to fetch projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

// POST new project
export async function POST(request: Request) {
  try {
    const { name, emoji, htmlContent, prompt, creatorId } = await request.json();

    if (!creatorId) {
      return NextResponse.json(
        { error: "Creator ID is required" },
        { status: 400 }
      );
    }

    // Verify the creator exists
    const creator = await prisma.user.findUnique({
      where: { id: creatorId },
    });

    if (!creator) {
      return NextResponse.json(
        { error: "Creator not found" },
        { status: 404 }
      );
    }

    // Pick a random emoji if none provided
    const randomEmoji = RANDOM_EMOJIS[Math.floor(Math.random() * RANDOM_EMOJIS.length)];

    const project = await prisma.project.create({
      data: {
        name: name || "My New Creation",
        emoji: emoji || randomEmoji,
        htmlContent: htmlContent || "",
        prompt: prompt || "",
        creatorId,
      },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            createdAt: true,
          },
        },
      },
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error("Failed to create project:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
