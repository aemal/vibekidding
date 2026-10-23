import Image from "next/image";
import Link from "next/link";
import {
  Heart,
  ShieldCheck,
  LockKeyhole,
  Mail,
  Hand,
  BookOpen,
} from "lucide-react";
export function FamilyStory() {
  return (
    <>
      <section className="ash-story" id="our-story">
        <div className="founder-photo">
          <Image
            src="/founder/ashs-dad.jpg"
            alt="Ash’s dad, the creator of this studio"
            width={360}
            height={440}
          />
          <span>
            Made by a dad.
            <br />
            For a curious kid. ♥
          </span>
        </div>
        <div>
          <span className="eyebrow">IT STARTED WITH ASH</span>
          <h2>
            For my eight-year-old son.
            <br />
            <em>And the things we’ll make together.</em>
          </h2>
          <p>
            “I’m building this for my son, Ash. I want him to discover that
            technology is something he can create with - not just something he
            watches.”
          </p>
          <p>
            I’ve spent the past 10 years building AI applications, four years
            building AI agents, and the past year building the systems that help
            those agents work reliably. Samantha has been part of that journey
            for four years, across different settings.
          </p>
          <p>
            Now I’m bringing that experience into a small creative studio for
            our kids, with us parents beside them. A place to ask questions, try
            ideas, make mistakes and learn together.
          </p>
          <div className="founder-signature">
            - Ash’s dad <Heart size={16} />
          </div>
          <p>
            <a
              href="https://aemalsayer.com/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Get to know Aemal ↗
            </a>
          </p>
          <div className="family-invite">
            <strong>
              A small circle of families. An invitation to create.
            </strong>
            <p>
              This is an invite-only, non-commercial project shared with a few
              selected families. Participation is intended to cover API usage,
              not generate profit. Access and credits are managed personally;
              this isn’t an open, unsupervised children’s app.
            </p>
          </div>
        </div>
      </section>
      <section className="family-privacy" id="privacy">
        <div className="privacy-heading">
          <span className="eyebrow">OUR MOST IMPORTANT RULE</span>
          <h2>
            Kids don’t use this alone.
            <br />
            <em>We build with a grown-up.</em>
          </h2>
          <p>
            Stay beside your child, talk about the ideas, and review what the AI
            makes. Guardrails help us pause and check. They do not replace you.
          </p>
        </div>
        <div className="guard-loop-illustration">
          <div className="guard-buddy" aria-hidden="true">
            <span className="buddy-antenna">✦</span>
            <div className="buddy-face">
              <i />
              <i />
              <b />
            </div>
            <ShieldCheck size={38} />
            <span className="buddy-feet">● ●</span>
          </div>
          <div>
            <span className="mini-label">OUR LITTLE GUARDLOOP HELPER</span>
            <h3>“Let’s check with your grown-up.”</h3>
            <p>
              If something needs attention, the kindest next step is a pause - not
              a punishment.
            </p>
            <div className="guard-loop-steps">
              <span>1. Your idea</span>
              <span>2. Safety check</span>
              <span>3. Build & check</span>
              <span>4. Review together</span>
            </div>
            <small>
              Illustration of the safety flow · not a live safety verdict
            </small>
          </div>
        </div>
        <div className="privacy-grid">
          {[
            {
              Icon: Hand,
              title: "A parent starts each session.",
              copy: "A fresh email code unlocks parent controls. A parent can begin a 30-minute supervised session or pause building at any time. The app cannot tell whether an adult is physically present.",
            },
            {
              Icon: ShieldCheck,
              title: "Check before building. Check before showing.",
              copy: "The server checks typed requests and AI results. Flagged, uncertain or unavailable checks pause the request. A parent must review and restart the session.",
            },
            {
              Icon: BookOpen,
              title: "History you can review together.",
              copy: "Typed requests, generated results and safety decisions are saved for the guardian to review behind a fresh email-code unlock. Tell your child that this history is visible to you.",
            },
            {
              Icon: Mail,
              title: "An alert, without a transcript in your inbox.",
              copy: "Flagged activity queues an email to the guardian’s verified address. The message asks you to review the conversation privately. Delivery status is visible in Parent controls.",
            },
            {
              Icon: LockKeyhole,
              title: "Personal details stay out of projects.",
              copy: "Use nicknames. Don’t enter addresses, schools, contact details, passwords or private photos. Prompts are processed by configured AI and safety providers; this is not an offline or zero-retention system.",
            },
            {
              Icon: Heart,
              title: "Family rules with a firm foundation.",
              copy: "Parents can add restrictions such as “only drawing projects today.” Baseline safeguards cannot be switched off. AI checks can still miss things or flag harmless requests, so adult judgment matters.",
            },
          ].map(({ Icon, title, copy }) => (
            <article key={title}>
              <Icon size={24} />
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
        <div className="privacy-bottom">
          <p>
            Private drafts stay private until sharing is requested and reviewed.
            Saved activity remains until a parent deletes it; deleting it does
            not erase provider records. Live voice remains disabled while its
            safety and spending controls are completed.
          </p>
          <Link href="/parents">Open parent controls →</Link>
        </div>
      </section>
    </>
  );
}
