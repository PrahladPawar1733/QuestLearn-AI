/**
 * Turns lesson text (Markdown + $LaTeX$) into something a voice can read:
 * "$p = mv$" → "p equals m v", "\frac{1}{2}mv^2" → "1 over 2 m v squared".
 * Pure, so it is shared by the server (TTS) and tests.
 */
export function speakable(text: string): string {
  const math = (s: string) =>
    s
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, " $1 over $2 ")
      .replace(/\\(?:vec|mathbf|mathrm|text|operatorname)\{([^{}]*)\}/g, "$1")
      .replace(/\^\{?2\}?/g, " squared ")
      .replace(/\^\{?3\}?/g, " cubed ")
      .replace(/\^\{([^{}]*)\}/g, " to the power $1 ")
      .replace(/\^(\S)/g, " to the power $1 ")
      .replace(/_\{([^{}]*)\}/g, " $1 ")
      .replace(/_(\S)/g, " $1 ")
      .replace(/\\(times|cdot)/g, " times ")
      .replace(/\\Delta\s*/g, " change in ")
      .replace(/\\(alpha|beta|gamma|theta|lambda|mu|pi|rho|sigma|omega|delta)/g, " $1 ")
      .replace(/\\(rightarrow|to|implies)/g, " gives ")
      .replace(/\\(approx)/g, " approximately ")
      .replace(/\\(propto)/g, " is proportional to ")
      .replace(/\\(leq|le)\b/g, " less than or equal to ")
      .replace(/\\(geq|ge)\b/g, " greater than or equal to ")
      .replace(/=/g, " equals ")
      .replace(/\+/g, " plus ")
      .replace(/(\s)-(\s)/g, "$1minus$2")
      .replace(/\//g, " per ")
      .replace(/\\[a-zA-Z]+/g, " ")
      .replace(/[{}\\]/g, " ");
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => math(m))
    .replace(/\$([^$]+)\$/g, (_, m) => math(m))
    .replace(/[*_#`>]/g, "")
    .replace(/\[(illegible|diagram:[^\]]*)\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}
