const express = require("express");
const router = express.Router();
const { check, validationResult } = require("express-validator");
const authenticate = require("../middleware/auth");
const User = require("../models/User");
const DemoClass = require("../models/DemoClass");
const Notification = require("../models/Notification");
const logger = require("../utils/logger");
const {
  sendDemoClassScheduledEmail,
  sendDemoClassRescheduledEmail,
  sendDemoClassCancelledEmail,
} = require("../services/emailService");
const { getIO } = require("../config/socket");
const { uploadFileToDrive } = require("../services/googleDriveService");
const upload = require("../config/multer");
const fs = require("fs");

const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

// Create Demo Class
router.post(
  "/create",
  authenticate,
  upload.any(),
  [
    check("classType").notEmpty().withMessage("Class type is required"),
    check("meetingType")
      .isIn(["zoom", "external"])
      .withMessage("Meeting type must be 'zoom' or 'external'"),
    check("meetingLink")
      .if((value, { req }) => req.body.meetingType === "external")
      .notEmpty()
      .withMessage("Meeting link is required for external meeting type"),
    check("zoomLink")
      .if((value, { req }) => req.body.meetingType === "zoom")
      .notEmpty()
      .withMessage("Zoom link is required for Zoom meeting type"),
    check("timezone").notEmpty().withMessage("Timezone is required"),
    check("startTime")
      .matches(/^\d{2}:\d{2}$/)
      .withMessage("Start time must be in HH:mm format"),
    check("date").isISO8601().withMessage("Date must be a valid ISO 8601 date"),
    check("studentEmails")
      .isArray()
      .withMessage("Student emails must be an array")
      .custom((value) => value.every((email) => /^[^\s@]+@[^\s@]+.[^\s@]+$/.test(email)))
      .withMessage("All student emails must be valid"),
    check("callDuration")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Call duration must be a positive integer"),
    check("assignedTeacherId")
      .optional()
      .isMongoId()
      .withMessage("Valid assigned teacher ID is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in create demo class:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }
    const {
      classType,
      meetingType,
      meetingLink,
      zoomLink,
      timezone,
      startTime,
      date,
      studentEmails,
      callDuration = 40,
      assignedTeacherId,
    } = req.body;

    let documents = [];
    try {
      documents = JSON.parse(req.body.documents || "[]");
    } catch (e) {
      logger.warn("Invalid documents JSON format");
    }

    const scheduledById = req.user.userId;

    try {
      const user = await User.findById(scheduledById).populate("role");
      if (
        !user ||
        !["Admin", "SuperAdmin", "Teacher", "Student"].includes(user.role.roleName)
      ) {
        logger.warn(`Unauthorized demo class creation attempt by user: ${scheduledById}`);
        return res.status(403).json({ message: "Not authorized" });
      }

      let teacherId = scheduledById;
      if (assignedTeacherId && ["Admin", "SuperAdmin"].includes(user.role.roleName)) {
        const teacher = await User.findById(assignedTeacherId).populate("role");
        if (!teacher || teacher.role.roleName !== "Teacher") {
          logger.warn(`Invalid or unauthorized teacher ID: ${assignedTeacherId}`);
          return res.status(400).json({ message: "Invalid or unauthorized teacher ID" });
        }
        teacherId = assignedTeacherId;
      } else if (user.role.roleName !== "Teacher") {
        logger.warn(`Non-teacher user ${scheduledById} must provide a valid teacher ID`);
        return res.status(400).json({ message: "Teacher ID required for non-teacher users" });
      }

      const [hours, minutes] = startTime.split(":").map(Number);
      const startDateTime = new Date(date);
      startDateTime.setHours(hours, minutes, 0, 0);
      const endDateTime = new Date(startDateTime.getTime() + callDuration * 60000);
      const endTime = endDateTime.toTimeString().slice(0, 5);

      const meetingDetails = {
        zoomLink: meetingType === "zoom" ? zoomLink : meetingLink,
        meetingId: meetingType === "zoom" ? zoomLink.match(/\/j\/([0-9]+)/)?.[1] || null : null,
        passcode: null,
      };

      const uploadedDocuments = [];

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          if (file.fieldname.startsWith("documents")) {
            try {
              const { fileId, webViewLink } = await uploadFileToDrive(
                file.path,
                file.originalname,
                file.mimetype,
                file.mimetype.startsWith("video/")
              );
              uploadedDocuments.push({
                name: file.originalname,
                url: webViewLink,
                fileId,
                uploadedAt: new Date(),
              });
              if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            } catch (err) {
              logger.error(`Error uploading file ${file.originalname}: ${err.message}`);
              return res.status(500).json({ message: `Failed to upload file ${file.originalname}`, error: err.message });
            }
          }
        }
      }

      const finalDocuments = uploadedDocuments.length > 0
        ? uploadedDocuments
        : documents.map((doc) => ({
            name: doc.name,
            url: doc.url,
            fileId: doc.fileId || null,
            uploadedAt: new Date(),
          }));

      finalDocuments.forEach((doc) => {
        if (doc.name === doc.url) {
          logger.warn(`Document has identical name and URL: ${doc.name}`);
          return res.status(400).json({ message: `Invalid document: name and URL cannot be identical for ${doc.name}` });
        }
      });

      const demoClass = new DemoClass({
        assignedTeacherId: teacherId,
        classType,
        type: meetingType,
        date: startDateTime,
        startTime,
        endTime,
        timezone,
        zoomLink: meetingDetails.zoomLink,
        meetingId: meetingDetails.meetingId,
        passcode: meetingDetails.passcode,
        scheduledBy: scheduledById,
        studentEmails,
        status: "Scheduled",
        notificationSent: [],
        callDuration,
        documents: finalDocuments,
      });

      await demoClass.save();

      const notifications = [
        new Notification({
          userId: teacherId,
          message: `New demo class "${classType}" scheduled for ${startDateTime.toLocaleDateString()} at ${startTime}`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        }).save(),
      ];

      const emailPromises = [
        sendDemoClassScheduledEmail(
          user.email,
          user.name,
          {
            classType,
            date: startDateTime.toLocaleDateString(),
            startTime,
            endTime,
            zoomLink: meetingDetails.zoomLink,
            callDuration: `${callDuration} min`,
            documents: finalDocuments,
          },
          true
        ),
        ...studentEmails.map((email) =>
          sendDemoClassScheduledEmail(
            email,
            "Student",
            {
              classType,
              date: startDateTime.toLocaleDateString(),
              startTime,
              endTime,
              zoomLink: meetingDetails.zoomLink,
              callDuration: `${callDuration} min`,
              documents: finalDocuments,
            },
            false
          )
        ),
      ];

      await Promise.all([...notifications, ...emailPromises]);

      getIO()
        .to(teacherId.toString())
        .emit("notification", {
          message: `New demo class "${classType}" scheduled for ${startDateTime.toLocaleDateString()} at ${startTime}`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        });

      res.json({
        message: "Demo class scheduled successfully",
        scheduleId: demoClass._id,
        callDuration: `${callDuration} min`,
        documents: demoClass.documents,
      });
    } catch (err) {
      logger.error("Create demo class error:", err);
      res.status(500).json({ message: "Server error", error: err.message });
    }
  }
);

