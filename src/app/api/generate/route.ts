import { generateCode } from "@/lib/anthropic";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { prompt, existingCode } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    // Pass existing code to enable chained prompts
    const htmlContent = await generateCode(prompt, existingCode || undefined);

    return NextResponse.json({ htmlContent });
  } catch (error) {
    console.error("Failed to generate code:", error);
    return NextResponse.json(
      { error: "Failed to generate code. Make sure your API key is set!" },
      { status: 500 }
    );
  }
}

