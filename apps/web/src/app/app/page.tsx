import { redirect } from "next/navigation";
import { getSession, getTokenFromCookies } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ChatApp } from "@/components/ChatApp";

export default async function AppPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const token = await getTokenFromCookies();
  if (!token) redirect("/login");

  const accounts = await prisma.waAccount.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "asc" },
  });

  return (
    <ChatApp
      initialAccounts={accounts.map((a) => ({
        ...a,
        lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
        createdAt: a.createdAt.toISOString(),
      }))}
      userEmail={session.email}
      token={token}
    />
  );
}
