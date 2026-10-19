import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gatewayFetch } from "@/lib/gateway";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const account = await prisma.waAccount.findFirst({
    where: { id, userId: session.userId },
  });
  if (!account) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json()) as {
    jid?: string;
    messageIds?: string[];
  };
  if (!body.jid || !Array.isArray(body.messageIds)) {
    return NextResponse.json(
      { error: "jid and messageIds required" },
      { status: 400 }
    );
  }

  const res = await gatewayFetch(`/accounts/${id}/mark-read`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: data.error || "Mark read failed" },
      { status: res.status }
    );
  }
  return NextResponse.json({ ok: true });
}
