import type { Metadata } from "next";
import Link from "next/link";
import { Show } from "@clerk/nextjs";

export const metadata: Metadata = {
  title: "AetherHost",
  description:
    "Hosting desk for digital agencies. Put WordPress, Node, and Python client sites online, and run the AI that goes with that work, inside the plan you paid for.",
};

function AccountLink({
  className,
  guestHref,
  guestLabel,
  memberHref,
  memberLabel,
}: {
  className: string;
  guestHref: string;
  guestLabel: string;
  memberHref: string;
  memberLabel: string;
}) {
  return (
    <>
      <Show when="signed-out">
        <Link className={className} href={guestHref}>
          {guestLabel}
        </Link>
      </Show>
      <Show when="signed-in">
        <Link className={className} href={memberHref}>
          {memberLabel}
        </Link>
      </Show>
    </>
  );
}

export default function LandingPage() {
  return (
    <>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className="nav-bar">
        <div className="wrap nav">
          <Link href="/" className="brand">
            AetherHost
          </Link>
          <nav className="nav-links" aria-label="Page">
            <a href="#use">What it is</a>
            <a href="#plans">Plans</a>
            <Show when="signed-out">
              <Link href="/sign-in">Sign in</Link>
            </Show>
            <AccountLink
              className="btn btn-primary"
              guestHref="/sign-up"
              guestLabel="Start free"
              memberHref="/console"
              memberLabel="Control plane"
            />
          </nav>
        </div>
      </header>

      <main id="content">
        <section className="wrap hero">
          <div>
            <p className="kicker">All-in-one Agency Hosting Platform</p>
            <h1>
              Manage all your client websites from one simple dashboard.
            </h1>
            <p className="lede">
              AetherHost is a powerful control plane designed for digital agencies. Easily deploy and manage WordPress, Node.js, and Python sites for your clients. We seamlessly combine hosting, AI tools, and resource management into a single, predictable billing plan so you never face surprise charges again.
            </p>
            <div className="actions">
              <AccountLink
                className="btn btn-primary"
                guestHref="/sign-up"
                guestLabel="Start free"
                memberHref="/console"
                memberLabel="Open the control plane"
              />
              <a href="#use" className="btn">
                See how it works
              </a>
            </div>
          </div>

          <figure className="specimen">
            <div className="panel" aria-label="Agency Dashboard Overview">
              <div className="panel-top">
                <span>Agency Workspace</span>
                <span className="ok">Pro Plan Active</span>
              </div>
              <div className="meter">
                <span>Client Sites</span>
                <span className="bar" aria-hidden="true">
                  <span style={{ width: "60%" }} />
                </span>
                <span>3 / 5 Active</span>
              </div>
              <div className="meter">
                <span>Storage</span>
                <span className="bar" aria-hidden="true">
                  <span style={{ width: "45%" }} />
                </span>
                <span>900 / 2048 MB</span>
              </div>
              <div className="meter">
                <span>AI Tools</span>
                <span className="bar" aria-hidden="true">
                  <span style={{ width: "24%" }} />
                </span>
                <span>12 / 50</span>
              </div>
              <div className="meter">
                <span>Bandwidth</span>
                <span className="bar" aria-hidden="true">
                  <span style={{ width: "35%" }} />
                </span>
                <span>17.5 / 50 GB</span>
              </div>
              <div className="deploys">
                <div className="deploy">
                  <span className="ok">running</span>
                  <span>acme-corp</span>
                  <span>wordpress</span>
                </div>
                <div className="deploy">
                  <span className="ok">running</span>
                  <span>stellar-app</span>
                  <span>node.js</span>
                </div>
                <div className="deploy">
                  <span className="ok">running</span>
                  <span>data-dashboard</span>
                  <span>python</span>
                </div>
              </div>
            </div>
            <figcaption className="panel-note">
              Manage multiple client projects, monitor resource usage, and deploy apps seamlessly from a single unified dashboard.
            </figcaption>
          </figure>
        </section>

        <section className="section" id="use">
          <div className="wrap">
            <h2>Why agencies choose AetherHost.</h2>
            <p className="intro">
              Managing client websites usually means juggling multiple hosting providers, separate billing platforms, and scattered AI tools. AetherHost brings all your infrastructure, AI integrations, and billing into one unified platform.
            </p>
            <ol className="uses">
              <li>
                <h3>Deploy client sites instantly.</h3>
                <p>
                  Launch WordPress, Node.js, Python, or custom Docker images with a single click. Name the site, choose the framework, and let AetherHost handle the infrastructure.
                </p>
              </li>
              <li>
                <h3>Predictable billing and resource limits.</h3>
                <p>
                  Track sites, storage, bandwidth, and AI usage under one unified plan. Easily monitor what's running and how many resources are left before onboarding your next client.
                </p>
              </li>
              <li>
                <h3>Never pay for accidental overages.</h3>
                <p>
                  AetherHost strictly enforces your plan limits. If your usage hits the cap, additional deployments or API calls are automatically paused. No unexpected invoice surprises at the end of the month.
                </p>
              </li>
            </ol>
          </div>
        </section>

        <section className="section" id="plans">
          <div className="wrap">
            <h2>Pick how many client sites the agency can run.</h2>
            <p className="intro">
              Starter is one site, free. Pro and Max are for a roster. Checkout
              is Bachs. There is no fourth plan.
            </p>
            <div className="plans">
              <article className="plan">
                <h3 className="plan-name">Starter</h3>
                <p className="plan-price">
                  <span className="amount">$0</span>
                  <span className="per">/ month</span>
                </p>
                <ul>
                  <li>1 application</li>
                  <li>512 MB storage</li>
                  <li>10 AI requests</li>
                  <li>10 GB bandwidth</li>
                </ul>
                <AccountLink
                  className="btn btn-primary"
                  guestHref="/sign-up"
                  guestLabel="Start free"
                  memberHref="/console"
                  memberLabel="Open control plane"
                />
              </article>
              <article className="plan plan-pro">
                <p className="plan-fit">For a client roster</p>
                <h3 className="plan-name">Pro</h3>
                <p className="plan-price">
                  <span className="amount">$10</span>
                  <span className="per">/ month</span>
                </p>
                <ul>
                  <li>5 applications</li>
                  <li>2 GB storage</li>
                  <li>50 AI requests</li>
                  <li>50 GB bandwidth</li>
                  <li>Custom domains flag</li>
                </ul>
                <AccountLink
                  className="btn btn-primary"
                  guestHref="/sign-up"
                  guestLabel="Create account"
                  memberHref="/billing"
                  memberLabel="Upgrade to Pro"
                />
              </article>
              <article className="plan">
                <h3 className="plan-name">Max</h3>
                <p className="plan-price">
                  <span className="amount">$25</span>
                  <span className="per">/ month</span>
                </p>
                <ul>
                  <li>20 applications</li>
                  <li>10 GB storage</li>
                  <li>200 AI requests</li>
                  <li>500 GB bandwidth</li>
                  <li>Custom domains flag</li>
                  <li>Priority support flag</li>
                </ul>
                <AccountLink
                  className="btn"
                  guestHref="/sign-up"
                  guestLabel="Create account"
                  memberHref="/billing"
                  memberLabel="Upgrade to Max"
                />
              </article>
            </div>
          </div>
        </section>

        <section className="section" id="gate">
          <div className="wrap">
            <h2>Bulletproof architecture that protects your margins.</h2>
            <p className="intro">
              AetherHost intercepts and verifies every deployment and API request at the gateway level. If a client exceeds their plan, the worker nodes never even see the request.
            </p>
            <div className="flow" aria-label="Request path">
              <div className="flow-row">
                <span>Webhook</span>
                <span className="flow-arrow" aria-hidden="true">
                  →
                </span>
                <span>Plan</span>
                <span className="flow-arrow" aria-hidden="true">
                  →
                </span>
                <span className="flow-gate">Gate</span>
              </div>
              <div className="flow-split">
                <div>
                  <p className="ok">Within limit</p>
                  <p>Slot consumed. Worker node provisions the application successfully.</p>
                </div>
                <div>
                  <p className="deny">At limit</p>
                  <p>Request blocked. Resources are protected from over-provisioning.</p>
                </div>
              </div>
            </div>
            <ol className="steps">
              <li className="step">
                <span className="step-index">01</span>
                <h3>Secure Checkout</h3>
                <p>
                  Payments are verified securely via Paystack webhooks, with cryptographic HMAC checks ensuring that every upgrade is authentic.
                </p>
              </li>
              <li className="step">
                <span className="step-index">02</span>
                <h3>Plan Application</h3>
                <p>
                  The system instantly applies your new resource limits (Storage, AI, Bandwidth, Sites) to your agency workspace.
                </p>
              </li>
              <li className="step">
                <span className="step-index">03</span>
                <h3>The Gateway</h3>
                <p>
                  Every action passes through our strict SQL gate. If quota is exhausted, the process stops immediately before hitting the servers.
                </p>
              </li>
              <li className="step">
                <span className="step-index">04</span>
                <h3>Isolated Workers</h3>
                <p>
                  Secure Go agents safely spin up local Nginx, PHP-FPM, or Docker environments. The app is only marked active when the health probe passes.
                </p>
              </li>
            </ol>
          </div>
        </section>

        <section className="section">
          <div className="wrap">
            <h2>We handle the edge cases so you don't have to.</h2>
            <ul className="proofs">
              <li className="proof">
                <h3>Atomic Quota Enforcement</h3>
                <p>
                  Resource limits are checked and updated in a single, atomic database transaction. Two simultaneous deployments will never bypass your limits.
                </p>
              </li>
              <li className="proof">
                <h3>Fair AI Metering</h3>
                <p>
                  Our AI proxy only deducts from your quota after a successful response from the model. Failed requests or timeouts never cost you tokens.
                </p>
              </li>
              <li className="proof">
                <h3>Idempotent Billing</h3>
                <p>
                  Every payment webhook is verified and deduplicated. Network retries or replayed events will never accidentally double-grant resources.
                </p>
              </li>
            </ul>
          </div>
        </section>

        <section className="section" id="record">
          <div className="wrap">
            <h2>Enterprise-grade infrastructure, simplified.</h2>
            <div className="record">
              <div>
                <h3>Built for Scale</h3>
                <ul>
                  <li>Isolated Docker environments for every client application.</li>
                  <li>Secure payment processing with automated webhooks.</li>
                  <li>Distributed task queues using BullMQ for reliable deployments.</li>
                  <li>Atomic PostgreSQL entitlements to prevent race conditions.</li>
                  <li>High-performance Go agents managing container lifecycles.</li>
                </ul>
              </div>
              <div>
                <h3>Built for Security</h3>
                <ul>
                  <li>Enterprise-grade authentication powered by Clerk.</li>
                  <li>Zero-trust architecture between the control plane and workers.</li>
                  <li>Real-time telemetry and resource usage tracking.</li>
                  <li>Secure AI proxy to monitor and meter LLM token usage.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="section close">
          <div className="wrap close-row">
            <div>
              <h2>Ready to secure your agency's margins?</h2>
              <p className="intro">
                Start deploying workloads safely today. Your first client site is completely free, with full resource tracking right out of the box.
              </p>
            </div>
            <AccountLink
              className="btn btn-primary cta-btn"
              guestHref="/sign-up"
              guestLabel="Start free"
              memberHref="/console"
              memberLabel="Open the control plane"
            />
          </div>
        </section>
      </main>

      <footer className="wrap foot">
        <a href="https://github.com/Emjaay20/AetherHost" target="_blank" rel="noopener noreferrer">
          GitHub Repository
        </a>
        <span>
          Built by <a href="https://yusufsaka.dev/" target="_blank" rel="noopener noreferrer">Yusuf</a>
        </span>
      </footer>
    </>
  );
}
