# Recordar — cópia para mobile

Base oficial preservada: https://github.com/gabriellemnunes/backend-recordar

 reserva, cancelamento e troca transacionais; integração de pré-triagem e validação de disponibilidade.

Consulte [AGENDAMENTO.md](AGENDAMENTO.md) para configuração, contrato da IA, testes e demonstração.

`npm ci` instala dependências. `npm test` valida as regras com banco descartável. `npm run demo` inicia dados fictícios na porta 3000. Para usar um banco próprio de desenvolvimento, configure `.env` e execute `npm start`. Exige MongoDB com replica set ou Atlas.

A documentação interativa fica em `/api-docs`. As rotas preexistentes continuam disponíveis; [API.md](API.md) documenta a base anterior e deve ser lido junto das alterações em AGENDAMENTO.md.
