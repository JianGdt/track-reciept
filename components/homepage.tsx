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
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";

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
    <div className="overflow-clip bg-background font-sans text-foreground [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-primary [&_a:focus-visible]:outline-offset-4 [&_summary:focus-visible]:outline-2 [&_summary:focus-visible]:outline-primary [&_summary:focus-visible]:outline-offset-4 motion-reduce:[&_*]:transition-none! motion-reduce:[&_*]:animate-none! [&_h2]:my-[17px]! [&_h2]:text-[clamp(30px,3vw,40px)]! [&_h2]:leading-[1.18]! [&_h2]:tracking-[-0.045em]! [&_h2]:font-[520]! [&_h3]:mb-3! [&_h3]:text-base! [&_h3]:font-[550]! [&_h3]:tracking-tight!">
      <a
        href="#main"
        className="absolute -top-24 left-4 z-50 bg-card p-3.5 focus:top-3"
      >
        Skip to content
      </a>
      <header className="mx-auto w-[calc(100%-32px)] min-[381px]:w-[calc(100%-40px)] md:w-[calc(100%-56px)] lg:w-[calc(100%-96px)] max-w-[1180px] [&_.brand-logo]:w-24! min-[381px]:[&_.brand-logo]:w-28! md:[&_.brand-logo]:w-[140px]! [&_.brand-logo_img]:w-full! [&_.brand-logo_img]:h-auto! flex h-20 items-center justify-between gap-3 border-b border-border md:h-[104px] md:gap-6">
        <Brand />
        <nav
          aria-label="Main navigation"
          className="flex items-center gap-2.5 text-xs font-medium min-[381px]:gap-[15px] md:gap-5 md:text-[13px] lg:gap-[30px]"
        >
          <a
            className="hidden hover:text-primary md:inline"
            href="#how-it-works"
          >
            How it works
          </a>
          <a className="hidden hover:text-primary md:inline" href="#features">
            Features
          </a>
          <Link href="/sign-in" className="hover:text-primary lg:ml-[22px]">
            Sign in
          </Link>
          <Button
            asChild
            className="min-h-[42px]! rounded-lg! px-3! text-[11px]! md:px-[17px]! md:text-[13px]! [&_svg]:hidden md:[&_svg]:block"
          >
            <Link href="/register">
              Create account <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </Button>
        </nav>
      </header>

      <main id="main" className="max-w-none! p-0!">
        <section
          className="mx-auto w-[calc(100%-32px)] min-[381px]:w-[calc(100%-40px)] md:w-[calc(100%-56px)] lg:w-[calc(100%-96px)] max-w-[1180px] grid items-center gap-7 pt-12 pb-[60px] md:min-h-[690px] md:grid-cols-2 md:gap-5 md:pt-[74px] md:pb-[92px] lg:gap-[25px] [&_h1]:my-[25px]! [&_h1]:text-[clamp(50px,10vw,70px)]! md:[&_h1]:text-[clamp(48px,5.6vw,76px)]! [&_h1]:font-[530]! [&_h1]:tracking-[-0.065em]! [&_h1]:leading-[1.04]! [&_h1>span]:text-primary"
          aria-labelledby="hero-title"
        >
          <div className="[&>p]:max-w-[410px] [&>p]:text-[15px] [&>p]:leading-[1.8] [&>p]:text-muted-foreground md:[&>p]:max-w-[370px] md:[&>p]:text-base">
            <span className="inline-flex items-center gap-2 text-[9px] font-medium text-muted-foreground min-[381px]:text-[11px] [&>span]:size-1.5 [&>span]:rounded-full [&>span]:bg-[#718c73]">
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
            <div className="mt-[30px] flex flex-wrap items-center gap-[18px] min-[381px]:gap-[25px]">
              <Button
                asChild
                className="min-h-[52px]! gap-[18px]! rounded-lg! px-[23px]! py-3.5! text-sm!"
              >
                <Link href="/register">
                  Create account <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </Button>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2.5 text-[13px] font-medium hover:text-primary"
              >
                See how it works <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
            <div className="mt-[22px] flex items-center gap-[7px] text-[11px] text-muted-foreground">
              <Check size={15} aria-hidden="true" /> Receipt photos. Saved
              details. One place.
            </div>
          </div>

          <figure
            className="relative isolate m-0 h-[440px] w-full max-w-[470px] justify-self-center md:h-[475px] md:max-w-none [&_figcaption]:absolute [&_figcaption]:-bottom-[19px] [&_figcaption]:w-full [&_figcaption]:text-center [&_figcaption]:text-[9px] [&_figcaption]:text-muted-foreground"
            aria-label="Illustration of a receipt and a digital archive with fictional sample purchases"
          >
            <div className="absolute -inset-x-5 -top-5 bottom-[15px] -z-10 rounded-full bg-[radial-gradient(ellipse,#dce4f17a,transparent_70%)]" />
            <Card className="absolute! top-[30px] right-0 w-[85%] rotate-3 gap-0 rounded-[14px]! border-border p-[17px]! shadow-[0_20px_65px_#26334b0b]! md:top-[45px] md:w-[95%] lg:w-[88%] lg:p-6!">
              <div className="flex items-center gap-2.5 text-[15px] font-semibold [&_svg]:text-primary">
                <FolderOpen size={20} aria-hidden="true" />
                <span>My receipts</span>
                <Badge
                  variant="secondary"
                  className="ml-auto rounded-[5px] bg-background px-2 py-1 text-[11px] text-muted-foreground"
                >
                  03
                </Badge>
              </div>
              <div className="my-5 flex gap-2 rounded-md border border-border p-2.5 text-[10px] text-muted-foreground">
                <Search size={14} aria-hidden="true" /> Search by store name
              </div>
              <div className="mb-2.5 text-[8px] tracking-[1.3px] text-muted-foreground uppercase">
                A little more organized
              </div>
              {[
                ["N", "Neighborhood Market", "Oct 20 · Groceries", "₱845.50"],
                ["C", "Corner Cafe", "Oct 21 · Food", "₱180.00"],
                ["S", "City Supplies", "Oct 22 · Other", "₱325.00"],
              ].map(([letter, name, detail, amount]) => (
                <div
                  className="flex items-center gap-1.5 border-b border-border py-3.5 min-[381px]:gap-2.5 [&_strong]:block [&_strong]:text-[10px] [&_strong]:font-[550] [&_small]:mt-1 [&_small]:block [&_small]:text-[8px] [&_small]:text-muted-foreground [&_b]:ml-auto [&_b]:text-[10px] [&_b]:font-[550] [&_b]:whitespace-nowrap"
                  key={name}
                >
                  <span className="hidden h-[34px] w-[31px] shrink-0 place-items-center rounded-[7px] bg-secondary text-[11px] text-primary min-[381px]:grid">
                    {letter}
                  </span>
                  <div>
                    <strong>{name}</strong>
                    <small>{detail}</small>
                  </div>
                  <b>{amount}</b>
                </div>
              ))}
              <div className="flex items-center justify-end gap-[5px] pt-[15px] text-[8px] text-muted-foreground">
                <Check size={13} aria-hidden="true" /> Everything in its place.
              </div>
            </Card>
            <div className="absolute top-[133px] left-[5px] w-40 -rotate-9 border border-[#e8e5dc] bg-[#fffef9] px-3 pt-[22px] pb-[23px] text-center text-[#34362f] shadow-[0_16px_35px_#24314b1a] min-[381px]:w-[180px] min-[381px]:px-[18px] md:top-[152px] md:-left-1 lg:-left-2 lg:w-[205px] [&>strong]:block [&>strong]:text-[11px] [&>strong]:leading-normal [&>strong]:tracking-[2px] [&>small]:text-[6px] [&>small]:tracking-[1px] after:absolute after:-inset-x-px after:-bottom-[7px] after:h-[7px] after:bg-[linear-gradient(135deg,#fffef9_5px,transparent_0),linear-gradient(225deg,#fffef9_5px,transparent_0)] after:bg-size-[10px_10px] after:content-['']">
              <span className="mx-auto mb-2.5 grid size-[25px] place-items-center rounded-full border border-[#34362f] text-[13px]">
                N
              </span>
              <strong>
                NEIGHBORHOOD
                <br />
                MARKET
              </strong>
              <span className="mt-2.5 block text-[7px] text-[#686a61]">
                OCT 20, 2026 · 10:42 AM
              </span>
              <div className="my-3.5 border-t border-dashed border-[#c7c7bb]" />
              <div className="mt-2 flex justify-between gap-[5px] text-[8px]">
                <span>Fresh produce</span>
                <span>₱325.50</span>
              </div>
              <div className="mt-2 flex justify-between gap-[5px] text-[8px]">
                <span>Pantry essentials</span>
                <span>₱520.00</span>
              </div>
              <div className="my-3.5 border-t border-dashed border-[#c7c7bb]" />
              <div className="flex justify-between text-xs font-bold">
                <span>TOTAL</span>
                <span>₱845.50</span>
              </div>
              <div
                className="mx-auto mt-[18px] mb-2.5 h-[25px] w-[108px] bg-[repeating-linear-gradient(90deg,#34362f_0_1px,transparent_1px_3px,#34362f_3px_5px,transparent_5px_6px,#34362f_6px_7px,transparent_7px_10px)]"
                aria-hidden="true"
              />
              <small>THANK YOU. SEE YOU SOON.</small>
            </div>
            <Badge
              variant="outline"
              className="absolute right-[3px] bottom-8 gap-[9px] rounded-[10px] border-border bg-card px-4 py-[13px] text-[10px] font-normal text-foreground shadow-[0_10px_25px_#24314b0a] md:bottom-9 [&>span]:flex [&>span]:rounded-full [&>span]:bg-secondary [&>span]:p-1 [&>span]:text-primary"
            >
              <span>
                <Check size={15} aria-hidden="true" />
              </span>{" "}
              A paper receipt. Now saved.
            </Badge>
            <figcaption>
              Sample receipts · An illustration of your future archive
            </figcaption>
          </figure>
        </section>

        <section
          id="how-it-works"
          className="mx-auto w-[calc(100%-32px)] min-[381px]:w-[calc(100%-40px)] md:w-[calc(100%-56px)] lg:w-[calc(100%-96px)] max-w-[1180px] scroll-mt-[30px] border-t border-border py-[52px] md:pt-[74px] md:pb-[84px]"
          aria-labelledby="how-title"
        >
          <div className="text-center [&>p]:text-sm [&>p]:leading-[1.8] [&>p]:text-muted-foreground">
            <span className="text-[9px] font-semibold tracking-[1.6px] text-primary">
              SMALL HABIT. LESS CLUTTER.
            </span>
            <h2 id="how-title">
              From paper to saved.
              <br />
              As simple as it sounds.
            </h2>
            <p>
              No complicated setup. Just your receipt and a moment of your time.
            </p>
          </div>
          <div className="mt-[30px] grid gap-3.5 md:mt-11 md:grid-cols-3 md:gap-[22px]">
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
              <Card
                className="gap-0 rounded-xl! border-border p-6! shadow-none! md:p-[26px]! [&>p]:text-[13px] [&>p]:leading-[1.8] [&>p]:text-muted-foreground"
                key={title}
              >
                <div className="mb-5 flex items-center justify-between text-primary md:mb-[27px] [&>span]:text-[11px] [&>span]:text-muted-foreground [&>span]:tabular-nums">
                  <Icon size={24} aria-hidden="true" />
                  <span>0{i + 1}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </Card>
            ))}
          </div>
        </section>

        <section
          id="features"
          className="mx-auto w-[calc(100%-32px)] min-[381px]:w-[calc(100%-40px)] md:w-[calc(100%-56px)] lg:w-[calc(100%-96px)] max-w-[1180px] grid scroll-mt-[30px] gap-[35px] border-t border-border py-[52px] md:grid-cols-[1fr_1.4fr] md:gap-10 md:pt-[75px] md:pb-[85px] lg:gap-[90px]"
          aria-labelledby="features-title"
        >
          <div className="pt-[15px] [&>p]:text-sm [&>p]:leading-[1.8] [&>p]:text-muted-foreground [&>a]:mt-[26px] [&>a]:text-primary">
            <span className="text-[9px] font-semibold tracking-[1.6px] text-primary">
              MADE FOR EVERYDAY RECEIPTS
            </span>
            <h2 id="features-title">
              Keep the receipt.
              <br />
              Lose the clutter.
            </h2>
            <p>
              From the weekly groceries to that coffee on the corner. Keep the
              little details together.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2.5 text-[13px] font-medium hover:text-primary"
            >
              Start your archive <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-x-[22px] gap-y-7 min-[381px]:grid-cols-2 md:gap-x-8 md:gap-y-9 [&_p]:text-[13px] [&_p]:leading-[1.8] [&_p]:text-muted-foreground">
            {features.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <span className="mb-5 flex items-center text-primary">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section
          className="mx-auto w-[calc(100%-32px)] min-[381px]:w-[calc(100%-40px)] md:w-[calc(100%-56px)] lg:w-[calc(100%-96px)] max-w-[1180px] grid gap-[35px] border-t border-border py-[52px] md:grid-cols-[1fr_1.4fr] md:gap-10 md:pt-[75px] md:pb-[90px] lg:gap-[90px] [&>div>p]:text-sm [&>div>p]:leading-[1.8] [&>div>p]:text-muted-foreground"
          aria-labelledby="faq-title"
        >
          <div>
            <span className="text-[9px] font-semibold tracking-[1.6px] text-primary">
              GOOD TO KNOW
            </span>
            <h2 id="faq-title">A few little details.</h2>
            <p>Before you put that first receipt away.</p>
          </div>
          <div className="[&_details]:border-b [&_details]:border-border [&_summary]:flex [&_summary]:cursor-pointer [&_summary]:list-none [&_summary]:justify-between [&_summary]:gap-5 [&_summary]:py-[21px] [&_summary]:text-[13px] [&_summary]:font-[550] [&_summary::-webkit-details-marker]:hidden [&_summary>span]:text-lg [&_summary>span]:font-normal [&_summary>span]:text-muted-foreground [&_details[open]_summary>span]:rotate-45 [&_details>p]:pr-[25px] [&_details>p]:pb-[22px] [&_details>p]:text-[13px] [&_details>p]:leading-[1.8] [&_details>p]:text-muted-foreground [&_p_a]:text-primary [&_p_a]:underline">
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

        <section
          className="border-y border-border bg-secondary px-6 py-[70px] text-center [&_h2]:text-[clamp(34px,4vw,48px)]! [&>p]:mb-[25px]! [&>p]:leading-[1.7] [&>p]:text-muted-foreground [&>small]:mt-[19px] [&>small]:block [&>small]:text-[11px] [&>small]:text-muted-foreground [&>small_a]:text-foreground [&>small_a]:underline"
          aria-labelledby="cta-title"
        >
          <span className="text-[9px] font-semibold tracking-[1.6px] text-primary">
            YOUR RECEIPTS, ALL TOGETHER
          </span>
          <h2 id="cta-title">
            Give your next receipt
            <br />a place to stay.
          </h2>
          <p>Start building your own online receipt archive.</p>
          <Button
            asChild
            className="min-h-[52px]! gap-[18px]! rounded-lg! px-[23px]! py-3.5! text-sm!"
          >
            <Link href="/register">
              Create account <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </Button>
          <small>
            Already have an account? <Link href="/sign-in">Sign in</Link>
          </small>
        </section>
      </main>
      <footer className="mx-auto w-[calc(100%-32px)] min-[381px]:w-[calc(100%-40px)] md:w-[calc(100%-56px)] lg:w-[calc(100%-96px)] max-w-[1180px] [&_.brand-logo]:w-24! min-[381px]:[&_.brand-logo]:w-28! md:[&_.brand-logo]:w-[140px]! [&_.brand-logo_img]:w-full! [&_.brand-logo_img]:h-auto! flex min-h-[120px] flex-wrap items-center gap-[18px] py-7! md:gap-[30px] md:py-0! [&>span]:hidden [&>span]:text-[11px] [&>span]:text-muted-foreground md:[&>span]:inline [&_nav]:ml-auto [&_nav]:flex [&_nav]:gap-[22px] [&_nav]:text-xs md:[&_nav]:gap-7 [&_a:hover]:text-primary">
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
