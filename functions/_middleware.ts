/** Cloudflare Pages Functions ミドルウェア。
 *  `/?sat=<NORAD>` への HTML リクエストだけ、静的 index.html の OGP メタを
 *  衛星名入りに書き換える (SNS 共有カードが衛星ごとになる)。
 *  それ以外のリクエストは素通しなので静的配信の性質は変わらない。 */
import { buildOgStrings, isValidSatParam } from "./_ogText";

interface AssetsEnv {
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
}

interface MiddlewareContext {
  request: Request;
  env: AssetsEnv;
  next: () => Promise<Response>;
}

// HTMLRewriter は Cloudflare ランタイムのグローバル
declare const HTMLRewriter: {
  new (): {
    on(selector: string, handlers: { element(e: RewriterElement): void }): unknown;
    transform(res: Response): Response;
  };
};
interface RewriterElement {
  setAttribute(name: string, value: string): void;
  setInnerContent(content: string): void;
}

// isolate 生存中は使い回す (satnames.json は ~1MB 弱・リクエスト毎に読むには重い)
let namesCache: Record<string, string> | null = null;

export const onRequest = async (ctx: MiddlewareContext): Promise<Response> => {
  const url = new URL(ctx.request.url);
  const sat = url.searchParams.get("sat");
  const isAppShell = url.pathname === "/" || url.pathname === "/index.html";
  if (!isAppShell || !isValidSatParam(sat)) return ctx.next();

  const res = await ctx.next();

  if (!namesCache) {
    try {
      const nRes = await ctx.env.ASSETS.fetch(new URL("/data/satnames.json", url.origin).toString());
      if (nRes.ok) namesCache = (await nRes.json()) as Record<string, string>;
    } catch {
      /* 名前索引が無ければ書き換えない */
    }
  }
  const name = namesCache?.[sat];
  if (!name) return res;

  const og = buildOgStrings(name, sat);
  const rewriter = new HTMLRewriter();
  rewriter.on("title", { element: (e) => e.setInnerContent(og.title) });
  rewriter.on('meta[property="og:title"]', { element: (e) => e.setAttribute("content", og.title) });
  rewriter.on('meta[property="og:description"]', { element: (e) => e.setAttribute("content", og.description) });
  rewriter.on('meta[name="description"]', { element: (e) => e.setAttribute("content", og.description) });
  rewriter.on('meta[property="og:url"]', { element: (e) => e.setAttribute("content", og.url) });
  return rewriter.transform(res);
};
