import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publicGatewayUrl } from "@/lib/config";

type Params = { params: Promise<{ token: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;

  const account = await prisma.waAccount.findUnique({
    where: { inviteToken: token },
  });
  if (!account) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  let qr: string | null = null;
  let pairingCode: string | null = null;

  try {
    const res = await fetch(`${publicGatewayUrl()}/invites/${token}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      qr = data.qr ?? null;
      pairingCode = data.pairingCode ?? null;
    }
  } catch {
    /* gateway may be starting */
  }

  return NextResponse.json({
    phone: account.phone,
    status: account.status,
    pushName: account.pushName,
    accountId: account.id,
    inviteToken: token,
    qr,
    pairingCode,
  });
}
