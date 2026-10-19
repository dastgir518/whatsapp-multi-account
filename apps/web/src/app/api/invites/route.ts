import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gatewayFetch } from "@/lib/gateway";

function makeInviteToken() {
  return randomBytes(16).toString("hex");
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.waAccount.findMany({
    where: {
      userId: session.userId,
      inviteToken: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ invites: accounts });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as { phone?: string };
    const phone = (body.phone || "").replace(/\D/g, "");
    if (!phone || phone.length < 8) {
      return NextResponse.json(
        { error: "Enter phone with country code (digits only)" },
        { status: 400 }
      );
    }

    const inviteToken = makeInviteToken();

    const account = await prisma.waAccount.upsert({
      where: {
        userId_phone: { userId: session.userId, phone },
      },
      create: {
        userId: session.userId,
        phone,
        status: "pending",
        inviteToken,
      },
      update: {
        status: "pending",
        inviteToken,
      },
    });

    await gatewayFetch(`/invites/${account.inviteToken}/start`, {
      method: "POST",
    });

    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      req.headers.get("origin") ||
      "http://localhost:3000";

    return NextResponse.json({
      account,
      inviteUrl: `${origin}/invite/${account.inviteToken}`,
      inviteToken: account.inviteToken,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to create invite" },
      { status: 500 }
    );
  }
}
