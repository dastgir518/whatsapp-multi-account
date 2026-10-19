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

  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const jid = String(form.get("jid") || "");
    const caption = form.get("caption") ? String(form.get("caption")) : "";
    const file = form.get("file");
    if (!jid || !(file instanceof File)) {
      return NextResponse.json(
        { error: "jid and file required" },
        { status: 400 }
      );
    }

    const forward = new FormData();
    forward.append("jid", jid);
    if (caption) forward.append("caption", caption);
    forward.append("file", file, file.name);

    const res = await gatewayFetch(`/accounts/${id}/send-media`, {
      method: "POST",
      body: forward,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || "Send failed" },
        { status: res.status }
      );
    }
    return NextResponse.json({ ok: true });
  }

  const body = (await req.json()) as { jid?: string; text?: string };
  if (!body.jid || !body.text?.trim()) {
    return NextResponse.json(
      { error: "jid and text required" },
      { status: 400 }
    );
  }

  const res = await gatewayFetch(`/accounts/${id}/send-text`, {
    method: "POST",
    body: JSON.stringify({ jid: body.jid, text: body.text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: data.error || "Send failed" },
      { status: res.status }
    );
  }
  return NextResponse.json({ ok: true });
}
