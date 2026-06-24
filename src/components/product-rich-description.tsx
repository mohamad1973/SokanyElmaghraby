import { VisualEditableText } from "./visual-editable-text";

type ProductRichDescriptionProps = {
  html?: string;
  fallbackText?: string;
};

const dangerousTagPattern = /<\/?(script|style|iframe|object|embed|form|input|button|svg|meta|link|base)[^>]*>/gi;
const dangerousAttributePattern = /\s(on\w+|style|formaction)=(".*?"|'.*?'|[^\s>]+)/gi;
const dangerousProtocolPattern = /(href|src)=("|\')\s*(javascript:|data:text\/html)/gi;
const allowedVideoHosts = ["youtube.com", "youtu.be", "facebook.com", "fb.watch"];

function sanitizeHtml(html = "") {
  return html
    .replace(dangerousTagPattern, "")
    .replace(dangerousAttributePattern, "")
    .replace(dangerousProtocolPattern, "$1=$2#")
    .replace(/<a\s/gi, '<a target="_blank" rel="noopener noreferrer" ')
    .replace(/<table/gi, '<div class="product-rich-table-wrap"><table')
    .replace(/<\/table>/gi, "</table></div>");
}

function extractLinks(html = "") {
  const links = new Set<string>();
  const anchorPattern = /href=["']([^"']+)["']/gi;
  const plainUrlPattern = /https?:\/\/[^\s<>"']+/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorPattern.exec(html))) {
    links.add(match[1]);
  }

  while ((match = plainUrlPattern.exec(html))) {
    links.add(match[0]);
  }

  return Array.from(links);
}

function getYouTubeEmbedUrl(url: string) {
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.hostname.includes("youtu.be")) {
      const videoId = parsedUrl.pathname.replace("/", "");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }

    if (parsedUrl.hostname.includes("youtube.com")) {
      const videoId = parsedUrl.searchParams.get("v") || parsedUrl.pathname.split("/").pop();
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }
  } catch {
    return null;
  }

  return null;
}

function isVideoOrSocialLink(url: string) {
  try {
    const host = new URL(url).hostname.replace("www.", "");
    return allowedVideoHosts.some((allowedHost) => host.includes(allowedHost));
  } catch {
    return false;
  }
}

export function ProductRichDescription({ html, fallbackText }: ProductRichDescriptionProps) {
  const cleanHtml = sanitizeHtml(html);
  const mediaLinks = extractLinks(html).filter(isVideoOrSocialLink);
  const hasContent = cleanHtml.trim().length > 0;

  if (!hasContent && !fallbackText) {
    return null;
  }

  return (
    <section className="mt-16 rounded-[2rem] bg-white p-5 shadow-sm sm:p-8" dir="rtl">
      <div className="mb-6">
        <p className="text-sm font-bold tracking-[0.25em] text-brand-gold">
          <VisualEditableText textKey="product.richDetails.eyebrow">التفاصيل</VisualEditableText>
        </p>
        <h2 className="mt-2 text-2xl font-bold text-zinc-950">
          <VisualEditableText textKey="product.richDetails.title">تفاصيل ومواصفات المنتج</VisualEditableText>
        </h2>
      </div>

      {hasContent ? (
        <div
          className="product-rich-description"
          dangerouslySetInnerHTML={{ __html: cleanHtml }}
        />
      ) : (
        <p className="leading-9 text-zinc-600">{fallbackText}</p>
      )}

      {mediaLinks.length ? (
        <div className="mt-8 grid gap-4">
          <h3 className="text-lg font-bold text-zinc-950">
            <VisualEditableText textKey="product.richDetails.mediaTitle">روابط وفيديوهات المنتج</VisualEditableText>
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {mediaLinks.map((url) => {
              const youtubeEmbedUrl = getYouTubeEmbedUrl(url);

              return (
                <div key={url} className="overflow-hidden rounded-3xl border border-black/10 bg-zinc-50">
                  {youtubeEmbedUrl ? (
                    <iframe
                      src={youtubeEmbedUrl}
                      title="فيديو المنتج"
                      className="aspect-video w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : null}
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-5 py-4 text-sm font-bold text-zinc-950 transition hover:text-brand-gold"
                  >
                    <VisualEditableText textKey="product.richDetails.watchMedia">مشاهدة الرابط أو الفيديو</VisualEditableText>
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
