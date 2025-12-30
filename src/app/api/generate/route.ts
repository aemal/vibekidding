import { generateCode, generateTitle } from "@/lib/anthropic";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { prompt, existingCode, isFirstGeneration } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Pass existing code to enable chained prompts
    const htmlContent = await generateCode(prompt, existingCode || undefined);

    // Generate title only on first creation
    let title: string | undefined;
    if (isFirstGeneration) {
      title = await generateTitle(prompt);
    }

    return NextResponse.json({ htmlContent, title });
  } catch (error) {
    console.error("Failed to generate code:", error);
    return NextResponse.json(
      { error: "Failed to generate code. Make sure your API key is set!" },
      { status: 500 }
    );
  }
}

