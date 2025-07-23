import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

export const protectRoute = async (req, res, next) => {
  try {
    const token = req.cookies.jwt;

    if (!token) {
      return res.status(401).json({ message: "No autorizado: no se proporciona ningún token" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded) {
      return res.status(401).json({ message: "No autorizado - Token inválido" });
    }

    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    req.user = user;

    next();
  } catch (error) {
    console.log("Error en el middleware protectRoute: ", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};
