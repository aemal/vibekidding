# 🎮 VibeKidding

A magical voice-powered coding playground for kids! Just speak and watch your ideas come to life! ✨

🌐 **Live Demo**: [vibekidding.aemalsayer.com](https://vibekidding.aemalsayer.com)

![VibeKidding](https://img.shields.io/badge/Made%20for-Kids-ff69b4?style=for-the-badge)
![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?style=for-the-badge)

---

### 👨‍💻 About This Project

This project was built by **[Aemal Sayer](https://linkedin.com/in/aemal)** for his 7 years old son during Christmas break 2025 — in just a few hours using vibe coding! 🎄

**Want more Vibe Coding, n8n tips & tricks?**
- 🔗 Follow Aemal on **[LinkedIn](https://linkedin.com/in/aemal)**
- 📺 Subscribe to **[AgentGeeks on YouTube](https://youtube.com/@AgentGeeks)**

---

## 🌟 Features

- **🎤 Voice Input**: Kids can speak their ideas using the WebSpeech API
- **🤖 AI-Powered Generation**: Uses Claude Sonnet 4.5 to generate kid-friendly web pages
- **🎮 3D Game Support**: Three.js via CDN for creating 3D games and experiences
- **👀 Live Preview**: See creations instantly in a beautiful preview pane
- **💻 Code View**: Optionally view the generated HTML/CSS/JavaScript code
- **📁 Project Management**: Save and organize multiple creations
- **🔄 Version History**: Track changes and iterate on your creations
- **🔗 Shareable Links**: Each creation gets a unique permalink
- **🌈 Kid-Friendly UI**: Bright colors, fun animations, and playful design

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- An Anthropic API key (for Claude AI)
- A Neon PostgreSQL database (via Vercel Storage or directly from Neon)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/aemal/vibekidding.git
cd vibekidding
```

2. Install dependencies:
```bash
npm install
```

3. Set up your environment variables:
```bash
# Create a .env file with:
DATABASE_URL="postgresql://..."  # Your Neon PostgreSQL connection string
ANTHROPIC_API_KEY="sk-ant-..."   # Your Anthropic API key
```

4. Initialize the database:
```bash
npx prisma db push
npx prisma generate
```

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser!

## 🎯 How to Use

1. **Open the Dashboard**: You'll see all your saved creations
2. **Create New**: Click the "Create New!" button
3. **Speak Your Idea**: Click the microphone and tell it what you want to build
   - Try: "Make a rainbow button that bounces"
   - Or: "Create a 3D spinning cube game"
   - Or: "Make a 3D space with planets"
   - Or: "Draw a cute cat that moves"
   - Or: "Create a tic-tac-toe game"
4. **Watch the Magic**: The AI generates your creation in real-time
5. **Preview & Share**: View your creation and open it in a new tab to share!

### 🎮 3D Support

When kids ask for 3D content, the AI automatically uses Three.js via CDN:
- 3D games with colorful objects
- Drag-to-rotate camera controls
- Fun animations (spinning, bouncing, floating)
- No installation needed - everything loads from CDN!

## 🏗️ Tech Stack

- **Framework**: Next.js 16 (App Router + Turbopack)
- **Language**: TypeScript
- **Database**: PostgreSQL (Neon) with Prisma ORM
- **AI**: Anthropic Claude Sonnet 4.5
- **Speech**: Web Speech API (browser-native)
- **3D Graphics**: Three.js (via CDN for 3D requests)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

## 📦 Deployment on Vercel

This project is configured for seamless deployment on Vercel with Neon PostgreSQL.

### Step 1: Create a Neon Database via Vercel

1. Go to your Vercel Dashboard → **Storage**
2. Click **Create Database** → Select **Neon** (Serverless Postgres)
3. Choose the **Free** plan and create the database

### Step 2: Connect Database to Your Project

1. In Vercel, go to your project → **Storage** tab
2. Click **Connect Database** and select your Neon database
3. The `DATABASE_URL` and other variables will be automatically injected

### Step 3: Add Environment Variables

Add your Anthropic API key in Vercel:
1. Go to **Settings** → **Environment Variables**
2. Add `ANTHROPIC_API_KEY` with your key

### Step 4: Deploy

```bash
# Push to GitHub (auto-deploys to Vercel)
git push

# Or deploy directly
npx vercel
```

### Local Development with Vercel Postgres

For local development, you can connect directly to your Vercel/Neon database:

```bash
# Pull environment variables from Vercel
vercel env pull .env

# Or manually copy the DATABASE_URL from your Vercel dashboard
```

## 🎨 Customization

### Colors & Theme

The kid-friendly color palette is defined in `src/app/globals.css`:

```css
:root {
  --primary: #6c5ce7;        /* Purple */
  --secondary: #00cec9;      /* Teal */
  --accent-pink: #fd79a8;    /* Pink */
  --accent-yellow: #ffeaa7;  /* Yellow */
  /* ... more colors */
}
```

### AI Prompt

Customize what kind of code gets generated by editing the system prompt in `src/lib/anthropic.ts`.

## 🔒 Security Notes

- No authentication is implemented (designed for supervised use)
- Generated code runs in sandboxed iframes
- Keep your API keys secure

## 📝 License

MIT License - Feel free to use this for teaching kids to code!

## 🙏 Acknowledgments

- Made with ❤️ for awesome kids everywhere
- Powered by [Anthropic Claude](https://anthropic.com)
- Built with [Next.js](https://nextjs.org)
- Database by [Neon](https://neon.tech)

---

**Happy Creating! 🎨✨**
