import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gatewayFetch } from "@/lib/gateway";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
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

  try {
    await gatewayFetch(`/accounts/${id}/disconnect`, {
      method: "POST",
      body: JSON.stringify({ logout: true }),
    });
  } catch {
    /* ignore gateway errors on delete */
  }

  await prisma.waAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
