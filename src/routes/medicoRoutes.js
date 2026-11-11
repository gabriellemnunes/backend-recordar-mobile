const express = require("express");
const controller = require("../controllers/userController");
const { authenticate } = require("../middlewares/authMiddleware");
const h = require("../middlewares/asyncHandler");

const router = express.Router();
router.use(authenticate);

router.get("/", h(controller.listMedicos));

module.exports = router;
