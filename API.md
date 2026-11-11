# Recordar — API (back-end)

API REST do Recordar (Saúde na Palma da Mão): clínicas, especialidades, médicos, pacientes, consultas e remédios.
Node.js + Express + MongoDB (Mongoose). Login com JWT, senha guardada com bcrypt.

Documentação interativa (Swagger): http://localhost:3000/api-docs

## Autenticação e autorização

- **Autenticação:** `POST /api/auth/login` confere e-mail e senha e devolve um token JWT (vale 8 horas). As outras rotas pedem o cabeçalho `Authorization: Bearer <token>`.
- **Autorização:** cada conta tem um `tipo` (`paciente`, `medico` ou `administrador`). O middleware `authorize` libera a rota só para os tipos permitidos, e os controllers conferem o dono do registro (um médico só mexe nas consultas e nos remédios dele, um paciente só nas consultas dele).
- A senha é guardada só como hash (bcrypt) e nunca aparece em nenhuma resposta.
- A conta de administrador não é criada pelo aplicativo: o servidor a cria ao ligar, com `ADMIN_EMAIL` e `ADMIN_SENHA` do `.env`.
- **Recuperar senha:** sem serviço de e-mail, a pessoa confirma um dado do cadastro (paciente: data de nascimento; médico: CRM) e cria a nova senha. A tela abre pelo "Esqueci minha senha" do acesso do paciente ou do médico, cada uma com o seu campo. A conta de administrador não é recuperada pelo aplicativo.
- **Tela de entrada:** abre no acesso do paciente; os botões "Entrar como médico" e "Entrar como administrador" trocam o acesso. O aplicativo envia o `tipo` escolhido; se a conta for de outro tipo, o login responde 403.
- **Quem cria cada conta:** o paciente cria a própria conta. O médico é cadastrado somente pelo administrador (`POST /api/users`), para que ninguém se passe por médico. O administrador também pode cadastrar outros administradores (`POST /api/users` com `tipo: "administrador"`). O primeiro administrador é criado pelo servidor com os dados do `.env`.
- **Telefone:** os campos de telefone do aplicativo usam máscara automática no formato `(81) 98888-7777` ou `(81) 3333-4444`.
- Rotas abertas (sem token): registro de paciente, login, recuperação de senha e as listas de clínicas e especialidades.

## Como o sistema funciona

1. O **administrador** cadastra as **especialidades** e as **clínicas**.
2. O administrador **cadastra o médico**, com a especialidade e as clínicas onde ele atende (pode ser mais de uma; a associação pode ser mudada depois pelo administrador ou pelo próprio médico no Perfil).
3. O médico cria **consultas** escolhendo a clínica, o dia e **vários horários de uma vez**: é a disponibilidade dele. Cada horário nasce `disponivel`.
4. O **paciente** cria a conta e responde à **anamnese geral** (doenças, alergias, medicamentos). Em Marcar consulta ele vê as consultas disponíveis (profissional, clínica e dia), aperta Ver horários, escolhe o horário e preenche a **anamnese da consulta**. A consulta vira `agendada` e sai da lista de Marcar consulta dele. Depois ele pode **trocar o horário** por outro horário livre do mesmo profissional.
5. O médico vê o paciente em "Pacientes", lê as duas anamneses (a geral e a da consulta) e receita **remédios** nessa consulta.
6. Os remédios aparecem na aba Remédios e na Agenda do dia do paciente. Cada remédio tem data inicial e data final: a Agenda do dia mostra só os que valem para o dia de hoje, então quando a receita muda (ex.: um remédio por 3 dias e depois outro), a agenda troca sozinha no dia certo.
7. O administrador gerencia usuários, clínicas, especialidades e consultas.

## Rotas

