import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
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

  const chats = await prisma.chat.findMany({
    where: { waAccountId: id },
    orderBy: { lastMessageAt: "desc" },
  });

  return NextResponse.json({ chats });
}
