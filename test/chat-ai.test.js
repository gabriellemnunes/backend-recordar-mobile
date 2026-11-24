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

test("Groq repete falhas transitórias e registra apenas metadados", async (t) => {
  const env = process.env;
  process.env = { ...env, AI_PROVIDER: "groq", GROQ_API_KEY: "chave-ficticia" };
  t.after(() => { process.env = env; });
  const log = t.mock.method(console, "warn", () => {});
  const catalogo = [{ _id: "real" }];
  const valid = { sintomas: ["relato fictício"], especialidades: ["real"], urgencia: false };
  const completion = (content, finish_reason = "stop") =>
    Response.json({ choices: [{ finish_reason, message: { content } }] });
  let calls = 0;
  const result = await interpretar(valid, catalogo, async () => {
    calls++;
    if (calls === 1) return new Response("mensagem privada", { status: 503 });
    if (calls === 2) throw new TypeError("segredo em erro de rede");
    return completion(JSON.stringify(valid));
  });
  assert.deepEqual(result, valid);
  assert.equal(calls, 3);
  assert.deepEqual(log.mock.calls.map((c) => c.arguments[1]), [
    { provider: "groq", category: "upstream_unavailable", status: 503, attempt: 1, retry: true },
    { provider: "groq", category: "network", status: null, attempt: 2, retry: true },
  ]);

  process.env.CHAT_TIMEOUT_MS = "1000";
  for (const [response, category] of [
    [new Response(null, { status: 429, headers: { "Retry-After": "10" } }), "rate_limit"],
    [new Response(null, { status: 401 }), "authentication"],
    [completion("{"), "invalid_json"],
    [completion(JSON.stringify({ ...valid, prescricao: "campo não permitido" })), "invalid_schema"],
    [completion(JSON.stringify(valid), "length"), "incomplete_response"],
  ]) {
    calls = 0;
    await assert.rejects(interpretar(valid, catalogo, async () => {
      calls++;
      return response;
    }), { httpStatus: 503 });
    assert.equal(calls, 1);
    assert.equal(log.mock.calls.at(-1).arguments[1].category, category);
  }

  calls = 0;
  await assert.rejects(interpretar(valid, catalogo, async (_url, { signal }) => {
    calls++;
    return {
      ok: true,
      status: 200,
      json: () => require("node:timers/promises").setTimeout(2000, valid, { signal }),
    };
  }), { httpStatus: 503 });
  assert.equal(calls, 1);
  assert.deepEqual(log.mock.calls.at(-1).arguments[1], {
    provider: "groq", category: "timeout", status: 200, attempt: 1, retry: false,
  });

  process.env.GROQ_MODEL = " URL inválida ";
  await assert.rejects(interpretar(valid, catalogo, async () => {
    assert.fail("modelo inválido chegou à rede");
  }), { httpStatus: 503 });
  assert.equal(log.mock.calls.at(-1).arguments[1].category, "invalid_model");

  process.env.GROQ_MODEL = " llama-3.1-8b-instant ";
  let request;
  await interpretar(valid, catalogo, async (_url, options) => {
    request = JSON.parse(options.body);
    return completion(JSON.stringify(valid));
  });
  assert.equal(request.model, "llama-3.1-8b-instant");
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.equal(request.reasoning_effort, undefined);
});
