const { test } = require("node:test");
const assert = require("node:assert/strict");
const { interpretar, sinalAlerta } = require("../src/services/chatAI");
test("alertas reconhecem relatos e respeitam negacao simples", () => {
  assert.equal(!!sinalAlerta("Tenho falta de ar"), true);
  assert.equal(!!sinalAlerta("não tenho falta de ar"), false);
  assert.equal(
    !!sinalAlerta("não tenho febre, mas estou com falta de ar"),
    true,
  );
});
test("IA nao aceita especialidade inexistente ou resposta malformada", async () => {
  process.env.AI_PROVIDER = "ollama";
  const fake = async () => ({
    ok: true,
    json: async () => ({
      message: {
        content: JSON.stringify({
          sintomas: ["dor"],
          especialidades: ["inventada"],
          urgencia: false,
        }),
      },
    }),
  });
  await assert.rejects(
    interpretar(
      {},
      [{ _id: "real", nome_especialidade: "Clínica Médica" }],
      fake,
    ),
    (e) => e.httpStatus === 503,
  );
});
test("IA envia esquema e aceita apenas catalogo fornecido", async () => {
  process.env.AI_PROVIDER = "ollama";
  let sent;
  const fake = async (url, options) => {
    sent = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        message: {
          content: JSON.stringify({
            sintomas: ["dor no joelho"],
            especialidades: ["real"],
            urgencia: false,
          }),
        },
      }),
    };
  };
  const r = await interpretar(
    { sintomas: "dor no joelho" },
    [{ _id: "real", nome_especialidade: "Clínica Médica" }],
    fake,
  );
  assert.equal(sent.stream, false);
  assert.equal(sent.format.additionalProperties, false);
  assert.deepEqual(r.especialidades, ["real"]);
});
