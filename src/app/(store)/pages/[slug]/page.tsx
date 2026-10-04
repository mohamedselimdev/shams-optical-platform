import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublishedPage } from "@/modules/cms/service";
import type { Block } from "@/modules/cms/blocks";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = await getPublishedPage((await params).slug);
  if (!page) return {};
  return { title: page.seoTitle ?? page.title, description: page.seoDescription ?? undefined, alternates: { canonical: `/pages/${page.slug}` } };
}

/** CMS pages render typed blocks as React elements; no editor-supplied HTML ever reaches the DOM. */
function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "heading":
      return block.level === 3 ? <h3 className="mt-6 text-lg font-semibold">{block.text}</h3> : <h2 className="mt-8 font-display text-2xl font-semibold">{block.text}</h2>;
    case "paragraph":
      return <p className="whitespace-pre-line leading-8 text-ink-soft">{block.text}</p>;
    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return <Tag className={`${block.ordered ? "list-decimal" : "list-disc"} space-y-1 ps-6 text-ink-soft`}>{block.items.map((i, n) => <li key={n}>{i}</li>)}</Tag>;
    }
    case "callout":
      return <p className={`whitespace-pre-line rounded-md p-4 ${block.tone === "warning" ? "bg-warning-soft text-warning" : "bg-info-soft text-info"}`}>{block.text}</p>;
    case "button":
      return block.href.startsWith("/") ? <Link href={block.href} className="inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm font-medium text-surface">{block.label}</Link> : <a href={block.href} rel="noopener" target="_blank" className="inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm font-medium text-surface">{block.label}</a>;
    case "faq":
      return <div className="divide-y divide-line rounded-lg border border-line bg-surface">{block.items.map((f, n) => <details key={n} className="p-4"><summary className="cursor-pointer font-medium">{f.q}</summary><p className="mt-2 whitespace-pre-line text-ink-soft">{f.a}</p></details>)}</div>;
  }
}

export default async function ContentPage({ params }: Props) {
  const page = await getPublishedPage((await params).slug);
  if (!page) notFound();
  return (
    <article className="container-page max-w-3xl space-y-4 py-12">
      <h1 className="font-display text-3xl font-bold">{page.title}</h1>
      {page.blocks.map((b, i) => <BlockView key={i} block={b} />)}
    </article>
  );
}
