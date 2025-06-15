const express = require('express');
const twilio = require('twilio');
const axios = require('axios');
const winston = require('winston');
const fs = require('fs-extra');
const PDFDocument = require('pdfkit');
const path = require('path');
require('dotenv').config();

const app = express();

// Para pegar JSON também, caso queira futuramente
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Servir arquivos estáticos da pasta 'pdfs' para envio via Twilio
app.use('/pdfs', express.static(path.join(__dirname, 'pdfs')));

// Configuração de logs com winston
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaString}`;
        })
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console()
    ]
});

// Checar variáveis de ambiente obrigatórias no startup
if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_NUMBER || !process.env.GROQ_API_KEY) {
    logger.error('Variáveis de ambiente faltando! Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER e GROQ_API_KEY');
    process.exit(1);
}

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// PROMPT MULTILÍNGUE - Detecta se precisa coletar dados ou responder normalmente
const SISTEMA_PROMPT = `You are a multilingual virtual personal trainer specialized in gym and fitness.

YOUR ROLE:
- Experienced personal trainer with knowledge in bodybuilding, cardio, sports nutrition and supplementation
- Create personalized workouts, meal plans and give exercise tips
- Be motivational, but always technical and safe
- DETECT the user's language and respond in the SAME language

IMPORTANT RULES:
- Answer ONLY about workouts, exercises, sports nutrition, supplementation, anatomy and exercise physiology
- For other topics, redirect politely in the user's language:
  * Portuguese: "Sou especializado em fitness! Como posso ajudar com seus treinos hoje? 💪"
  * Spanish: "¡Soy especializado en fitness! ¿Cómo puedo ayudarte con tus entrenamientos hoy? 💪"
  * English: "I specialize in fitness! How can I help you with your workouts today? 💪"
  * French: "Je suis spécialisé en fitness! Comment puis-je vous aider avec vos entraînements aujourd'hui? 💪"

PDF GENERATION DETECTION:
- Only suggest PDF generation when user specifically requests:
  * "plano", "treino completo", "dieta completa", "programa", "monte um treino", "crie um plano"
  * "plan", "complete workout", "complete diet", "program", "create a workout", "make a plan"
  * "plan", "entrenamiento completo", "dieta completa", "programa", "crea un entrenamiento"
  * "plan", "entraînement complet", "régime complet", "programme", "créer un entraînement"

DATA COLLECTION:
When user requests a complete plan/PDF, ask for:
- Portuguese: "Para criar seu plano personalizado, preciso saber: seu nome, idade, peso, altura, tempo de academia e objetivo (ganho de massa, perda de peso, definição, etc.). Me conte essas informações! 💪"
- Spanish: "Para criar tu plan personalizado, necesito saber: tu nombre, edad, peso, altura, tiempo en el gimnasio y objetivo (ganancia de masa, pérdida de peso, definición, etc.). ¡Cuéntame esta información! 💪"
- English: "To create your personalized plan, I need to know: your name, age, weight, height, gym experience and goal (muscle gain, weight loss, definition, etc.). Tell me this information! 💪"
- French: "Pour créer votre plan personnalisé, j'ai besoin de savoir: votre nom, âge, poids, taille, expérience en salle et objectif (prise de masse, perte de poids, définition, etc.). Dites-moi ces informations! 💪"

RESPONSE MODES:
1. NORMAL CHAT: Answer questions directly without mentioning PDF
2. DATA REQUEST: When user asks for plan but hasn't provided data
3. PDF GENERATION: When user has provided complete data and wants plan

NEVER mention character limitations or that it's a free bot.`;

// Prompt específico para gerar conteúdo do PDF
const PDF_PROMPT = `You are creating a complete personalized fitness plan. Based on the user data provided, create a comprehensive plan with:

STRUCTURE YOUR RESPONSE EXACTLY LIKE THIS:

DADOS_PESSOAIS:
Nome: [name]
Idade: [age] anos
Peso: [weight]
Altura: [height]
Experiência: [experience]
Objetivo: [goal]

DIETA:
[Complete detailed diet plan with meals, portions, timing]

TREINO:
[Complete detailed workout plan with exercises, sets, reps, rest periods]

SUPLEMENTACAO:
[Supplement recommendations if applicable]

DICAS:
[Important tips and recommendations]

Make it detailed, professional and specific to their goals. Include exact portions, exercise techniques, and progression plans.`;

