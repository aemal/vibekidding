import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateTitle(prompt: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 50,
    messages: [
      {
        role: "user",
        content: `Generate a short, catchy game title (2-4 words max) for this creation request: "${prompt}"

Rules:
- Keep it very short (2-4 words)
- Make it fun and kid-friendly
- No quotes or punctuation
- Just the title, nothing else

Examples:
- "make a bouncing ball game" → "Bouncy Ball Fun"
- "create fireworks when I click" → "Click Fireworks"
- "draw a cat that moves" → "Dancing Cat"
- "make a space shooter" → "Space Blaster"

Title:`,
      },
    ],
  });

  const textContent = message.content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    return "My Creation";
  }

  // Clean up the response
  let title = textContent.text.trim();
  // Remove any quotes if present
  title = title.replace(/^["']|["']$/g, "");
  // Limit length
  if (title.length > 40) {
    title = title.substring(0, 40);
  }

  return title || "My Creation";
}

export async function generateCode(
  prompt: string,
  existingCode?: string
): Promise<string> {
  const baseSystemPrompt = `You are a friendly coding assistant for kids! A 7-year-old child is asking you to create something fun.

Your task: Generate a SINGLE, COMPLETE HTML file that includes ALL CSS (in a <style> tag) and ALL JavaScript (in a <script> tag).

IMPORTANT RULES:
1. Create fun, colorful, interactive web pages that kids will love
2. Use bright colors, fun animations, and playful elements
3. Make it simple but engaging - kids love:
   - Games (simple ones like click games, matching games)
   - Animations (bouncing, spinning, color changing)
   - Interactive elements (buttons that do fun things)
   - Cute characters and emojis
4. The code must be COMPLETE and WORKING
5. Include helpful comments in the code
6. Use large fonts and buttons (easy for kids to click)
7. Make it responsive and work well on different screens
8. Return ONLY the HTML code, no explanations before or after
9. Start with <!DOCTYPE html> and end with </html>

FOR 3D GAMES AND 3D CONTENT:
If the kid asks for anything 3D (3D game, 3D world, 3D objects, 3D characters, etc.), use Three.js via CDN:
- Include Three.js from CDN: <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
- Create fun 3D scenes with colorful objects, simple controls
- Use OrbitControls for easy camera movement (kid can drag to rotate): 
  <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
- Make 3D objects bright and colorful (use MeshBasicMaterial or MeshPhongMaterial with fun colors)
- Add simple animations (rotating, bouncing, floating objects)
- Include basic lighting (ambient + directional light)
- Keep controls simple: arrow keys, mouse click, or drag to interact
- Add fun sound effects using Web Audio API if appropriate

ALLOWED CDN LIBRARIES (use only when needed):
- Three.js for 3D: https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
- GSAP for advanced animations: https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js
- Howler.js for sounds: https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.3/howler.min.js

For 2D content, keep everything self-contained with no external dependencies.

Remember: This is for a 7-year-old, so make it FUN, COLORFUL, and MAGICAL! ✨`;

  // Build the system prompt based on whether we have existing code
  const systemPrompt = existingCode
    ? `${baseSystemPrompt}

IMPORTANT - MODIFYING EXISTING CODE:
The kid already has a project they've been working on. They want to MODIFY or ADD to their existing creation.
- Keep all the existing features that work well
- Only change/add what the kid is asking for
- Don't remove existing functionality unless specifically asked
- Preserve the existing style and theme
- Make sure the changes integrate smoothly with the existing code
- If the kid asks for something that conflicts with existing code, update the existing code to accommodate the new feature`
    : baseSystemPrompt;

  // Build the user message
  let userMessage: string;
  if (existingCode) {
    userMessage = `Here is my current project code:

\`\`\`html
${existingCode}
\`\`\`

Now please modify it to: ${prompt}

Return the COMPLETE updated HTML file with all my existing features PLUS the new changes.`;
  } else {
    userMessage = `Create this for me: ${prompt}`;
  }

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
    system: systemPrompt,
  });

  const textContent = message.content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text content in response");
  }

  let html = textContent.text;

  // Clean up the response - remove markdown code blocks if present
  if (html.includes("```html")) {
    html = html.replace(/```html\n?/g, "").replace(/```\n?/g, "");
  } else if (html.includes("```")) {
    html = html.replace(/```\n?/g, "");
  }

  return html.trim();
}