| Tela | Método e rota | Quem | O que faz |
|---|---|---|---|
| Criar conta | `POST /api/auth/register` | aberta | Cria conta de paciente e devolve o token |
| Entrar | `POST /api/auth/login` | aberta | Devolve token e dados do usuário (paciente, médico ou administrador) |
| Recuperar senha | `POST /api/auth/recuperar-senha` | aberta | Cria nova senha conferindo data de nascimento (paciente) ou CRM (médico) |
| Perfil | `GET /api/users/me` | todos | Dados da própria conta |
| Editar meus dados / Sua saúde | `PUT /api/users/me` | todos | Edita a própria conta (médico: especialidade e clínicas; paciente: anamnese geral) |
| Deletar conta | `DELETE /api/users/me` | paciente, médico | Apaga a conta e o que depende dela |
| Usuários | `GET /api/users?tipo=&busca=` | administrador | Lista pacientes e médicos (ou administradores, com `tipo=administrador`) |
| Usuários → Cadastrar médico | `POST /api/users` | administrador | Cadastra um médico com especialidade e clínicas |
| Usuários → Cadastrar administrador | `POST /api/users` (`tipo: "administrador"`) | administrador | Cadastra outro administrador |
| Usuários | `GET /api/users/:id` | administrador | Detalhe do usuário |
| Usuários → Editar | `PUT /api/users/:id` | administrador | Edita o cadastro e a associação do médico com clínicas |
| Usuários → Deletar | `DELETE /api/users/:id` | administrador | Apaga a conta e o que depende dela (não apaga a própria conta) |
| Clínicas (lista e pesquisa) | `GET /api/clinicas?busca=` | aberta | Busca por nome ou endereço |
| Clínicas | `GET /api/clinicas/:id` | aberta | Uma clínica |
| Clínicas → Cadastrar | `POST /api/clinicas` | administrador | Cadastra |
| Clínicas → Editar | `PUT /api/clinicas/:id` | administrador | Edita |
| Clínicas → Excluir | `DELETE /api/clinicas/:id` | administrador | Exclui, se não estiver em uso |
| Especialidades | `GET /api/especialidades?busca=` | aberta | Lista |
| Especialidades → Cadastrar | `POST /api/especialidades` | administrador | Cadastra |
| Especialidades → Editar | `PUT /api/especialidades/:id` | administrador | Edita |
| Especialidades → Excluir | `DELETE /api/especialidades/:id` | administrador | Exclui, se nenhum médico usa |
| Profissionais | `GET /api/medicos?nome=&clinica=&especialidade=` | todos | Profissionais por nome, clínica ou especialidade |
| Criar consulta | `POST /api/consultas` | médico | Cria disponibilidade: clínica, dia e uma lista de horários |
| Marcar consulta / Escolha o horário | `GET /api/consultas/disponiveis?clinica=&especialidade=&nome=&medico=&data=` | paciente | Horários livres (o aplicativo agrupa por profissional, clínica e dia) |
| Anamnese → Concluir | `PUT /api/consultas/:id/agendar` | paciente | Marca a consulta com a anamnese da consulta |
| Trocar horário | `PUT /api/consultas/:id/trocar` | paciente | Troca por outro horário livre do mesmo médico (`id_nova`) e gera um aviso para o médico |
| Avisos do médico → OK | `PUT /api/consultas/:id/aviso-visto` | médico da consulta | Marca o aviso de troca de horário como visto |
| Consultas → Consulta realizada | `PUT /api/consultas/:id/realizada` | médico da consulta | Encerra a consulta agendada: ela é apagada do banco, mas os remédios receitados continuam com o paciente |
| Próximas consultas / Início do médico / Consultas do admin | `GET /api/consultas?status=` | todos | Cada um vê só o que é seu; admin vê todas |
| Consulta | `GET /api/consultas/:id` | paciente e médico da consulta, administrador | Detalhe (as anamneses só para paciente e médico) |
| Pacientes | `GET /api/consultas/meus-pacientes?busca=` | médico | Pacientes com consulta agendada com ele e, depois deles, os pacientes sem consulta agendada (ex.: depois de Consulta realizada) que ainda têm algum remédio dele que não terminou (`id_consulta: null`). O paciente sai da lista quando a data final de todos os remédios passa. Cada item traz `total_remedios` e `remedios_ativos` |
| Pacientes → Remédios | `GET /api/remedios?paciente=:id` | médico | Todos os remédios que ele receitou para o paciente, inclusive de consultas já realizadas (para editar ou excluir) |
| Cancelar consulta | `PUT /api/consultas/:id/cancelar` | paciente e médico da consulta, administrador | Consulta volta a ficar disponível |
| Excluir consulta | `DELETE /api/consultas/:id` | médico dono, administrador | Apaga a consulta |
| Adicionar remédio | `POST /api/remedios` | médico | Receita em uma consulta agendada dele, com `data_inicio` e `data_fim` (o período em que o paciente toma o remédio) |
| Remédios | `GET /api/remedios?consulta=&paciente=` | todos | Paciente vê os dele: primeiro os em uso, depois os que vão começar e por último os que terminaram |
| Agenda do dia | `GET /api/remedios?dia=AAAA-MM-DD` | todos | Só os remédios cujo período inclui esse dia, por horário. O app manda o dia de hoje |
| Agenda do dia (marcar) | `PUT /api/remedios/:id/tomar` | paciente | Marca ou desmarca o remédio como tomado no dia (`dia`, padrão hoje). Fora do período: 400 |
| Editar remédio | `PUT /api/remedios/:id` | médico que receitou | Edita, inclusive o período |
| Excluir remédio | `DELETE /api/remedios/:id` | médico que receitou, administrador | Apaga |

