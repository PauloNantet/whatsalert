# 💊 Remédio da Mãe - Bot WhatsApp

Bot automático que envia alertas de remédios via WhatsApp para os irmãos.

## 🚀 Como funciona

1. Escaneie o QR Code com o WhatsApp
2. Adicione os contatos dos irmãos
3. Cadastre os remédios da mãe
4. Configure os horários dos alertas
5. O bot envia automaticamente no horário certo!

## 📦 Instalação Local

```bash
npm install
npm start
```

Acesse http://localhost:3000

## 🌐 Deploy no Railway

1. Crie uma conta em [railway.app](https://railway.app)
2. Clique em "New Project" → "Deploy from GitHub repo"
3. Conecte seu repositório
4. O Railway vai fazer deploy automaticamente
5. Escaneie o QR Code pela URL do projeto

## ⚙️ Configuração

- O bot usa `whatsapp-web.js` para se conectar ao WhatsApp
- O `node-cron` verifica os alertas a cada minuto
- Dados salvos em SQLite (persiste entre reinicializações)

## 📱 Uso

1. Abra a interface web
2. Vá em "Contatos" → adicione os números (DDD + número)
3. Vá em "Remédios" → cadastre os remédios
4. Vá em "Alertas" → configure horários e dias
5. Pronto! O bot envia automaticamente

## 🔔 Confirmação

Quando alguém responder "OK" ou "✅" no WhatsApp, o bot confirma que a mãe tomou o remédio.
