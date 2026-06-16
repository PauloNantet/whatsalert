const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const database = require('./database');

let client = null;
let botReady = false;
let io = null;

function initBot(socketIo) {
    io = socketIo;
    client = new Client({
        authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu',
                '--disable-features=VizDisplayCompositor'
            ]
        }
    });

    client.on('qr', (qr) => {
        console.log('\n📱 ESCANEIE O QR CODE NO WHATSAPP:\n');
        qrcode.generate(qr, { small: true });
        console.log('\nAbra o WhatsApp > Dispositivos conectados > Conectar dispositivo\n');
        if (io) io.emit('qr', qr);
    });

    client.on('ready', () => {
        console.log('✅ Bot WhatsApp conectado!');
        botReady = true;
        if (io) io.emit('bot-status', { ready: true });
    });

    client.on('authenticated', () => {
        console.log('🔐 Autenticado com sucesso!');
        console.log('⏳ Aguardando conexão completa...');

        // Verificar conexão manualmente pois o ready pode não disparar
        const checkReady = setInterval(async () => {
            try {
                if (client.info) {
                    clearInterval(checkReady);
                    console.log('✅ Bot WhatsApp CONECTADO e PRONTO!');
                    console.log(`   Número: ${client.info.wid.user}`);
                    botReady = true;
                    if (io) io.emit('bot-status', { ready: true });
                }
            } catch (e) {
                // Ainda não pronto, aguardar
            }
        }, 2000);

        // Parar tentar após 30 segundos
        setTimeout(() => clearInterval(checkReady), 30000);
    });

    client.on('auth_failure', (msg) => {
        console.error('❌ Falha na autenticação:', msg);
        botReady = false;
        if (io) io.emit('bot-status', { ready: false });
    });

    client.on('ready', () => {
        console.log('✅ Bot WhatsApp CONECTADO e PRONTO!');
        botReady = true;
        if (io) io.emit('bot-status', { ready: true });
    });

    client.on('disconnected', (reason) => {
        console.log('⚠️ Desconectado:', reason);
        botReady = false;
        if (io) io.emit('bot-status', { ready: false });
    });

    client.on('loading_screen', (percent, message) => {
        console.log(`⏳ Carregando: ${percent}% - ${message}`);
    });

    client.on('change_state', (state) => {
        console.log(`🔄 Estado mudou: ${state}`);
    });

    client.on('message', async (msg) => {
        try {
            const contact = await msg.getContact();
            const name = contact.pushname || contact.name || 'Alguém';
            const body = msg.body.trim();
            const bodyLower = body.toLowerCase();

            console.log(`\n📨 MENSAGEM RECEBIDA:`);
            console.log(`   De: ${name} (${contact.number})`);
            console.log(`   Texto: "${body}"`);
            console.log(`   Chat: ${msg.from}`);

            // Detect confirmation keywords
            const confirmKeywords = ['ok', 'confirmado', '✅', 'sim', 'já dei', 'ja dei', 'dei', 'confirmar'];
            const isConfirm = confirmKeywords.some(kw => bodyLower === kw);

            if (isConfirm) {
                console.log(`✅ Confirmação detectada de: ${name}`);
                await broadcastConfirmation(name, msg);
                return;
            }

            // Help command
            if (bodyLower === 'ajuda' || bodyLower === 'help' || bodyLower === '?') {
                await msg.reply(
                    `💊 *Sistema de Alerta de Remédio da Mãe*\n\n` +
                    `Para confirmar que a mãe tomou o remédio:\n` +
                    `Responda *OK* ou *✅*\n\n` +
                    `Todos os irmãos serão informados!`
                );
            }
        } catch (err) {
            console.error('❌ Erro ao processar mensagem:', err.message);
            console.error(err.stack);
        }
    });

    console.log('🚀 Iniciando bot WhatsApp...');
    client.initialize().catch(err => {
        console.error('Erro ao inicializar bot:', err.message);
    });

    return client;
}

async function broadcastConfirmation(confirmName, originalMsg) {
    console.log(`\n📢 INICIANDO BROADCAST DE CONFIRMAÇÃO...`);
    console.log(`   Nome: ${confirmName}`);

    if (!client || !botReady) {
        console.log('❌ Bot não está pronto!');
        return;
    }

    const contatos = database.getAll('contatos');
    console.log(`   Contatos cadastrados: ${contatos.length}`);

    const now = new Date();
    const timeStr = now.toTimeString().slice(0, 5);

    const confirmMsg = `✅ *CONFIRMADO!*

👤 *${confirmName}* confirmou que a mãe já tomou o remédio!
⏰ Horário: ${timeStr}

Obrigado por cuidar da mãe! 💚`;

    let enviados = 0;
    let erros = 0;

    // PRIMEIRO: responder quem confirmou
    try {
        await originalMsg.reply(confirmMsg);
        console.log(`   ✅ Resposta enviada para ${confirmName}`);
        enviados++;
    } catch (err) {
        console.log(`   ❌ Erro ao responder ${confirmName}: ${err.message}`);
        erros++;
    }

    await new Promise(r => setTimeout(r, 1500));

    // SEGUNDO: enviar para todos os contatos
    for (const contato of contatos) {
        let phone = contato.telefone.replace(/\D/g, '');
        if (!phone.startsWith('55')) phone = '55' + phone;
        const chatId = `${phone}@c.us`;

        console.log(`   Enviando para ${contato.nome} (${phone})...`);

        try {
            await client.sendMessage(chatId, confirmMsg);
            console.log(`   ✅ Enviado para ${contato.nome}`);
            enviados++;
        } catch (err) {
            console.log(`   ❌ Erro ao enviar para ${contato.nome}: ${err.message}`);
            erros++;
        }

        await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`\n📊 RESULTADO: ${enviados} enviados, ${erros} erros`);

    // Save to history
    database.insert('historico', {
        contato_nome: confirmName,
        mensagem: confirmMsg,
        status: erros > 0 ? 'parcial' : 'enviado'
    });
}

function getClient() {
    return client;
}

function isReady() {
    return botReady;
}

async function disconnect() {
    if (client) {
        try {
            console.log('🔌 Desconectando do WhatsApp...');
            await client.destroy();
            console.log('✅ Desconectado com sucesso!');
        } catch (err) {
            console.log('⚠️ Erro ao desconectar:', err.message);
        }
        client = null;
        botReady = false;
        if (io) io.emit('bot-status', { ready: false });
    }

    // Limpar sessão salva
    const fs = require('fs');
    const path = require('path');
    const authDir = path.join(__dirname, '..', '.wwebjs_auth');
    if (fs.existsSync(authDir)) {
        fs.rmSync(authDir, { recursive: true, force: true });
        console.log('🗑️ Sessão removida.');
    }

    // Reiniciar bot automaticamente para mostrar novo QR Code
    console.log('🔄 Reiniciando bot para novo QR Code...');
    setTimeout(() => {
        initBot(io);
    }, 2000);
}

module.exports = { initBot, getClient, isReady, disconnect };
