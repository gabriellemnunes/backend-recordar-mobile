# Chatbot e pré-triagem — Andreza

Base atualizada com `git pull --ff-only` em 23/11/2026: backend `112e1ab`, frontend `1c42e86`.

## Fluxo implementado

`POST /api/chat` exige JWT de paciente. O paciente inicia consentindo com a pré-triagem; o servidor coleta sintomas, duração, intensidade de 0 a 10 e informações complementares. A IA interpreta os sintomas e indica somente IDs de especialidades existentes no MongoDB. O resultado é salvo em `PreTriage` e retorna `id_pre_triagem`, utilizado pelo agendamento existente. Não são transmitidos nome, email, foto ou prontuário do perfil ao modelo.

Conversas pertencem exclusivamente ao paciente. `GET /api/chat/:id` recupera mensagens e resultado. Há limite persistido de 40 mensagens por hora por paciente, tamanho máximo de mensagem, bloqueio entre requisições concorrentes e resultado único por conversa. Erros do modelo mantêm a etapa para repetição; não criam recomendações simuladas. A exclusão da conta elimina as conversas. As mensagens não têm expiração automática; a equipe deve definir uma política de retenção antes de uso real.

Alertas textuais conservadores de urgência interrompem o fluxo comum sem esperar a IA e salvam origem `regra_seguranca`. Um alerta retornado pela IA também impede encaminhamento comum ao agendamento. O aplicativo oferece contato com SAMU 192. Não diagnostica, prescreve nem garante reconhecer toda urgência. Regras e sugestões precisam de revisão de profissional de saúde antes do uso clínico. Referência dos sinais: https://www.gov.br/saude/pt-br/composicao/saes/samu-192 .

## IA gratuita local

O padrão é Ollama com `qwen2.5:3b`, baixado do catálogo oficial (aproximadamente 1,9 GB). Não usa assinatura, chave ou API paga. O computador precisa manter a IA e o backend ligados. O programa e os modelos não entram no Git nem no APK.

1. Instalar o Ollama oficial ou configurar seu executável portátil em `OLLAMA_BIN` no `.env`.
2. Configurar `AI_PROVIDER=ollama`, `OLLAMA_URL=http://127.0.0.1:11434` e `OLLAMA_MODEL=qwen2.5:3b`.
3. Executar `npm run ai:local`.
4. Em outro terminal: `npm run ai:local -- pull qwen2.5:3b` na primeira vez.
5. Iniciar a API com `npm start` (MongoDB configurado) ou `npm run demo` (banco temporário fictício).

O script portátil guarda um perfil exclusivo e os modelos em `OLLAMA_DATA_DIR`, sem mudar o perfil do Windows. As chaves internas criadas pelo Ollama são locais e não são chaves de cobrança OpenAI. O serviço fica somente no loopback do servidor; o celular acessa o backend, não o Ollama diretamente.

Nesta máquina, os caminhos portáteis foram configurados exclusivamente no `.env` ignorado pelo Git, sob `Documents/Codex/recordar-tools`. Em outra máquina, ajuste os caminhos. O inicializador do repositório frontend também inicia a IA em segundo plano.

## APK e hospedagem

O APK usa `EXPO_PUBLIC_API_URL` com o endereço acessível da API e `EXPO_PUBLIC_CHAT_PATH=/chat`. Nunca colocar segredos ou `OLLAMA_URL` dentro do app. Na mesma rede, usar o IP do computador; `127.0.0.1` no celular é o próprio celular. Fora da rede, publicar backend e Ollama em infraestrutura adequada, com HTTPS no backend e autenticação. Não abrir a porta do Ollama diretamente na internet. Modelo gratuito não significa servidor gratuito.

## OpenAI opcional

`AI_PROVIDER=openai`, `OPENAI_API_KEY` e `OPENAI_MODEL` permitem usar Responses API com JSON estruturado e `store:false`. É cobrada por uso. A chave fica só no backend. Antes de habilitar um provedor externo, atualizar a informação de privacidade e a autorização ao paciente para identificar o destinatário das mensagens.

## Validação

`npm test` cobre fluxo, vínculo por paciente, duplicação, alerta sem modelo, indisponibilidade, acesso e validação de IDs de especialidade. `node scripts/check-chat-local.cjs` testa o modelo real com dados fictícios em `CHAT_TEST_API` (padrão porta 3005 da demonstração). Documentação do provedor: https://docs.ollama.com/api/chat e https://docs.ollama.com/capabilities/structured-outputs .

