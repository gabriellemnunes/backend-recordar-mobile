const express = require("express");
const controller = require("../controllers/clinicaController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const h = require("../middlewares/asyncHandler");

const router = express.Router();

router.get("/", h(controller.list));
router.get("/:id", h(controller.getById));

router.post("/", authenticate, authorize("administrador"), h(controller.create));
router.put("/:id", authenticate, authorize("administrador"), h(controller.update));
router.delete("/:id", authenticate, authorize("administrador"), h(controller.remove));

module.exports = router;
