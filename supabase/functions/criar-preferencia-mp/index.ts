import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function getSecret(admin: ReturnType<typeof createClient>, key: string): Promise<string | null> {
  const { data } = await admin.from("app_secrets").select("value").eq("key", key).single();
  return data?.value ?? null;
}

// Nunca confiamos cegamente no "origin" enviado pelo cliente para montar os
// back_urls do Mercado Pago (isso seria um open redirect: qualquer chamador
// autenticado poderia mandar o retorno do pagamento para um domínio de
// phishing). Só aceitamos localhost (dev) e *.vercel.app / domínios de
// produção conhecidos.
const ALLOWED_ORIGIN_SUFFIXES = [".vercel.app"];
const ALLOWED_ORIGIN_HOSTS = ["localhost", "127.0.0.1"];
// Quando o domínio definitivo do site estiver definido, adicione-o aqui, ex.:
// ALLOWED_ORIGIN_HOSTS.push("uniformes.igrejametodista.org.br");

function isAllowedOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (ALLOWED_ORIGIN_HOSTS.includes(u.hostname)) return true;
    return ALLOWED_ORIGIN_SUFFIXES.some((suffix) => u.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cliente "no papel do usuário" só para descobrir quem está chamando
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData?.user) {
      return jsonResponse({ error: "Não autenticado." }, 401);
    }
    const userId = userData.user.id;

    const { order_id, origin } = await req.json();
    if (!order_id) {
      return jsonResponse({ error: "order_id é obrigatório." }, 400);
    }

    // Cliente com service role para ler/gravar sem depender das policies de RLS
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: order, error: orderError } = await admin
      .from("orders")
      .select("id, user_id, buyer_name, status, payment_method, valor_total")
      .eq("id", order_id)
      .single();

    if (orderError || !order) {
      return jsonResponse({ error: "Pedido não encontrado." }, 404);
    }
    if (order.user_id !== userId) {
      return jsonResponse({ error: "Este pedido não pertence a você." }, 403);
    }
    if (order.payment_method !== "mercado_pago") {
      return jsonResponse({ error: "Este pedido não usa pagamento online." }, 400);
    }
    if (order.status !== "aguardando_pagamento") {
      return jsonResponse({ error: "Este pedido já foi processado." }, 400);
    }

    const { data: itens, error: itensError } = await admin
      .from("order_items")
      .select("nome_camisa, numero, valor, produto, products(nome)")
      .eq("order_id", order_id);

    if (itensError || !itens || itens.length === 0) {
      return jsonResponse({ error: "Itens do pedido não encontrados." }, 404);
    }

    const MP_ACCESS_TOKEN = await getSecret(admin, "MP_ACCESS_TOKEN");
    if (!MP_ACCESS_TOKEN) {
      return jsonResponse({
        error: "Pagamento online ainda não está configurado. Peça para o administrador configurar o Mercado Pago, ou escolha pagar em dinheiro.",
      }, 200);
    }

    const siteOrigin = typeof origin === "string" && isAllowedOrigin(origin) ? origin : SUPABASE_URL;

    const mpItems = itens.map((it: any) => ({
      title: `${it.products?.nome ?? it.produto} - ${it.nome_camisa}${it.numero != null ? " (Nº " + it.numero + ")" : ""}`,
      quantity: 1,
      unit_price: Number(it.valor),
      currency_id: "BRL",
    }));

    const mpResp = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        items: mpItems,
        external_reference: order.id,
        payer: { name: order.buyer_name },
        back_urls: {
          success: `${siteOrigin}/pedido-confirmado.html?order=${order.id}`,
          failure: `${siteOrigin}/pedido-confirmado.html?order=${order.id}`,
          pending: `${siteOrigin}/pedido-confirmado.html?order=${order.id}`,
        },
        auto_return: "approved",
        notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
      }),
    });

    const mpData = await mpResp.json();
    if (!mpResp.ok) {
      console.error("Erro Mercado Pago:", mpData);
      return jsonResponse({ error: "Não foi possível iniciar o pagamento no Mercado Pago." }, 200);
    }

    const isTestToken = MP_ACCESS_TOKEN.startsWith("TEST-");
    const checkoutUrl = isTestToken ? (mpData.sandbox_init_point ?? mpData.init_point) : (mpData.init_point ?? mpData.sandbox_init_point);

    await admin.from("orders").update({ mp_preference_id: mpData.id }).eq("id", order.id);

    return jsonResponse({ checkout_url: checkoutUrl });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "Erro inesperado ao iniciar o pagamento." }, 500);
  }
});
