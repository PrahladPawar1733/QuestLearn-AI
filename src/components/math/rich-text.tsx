import katex from "katex";
import { cn } from "@/lib/cn";

function renderTex(tex: string, displayMode: boolean) {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: false, strict: "ignore", output: "html" });
  } catch {
    return tex;
  }
}

/**
 * Renders plain text with inline $...$ and display $$...$$ LaTeX.
 * Text segments are escaped by React; only KaTeX output is injected.
 */
export function RichText({ text, className, as: Tag = "span" }: { text: string; className?: string; as?: "span" | "p" | "div" }) {
  const parts: { t: "text" | "inline" | "display"; v: string }[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: "text", v: text.slice(last, m.index) });
    parts.push(m[1] !== undefined ? { t: "display", v: m[1] } : { t: "inline", v: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: "text", v: text.slice(last) });
  return (
    <Tag className={cn(className)}>
      {parts.map((p, i) =>
        p.t === "text" ? (
          <span key={i}>{p.v}</span>
        ) : (
          <span key={i} className={p.t === "display" ? "block" : undefined} dangerouslySetInnerHTML={{ __html: renderTex(p.v, p.t === "display") }} />
        ),
      )}
    </Tag>
  );
}

export function Tex({ tex, display = false, className }: { tex: string; display?: boolean; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: renderTex(tex, display) }} />;
}
