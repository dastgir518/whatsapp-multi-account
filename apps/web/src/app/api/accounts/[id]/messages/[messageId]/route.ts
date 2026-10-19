import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gatewayFetch } from "@/lib/gateway";

type Params = { params: Promise<{ id: string; messageId: string }> };

export async function DELETE(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, messageId } = await params;
  const account = await prisma.waAccount.findFirst({
    where: { id, userId: session.userId },
  });
  if (!account) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const message = await prisma.message.findFirst({
    where: { id: messageId, chat: { waAccountId: id } },
  });
  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const forEveryone = url.searchParams.get("forEveryone") === "1";

  // Prefer gateway so WhatsApp revoke happens when requested
  try {
    const res = await gatewayFetch(`/accounts/${id}/delete-message`, {
      method: "POST",
      body: JSON.stringify({ messageId, forEveryone }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Fall back to local delete-for-me if gateway is down / not connected
      if (!forEveryone) {
        await prisma.message.delete({ where: { id: messageId } });
        return NextResponse.json({ ok: true, localOnly: true });
      }
      return NextResponse.json(
        { error: data.error || "Delete failed" },
        { status: res.status }
      );
    }
    return NextResponse.json({ ok: true });
  } catch {
    if (!forEveryone) {
      await prisma.message.delete({ where: { id: messageId } });
      return NextResponse.json({ ok: true, localOnly: true });
    }
    return NextResponse.json(
      { error: "Gateway unavailable" },
      { status: 503 }
    );
  }
}
