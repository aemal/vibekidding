import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Languages that Claude handles excellently - no translation needed
// These match the "starred" languages in the LanguagesModal
const CLAUDE_STRONG_LANGUAGES = [
  "english",
  "spanish",
  "portuguese",
  "french",
  "german",
  "italian",
  "dutch",
  "russian",
  "chinese",
  "japanese",
  "korean",
  "arabic",
  "hindi",
  "bengali",
  "indonesian",
  "turkish",
  "vietnamese",
  "thai",
  "polish",
  "ukrainian",
  "swedish",
  "norwegian",
  "danish",
  "finnish",
  "czech",
  "greek",
  "hebrew",
  "romanian",
  "hungarian",
  "swahili",
];

interface TranslationResult {
  originalText: string;
  translatedText: string;
  detectedLanguage: string;
  wasTranslated: boolean;
}

/**
 * Detects the language of the given text using OpenAI
 */
export async function detectLanguage(text: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a language detection assistant. Identify the language of the given text.
Reply with ONLY the language name in lowercase English (e.g., "english", "spanish", "arabic", "chinese", "japanese").
Do not include any other text, punctuation, or explanation.`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      max_tokens: 20,
      temperature: 0,
    });

    const detectedLanguage = response.choices[0]?.message?.content?.trim().toLowerCase() || "english";
    return detectedLanguage;
  } catch (error) {
    console.error("Language detection error:", error);
    // Default to English if detection fails
    return "english";
  }
}

/**
 * Translates text to English using OpenAI GPT
 */
export async function translateToEnglish(text: string, sourceLanguage: string): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a translator. Translate the following ${sourceLanguage} text to English.
This is a child's request to create a game or interactive web page.
Translate accurately but keep it simple and clear.
Reply with ONLY the English translation, no explanations or notes.`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      max_tokens: 500,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content?.trim() || text;
  } catch (error) {
    console.error("Translation error:", error);
    // Return original text if translation fails
    return text;
  }
}

/**
 * Checks if the language is well-supported by Claude
 */
export function isClaudeStrongLanguage(language: string): boolean {
  const normalizedLanguage = language.toLowerCase().trim();
  return CLAUDE_STRONG_LANGUAGES.some(
    (lang) => normalizedLanguage.includes(lang) || lang.includes(normalizedLanguage)
  );
}

/**
 * Main function: Detects language and translates to English if needed
 * Returns the original text if it's a language Claude handles well,
 * otherwise returns the English translation
 */
export async function ensureEnglishForClaude(text: string): Promise<TranslationResult> {
  // Detect the language
  const detectedLanguage = await detectLanguage(text);
  
  // Check if Claude handles this language well
  if (isClaudeStrongLanguage(detectedLanguage)) {
    return {
      originalText: text,
      translatedText: text,
      detectedLanguage,
      wasTranslated: false,
    };
  }

  // Translate to English for languages Claude doesn't handle well
  console.log(`Translating from ${detectedLanguage} to English for better Claude understanding`);
  const translatedText = await translateToEnglish(text, detectedLanguage);

  return {
    originalText: text,
    translatedText,
    detectedLanguage,
    wasTranslated: true,
  };
}

