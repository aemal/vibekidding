import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// GET a specific version
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { versionId } = await params;
    const version = await prisma.version.findUnique({
      where: { id: versionId },
    });

    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    return NextResponse.json(version);
  } catch (error) {
    console.error("Failed to fetch version:", error);
    return NextResponse.json(
      { error: "Failed to fetch version" },
      { status: 500 }
    );
  }
}

// POST restore a version (makes it the current version)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  try {
    const { id, versionId } = await params;
    const { userId } = await request.json().catch(() => ({}));

    // Get the version to restore
    const version = await prisma.version.findUnique({
      where: { id: versionId },
    });

    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    // Get current project state and verify ownership
    const currentProject = await prisma.project.findUnique({
      where: { id },
    });

    if (!currentProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Check ownership
    if (currentProject.creatorId !== userId) {
      return NextResponse.json(
        { error: "You don't have permission to restore versions for this project" },
        { status: 403 }
      );
    }

    if (currentProject.htmlContent) {
      // Save current state as a new version before restoring
      await prisma.version.create({
        data: {
          projectId: id,
          htmlContent: currentProject.htmlContent,
          prompt: currentProject.prompt + " (before restore)",
        },
      });
    }

    // Update project with the restored version
    const updatedProject = await prisma.project.update({
      where: { id },
      data: {
        htmlContent: version.htmlContent,
        prompt: version.prompt,
      },
    });

    return NextResponse.json(updatedProject);
  } catch (error) {
    console.error("Failed to restore version:", error);
    return NextResponse.json(
      { error: "Failed to restore version" },
      { status: 500 }
    );
  }
}
