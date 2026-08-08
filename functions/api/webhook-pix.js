export async function onRequestPost(context) {
    const { request, env } = context;
    const MP_ACCESS_TOKEN = env.MP_ACCESS_TOKEN;
    const TELEGRAM_TOKEN = env.TELEGRAM_BOT_TOKEN;

    try {
        const url = new URL(request.url);
        const body = await request.json().catch(() => ({}));
        const paymentId = body.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id");

        if (!paymentId) return new Response("OK", { status: 200 });

        // Valida se o Pix foi pago de verdade no Mercado Pago
        const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` }
        });

        const paymentInfo = await mpResponse.json();

        if (paymentInfo.status === "approved") {
            const userId = paymentInfo.metadata?.user_id;

            if (userId && TELEGRAM_TOKEN) {
                await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        chat_id: userId,
                        text: `🎉 *PAGAMENTO PIX CONFIRMADO!*\n\nSua recarga foi aprovada com sucesso. Você recebeu *+5 buscas no seu nicho* para usar hoje! 🚀\n\nClique no menu para buscar novas ofertas.`,
                        parse_mode: "Markdown"
                    })
                });
            }
        }

        return new Response("OK", { status: 200 });
    } catch (err) {
        return new Response("OK", { status: 200 });
    }
}
