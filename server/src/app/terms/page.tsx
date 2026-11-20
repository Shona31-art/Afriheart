import Link from "next/link";
import { Fill, LegalPage } from "@/components/legal";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="18 November 2026">
      <p>These terms are an agreement between you and <Fill>company legal name</Fill> (&ldquo;Afriheart&rdquo;). By using Afriheart you agree to them. Please also read the <Link href="/privacy">privacy policy</Link>.</p>

      <h2>Who can use Afriheart</h2>
      <ul>
        <li>You must be 18 or older.</li>
        <li>One account per person, with your own phone number, your own name and photos of you.</li>
        <li>You can&apos;t use Afriheart if we&apos;ve removed you before, or if the law doesn&apos;t allow you to.</li>
      </ul>

      <h2>How to behave</h2>
      <p>Be honest and kind. Don&apos;t:</p>
      <ul>
        <li>pretend to be someone else, or use someone else&apos;s photos;</li>
        <li>harass, threaten, bully or hate on anyone;</li>
        <li>ask people for money, sell things, or run scams;</li>
        <li>share sexual images without clear consent, or any sexual content involving anyone under 18;</li>
        <li>share someone&apos;s private information without their permission;</li>
        <li>use bots, scrape the app, or try to break its security.</li>
      </ul>
      <p>You can report or block anyone. The Afriheart team reviews every report and can remove people who break these rules, with or without warning.</p>

      <h2>Your content</h2>
      <p>You own what you post. You give Afriheart permission to show your profile to other people on Afriheart and to store your encrypted messages so they reach the people you send them to. You can delete your content or your account at any time.</p>

      <h2>Meeting people</h2>
      <p>Afriheart doesn&apos;t run background checks. A verified badge means a selfie matched the profile photos when it was checked, not that we know who someone is. Meet in public, tell a friend where you&apos;ll be, and read the <Link href="/dating/safety">dating safety tips</Link>. You&apos;re responsible for how you deal with other people.</p>

      <h2>The service</h2>
      <p>We work hard to keep Afriheart running and safe, but we provide it as it is, and we can&apos;t promise it&apos;ll always be available or free of mistakes. We may change or stop features. If we start charging for anything, we&apos;ll tell you the price before you pay.</p>

      <h2>Liability</h2>
      <p>As far as the law allows, Afriheart isn&apos;t liable for indirect losses or for what other people do on or off Afriheart. Nothing in these terms limits your rights under the Consumer Protection Act or other law that can&apos;t be excluded.</p>

      <h2>Ending</h2>
      <p>You can stop using Afriheart and delete your account at any time under <Link href="/you">You → Privacy and account</Link>. We can suspend or remove accounts that break these terms.</p>

      <h2>Law and contact</h2>
      <p>These terms are governed by the law of South Africa. Questions: <Fill>contact email address</Fill>.</p>
    </LegalPage>
  );
}
