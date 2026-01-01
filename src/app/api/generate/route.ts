import { generateCode, generateTitle } from "@/lib/anthropic";
import { ensureEnglishForClaude } from "@/lib/translate";
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

    // Detect language and translate to English if needed for Claude
    // This ensures Claude understands prompts in all 99+ languages
    const translationResult = await ensureEnglishForClaude(prompt);
    
    if (translationResult.wasTranslated) {
      console.log(`[Translation] ${translationResult.detectedLanguage} → English`);
      console.log(`[Original] ${prompt}`);
      console.log(`[Translated] ${translationResult.translatedText}`);
    }

    // Use translated text for Claude, but keep original language context
    // We tell Claude the original language so it can make UI text in that language
    const promptForClaude = translationResult.wasTranslated
      ? `[User's language: ${translationResult.detectedLanguage}] ${translationResult.translatedText}`
      : prompt;

    // Pass existing code to enable chained prompts
    const htmlContent = await generateCode(promptForClaude, existingCode || undefined);

    // Generate title only on first creation (use original prompt for title generation)
    let title: string | undefined;
    if (isFirstGeneration) {
      title = await generateTitle(prompt);
    }

    return NextResponse.json({ 
      htmlContent, 
      title,
      // Return translation info for debugging/transparency
      translation: translationResult.wasTranslated ? {
        detected: translationResult.detectedLanguage,
        translated: true
      } : undefined
    });
  } catch (error) {
    console.error("Failed to generate code:", error);
    return NextResponse.json(
      { error: "Failed to generate code. Make sure your API key is set!" },
      { status: 500 }
    );
  }
}

