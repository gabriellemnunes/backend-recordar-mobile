# Validação de agendamento e IA — 23/11/2026

Validação local com dados fictícios; não comprova deploy, APK ou avaliação clínica.

## Resultados

- Backend: 39 testes passaram.
- Frontend: 49 testes passaram.
- Cliente HTTP mobile contra API e MongoDB temporário: 25 verificações passaram.
- Ollama real: conversa com sintomas, duração, intensidade e informações complementares; resultado concluído e salvo para o paciente autenticado.
- Histórico da conversa recuperado pela API com o mesmo ID de pré-triagem.
- Horários filtrados pela especialidade recomendada, com profissional, clínica, data e horário preenchidos.
- Agendamento confirmado com paciente e pré-triagem corretos, conferido novamente na agenda e cancelado ao terminar para liberar o horário fictício.

## Ajustes

O teste HTTP do frontend ainda esperava sucesso na recuperação legada de senha. Foi atualizado para exigir HTTP 403 e verificar que o login original continua funcionando, respeitando a revisão de segurança de Bia.

O verificador de IA real agora permite validar o agendamento completo, com cancelamento ao terminar. Nenhuma mudança no design, navegação ou regra clínica.

## Repetir a validação real

Usar apenas uma API local de demonstração com dados fictícios e Ollama disponível. No PowerShell, dentro do backend:

```powershell
$env:CHAT_TEST_API='http://127.0.0.1:3006/api'
$env:CHAT_TEST_BOOKING='1'
node scripts/check-chat-local.cjs
```

Sem `CHAT_TEST_BOOKING=1`, o verificador apenas conversa, salva a pré-triagem e consulta as disponibilidades. Os registros fictícios de conversa e pré-triagem permanecem no banco de demonstração.

## GitHub

Na consulta de 23/11/2026, a principal do backend estava em `112e1ab` e a do frontend em `1c42e86`. Os commits locais de IA `881eada` (backend) e `0dfb43a` (frontend) não estavam incorporados nessas versões. Esta validação não publica alterações no GitHub.
