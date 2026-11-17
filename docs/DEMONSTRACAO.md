# Demonstração local do Recordar

Execute npm run demo no backend. Usa exclusivamente MongoDB temporário e escuta em 127.0.0.1:3000. Nunca conecta ao banco oficial. Os dados são recriados em cada início; alterações feitas durante a sessão não são permanentes após encerrar o banco temporário.

## Contas

Senha de todas: RecordarDemo123!

- Paciente: paciente@demo.recordar — Maria Helena Santos, 73 anos na data de 17/11/2026.
- Médico: medico@demo.recordar — Ana Carolina Mendes (demonstração).
- Administrador: admin@demo.recordar — Gabriela Nunes (demonstração). Acesso somente pela área da equipe; as permissões continuam validadas no backend.

## Registros

O paciente tem foto fictícia, dados de perfil, três medicamentos de exemplo, dois agendamentos futuros, uma consulta realizada e pré-triagem fictícia vinculada a um agendamento. O primeiro medicamento aparece tomado hoje. Os demais estão pendentes. São registros efetivos nas coleções da API de demonstração, e não valores simulados pelo frontend.

Os medicamentos A, B e C não são medicamentos reais. As quantidades são ilustrativas e não representam orientação de tratamento. A pré-triagem de exemplo não foi produzida por IA e não descreve sintomas reais.

## Foto

A imagem de scripts/assets/maria-helena-demo.jpg foi gerada pela ferramenta integrada de imagens. Retrata uma pessoa fictícia. Foi preparada em JPEG de 400 × 400 para respeitar o limite da API.

Prompt utilizado:
Create a photorealistic profile avatar portrait of a fictional Brazilian woman aged around 73, named Maria Helena Santos only for a demo app (do not render any text). Head and shoulders, looking at camera, kind relaxed expression and gentle natural smile, short silver-gray hair, natural age lines and realistic skin texture, simple light lavender blouse. Soft neutral off-white background, even soft daylight, clean portrait photography, centered face and shoulders, generous safe padding for a circular crop, square composition. No text, watermark, accessories covering face, medical equipment, uniform or background objects. This is a fictional person, not a public figure or any real person's likeness.
