const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const database = require('./database');
const { initBot, getClient, isReady, disconnect } = require('./bot');
const { startCron, sendTestAlert } = require('./cron');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO for real-time updates
io.on('connection', (socket) => {
    console.log('Client connected');
    socket.emit('bot-status', { ready: isReady() });
});

// Make io accessible to bot
app.set('io', io);

// ============ API ROUTES ============

// Bot status
app.get('/api/status', (req, res) => {
    res.json({ ready: isReady() });
});

// Bot disconnect
app.post('/api/disconnect', async (req, res) => {
    try {
        await disconnect();
        res.json({ ok: true, message: 'Desconectado! Novo QR Code será gerado...' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Contacts CRUD
app.get('/api/contatos', (req, res) => {
    res.json(database.getAll('contatos'));
});

app.post('/api/contatos', (req, res) => {
    const { nome, telefone, relacao } = req.body;
    if (!nome || !telefone) return res.status(400).json({ error: 'Nome e telefone obrigatórios' });
    const cleanPhone = telefone.replace(/\D/g, '');
    const id = database.insert('contatos', { nome, telefone: cleanPhone, relacao: relacao || 'irmão' });
    res.json({ id, nome, telefone: cleanPhone, relacao });
});

app.delete('/api/contatos/:id', (req, res) => {
    database.remove('contatos', req.params.id);
    res.json({ ok: true });
});

// Remedies CRUD
app.get('/api/remedios', (req, res) => {
    const remedios = database.getAll('remedios');
    remedios.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    res.json(remedios);
});

app.post('/api/remedios', (req, res) => {
    const { nome, dosagem, instrucoes } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome obrigatório' });
    const id = database.insert('remedios', { nome, dosagem: dosagem || '', instrucoes: instrucoes || '' });
    res.json({ id, nome, dosagem, instrucoes });
});

app.delete('/api/remedios/:id', (req, res) => {
    database.remove('remedios', req.params.id);
    res.json({ ok: true });
});

app.put('/api/remedios/:id', (req, res) => {
    const { nome, dosagem, instrucoes } = req.body;
    database.update('remedios', req.params.id, { nome, dosagem, instrucoes });
    res.json({ ok: true });
});

// Alerts CRUD
app.get('/api/alertas', (req, res) => {
    const alertas = database.getAll('alertas');
    const remedios = database.getAll('remedios');
    const enriched = alertas.map(a => {
        const remedio = remedios.find(r => r.id === a.remedio_id);
        let dias = a.dias;
        if (typeof dias === 'string') {
            try { dias = JSON.parse(dias); } catch { dias = [0,1,2,3,4,5,6]; }
        }
        return { ...a, dias, remedio: remedio || null };
    });
    enriched.sort((a, b) => a.horario.localeCompare(b.horario));
    res.json(enriched);
});

app.post('/api/alertas', (req, res) => {
    const { remedio_id, horario, dias, ativo } = req.body;
    if (!remedio_id || !horario) return res.status(400).json({ error: 'Remédio e horário obrigatórios' });
    const id = database.insert('alertas', {
        remedio_id,
        horario,
        dias: JSON.stringify(dias || [0,1,2,3,4,5,6]),
        ativo: ativo !== false ? 1 : 0
    });
    res.json({ id });
});

app.put('/api/alertas/:id', (req, res) => {
    const { ativo, remedio_id, horario, dias } = req.body;
    const updateData = {};
    if (ativo !== undefined) updateData.ativo = ativo ? 1 : 0;
    if (remedio_id) updateData.remedio_id = remedio_id;
    if (horario) updateData.horario = horario;
    if (dias) updateData.dias = JSON.stringify(dias);
    database.update('alertas', req.params.id, updateData);
    res.json({ ok: true });
});

app.delete('/api/alertas/:id', (req, res) => {
    database.remove('alertas', req.params.id);
    res.json({ ok: true });
});

// History
app.get('/api/historico', (req, res) => {
    res.json(database.getAll('historico'));
});

app.delete('/api/historico', (req, res) => {
    database.clear('historico');
    res.json({ ok: true });
});

// Test send
app.post('/api/test-send', async (req, res) => {
    try {
        await sendTestAlert();
        res.json({ ok: true, message: 'Alerta de teste enviado!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Send alert now to all contacts
app.post('/api/send-now', async (req, res) => {
    try {
        const { remedioNome, horario } = req.body;
        const contatos = database.getAll('contatos');
        if (contatos.length === 0) return res.status(400).json({ error: 'Nenhum contato cadastrado' });

        const client = getClient();
        const ready = isReady();
        console.log(`🔍 Status do bot no send-now: client=${!!client}, ready=${ready}`);
        if (!client || !ready) return res.status(500).json({ error: 'Bot WhatsApp não conectado. Aguarde o bot conectar completamente.' });

        const msg = buildMessage(remedioNome || 'Remédio', horario || new Date().toTimeString().slice(0,5));

        for (const contato of contatos) {
            let phone = contato.telefone.replace(/\D/g, '');
            if (!phone.startsWith('55')) phone = '55' + phone;
            const chatId = `${phone}@c.us`;
            try {
                await client.sendMessage(chatId, msg);
                database.insert('historico', {
                    contato_nome: contato.nome,
                    mensagem: msg,
                    status: 'enviado'
                });
            } catch (err) {
                console.error(`Erro ao enviar para ${contato.nome}:`, err.message);
            }
        }
        res.json({ ok: true, message: `Enviado para ${contatos.length} contato(s)` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function buildMessage(remedioNome, horario) {
    return `🚨 *ALERTA REMÉDIO - Hora da Mama!*

⏰ Horário: ${horario}
💊 Remédio: ${remedioNome}

Mensagem automática do sistema de alerta.

✅ *Para confirmar que a mãe já tomou o remédio:*
Responda esta mensagem com *OK* ou *✅*

O bot vai pedir seu nome e avisará a todos os irmãos!`;
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    initBot(io);
    startCron();
});
