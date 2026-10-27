"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Button, Card, Link } from "@heroui/react";
import { ArrowRight, ArrowUpRight, Check, Code2, Heart, Layers3, Menu, Mic, Moon, Play, Plus, Sparkles, Sun, X, Bell, LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import "@/app/v2-theme.css";
import "./landing.css";
import { FirstVersionGallery } from "./FirstVersionGallery";

const ideas = ["A chore tracker with photo uploads", "A landing page for my next idea", "A two-player game for our family", "A little app for my book collection"];
const alternatives = [
  { name: "Replit", url: "https://replit.com", icon: "/brands/replit.png" },
  { name: "Lovable", url: "https://lovable.dev", icon: "/brands/lovable.png" },
  { name: "v0", url: "https://v0.app", icon: "/brands/v0.svg" },
  { name: "Base44", url: "https://base44.com", icon: "/brands/base44.png" },
  { name: "Bolt", url: "https://bolt.new", icon: "/brands/bolt.svg" },
];
export function V2Landing() {
  const [dark, setDark] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    let active = true;
    const syncTheme = () => {
      try { setDark(localStorage.getItem("vibekidding-v2-theme") === "dark"); } catch {}
    };
    queueMicrotask(() => { if (active) syncTheme(); });
    window.addEventListener("storage", syncTheme);
    return () => { active = false; window.removeEventListener("storage", syncTheme); };
  }, []);
  function toggleTheme() {
    const next = !dark;
    setDark(next);
    try { localStorage.setItem("vibekidding-v2-theme", next ? "dark" : "light"); } catch {}
  }
  const openStudio = (idea?: string) => { window.location.href = idea ? `/studio?idea=${encodeURIComponent(idea)}` : "/studio"; };
  return <div className="v2-theme v2-landing" data-theme={dark ? "dark" : "light"}>
    <header className="vl-header">
      <Link href="/" className="vl-brand"><span className="vl-brand-mark"><Code2 size={24} /></span>VibeKidding<span className="vl-beta">EARLY ACCESS</span></Link>
      <nav id="landing-main-navigation" aria-label="Main navigation" className={menu ? "vl-nav is-open" : "vl-nav"}>
        <Link href="#possibilities" onPress={() => setMenu(false)}>What you can build</Link><Link href="#our-story" onPress={() => setMenu(false)}>Our story</Link><Link href="#ai-workshops" onPress={() => setMenu(false)}>AI Workshops</Link><Link href="#ai-safety" onPress={() => setMenu(false)}>AI Safety</Link>
      </nav>
      <div className="vl-header-actions"><Button isIconOnly variant="ghost" aria-label={dark ? "Use light theme" : "Use dark theme"} onPress={toggleTheme}>{dark ? <Sun size={18} /> : <Moon size={18} />}</Button><Button className="vl-start" onPress={() => openStudio()}>Open studio <ArrowUpRight size={15} /></Button><Button isIconOnly variant="ghost" className="vl-menu-toggle" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} aria-controls="landing-main-navigation" onPress={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</Button></div>
    </header>
    <main>
      <section className="vl-hero">
        <div className="vl-hero-copy"><span className="vl-eyebrow"><span className="vl-dot" /> FOR CURIOUS MINDS. OF EVERY AGE.</span><h1>Your next idea.<br />Their first creation.<br /><em>Build it together.</em></h1><p>A real app studio for parents, kids, and the things you’ve always wanted to make. Talk it through with Samantha, shape it with AI, and turn “what if” into something you can use.</p><div className="vl-hero-actions"><Button size="lg" onPress={() => openStudio()}>Let’s make something <ArrowRight size={18} /></Button><Link href="#how-it-works"><Play size={14} /> See how it works</Link></div><div className="vl-hero-note"><Check size={15} /> A dad’s self-funded project. Free platform, bring your own AI keys.</div></div>
        <div className="vl-studio-illustration" aria-label="Illustration of an app-building conversation"><div className="vl-window-bar"><span /><span /><span /><small>family-workspace / a little big idea</small></div><div className="vl-illustration-body"><div className="vl-mock-sidebar"><div className="vl-mini-brand"><Code2 size={20} /></div><Layers3 size={17} /><Plus size={17} /><Mic size={17} /></div><div className="vl-mock-content"><div className="vl-mock-chat"><span className="vl-avatar">A</span><p>What if we made a garden where every flower plays a note?</p></div><div className="vl-mock-answer"><Sparkles size={16} /><p>Let’s make it ours. A few flowers, a little music, and a whole lot of possibility.</p></div><div className="vl-garden"><span className="vl-note n1">♪</span><span className="vl-note n2">♫</span><div className="vl-flower f1">✿</div><div className="vl-flower f2">✿</div><div className="vl-flower f3">✿</div><div className="vl-garden-label">Our musical garden <Heart size={13} /></div></div><div className="vl-mock-input"><span>Now, what if we added…</span><span className="vl-mock-send"><ArrowRight size={14} /></span></div></div></div><div className="vl-illustration-caption">One conversation. So many possibilities. <span>Illustrative preview</span></div></div>
      </section>
      <section className="vl-section vl-family-gallery" aria-labelledby="family-gallery-title">
        <div className="vl-section-heading"><div><span className="vl-eyebrow">SAME DESK. SHARED DISCOVERIES.</span><h2 id="family-gallery-title">A little less watching.<br /><em>A lot more making.</em></h2></div><p>Sit side by side. Let them lead with an idea. Work through the next step together.</p></div>
        <div className="vl-family-grid">
          <figure><Image src="/images/families/father-son-building.png" alt="AI illustration of a father and son building an app together at the same desk" width={1536} height={1024} sizes="(max-width: 680px) 100vw, 50vw" /><figcaption><strong>Their idea. Your encouragement.</strong><span>Turn a curious question into something you can try together.</span></figcaption></figure>
          <figure><Image src="/images/families/mother-daughter-building.png" alt="AI illustration of a mother and daughter sketching and building an app side by side" width={1536} height={1024} sizes="(max-width: 680px) 100vw, 50vw" /><figcaption><strong>Sketch it. Build it. Make it yours.</strong><span>A shared desk can become a place for both of you to learn.</span></figcaption></figure>
        </div>
        <p className="vl-image-disclosure">AI-generated illustrative scenes, not photographs of users or product screenshots.</p>
      </section>
      <section className="vl-section vl-alternatives" aria-labelledby="alternatives-title"><span className="vl-eyebrow">IF YOU’VE SEEN WHAT VIBE CODING CAN DO</span><h2 id="alternatives-title">That spark. A place to share it.</h2><p>Inspired by the possibilities of AI app builders like these. VibeKidding brings that creative spirit to a studio you can explore alongside your kids, and keep using for your own ideas.</p><div className="vl-logo-grid">{alternatives.map(brand => <Link key={brand.name} href={brand.url} target="_blank" rel="noopener noreferrer" className="vl-brand-card"><Image src={brand.icon} alt="" width={32} height={32} unoptimized />{brand.name}<ArrowUpRight size={12} /></Link>)}</div><small>Independent project. Names and logos belong to their respective owners; no affiliation or endorsement.</small></section>
      <section className="vl-section" id="possibilities"><div className="vl-section-heading"><div><span className="vl-eyebrow">AN OPEN CANVAS</span><h2>Small ideas.<br />Surprisingly useful things.</h2></div><p>There’s no “kids mode” in the code generator. A game, a family tool, a business page. The conversation decides what you build.</p></div><div className="vl-idea-grid">{ideas.map((idea, index) => <Card key={idea} className="vl-idea-card"><Card.Content><span className="vl-idea-number">0{index + 1}</span><h3>{idea}</h3><p>{["Make everyday routines something you can shape together.","Give your project a home. Make the details feel like you.","Start with a rule, invite a player, and see what happens.","Keep the things that matter organized, in your own way."][index]}</p><Button variant="ghost" onPress={() => openStudio(idea)}>Start with this idea <ArrowUpRight size={16} /></Button></Card.Content></Card>)}</div></section>
      <section className="vl-section vl-process" id="how-it-works"><span className="vl-eyebrow">FROM CONVERSATION TO CREATION</span><h2>You bring the “what if.”<br />We help with the “how.”</h2><div className="vl-process-grid">{[["01", "Talk it through", "Describe your idea in your own words. Type, use device dictation, or talk to Samantha when voice is connected."],["02", "Make it real", "AI creates the project files. Preview the result, inspect the code, and try it for yourself."],["03", "Keep making it yours", "Ask for a change, save a new version, and build on what works. Learning is part of making."]].map(([number,title,copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
      <section className="vl-section vl-story" id="our-story"><div className="vl-founder"><Image src="/founder/ashs-dad.jpg" alt="Aemal, Ash’s dad and the creator of VibeKidding" width={360} height={440} /><span>Built by a dad.<br />Inspired by Ash.</span></div><div><span className="vl-eyebrow">THE STORY BEHIND VIBEKIDDING</span><h2>It started with my son.<br /><em>It became something to share.</em></h2><p>I’m Aemal, a software engineer and Ash’s dad. I started VibeKidding because I wanted my son to experience technology as something he could create, not just consume.</p><p>So I began building the kind of AI coding studio we could use together. Along the way, I realized I wanted it for my own ideas, too: landing pages, little tools, and those projects that never quite leave the notebook.</p><p><strong>VibeKidding is not a business.</strong> It’s a fun project I built with my son and share freely with fellow parents. I finance it myself and pay for the hosting and platform costs.</p><p>You bring your own OpenAI or Anthropic API key, and your own ElevenLabs key if you want voice. Your AI usage is billed directly by those providers to your own accounts. That keeps this little family project affordable to share.</p><Link href="https://aemalsayer.com/" target="_blank" rel="noopener noreferrer">Meet Aemal <ArrowUpRight size={16} /></Link><FirstVersionGallery /></div></section>
      <section className="vl-section vl-parent-vision" id="ai-safety" aria-labelledby="parent-vision-title">
        <span className="vl-eyebrow"><ShieldCheck size={16} /> PARENTAL CONTROLS &amp; PRIVACY</span>
        <div className="vl-section-heading"><div><h2 id="parent-vision-title">Room to explore.<br /><em>A parent still in the picture.</em></h2></div><p>The direction we’re building toward: understand what’s happening, get a heads-up, and pause access when your child needs you.</p></div>
        <div className="vl-roadmap-notice"><strong>Planned features, not available in this version.</strong><p>Phone insights, suspicious-activity push alerts and remote locking are the parental-controls roadmap. The scenes below illustrate that vision. Today, build alongside your child and review generated apps together.</p></div>
        <div className="vl-family-grid vl-parent-scenes">
          <figure><Image src="/images/families/child-needs-guidance.png" alt="AI illustration of a child alone at a desk, looking uncertain about something on a laptop" width={1536} height={1024} sizes="(max-width: 680px) 100vw, 50vw" /><figcaption><strong>01 · Notice when guidance might help</strong><span>Planned guardrails would flag activity for a parent to review. No system can guarantee that every concern will be detected.</span></figcaption></figure>
          <figure><Image src="/images/families/parent-parked-phone.png" alt="AI illustration of a father safely parked in a parking bay, reviewing a parental notification on his phone" width={1536} height={1024} sizes="(max-width: 680px) 100vw, 50vw" /><figcaption><strong>02 · Review, then pause from your phone</strong><span>A planned parent view would let you check the context and lock the child’s session remotely. Pictured safely parked before using the phone.</span></figcaption></figure>
        </div>
        <div className="vl-control-grid">
          <Card><Card.Content><Smartphone size={22} /><h3>Insights on your phone</h3><p>Planned: see recent activity and the context behind a concern, wherever you check in.</p></Card.Content></Card>
          <Card><Card.Content><Bell size={22} /><h3>A heads-up when it matters</h3><p>Planned: push notifications when activity is flagged for your attention.</p></Card.Content></Card>
          <Card><Card.Content><LockKeyhole size={22} /><h3>Pause and talk it through</h3><p>Planned: remotely lock access, then decide together what happens next.</p></Card.Content></Card>
        </div>
        <div className="vl-privacy-today"><ShieldCheck size={25} /><div><h3>Privacy today: know where things go.</h3><p>Your project files and data live on the server running this studio. Saved provider keys are encrypted on that server. AI requests go to the provider you connect; Samantha voice goes to ElevenLabs. Bring-your-own keys means your provider account and billing, not that the platform stores nothing. Provider retention settings still apply.</p></div></div>
        <p className="vl-image-disclosure">AI-generated concept scenes. Phone screens are illustrative, not a demonstration of working alerts or remote locking.</p>
      </section>
      <section className="vl-section vl-workshops" id="ai-workshops" aria-labelledby="workshop-title">
        <div className="vl-workshop-intro">
          <span className="vl-eyebrow">A LITTLE FAMILY PROJECT. A SHAMELESS WORKSHOP PITCH.</span>
          <h2 id="workshop-title">Want to build something<br /><em>more ambitious?</em></h2>
          <p>If building with your kids has sparked an idea of your own, I also teach parents and other curious makers how to build serious AI applications.</p>
          <p><strong>My AI workshops are my business.</strong> VibeKidding is a project I share for fun, and an example of the kind of software you can learn to build. This is my shameless invitation to come and learn with me.</p>
          <Link className="button button--primary vl-workshop-cta" href="https://aiworkshops.aemalsayer.com/" target="_blank" rel="noopener noreferrer">Explore Aemal’s AI workshops <ArrowUpRight size={18} /></Link>
          <p className="vl-workshop-note">Explore the formats, upcoming dates and locations on the workshop website. You don’t need to book a workshop to use VibeKidding.</p>
        </div>
        <div className="vl-workshop-formats">
          {[
            ["01", "Build together in Berlin", "Bring your laptop and your idea. Learn hands-on how to connect an interface, a database and AI into a working application."],
            ["02", "Join from home", "Online AI workshops for people who want practical guidance, wherever they are learning from."],
            ["03", "Learn around the world", "In-person and team workshop formats beyond Berlin. Check the workshop site for announced cities and availability."],
          ].map(([number, title, copy]) => <Card key={number} className="vl-workshop-card"><Card.Content><span>{number}</span><div><h3>{title}</h3><p>{copy}</p></div></Card.Content></Card>)}
        </div>
      </section>
      <section className="vl-section vl-final"><Sparkles size={28} /><h2>What will you make together?</h2><p>The next idea doesn’t have to be big. It just has to be yours.</p><Button size="lg" onPress={() => openStudio()}>Open your studio <ArrowRight size={18} /></Button></section>
    </main><footer className="vl-footer"><span>VibeKidding · Self-funded by Aemal. Shared with fellow parents.</span><div><Link href="#our-story">Our story</Link><Link href="#ai-workshops">AI Workshops</Link><Link href="#ai-safety">AI Safety</Link><Link href="/studio">Studio</Link></div></footer>
  </div>;
}
