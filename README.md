🤖 Bot WhatsApp Academia
Bot gratuito de WhatsApp focado em academia e fitness com IA integrada. Desenvolvido para ajudar entusiastas de treinos com dicas personalizadas e motivacionais. 100% open-source e sem fins lucrativos!
🎯 Funcionalidades

Responde apenas sobre treinos, exercícios, nutrição esportiva e suplementação.
Integração com IA (Groq/Llama-3.1) para respostas inteligentes.
Mensagens concisas e motivacionais, otimizadas para WhatsApp (máximo 300 caracteres).
Totalmente gratuito e open-source.

🚀 Como usar

Adicione o número: +1 785 333 3848 no WhatsApp.
Envie a mensagem: join escape-scientific.
Comece a conversar sobre treinos, exercícios ou nutrição! 💪

Exemplo de perguntas:

"Qual é o melhor treino para iniciantes?"
"Posso tomar whey protein à noite?"
"Como melhorar minha resistência no treino?"

🛠️ Tecnologias

Node.js + Express: Backend leve e rápido.
Twilio WhatsApp API: Comunicação via WhatsApp.
Groq API: IA gratuita para respostas inteligentes.
Railway: Hospedagem gratuita e simples.
Winston: Logs robustos para monitoramento.

📝 Configuração
Pré-requisitos

Conta no Twilio (plano gratuito).
Conta no Groq para obter uma chave de API gratuita.
Node.js 20.x ou superior (node -v para verificar).
Git e uma conta no GitHub.
ngrok para testes locais (opcional).

Passos

Clone o repositório:
git clone https://github.com/MatheusRoas/bot-whatsapp-academia.git
cd bot-whatsapp-academia


Instale as dependências:
npm install


Configure as variáveis de ambiente:

Copie .env.example para .env:copy .env.example .env


Edite .env com suas credenciais do Twilio e Groq:TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+your_twilio_whatsapp_number
GROQ_API_KEY=your_groq_api_key
PORT=3000
WEBHOOK_URL=https://your-domain.com/webhook




Inicie o servidor localmente (para testes):
npm run dev

Use ngrok para expor o servidor local:
ngrok http 3000

Copie a URL pública fornecida (ex.: https://abc123.ngrok.io).

Configure o webhook no Twilio:

No painel do Twilio, vá em Messaging > Manage > WhatsApp.
Configure o webhook para:https://abc123.ngrok.io/webhook

Método: POST.


Teste o bot:

Adicione o número do WhatsApp (+17853333848).
Envie join escape-scientific e teste perguntas sobre fitness.
Verifique os logs em logs/combined.log ou logs/error.log para debug.


Hospede no Railway:

Crie uma conta no Railway.
Conecte o repositório MatheusRoas/bot-whatsapp-academia.
Adicione as variáveis de ambiente no painel do Railway ( mesmas do .env).
Faça deploy e obtenha a URL pública (ex.: https://seu-projeto.up.railway.app).
Atualize o webhook no Twilio para:https://seu-projeto.up.railway.app/webhook





🌐 Deploy no GitHub
Se você ainda não subiu o projeto:

Inicialize o Git:git init
git add .
git commit -m "Initial commit: Bot WhatsApp Academia"


Conecte ao repositório:git remote add origin https://github.com/MatheusRoas/bot-whatsapp-academia.git
git branch -M main
git push -u origin main


Verifique em https://github.com/MatheusRoas/bot-whatsapp-academia.

🤝 Contribuições
Contribuições são muito bem-vindas! Abra uma issue ou pull request no GitHub.
📄 Licença
MIT License - Projeto sem fins lucrativos. Veja LICENSE para detalhes.
🙌 Agradecimentos
Desenvolvido com ❤️ por Matheus Roas para ajudar a comunidade fitness. Feito com apoio do Grok da xAI, o melhor parceiro de IA! 😎
📢 Compartilhe!
Testou o bot? Compartilhe no LinkedIn e marque o projeto! Exemplo de post:
🚀 Lançamento do **Bot WhatsApp Academia**! Um bot 100% gratuito e open-source pra ajudar com treinos, exercícios e nutrição esportiva. 💪 Feito com Node.js, Twilio e Groq API (IA gratuita). Teste: adicione +17853333848 e envie "join escape-scientific". Código: https://github.com/MatheusRoas/bot-whatsapp-academia. Bora treinar? 🏋️ #Fitness #OpenSource #WhatsAppBot #IA

