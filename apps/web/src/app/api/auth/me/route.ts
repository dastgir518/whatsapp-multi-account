import { NextResponse } from "next/server";
import { getSession, getTokenFromCookies } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const token = await getTokenFromCookies();
  return NextResponse.json({
    user: { id: session.userId, email: session.email },
    token,
  });
}
