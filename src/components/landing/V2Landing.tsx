"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Button, Card, Link } from "@heroui/react";
import { ArrowRight, ArrowUpRight, Check, Code2, Heart, Layers3, Menu, Mic, Moon, Play, Plus, Sparkles, Sun, X } from "lucide-react";
import "@/app/v2-theme.css";
import "./landing.css";

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
        <Link href="#possibilities" onPress={() => setMenu(false)}>What you can build</Link><Link href="#our-story" onPress={() => setMenu(false)}>Our story</Link><Link href="#ai-safety" onPress={() => setMenu(false)}>AI Safety</Link>
      </nav>
      <div className="vl-header-actions"><Button isIconOnly variant="ghost" aria-label={dark ? "Use light theme" : "Use dark theme"} onPress={toggleTheme}>{dark ? <Sun size={18} /> : <Moon size={18} />}</Button><Button className="vl-start" onPress={() => openStudio()}>Open studio <ArrowUpRight size={15} /></Button><Button isIconOnly variant="ghost" className="vl-menu-toggle" aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} aria-controls="landing-main-navigation" onPress={() => setMenu(!menu)}>{menu ? <X /> : <Menu />}</Button></div>
    </header>
    <main>
      <section className="vl-hero">
        <div className="vl-hero-copy"><span className="vl-eyebrow"><span className="vl-dot" /> FOR CURIOUS MINDS. OF EVERY AGE.</span><h1>Your next idea.<br />Their first creation.<br /><em>Build it together.</em></h1><p>A real app studio for parents, kids, and the things you’ve always wanted to make. Talk it through with Samantha, shape it with AI, and turn “what if” into something you can use.</p><div className="vl-hero-actions"><Button size="lg" onPress={() => openStudio()}>Let’s make something <ArrowRight size={18} /></Button><Link href="#how-it-works"><Play size={14} /> See how it works</Link></div><div className="vl-hero-note"><Check size={15} /> Your ideas. Real project files. Room to grow.</div></div>
        <div className="vl-studio-illustration" aria-label="Illustration of an app-building conversation"><div className="vl-window-bar"><span /><span /><span /><small>family-workspace / a little big idea</small></div><div className="vl-illustration-body"><div className="vl-mock-sidebar"><div className="vl-mini-brand"><Code2 size={20} /></div><Layers3 size={17} /><Plus size={17} /><Mic size={17} /></div><div className="vl-mock-content"><div className="vl-mock-chat"><span className="vl-avatar">A</span><p>What if we made a garden where every flower plays a note?</p></div><div className="vl-mock-answer"><Sparkles size={16} /><p>Let’s make it ours. A few flowers, a little music, and a whole lot of possibility.</p></div><div className="vl-garden"><span className="vl-note n1">♪</span><span className="vl-note n2">♫</span><div className="vl-flower f1">✿</div><div className="vl-flower f2">✿</div><div className="vl-flower f3">✿</div><div className="vl-garden-label">Our musical garden <Heart size={13} /></div></div><div className="vl-mock-input"><span>Now, what if we added…</span><span className="vl-mock-send"><ArrowRight size={14} /></span></div></div></div><div className="vl-illustration-caption">One conversation. So many possibilities. <span>Illustrative preview</span></div></div>
      </section>
      <section className="vl-section vl-alternatives" aria-labelledby="alternatives-title"><span className="vl-eyebrow">IF YOU’VE SEEN WHAT VIBE CODING CAN DO</span><h2 id="alternatives-title">That spark. A place to share it.</h2><p>Inspired by the possibilities of AI app builders like these. VibeKidding brings that creative spirit to a studio you can explore alongside your kids—and keep using for your own ideas.</p><div className="vl-logo-grid">{alternatives.map(brand => <Link key={brand.name} href={brand.url} target="_blank" rel="noopener noreferrer" className="vl-brand-card"><Image src={brand.icon} alt="" width={32} height={32} unoptimized />{brand.name}<ArrowUpRight size={12} /></Link>)}</div><small>Independent project. Names and logos belong to their respective owners; no affiliation or endorsement.</small></section>
      <section className="vl-section" id="possibilities"><div className="vl-section-heading"><div><span className="vl-eyebrow">AN OPEN CANVAS</span><h2>Small ideas.<br />Surprisingly useful things.</h2></div><p>There’s no “kids mode” in the code generator. A game, a family tool, a business page—the conversation decides what you build.</p></div><div className="vl-idea-grid">{ideas.map((idea, index) => <Card key={idea} className="vl-idea-card"><Card.Content><span className="vl-idea-number">0{index + 1}</span><h3>{idea}</h3><p>{["Make everyday routines something you can shape together.","Give your project a home. Make the details feel like you.","Start with a rule, invite a player, and see what happens.","Keep the things that matter organized, in your own way."][index]}</p><Button variant="ghost" onPress={() => openStudio(idea)}>Start with this idea <ArrowUpRight size={16} /></Button></Card.Content></Card>)}</div></section>
      <section className="vl-section vl-process" id="how-it-works"><span className="vl-eyebrow">FROM CONVERSATION TO CREATION</span><h2>You bring the “what if.”<br />We help with the “how.”</h2><div className="vl-process-grid">{[["01", "Talk it through", "Describe your idea in your own words. Type, use device dictation, or talk to Samantha when voice is connected."],["02", "Make it real", "AI creates the project files. Preview the result, inspect the code, and try it for yourself."],["03", "Keep making it yours", "Ask for a change, save a new version, and build on what works. Learning is part of making."]].map(([number,title,copy]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></article>)}</div></section>
      <section className="vl-section vl-story" id="our-story"><div className="vl-founder"><Image src="/founder/ashs-dad.jpg" alt="Aemal, Ash’s dad and the creator of VibeKidding" width={360} height={440} /><span>Built by a dad.<br />Inspired by Ash.</span></div><div><span className="vl-eyebrow">IT STARTED WITH MY SON</span><h2>I wanted Ash to build.<br /><em>Then I wanted in, too.</em></h2><p>I’m Aemal, a software engineer and Ash’s dad. I started VibeKidding because I wanted my son to experience technology as something he could create—not just consume.</p><p>So I began building the kind of AI coding studio we could use together. Along the way, I realized I wanted it for my own ideas, too: landing pages, little tools, and those projects that never quite leave the notebook.</p><p>This is that space. Serious about what you can make. Welcoming enough to begin together.</p><Link href="https://aemalsayer.com/" target="_blank" rel="noopener noreferrer">Meet Aemal <ArrowUpRight size={16} /></Link></div></section>
      <section className="vl-section vl-safety" id="ai-safety"><div><span className="vl-eyebrow">PARENTS IN THE PICTURE</span><h2>Build alongside them.</h2><p>Ask questions. Test the result. Talk about what to share. VibeKidding is designed around families creating together, with adults involved in the process.</p></div><div className="vl-safety-details"><h3>An early studio, with a clear direction.</h3><p>This first self-hosted version uses a simple account login. Expanded parental controls, sharing approvals, and usage policies are planned; they are not a substitute for supervision today.</p><p>AI can make mistakes. Review generated apps before sharing them or using them with personal information.</p><Button variant="secondary" onPress={() => openStudio()}>Explore together <ArrowRight size={16} /></Button></div></section>
      <section className="vl-section vl-final"><Sparkles size={28} /><h2>What will you make together?</h2><p>The next idea doesn’t have to be big. It just has to be yours.</p><Button size="lg" onPress={() => openStudio()}>Open your studio <ArrowRight size={18} /></Button></section>
    </main><footer className="vl-footer"><span>VibeKidding · Made for making, together.</span><div><Link href="#our-story">Our story</Link><Link href="#ai-safety">AI Safety</Link><Link href="/studio">Studio</Link></div></footer>
  </div>;
}
