const socket = io();

// Socket events
socket.on('bot-status', (data) => {
    const el = document.getElementById('botStatus');
    const btnDisconnect = document.getElementById('btnDisconnect');
    if (data.ready) {
        el.textContent = '● Conectado';
        el.className = 'status online';
        document.getElementById('qrSection').style.display = 'none';
        btnDisconnect.style.display = 'inline-block';
    } else {
        el.textContent = '● Desconectado';
        el.className = 'status offline';
        btnDisconnect.style.display = 'none';
    }
});

socket.on('qr', (qr) => {
    document.getElementById('qrSection').style.display = 'block';
    const img = document.createElement('img');
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(qr)}`;
    const container = document.getElementById('qrCode');
    container.innerHTML = '';
    container.appendChild(img);
});

async function disconnectBot() {
    if (!await confirmDelete('Desconectar WhatsApp?', 'Um novo QR Code será gerado automaticamente.')) return;
    showToast('Desconectando... Aguarde novo QR Code...', 'success');
    const res = await api('/api/disconnect', 'POST');
    if (res.error) return showToast(res.error, 'error');
    document.getElementById('qrSection').style.display = 'none';
}

// Tabs
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
    });
});

// Modals
function openModal(id) {
    document.getElementById(id).classList.add('active');
}
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
});

// Custom confirm delete
let confirmDeleteResolve = null;
function confirmDelete(title, msg) {
    return new Promise((resolve) => {
        confirmDeleteResolve = resolve;
        document.getElementById('confirmDeleteTitle').textContent = title;
        document.getElementById('confirmDeleteMsg').textContent = msg;
        openModal('modalConfirmDelete');
    });
}

document.getElementById('btnConfirmDeleteAction').addEventListener('click', () => {
    closeModal('modalConfirmDelete');
    if (confirmDeleteResolve) confirmDeleteResolve(true);
});

document.getElementById('modalConfirmDelete').addEventListener('click', (e) => {
    if (e.target.id === 'modalConfirmDelete') {
        closeModal('modalConfirmDelete');
        if (confirmDeleteResolve) confirmDeleteResolve(false);
    }
});

// Override old confirm for cancel buttons
document.querySelector('.btn-cancel-delete').addEventListener('click', () => {
    if (confirmDeleteResolve) confirmDeleteResolve(false);
});

// Toast
function showToast(msg, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.className = 'toast show ' + type;
    setTimeout(() => toast.className = 'toast', 3000);
}

// API helpers
async function api(url, method = 'GET', body = null) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    return res.json();
}

// ============ CONTATOS ============
async function loadContatos() {
    const contatos = await api('/api/contatos');
    const container = document.getElementById('listaContatos');
    if (contatos.length === 0) {
        container.innerHTML = '<p class="empty-state">Nenhum contato adicionado.</p>';
        return;
    }
    container.innerHTML = contatos.map(c => `
        <div class="card">
            <div class="card-header">
                <div>
                    <div class="card-title">${esc(c.nome)}</div>
                    <div class="card-subtitle">${esc(c.relacao)}</div>
                </div>
                <div class="card-actions">
                    <button class="btn-delete" onclick="deleteContato(${c.id})">🗑️</button>
                </div>
            </div>
            <div class="card-info">
                <span>📱 ${formatPhone(c.telefone)}</span>
            </div>
        </div>
    `).join('');
}

async function saveContato(e) {
    e.preventDefault();
    const nome = document.getElementById('contatoNome').value.trim();
    const telefone = document.getElementById('contatoTelefone').value.replace(/\D/g, '');
    const relacao = document.getElementById('contatoRelacao').value;
    if (!nome || !telefone) return showToast('Preencha todos os campos', 'error');
    await api('/api/contatos', 'POST', { nome, telefone, relacao });
    document.getElementById('formContato').reset();
    closeModal('modalContato');
    loadContatos();
    showToast('Contato adicionado!', 'success');
}

async function deleteContato(id) {
    if (!await confirmDelete('Excluir contato?', 'Este contato será removido permanentemente.')) return;
    await api(`/api/contatos/${id}`, 'DELETE');
    loadContatos();
    showToast('Contato removido');
}

// ============ REMEDIOS ============
let allRemedios = [];
let allAlertas = [];

async function loadRemedios() {
    allRemedios = await api('/api/remedios');
    allAlertas = await api('/api/alertas');
    allRemedios.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    allAlertas.sort((a, b) => a.horario.localeCompare(b.horario));
    renderRemedios();
    renderAlertas();
}

function renderRemedios() {
    const container = document.getElementById('listaRemedios');
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    if (allRemedios.length === 0) {
        container.innerHTML = '<p class="empty-state">Nenhum remédio cadastrado.</p>';
        return;
    }

    container.innerHTML = allRemedios.map(r => {
        const alertasDoRemedio = allAlertas.filter(a => a.remedio_id === r.id);
        let alertasHtml = '';
        if (alertasDoRemedio.length > 0) {
            alertasHtml = alertasDoRemedio.map(a => {
                const diasBadges = a.dias.map(d => `<span class="day-badge">${dayNames[d]}</span>`).join('');
                return `
                    <div class="remedio-alerta">
                        <span class="remedio-horario">⏰ ${a.horario}</span>
                        <span class="days-row">${diasBadges}</span>
                        <div class="remedio-alerta-actions">
                            <button class="btn-edit-small" onclick="editAlerta(${a.id}, ${a.remedio_id}, '${a.horario}', ${JSON.stringify(a.dias)})" title="Editar horário">✏️</button>
                            <button class="btn-edit-small" onclick="toggleAlerta(${a.id}, ${a.ativo ? 0 : 1})" title="${a.ativo ? 'Pausar' : 'Ativar'}">${a.ativo ? '⏸️' : '▶️'}</button>
                            <button class="btn-delete-small" onclick="deleteAlerta(${a.id})" title="Remover">🗑️</button>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            alertasHtml = '<div class="remedio-sem-alerta">Nenhum horário configurado</div>';
        }

        return `
            <div class="card remedio-card">
                <div class="card-header">
                    <div>
                        <div class="card-title">💊 ${esc(r.nome)}</div>
                        ${r.dosagem ? `<div class="card-subtitle">${esc(r.dosagem)}</div>` : ''}
                    </div>
                    <div class="card-actions">
                        <button class="btn-edit" onclick="editRemedio(${r.id}, '${esc(r.nome)}', '${esc(r.dosagem || '')}', '${esc(r.instrucoes || '')}')" title="Editar remédio">✏️</button>
                        <button class="btn-delete" onclick="deleteRemedio(${r.id})">🗑️</button>
                    </div>
                </div>
                ${r.instrucoes ? `<div class="card-info"><span>📝 ${esc(r.instrucoes)}</span></div>` : ''}
                <div class="remedio-alertas-section">
                    <div class="remedio-alertas-header">
                        <span class="remedio-alertas-title">Horários</span>
                        <button class="btn-add-horario" onclick="addAlertaForRemedio(${r.id})">+ Horário</button>
                    </div>
                    ${alertasHtml}
                </div>
            </div>
        `;
    }).join('');
}