## Nomes dos campos

- Clínica: `nome_clinica`, `endereco_clinica`, `telefone_clinica`
- Especialidade: `nome_especialidade`
- Paciente: `nome_paciente`, `data_nascimento` (AAAA-MM-DD), `idade`, `telefone`, `email`
- Médico: `nome_medico`, `crm`, `id_especialidade`, `nome_especialidade`, `clinicas` (lista de clínicas), `telefone`, `email`
  - ao enviar: `id_especialidade` (ID) e `clinicas` (lista de IDs)
- Consulta: `data_consulta` (AAAA-MM-DD), `horario_consulta` (HH:MM), `status`, `id_clinica`, `nome_clinica`, `endereco_clinica`, `id_medico`, `nome_medico`, `nome_especialidade`, `id_paciente`, `nome_paciente`, `idade_paciente`, `anamnese`
  - ao criar: `id_clinica`, `data_consulta`, `horarios` (lista de HH:MM)
- Anamnese da consulta (`anamnese`): `queixa_principal`, `sintomas`, `inicio_sintomas`
- Anamnese geral do paciente (`anamnese_geral`): `condicoes_saude`, `alergias`, `medicamentos_em_uso`
- Remédio: `nome_remedio`, `horario_remedio` (HH:MM), `quantidade_remedio`, `data_inicio` e `data_fim` (AAAA-MM-DD), `situacao` (`em_uso`, `futuro` ou `encerrado`, em relação a hoje), `tomado_hoje` (no dia pedido), `id_consulta`, `nome_medico`, `nome_paciente`

## Códigos de resposta

`200` certo · `201` criado · `400` dado faltando ou inválido · `401` sem login ou token vencido · `403` logado, mas sem permissão · `404` não encontrado · `409` conflito (e-mail, clínica ou horário repetido, registro em uso)

## O que acontece ao excluir

| Ação | Efeito |
|---|---|
| Deletar paciente | Os remédios dele são apagados. As consultas que ele marcou voltam a ficar disponíveis. |
| Deletar médico | Todas as consultas dele e os remédios que receitou são apagados. |
| Cancelar consulta | Ela volta a ficar disponível, a anamnese da consulta é limpa e os remédios receitados nela são apagados. |
| Trocar horário | O horário antigo volta a ficar disponível; a anamnese da consulta e os remédios passam para o novo horário. O médico vê um aviso no Início (`aviso_troca`) até apertar OK. |
| Marcar consulta | O paciente não marca dois horários com o mesmo médico no mesmo dia (responde 409). |
| Excluir consulta | A consulta e os remédios receitados nela são apagados. |
| Consulta realizada | A consulta sai do banco (some das listas do médico, do paciente e da administração); os remédios receitados nela continuam com o paciente. |
| Excluir clínica | Só é permitido sem médicos associados e sem consultas (senão responde 409). |
| Excluir especialidade | Só é permitido se nenhum médico usa (senão responde 409). |
| Médico desmarca uma clínica | Só é permitido se ele não tem consultas criadas nela. |
| Conta deletada | O token para de funcionar na hora. |

## Estrutura

```
src/
├── server.js            monta as rotas, conecta no banco, cria o administrador e sobe o servidor
├── config/              swagger (documentação), format (campos de saída), datas, vinculos
├── controllers/         auth, user, clinica, especialidade, consulta, remedio
├── middlewares/         authMiddleware (token e tipo), errorHandler, asyncHandler
├── models/              User, Clinic, Specialty, Appointment, Medication
└── routes/              uma por recurso; aqui fica quem pode chamar cada rota
```