// Função para chamar a IA (Groq) - MODO NORMAL
async function chamarIA(mensagem, modo = 'normal') {
    try {
        const prompt = modo === 'pdf' ? PDF_PROMPT : SISTEMA_PROMPT;
        
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
            model: 'llama-3.1-8b-instant',
            messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: mensagem }
            ],
            max_tokens: modo === 'pdf' ? 1500 : 600,
            temperature: 0.7
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const respostaCompleta = response.data.choices[0]?.message?.content;
        if (!respostaCompleta) {
            throw new Error('Resposta da API vazia ou malformada');
        }
        return respostaCompleta;

    } catch (error) {
        logger.error('Erro na chamada à API do Groq', {
            message: error.message,
            stack: error.stack,
            responseData: error.response?.data || 'Sem dados da resposta'
        });
        return 'Desculpe, estou com dificuldades técnicas no momento. Tente novamente em alguns minutos! 🤖';
    }
}

// Função para detectar idioma da mensagem
function detectarIdioma(mensagem) {
    const texto = mensagem.toLowerCase();
    
    // Palavras-chave por idioma
    const idiomas = {
        'pt': ['treino', 'exercício', 'exercicio', 'musculação', 'musculacao', 'academia', 'dieta', 'como', 'quero', 'preciso', 'ajuda', 'obrigado', 'oi', 'olá', 'plano', 'monte'],
        'es': ['entrenamiento', 'ejercicio', 'gimnasio', 'musculación', 'dieta', 'como', 'quiero', 'necesito', 'ayuda', 'gracias', 'hola', 'plan', 'crea'],
        'en': ['workout', 'exercise', 'gym', 'training', 'diet', 'how', 'want', 'need', 'help', 'thanks', 'hello', 'hi', 'plan', 'create'],
        'fr': ['entraînement', 'exercice', 'salle', 'musculation', 'régime', 'comment', 'veux', 'besoin', 'aide', 'merci', 'bonjour', 'salut', 'plan', 'créer']
    };
    
    let pontuacoes = {};
    
    for (let idioma in idiomas) {
        pontuacoes[idioma] = 0;
        for (let palavra of idiomas[idioma]) {
            if (texto.includes(palavra)) {
                pontuacoes[idioma]++;
            }
        }
    }
    
    let idiomaDetectado = 'pt';
    let maiorPontuacao = 0;
    
    for (let idioma in pontuacoes) {
        if (pontuacoes[idioma] > maiorPontuacao) {
            maiorPontuacao = pontuacoes[idioma];
            idiomaDetectado = idioma;
        }
    }
    
    return idiomaDetectado;
}

// Função para verificar se usuário quer PDF
function verificarSolicitacaoPDF(mensagem) {
    const texto = mensagem.toLowerCase();
    const palavrasChave = [
        // Português
        'plano', 'treino completo', 'dieta completa', 'programa', 'monte um treino', 'crie um plano', 'pdf', 'documento',
        // Inglês  
        'plan', 'complete workout', 'complete diet', 'program', 'create a workout', 'make a plan',
        // Espanhol
        'entrenamiento completo', 'dieta completa', 'programa', 'crea un entrenamiento', 'haz un plan',
        // Francês
        'entraînement complet', 'régime complet', 'programme', 'créer un entraînement'
    ];
    
    return palavrasChave.some(palavra => texto.includes(palavra));
}

// Função para verificar se tem dados completos
function temDadosCompletos(mensagem) {
    const texto = mensagem.toLowerCase();
    const temNome = /nome|name|llamo|appelle/.test(texto);
    const temIdade = /idade|age|años|ans|\d+\s*(anos|years|año)/.test(texto);
    const temPeso = /peso|weight|kg|kilo/.test(texto);
    const temAltura = /altura|height|metro|cm/.test(texto);
    
    return temNome && temIdade && temPeso && temAltura;
}

