import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Camera,
  Check,
  FileImage,
  FolderOpen,
  Search,
  Sparkles,
  Smartphone,
} from "lucide-react";
import { Brand } from "./brand";
import styles from "./homepage.module.css";

const features = [
  {
    icon: FileImage,
    title: "The original, always close",
    text: "Keep the receipt photo alongside your saved purchase details. Open it whenever you need a second look.",
  },
  {
    icon: Search,
    title: "Less searching. More finding.",
    text: "Find that one receipt by store name, or narrow things down by month and category.",
  },
  {
    icon: Sparkles,
    title: "A little less typing",
    text: "Let AI help read the store, date, and total. Review the details, make any corrections, and save.",
  },
  {
    icon: Smartphone,
    title: "Wherever you sign in",
    text: "Your online archive is ready on your phone or computer. Same account, same receipts.",
  },
];

const questions = [
  {
    question: "Can I upload a photo I already took?",
    answer:
      "Yes. Choose a receipt photo from your gallery, review its details, and save it to your archive.",
  },
  {
    question: "Do I have to use AI scanning?",
    answer:
      "No. You can enter the details manually. AI scanning is optional and has usage limits.",
  },
  {
    question: "Can I see the original receipt later?",
    answer:
      "Yes. If you attach a photo, you can open the original receipt image from its saved details.",
  },
  {
    question: "What happens when I scan a receipt?",
    answer: (
      <>
        Your receipt photo is sent to Google Gemini to help extract the details.
        You review them before saving. Read our{" "}
        <Link href="/privacy">privacy policy</Link> for more information.
      </>
    ),
  },
  {
    question: "Can I throw away every paper receipt?",
    answer:
      "ResiVault keeps a digital copy. Keep an original when a store, employer, or other recipient requires it.",
  },
];

