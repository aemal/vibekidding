import { prisma } from "@/lib/db";
import { isPowerUser } from "@/lib/constants";
import { NextResponse } from "next/server";

// POST toggle selected status (power user only)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { userId, isSelected } = await request.json();

    // Check if user is power user (server-side validation)
    if (!isPowerUser(userId)) {
      return NextResponse.json(
        { error: "You don't have permission to perform this action" },
        { status: 403 }
      );
    }

    // Check if project exists
    const existingProject = await prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Update the isSelected status
    const project = await prisma.project.update({
      where: { id },
      data: { isSelected },
      select: {
        id: true,
        isSelected: true,
      },
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error("Failed to toggle selected status:", error);
    return NextResponse.json(
      { error: "Failed to toggle selected status" },
      { status: 500 }
    );
  }
}