// Função para extrair dados pessoais da mensagem
function extrairDados(mensagem) {
    const dados = {};
    
    // Extrair nome (após "nome", "name", etc.)
    const nomeMatch = mensagem.match(/(?:nome|name|llamo|appelle)[:\s]+([a-záàâãéèêíìôõóòúùûüç\s]+)/i);
    if (nomeMatch) dados.nome = nomeMatch[1].trim();
    
    // Extrair idade
    const idadeMatch = mensagem.match(/(?:idade|age|años|ans)[:\s]*(\d+)|(\d+)\s*(?:anos|years|año|ans)/i);
    if (idadeMatch) dados.idade = idadeMatch[1] || idadeMatch[2];
    
    // Extrair peso
    const pesoMatch = mensagem.match(/(?:peso|weight)[:\s]*(\d+(?:\.\d+)?)\s*(?:kg|kilos)?|(\d+(?:\.\d+)?)\s*(?:kg|kilos)/i);
    if (pesoMatch) dados.peso = pesoMatch[1] || pesoMatch[2];
    
    // Extrair altura
    const alturaMatch = mensagem.match(/(?:altura|height)[:\s]*(\d+(?:\.\d+)?)\s*(?:m|metro|cm)?|(\d+(?:\.\d+)?)\s*(?:m|metro|cm)/i);
    if (alturaMatch) dados.altura = alturaMatch[1] || alturaMatch[2];
    
    return dados;
}

