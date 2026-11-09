import { runtime } from "@runtime";
import { handle } from "@/lib/server/api";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(await runtime(request), request);
}
export const POST = GET,
  PUT = GET,
  PATCH = GET;
