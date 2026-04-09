import { Title } from "@solidjs/meta";
import { A } from "@solidjs/router";
import { HttpStatusCode } from "@solidjs/start";

export default function NotFound() {
  return (
    <main class="min-h-screen bg-[#F9F9F8] px-6 py-16 text-stone-700">
      <Title>Page Not Found</Title>
      <HttpStatusCode code={404} />

      <div class="mx-auto max-w-xl rounded-[2rem] border border-stone-200 bg-white p-8 shadow-sm">
        <p class="text-sm font-semibold uppercase tracking-[0.2em] text-stone-400">404</p>
        <h1 class="mt-3 text-4xl font-semibold tracking-tight text-stone-900">
          This page is not part of your task list.
        </h1>
        <p class="mt-4 text-base leading-7 text-stone-600">
          The link may be outdated, or the page may have been moved while the product is still
          taking shape.
        </p>

        <div class="mt-8 flex flex-wrap gap-3">
          <A
            href="/"
            class="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-black"
          >
            Go home
          </A>
        </div>
      </div>
    </main>
  );
}
