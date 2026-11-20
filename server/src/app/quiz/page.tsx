import { QuizHome } from "@/components/quiz";

export const metadata = {
  title: "How compatible are you? A 10-question quiz",
  description: "Answer ten questions, from kids and money to what counts as cheating, send the link, and see your match %. Free, no sign-up. By Afriheart.",
  openGraph: { title: "How compatible are you?", description: "A 10-question compatibility quiz to take together. No sign-up." },
};

export default function QuizPage() {
  return <QuizHome />;
}
