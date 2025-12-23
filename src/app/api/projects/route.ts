import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// Random emojis for new projects
const RANDOM_EMOJIS = ["🎮", "🚀", "🌈", "⭐", "🦄", "🎨", "🎲", "🐱", "🦊", "💖"];

// GET all projects
export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        emoji: true,
        prompt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return NextResponse.json(projects);
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
    const { name, emoji, htmlContent, prompt } = await request.json();

    // Pick a random emoji if none provided
    const randomEmoji = RANDOM_EMOJIS[Math.floor(Math.random() * RANDOM_EMOJIS.length)];

    const project = await prisma.project.create({
      data: {
        name: name || "My New Creation",
        emoji: emoji || randomEmoji,
        htmlContent: htmlContent || "",
        prompt: prompt || "",
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

