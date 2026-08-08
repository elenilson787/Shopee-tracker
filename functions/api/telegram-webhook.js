export async function onRequestPost(context) {
    const { request, env } = context;
    const TELEGRAM_TOKEN = env.TELEGRAM_BOT_TOKEN;

    try {
        const update = await request.json();

        // Extrai o chat_id e o texto/ação do usuário
        let chatId, dataAction, textCommand;

        if (update.message) {
            chatId = update.message.chat.id;
            textCommand = update.message.text;
        } else if (update.callback_query) {
            chatId = update.callback_query.message.chat.id;
            dataAction = update.callback_query.data;
        }

        if (!chatId) return new Response("OK", { status: 200 });

        // 1. Comando Inicial (/start)
        if (textCommand === '/start') {
            await sendTelegramMenu(TELEGRAM_TOKEN, chatId, 
                `🤖 *Bem-vindo ao Radar de Ofertas Shopee!*\n\n` +
                `Você está no modo *Nicho Geral* com direito a 3 ofertas gratuitas por dia.\n\n` +
                `💡 *Você tem 1 Teste Grátis* para experimentar um nicho específico!`
            );
            return new Response("OK", { status: 200 });
        }

        // 2. Ação: Buscar Oferta Geral (3x por dia)
        if (dataAction === 'busca_geral') {
            // Lógica simulada de ofertas do Nicho Geral
            const ofertaGeral = `🚨 *OFERTA NO NICHO GERAL!*\n\n✨ *Fone Bluetooth Sem Fio*\n🔥 *Por apenas R$ 29,90*\n\n🛒 https://shope.ee/exemplo`;
            
            await sendTelegramMessage(TELEGRAM_TOKEN, chatId, ofertaGeral, [
                [{ text: "🎲 Outra Oferta Geral", callback_data: "busca_geral" }],
                [{ text: "🎯 Testar Nicho Específico (1x Grátis)", callback_data: "menu_nichos" }]
            ]);
            return new Response("OK", { status: 200 });
        }

        // 3. Ação: Abrir Menu de Nichos (Degustação)
        if (dataAction === 'menu_nichos') {
            const menuText = `🎯 *Escolha seu Nicho de Teste (1x Grátis):*\n\n` +
                             `Escolha abaixo qual categoria você quer testar agora:`;
            
            const nichoButtons = [
                [{ text: "🏠 Casa & Cozinha", callback_data: "nicho_casa" }],
                [{ text: "📱 Eletrônicos & Tech", callback_data: "nicho_tech" }],
                [{ text: "👗 Moda & Acessórios", callback_data: "nicho_moda" }],
                [{ text: "⬅️ Voltar ao Nicho Geral", callback_data: "busca_geral" }]
            ];

            await sendTelegramMessage(TELEGRAM_TOKEN, chatId, menuText, nichoButtons);
            return new Response("OK", { status: 200 });
        }

        // 4. Ação: Seleção do Nicho de Teste ou Bloqueio
        if (dataAction && dataAction.startsWith('nicho_')) {
            // Aqui o sistema verifica se ele já usou o teste (Lógica com KV ou estado)
            const jaUsouTeste = false; // Mudar para true quando ele já tiver gasto a tentativa

            if (!jaUsouTeste) {
                // Entrega a oferta no nicho escolhido e gasta o teste
                const ofertaNicho = `🎯 *OFERTA SEGMENTADA (Teste de Nicho)*\n\n✨ *Jogo de Panelas Antiaderente 5 Peças*\n🔥 *De ~R$ 199~ Por R$ 89,90*\n\n🛒 https://shope.ee/exemplo`;
                
                await sendTelegramMessage(TELEGRAM_TOKEN, chatId, ofertaNicho, [
                    [{ text: "⚡ Quer continuar neste Nicho? Libere o PRO", callback_data: "oferta_pro" }],
                    [{ text: "🎲 Voltar para Busca Geral Grátis", callback_data: "busca_geral" }]
                ]);
            } else {
                // Trava: Caso ele tente testar o nicho de novo
                const avisoTrava = `🔒 *Seu teste gratuito de nicho expirou!*\n\n` +
                                   `Seu perfil retornou automaticamente para o *Nicho Geral* (3 ofertas diárias).\n\n` +
                                   `Para travar seu robô em um nicho específico permanentemente e ter buscas ilimitadas, assine o PRO ou faça uma recarga no Pix.`;

                await sendTelegramMessage(TELEGRAM_TOKEN, chatId, avisoTrava, [
                    [{ text: "💳 Recarga +5 Ofertas no Pix (R$ 3,90)", callback_data: "gerar_pix" }],
                    [{ text: "👑 Assinar Plano PRO Mensal", callback_data: "oferta_pro" }],
                    [{ text: "🎲 Continuar no Geral Grátis", callback_data: "busca_geral" }]
                ]);
            }
            return new Response("OK", { status: 200 });
        }

        // 5. Oferta PRO / Pix
        if (dataAction === 'oferta_pro' || dataAction === 'gerar_pix') {
            await sendTelegramMessage(TELEGRAM_TOKEN, chatId, 
                `⚡ *RECARGA RÁPIDA DE OFERTAS VIA PIX*\n\n` +
                `Clique no botão abaixo para gerar o código *Pix Copia e Cola* de R$ 3,90 e liberar +5 buscas no seu nicho escolhido imediatamente!`,
                [[{ text: "📲 Gerar Chave Pix R$ 3,90", callback_data: "confirmar_pix" }]]
            );
            return new Response("OK", { status: 200 });
        }

        return new Response("OK", { status: 200 });

    } catch (err) {
        console.error("Erro no Webhook:", err);
        return new Response("OK", { status: 200 });
    }
}

// Funções Auxiliares de Envio para o Telegram

async function sendTelegramMenu(token, chatId, text) {
    const buttons = [
        [{ text: "🎲 Ver Ofertas no Nicho Geral (3/3 hoje)", callback_data: "busca_geral" }],
        [{ text: "🎯 Testar Nicho Específico (1x Grátis)", callback_data: "menu_nichos" }],
        [{ text: "💳 Recarga Pix / Planos PRO", callback_data: "oferta_pro" }]
    ];
    return sendTelegramMessage(token, chatId, text, buttons);
}

async function sendTelegramMessage(token, chatId, text, inlineKeyboard) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text: text,
            parse_mode: "Markdown",
            reply_markup: {
                inline_keyboard: inlineKeyboard
            }
        })
    });
}

