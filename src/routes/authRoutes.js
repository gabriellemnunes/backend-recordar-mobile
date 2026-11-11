const express = require("express");
const controller = require("../controllers/authController");
const h = require("../middlewares/asyncHandler");

const router = express.Router();
router.post("/register", h(controller.register));
router.post("/login", h(controller.login));
router.post("/recuperar-senha", h(controller.recuperarSenha));

module.exports = router;
