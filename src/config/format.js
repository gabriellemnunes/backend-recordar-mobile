const { calcularIdade, hoje } = require("./datas");

function formatClinica(c) {
  return {
    id: c._id,
    nome_clinica: c.nome_clinica,
    endereco_clinica: c.endereco_clinica,
    telefone_clinica: c.telefone_clinica
  };
}

function formatEspecialidade(e) {
  return { id: e._id, nome_especialidade: e.nome_especialidade };
}

const populado = (doc) => doc && typeof doc === "object" && doc._id && !doc._bsontype;

function formatMedicoPublico(u) {
  const esp = populado(u.especialidade) ? u.especialidade : null;
  return {
    id: u._id,
    nome_medico: u.nome_usuario,
    crm: u.crm,
    id_especialidade: esp ? esp._id : null,
    nome_especialidade: esp ? esp.nome_especialidade : null,
    clinicas: (u.clinicas || []).filter(populado).map(formatClinica)
      .sort((a, b) => a.nome_clinica.localeCompare(b.nome_clinica, "pt-BR"))
  };
}

function formatUser(u, { comSaude = false } = {}) {
  const base = { id: u._id, tipo: u.tipo, email: u.email, telefone: u.telefone };
  if (u.tipo === "paciente") {
    const paciente = {
      ...base,
      nome_paciente: u.nome_usuario,
      data_nascimento: u.data_nascimento,
      idade: calcularIdade(u.data_nascimento),
      anamnese_preenchida: !!u.anamnese_preenchida
    };
    if (comSaude) {
      paciente.condicoes_saude = u.condicoes_saude || "";
      paciente.alergias = u.alergias || "";
      paciente.medicamentos_em_uso = u.medicamentos_em_uso || "";
    }
    return paciente;
  }
  if (u.tipo === "medico") {
    const { id, ...medico } = formatMedicoPublico(u);
    return { ...base, ...medico };
  }
  return { ...base, nome_administrador: u.nome_usuario };
}

function formatConsulta(c, { comAnamnese = false } = {}) {
  const m = populado(c.medico) ? c.medico : null;
  const p = populado(c.paciente) ? c.paciente : null;
  const cl = populado(c.clinica) ? c.clinica : null;
  const esp = m && populado(m.especialidade) ? m.especialidade : null;
  const saida = {
    id: c._id,
    status: c.status,
    data_consulta: c.data_consulta,
    horario_consulta: c.horario_consulta,
    id_clinica: cl ? cl._id : null,
    nome_clinica: cl ? cl.nome_clinica : null,
    endereco_clinica: cl ? cl.endereco_clinica : null,
    id_medico: m ? m._id : null,
    nome_medico: m ? m.nome_usuario : null,
    crm_medico: m ? m.crm : null,
    nome_especialidade: esp ? esp.nome_especialidade : null,
    id_paciente: p ? p._id : null,
    nome_paciente: p ? p.nome_usuario : null,
    idade_paciente: p ? calcularIdade(p.data_nascimento) : null,
    telefone_paciente: p ? p.telefone : null,
    email_paciente: p ? p.email : null,
    aviso_troca: c.aviso_troca
      ? { data_anterior: c.troca_data_anterior, horario_anterior: c.troca_horario_anterior }
      : null
  };
  if (comAnamnese) {
    saida.id_pre_triagem = c.pre_triagem || null;
    saida.anamnese = {
      queixa_principal: c.queixa_principal,
      sintomas: c.sintomas,
      inicio_sintomas: c.inicio_sintomas
    };
    saida.anamnese_geral = {
      condicoes_saude: p ? p.condicoes_saude || "" : "",
      alergias: p ? p.alergias || "" : "",
      medicamentos_em_uso: p ? p.medicamentos_em_uso || "" : ""
    };
  }
  return saida;
}

function situacaoRemedio(r, dia = hoje()) {
  if (r.data_inicio && dia < r.data_inicio) return "futuro";
  if (r.data_fim && dia > r.data_fim) return "encerrado";
  return "em_uso";
}

function formatRemedio(r, dia = hoje()) {
  return {
    id: r._id,
    nome_remedio: r.nome_remedio,
    horario_remedio: r.horario_remedio,
    quantidade_remedio: r.quantidade_remedio,
    data_inicio: r.data_inicio || null,
    data_fim: r.data_fim || null,
    situacao: situacaoRemedio(r),
    tomado_hoje: (r.dias_tomados || []).includes(dia) || r.tomado_em === dia,
    id_consulta: r.consulta,
    id_medico: r.medico ? r.medico._id : null,
    nome_medico: r.medico ? r.medico.nome_usuario : null,
    id_paciente: r.paciente ? r.paciente._id : null,
    nome_paciente: r.paciente ? r.paciente.nome_usuario : null
  };
}

module.exports = { situacaoRemedio, formatUser, formatMedicoPublico, formatConsulta, formatRemedio, formatClinica, formatEspecialidade };
