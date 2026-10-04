import { z } from "zod";
import { isSafeInternalPath } from "@/lib/validation";

/**
 * Structured CMS content. Pages are arrays of typed blocks rendered by React components —
 * never raw HTML — so editors cannot inject scripts or markup.
 */
const safeHref = z
  .string()
  .trim()
  .max(300)
  .refine((v) => isSafeInternalPath(v) || /^https:\/\/[\w.-]+(\/[\w\-./?=&%#]*)?$/.test(v), "رابط غير صالح");

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().trim().min(1).max(200), level: z.union([z.literal(2), z.literal(3)]).default(2) }),
  z.object({ type: z.literal("paragraph"), text: z.string().trim().min(1).max(5000) }),
  z.object({ type: z.literal("list"), items: z.array(z.string().trim().min(1).max(500)).min(1).max(50), ordered: z.boolean().default(false) }),
  z.object({ type: z.literal("callout"), text: z.string().trim().min(1).max(1000), tone: z.enum(["info", "warning"]).default("info") }),
  z.object({ type: z.literal("button"), label: z.string().trim().min(1).max(60), href: safeHref }),
  z.object({ type: z.literal("faq"), items: z.array(z.object({ q: z.string().trim().min(1).max(300), a: z.string().trim().min(1).max(3000) })).min(1).max(50) }),
]);

export const blocksSchema = z.array(blockSchema).max(200);
export type Block = z.infer<typeof blockSchema>;

/**
 * Plain-text authoring format for staff (one block per paragraph):
 *   "## Title" → heading, "### Sub" → h3, lines starting "- " → list, "> text" → callout,
 *   "[Label](/path)" → button, "? Question | Answer" lines → FAQ, anything else → paragraph.
 */
export function parseBlocks(source: string): Block[] {
  const chunks = source.replace(/\r\n/g, "\n").split(/\n{2,}/).map((c) => c.trim()).filter(Boolean);
  const blocks: Block[] = chunks.map((chunk): Block => {
    if (chunk.startsWith("### ")) return { type: "heading", level: 3, text: chunk.slice(4).trim() };
    if (chunk.startsWith("## ")) return { type: "heading", level: 2, text: chunk.slice(3).trim() };
    const lines = chunk.split("\n").map((l) => l.trim());
    if (lines.every((l) => l.startsWith("- "))) return { type: "list", ordered: false, items: lines.map((l) => l.slice(2).trim()) };
    if (lines.every((l) => /^\d+\.\s/.test(l))) return { type: "list", ordered: true, items: lines.map((l) => l.replace(/^\d+\.\s/, "").trim()) };
    if (lines.every((l) => l.startsWith("? "))) {
      return { type: "faq", items: lines.map((l) => { const [q, ...a] = l.slice(2).split("|"); return { q: q.trim(), a: a.join("|").trim() }; }) };
    }
    if (chunk.startsWith("> ")) return { type: "callout", tone: "info", text: lines.map((l) => l.replace(/^>\s?/, "")).join("\n") };
    const btn = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(chunk);
    if (btn) return { type: "button", label: btn[1], href: btn[2] };
    return { type: "paragraph", text: chunk };
  });
  return blocksSchema.parse(blocks);
}

export function blocksToSource(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "heading":
          return `${b.level === 3 ? "###" : "##"} ${b.text}`;
        case "paragraph":
          return b.text;
        case "list":
          return b.items.map((i, n) => (b.ordered ? `${n + 1}. ${i}` : `- ${i}`)).join("\n");
        case "callout":
          return `> ${b.text}`;
        case "button":
          return `[${b.label}](${b.href})`;
        case "faq":
          return b.items.map((i) => `? ${i.q} | ${i.a}`).join("\n");
      }
    })
    .join("\n\n");
}
