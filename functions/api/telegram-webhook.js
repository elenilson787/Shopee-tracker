export async function onRequestPost(context) {
    const { request, env } = context;
    const TELEGRAM_TOKEN = env.TELEGRAM_BOT_TOKEN;
    const SHOPEE_APP_ID = env.SHOPEE_APP_ID;
    const SHOPEE_SECRET = env.SHOPEE_SECRET;

    let chatId = null;

    try {
        const update = await request.json();

        // Extrai o chatId com segurança
        if (update.message && update.message.chat) {
            chatId = update.message.chat.id;
        } else if (update.callback_query && update.callback_query.message && update.callback_query.message.chat) {
            chatId = update.callback_query.message.chat.id;
        }

        // 1. Comando /start
        if (update.message && update.message.text && update.message.text.startsWith("/start")) {
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
            const action = callback.data;

            // Destrava o reloginho do botão no Telegram imediatamente
            await answerCallback(TELEGRAM_TOKEN, callback.id);

            let keyword = "";
            let nomeNicho = "";

            if (action === "nicho_casa") {
                keyword = "casa e cozinha";
                nomeNicho = "Casa & Cozinha";
            }
            if (action === "nicho_tech") {
                keyword = "eletronicos";
                nomeNicho = "Eletrônicos & Tech";
            }
            if (action === "nicho_moda") {
                keyword = "moda";
                nomeNicho = "Moda & Acessórios";
            }

            if (keyword && chatId) {
                // Notificação inicial de busca
                await sendTelegramMessage(TELEGRAM_TOKEN, chatId, `🔎 Varrendo o catálogo da Shopee para ${nomeNicho}...`);

                // Valida se as variáveis existem na Cloudflare
                if (!SHOPEE_APP_ID || !SHOPEE_SECRET) {
                    await sendTelegramMessage(TELEGRAM_TOKEN, chatId, "⚠️ Atenção: As variáveis SHOPEE_APP_ID ou SHOPEE_SECRET não foram encontradas na Cloudflare.");
                    return new Response("OK", { status: 200 });
                }

                // Busca a oferta real na Shopee
                const produto = await buscarOfertaShopee(keyword, SHOPEE_APP_ID, SHOPEE_SECRET);

                if (produto) {
                    const legenda =
                        `🎯 OFERTA RELÂMPAGO ENCONTRADA!\n\n` +
                        `📦 ${produto.titulo}\n` +
                        `💰 Preço: R$ ${produto.preco}\n` +
                        `🔥 Desconto: ${produto.desconto}% OFF\n\n` +
                        `⚡ Corre que está barato!`;

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
                    await sendTelegramMessage(TELEGRAM_TOKEN, chatId, "⚠️ Não encontrei nenhuma oferta forte (acima de 50% de desconto) neste momento. Tente novamente em instantes.");
                }
            }
            return new Response("OK", { status: 200 });
        }

        return new Response("OK", { status: 200 });
    } catch (err) {
        if (chatId && TELEGRAM_TOKEN) {
            await sendTelegramMessage(TELEGRAM_TOKEN, chatId, `❌ Erro de execução: ${err.message}`);
        }
        return new Response("OK", { status: 200 });
    }
}

// Responde o clique para liberar a interface do aplicativo
async function answerCallback(token, callbackId) {
    try {
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callback_query_id: callbackId })
        });
    } catch (e) {}
}

// Consulta GraphQL oficial da Shopee (só produtos com desconto alto)
async function buscarOfertaShopee(keyword, appId, secret) {
    try {
        const query = `
            query {
                productOfferV2(
                    keyword: "${keyword}",
                    listType: 0,
                    sortType: 1,
                    page: 1,
                    limit: 30
                ) {
                    nodes {
                        productName
                        priceMin
                        priceMax
                        priceDiscountRate
                        offerLink
                        imageUrl
                        sales
                    }
                }
            }
        `;

        const timestamp = Math.floor(Date.now() / 1000);
        const payload = JSON.stringify({ query });

        // Assinatura correta: SHA-256 simples
        const baseString = appId + timestamp + payload + secret;
        const encoder = new TextEncoder();
        const data = encoder.encode(baseString);

        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const signature = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, "0"))
            .join("");

        const response = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "SHA256 Credential=" + appId + ", Timestamp=" + timestamp + ", Signature=" + signature
            },
            body: payload
        });

        const dataResp = await response.json();

        if (dataResp.errors) {
            console.log("Erro Shopee:", JSON.stringify(dataResp.errors));
            return null;
        }

        const produtos = dataResp?.data?.productOfferV2?.nodes || [];

        // Filtra só produtos com desconto alto (mínimo 50%)
        const produtosComDesconto = produtos.filter(p => {
            const desconto = parseInt(p.priceDiscountRate) || 0;
            return desconto >= 50;
        });

        if (produtosComDesconto.length === 0) {
            return null;
        }

        // Sorteia um produto aleatório entre os que têm desconto alto
        const produtoSorteado = produtosComDesconto[Math.floor(Math.random() * produtosComDesconto.length)];

        const precoAtual = parseFloat(produtoSorteado.priceMin || produtoSorteado.priceMax || 0).toFixed(2).replace(".", ",");
        const desconto = parseInt(produtoSorteado.priceDiscountRate) || 0;

        return {
            titulo: produtoSorteado.productName,
            preco: precoAtual,
            desconto: desconto,
            link: produtoSorteado.offerLink,
            imagem: produtoSorteado.imageUrl
        };
    } catch (e) {
        console.log("Erro na busca Shopee:", e.message);
        return null;
    }
}

// Função de envio seguro (Texto)
async function sendTelegramMessage(token, chatId, text, replyMarkup = null) {
    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                reply_markup: replyMarkup
            })
        });
    } catch (e) {}
}

// Função de envio seguro (Foto)
async function sendTelegramPhoto(token, chatId, photoUrl, caption, replyMarkup = null) {
    try {
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
    } catch (e) {}
}
