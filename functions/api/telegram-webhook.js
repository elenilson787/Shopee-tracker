export async function onRequestPost(context) {
    const { request, env } = context;
    const TELEGRAM_TOKEN = env.TELEGRAM_BOT_TOKEN;
    const SHOPEE_APP_ID = env.SHOPEE_APP_ID;
    const SHOPEE_SECRET = env.SHOPEE_SECRET;

    try {
        const update = await request.json();

        // 1. Mensagem /start
        if (update.message && update.message.text && update.message.text.startsWith("/start")) {
            const chatId = update.message.chat.id;
            await sendTelegramMessage(TELEGRAM_TOKEN, chatId, 
                "🔥 RADAR DE OFERTAS SHOPEE EM TEMPO REAL!\n\nEscolha abaixo um nicho para realizar uma varredura ao vivo:",
                {
                    inline_keyboard: [
                        [{ text: "🏠 Casa & Cozinha", callback_data: "nicho_casa" }],
                        [{ text: "📱 Eletrônicos & Tech", callback_data: "nicho_tech" }],
                        [{ text: "👗 Moda & Acessórios", callback_data: "nicho_moda" }]
                    ]
                }
            );
            return new Response("OK", { status: 200 });
        }

        // 2. Clique nos botões (Callback Query)
        if (update.callback_query) {
            const callback = update.callback_query;
            const chatId = callback.message.chat.id;
            const action = callback.data;

            // Destrava o botão do aplicativo imediatamente
            await answerCallback(TELEGRAM_TOKEN, callback.id);

            let keyword = "";
            let nomeNicho = "";

            if (action === "nicho_casa") { keyword = "casa e cozinha"; nomeNicho = "Casa & Cozinha"; }
            if (action === "nicho_tech") { keyword = "eletronicos"; nomeNicho = "Eletrônicos & Tech"; }
            if (action === "nicho_moda") { keyword = "moda"; nomeNicho = "Moda & Acessórios"; }

            if (keyword) {
                await sendTelegramMessage(TELEGRAM_TOKEN, chatId, `🔎 Varrendo a Shopee para ${nomeNicho}...`);

                if (!SHOPEE_APP_ID || !SHOPEE_SECRET) {
                    await sendTelegramMessage(TELEGRAM_TOKEN, chatId, "⚠️ Faltam as chaves SHOPEE_APP_ID ou SHOPEE_SECRET salvas na Cloudflare!");
                    return new Response("OK", { status: 200 });
                }

                const produto = await buscarOfertaShopee(keyword, SHOPEE_APP_ID, SHOPEE_SECRET);

                if (produto) {
                    const legenda = 
                        `🎯 OFERTA ENCONTRADA!\n\n` +
                        `📦 ${produto.titulo}\n` +
                        `💰 Preço: R$ ${produto.preco}\n\n` +
                        `⚡ Aproveite a promoção!`;

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
                    await sendTelegramMessage(TELEGRAM_TOKEN, chatId, "⚠️ A API da Shopee não retornou ofertas agora. Tente clicar no botão novamente.");
                }
            }
            return new Response("OK", { status: 200 });
        }

        return new Response("OK", { status: 200 });
    } catch (err) {
        return new Response("OK", { status: 200 });
    }
}

// Destrava o relógio de espera no botão
async function answerCallback(token, callbackId) {
    try {
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callback_query_id: callbackId })
        });
    } catch(e) {}
}

// Busca GraphQL na API da Shopee
async function buscarOfertaShopee(keyword, appId, secret) {
    try {
        const query = `
            query {
                productOfferV2(keyword: "${keyword}", limit: 10, page: 1) {
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

async function sendTelegramMessage(token, chatId, text, replyMarkup = null) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
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
            reply_markup: replyMarkup
        })
    });
}
