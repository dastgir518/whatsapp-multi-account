import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { InvitePageClient } from "@/components/InvitePageClient";

type Props = { params: Promise<{ token: string }> };

export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const account = await prisma.waAccount.findUnique({
    where: { inviteToken: token },
  });
  if (!account) notFound();

  return (
    <InvitePageClient
      token={token}
      phone={account.phone}
      initialStatus={account.status}
    />
  );
}
