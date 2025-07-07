const mongoose = require("mongoose");

const demoClassSchema = new mongoose.Schema(
  {
    assignedTeacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    classType: { type: String, required: true },
    type: { type: String, enum: ["zoom", "external"], required: true },
    date: { type: Date, required: true },
    startTime: { type: String, required: true },
    endTime: { type: String, required: true },
    callDuration: { type: Number, default: 40 },
    timezone: { type: String, required: true },
    zoomLink: { type: String },
    meetingId: { type: String },
    passcode: { type: String },
    scheduledBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["Scheduled", "Rescheduled", "Completed", "Cancelled"],
      default: "Scheduled",
    },
    studentEmails: [{ type: String, required: true }],
    notificationSent: [
      {
        type: String,
        enum: ["1day", "1hour", "30min", "10min"],
      },
    ],
    previousDate: { type: Date, default: null },
    previousStartTime: { type: String, default: null },
    previousEndTime: { type: String, default: null },
    documents: [
      {
        name: { type: String, required: true },
        url: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

demoClassSchema.index({ status: 1, date: 1 });

module.exports = mongoose.model("DemoClass", demoClassSchema);