function addAlertaForRemedio(remedioId) {
    loadRemediosSelect();
    document.getElementById('alertaRemedio').value = remedioId;
    openModal('modalAlerta');
}

function editRemedio(id, nome, dosagem, instrucoes) {
    document.getElementById('editRemedioId').value = id;
    document.getElementById('editRemedioNome').value = nome;
    document.getElementById('editRemedioDosagem').value = dosagem;
    document.getElementById('editRemedioInstrucoes').value = instrucoes;
    openModal('modalEditarRemedio');
}

async function updateRemedio(e) {
    e.preventDefault();
    const id = document.getElementById('editRemedioId').value;
    const nome = document.getElementById('editRemedioNome').value.trim();
    const dosagem = document.getElementById('editRemedioDosagem').value.trim();
    const instrucoes = document.getElementById('editRemedioInstrucoes').value.trim();
    if (!nome) return showToast('Preencha o nome', 'error');
    await api(`/api/remedios/${id}`, 'PUT', { nome, dosagem, instrucoes });
    closeModal('modalEditarRemedio');
    loadRemedios();
    loadAlertas();
    showToast('Remédio atualizado!', 'success');
}

async function saveRemedio(e) {
    e.preventDefault();
    const nome = document.getElementById('remedioNome').value.trim();
    const dosagem = document.getElementById('remedioDosagem').value.trim();
    const instrucoes = document.getElementById('remedioInstrucoes').value.trim();
    if (!nome) return showToast('Preencha o nome', 'error');
    await api('/api/remedios', 'POST', { nome, dosagem, instrucoes });
    document.getElementById('formRemedio').reset();
    closeModal('modalRemedio');
    loadRemedios();
    showToast('Remédio adicionado!', 'success');
}

