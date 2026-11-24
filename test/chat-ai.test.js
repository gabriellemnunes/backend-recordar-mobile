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

test("Groq autentica, solicita JSON estruturado e valida as especialidades", async (t) => {
  const env = process.env;
  process.env = {
    ...env,
    AI_PROVIDER: "groq",
    GROQ_API_KEY: "chave-ficticia",
    GROQ_MODEL: "openai/gpt-oss-20b",
  };
  t.after(() => {
    process.env = env;
  });
  const catalogo = [{ _id: "real", nome_especialidade: "Clínica Médica" }];
  const dados = { sintomas: "relato fictício" };
  const fake = async (url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer chave-ficticia");
    assert.equal(body.model, "openai/gpt-oss-20b");
    assert.equal(body.response_format.json_schema.strict, true);
    assert.deepEqual(JSON.parse(body.messages[1].content), dados);
    return { ok: true, json: async () => ({ choices: [{ message: {
      content: JSON.stringify({ sintomas: ["relato fictício"], especialidades: ["real"], urgencia: false }),
    } }] }) };
  };
  assert.deepEqual((await interpretar(dados, catalogo, fake)).especialidades, ["real"]);
  await assert.rejects(interpretar(dados, catalogo, async () => ({ ok: false, status: 429 })), { httpStatus: 503 });
  delete process.env.GROQ_API_KEY;
  await assert.rejects(interpretar(dados, catalogo, fake), { httpStatus: 503 });
});
