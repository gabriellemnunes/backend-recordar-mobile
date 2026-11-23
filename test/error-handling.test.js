const { test } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const app = require("../src/server");

test("login sem campos obrigatórios retorna 400 e lista os campos", async () => {
  const response = await request(app).post("/api/auth/login").send({ email: " " });
  assert.equal(response.status, 400);
  assert.deepEqual(response.body.fields, ["email", "senha"]);
});

test("JSON inválido retorna 400 com mensagem clara", async () => {
  const response = await request(app).post("/api/auth/login")
    .set("Content-Type", "application/json").send('{"email":');
  assert.equal(response.status, 400);
  assert.equal(response.body.message, "JSON inválido no corpo da requisição.");
});

test("rota inexistente retorna 404", async () => {
  const response = await request(app).get("/api/rota-que-nao-existe");
  assert.equal(response.status, 404);
  assert.equal(response.body.message, "Rota não encontrada.");
});
