import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getContacts,
  getPendingRequests,
  searchUsers,
  sendContactRequest,
  acceptContactRequest,
  rejectContactRequest,
  removeContact,
  updateContactNickname
} from "../controllers/contact.controller.js";

const router = express.Router();

router.use(protectRoute);

router.get("/", getContacts);

router.get("/pending", getPendingRequests);

router.get("/search", searchUsers);

router.post("/request", sendContactRequest);

router.put("/accept/:requestId", acceptContactRequest);

router.delete("/reject/:requestId", rejectContactRequest);

router.delete("/:contactId", removeContact);

router.put("/:contactId/nickname", updateContactNickname);

router.get("/test", (req, res) => {
  res.json({ message: "Contact routes working!" });
});

export default router;