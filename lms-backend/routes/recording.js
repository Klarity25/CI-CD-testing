const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const Recording = require("../models/Recording");
const Admin = require("../models/Admin");
const Role = require("../models/Role");
const logger = require("../utils/logger");
const { check, validationResult } = require("express-validator");
const upload = require("../config/multer");

router.use(authenticate);

// Get Recordings (Admins/SuperAdmins see all, Teachers see only their uploads)
router.get("/", async (req, res) => {
  const userId = req.user.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const admin = await Admin.findOne({ userId });
    let query = {};

    if (!admin) {
      const teacherRole = await Role.findOne({ userId, roleName: "Teacher" });
      if (teacherRole) {
        query.uploadedBy = userId;
      } else {
        logger.warn(`Unauthorized access to recordings by user: ${userId}`);
        return res
          .status(403)
          .json({ message: "Not authorized to view recordings" });
      }
    }

    const recordings = await Recording.find(query)
      .populate("uploadedBy", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Recording.countDocuments(query);

    logger.info(`Recordings fetched for user: ${userId}, page: ${page}`);
    res.json({
      recordings: recordings.map((recording) => ({
        _id: recording._id,
        title: recording.title,
        url: recording.url,
        uploadedBy: recording.uploadedBy.name,
        createdAt: recording.createdAt,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    logger.error("Get recordings error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Upload Local Recording (Teacher only)
router.post(
  "/upload-recording/:callId",
  [
    check("callId").isMongoId().withMessage("Valid call ID is required"),
    upload.single("recording"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in upload recording:", errors.array());
      if (req.file) {
        await fs
          .unlink(req.file.path)
          .catch((err) =>
            logger.error(`Failed to delete file: ${req.file.path}`, err)
          );
      }
      return res.status(400).json({ errors: errors.array() });
    }

    if (!req.file) {
      logger.warn("No file uploaded");
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { callId } = req.params;
    const teacherId = req.user.userId;

    try {
      const teacherRole = await Role.findOne({
        userId: teacherId,
        roleName: "Teacher",
      });
      if (!teacherRole) {
        logger.warn(`User ${teacherId} is not a teacher`);
        if (req.file) {
          await fs
            .unlink(req.file.path)
            .catch((err) =>
              logger.error(`Failed to delete file: ${req.file.path}`, err)
            );
        }
        return res.status(403).json({ message: "Not authorized" });
      }

      const scheduledCall = await ScheduledCall.findById(callId).populate(
        "teacherId studentIds scheduledBy"
      );
      if (!scheduledCall) {
        logger.warn(`Scheduled call not found: ${callId}`);
        if (req.file) {
          await fs
            .unlink(req.file.path)
            .catch((err) =>
              logger.error(`Failed to delete file: ${req.file.path}`, err)
            );
        }
        return res.status(404).json({ message: "Scheduled call not found" });
      }

      if (scheduledCall.teacherId._id.toString() !== teacherId) {
        logger.warn(
          `Teacher ${teacherId} not authorized to upload for call: ${callId}`
        );
        if (req.file) {
          await fs
            .unlink(req.file.path)
            .catch((err) =>
              logger.error(`Failed to delete file: ${req.file.path}`, err)
            );
        }
        return res
          .status(403)
          .json({ message: "Not authorized to upload for this call" });
      }

      const fileName = `${scheduledCall.classType}_${
        scheduledCall.type
      }_${new Date(scheduledCall.date).toISOString()}.mp4`;
      const { fileId, webViewLink } = await uploadFileToDrive(
        req.file.path,
        fileName,
        "video/mp4",
        true
      );

      scheduledCall.recordingUrl = webViewLink;
      scheduledCall.recordingFileId = fileId;
      scheduledCall.status = "Completed";
      await scheduledCall.save();

      const recording = new Recording({
        title: `${scheduledCall.classType} - ${scheduledCall.type}`,
        url: webViewLink,
        fileId,
        uploadedBy: teacherId,
        callId,
      });
      await recording.save();

      await fs.unlink(req.file.path);

      const admins = await Admin.find().populate("userId");
      const notifications = [
        new Notification({
          userId: teacherId,
          message: `Recording uploaded for ${scheduledCall.classType} (${
            scheduledCall.type
          }) on ${new Date(scheduledCall.date).toLocaleDateString()}`,
          link: `${process.env.BASE_URL}/recordings`,
        }).save(),
        new Notification({
          userId: scheduledCall.scheduledBy.userId,
          message: `Recording uploaded for ${scheduledCall.classType} (${scheduledCall.type})`,
          link: `${process.env.BASE_URL}/recordings`,
        }).save(),
        ...scheduledCall.studentIds.map((student) =>
          new Notification({
            userId: student._id,
            message: `Recording available for ${scheduledCall.classType} (${scheduledCall.type})`,
            link: `${process.env.BASE_URL}/recordings`,
          }).save()
        ),
        ...admins.map((admin) =>
          new Notification({
            userId: admin.userId._id,
            message: `Recording uploaded for ${scheduledCall.classType} (${scheduledCall.type}) by ${scheduledCall.teacherId.name}`,
            link: `${process.env.BASE_URL}/recordings`,
          }).save()
        ),
      ];
      await Promise.all(notifications);

      logger.info("Emitting Socket.io notifications for recording upload");
      getIO()
        .to(teacherId)
        .emit("notification", {
          message: `Recording uploaded for ${scheduledCall.classType} (${scheduledCall.type})`,
          link: `${process.env.BASE_URL}/recordings`,
        });
      getIO()
        .to(scheduledCall.scheduledBy.userId.toString())
        .emit("notification", {
          message: `Recording uploaded for ${scheduledCall.classType} (${scheduledCall.type})`,
          link: `${process.env.BASE_URL}/recordings`,
        });
      scheduledCall.studentIds.forEach((student) => {
        getIO()
          .to(student._id.toString())
          .emit("notification", {
            message: `Recording available for ${scheduledCall.classType} (${scheduledCall.type})`,
            link: `${process.env.BASE_URL}/recordings`,
          });
      });
      admins.forEach((admin) => {
        getIO()
          .to(admin.userId._id.toString())
          .emit("notification", {
            message: `Recording uploaded for ${scheduledCall.classType} (${scheduledCall.type}) by ${scheduledCall.teacherId.name}`,
            link: `${process.env.BASE_URL}/recordings`,
          });
      });

      logger.info("Sending recording uploaded email");
      const callDetails = {
        classType: scheduledCall.classType,
        type: scheduledCall.type,
        date: scheduledCall.date,
        recordingUrl: webViewLink,
      };
      const communications = [
        sendRecordingUploadedEmail(
          scheduledCall.teacherId.email,
          scheduledCall.teacherId.name,
          callDetails
        ).catch((error) => {
          logger.error(
            `Failed to send recording email to ${scheduledCall.teacherId.email}:`,
            error
          );
        }),
        ...scheduledCall.studentIds
          .map((student) => [
            sendRecordingUploadedEmail(
              student.email,
              student.name,
              callDetails
            ).catch((error) => {
              logger.error(
                `Failed to send recording email to ${student.email}:`,
                error
              );
            }),
          ])
          .flat(),
        ...admins
          .map((admin) => [
            sendRecordingUploadedEmail(
              admin.userId.email,
              admin.userId.name,
              callDetails
            ).catch((error) => {
              logger.error(
                `Failed to send recording email to ${admin.userId.email}:`,
                error
              );
            }),
          ])
          .flat(),
      ];
      await Promise.all(communications);

      logger.info(
        `Recording uploaded for call: ${callId} by teacher: ${teacherId}`
      );
      res.json({ message: "Recording uploaded successfully", recording });
    } catch (error) {
      if (req.file) {
        await fs
          .unlink(req.file.path)
          .catch((err) =>
            logger.error(`Failed to delete file: ${req.file.path}`, err)
          );
      }
      logger.error("Upload recording error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

module.exports = router;
