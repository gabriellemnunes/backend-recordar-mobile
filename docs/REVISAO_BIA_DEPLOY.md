# Revisao do backend Recordar: persistencia, seguranca e deploy

## O que ja existe (main consultada em 22/11/2026)

- MongoDB persistente via `MONGO_URI` ou `MONGODB_URI`. Testes usam `mongodb-memory-server` e nao representam producao.
- Models Mongoose `User` (pacientes e medicos), `Appointment`, `PreTriage`, `Medication`, `Clinic` e `Specialty`.
- Transacoes MongoDB para reservar, reagendar e cancelar em `agendamentoController.js`, com bloqueio por revisao do paciente.
- Indice unico `Appointment(medico, data_consulta, horario_consulta)` para evitar criacao duplicada.
- POST `/api/pre-triagens` restrito por `x-ai-service-token` e leitura do paciente por JWT.
- Historico: consultas `realizada` persistem com `pre_triagem` e medicamentos; revisao de exclusoes requer cuidado.
- Swagger: `/api-docs`.

## Ambiente e publicacao

1. Criar **MongoDB Atlas** persistente (cluster com transacoes). Usar usuario de banco com privilegios minimos, rede restrita e backups.
2. No provedor da API, configurar `NODE_ENV=production`, `MONGO_URI` com a URI secreta do Atlas, `JWT_SECRET` aleatorio >=32 caracteres, `AI_SERVICE_TOKEN` aleatorio >=32 caracteres (igual ao servidor de IA), `CORS_ORIGINS` com origens web autorizadas.
3. Nao publicar `.env`, tokens, credenciais ou dados reais de pacientes no GitHub. Nao executar `npm run demo` no banco real.
4. Build/install `npm ci`; iniciar com `npm start`; configurar health check `GET /api/health`; HTTPS obrigatorio na URL do aplicativo.
5. Configurar a URL publica da API no frontend e testar no iPhone por outra rede, sem `localhost` ou IP privado de computador.
6. A recuperacao antiga de senha por nascimento/CRM esta desativada por padrao. Implementar fluxo com token temporario e entrega privada (email) antes de ativar recuperacao real. **Nunca** usar `ALLOW_INSECURE_PASSWORD_RECOVERY=true` em producao.

## Rotas principais

| Metodo | Endpoint | Autenticacao |
| --- | --- | --- |
| GET | `/api/health` | Publico, informa apenas estado da conexao |
| POST | `/api/auth/register` | Publico, cria paciente |
| POST | `/api/auth/login` | Publico, retorna JWT |
| POST | `/api/auth/recuperar-senha` | Bloqueado em producao ate existir recuperacao segura |
| GET/PUT | `/api/users/me` | JWT |
| GET | `/api/medicos` | Consultar regras em `src/routes/medicoRoutes.js` |
| GET | `/api/consultas/disponiveis` | JWT paciente |
| PUT | `/api/consultas/:id/agendar` | JWT paciente |
| PUT | `/api/consultas/:id/trocar` | JWT paciente |
| PUT | `/api/consultas/:id/cancelar` | JWT participante/admin |
| PUT | `/api/consultas/:id/realizada` | JWT medico |
| GET | `/api/consultas/historico` | JWT |
| POST | `/api/pre-triagens` | Token privado do servico de IA |
| GET | `/api/pre-triagens` | JWT paciente |

## Validacoes ainda necessarias em ambiente real

- `npm ci && npm test` (testes de banco descartavel e concorrencia).
- Iniciar com Atlas; `GET /api/health` deve retornar HTTP 200 e database=connected.
- Criar paciente ficticio, consulta e pre-triagem de teste; reiniciar processo e verificar que os registros persistem.
- Efetuar dois agendamentos concorrentes para o mesmo horario: somente um deve funcionar.
- Cancelar e reagendar, verificando preservacao do vinculo de pre-triagem e das prescricoes.
- Testar autenticao e negacao de acesso entre dois pacientes e um medico; nao usar dados reais.
- Testar no Expo Go em outro telefone e rede diferente, com a URL HTTPS publicada.

## Atencao

O script nao configura seu Atlas nem publica a API. Testes de integracao com servico de IA e frontend precisam das respectivas credenciais/endpoints privados.
