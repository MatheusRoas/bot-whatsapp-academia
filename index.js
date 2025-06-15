const express = require('express');
const twilio = require('twilio');
const axios = require('axios');
const winston = require('winston');
require('dotenv').config();

const app = express();
app.use(express.urlencoded({ extended: false }));

// Configuração de logs com winston
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console()
    ]
});

// Configurações do Twilio
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// Sistema de prompt para manter o foco em academia
const SISTEMA_PROMPT = `Você é um assistente especializado em academia e fitness. 
REGRAS IMPORTANTES:
- Responda APENAS sobre treinos, exercícios, nutrição esportiva, suplementação e temas relacionados à academia
- Se perguntarem sobre outros assuntos, redirecione educadamente para temas de fitness
- Seja motivacional, mas sempre seguro nas recomendações
- Sugira procurar profissionais quando necessário (médicos, nutricionistas, educadores físicos)
- Mantenha respostas concisas para WhatsApp (máximo 300 caracteres)

Exemplo de redirecionamento: "Oi! Sou especializado em fitness e academia. Como posso te ajudar com treinos, exercícios ou nutrição esportiva hoje? 💪"`;

// Função para chamar a IA (usando Groq)
async function chamarIA(mensagem) {
    try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.1-8b-instant',
            messages: [
                { role: 'system', content: SISTEMA_PROMPT },
                { role: 'user', content: mensagem }
            ],
            max_tokens: 150,
            temperature: 0.7
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        let resposta = response.data.choices[0].message.content;
        // Truncar resposta para 300 caracteres
        if (resposta.length > 300) {
            resposta = resposta.substring(0, 297) + '...';
        }
        return resposta;
    } catch (error) {
        logger.error('Erro na chamada à API do Groq', {
            error: error.message,
            stack: error.stack
        });
        return 'Desculpe, estou com dificuldades técnicas. Tente novamente em alguns minutos! 🤖';
    }
}

// Validação de assinatura do Twilio
function validateTwilioRequest(req) {
    const twilioSignature = req.get('X-Twilio-Signature');
    const url = process.env.WEBHOOK_URL || `http://localhost:${process.env.PORT || 3000}/webhook`;
    return twilio.validateRequest(authToken, twilioSignature, url, req.body);
}

// Webhook do WhatsApp
app.post('/webhook', async (req, res) => {
    // Validar requisição do Twilio
    if (!validateTwilioRequest(req)) {
        logger.warn('Requisição inválida do Twilio', { ip: req.ip });
        return res.status(403).send('Invalid Twilio signature');
    }

    const mensagemRecebida = req.body.Body;
    const numeroRemetente = req.body.From;

    // Log da mensagem recebida
    logger.info('Mensagem recebida', { numeroRemetente, mensagem: mensagemRecebida });

    // Verificar se a mensagem é válida
    if (!mensagemRecebida || mensagemRecebida.trim() === '') {
        await client.messages.create({
            body: 'Por favor, envie uma mensagem válida sobre fitness ou academia! 💪',
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: numeroRemetente
        });
        logger.info('Mensagem vazia recebida', { numeroRemetente });
        return res.status(200).send('OK');
    }

    try {
        // Obter resposta da IA
        const respostaIA = await chamarIA(mensagemRecebida);

        // Enviar resposta via Twilio
        await client.messages.create({
            body: respostaIA,
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: numeroRemetente
        });

        logger.info('Resposta enviada', { numeroRemetente, resposta: respostaIA });
        res.status(200).send('OK');
    } catch (error) {
        logger.error('Erro ao processar mensagem', {
            error: error.message,
            stack: error.stack,
            numeroRemetente,
            mensagemRecebida
        });
        res.status(500).send('Erro interno');
    }
});

// Rota de verificação do webhook
app.get('/webhook', (req, res) => {
    res.send('Webhook do Bot Academia funcionando! 💪');
});

// Rota de saúde
app.get('/health', (req, res) => {
    res.json({ status: 'Bot Academia Online', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`🤖 Bot Academia rodando na porta ${PORT}`);
    logger.info(`📱 Webhook: /webhook`);
});