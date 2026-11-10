import { runtime } from "@runtime";
import { handle } from "@/lib/server/api";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const rt = await runtime(request);
  // Next's request-scoped `after` keeps background work (report rendering)
  // alive after the response is sent, which is what makes a long render finish
  // on a serverless host even after the caller has navigated away. Runtimes
  // that already supply their own waitUntil (Cloudflare's ctx.waitUntil) are
  // left untouched.
  if (!rt.waitUntil) {
    const { after } = await import("next/server");
    rt.waitUntil = (job) =>
      void after(async () => {
        await job.catch(() => {});
      });
  }
  return handle(rt, request);
}
export const POST = GET,
  PUT = GET,
  PATCH = GET;