export function Homepage() {
  return (
    <div className={styles.page}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.header}>
        <Brand />
        <nav aria-label="Main navigation" className={styles.nav}>
          <a className={styles.sectionLink} href="#how-it-works">
            How it works
          </a>
          <a className={styles.sectionLink} href="#features">
            Features
          </a>
          <Link href="/sign-in" className={styles.signIn}>
            Sign in
          </Link>
          <Link href="/register" className={styles.smallButton}>
            Create account <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </nav>
      </header>

      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <span /> A little less paper. A lot more organized.
            </span>
            <h1 id="hero-title">
              Your receipts,
              <br />
              without the
              <br />
              <span>paper pile.</span>
            </h1>
            <p>
              Take a photo, save it online, and find it when you need it. A
              simpler home for all those little pieces of paper.
            </p>
            <div className={styles.actions}>
              <Link href="/register" className={styles.primary}>
                Create account <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <a href="#how-it-works" className={styles.textLink}>
                See how it works <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
            <div className={styles.heroNote}>
              <Check size={15} aria-hidden="true" /> Receipt photos. Saved
              details. One place.
            </div>
          </div>

          <figure
            className={styles.preview}
            aria-label="Illustration of a receipt and a digital archive with fictional sample purchases"
          >
            <div className={styles.previewGrid} />
            <div className={styles.archive}>
              <div className={styles.archiveTop}>
                <FolderOpen size={20} aria-hidden="true" />
                <span>My receipts</span>
                <span className={styles.count}>03</span>
              </div>
              <div className={styles.searchPreview}>
                <Search size={14} aria-hidden="true" /> Search by store name
              </div>
              <div className={styles.archiveLabel}>A little more organized</div>
              {[
                ["N", "Neighborhood Market", "Oct 20 · Groceries", "₱845.50"],
                ["C", "Corner Cafe", "Oct 21 · Food", "₱180.00"],
                ["S", "City Supplies", "Oct 22 · Other", "₱325.00"],
              ].map(([letter, name, detail, amount]) => (
                <div className={styles.receiptRow} key={name}>
                  <span className={styles.storeIcon}>{letter}</span>
                  <div>
                    <strong>{name}</strong>
                    <small>{detail}</small>
                  </div>
                  <b>{amount}</b>
                </div>
              ))}
              <div className={styles.archiveBottom}>
                <Check size={13} aria-hidden="true" /> Everything in its place.
              </div>
            </div>
            <div className={styles.paper}>
              <span className={styles.paperMark}>N</span>
              <strong>
                NEIGHBORHOOD
                <br />
                MARKET
              </strong>
              <span className={styles.paperDate}>OCT 20, 2026 · 10:42 AM</span>
              <div className={styles.paperRule} />
              <div className={styles.paperLine}>
                <span>Fresh produce</span>
                <span>₱325.50</span>
              </div>
              <div className={styles.paperLine}>
                <span>Pantry essentials</span>
                <span>₱520.00</span>
              </div>
              <div className={styles.paperRule} />
              <div className={styles.paperTotal}>
                <span>TOTAL</span>
                <span>₱845.50</span>
              </div>
              <div className={styles.barcode} aria-hidden="true" />
              <small>THANK YOU. SEE YOU SOON.</small>
            </div>
            <div className={styles.savedBadge}>
              <span>
                <Check size={15} aria-hidden="true" />
              </span>{" "}
              A paper receipt. Now saved.
            </div>
            <figcaption>
              Sample receipts · An illustration of your future archive
            </figcaption>
          </figure>
        </section>

        <section
          id="how-it-works"
          className={styles.how}
          aria-labelledby="how-title"
        >
          <div className={styles.sectionHeading}>
            <span className={styles.kicker}>SMALL HABIT. LESS CLUTTER.</span>
            <h2 id="how-title">
              From paper to saved.
              <br />
              As simple as it sounds.
            </h2>
            <p>
              No complicated setup. Just your receipt and a moment of your time.
            </p>
          </div>
          <div className={styles.steps}>
            {[
              {
                icon: Camera,
                title: "Capture it",
                text: "Take a photo of your receipt or choose one from your gallery.",
              },
              {
                icon: Sparkles,
                title: "Give it a quick review",
                text: "Let AI help fill in the details, then check them. Prefer typing? That works too.",
              },
              {
                icon: FolderOpen,
                title: "Save it for later",
                text: "Keep your receipt online, ready to find by store, month, or category.",
              },
            ].map(({ icon: Icon, title, text }, i) => (
              <div className={styles.step} key={title}>
                <div className={styles.stepTop}>
                  <Icon size={24} aria-hidden="true" />
                  <span>0{i + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="features"
          className={styles.features}
          aria-labelledby="features-title"
        >
          <div className={styles.featureIntro}>
            <span className={styles.kicker}>MADE FOR EVERYDAY RECEIPTS</span>
            <h2 id="features-title">
              Keep the receipt.
              <br />
              Lose the clutter.
            </h2>
            <p>
              From the weekly groceries to that coffee on the corner. Keep the
              little details together.
            </p>
            <Link href="/register" className={styles.textLink}>
              Start your archive <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className={styles.featureGrid}>
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <span className={styles.featureIcon}>
                  <Icon size={22} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.faq} aria-labelledby="faq-title">
          <div>
            <span className={styles.kicker}>GOOD TO KNOW</span>
            <h2 id="faq-title">A few little details.</h2>
            <p>Before you put that first receipt away.</p>
          </div>
          <div className={styles.questions}>
            {questions.map(({ question, answer }) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.finalCta} aria-labelledby="cta-title">
          <span className={styles.kicker}>YOUR RECEIPTS, ALL TOGETHER</span>
          <h2 id="cta-title">
            Give your next receipt
            <br />a place to stay.
          </h2>
          <p>Start building your own online receipt archive.</p>
          <Link href="/register" className={styles.primary}>
            Create account <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <small>
            Already have an account? <Link href="/sign-in">Sign in</Link>
          </small>
        </section>
      </main>
      <footer className={styles.footer}>
        <Brand />
        <span>Your receipts, all together.</span>
        <nav aria-label="Footer navigation">
          <Link href="/privacy">Privacy</Link>
          <Link href="/sign-in">Sign in</Link>
        </nav>
      </footer>
    </div>
  );
}
