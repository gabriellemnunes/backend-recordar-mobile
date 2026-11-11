const express = require("express");
const controller = require("../controllers/userController");
const { authenticate, authorize } = require("../middlewares/authMiddleware");
const h = require("../middlewares/asyncHandler");

const router = express.Router();
router.use(authenticate);

router.get("/me", h(controller.me));
router.put("/me", h(controller.updateMe));
router.delete("/me", h(controller.removeMe));

router.get("/", authorize("administrador"), h(controller.list));
router.post("/", authorize("administrador"), h(controller.create));
router.get("/:id", authorize("administrador"), h(controller.getById));
router.put("/:id", authorize("administrador"), h(controller.update));
router.delete("/:id", authorize("administrador"), h(controller.remove));

module.exports = router;
