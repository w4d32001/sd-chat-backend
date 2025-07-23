import mongoose from "mongoose";

const contactSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  contactId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ["pending", "accepted", "blocked"],
    default: "pending"
  },
  nickname: {
    type: String,
    trim: true,
    maxlength: 50
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: {
    type: Date
  }
}, {
  timestamps: true
});

contactSchema.index({ userId: 1, contactId: 1 }, { unique: true });

contactSchema.index({ userId: 1, status: 1 });
contactSchema.index({ contactId: 1, status: 1 });

contactSchema.statics.existsRelation = async function(userId1, userId2) {
  const relation = await this.findOne({
    $or: [
      { userId: userId1, contactId: userId2 },
      { userId: userId2, contactId: userId1 }
    ]
  });
  return relation;
};

contactSchema.statics.createBidirectionalContact = async function(requesterId, targetId, status = "pending") {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      await this.create([{
        userId: requesterId,
        contactId: targetId,
        status: status,
        requestedBy: requesterId
      }], { session });

      await this.create([{
        userId: targetId,
        contactId: requesterId,
        status: status,
        requestedBy: requesterId
      }], { session });
    });
  } finally {
    await session.endSession();
  }
};

contactSchema.statics.updateBidirectionalStatus = async function(userId1, userId2, status, acceptedBy = null) {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      const updateData = { 
        status,
        ...(status === "accepted" && { acceptedAt: new Date() })
      };

      await this.updateMany({
        $or: [
          { userId: userId1, contactId: userId2 },
          { userId: userId2, contactId: userId1 }
        ]
      }, updateData, { session });
    });
  } finally {
    await session.endSession();
  }
};

const Contact = mongoose.model("Contact", contactSchema);
export default Contact;