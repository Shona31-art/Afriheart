import Link from "next/link";
import { Fill, LegalPage } from "@/components/legal";

export const metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="18 November 2026">
      <p>
        Afriheart is a dating and messaging app run by <Fill>company legal name and registration number</Fill>, <Fill>physical address</Fill> (&ldquo;Afriheart&rdquo;, &ldquo;we&rdquo;).
        This policy explains what we collect, why, who we share it with and your rights under the Protection of Personal Information Act (POPIA) and similar laws.
      </p>
      <p>Our Information Officer is <Fill>name</Fill>, reachable at <Fill>privacy email address</Fill>.</p>

      <h2>What we collect and why</h2>
      <ul>
        <li><strong>Your phone number and name</strong>, to create your account and sign you in with a code sent by SMS or WhatsApp.</li>
        <li><strong>Your dating profile</strong>: photos, first name, date of birth (only your age is shown), gender, who you&apos;d like to meet, area, bio and date idea, to show you to people and suggest matches. Who you&apos;d like to meet can reveal your sex life or orientation, which POPIA treats as special personal information, so we only use it with your explicit consent, given when you make your profile.</li>
        <li><strong>Your approximate location</strong>, if you share it or choose a city, to show people nearby. We round it to about 1 km before saving it, and other people only ever see a rough distance, like &ldquo;Less than 5 km away&rdquo;.</li>
        <li><strong>Your compatibility answers</strong>, to work out match scores. Other people see the score and the answers you both share, never your other answers or what you&apos;d accept. We don&apos;t ask about religion, politics or health.</li>
        <li><strong>A verification selfie</strong>, if you choose to verify. It&apos;s biometric information, so we only take it with your explicit consent. Only the Afriheart team sees it, to compare it with your photos, and it&apos;s deleted as soon as it&apos;s checked. We keep only the result.</li>
        <li><strong>Your messages, photos, voice notes, calls and album stories</strong>. These are end-to-end encrypted on your phone. We store them only in scrambled form, so we can&apos;t read, see or hear them.</li>
        <li><strong>Likes, matches, blocks and reports</strong>, to run the app and keep people safe. A <strong>comment you send with a like</strong> is delivered before you match, so unlike chat messages it isn&apos;t end-to-end encrypted.</li>
        <li><strong>Prompts and a voice prompt</strong>, if you add them, are part of your profile.</li>
        <li><strong>Double dates</strong>: which friend you&apos;ve paired with, your pair&apos;s date idea and which pairs you liked.</li>
        <li><strong>&ldquo;We met&rdquo; answers</strong> after a date, kept private from the other person. If you say someone didn&apos;t look like their photos, the Afriheart team checks their profile without saying who asked.</li>
        <li><strong>The check for hurtful messages</strong> runs only on your phone: messages aren&apos;t sent anywhere to be checked.</li>
        <li><strong>The compatibility quiz</strong> (no account needed): the first name you type and your ten answers, to work out a match % with the people you send it to. Each person only sees the score and the answers you both share. Quizzes and their answers are deleted after 30 days, or straight away if the person who made it deletes it.</li>
        <li><strong>Technical information</strong>: your sign-in sessions (with the type of phone or browser), your phones&apos; public encryption keys, push notification addresses, and your network address when you ask for sign-in codes, to keep your account secure and stop abuse.</li>
      </ul>
      <p>We don&apos;t sell your information, and we don&apos;t show ads.</p>
      <p>If you share an album page or a quiz result to TikTok, Instagram, WhatsApp or anywhere else, that image leaves Afriheart&apos;s encryption and is seen by whoever you share it with. Afriheart makes the image on your phone and doesn&apos;t keep a copy.</p>

      <h2>Who we share it with</h2>
      <ul>
        <li><strong>Other people on Afriheart</strong>: what&apos;s on your dating profile, your age, rough distance, match score and verified badge. Matches never see your phone number.</li>
        <li><strong>Service providers</strong> who run parts of Afriheart for us under contract: database and file hosting (<Fill>e.g. Supabase, and the region your data is stored in</Fill>), sign-in code delivery (<Fill>SMS or WhatsApp provider</Fill>), and push notifications (Google Firebase). Some of them may store information outside South Africa; when they do, we make sure it&apos;s protected to a standard similar to POPIA.</li>
        <li><strong>The authorities</strong>, only when the law requires it or to protect someone from serious harm.</li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your account information, until you delete your account.</li>
        <li>Verification selfies: until they&apos;re checked, then deleted.</li>
        <li>Compatibility quizzes and their answers: 30 days.</li>
        <li>Photos you take off your profile are deleted straight away.</li>
        <li>Reports about safety are kept, without the reported person&apos;s profile, for as long as we need them for safety and legal reasons.</li>
      </ul>

      <h2>Your rights</h2>
      <p>You can ask to see the information we hold about you, have it corrected, object to how we use it, or have it deleted. You can do most of this in the app:</p>
      <ul>
        <li>Edit or pause your dating profile at any time.</li>
        <li>Delete your account under <Link href="/you">You → Privacy and account</Link>. This deletes your profile, photos, answers, location, everything you&apos;ve sent in chats and your sign-ins.</li>
        <li>Withdraw consent for verification or location by removing your location or not verifying; it doesn&apos;t affect anything before you withdraw.</li>
      </ul>
      <p>For anything else, contact our Information Officer at <Fill>privacy email address</Fill>. You can also complain to the Information Regulator of South Africa at <a href="https://inforegulator.org.za" rel="noreferrer">inforegulator.org.za</a>.</p>

      <h2>Age</h2>
      <p>Afriheart is only for people 18 and older. If we learn someone under 18 is using it, we remove their profile.</p>

      <h2>Security</h2>
      <p>Messages and calls are end-to-end encrypted. Sign-in codes and session tokens are stored only as hashes, and you can sign out other phones under You. No system is perfectly secure; if something goes wrong that affects you, we&apos;ll tell you and the Information Regulator as POPIA requires.</p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we&apos;ll tell you in the app before it applies.</p>
      <p className="mt-6 text-sm"><Link href="/terms">Terms</Link> · <Link href="/dating/safety">Dating safety</Link></p>
    </LegalPage>
  );
}
