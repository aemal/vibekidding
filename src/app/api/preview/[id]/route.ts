import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// GET HTML content for preview
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      select: { htmlContent: true },
    });

    if (!project) {
      return new NextResponse(
        `<!DOCTYPE html>
<html>
<head><title>Not Found</title></head>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:linear-gradient(135deg,#667eea,#764ba2);color:white;">
<h1>🔍 Oops! Creation not found!</h1>
</body>
</html>`,
        {
          status: 404,
          headers: { "Content-Type": "text/html" },
        }
      );
    }

    return new NextResponse(project.htmlContent || getEmptyPreview(), {
      headers: { "Content-Type": "text/html" },
    });
  } catch (error) {
    console.error("Failed to fetch preview:", error);
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:linear-gradient(135deg,#f093fb,#f5576c);color:white;">
<h1>😵 Something went wrong!</h1>
</body>
</html>`,
      {
        status: 500,
        headers: { "Content-Type": "text/html" },
      }
    );
  }
}

function getEmptyPreview() {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Ready to Create!</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
    }
    .container {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 30px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.1);
    }
    .emoji { font-size: 80px; margin-bottom: 20px; animation: bounce 2s infinite; }
    h1 { color: #6c5ce7; font-size: 2.5rem; margin-bottom: 10px; }
    p { color: #a29bfe; font-size: 1.2rem; }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-20px); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="emoji">🎨</div>
    <h1>Ready to Create Magic!</h1>
    <p>Click the microphone and tell me what you want to build! ✨</p>
  </div>
</body>
</html>`;
}