// Reschedule Demo Class
router.put(
  "/reschedule/:scheduleId",
  authenticate,
  [
    check("scheduleId")
      .isMongoId()
      .withMessage("Valid schedule ID is required"),
    check("meetingType")
      .optional()
      .isIn(["zoom", "external"])
      .withMessage("Meeting type must be 'zoom' or 'external'"),
    check("meetingLink")
      .if(
        (value, { req }) =>
          req.body.meetingType === "external" && !req.body.useExistingLink
      )
      .notEmpty()
      .withMessage(
        "Meeting link is required for external meeting type if not reusing existing link"
      ),
    check("zoomLink")
      .if(
        (value, { req }) =>
          req.body.meetingType === "zoom" && !req.body.useExistingLink
      )
      .notEmpty()
      .withMessage(
        "Zoom link is required for Zoom meeting type if not reusing existing link"
      ),
    check("timezone")
      .optional()
      .notEmpty()
      .withMessage("Timezone is required"),
    check("startTime")
      .optional()
      .matches(/^\d{2}:\d{2}$/)
      .withMessage("Start time must be in HH:mm format"),
    check("date")
      .optional()
      .isISO8601()
      .withMessage("Date must be a valid ISO 8601 date"),
    check("useExistingLink")
      .optional()
      .isBoolean()
      .withMessage("useExistingLink must be a boolean"),
    check("callDuration")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Call duration must be a positive integer in minutes"),
    check("studentEmails")
      .optional()
      .isArray()
      .withMessage("Student emails must be an array")
      .custom((value) => !value || value.every((email) => validateEmail(email)))
      .withMessage("All student emails must be valid"),
    check("assignedTeacherId")
      .optional()
      .isMongoId()
      .withMessage("Valid assigned teacher ID is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(
        "Validation errors in reschedule demo class:",
        errors.array()
      );
      return res.status(400).json({ errors: errors.array() });
    }

    const { scheduleId } = req.params;
    const {
      classType,
      meetingType,
      meetingLink,
      zoomLink,
      timezone,
      startTime,
      date,
      useExistingLink,
      callDuration,
      studentEmails,
      assignedTeacherId,
    } = req.body;

    const scheduledById = req.user.userId;

    try {
      // Fetch the existing demo class
      const demoClass = await DemoClass.findById(scheduleId);
      if (!demoClass) {
        logger.warn(`Demo class not found: ${scheduleId}`);
        return res.status(404).json({ message: "Demo class not found" });
      }

      // Validate user permissions
      const user = await User.findById(scheduledById).populate("role");
      if (!user || !["Admin", "SuperAdmin", "Teacher"].includes(user.role.roleName)) {
        logger.warn(`Unauthorized reschedule attempt by user: ${scheduledById}`);
        return res.status(403).json({ message: "Not authorized" });
      }

      if (
        user.role.roleName === "Teacher" &&
        demoClass.assignedTeacherId.toString() !== scheduledById &&
        demoClass.scheduledBy.toString() !== scheduledById
      ) {
        logger.warn(`Unauthorized reschedule attempt by teacher: ${scheduledById}`);
        return res.status(403).json({ message: "Not authorized to reschedule this class" });
      }

      // Validate teacher if assignedTeacherId is provided
      let teacherId = demoClass.assignedTeacherId;
      if (assignedTeacherId && ["Admin", "SuperAdmin"].includes(user.role.roleName)) {
        const teacher = await User.findById(assignedTeacherId).populate("role");
        if (!teacher || teacher.role.roleName !== "Teacher") {
          logger.warn(`Invalid or unauthorized teacher ID: ${assignedTeacherId}`);
          return res.status(400).json({ message: "Invalid or unauthorized teacher ID" });
        }
        teacherId = assignedTeacherId;
      }

      // Use existing values as fallbacks
      const effectiveCallDuration = callDuration || demoClass.callDuration;
      const effectiveMeetingType = meetingType || demoClass.type;
      const effectiveTimezone = timezone || demoClass.timezone;
      const effectiveStartTime = startTime || demoClass.startTime;
      const effectiveDate = date || demoClass.date;
      const effectiveStudentEmails = studentEmails || demoClass.studentEmails;
      const effectiveClassType = classType || demoClass.classType;

      // Validate call duration
      if (!effectiveCallDuration) {
        logger.warn(
          `No call duration provided and no existing duration found for demo class: ${scheduleId}`
        );
        return res.status(400).json({ message: "Call duration is required" });
      }

      // Calculate end time
      const [hours, minutes] = effectiveStartTime.split(":").map(Number);
      const endDateTime = new Date(effectiveDate);
      endDateTime.setHours(hours, minutes + effectiveCallDuration);
      const endTime = `${endDateTime
        .getHours()
        .toString()
        .padStart(2, "0")}:${endDateTime
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;

      // Handle meeting details
      const meetingDetails = {
        zoomLink: useExistingLink
          ? demoClass.zoomLink
          : meetingType
            ? meetingType === "zoom"
              ? zoomLink
              : meetingLink
            : demoClass.zoomLink,
        meetingId: effectiveMeetingType === "zoom"
          ? useExistingLink
            ? demoClass.meetingId
            : zoomLink?.match(/\/j\/([0-9]+)/)?.[1] || demoClass.meetingId
          : demoClass.meetingId,
        passcode: demoClass.passcode,
      };

      // Update demo class with new or existing values
      demoClass.previousDate = demoClass.date;
      demoClass.previousStartTime = demoClass.startTime;
      demoClass.previousEndTime = demoClass.endTime;
      demoClass.classType = effectiveClassType;
      demoClass.type = effectiveMeetingType;
      demoClass.date = new Date(effectiveDate);
      demoClass.startTime = effectiveStartTime;
      demoClass.endTime = endTime;
      demoClass.timezone = effectiveTimezone;
      demoClass.zoomLink = meetingDetails.zoomLink;
      demoClass.meetingId = meetingDetails.meetingId;
      demoClass.passcode = meetingDetails.passcode || "";
      demoClass.status = "Rescheduled";
      demoClass.studentEmails = effectiveStudentEmails;
      demoClass.scheduledBy = scheduledById;
      demoClass.notificationSent = [];
      demoClass.callDuration = effectiveCallDuration;
      demoClass.assignedTeacherId = teacherId;
      await demoClass.save();

      // Prepare call details for notifications
      const callDetails = {
        classType: demoClass.classType,
        type: effectiveMeetingType,
        previousDate: demoClass.previousDate,
        previousStartTime: demoClass.previousStartTime,
        previousEndTime: demoClass.previousEndTime,
        date: new Date(effectiveDate),
        startTime: effectiveStartTime,
        endTime,
        timezone: effectiveTimezone,
        zoomLink: meetingDetails.zoomLink,
        callDuration: `${effectiveCallDuration} min`,
        teacher: (await User.findById(teacherId))?.name || "Unknown",
      };

      // Create notifications
      const notifications = [
        new Notification({
          userId: teacherId,
          message: `Demo class "${demoClass.classType}" rescheduled from ${
            callDetails.previousDate
              ? new Date(callDetails.previousDate).toLocaleDateString()
              : "N/A"
          } ${callDetails.previousStartTime || "N/A"} to ${new Date(
            effectiveDate
          ).toLocaleDateString()} at ${effectiveStartTime}`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        }).save(),
      ];

      // Send email notifications
      const emailNotifications = [
        sendDemoClassRescheduledEmail(
          user.email,
          user.name,
          callDetails,
          true
        ),
        ...effectiveStudentEmails.map((email) =>
          sendDemoClassRescheduledEmail(email, "Student", callDetails, false)
        ),
      ];

      // Emit socket notifications
      getIO()
        .to(teacherId.toString())
        .emit("notification", {
          message: `Demo class "${demoClass.classType}" rescheduled from ${
            callDetails.previousDate
              ? new Date(callDetails.previousDate).toLocaleDateString()
              : "N/A"
          } ${callDetails.previousStartTime || "N/A"} to ${new Date(
            effectiveDate
          ).toLocaleDateString()} at ${effectiveStartTime}`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        });

      await Promise.all([...notifications, ...emailNotifications]);

      logger.info(
        `Demo class ${scheduleId} rescheduled by user ${scheduledById}`
      );
      res.json({
        message: "Demo class rescheduled successfully",
        scheduleId: demoClass._id,
        callDuration: `${effectiveCallDuration} min`,
      });
    } catch (error) {
      logger.error("Reschedule demo class error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Cancel Demo Class
router.post(
  "/cancel/:callId",
  authenticate,
  [check("callId").isMongoId().withMessage("Valid call ID is required")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in cancel demo class:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { callId } = req.params;
    const scheduledById = req.user.userId;

    try {
      const user = await User.findById(scheduledById).populate("role");
      if (!user || !["Admin", "SuperAdmin", "Teacher"].includes(user.role.roleName)) {
        logger.warn(
          `Unauthorized demo class cancellation attempt by user: ${scheduledById}`
        );
        return res.status(403).json({ message: "Not authorized" });
      }

      const demoClass = await DemoClass.findById(callId);
      if (!demoClass) {
        logger.warn(`Demo class not found: ${callId}`);
        return res.status(404).json({ message: "Demo class not found" });
      }

      // Verify authorization: Admins/SuperAdmins can cancel any class, Teachers can only cancel their own
      if (
        user.role.roleName === "Teacher" &&
        demoClass.assignedTeacherId.toString() !== scheduledById &&
        demoClass.scheduledBy.toString() !== scheduledById
      ) {
        logger.warn(
          `Unauthorized cancellation attempt by teacher: ${scheduledById}`
        );
        return res.status(403).json({ message: "Not authorized to cancel this class" });
      }

      demoClass.status = "Cancelled";
      demoClass.previousDate = demoClass.date;
      demoClass.previousStartTime = demoClass.startTime;
      demoClass.previousEndTime = demoClass.endTime;
      await demoClass.save();

      const callDetails = {
        classType: demoClass.classType,
        type: demoClass.type,
        date: demoClass.date,
        startTime: demoClass.startTime,
        endTime: demoClass.endTime,
        timezone: demoClass.timezone,
        zoomLink: demoClass.zoomLink,
        callDuration: `${demoClass.callDuration} min`,
      };

      const notifications = [
        new Notification({
          userId: demoClass.assignedTeacherId,
          message: `Demo class "${demoClass.classType}" on ${new Date(
            demoClass.date
          ).toLocaleDateString()} cancelled`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        }).save(),
      ];

      const emailNotifications = [
        sendDemoClassCancelledEmail(user.email, user.name, callDetails),
        ...demoClass.studentEmails.map((email) =>
          sendDemoClassCancelledEmail(email, "Student", callDetails)
        ),
      ];

      await Promise.all([...notifications, ...emailNotifications]);

      getIO()
        .to(demoClass.assignedTeacherId.toString())
        .emit("notification", {
          message: `Demo class "${demoClass.classType}" on ${new Date(
            demoClass.date
          ).toLocaleDateString()} cancelled`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        });

      logger.info(`Demo class ${callId} cancelled by user ${scheduledById}`);
      res.json({
        message: "Demo class cancelled successfully",
        scheduleId: demoClass._id,
      });
    } catch (error) {
      logger.error("Cancel demo class error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Get All Demo Classes (Admins, SuperAdmins, Teachers, and Students)
router.get("/list", authenticate, async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId).populate("role");
    if (!user || !user.role?.roleName) {
      logger.warn(`Unauthorized access attempt by user: ${userId}`);
      return res.status(403).json({ message: "Not authorized" });
    }

    const roleName = user.role.roleName;
    let demoClasses;

    if (roleName === "Admin" || roleName === "SuperAdmin") {
      demoClasses = await DemoClass.find()
        .populate({
          path: "scheduledBy",
          select: "name email role",
          populate: {
            path: "role",
            select: "roleName",
          },
        })
        .populate({
          path: "assignedTeacherId",
          select: "name email role",
          populate: {
            path: "role",
            select: "roleName",
          },
        })
        .sort({ date: -1 });
    } else if (roleName === "Teacher") {
      demoClasses = await DemoClass.find({
        $or: [{ assignedTeacherId: userId }, { scheduledBy: userId }],
      })
        .populate({
          path: "scheduledBy",
          select: "name email role",
          populate: {
            path: "role",
            select: "roleName",
          },
        })
        .populate({
          path: "assignedTeacherId",
          select: "name email role",
          populate: {
            path: "role",
            select: "roleName",
          },
        })
        .sort({ date: -1 });
    } else if (roleName === "Student") {
      demoClasses = await DemoClass.find({
        studentEmails: user.email,
      })
        .populate({
          path: "scheduledBy",
          select: "name email role",
          populate: {
            path: "role",
            select: "roleName",
          },
        })
        .populate({
          path: "assignedTeacherId",
          select: "name email role",
          populate: {
            path: "role",
            select: "roleName",
          },
        })
        .sort({ date: -1 });
    } else {
      logger.warn(`Invalid role for user: ${userId}`);
      return res.status(403).json({ message: "Invalid role" });
    }

    const transformedDemoClasses = demoClasses.map((demoClass) => {
      const { scheduledBy, assignedTeacherId, documents, ...rest } = demoClass.toObject();
      return {
        ...rest,
        scheduledBy: scheduledBy
          ? {
              _id: scheduledBy._id,
              name: scheduledBy.name,
              email: scheduledBy.email,
              role: scheduledBy.role?.roleName || "Unknown",
            }
          : null,
        assignedTeacher: assignedTeacherId
          ? {
              _id: assignedTeacherId._id,
              name: assignedTeacherId.name,
              email: assignedTeacherId.email,
              role: assignedTeacherId.role?.roleName || "Unknown",
            }
          : null,
        documents: documents || [], // Ensure documents are included
      };
    });

    res.json({
      message: "Demo classes retrieved successfully",
      demoClasses: transformedDemoClasses,
    });
  } catch (error) {
    logger.error("Get demo classes error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Get Single Demo Class by ID
router.get(
  "/:callId",
  authenticate,
  [check("callId").isMongoId().withMessage("Valid call ID is required")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in get demo class:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { callId } = req.params;
    const userId = req.user.userId;

    try {
      const user = await User.findById(userId).populate("role");
      if (!user || !user.role?.roleName) {
        logger.warn(`Unauthorized access attempt by user: ${userId}`);
        return res.status(403).json({ message: "Not authorized" });
      }

      const roleName = user.role.roleName;
      let demoClass;

      if (roleName === "Admin" || roleName === "SuperAdmin") {
        demoClass = await DemoClass.findById(callId)
          .populate({
            path: "scheduledBy",
            select: "name email role",
            populate: {
              path: "role",
              select: "roleName",
            },
          })
          .populate({
            path: "assignedTeacherId",
            select: "name email role",
            populate: {
              path: "role",
              select: "roleName",
            },
          });
      } else if (roleName === "Teacher") {
        demoClass = await DemoClass.findOne({
          _id: callId,
          $or: [{ assignedTeacherId: userId }, { scheduledBy: userId }],
        })
          .populate({
            path: "scheduledBy",
            select: "name email role",
            populate: {
              path: "role",
              select: "roleName",
            },
          })
          .populate({
            path: "assignedTeacherId",
            select: "name email role",
            populate: {
              path: "role",
              select: "roleName",
            },
          });
      } else if (roleName === "Student") {
        demoClass = await DemoClass.findOne({
          _id: callId,
          studentEmails: user.email,
        })
          .populate({
            path: "scheduledBy",
            select: "name email role",
            populate: {
              path: "role",
              select: "roleName",
            },
          })
          .populate({
            path: "assignedTeacherId",
            select: "name email role",
            populate: {
              path: "role",
              select: "roleName",
            },
          });
      } else {
        logger.warn(`Invalid role for user: ${userId}`);
        return res.status(403).json({ message: "Invalid role" });
      }

      if (!demoClass) {
        logger.warn(`Demo class not found or not authorized: ${callId} for user: ${userId}`);
        return res.status(404).json({ message: "Demo class not found or not authorized" });
      }

      const { scheduledBy, assignedTeacherId, documents, ...rest } = demoClass.toObject();
      const transformedDemoClass = {
        ...rest,
        scheduledBy: scheduledBy
          ? {
              _id: scheduledBy._id,
              name: scheduledBy.name,
              email: scheduledBy.email,
              role: scheduledBy.role?.roleName || "Unknown",
            }
          : null,
        assignedTeacher: assignedTeacherId
          ? {
              _id: assignedTeacherId._id,
              name: assignedTeacherId.name,
              email: assignedTeacherId.email,
              role: assignedTeacherId.role?.roleName || "Unknown",
            }
          : null,
        documents: documents || [], // Ensure documents are included
      };

      logger.info(`Demo class ${callId} retrieved by ${roleName}: ${userId}`);
      res.json({
        message: "Demo class retrieved successfully",
        demoClass: transformedDemoClass,
      });
    } catch (error) {
      logger.error("Get demo class error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

module.exports = router;