// Função para gerar PDF BONITO E ORGANIZADO
async function gerarPDFBonito(conteudoIA, numeroRemetente) {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const pastaSaida = path.join(__dirname, 'pdfs');
    await fs.ensureDir(pastaSaida);

    const nomeArquivo = `plano_fitness_${numeroRemetente.replace(/[^0-9]/g, '')}_${Date.now()}.pdf`;
    const caminhoPDF = path.join(pastaSaida, nomeArquivo);
    const stream = fs.createWriteStream(caminhoPDF);

    return new Promise((resolve, reject) => {
        doc.pipe(stream);
        
        // CORES
        const corPrimaria = '#2E86AB';
        const corSecundaria = '#A23B72';
        const corTexto = '#2C3E50';
        const corFundo = '#F8F9FA';
        
        // FUNÇÃO PARA ADICIONAR NOVA PÁGINA COM HEADER
        function adicionarPagina(titulo) {
            if (doc.y > 50) doc.addPage();
            
            // Header colorido
            doc.rect(0, 0, doc.page.width, 80).fill(corPrimaria);
            doc.fill('white').font('Helvetica-Bold').fontSize(24)
               .text(titulo, 50, 25);
            doc.moveDown(3);
        }
        
        // FUNÇÃO PARA SEÇÃO
        function adicionarSecao(titulo, conteudo) {
            // Título da seção
            doc.rect(50, doc.y, doc.page.width - 100, 30).fill(corSecundaria);
            doc.fill('white').font('Helvetica-Bold').fontSize(14)
               .text(titulo, 60, doc.y + 8);
            doc.moveDown(1.5);
            
            // Conteúdo
            doc.fill(corTexto).font('Helvetica').fontSize(11)
               .text(conteudo, 50, doc.y, { 
                   width: doc.page.width - 100,
                   align: 'left',
                   lineGap: 3
               });
            doc.moveDown(2);
        }
        
        // PARSEAR CONTEÚDO DA IA
        const secoes = conteudoIA.split(/(?=DADOS_PESSOAIS:|DIETA:|TREINO:|SUPLEMENTACAO:|DICAS:)/);
        
        let dadosPessoais = '';
        let dieta = '';
        let treino = '';
        let suplementacao = '';
        let dicas = '';
        
        secoes.forEach(secao => {
            if (secao.includes('DADOS_PESSOAIS:')) {
                dadosPessoais = secao.replace('DADOS_PESSOAIS:', '').trim();
            } else if (secao.includes('DIETA:')) {
                dieta = secao.replace('DIETA:', '').trim();
            } else if (secao.includes('TREINO:')) {
                treino = secao.replace('TREINO:', '').trim();
            } else if (secao.includes('SUPLEMENTACAO:')) {
                suplementacao = secao.replace('SUPLEMENTACAO:', '').trim();
            } else if (secao.includes('DICAS:')) {
                dicas = secao.replace('DICAS:', '').trim();
            }
        });
        
        // PÁGINA 1 - CAPA E DADOS PESSOAIS
        doc.rect(0, 0, doc.page.width, doc.page.height).fill(corFundo);
        
        // Título principal
        doc.rect(0, 0, doc.page.width, 120).fill(corPrimaria);
        doc.fill('white').font('Helvetica-Bold').fontSize(28)
           .text('🏋️‍♂️ PLANO FITNESS', 50, 40, { align: 'center' });
        doc.fontSize(18).text('PERSONALIZADO', 50, 75, { align: 'center' });
        
        doc.moveDown(4);
        
        // Dados pessoais em destaque
        if (dadosPessoais) {
            adicionarSecao('📋 DADOS PESSOAIS', dadosPessoais);
        }
        
        // Data de criação
        doc.fill(corTexto).fontSize(10)
           .text(`Plano criado em: ${new Date().toLocaleDateString('pt-BR')}`, 
                 50, doc.page.height - 50);
        
        // PÁGINA 2 - DIETA
        if (dieta) {
            adicionarPagina('🥗 PLANO ALIMENTAR');
            adicionarSecao('DIETA PERSONALIZADA', dieta);
        }
        
        // PÁGINA 3 - TREINO
        if (treino) {
            adicionarPagina('💪 PROGRAMA DE TREINO');
            adicionarSecao('TREINO PERSONALIZADO', treino);
        }
        
        // PÁGINA 4 - SUPLEMENTAÇÃO E DICAS
        if (suplementacao || dicas) {
            adicionarPagina('⚡ COMPLEMENTOS');
            
            if (suplementacao) {
                adicionarSecao('💊 SUPLEMENTAÇÃO', suplementacao);
            }
            
            if (dicas) {
                adicionarSecao('💡 DICAS IMPORTANTES', dicas);
            }
        }
        
        // RODAPÉ FINAL
        doc.fill(corSecundaria).fontSize(10)
           .text('⚠️ Este plano é uma sugestão personalizada. Consulte sempre um profissional.', 
                 50, doc.page.height - 80, { align: 'center' });
        doc.fill(corPrimaria).fontSize(12).font('Helvetica-Bold')
           .text('💪 MANTENHA A CONSISTÊNCIA E BONS TREINOS!', 
                 50, doc.page.height - 60, { align: 'center' });
        
        doc.end();

        stream.on('finish', () => resolve(caminhoPDF));
        stream.on('error', reject);
    });
}

