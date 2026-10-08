/** Task R3: a shared teammate goes to the public gallery through a prefilled GitHub
 * issue form, with no Git. Sidemates only fills the form in the owner's browser;
 * nothing is sent until they submit it on GitHub. */

export const GALLERY_ISSUE_FORM = "https://github.com/PrisacariuRobert/sidemates/issues/new";
/** Browsers and GitHub accept long addresses, but not unlimited ones. Above this the
 * teammate file is copied instead, to paste into the form. */
export const MAX_FORM_URL = 7_500;

export function gallerySlug(name: string): string {
  return name.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "teammate";
}

export function galleryIssueUrl(bundle: { bot: { name: string }; about?: string }, json: string): { url: string; includesFile: boolean } {
  const params = (withFile: boolean) => new URLSearchParams({
    template: "gallery_submission.yml",
    title: `[Gallery] ${bundle.bot.name}`,
    slug: gallerySlug(bundle.bot.name),
    ...(bundle.about ? { about: bundle.about } : {}),
    ...(withFile ? { teammate: json } : {}),
  });
  const full = `${GALLERY_ISSUE_FORM}?${params(true)}`;
  return full.length <= MAX_FORM_URL ? { url: full, includesFile: true } : { url: `${GALLERY_ISSUE_FORM}?${params(false)}`, includesFile: false };
}

/** The fields of a submitted issue form, as GitHub writes them into the issue body. */
export function readGalleryIssue(body: string): { slug: string; about: string; json: string } | { error: string } {
  const section = (label: string) => {
    const match = new RegExp(`^### ${label}\\s*\\n([\\s\\S]*?)(?=^### |$(?![\\s\\S]))`, "m").exec(body.replace(/\r\n/g, "\n"));
    const value = match?.[1]?.trim() ?? "";
    return value === "_No response_" ? "" : value;
  };
  const slug = section("Short name for the gallery"), about = section("One sentence about it");
  const json = section("Teammate file").replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(slug)) return { error: "The short name must be lowercase letters, numbers and dashes, like receipt-keeper." };
  if (about.length < 30 || about.length > 240) return { error: "Describe it in one sentence of 30 to 240 characters." };
  if (!json) return { error: "Paste the teammate file into the form." };
  return { slug, about, json };
}
