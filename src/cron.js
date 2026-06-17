const cron = require('node-cron');
const database = require('./database');
const { getClient, isReady } = require('./bot');

function buildMessage(remedioNome, horario) {
    return `🚨 *ALERTA REMÉDIO - Hora da Mama!*

⏰ Horário: ${horario}
💊 Remédio: ${remedioNome}

Mensagem automática do sistema de alerta.

✅ *Para confirmar que a mãe já tomou o remédio:*
Responda esta mensagem com *OK* ou *✅*

O bot vai pedir seu nome e avisará a todos os irmãos!`;
}

async function sendAlertToAll(remedioNome, horario) {
    const client = getClient();
    const ready = isReady();
    console.log(`🔍 Status do bot: client=${!!client}, ready=${ready}`);
    
    if (!client || !ready) {
        console.log('⚠️ Bot não conectado, não foi possível enviar alerta');
        return;
    }

    const contatos = database.getAll('contatos');
    if (contatos.length === 0) {
        console.log('⚠️ Nenhum contato cadastrado');
        return;
    }

    const msg = buildMessage(remedioNome, horario);
    let enviados = 0;
    let erros = 0;

    for (const contato of contatos) {
        let phone = contato.telefone.replace(/\D/g, '');
        if (!phone.startsWith('55')) phone = '55' + phone;
        const chatId = `${phone}@c.us`;
        try {
            await client.sendMessage(chatId, msg);
            console.log(`✅ Enviado para ${contato.nome} (${contato.telefone})`);
            database.insert('historico', {
                contato_nome: contato.nome,
                mensagem: msg,
                status: 'enviado'
            });
            enviados++;
        } catch (err) {
            console.error(`❌ Erro ao enviar para ${contato.nome}:`, err.message);
            database.insert('historico', {
                contato_nome: contato.nome,
                mensagem: msg,
                status: 'erro'
            });
            erros++;
        }
        // Small delay between messages
        await new Promise(r => setTimeout(r, 1500));
    }

    console.log(`📊 Resultado envio: ${enviados} enviados, ${erros} erros`);
}

async function sendTestAlert() {
    const remedios = database.getAll('remedios');
    if (remedios.length === 0) throw new Error('Nenhum remédio cadastrado');

    const now = new Date();
    const horario = now.toTimeString().slice(0, 5);
    await sendAlertToAll(remedios[0].nome, horario);
}

function startCron() {
    // Check every minute
    cron.schedule('* * * * *', () => {
        try {
            const now = new Date();
            const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"
            const currentDay = now.getDay(); // 0-6

            console.log(`⏰ Verificando alertas... ${currentTime} (dia ${currentDay})`);

            if (!isReady()) {
                console.log('⚠️ Bot não está pronto, pulando verificação');
                return;
            }

            const alertas = database.getAll('alertas');
            const remedios = database.getAll('remedios');

            for (const alerta of alertas) {
                if (!alerta.ativo) continue;
                if (alerta.horario !== currentTime) continue;

                let dias = alerta.dias;
                if (typeof dias === 'string') {
                    try { dias = JSON.parse(dias); } catch { dias = [0,1,2,3,4,5,6]; }
                }
                if (!dias.includes(currentDay)) continue;

                const remedio = remedios.find(r => r.id === alerta.remedio_id);
                if (!remedio) continue;

                console.log(`🔔 Disparando alerta: ${remedio.nome} às ${alerta.horario}`);
                sendAlertToAll(remedio.nome, alerta.horario).catch(err => {
                    console.error('Erro ao enviar alerta:', err.message);
                });
            }
        } catch (err) {
            console.error('❌ Erro no cron job:', err.message);
        }
    });

    console.log('⏰ Cron job iniciado - verificando a cada minuto');
}

module.exports = { startCron, sendAlertToAll, sendTestAlert };