async function deleteRemedio(id) {
    if (!await confirmDelete('Excluir remédio?', 'Este remédio e seus alertas serão removidos.')) return;
    await api(`/api/remedios/${id}`, 'DELETE');
    loadRemedios();
    showToast('Remédio removido');
}

// ============ ALERTAS ============
async function loadRemediosSelect() {
    const remedios = await api('/api/remedios');
    remedios.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const select = document.getElementById('alertaRemedio');
    select.innerHTML = '<option value="">Selecione um remédio</option>' +
        remedios.map(r => `<option value="${r.id}">${esc(r.nome)} ${r.dosagem ? '(' + esc(r.dosagem) + ')' : ''}</option>`).join('');
}

async function loadEditRemediosSelect(selectedId) {
    const remedios = await api('/api/remedios');
    remedios.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const select = document.getElementById('editAlertaRemedio');
    select.innerHTML = '<option value="">Selecione um remédio</option>' +
        remedios.map(r => `<option value="${r.id}" ${r.id == selectedId ? 'selected' : ''}>${esc(r.nome)} ${r.dosagem ? '(' + esc(r.dosagem) + ')' : ''}</option>`).join('');
}

async function loadAlertas() {
    allAlertas = await api('/api/alertas');
    allAlertas.sort((a, b) => a.horario.localeCompare(b.horario));
    renderAlertas();
}

function renderAlertas() {
    const container = document.getElementById('listaAlertas');
    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    if (allAlertas.length === 0) {
        container.innerHTML = '<p class="empty-state">Nenhum alerta configurado.</p>';
        return;
    }

    container.innerHTML = allAlertas.map(a => {
        const diasBadges = a.dias.map(d => `<span class="day-badge">${dayNames[d]}</span>`).join('');
        return `
            <div class="card alert-card">
                <div class="card-header">
                    <div>
                        <div class="card-title">⏰ ${a.horario}</div>
                        <div class="card-subtitle">💊 ${a.remedio ? esc(a.remedio.nome) : 'Remédio removido'}</div>
                    </div>
                    <div class="card-actions">
                        <button class="btn-edit" onclick="editAlerta(${a.id}, ${a.remedio_id}, '${a.horario}', ${JSON.stringify(a.dias)})" title="Editar">✏️</button>
                        <button class="btn-edit" onclick="toggleAlerta(${a.id}, ${a.ativo ? 0 : 1})">
                            ${a.ativo ? '⏸️' : '▶️'}
                        </button>
                        <button class="btn-delete" onclick="deleteAlerta(${a.id})">🗑️</button>
                    </div>
                </div>
                <div class="card-info">
                    <span class="badge ${a.ativo ? 'badge-active' : 'badge-inactive'}">${a.ativo ? 'Ativo' : 'Pausado'}</span>
                    <span class="days-row">${diasBadges}</span>
                </div>
            </div>
        `;
    }).join('');
}

async function editAlerta(id, remedioId, horario, dias) {
    document.getElementById('editAlertaId').value = id;
    await loadEditRemediosSelect(remedioId);
    document.getElementById('editAlertaHorario').value = horario;
    document.querySelectorAll('input[name="editDias"]').forEach(cb => {
        cb.checked = dias.includes(parseInt(cb.value));
    });
    openModal('modalEditarAlerta');
}

