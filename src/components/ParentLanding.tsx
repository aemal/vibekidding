"use client";
import {
  ArrowUpRight,
  BookOpen,
  Globe2,
  Heart,
  Lightbulb,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { FamilyStory } from "@/components/FamilyStory";
import { SamanthaShowcase } from "@/components/SamanthaShowcase";

const faqs = [
  [
    "Does my child need to know how to code?",
    "No coding vocabulary is needed to describe an idea. Start with something small, try the result together, and ask for one change at a time. Looking at how a project works can become part of the learning.",
  ],
  [
    "Can we build in our home language?",
    "You can type an idea in your own language and ask for the project’s text in that language too. The examples here show how to begin. Results depend on the approved AI model and may need corrections, especially for less widely represented languages. The studio menus are currently in English.",
  ],
  [
    "Can my child talk instead of typing?",
    "Samantha is the planned conversational project helper. You can hear her prerecorded greetings on this page now. Live conversations are awaiting agent, consent and spending setup. Typed project ideas are the starting point once your account is enabled.",
  ],
  [
    "Who creates the account? Is there an age requirement?",
    "A parent or guardian creates and verifies the account and requests supervised access. Child eligibility and consent must be reviewed before access is approved; there is not yet a published age range for this pilot. An email code alone does not verify age or parental authority.",
  ],
  [
    "Will our projects be public?",
    "Drafts stay private in the studio. A builder can request sharing, and an administrator reviews the project before it receives a public link. Use a nickname and leave out real names, school details, photos and contact information.",
  ],
  [
    "How do credits work?",
    "An administrator assigns credits and approves which AI models an account can use. AI building uses those credits, with spending limits enforced by the service. When you need more, request a top-up. Public subscription pricing has not been announced.",
  ],
  [
    "Is AI always right, or always appropriate?",
    "No. AI can misunderstand an idea or create something that does not work. A grown-up should supervise, check the output and help revise it. Moderation and review add safeguards, but do not replace adult judgment.",
  ],
  [
    "What can we try right now?",
    "Explore the example prompts and language directory on this page without an account. Live building needs a configured, approved account. Sign-in and voice availability depend on the pilot setup; this page does not run a paid AI demo.",
  ],
];
export function ParentLanding({ onIdea }: { onIdea: (idea: string) => void }) {
  return (
    <div className="parent-landing">
      <div className="parent-strip">
        <span>
          <Globe2 size={18} /> Ideas in your own words
        </span>
        <span>
          <Lightbulb size={18} /> Create, test, improve
        </span>
        <span>
          <Heart size={18} /> Built together with a grown-up
        </span>
      </div>
      <section className="parent-section" id="how-it-works">
        <div className="parent-heading">
          <span className="eyebrow">FROM “WHAT IF?” TO “I MADE THIS”</span>
          <h2>
            Turn a little curiosity
            <br />
            into something <em>they can create.</em>
          </h2>
          <p>
            Give screen time a different starting point: your child’s own idea.
            A tiny project is enough to begin exploring how things work.
          </p>
        </div>
        <div className="parent-steps">
          {[
            [
              "01",
              "Imagine it.",
              "A musical garden. A story with two endings. A little app that helps remember plant-watering day. Start with something your child cares about.",
            ],
            [
              "02",
              "Try it. Change it.",
              "Describe the idea in familiar words. Explore the result together. “What if the flowers changed colour?” is the beginning of the next version.",
            ],
            [
              "03",
              "Make it their own.",
              "Choose the words, colours and rules. Keep experimenting, then ask for a grown-up’s review when the project is ready to share.",
            ],
          ].map(([n, title, copy]) => (
            <article key={n}>
              <span>{n}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <div id="languages">
        <SamanthaShowcase onIdea={onIdea} />
      </div>
      <FamilyStory />
      <section className="parent-section parent-benefits" id="for-parents">
        <div className="parent-heading">
          <span className="eyebrow">MORE THAN A FINISHED PROJECT</span>
          <h2>
            Room to wonder.
            <br />
            <em>Reasons to keep trying.</em>
          </h2>
          <p>
            You don’t need to be a programmer to join in. Ask what they want to
            change, what surprised them, and what they might try next.
          </p>
        </div>
        <div className="parent-benefit-grid">
          {[
            {
              Icon: Lightbulb,
              title: "Practise explaining an idea.",
              text: "Turn “I wish there was…” into a clear request. Break a big idea into smaller pieces and decide what matters first.",
            },
            {
              Icon: Sparkles,
              title: "Make mistakes useful.",
              text: "When a button does the wrong thing, investigate together. Change one thing, try again, and notice the difference.",
            },
            {
              Icon: BookOpen,
              title: "Connect it to their world.",
              text: "Make a vocabulary game, a story inspired by a favourite book, or a science explorer. Their interests set the direction.",
            },
            {
              Icon: Heart,
              title: "Have something to show you.",
              text: "Ask them to explain what they made and why. The conversation around the project matters as much as the project itself.",
            },
          ].map(({ Icon, title, text }) => (
            <article key={title}>
              <Icon size={25} />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="parent-trust" id="ai-safety">
        <div>
          <ShieldCheck size={32} />
          <span className="eyebrow">A GROWN-UP STAYS IN THE LOOP</span>
          <h2>
            A creative space.
            <br />
            With thoughtful boundaries.
          </h2>
          <p>
            Children bring the ideas. Adults help with access, reviewing the
            output and deciding what is ready to share.
          </p>
          <a href="#get-started">
            Set up together <ArrowUpRight size={16} />
          </a>
        </div>
        <ul>
          {[
            [
              "Approval before access",
              "A guardian verifies their email and requests access. Administrator approval and consent review come before building.",
            ],
            [
              "Draft first. Share after review.",
              "Projects begin privately. Public sharing requires an administrator to review the project.",
            ],
            [
              "Credits with spending limits",
              "Assigned credits and service limits bound AI usage. More credits can be requested when needed.",
            ],
            [
              "Keep personal details out",
              "Use nicknames. Help your child leave names, addresses, school details and contact information out of prompts and projects.",
            ],
          ].map(([title, copy]) => (
            <li key={title}>
              <ShieldCheck size={18} />
              <div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="parent-section parent-faq" id="questions">
        <div className="parent-heading">
          <span className="eyebrow">GOOD QUESTIONS, GROWN-UPS</span>
          <h2>
            A little clarity
            <br />
            <em>before the first creation.</em>
          </h2>
        </div>
        <div>
          {faqs.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="parent-invitation">
        <span className="eyebrow">START SMALL. SEE WHERE IT GOES.</span>
        <h2>
          The next “look what I made!”
          <br />
          could start with one little idea.
        </h2>
        <p>
          Choose a nickname, bring a grown-up, and request access to your
          family’s project studio.
        </p>
        <a className="parent-cta" href="#get-started">
          Let’s set up together <ArrowUpRight size={18} />
        </a>
        <small>
          Supervised pilot · Approval required · No public pricing announced
        </small>
      </section>
    </div>
  );
}
