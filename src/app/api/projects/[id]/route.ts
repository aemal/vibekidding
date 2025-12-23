import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// GET single project
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(project);
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
    const { name, htmlContent, prompt } = await request.json();

    // If htmlContent is being updated, save the current state as a version first
    if (htmlContent !== undefined) {
      const currentProject = await prisma.project.findUnique({
        where: { id },
      });

      // Only save version if there's existing content (not for initial creation)
      if (currentProject && currentProject.htmlContent) {
        await prisma.version.create({
          data: {
            projectId: id,
            htmlContent: currentProject.htmlContent,
            prompt: currentProject.prompt,
          },
        });
      }
    }

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(htmlContent !== undefined && { htmlContent }),
        ...(prompt !== undefined && { prompt }),
      },
    });

    return NextResponse.json(project);
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

