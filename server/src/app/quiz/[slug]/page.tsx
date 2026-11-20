import { Suspense } from "react";
import { QuizTake } from "@/components/quiz";
import { Skeleton } from "@/components/ui";

export const metadata = {
  title: "How compatible are we?",
  description: "Someone sent you a 10-question compatibility quiz. Answer it and you'll both see your match %.",
  robots: { index: false },
};

export default function QuizTakePage({ params }: PageProps<"/quiz/[slug]">) {
  return (
    <Suspense fallback={<main className="page"><Skeleton /></main>}>
      <Take params={params} />
    </Suspense>
  );
}

async function Take({ params }: { params: PageProps<"/quiz/[slug]">["params"] }) {
  const { slug } = await params;
  return <QuizTake slug={slug} />;
}