// WEBHOOK PRINCIPAL
app.post('/webhook', async (req, res) => {
    logger.info('Requisição recebida do Twilio', { 
        ip: req.ip,
        body: req.body
    });

    const mensagemRecebida = req.body.Body;
    const numeroRemetente = req.body.From;

    logger.info('Mensagem recebida', { numeroRemetente, mensagem: mensagemRecebida });

    if (!mensagemRecebida || mensagemRecebida.trim() === '') {
        try {
            await client.messages.create({
                body: 'Olá! Sou seu personal trainer virtual! 💪\n\nPosso ajudar com:\n• Dúvidas sobre exercícios\n• Dicas de treino\n• Orientações nutricionais\n• Criar planos completos (PDF)\n\nO que você gostaria de saber?',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: numeroRemetente
            });
        } catch (err) {
            logger.error('Erro ao enviar mensagem de boas-vindas', { error: err.message });
        }
        return res.status(200).send('OK');
    }

    try {
        const querPDF = verificarSolicitacaoPDF(mensagemRecebida);
        const temDados = temDadosCompletos(mensagemRecebida);
        
        if (querPDF && temDados) {
            // GERAR PDF COM DADOS COMPLETOS
            const conteudoIA = await chamarIA(mensagemRecebida, 'pdf');
            const caminhoPDF = await gerarPDFBonito(conteudoIA, numeroRemetente);
            const urlPDF = `${req.protocol}://${req.get('host')}/pdfs/${path.basename(caminhoPDF)}`;
            
            const dados = extrairDados(mensagemRecebida);
            const nomeUsuario = dados.nome || 'Atleta';
            
            await client.messages.create({
                body: `🎉 ${nomeUsuario}, seu plano fitness personalizado está pronto! 💪\n\n📱 PDF completo com:\n• Dados pessoais\n• Dieta detalhada\n• Treino personalizado\n• Suplementação\n• Dicas importantes\n\nQualquer dúvida, é só perguntar! 🚀`,
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: numeroRemetente,
                mediaUrl: [urlPDF]
            });
            
        } else if (querPDF && !temDados) {
            // SOLICITAR DADOS PARA PDF
            const idioma = detectarIdioma(mensagemRecebida);
            const solicitacoes = {
                'pt': `Para criar seu plano fitness completo em PDF, preciso das seguintes informações:\n\n📝 **DADOS NECESSÁRIOS:**\n• Nome\n• Idade\n• Peso atual\n• Altura\n• Tempo de academia\n• Objetivo (ganho de massa, emagrecimento, definição, etc.)\n• Se usa algum suplemento\n\nMe envie tudo numa mensagem só! Exemplo:\n"Nome: João, 25 anos, 70kg, 1.75m, 6 meses de academia, quero ganhar massa muscular, não uso suplementos"`,
                'es': `Para crear tu plan fitness completo en PDF, necesito la siguiente información:\n\n📝 **DATOS NECESARIOS:**\n• Nombre\n• Edad\n• Peso actual\n• Altura\n• Tiempo en gimnasio\n• Objetivo (ganancia de masa, pérdida de peso, definición, etc.)\n• Si usas algún suplemento\n\n¡Envíame todo en un solo mensaje!`,
                'en': `To create your complete fitness plan in PDF, I need the following information:\n\n📝 **REQUIRED DATA:**\n• Name\n• Age\n• Current weight\n• Height\n• Gym experience\n• Goal (muscle gain, weight loss, toning, etc.)\n• If you use any supplements\n\nSend me everything in one message!`,
                'fr': `Pour créer votre plan fitness complet en PDF, j'ai besoin des informations suivantes:\n\n📝 **DONNÉES REQUISES:**\n• Nom\n• Âge\n• Poids actuel\n• Taille\n• Expérience en salle\n• Objectif (prise de masse, perte de poids, définition, etc.)\n• Si vous utilisez des suppléments\n\nEnvoyez-moi tout en un seul message!`
            };
            
            await client.messages.create({
                body: solicitacoes[idioma] || solicitacoes['pt'],
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: numeroRemetente
            });
            
        } else {
            // CONVERSA NORMAL SEM PDF
            const respostaNormal = await chamarIA(mensagemRecebida, 'normal');
            
            await client.messages.create({
                body: respostaNormal,
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: numeroRemetente
            });
        }
        
        logger.info('Resposta enviada com sucesso', { numeroRemetente });
        return res.status(200).send('OK');
        
    } catch (error) {
        logger.error('Erro ao processar mensagem', {
            error: error.message,
            stack: error.stack,
            numeroRemetente,
            mensagemRecebida
        });
        
        try {
            await client.messages.create({
                body: 'Ops! Algo deu errado, mas já estou trabalhando nisso. Tente novamente em alguns minutos! 💪',
                from: process.env.TWILIO_WHATSAPP_NUMBER,
                to: numeroRemetente
            });
        } catch (err) {
            logger.error('Erro ao enviar mensagem de erro', { error: err.message });
        }
        
        return res.status(500).send('Erro interno');
    }
});

app.get('/webhook', (req, res) => {
    res.send('🏋️‍♂️ Personal Trainer Virtual - Sistema Online! 💪');
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'Personal Trainer Bot Online',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`🤖 Personal Trainer Virtual rodando na porta ${PORT}`);
    logger.info(`📱 Webhook: /webhook`);
    logger.info(`🏋️‍♂️ Sistema pronto para ajudar com fitness!`);
});