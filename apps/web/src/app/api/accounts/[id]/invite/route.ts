import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

/** Revoke / delete the public invite link for an account */
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

  if (!account.inviteToken) {
    return NextResponse.json({ ok: true, alreadyRevoked: true });
  }

  const updated = await prisma.waAccount.update({
    where: { id },
    data: { inviteToken: null },
  });

  return NextResponse.json({
    ok: true,
    account: {
      ...updated,
      lastSeenAt: updated.lastSeenAt?.toISOString() ?? null,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}
