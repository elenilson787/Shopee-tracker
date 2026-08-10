// Tabela de palavras-chave para varredura variada
const KEYWORDS = {
    casa: ["panela", "cozinha", "organizador", "cama", "decoracao", "copo termico", "utensilios"],
    tech: ["fone bluetooth", "smartwatch", "carregador", "caixa de som", "teclado", "suporte celular"],
    moda: ["vestido", "tenis", "bolsa", "relogio", "oculos de sol", "camiseta", "mochila"]
};

export async function onRequestPost(context) {
    const { request, env } = context;
    const TELEGRAM_TOKEN = (env.TELEGRAM_BOT_TOKEN || "").trim();
    const SHOPEE_APP_ID = (env.SHOPEE_APP_ID || "").trim();
    const SHOPEE_SECRET = (env.SHOPEE_SECRET || "").trim();

    let chatId = null;

    try {
        const update = await request.json();

        // Identifica o chatId
        if (update.message && update.message.chat) {
            chatId = update.message.chat.id;
        } else if (update.callback_query && update.callback_query.message && update.callback_query.message.chat) {
            chatId = update.callback_query.message.chat.id;
        }

        // 1. Comando /start ou Menu Principal
        if ((update.message && update.message.text && update.message.text.startsWith("/start")) || 
            (update.callback_query && update.callback_query.data === "menu_principal")) {
            
            if (update.callback_query) {
                await answerCallback(TELEGRAM_TOKEN, update.callback_query.id);
            }

            await sendTelegramMessage(TELEGRAM_TOKEN, chatId, 
                "🔥 BEM-VINDO AO RADAR SHOPEE PROMOS!\n\n" +
                "Como você deseja encontrar as melhores oportunidades hoje?\n\n" +
                "👇 Escolha um tipo de busca:",
                {
                    inline_keyboard: [
                        [{ text: "💰 Maiores Comissões", callback_data: "tipo_comissao" }],
                        [{ text: "🔥 Ofertas Novas & Relâmpago", callback_data: "tipo_novas" }]
                    ]
                }
            );
            return new Response("OK", { status: 200 });
        }

        // 2. Seleção de Estratégia -> Exibe Nichos
        if (update.callback_query) {
            const callback = update.callback_query;
            const action = callback.data;

            await answerCallback(TELEGRAM_TOKEN, callback.id);

            if (action === "tipo_comissao" || action === "tipo_novas") {
                const tipoTexto = action === "tipo_comissao" ? "💰 MAIORES COMISSÕES" : "🔥 OFERTAS NOVAS & RELÂMPAGO";
                const suf = action === "tipo_comissao" ? "comissao" : "novas";

                await sendTelegramMessage(TELEGRAM_TOKEN, chatId,
                    `${tipoTexto}\n\n` +
                    "Excelente escolha! Agora selecione o Nicho de produtos que você deseja explorar:",
                    {
                        inline_keyboard: [
                            [{ text: "🏠 Casa & Cozinha", callback_data: `nicho_casa_${suf}` }],
                            [{ text: "📱 Eletrônicos & Tech", callback_data: `nicho_tech_${suf}` }],
                            [{ text: "👗 Moda & Acessórios", callback_data: `nicho_moda_${suf}` }],
                            [{ text: "↩️ Voltar ao Menu Principal", callback_data: "menu_principal" }]
                        ]
                    }
                );
                return new Response("OK", { status: 200 });
            }

            // 3. Clique no Nicho -> Realiza Busca
            if (action.startsWith("nicho_")) {
                let nichoKey = "";
                let tipoEstrategia = "";
                let nomeNicho = "";

                if (action.includes("casa")) { nichoKey = "casa"; nomeNicho = "Casa & Cozinha"; }
                if (action.includes("tech")) { nichoKey = "tech"; nomeNicho = "Eletrônicos & Tech"; }
                if (action.includes("moda")) { nichoKey = "moda"; nomeNicho = "Moda & Acessórios"; }

                if (action.includes("comissao")) tipoEstrategia = "comissao";
                if (action.includes("novas")) tipoEstrategia = "novas";

                if (nichoKey && tipoEstrategia && chatId) {
                    const tagEstrategia = tipoEstrategia === "comissao" ? "💰 Maiores Comissões" : "🔥 Oferta Relâmpago";

                    // Notificação imediata de busca
                    await sendTelegramMessage(TELEGRAM_TOKEN, chatId, `🔎 Varrendo a Shopee para ${nomeNicho} (${tagEstrategia})...`);

                    if (!SHOPEE_APP_ID || !SHOPEE_SECRET) {
                        await sendTelegramMessage(TELEGRAM_TOKEN, chatId, "⚠️ Atenção: As variáveis SHOPEE_APP_ID ou SHOPEE_SECRET não foram cadastradas na Cloudflare.");
                        return new Response("OK", { status: 200 });
                    }

                    const resultado = await buscarOfertaInteligente(nichoKey, tipoEstrategia, SHOPEE_APP_ID, SHOPEE_SECRET);

                    // Exibe erro direto da API da Shopee se houver
                    if (resultado && resultado.erro) {
                        await sendTelegramMessage(TELEGRAM_TOKEN, chatId, 
                            `⚠️ *Erro de resposta da Shopee:*\n"${resultado.erro}"\n\n` +
                            "💡 Verifique no painel de Afiliados da Shopee se o seu App ID e Secret estão ativos e corretos."
                        );
                        return new Response("OK", { status: 200 });
                    }

                    if (resultado && resultado.produto) {
                        const produto = resultado.produto;
                        const tituloLimpo = produto.titulo.replace(/[\*\_\`\[\]]/g, "").trim();

                        const legenda = 
                            `🎯 OFERTA ENCONTRADA (${tagEstrategia.toUpperCase()})!\n\n` +
                            `📦 ${tituloLimpo}\n` +
                            `💰 Preço: R$ ${produto.preco}\n\n` +
                            `⚡ Link promocional gerado com sucesso!`;

                        const botoes = {
                            inline_keyboard: [
                                [{ text: "🛒 Comprar na Shopee", url: produto.link }],
                                [{ text: "🔄 Próxima Oferta (Diferente)", callback_data: action }],
                                [{ text: "📁 Escolher Outro Nicho", callback_data: `tipo_${tipoEstrategia}` }],
                                [{ text: "🏠 Menu Principal", callback_data: "menu_principal" }]
                            ]
                        };

                        await sendTelegramPhotoOrFallback(TELEGRAM_TOKEN, chatId, produto.imagem, legenda, botoes);
                    } else {
                        await sendTelegramMessage(TELEGRAM_TOKEN, chatId, "⚠️ Nenhuma oferta retornada nesta busca. Clique abaixo para tentar outro item!", {
                            inline_keyboard: [
                                [{ text: "🔄 Tentar Novamente", callback_data: action }],
                                [{ text: "🏠 Menu Principal", callback_data: "menu_principal" }]
                            ]
                        });
                    }
                }
                return new Response("OK", { status: 200 });
            }
        }

        return new Response("OK", { status: 200 });
    } catch (err) {
        if (chatId && TELEGRAM_TOKEN) {
            await sendTelegramMessage(TELEGRAM_TOKEN, chatId, `❌ Erro de execução: ${err.message}`);
        }
        return new Response("OK", { status: 200 });
    }
}

// Busca inteligente com diagnóstico de erro
async function buscarOfertaInteligente(nicho, estrategia, appId, secret) {
    const lista = KEYWORDS[nicho] || ["promocao"];
    const kwSorteada = lista[Math.floor(Math.random() * lista.length)];
    const pgSorteada = Math.floor(Math.random() * 2) + 1;

    let res = await fazerQueryShopee(kwSorteada, pgSorteada, estrategia, appId, secret);

    if (res && res.erro) return res;

    if (!res || !res.produto) {
        res = await fazerQueryShopee(lista[0], 1, estrategia, appId, secret);
    }

    return res;
}

async function fazerQueryShopee(keyword, page, estrategia, appId, secret) {
    try {
        const query = `
            query {
                productOfferV2(keyword: "${keyword}", limit: 20, page: ${page}) {
                    nodes {
                        productName
                        price
                        priceMin
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

        if (data.errors && data.errors.length > 0) {
            return { erro: data.errors[0].message || "Erro retornado pela API Shopee" };
        }

        const produtos = data?.data?.productOfferV2?.nodes;

        if (produtos && produtos.length > 0) {
            let produtoSorteado = null;

            if (estrategia === "comissao") {
                const ordenados = [...produtos].sort((a, b) => {
                    const precoA = parseFloat(a.price || a.priceMin || 0);
                    const precoB = parseFloat(b.price || b.priceMin || 0);
                    return precoB - precoA;
                });
                const top5 = ordenados.slice(0, Math.min(5, ordenados.length));
                produtoSorteado = top5[Math.floor(Math.random() * top5.length)];
            } else {
                produtoSorteado = produtos[Math.floor(Math.random() * produtos.length)];
            }

            if (produtoSorteado && produtoSorteado.offerLink) {
                const valorBruto = produtoSorteado.price || produtoSorteado.priceMin || 0;
                return {
                    produto: {
                        titulo: produtoSorteado.productName || "Produto Shopee",
                        preco: parseFloat(valorBruto).toFixed(2).replace(".", ","),
                        link: produtoSorteado.offerLink,
                        imagem: produtoSorteado.imageUrl
                    }
                };
            }
        }

        return { produto: null };
    } catch (e) {
        return { erro: `Falha na requisição: ${e.message}` };
    }
}

async function answerCallback(token, callbackId) {
    try {
        await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ callback_query_id: callbackId })
        });
    } catch(e) {}
}

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

async function sendTelegramPhotoOrFallback(token, chatId, photoUrl, caption, replyMarkup = null) {
    let enviouComFoto = false;

    if (photoUrl) {
        try {
            const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    photo: photoUrl,
                    caption: caption,
                    reply_markup: replyMarkup
                })
            });
            const data = await res.json();
            if (data.ok) enviouComFoto = true;
        } catch (e) {}
    }

    if (!enviouComFoto) {
        await sendTelegramMessage(token, chatId, caption, replyMarkup);
    }
}
