'use client';
import { useState } from 'react';
import Image from 'next/image';
import {
  ArrowDown,
  ArrowUpRight,
  ChevronRight,
  Code2,
  Globe,
  LockKeyhole,
  Play,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Mascot,
  Wordmark,
} from '@/components/product/Product';
function Github({ size = 20 }: { size?: number }) {
  return (
    <Image
      src="/brands/github.svg"
      alt=""
      width={size}
      height={size}
      unoptimized
    />
  );
}
import { Creator } from '@/components/product/Creator';
const REPO = 'https://github.com/PrisacariuRobert/openbot';
const examples = [
  {
    id: 'team',
    label: 'Your team',
    ask: 'Turn our launch notes into a plan we can use.',
    reply:
      'I’ll connect the decisions, owners and open questions. Pixel can review the technical work.',
    file: 'Launch plan.md',
    title: 'Less coordinating. More moving forward.',
    body: 'Keep research, decisions and deliverables in one conversation. Teammates can consult each other and bring back a shared answer.',
  },
  {
    id: 'you',
    label: 'Your day',
    ask: 'Help me get ready for the week ahead.',
    reply:
      'I’ll work through the calendar and notes you’ve made available, then bring you a plan to review.',
    file: 'Week ahead.md',
    title: 'A little less on your mind.',
    body: 'Prepare for meetings, turn notes into next steps and keep regular work moving with routines. You choose what your teammate can access.',
  },
  {
    id: 'build',
    label: 'Your next idea',
    ask: 'Find the bug, make a fix, and show me what changed.',
    reply:
      'I’ll reproduce it in an isolated worktree, make a focused change, and run the checks.',
    file: 'Fix & verification.md',
    title: 'From “what if” to something real.',
    body: 'Give a coding teammate a project. Review its changes and test evidence before deciding what to merge. Your own checkout stays separate.',
  },
];
function ProductView({ example = 0 }: { example?: number }) {
  const item = examples[example];
  return (
    <div className="product-view actual-product-view">
      <Image src={`/actual-ui/${['team', 'day', 'build'][example]}.webp`} width={2880} height={1780} alt={`Actual OpenBot interface with a sample conversation: ${item.ask}`} unoptimized />
    </div>
  );
}
function YourChoice() {
  return <div className="your-choice" aria-label="Choose the AI behind your teammates">
    <div className="choice-characters" aria-hidden="true">
      <Mascot name="Nova" size={100} id="choice-nova" />
      <Mascot name="Pixel" size={100} id="choice-pixel" />
      <Mascot name="Scout" size={100} id="choice-scout" />
    </div>
    <p>Different teammates.<br /><strong>Your choice of AI.</strong></p>
    <span>Supported subscriptions · API keys · Local models</span>
  </div>;
}
export default function Home() {
  const [filmOpen, setFilmOpen] = useState(false);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-nav">
        <a href="#main" aria-label="OpenBot home">
          <Wordmark size={25} />
        </a>
        <nav aria-label="Main navigation">
          <a href="#possibilities">Possibilities</a>
          <a href="#yours">Made yours</a>
          <a href={REPO} className="inline-link">
            <Github size={17} />
            Source
          </a>
        </nav>
        <a className="nav-cta" href="#get-openbot">
          Get OpenBot <ArrowUpRight size={17} />
        </a>
      </header>
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">YOUR IDEAS. SOME EXTRA HANDS.</p>
            <h1 id="hero-title">
              A little more
              <br />
              <span>possible.</span>
            </h1>
            <p className="hero-summary">
              Meet your open-source AI teammates.
              <br />A conversation that can turn into real work.
            </p>
            <a href="#your-ai" className="hero-ai">Your subscriptions. Your choice of models. <ArrowUpRight size={16} /></a>
            <div className="hero-actions">
              <a className="primary-link" href="#get-openbot">
                Meet OpenBot <ArrowUpRight size={18} />
              </a>
              <Button
                variant="ghost"
                className="film-button"
                onClick={() => setFilmOpen(true)}
              >
                Watch the film{' '}
                <span className="play-ring">
                  <Play size={13} fill="currentColor" />
                </span>
              </Button>
            </div>
          </div>
          <div className="hero-stage">
            <div
              className="orbital-character character-left"
              aria-hidden="true"
            >
              <Mascot name="Nova" size={190} id="hero-nova" />
            </div>
            <div
              className="orbital-character character-right"
              aria-hidden="true"
            >
              <Mascot name="Scout" size={156} id="hero-scout" />
            </div>
            <div className="hero-window">
              <ProductView />
            </div>
            <div className="tiny-pixel" aria-hidden="true">
              <Mascot name="Pixel" size={96} id="hero-pixel" />
            </div>
          </div>
          <div className="hero-caption">
            <span>The real OpenBot interface. A sample workspace.</span>
            <a href="#possibilities" aria-label="Explore OpenBot">
              <ArrowDown size={19} />
            </a>
          </div>
        </section>
        <section id="possibilities" className="possibilities section-wrap">
          <div className="section-heading">
            <p className="eyebrow">START WITH A CONVERSATION</p>
            <h2>
              Big plans.
              <br />
              Small beginnings.
            </h2>
            <p>
              Tell OpenBot what you want to make happen.
              <br />
              Build a team around the work—not the other way around.
            </p>
          </div>
          <Tabs defaultValue="team" className="example-tabs">
            <TabsList variant="line" aria-label="Ways to use OpenBot">
              {examples.map((item) => (
                <TabsTrigger key={item.id} value={item.id}>
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {examples.map((item, index) => (
              <TabsContent key={item.id} value={item.id}>
                <div className="example-layout">
                  <div className="example-copy">
                    <span className="section-number">0{index + 1}</span>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                    <span className="quiet-label">Real interface · sample workspace</span>
                  </div>
                  <ProductView example={index} />
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </section>
        <section className="control-section">
          <div className="section-wrap control-layout">
            <div className="section-heading">
              <p className="eyebrow">CAPABLE. WITH BOUNDARIES.</p>
              <h2>
                An extra hand.
                <br />
                You keep the say.
              </h2>
              <p>
                Connect the tools you need. Sign in when asked. Review sensitive
                actions before they happen.
              </p>
              <div className="principles">
                <div>
                  <Globe size={23} />
                  <span>
                    <strong>Your working world.</strong>
                    <br />
                    Browser sessions, connected apps and approved local tools.
                  </span>
                </div>
                <div>
                  <ShieldCheck size={23} />
                  <span>
                    <strong>Your decisions.</strong>
                    <br />
                    Review a plan before sending, publishing or making a
                    sensitive change.
                  </span>
                </div>
                <div>
                  <Code2 size={23} />
                  <span>
                    <strong>Room to grow.</strong>
                    <br />
                    Skills, MCP tools and approval-gated tool building extend
                    what a teammate can do.
                  </span>
                </div>
              </div>
            </div>
            <div className="approval-moment" aria-label="Example of an action waiting for your approval">
              <Mascot name="Pixel" size={86} id="approval-pixel" />
              <p>I’ve prepared the next step.<br />Ready when you are.</p>
              <span><ShieldCheck size={19} /> Waiting for your approval</span>
            </div>
          </div>
        </section>
        <section id="your-ai" className="section-wrap ai-section" aria-labelledby="ai-title">
          <div className="section-heading">
            <p className="eyebrow">YOUR AI. ON YOUR TERMS.</p>
            <h2 id="ai-title">Bring your subscriptions.<br />Choose your models.</h2>
            <p>Your team shouldn’t tie you to one AI provider. Connect the accounts you already use, then choose a model for each teammate.</p>
          </div>
          <YourChoice />
          <p className="ai-terms">Supported providers and plans only. Provider terms, model availability and usage limits apply. Subscriptions do not automatically include API access; OpenBot supplies no model allowance.</p>
        </section>
        <section id="yours" className="section-wrap yours-section">
          <div className="section-heading">
            <p className="eyebrow">PERSONALITY INCLUDED</p>
            <h2>
              Not just any team.
              <br />
              Your team.
            </h2>
          </div>
          <div className="yours-layout">
            <Creator />
            <div className="yours-copy">
              {[
                [
                  'Make every teammate yours.',
                  'Create a name, role and appearance around the work. Choose its provider and model independently—these characters are examples, not a fixed team.',
                ],
                [
                  'Teach it your way.',
                  'Keep useful methods as skills. Set up routines for work you want to happen again. Give each teammate a purpose and a personality.',
                ],
                [
                  'Keep it open.',
                  'Inspect the code. Adapt the workflow. Share what you build. OpenBot’s source is yours to explore under the MIT license.',
                ],
              ].map(([title, body], i) => (
                <article key={title}>
                  <span>0{i + 1}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className="film-strip section-wrap">
          <button
            className="film-poster"
            onClick={() => setFilmOpen(true)}
            aria-label="Play the OpenBot introduction film"
          >
            <div className="poster-mascots" aria-hidden="true">
              <Mascot name="Nova" size={125} id="poster-nova" />
              <Mascot name="Pixel" size={125} id="poster-pixel" />
              <Mascot name="Scout" size={125} id="poster-scout" />
            </div>
            <span className="poster-copy">
              See what comes
              <br />
              of a conversation.
            </span>
            <span className="poster-play">
              <Play size={22} fill="currentColor" /> Watch the film
            </span>
          </button>
        </section>
        <section id="get-openbot" className="get-section section-wrap">
          <div>
            <p className="eyebrow">OPEN SOURCE. OPEN POSSIBILITIES.</p>
            <h2>
              Make room
              <br />
              for a little more.
            </h2>
          </div>
          <div className="get-copy">
            <p>
              We’re preparing OpenBot for its first public beta, starting with
              Mac. The iPhone app is a preview.
            </p>
            <div className="download-notice">
              <LockKeyhole size={21} />
              <div>
                <strong>App downloads are coming.</strong>
                <p>
                  We’ll add the Mac download here when the beta is ready.
                  Nothing to install from this page yet.
                </p>
              </div>
            </div>
            <a className="primary-link" href={REPO}>
              <Github size={20} />
              Explore the source <ArrowUpRight size={18} />
            </a>
            <a className="text-link" href={`${REPO}/blob/main/README.md`}>
              Developer setup guide <ChevronRight size={18} />
            </a>
          </div>
        </section>
        <section className="faq section-wrap" aria-label="A few useful details">
          <h3>A few useful details.</h3>
          {[
            [
              'Is OpenBot ready for everyone?',
              'Not yet. This introduces the open-source project. We’re preparing a Mac-first beta; clean installation, account workflows and release signing still need release checks.',
            ],
            [
              'Does it work with every AI subscription?',
              'No. OpenBot supports multiple provider paths, but subscriptions are not interchangeable with API access. Available models, login methods, provider rules and usage limits depend on the connection you choose.',
            ],
            [
              'Where does the work happen?',
              'OpenBot is local-first. Its studio runs on your host computer. Content needed for a task may be sent to your selected model provider and connected services; local-first does not mean every request stays offline.',
            ],
            [
              'Can I use it away from my Mac?',
              'The iPhone companion and remote-access paths are being developed. Away access depends on a configured reachable host and relay. It is not presented here as a verified, no-setup release feature.',
            ],
            [
              'Are these real customer conversations?',
              'No. These are captures of the real OpenBot interface using a disposable sample workspace. They do not show private account information or establish an end-to-end workflow benchmark.',
            ],
          ].map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <Plus size={19} />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </section>
      </main>
      <footer className="site-footer section-wrap">
        <Wordmark size={23} />
        <p>
          An independent, open-source project.
          <br />A little more possible, together.
        </p>
        <div>
          <a href={`${REPO}/blob/main/LICENSE`}>MIT license</a>
          <a href={`${REPO}/issues`}>Contribute</a>
          <a href="#get-openbot">Release status</a>
        </div>
      </footer>
      <Dialog open={filmOpen} onOpenChange={setFilmOpen}>
        <DialogContent className="film-dialog">
          <DialogTitle>OpenBot — A little more possible</DialogTitle>
          <DialogDescription>
            A music-led walkthrough of OpenBot. Staged examples, based on the
            app’s conversations, panels and controls.
          </DialogDescription>
          {filmOpen && (
            <video
              controls
              playsInline
              preload="metadata"
              src="/media/openbot-introduction.mp4?v=20260908-connected-flow"
            >
              <track
                kind="captions"
                src="/media/openbot-introduction.vtt"
                srcLang="en"
                label="On-screen story"
              />
              <p>
                Your browser cannot play this video.{' '}
                <a
                  download
                  href="/media/openbot-introduction.mp4?v=20260908-connected-flow"
                >
                  Open the film
                </a>
                .
              </p>
            </video>
          )}
          <p className="film-note">
            Turn sound on for the original instrumental. No narration.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
