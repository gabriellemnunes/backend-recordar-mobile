# Integração do agendamento mobile

Base copiada de `gabriellemnunes/backend-recordar`, commit `40df654da45def501b4c153b621ef99539cb6a3a`.

## Contrato de pré-triagem

Modelo `PreTriage`, coleção Mongoose padrão `pretriages`:

```json
{
  "paciente": "ObjectId do usuário paciente",
  "especialidades": ["ObjectId de Specialty cadastrada"],
  "resumo": "Resumo produzido pelo serviço de IA",
  "urgencia": false,
  "concluida": true
}
```

O serviço de Andreza/Bia deve gravar esse documento por uma rota autenticada e validada de sua responsabilidade. Esta entrega lê o resultado persistido; não fornece uma rota pública para o aplicativo fabricar recomendações. Somente o dono pode usar o resultado. Pré-triagens incompletas, sem especialidade ou com urgência são recusadas.

## Rotas

Todas exigem `Authorization: Bearer <token>`.

| Método e rota | Uso |
| --- | --- |
| `GET /api/pre-triagens` | Até 50 pré-triagens concluídas do paciente autenticado, recentes primeiro |
| `GET /api/consultas/disponiveis?id_pre_triagem=ID` | Horários futuros das especialidades recomendadas |
| `GET /api/consultas/disponiveis?medico=ID&clinica=ID&data=AAAA-MM-DD&especialidade=ID` | Filtros opcionais; recomendação prevalece sobre especialidade manual |
| `GET /api/consultas` | Agenda do paciente, conforme contrato existente |
| `PUT /api/consultas/:id/agendar` | Corpo `{ "id_pre_triagem": "ID" }` ou motivo obrigatório em `{ "queixa_principal": "..." }` no agendamento direto |
| `PUT /api/consultas/:id/trocar` | Corpo `{ "id_nova": "ID do horário disponível" }`; mesmo profissional |
| `PUT /api/consultas/:id/cancelar` | Paciente dono, médico responsável ou administrador |

O ID da pré-triagem acompanha a consulta em `id_pre_triagem` nas respostas privadas para paciente/médico. Horários disponíveis não expõem sintomas de pré-triagem. Trocas preservam o ID e os campos de anamnese.

Erros: 400 dados/IDs inválidos; 401 sessão ausente/expirada; 403 sem permissão; 404 consulta/pré-triagem inacessível; 409 horário passado, ocupado ou conflitante; 422 resultado de IA incompatível ou urgente.

## Consistência

Reserva, troca e cancelamento usam transações. O campo interno `User.booking_revision` serializa reservas/trocas do mesmo paciente; o índice único existente de médico/data/horário permanece. Mantida a regra de uma consulta por médico por dia para o paciente; acrescentada a prevenção de duas consultas de médicos diferentes com o mesmo horário inicial. A troca é atômica: falhas não liberam a consulta atual nem deixam o destino reservado pela metade.

Cancelamento preserva medicamentos e remove o vínculo destes com o horário liberado; não cancela a prescrição. Essa mudança evita apagar tratamentos quando o paciente cancela uma consulta.

## Executar e validar

```sh
npm ci
npm test
```

Os testes baixam MongoDB e iniciam replica set descartável na pasta `../../work`. Para demonstração com conta e horários fictícios:

```sh
npm run demo
```

Para usar uma cópia real do banco, configure `.env` conforme `.env.example` e execute `npm start`. É obrigatório Atlas ou replica set com transações. Use Node.js 22.13 ou superior. Nunca informe o banco oficial no modo de desenvolvimento.

A lógica nova está em `src/controllers/agendamentoController.js`; o roteador mantém o restante do controlador original. `PreTriage.js` define o contrato que deve ser alinhado com Andreza e Bia antes de integrar o serviço real.
