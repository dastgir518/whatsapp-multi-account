import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gatewayFetch } from "@/lib/gateway";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.waAccount.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ accounts });
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

    const account = await prisma.waAccount.upsert({
      where: {
        userId_phone: { userId: session.userId, phone },
      },
      create: {
        userId: session.userId,
        phone,
        status: "pending",
      },
      update: {
        status: "pending",
      },
    });

    // Kick off Baileys session so QR / pairing code arrive over Socket.IO
    await gatewayFetch(`/accounts/${account.id}/start`, { method: "POST" });

    return NextResponse.json({ account });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}
