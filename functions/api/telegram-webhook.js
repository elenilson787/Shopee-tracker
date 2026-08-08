export async function onRequestPost(context) {
    const { request, env } = context;
    const TELEGRAM_TOKEN = env.TELEGRAM_BOT_TOKEN;
    const SHOPEE_APP_ID = env.SHOPEE_APP_ID;
    const SHOPEE_SECRET = env.SHOPEE_SECRET;

    try {
        const update = await request.json();

        // 1. Tratamento para mensagens de texto (ex: /start)
        if (update.message) {
            const chatId = update.message.chat.id;
            const text = update.message.text || "";

            if (text.startsWith("/start")) {
                await sendTelegramMessage(TELEGRAM_TOKEN, chatId, 
                    "🔥 *RADAR DE OFERTAS SHOPEE EM TEMPO REAL!*\n\n" +
                    "Eu busco no catálogo da Shopee as melhores promoções e descontos do momento.\n\n" +
                    "👇 Escolha um nicho para realizar uma varredura ao vivo:",
                    {
                        inline_keyboard: [
                            [{ text: "🏠 Casa & Cozinha", callback_data: "nicho_casa" }],
                            [{ text: "📱 Eletrônicos & Tech", callback_data: "nicho_tech" }],
                            [{ text: "👗 Moda & Acessórios", callback_data: "nicho_moda" }]
                        ]
                    }
                );
            }
        }

        // 2. Tratamento para cliques nos botões (Varredura na Shopee)
        if (update.callback_query) {
            const callback = update.callback_query;
            const chatId = callback.message.chat.id;
            const action = callback.data;

            let keyword = "";
            let nomeNicho = "";

            if (action === "nicho_casa") {
                keyword = "casa e cozinha";
                nomeNicho = "🏠 Casa & Cozinha";
            } else if (action === "nicho_tech") {
                keyword = "eletronicos";
                nomeNicho = "📱 Eletrônicos & Tech";
            } else if (action === "nicho_moda") {
                keyword = "moda";
                nomeNicho = "👗 Moda & Acessórios";
            }

            if (keyword) {
                // Mensagem de busca em andamento
                await sendTelegramMessage(TELEGRAM_TOKEN, chatId, `🔎 *Varrendo o catálogo da Shopee para ${nomeNicho}...*`);

                // Busca a oferta real na API GraphQL da Shopee
                const produto = await buscarOfertaShopee(keyword, SHOPEE_APP_ID, SHOPEE_SECRET);

                if (produto) {
                    const legenda = 
                        `🎯 *OFERTA ENCONTRADA EM TEMPO REAL!*\n\n` +
                        `📦 *${produto.titulo}*\n` +
                        `💰 *Preço:* R$ ${produto.preco}\n\n` +
                        `⚡ *Link promocional gerado com sucesso!*`;

                    const botoes = {
                        inline_keyboard: [
                            [{ text: "🛒 Comprar na Shopee", url: produto.link }],
                            [{ text: "🔄 Buscar Outra Oferta", callback_data: action }]
                        ]
                    };

                    if (produto.imagem) {
                        await sendTelegramPhoto(TELEGRAM_TOKEN, chatId, produto.imagem, legenda, botoes);
                    } else {
                        await sendTelegramMessage(TELEGRAM_TOKEN, chatId, legenda, botoes);
                    }
                } else {
                    await sendTelegramMessage(TELEGRAM_TOKEN, chatId, "⚠️ *Aviso:* Não consegui buscar ofertas da Shopee. Verifique se cadastrou o `SHOPEE_APP_ID` e `SHOPEE_SECRET` nas Variáveis de Ambiente do Cloudflare!");
                }
            }
        }

        return new Response("OK", { status: 200 });
    } catch (err) {
        return new Response("OK", { status: 200 });
    }
}

// 🌐 Função que consulta a API GraphQL da Shopee em tempo real
async function buscarOfertaShopee(keyword, appId, secret) {
    if (!appId || !secret) return null;

    try {
        const query = `
            query {
                productOfferV2(keyword: "${keyword}", limit: 15, page: 1) {
                    nodes {
                        productName
                        price
                        offerLink
                        imageUrl
                    }
                }
            }
        `;

        const timestamp = Math.floor(Date.now() / 1000);
        const payload = JSON.stringify({ query });

        // Gera a assinatura HMAC-SHA256 exigida pela Shopee
        const baseString = appId + timestamp + payload + secret;
        const encoder = new TextEncoder();
        const keyData = encoder.encode(secret);
        const messageData = encoder.encode(baseString);

        const cryptoKey = await crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
        const signature = Array.from(new Uint8Array(signatureBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

        const response = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`
            },
            body: payload
        });

        const data = await response.json();
        const produtos = data?.data?.productOfferV2?.nodes;

        if (produtos && produtos.length > 0) {
            // Sorteia 1 produto dos resultados para variar as ofertas a cada clique
            const produtoSorteado = produtos[Math.floor(Math.random() * produtos.length)];
            return {
                titulo: produtoSorteado.productName,
                preco: parseFloat(produtoSorteado.price || 0).toFixed(2).replace(".", ","),
                link: produtoSorteado.offerLink,
                imagem: produtoSorteado.imageUrl
            };
        }

        return null;
    } catch (e) {
        return null;
    }
}

// 💬 Auxiliares do Telegram
async function sendTelegramMessage(token, chatId, text, replyMarkup = null) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: "Markdown",
            reply_markup: replyMarkup
        })
    });
}

async function sendTelegramPhoto(token, chatId, photoUrl, caption, replyMarkup = null) {
    await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            photo: photoUrl,
            caption: caption,
            parse_mode: "Markdown",
            reply_markup: replyMarkup
        })
    });
}
