const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true, trim: true }, // e.g., blood, urine
    title: { type: String, trim: true },
    notes: { type: String, trim: true },
    fileUrl: { type: String },
    publicId: { type: String },
    format: { type: String },
    bytes: { type: Number },
    width: { type: Number },
    height: { type: Number },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    data: { type: mongoose.Schema.Types.Mixed }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Report', ReportSchema);
