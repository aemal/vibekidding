# 🎮 VibeKidding

**The Vibe Coding Playground for Kids!** — A magical voice-powered platform where children speak their ideas and watch them come to life! ✨

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

### 🌍 Multi-Language Support (NEW!)
- **🎤 Voice Input in 99+ Languages**: Kids can speak in their native language using OpenAI Whisper API
- **🤖 AI Generation in 30+ Languages**: Claude directly understands and creates games in major world languages including English, Spanish, French, German, Arabic, Chinese, Japanese, Korean, Hindi, and many more
- **🔄 Automatic Translation**: For less common languages, automatic translation ensures every child's ideas are understood
- **⭐ Starred Languages**: Languages with excellent AI support are highlighted for best results

### 🎤 Voice & Keyboard Input
- **🎤 Voice Mode**: Kids speak their ideas naturally — just click and talk!
- **⌨️ Typing Mode**: Type your ideas if you prefer — great for detailed instructions
- **🔀 Easy Toggle**: Switch between voice and typing modes instantly

### 🤖 AI-Powered Generation
- **Claude Sonnet 4.5**: State-of-the-art AI generates kid-friendly web pages
- **Context-Aware Updates**: Build on your existing creations — the AI remembers what you've made
- **Auto-Naming**: First creations automatically get fun titles based on your request

### 🎮 3D Game Support
- **Three.js via CDN**: Create 3D games and experiences without any setup
- **Colorful Objects**: Drag-to-rotate camera controls with fun animations
- **No Installation**: Everything loads automatically — just ask for 3D!

### 👀 Live Preview & Code View
- **Instant Preview**: See your creations come to life in real-time
- **Code View**: View and learn from the generated HTML/CSS/JavaScript
- **✏️ Editable Code**: In typing mode, directly edit the code for advanced tweaks
- **Full Screen**: Open your creation in a new tab for the full experience

### 📁 Project Management
- **Save & Organize**: All creations are automatically saved
- **🔄 Version History**: Track changes and go back to previous versions
- **🔗 Shareable Links**: Each creation gets a unique permalink
- **😊 Custom Emojis**: Pick from 500+ emojis to personalize your projects

### 🏆 Leaderboards & Profiles
- **🎮 Game Leaderboard**: See the most popular games ranked by likes and plays
- **👷 Builder Leaderboard**: Discover the top creators in the community
- **👤 Builder Profiles**: Each creator has their own profile page with stats
- **❤️ Like System**: Show love for your favorite creations
- **▶️ Play Counter**: See how many times each game has been played

### 🌈 Kid-Friendly Design
- **Bright Colors**: Fun, vibrant color palette kids love
- **Playful Animations**: Bouncy, engaging UI interactions
- **Big Buttons**: Easy to tap and click for small hands
- **Simple Navigation**: Intuitive design kids can use independently

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- An Anthropic API key (for Claude AI)
- An OpenAI API key (for Whisper voice transcription & translation)
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
DATABASE_URL="postgresql://..."     # Your Neon PostgreSQL connection string
ANTHROPIC_API_KEY="sk-ant-..."      # Your Anthropic API key
OPENAI_API_KEY="sk-..."             # Your OpenAI API key (for Whisper & translation)
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

---

## 🎯 How to Use

1. **Open the Dashboard**: You'll see all saved creations and featured games
2. **Create New**: Click the "Create New!" button
3. **Choose Your Input**: Pick Voice 🎤 or Typing ⌨️ mode
4. **Describe Your Idea**: Tell it what you want to build!
   - Try: "Make a rainbow button that bounces"
   - Or: "Create a 3D spinning cube game"
   - Or: "Make a 3D space with planets"
   - Or: "Draw a cute cat that moves"
   - Or: "Create a tic-tac-toe game"
5. **Watch the Magic**: The AI generates your creation in real-time
6. **Preview & Share**: View your creation and open it in a new tab to share!
7. **Iterate**: Add more features by describing what to change!

### 🌍 Multi-Language Examples
- 🇸🇦 Arabic: "اصنع لعبة كرة ترتد"
- 🇪🇸 Spanish: "Haz un botón arcoíris que rebote"
- 🇫🇷 French: "Crée un jeu de tic-tac-toe"
- 🇩🇪 German: "Erstelle einen 3D-Würfel, der sich dreht"
- 🇯🇵 Japanese: "虹色のボタンを作って"
- 🇨🇳 Chinese: "创建一个弹跳的球游戏"

### 🎮 3D Support

When kids ask for 3D content, the AI automatically uses Three.js via CDN:
- 3D games with colorful objects
- Drag-to-rotate camera controls
- Fun animations (spinning, bouncing, floating)
- No installation needed — everything loads from CDN!

---

## 🏗️ Tech Stack

- **Framework**: Next.js 16 (App Router + Turbopack)
- **Language**: TypeScript
- **Database**: PostgreSQL (Neon) with Prisma ORM
- **AI**: Anthropic Claude Sonnet 4.5 (code generation)
- **Speech**: OpenAI Whisper API (voice transcription in 99+ languages)
- **Translation**: OpenAI GPT-4o-mini (language detection & translation)
- **3D Graphics**: Three.js (via CDN for 3D requests)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

---

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

Add your API keys in Vercel:
1. Go to **Settings** → **Environment Variables**
2. Add `ANTHROPIC_API_KEY` with your Anthropic key
3. Add `OPENAI_API_KEY` with your OpenAI key

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

---

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

### Supported Languages

Languages are configured in:
- `src/lib/translate.ts` - Claude strong languages list
- `src/components/LanguagesModal.tsx` - Full language list with flags

---

## 🔒 Security Notes

- No authentication is implemented (designed for supervised use)
- Generated code runs in sandboxed iframes
- Keep your API keys secure
- User sessions are device-based using localStorage

---

## 📝 License

MIT License — Feel free to use this for teaching kids to code!

---

## 🙏 Acknowledgments

- Made with ❤️ for awesome kids everywhere
- Powered by [Anthropic Claude](https://anthropic.com)
- Voice by [OpenAI Whisper](https://openai.com)
- Built with [Next.js](https://nextjs.org)
- Database by [Neon](https://neon.tech)

---

**Happy Vibe Coding! 🎨✨**
