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

        // 1. Comando /start ou Botão Voltar ao Menu
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

        // 2. Escolha da Estratégia -> Mostra os Nichos
        if (update.callback_query) {
            const callback = update.callback_query;
            const action = callback.data;

            await answerCallback(TELEGRAM_TOKEN, callback.id);

            if (action === "tipo_comissao" || action === "tipo_novas") {
                const tipoTexto = action === "tipo_comissao" ? "💰 MAIORES COMISSÕES" : "🔥 OFERTAS NOVAS & RELÂMPAGO";
                
                await sendTelegramMessage(TELEGRAM_TOKEN, chatId,
                    `${tipoTexto}\n\n` +
                    "Excelente escolha! Agora selecione o Nicho de produtos que você deseja explorar:",
                    {
                        inline_keyboard: [
                            [{ text: "🏠 Casa & Cozinha", callback_data: `nicho_casa_${action}` }],
                            [{ text: "📱 Eletrônicos & Tech", callback_data: `nicho_tech_${action}` }],
                            [{ text: "👗 Moda & Acessórios", callback_data: `nicho_moda_${action}` }],
                            [{ text: "↩️ Voltar ao Menu Principal", callback_data: "menu_principal" }]
                        ]
                    }
                );
                return new Response("OK", { status: 200 });
            }

            // 3. Execução da Busca Inteligente por Nicho
            if (action.startsWith("nicho_")) {
                let nichoKey = "";
                let tipoEstrategia = "";
                let nomeNicho = "";

                if (action.includes("casa")) { nichoKey = "casa"; nomeNicho = "Casa & Cozinha"; }
                if (action.includes("tech")) { nichoKey = "tech"; nomeNicho = "Eletrônicos & Tech"; }
                if (action.includes("moda")) { nichoKey = "moda"; nomeNicho = "Moda & Acessórios"; }

                if (action.includes("tipo_comissao")) tipoEstrategia = "comissao";
                if (action.includes("tipo_novas")) tipoEstrategia = "novas";

                if (nichoKey && tipoEstrategia && chatId) {
                    const tagEstrategia = tipoEstrategia === "comissao" ? "💰 Maiores Comissões" : "🔥 Oferta Relâmpago";
                    await sendTelegramMessage(TELEGRAM_TOKEN, chatId, `🔎 Varrendo o catálogo da Shopee para ${nomeNicho} (${tagEstrategia})...`);

                    if (!SHOPEE_APP_ID || !SHOPEE_SECRET) {
                        await sendTelegramMessage(TELEGRAM_TOKEN, chatId, "⚠️ Atenção: As variáveis SHOPEE_APP_ID e SHOPEE_SECRET não foram cadastradas na Cloudflare.");
                        return new Response("OK", { status: 200 });
                    }

                    const produto = await buscarOfertaInteligente(nichoKey, tipoEstrategia, SHOPEE_APP_ID, SHOPEE_SECRET);

                    if (produto) {
                        // Limpa o título de caracteres especiais
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

                        if (produto.imagem) {
                            await sendTelegramPhoto(TELEGRAM_TOKEN, chatId, produto.imagem, legenda, botoes);
                        } else {
                            await sendTelegramMessage(TELEGRAM_TOKEN, chatId, legenda, botoes);
                        }
                    } else {
                        await sendTelegramMessage(TELEGRAM_TOKEN, chatId, "⚠️ A API da Shopee não retornou ofertas nesta tentativa. Clique em 'Próxima Oferta' para tentar outro item.");
                    }
                }
                return new Response("OK", { status: 200 });
            }
        }

        return new Response("OK", { status: 200 });
    } catch (err) {
        if (chatId && TELEGRAM_TOKEN) {
            await sendTelegramMessage(TELEGRAM_TOKEN, chatId, `❌ Erro interno: ${err.message}`);
        }
        return new Response("OK", { status: 200 });
    }
}

// Sub-palavras-chave para rotação e anti-repetição
const SUB_KEYWORDS = {
    casa: [
        "panela antiaderente", "utensilios cozinha inox", "organizadores casa", 
        "fritadeira air fryer", "jogo de pratos", "luminaria led", "mop giratorio", 
        "jogo de cama casal", "liquidificador", "garrafa termica", "copo termico",
        "kit de facas", "suporte temperos", "almofadas decorativas"
    ],
    tech: [
        "fone de ouvido bluetooth", "smartwatch esportivo", "carregador rapido usb", 
        "suporte para celular", "teclado gamer", "caixa de som bluetooth", 
        "mouse sem fio", "ring light", "cabo tipo c", "fone gamer", "hub usb"
    ],
    moda: [
        "vestido feminino elegante", "tenis masculino esportivo", "bolsa feminina couro", 
        "oculos de sol unisex", "camiseta masculina", "relogio masculino luxo", 
        "conjunto feminino", "mochila impermeavel", "carteira masculina"
    ]
};

// Algoritmo de busca variada na Shopee
async function buscarOfertaInteligente(nicho, estrategia, appId, secret) {
    try {
        const keywordsList = SUB_KEYWORDS[nicho] || ["ofertas"];
        const keywordSorteada = keywordsList[Math.floor(Math.random() * keywordsList.length)];
        const pageSorteada = Math.floor(Math.random() * 3) + 1; // Páginas 1, 2 ou 3

        // sortType 5 = Maior Comissão | sortType 2 = Mais Vendidos
        const sortType = estrategia === "comissao" ? 5 : 2;

        const query = `
            query {
                productOfferV2(keyword: "${keywordSorteada}", limit: 20, page: ${pageSorteada}, sortType: ${sortType}) {
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
            // Sorteia 1 produto aleatório dos 20 retornados
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
