import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function getSecret(admin: ReturnType<typeof createClient>, key: string): Promise<string | null> {
  const { data } = await admin.from("app_secrets").select("value").eq("key", key).single();
  return data?.value ?? null;
}

// Webhook público do Mercado Pago. Nunca confiamos no corpo da notificação:
// sempre buscamos o status real do pagamento na API do Mercado Pago usando
// nosso token secreto antes de atualizar qualquer pedido.
Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    let paymentId = url.searchParams.get("data.id") || url.searchParams.get("id");
    let type = url.searchParams.get("type") || url.searchParams.get("topic");

    if (!paymentId && req.method === "POST") {
      try {
        const body = await req.json();
        paymentId = body?.data?.id ?? body?.id ?? null;
        type = body?.type ?? body?.topic ?? type;
      } catch (_e) {
        // corpo vazio ou não-JSON: segue só com os query params
      }
    }

    if (type && type !== "payment") {
      return new Response("ok", { status: 200 });
    }
    if (!paymentId) {
      return new Response("ok", { status: 200 });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const MP_ACCESS_TOKEN = await getSecret(admin, "MP_ACCESS_TOKEN");
    if (!MP_ACCESS_TOKEN) {
      console.error("MP_ACCESS_TOKEN não configurado.");
      return new Response("ok", { status: 200 });
    }

    const paymentResp = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    if (!paymentResp.ok) {
      console.error("Falha ao consultar pagamento no Mercado Pago", await paymentResp.text());
      return new Response("ok", { status: 200 });
    }
    const payment = await paymentResp.json();

    const orderId = payment.external_reference;
    if (!orderId) {
      return new Response("ok", { status: 200 });
    }

    let novoStatus: string | null = null;
    if (payment.status === "approved") novoStatus = "pago";
    else if (["rejected", "cancelled", "refunded", "charged_back"].includes(payment.status)) novoStatus = "cancelado";
    // pending / in_process / authorized: não muda o status ainda

    const { data: order } = await admin
      .from("orders")
      .select("id, valor_total, payment_method")
      .eq("id", orderId)
      .eq("payment_method", "mercado_pago")
      .single();

    if (!order) {
      return new Response("ok", { status: 200 });
    }

    const update: Record<string, unknown> = { mp_payment_id: String(payment.id) };
    if (novoStatus) {
      update.status = novoStatus;
      update.valor_pago = novoStatus === "pago" ? order.valor_total : 0;
    }

    await admin.from("orders").update(update).eq("id", orderId);

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("ok", { status: 200 });
  }
});
