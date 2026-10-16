import { NextResponse } from "next/server";
import { z } from "zod";
import { converse, newWebConversationId } from "@/lib/chatService";
import { GREETING, MENU, initialState } from "@/lib/conversation";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { errorResponse, tooMany } from "@/lib/http";

export const dynamic = "force-dynamic";

const body = z.object({
  conversationId: z.string().regex(/^web:[A-Za-z0-9_-]{20,40}$/).optional(),
  message: z.string().max(1000),
});

export async function POST(req: Request) {
  const rl = rateLimit(`chat:${clientIp(req)}`, Number(process.env.RATE_LIMIT_CHAT_PER_MIN ?? 30), 60_000);
  if (!rl.ok) return tooMany(rl.retryAfterSec);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const { message } = parsed.data;
  if (!parsed.data.conversationId) {
    // New conversation: greeting needs no database, so the chat still opens during an outage.
    return NextResponse.json({ conversationId: newWebConversationId(), state: initialState().step, messages: [{ text: GREETING }], quickReplies: MENU });
  }
  try {
    const t = await converse(parsed.data.conversationId, "website", message);
    return NextResponse.json({ conversationId: parsed.data.conversationId, step: t.state.step, messages: t.messages, quickReplies: t.quickReplies, progress: t.progress });
  } catch (err) {
    return errorResponse(err);
  }
}
