@echo off
echo Iniciando bot e ngrok...

REM Rodar ngrok na porta 3000 para webhook
start ngrok http 3000

REM Aguardar 3 segundos para ngrok iniciar (ajuste se quiser)
timeout /t 3

REM Rodar o servidor Node.js
node index.js

pause