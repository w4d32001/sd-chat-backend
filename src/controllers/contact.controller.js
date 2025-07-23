// controllers/contactController.js
import Contact from "../models/contact.model.js";
import User from "../models/user.model.js";
import mongoose from "mongoose";

export const getContacts = async (req, res) => {
  try {
    const userId = req.user._id;

    const contacts = await Contact.find({
      userId: userId,
      status: "accepted"
    })
    .populate({
      path: "contactId",
      select: "fullName email profilePic"
    })
    .sort({ acceptedAt: -1 });

    const formattedContacts = contacts.map(contact => ({
      _id: contact.contactId._id,
      fullName: contact.nickname || contact.contactId.fullName,
      originalName: contact.contactId.fullName,
      email: contact.contactId.email,
      profilePic: contact.contactId.profilePic,
      nickname: contact.nickname,
      addedAt: contact.acceptedAt,
      isContact: true
    }));

    res.status(200).json(formattedContacts);
  } catch (error) {
    console.error("Error getting contacts:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Obtener solicitudes de contacto pendientes
export const getPendingRequests = async (req, res) => {
  try {
    const userId = req.user._id;

    // Solicitudes recibidas (que otros me enviaron)
    const receivedRequests = await Contact.find({
      userId: userId,
      status: "pending",
      requestedBy: { $ne: userId }
    })
    .populate({
      path: "contactId",
      select: "fullName email profilePic"
    })
    .sort({ createdAt: -1 });

    // Solicitudes enviadas (que yo envié)
    const sentRequests = await Contact.find({
      userId: userId,
      status: "pending",
      requestedBy: userId
    })
    .populate({
      path: "contactId",
      select: "fullName email profilePic"
    })
    .sort({ createdAt: -1 });

    res.status(200).json({
      received: receivedRequests.map(req => ({
        _id: req._id,
        user: req.contactId,
        createdAt: req.createdAt
      })),
      sent: sentRequests.map(req => ({
        _id: req._id,
        user: req.contactId,
        createdAt: req.createdAt
      }))
    });
  } catch (error) {
    console.error("Error getting pending requests:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Buscar usuarios para agregar como contactos
export const searchUsers = async (req, res) => {
  try {
    const { query } = req.query;
    const userId = req.user._id;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({ message: "La búsqueda debe tener al menos 2 caracteres" });
    }

    // Buscar usuarios por nombre o email
    const users = await User.find({
      _id: { $ne: userId }, // Excluir al usuario actual
      $or: [
        { fullName: { $regex: query, $options: "i" } },
        { email: { $regex: query, $options: "i" } }
      ]
    })
    .select("fullName email profilePic")
    .limit(20);

    // Verificar el estado de cada usuario encontrado
    const usersWithStatus = await Promise.all(
      users.map(async (user) => {
        const relation = await Contact.existsRelation(userId, user._id);
        
        let status = "none";
        let canAdd = true;
        
        if (relation) {
          status = relation.status;
          canAdd = false;
        }

        return {
          _id: user._id,
          fullName: user.fullName,
          email: user.email,
          profilePic: user.profilePic,
          relationStatus: status,
          canAdd: canAdd
        };
      })
    );

    res.status(200).json(usersWithStatus);
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Enviar solicitud de contacto
export const sendContactRequest = async (req, res) => {
  try {
    const { contactId } = req.body;
    const userId = req.user._id;

    // Validaciones
    if (!contactId) {
      return res.status(400).json({ message: "ID de contacto requerido" });
    }

    if (!mongoose.Types.ObjectId.isValid(contactId)) {
      return res.status(400).json({ message: "ID de contacto inválido" });
    }

    if (contactId === userId.toString()) {
      return res.status(400).json({ message: "No puedes agregarte a ti mismo" });
    }

    // Verificar que el usuario objetivo existe
    const targetUser = await User.findById(contactId);
    if (!targetUser) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Verificar si ya existe una relación
    const existingRelation = await Contact.existsRelation(userId, contactId);
    if (existingRelation) {
      let message = "Ya tienes una relación con este usuario";
      if (existingRelation.status === "pending") {
        message = "Ya tienes una solicitud pendiente con este usuario";
      } else if (existingRelation.status === "accepted") {
        message = "Este usuario ya está en tus contactos";
      } else if (existingRelation.status === "blocked") {
        message = "No puedes agregar a este usuario";
      }
      return res.status(400).json({ message });
    }

    // Crear la solicitud bidireccional
    await Contact.createBidirectionalContact(userId, contactId, "pending");

    res.status(201).json({ 
      message: "Solicitud de contacto enviada exitosamente" 
    });
  } catch (error) {
    console.error("Error sending contact request:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Aceptar solicitud de contacto
export const acceptContactRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    // Buscar la solicitud
    const request = await Contact.findOne({
      _id: requestId,
      userId: userId,
      status: "pending",
      requestedBy: { $ne: userId } // Solo puede aceptar solicitudes que no envió
    });

    if (!request) {
      return res.status(404).json({ message: "Solicitud no encontrada" });
    }

    // Actualizar estado a aceptado
    await Contact.updateBidirectionalStatus(userId, request.contactId, "accepted");

    res.status(200).json({ 
      message: "Solicitud de contacto aceptada" 
    });
  } catch (error) {
    console.error("Error accepting contact request:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Rechazar/cancelar solicitud de contacto
export const rejectContactRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    // Buscar la solicitud
    const request = await Contact.findOne({
      _id: requestId,
      userId: userId,
      status: "pending"
    });

    if (!request) {
      return res.status(404).json({ message: "Solicitud no encontrada" });
    }

    // Eliminar ambas relaciones
    await Contact.deleteMany({
      $or: [
        { userId: userId, contactId: request.contactId, status: "pending" },
        { userId: request.contactId, contactId: userId, status: "pending" }
      ]
    });

    res.status(200).json({ 
      message: "Solicitud rechazada" 
    });
  } catch (error) {
    console.error("Error rejecting contact request:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Eliminar contacto
export const removeContact = async (req, res) => {
  try {
    const { contactId } = req.params;
    const userId = req.user._id;

    // Eliminar la relación bidireccional
    const result = await Contact.deleteMany({
      $or: [
        { userId: userId, contactId: contactId },
        { userId: contactId, contactId: userId }
      ]
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Contacto no encontrado" });
    }

    res.status(200).json({ 
      message: "Contacto eliminado exitosamente" 
    });
  } catch (error) {
    console.error("Error removing contact:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};

// Actualizar nickname de contacto
export const updateContactNickname = async (req, res) => {
  try {
    const { contactId } = req.params;
    const { nickname } = req.body;
    const userId = req.user._id;

    const contact = await Contact.findOneAndUpdate(
      { userId: userId, contactId: contactId, status: "accepted" },
      { nickname: nickname?.trim() || null },
      { new: true }
    );

    if (!contact) {
      return res.status(404).json({ message: "Contacto no encontrado" });
    }

    res.status(200).json({ 
      message: "Nickname actualizado exitosamente",
      nickname: contact.nickname
    });
  } catch (error) {
    console.error("Error updating nickname:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
};