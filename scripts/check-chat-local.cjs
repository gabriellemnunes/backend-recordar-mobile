const assert = require("node:assert/strict");
const base = process.env.CHAT_TEST_API || "http://127.0.0.1:3005/api";
async function main() {
  const login = await fetch(base + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tipo: "paciente",
      email: "paciente@demo.recordar",
      senha: "RecordarDemo123!",
    }),
  });
  const auth = await login.json();
  assert.equal(login.status, 200);
  async function api(path, body, method = body ? "POST" : "GET") {
    const r = await fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + auth.token,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const result = await r.json();
    assert.equal(r.status, 200, result.message);
    return result;
  }
  let result = await api("/chat", {
    mensagem:
      "Exemplo fictício para teste: estou com dor leve no joelho ao caminhar.",
    consentimento_ia: true,
  });
  const id = result.id_conversa;
  assert.ok(id);
  for (const mensagem of [
    "dois dias",
    "3",
    "Não tenho outros sintomas. Este é um exemplo fictício.",
  ]) {
    result = await api("/chat", { mensagem, id_conversa: id });
  }
  assert.equal(result.concluida, true);
  assert.equal(result.urgencia, false);
  assert.ok(result.id_pre_triagem);
  const triage = await api("/pre-triagens/" + result.id_pre_triagem);
  assert.equal(triage.intensidade, 3);
  assert.ok(triage.especialidades.length);
  const available = await api(
    "/consultas/disponiveis?id_pre_triagem=" + result.id_pre_triagem,
  );
  assert.ok(Array.isArray(available));
  assert.equal(String(triage.paciente), String(auth.user.id));
  const history = await api("/chat/" + id);
  assert.equal(history.id_pre_triagem, result.id_pre_triagem);
  assert.ok(history.mensagens.length >= 8);
  const recommended = triage.especialidades.map((x) => x.nome_especialidade);
  for (const slot of available) {
    assert.ok(recommended.includes(slot.nome_especialidade));
    assert.ok(slot.id_medico && slot.nome_medico);
    assert.ok(slot.id_clinica && slot.nome_clinica);
    assert.match(slot.data_consulta, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(slot.horario_consulta, /^\d{2}:\d{2}$/);
  }
  let bookingChecked = false;
  // Opção explícita, somente em demonstração local com dados fictícios.
  if (process.env.CHAT_TEST_BOOKING === "1") {
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
    assert.ok(available.length, "Nenhum horário disponível para validar o agendamento.");
    const slot = available[0];
    let booked;
    try {
      booked = await api(`/consultas/${slot.id}/agendar`, {
        id_pre_triagem: result.id_pre_triagem,
      }, "PUT");
      assert.equal(booked.status, "agendada");
      assert.equal(String(booked.id_paciente), String(auth.user.id));
      assert.equal(String(booked.id_pre_triagem), result.id_pre_triagem);
      for (const key of ["id_medico", "id_clinica", "nome_especialidade", "data_consulta", "horario_consulta"])
        assert.equal(booked[key], slot[key], key);
      const agenda = await api("/consultas");
      assert.ok(agenda.some((c) => c.id === booked.id && c.id_pre_triagem === result.id_pre_triagem));
      bookingChecked = true;
    } finally {
      if (booked) await api(`/consultas/${booked.id}/cancelar`, undefined, "PUT");
    }
    const after = await api("/consultas");
    assert.ok(!after.some((c) => c.id === booked.id));
  }
  console.log(
    JSON.stringify(
      {
        ia_real: true,
        agendamento_validado_e_cancelado: bookingChecked,
        conversa: id,
        pre_triagem: result.id_pre_triagem,
        especialidades: triage.especialidades.map((x) => x.nome_especialidade),
        horarios: available.length,
        resposta: result.resposta,
      },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