async function updateAlerta(e) {
    e.preventDefault();
    const id = document.getElementById('editAlertaId').value;
    const remedio_id = parseInt(document.getElementById('editAlertaRemedio').value);
    const horario = document.getElementById('editAlertaHorario').value;
    if (!remedio_id || !horario) return showToast('Preencha todos os campos', 'error');
    const dias = [];
    document.querySelectorAll('input[name="editDias"]:checked').forEach(cb => dias.push(parseInt(cb.value)));
    if (dias.length === 0) return showToast('Selecione pelo menos um dia', 'error');
    await api(`/api/alertas/${id}`, 'PUT', { remedio_id, horario, dias });
    closeModal('modalEditarAlerta');
    loadAlertas();
    loadRemedios();
    showToast('Alerta atualizado!', 'success');
}

async function saveAlerta(e) {
    e.preventDefault();
    const remedio_id = parseInt(document.getElementById('alertaRemedio').value);
    const horario = document.getElementById('alertaHorario').value;
    if (!remedio_id || !horario) return showToast('Preencha todos os campos', 'error');
    const dias = [];
    document.querySelectorAll('input[name="dias"]:checked').forEach(cb => dias.push(parseInt(cb.value)));
    if (dias.length === 0) return showToast('Selecione pelo menos um dia', 'error');
    await api('/api/alertas', 'POST', { remedio_id, horario, dias });
    document.getElementById('formAlerta').reset();
    closeModal('modalAlerta');
    loadAlertas();
    loadRemedios();
    showToast('Alerta configurado!', 'success');
}

async function toggleAlerta(id, ativo) {
    await api(`/api/alertas/${id}`, 'PUT', { ativo });
    loadAlertas();
    loadRemedios();
}

async function deleteAlerta(id) {
    if (!await confirmDelete('Excluir alerta?', 'Este horário de alerta será removido.')) return;
    await api(`/api/alertas/${id}`, 'DELETE');
    loadAlertas();
    loadRemedios();
    showToast('Alerta removido');
}

// ============ SEND NOW ============
async function sendNow() {
    const remedios = await api('/api/remedios');
    if (remedios.length === 0) return showToast('Adicione um remédio primeiro', 'error');
    const contatos = await api('/api/contatos');
    if (contatos.length === 0) return showToast('Adicione contatos primeiro', 'error');

    const nome = remedios.map(r => r.nome).join(', ');
    const horario = new Date().toTimeString().slice(0, 5);
    const res = await api('/api/send-now', 'POST', { remedioNome: nome, horario });
    if (res.error) return showToast(res.error, 'error');
    showToast(res.message, 'success');
    loadHistorico();
}

async function testSend() {
    const contatos = await api('/api/contatos');
    if (contatos.length === 0) return showToast('Adicione contatos primeiro', 'error');
    const res = await api('/api/test-send', 'POST');
    if (res.error) return showToast(res.error, 'error');
    showToast(res.message, 'success');
    loadHistorico();
}

// ============ HISTORICO ============
async function loadHistorico() {
    const historico = await api('/api/historico');
    const container = document.getElementById('listaHistorico');
    if (historico.length === 0) {
        container.innerHTML = '<p class="empty-state">Nenhum registro ainda.</p>';
        return;
    }
    container.innerHTML = historico.map(h => `
        <div class="card history-card ${h.status === 'erro' ? 'error' : ''}">
            <div class="card-header">
                <div>
                    <div class="card-title">${h.contato_nome || 'N/A'}</div>
                    <div class="card-subtitle">${new Date(h.created_at).toLocaleString('pt-BR')}</div>
                </div>
                <span class="badge ${h.status === 'enviado' ? 'badge-active' : 'badge-inactive'}">
                    ${h.status === 'enviado' ? '✅ Enviado' : '❌ Erro'}
                </span>
            </div>
        </div>
    `).join('');
}

async function clearHistory() {
    if (!await confirmDelete('Limpar histórico?', 'Todos os registros serão removidos.')) return;
    await api('/api/historico', 'DELETE');
    loadHistorico();
    showToast('Histórico limpo');
}

// Utilities
function esc(text) {
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function formatPhone(phone) {
    const c = phone.replace(/\D/g, '');
    if (c.length === 11) return `(${c.slice(0,2)}) ${c.slice(2,7)}-${c.slice(7)}`;
    return c;
}

// Init
loadContatos();
loadRemedios();
loadAlertas();
loadHistorico();
