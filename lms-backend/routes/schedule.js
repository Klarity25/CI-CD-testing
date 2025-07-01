const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const { check, validationResult } = require("express-validator");
const authenticate = require("../middleware/auth");
const upload = require("../config/multer");
const fs = require("fs").promises;
const Admin = require("../models/Admin");
const User = require("../models/User");
const Role = require("../models/Role");
const ScheduledCall = require("../models/ScheduledCall");
const Notification = require("../models/Notification");
const Course = require("../models/Course");
const Batch = require("../models/Batch");
const { createZoomMeeting } = require("../services/zoomService");
const { uploadFileToDrive } = require("../services/googleDriveService");
const {
  sendScheduledCallEmail,
  sendRescheduleCallEmail,
  sendCancelCallEmail,
  sendCourseScheduledEmail,
  sendCourseCallRescheduledEmail,
  sendCourseCallCancelledEmail
} = require("../services/emailService");
const logger = require("../utils/logger");
const { getIO } = require("../config/socket");

router.use(authenticate);

// Middleware to check if user is Admin or Teacher
const isAdminOrTeacher = async (req, res, next) => {
  try {
    const admin = await Admin.findOne({ userId: req.user.userId });
    const teacherRole = await Role.findOne({
      userId: req.user.userId,
      roleName: "Teacher",
    });
    logger.info(
      `Checking roles for user ${
        req.user.userId
      }: admin=${!!admin}, teacher=${!!teacherRole}`
    );
    if (!admin && !teacherRole) {
      logger.warn(`User ${req.user.userId} is neither an admin nor a teacher`);
      return res
        .status(403)
        .json({ message: "Only admins or teachers can access this endpoint" });
    }
    req.isAdmin = !!admin;
    req.isTeacher = !!teacherRole;
    next();
  } catch (error) {
    logger.error("Admin or Teacher role check error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Middleware to check if user is Admin
const isAdmin = async (req, res, next) => {
  try {
    const admin = await Admin.findOne({ userId: req.user.userId });
    if (!admin) {
      logger.warn(`User ${req.user.userId} is not an admin`);
      return res
        .status(403)
        .json({ message: "Only admins can access this endpoint" });
    }
    req.admin = admin;
    next();
  } catch (error) {
    logger.error("Admin role check error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const isStudent = async (req, res, next) => {
  try {
    const studentRole = await Role.findOne({
      userId: req.user.userId,
      roleName: "Student",
    });
    if (!studentRole) {
      logger.warn(`User ${req.user.userId} is not a student`);
      return res
        .status(403)
        .json({ message: "Only students can access this endpoint" });
    }
    req.isStudent = !!studentRole;
    next();
  } catch (error) {
    logger.error("Student role check error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Schedule a Call (Admin only)
router.post(
  "/schedule",
  isAdmin,
  upload.array("documents", 5),
  [
    check("teacherId").isMongoId().withMessage("Valid teacher ID is required"),
    check("studentIds").isArray().withMessage("Student IDs must be an array"),
    check("studentIds[].*")
      .isMongoId()
      .withMessage("Each student ID must be valid"),
      check("date").isISO8601().withMessage("Valid date is required"),
    check("startTime")
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage("Start time must be in HH:MM format"),
    check("endTime")
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage("End time must be in HH:MM format"),
    check("timezone").notEmpty().withMessage("Timezone is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in schedule call:", errors.array());
      if (req.files) {
        req.files.forEach((file) =>
          fs
            .unlink(file.path)
            .catch((err) =>
              logger.error(`Failed to delete file: ${file.path}`, err)
            )
        );
      }
      return res.status(400).json({ errors: errors.array() });
    }

    const { teacherId, classType, classSubType, date, startTime, endTime, timezone } =
      req.body;
    const studentIds =
      req.body.studentIds ||
      (req.body["studentIds[]"]
        ? Array.isArray(req.body["studentIds[]"])
          ? req.body["studentIds[]"]
          : [req.body["studentIds[]"]]
        : []);
    const adminId = req.user.userId;
    const files = req.files;

    logger.info("Schedule request received", {
      body: {
        teacherId,
        studentIds,
        classType,
        classSubType,
        date,
        startTime,
        endTime,
        timezone,
      },
      files: files
        ? files.map((f) => ({
            filename: f.originalname,
            mimetype: f.mimetype,
            path: f.path,
          }))
        : [],
      user: req.user,
    });

    try {
      const teacher = await User.findById(teacherId).select(
        "name email phone subjects timezone profile"
      );
      if (!teacher) {
        logger.warn(`Teacher not found: ${teacherId}`);
        if (files) {
          files.forEach((file) =>
            fs
              .unlink(file.path)
              .catch((err) =>
                logger.error(`Failed to delete file: ${file.path}`, err)
              )
          );
        }
        return res.status(404).json({ message: "Teacher not found" });
      }

      const teacherRole = await Role.findOne({
        userId: teacherId,
        roleName: "Teacher",
      });
      if (!teacherRole) {
        logger.warn(`User ${teacherId} is not a teacher`);
        if (files) {
          files.forEach((file) =>
            fs
              .unlink(file.path)
              .catch((err) =>
                logger.error(`Failed to delete file: ${file.path}`, err)
              )
          );
        }
        return res.status(400).json({ message: "User is not a teacher" });
      }

      if (!teacher.email) {
        logger.warn(`Teacher ${teacherId} has no email`);
        if (files) {
          files.forEach((file) =>
            fs
              .unlink(file.path)
              .catch((err) =>
                logger.error(`Failed to delete file: ${file.path}`, err)
              )
          );
        }
        return res.status(400).json({ message: "Teacher email is required" });
      }

      if (!teacher.subjects.includes(classType)) {
        logger.warn(`Teacher ${teacherId} is not assigned to ${classType}`);
        if (files) {
          files.forEach((file) =>
            fs
              .unlink(file.path)
              .catch((err) =>
                logger.error(`Failed to delete file: ${file.path}`, err)
              )
          );
        }
        return res
          .status(400)
          .json({ message: `Teacher is not assigned to ${classType}` });
      }

      const students = await User.find({ _id: { $in: studentIds } }).select(
        "name email phone subjects profile"
      );
      if (students.length !== studentIds.length) {
        logger.warn(`Some students not found: ${studentIds}`);
        if (files) {
          files.forEach((file) =>
            fs
              .unlink(file.path)
              .catch((err) =>
                logger.error(`Failed to delete file: ${file.path}`, err)
              )
          );
        }
        return res
          .status(404)
          .json({ message: "One or more students not found" });
      }

      for (const student of students) {
        const studentRole = await Role.findOne({
          userId: student._id,
          roleName: "Student",
        });
        if (!studentRole) {
          logger.warn(`User ${student._id} is not a student`);
          if (files) {
            files.forEach((file) =>
              fs
                .unlink(file.path)
                .catch((err) =>
                  logger.error(`Failed to delete file: ${file.path}`, err)
                )
            );
          }
          return res
            .status(400)
            .json({ message: `User ${student.name} is not a student` });
        }
        if (!student.subjects.includes(classType)) {
          logger.warn(`Student ${student._id} is not assigned to ${classType}`);
          if (files) {
            files.forEach((file) =>
              fs
                .unlink(file.path)
                .catch((err) =>
                  logger.error(`Failed to delete file: ${file.path}`, err)
                )
            );
          }
          return res
            .status(400)
            .json({
              message: `Student ${student.name} is not assigned to ${classType}`,
            });
        }
      }

      const start = new Date(`${date} ${startTime}`);
      const end = new Date(`${date} ${endTime}`);
      const duration = (end - start) / 1000 / 60;

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        logger.warn(
          `Invalid date or time format: date=${date}, startTime=${startTime}, endTime=${endTime}`
        );
        if (files) {
          files.forEach((file) =>
            fs
              .unlink(file.path)
              .catch((err) =>
                logger.error(`Failed to delete file: ${file.path}`, err)
              )
          );
        }
        return res.status(400).json({ message: "Invalid date or time format" });
      }

      if (duration <= 0) {
        logger.warn(
          `Invalid time range: startTime ${startTime} is not before endTime ${endTime}`
        );
        if (files) {
          files.forEach((file) =>
            fs
              .unlink(file.path)
              .catch((err) =>
                logger.error(`Failed to delete file: ${file.path}`, err)
              )
          );
        }
        return res
          .status(400)
          .json({ message: "End time must be after start time" });
      }

      logger.info(`Creating Zoom meeting for ${classType} - ${classSubType}`);
      const zoomMeeting = await createZoomMeeting(
        `${classType} - ${classSubType}`,
        start.toISOString(),
        duration,
        teacher.email,
        timezone
      );
      logger.info(`Zoom meeting created: ${zoomMeeting.meetingId}`);

      logger.info(`Uploading ${files?.length || 0} documents to Google Drive`);
      const documents = [];
      if (files && files.length > 0) {
        for (const file of files) {
          const mimeType = file.mimetype;
          const fileName = `${classType}_${classSubType}_${new Date(
            date
          ).toISOString()}_${file.originalname}`;
          logger.info(`Uploading file: ${file.originalname}`);
          const { fileId, webViewLink } = await uploadFileToDrive(
            file.path,
            fileName,
            mimeType,
            false
          );
          documents.push({ name: file.originalname, url: webViewLink, fileId });
          logger.info(`Uploaded file: ${file.originalname}, fileId: ${fileId}`);
          await fs.unlink(file.path);
        }
      }

      logger.info("Saving scheduled call");
      const scheduledCall = new ScheduledCall({
        teacherId,
        studentIds,
        classType,
        classSubType,
        date,
        startTime,
        endTime,
        timezone,
        zoomLink: zoomMeeting.zoomLink,
        meetingId: zoomMeeting.meetingId,
        passcode: zoomMeeting.passcode,
        scheduledBy: adminId,
        documents,
      });
      await scheduledCall.save();
      logger.info(`Scheduled call saved: ${scheduledCall._id}`);

      logger.info("Sending notifications");
      const notifications = [
        new Notification({
          userId: teacherId,
          message: `New ${classType} call scheduled on ${new Date(
            date
          ).toLocaleDateString()} from ${startTime} to ${endTime} (${timezone})${
            documents.length ? ` with ${documents.length} document(s)` : ""
          }`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        }).save(),
        new Notification({
          userId: adminId,
          message: `Call scheduled for ${teacher.name}: ${classType} (${classSubType})${
            documents.length ? ` with ${documents.length} document(s)` : ""
          }`,
          link: `${process.env.BASE_URL}/admin/schedule`,
        }).save(),
        ...studentIds.map((studentId) =>
          new Notification({
            userId: studentId,
            message: `New ${classType} call scheduled with ${
              teacher.name
            } on ${new Date(
              date
            ).toLocaleDateString()} from ${startTime} to ${endTime} (${timezone})`,
            link: `${process.env.BASE_URL}/student/schedule`,
          }).save()
        ),
      ];
      await Promise.all(notifications);
      logger.info("Notifications saved");

      logger.info("Emitting Socket.io notifications");
      getIO()
        .to(teacherId)
        .emit("notification", {
          message: `New ${classType} call scheduled on ${new Date(
            date
          ).toLocaleDateString()} from ${startTime} to ${endTime} (${timezone})`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        });
      getIO()
        .to(adminId)
        .emit("notification", {
          message: `Call scheduled for ${teacher.name}: ${classType} (${classSubType})`,
          link: `${process.env.BASE_URL}/admin/schedule`,
        });
      studentIds.forEach((studentId) => {
        getIO()
          .to(studentId.toString())
          .emit("notification", {
            message: `New ${classType} call scheduled with ${
              teacher.name
            } on ${new Date(
              date
            ).toLocaleDateString()} from ${startTime} to ${endTime} (${timezone})`,
            link: `${process.env.BASE_URL}/student/schedule`,
          });
      });

      logger.info("Sending email");
      const callDetails = {
        classType,
        classSubType,
        date,
        startTime,
        endTime,
        timezone,
      };
      const communications = [
        sendScheduledCallEmail(teacher.email, teacher.name, callDetails).catch(
          (error) => {
            logger.error(
              `Failed to send scheduled call email to ${teacher.email}:`,
              error
            );
          }
        ),
        ...students
          .map((student) => [
            sendScheduledCallEmail(
              student.email,
              student.name,
              callDetails
            ).catch((error) => {
              logger.error(
                `Failed to send scheduled call email to ${student.email}:`,
                error
              );
            }),
          ])
          .flat(),
      ];
      await Promise.all(communications);
      logger.info("Email sent");

      logger.info(
        `Call scheduled for teacher: ${teacherId} by admin: ${adminId}`
      );
      res.json({ message: "Call scheduled successfully", call: scheduledCall });
    } catch (error) {
      if (files) {
        files.forEach((file) =>
          fs
            .unlink(file.path)
            .catch((err) =>
              logger.error(`Failed to delete file: ${file.path}`, err)
            )
        );
      }
      logger.error("Schedule call error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Teacher Schedule a Call (Teacher only, for themselves)
router.post(
  "/teacher/schedule",
  isAdminOrTeacher,
  upload.array("documents", 5),
  [
    check("studentIds").isArray().withMessage("Student IDs must be an array"),
    check("studentIds[].*")
      .isMongoId()
      .withMessage("Each student ID must be valid"),
    check("date").isISO8601().withMessage("Valid date is required"),
    check("startTime")
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage("Start time must be in HH:MM format"),
    check("endTime")
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage("End time must be in HH:MM format"),
    check("timezone").notEmpty().withMessage("Timezone is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(
        "Validation errors in teacher schedule call:",
        errors.array()
      );
      if (req.files) {
        req.files.forEach((file) =>
          fs
            .unlink(file.path)
            .catch((err) =>
              logger.error(`Failed to delete file: ${file.path}`, err)
            )
        );
      }
      return res.status(400).json({ errors: errors.array() });
    }

    const { classType, classSubType, date, startTime, endTime, timezone } = req.body;
    const studentIds =
      req.body.studentIds ||
      (req.body["studentIds[]"]
        ? Array.isArray(req.body["studentIds[]"])
          ? req.body["studentIds[]"]
          : [req.body["studentIds[]"]]
        : []);
    const teacherId = req.user.userId;
    const files = req.files;

    logger.info("Teacher schedule request received", {
      body: {
        teacherId,
        studentIds,
        classType,
        classSubType,
        date,
        startTime,
        endTime,
        timezone,
      },
      files: files
        ? files.map((f) => ({
            filename: f.originalname,
            mimetype: f.mimetype,
            path: f.path,
          }))
        : [],
      user: req.user,
    });

    try {
      if (!req.isTeacher) {
        logger.warn(`User ${teacherId} is not a teacher`);
        if (files) {
          files.forEach((file) =>
            fs
              .unlink(file.path)
              .catch((err) =>
                logger.error(`Failed to delete file: ${file.path}`, err)
              )
          );
        }
        return res
          .status(403)
          .json({ message: "Only teachers can use this endpoint" });
      }

      const teacher = await User.findById(teacherId).select(
        "name email phone subjects timezone profile"
      );
      if (!teacher) {
        logger.warn(`Teacher not found: ${teacherId}`);
        if (files) {
          files.forEach((file) =>
            fs
              .unlink(file.path)
              .catch((err) =>
                logger.error(`Failed to delete file: ${file.path}`, err)
              )
          );
        }
        return res.status(404).json({ message: "Teacher not found" });
      }

      if (!teacher.email) {
        logger.warn(`Teacher ${teacherId} has no email`);
        if (files) {
          files.forEach((file) =>
            fs
              .unlink(file.path)
              .catch((err) =>
                logger.error(`Failed to delete file: ${file.path}`, err)
              )
          );
        }
        return res.status(400).json({ message: "Teacher email is required" });
      }

      if (!teacher.subjects.includes(classType)) {
        logger.warn(`Teacher ${teacherId} is not assigned to ${classType}`);
        if (files) {
          files.forEach((file) =>
            fs
              .unlink(file.path)
              .catch((err) =>
                logger.error(`Failed to delete file: ${file.path}`, err)
              )
          );
        }
        return res
          .status(400)
          .json({ message: `Teacher is not assigned to ${classType}` });
      }

      const students = await User.find({ _id: { $in: studentIds } }).select(
        "name email phone subjects profile"
      );
      if (students.length !== studentIds.length) {
        logger.warn(`Some students not found: ${studentIds}`);
        if (files) {
          files.forEach((file) =>
            fs
              .unlink(file.path)
              .catch((err) =>
                logger.error(`Failed to delete file: ${file.path}`, err)
              )
          );
        }
        return res
          .status(404)
          .json({ message: "One or more students not found" });
      }

      for (const student of students) {
        const studentRole = await Role.findOne({
          userId: student._id,
          roleName: "Student",
        });
        if (!studentRole) {
          logger.warn(`User ${student._id} is not a student`);
          if (files) {
            files.forEach((file) =>
              fs
                .unlink(file.path)
                .catch((err) =>
                  logger.error(`Failed to delete file: ${file.path}`, err)
                )
            );
          }
          return res
            .status(400)
            .json({ message: `User ${student.name} is not a student` });
        }
        if (!student.subjects.includes(classType)) {
          logger.warn(`Student ${student._id} is not assigned to ${classType}`);
          if (files) {
            files.forEach((file) =>
              fs
                .unlink(file.path)
                .catch((err) =>
                  logger.error(`Failed to delete file: ${file.path}`, err)
                )
            );
          }
          return res
            .status(400)
            .json({
              message: `Student ${student.name} is not assigned to ${classType}`,
            });
        }
      }

      const start = new Date(`${date} ${startTime}`);
      const end = new Date(`${date} ${endTime}`);
      const duration = (end - start) / 1000 / 60;

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        logger.warn(
          `Invalid date or time format: date=${date}, startTime=${startTime}, endTime=${endTime}`
        );
        if (files) {
          files.forEach((file) =>
            fs
              .unlink(file.path)
              .catch((err) =>
                logger.error(`Failed to delete file: ${file.path}`, err)
              )
          );
        }
        return res.status(400).json({ message: "Invalid date or time format" });
      }

      if (duration <= 0) {
        logger.warn(
          `Invalid time range: startTime ${startTime} is not before endTime ${endTime}`
        );
        if (files) {
          files.forEach((file) =>
            fs
              .unlink(file.path)
              .catch((err) =>
                logger.error(`Failed to delete file: ${file.path}`, err)
              )
          );
        }
        return res
          .status(400)
          .json({ message: "End time must be after start time" });
      }

      logger.info(`Creating Zoom meeting for ${classType} - ${classSubType}`);
      const zoomMeeting = await createZoomMeeting(
        `${classType} - ${classSubType}`,
        start.toISOString(),
        duration,
        teacher.email,
        timezone
      );
      logger.info(`Zoom meeting created: ${zoomMeeting.meetingId}`);

      logger.info(`Uploading ${files?.length || 0} documents to Google Drive`);
      const documents = [];
      if (files && files.length > 0) {
        for (const file of files) {
          const mimeType = file.mimetype;
          const fileName = `${classType}_${classSubType}_${new Date(
            date
          ).toISOString()}_${file.originalname}`;
          logger.info(`Uploading file: ${file.originalname}`);
          const { fileId, webViewLink } = await uploadFileToDrive(
            file.path,
            fileName,
            mimeType,
            false
          );
          documents.push({ name: file.originalname, url: webViewLink, fileId });
          logger.info(`Uploaded file: ${file.originalname}, fileId: ${fileId}`);
          await fs.unlink(file.path);
        }
      }

      logger.info("Saving scheduled call");
      const scheduledCall = new ScheduledCall({
        teacherId,
        studentIds,
        classType,
        classSubType,
        date,
        startTime,
        endTime,
        timezone,
        zoomLink: zoomMeeting.zoomLink,
        meetingId: zoomMeeting.meetingId,
        passcode: zoomMeeting.passcode,
        scheduledBy: teacherId,
        documents,
      });
      await scheduledCall.save();
      logger.info(`Scheduled call saved: ${scheduledCall._id}`);

      logger.info("Sending notifications");
      const notifications = [
        new Notification({
          userId: teacherId,
          message: `New ${classType} call scheduled on ${new Date(
            date
          ).toLocaleDateString()} from ${startTime} to ${endTime} (${timezone})${
            documents.length ? ` with ${documents.length} document(s)` : ""
          }`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        }).save(),
        ...studentIds.map((studentId) =>
          new Notification({
            userId: studentId,
            message: `New ${classType} call scheduled with ${
              teacher.name
            } on ${new Date(
              date
            ).toLocaleDateString()} from ${startTime} to ${endTime} (${timezone})`,
            link: `${process.env.BASE_URL}/student/schedule`,
          }).save()
        ),
      ];
      await Promise.all(notifications);
      logger.info("Notifications saved");

      logger.info("Emitting Socket.io notifications");
      getIO()
        .to(teacherId)
        .emit("notification", {
          message: `New ${classType} call scheduled on ${new Date(
            date
          ).toLocaleDateString()} from ${startTime} to ${endTime} (${timezone})`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        });
      studentIds.forEach((studentId) => {
        getIO()
          .to(studentId.toString())
          .emit("notification", {
            message: `New ${classType} call scheduled with ${
              teacher.name
            } on ${new Date(
              date
            ).toLocaleDateString()} from ${startTime} to ${endTime} (${timezone})`,
            link: `${process.env.BASE_URL}/student/schedule`,
          });
      });

      logger.info("Sending email");
      const callDetails = {
        classType,
        classSubType,
        date,
        startTime,
        endTime,
        timezone,
      };
      const communications = [
        sendScheduledCallEmail(teacher.email, teacher.name, callDetails).catch(
          (error) => {
            logger.error(
              `Failed to send scheduled call email to ${teacher.email}:`,
              error
            );
          }
        ),
        ...students
          .map((student) => [
            sendScheduledCallEmail(
              student.email,
              student.name,
              callDetails
            ).catch((error) => {
              logger.error(
                `Failed to send scheduled call email to ${student.email}:`,
                error
              );
            }),
          ])
          .flat(),
      ];
      await Promise.all(communications);
      logger.info("Email sent");

      logger.info(`Call scheduled by teacher: ${teacherId}`);
      res.json({ message: "Call scheduled successfully", call: scheduledCall });
    } catch (error) {
      if (files) {
        files.forEach((file) =>
          fs
            .unlink(file.path)
            .catch((err) =>
              logger.error(`Failed to delete file: ${file.path}`, err)
            )
        );
      }
      logger.error("Teacher schedule call error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Get Scheduled Calls (Admin, Teacher, Student views)
router.get("/calls", async (req, res) => {
  const userId = req.user.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const admin = await Admin.findOne({ userId });
    const role = await Role.findOne({ userId });
    let calls;

    if (admin) {
      calls = await ScheduledCall.find()
        .populate("teacherId", "name email phone profile")
        .populate("studentIds", "name email phone profile")
        .populate({
          path: "scheduledBy",
          select: "name email",
          populate: { path: "role", select: "roleName" },
        })
        .sort({ date: 1 })
        .skip((page - 1) * limit)
        .limit(limit);
    } else if (role && role.roleName === "Teacher") {
      calls = await ScheduledCall.find({ teacherId: userId })
        .populate("studentIds", "name email phone profile")
        .populate({
          path: "scheduledBy",
          select: "name email",
          populate: { path: "role", select: "roleName" },
        })
        .sort({ date: 1 })
        .skip((page - 1) * limit)
        .limit(limit);
    } else if (role && role.roleName === "Student") {
      calls = await ScheduledCall.find({ studentIds: userId })
        .populate("teacherId", "name email phone profile")
        .populate({
          path: "scheduledBy",
          select: "name email",
          populate: { path: "role", select: "roleName" },
        })
        .sort({ date: 1 })
        .skip((page - 1) * limit)
        .limit(limit);
    } else {
      logger.warn(`User ${userId} is not authorized to view schedules`);
      return res.status(403).json({ message: "Not authorized" });
    }

    const transformedCalls = calls.map((call) => {
      const callObj = call.toObject();
      if (callObj.scheduledBy && callObj.scheduledBy.role) {
        callObj.scheduledBy.roleName =
          callObj.scheduledBy.role.roleName || "Unknown";
        delete callObj.scheduledBy.role;
        logger.info(
          `ScheduledBy ID: ${callObj.scheduledBy._id}, roleName: ${callObj.scheduledBy.roleName}`
        );
      } else if (callObj.scheduledBy) {
        callObj.scheduledBy.roleName = "Unknown";
        logger.warn(
          `No role found for scheduledBy ID: ${callObj.scheduledBy._id}`
        );
      }
      return callObj;
    });

    const total = await ScheduledCall.countDocuments(
      admin
        ? {}
        : role.roleName === "Teacher"
        ? { teacherId: userId }
        : { studentIds: userId }
    );

    logger.info(`Scheduled calls fetched for user: ${userId}, page: ${page}`);
    res.json({
      calls: transformedCalls,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    logger.error("Get scheduled calls error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get Student Scheduled Calls (Student only)
router.get("/student/calls", isStudent, async (req, res) => {
  const userId = req.user.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const calls = await ScheduledCall.find({ studentIds: userId })
      .populate("teacherId", "name email phone profile")
      .populate({
        path: "scheduledBy",
        select: "name email",
        populate: { path: "role", select: "roleName" },
      })
      .sort({ date: 1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const transformedCalls = calls.map((call) => {
      const callObj = call.toObject();
      if (callObj.scheduledBy && callObj.scheduledBy.role) {
        callObj.scheduledBy.roleName =
          callObj.scheduledBy.role.roleName || "Unknown";
        delete callObj.scheduledBy.role;
        logger.info(
          `ScheduledBy ID: ${callObj.scheduledBy._id}, roleName: ${callObj.scheduledBy.roleName}`
        );
      } else if (callObj.scheduledBy) {
        callObj.scheduledBy.roleName = "Unknown";
        logger.warn(
          `No role found for scheduledBy ID: ${callObj.scheduledBy._id}`
        );
      }
      return callObj;
    });

    const total = await ScheduledCall.countDocuments({ studentIds: userId });

    logger.info(
      `Student scheduled calls fetched for user: ${userId}, page: ${page}`
    );
    res.json({
      calls: transformedCalls,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    logger.error("Get student scheduled calls error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get Specific Scheduled Call (Admin, Teacher, Student)
router.get("/calls/:callId", async (req, res) => {
  const { callId } = req.params;
  const userId = req.user.userId;

  try {
    const admin = await Admin.findOne({ userId });
    const role = await Role.findOne({ userId });

    const scheduledCall = await ScheduledCall.findById(callId)
      .populate("teacherId", "name email phone profile")
      .populate("studentIds", "name email phone profile")
      .populate({
        path: "scheduledBy",
        select: "name email",
        populate: { path: "role", select: "roleName" },
      });

    if (!scheduledCall) {
      logger.warn(`Scheduled call not found: ${callId}`);
      return res.status(404).json({ message: "Scheduled call not found" });
    }

    if (role && role.roleName === "Teacher") {
      if (scheduledCall.teacherId._id.toString() !== userId) {
        logger.warn(`Teacher ${userId} not authorized to view call: ${callId}`);
        return res
          .status(403)
          .json({ message: "Not authorized to view this call" });
      }
    } else if (role && role.roleName === "Student") {
      if (!scheduledCall.studentIds.some((s) => s._id.toString() === userId)) {
        logger.warn(`Student ${userId} not authorized to view call: ${callId}`);
        return res
          .status(403)
          .json({ message: "Not authorized to view this call" });
      }
    } else {
      logger.warn(`User ${userId} is not authorized to view schedules`);
      return res.status(403).json({ message: "Not authorized" });
    }

    const callObj = scheduledCall.toObject();
    if (callObj.scheduledBy && callObj.scheduledBy.role) {
      callObj.scheduledBy.roleName =
        callObj.scheduledBy.role.roleName || "Unknown";
      delete callObj.scheduledBy.role;
    } else if (callObj.scheduledBy) {
      callObj.scheduledBy.roleName = "Unknown";
      logger.warn(
        `No role found for scheduledBy ID: ${callObj.scheduledBy._id}`
      );
    }

    logger.info(`Scheduled call ${callId} fetched for user: ${userId}`);
    res.json({ call: callObj });
  } catch (error) {
    logger.error("Get scheduled call error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get Zoom and Document Links (Teacher or Student, 10 min before call)
router.get("/call-links/:callId", async (req, res) => {
  const { callId } = req.params;
  const userId = req.user.userId;

  try {
    const admin = await Admin.findOne({ userId });
    const role = await Role.findOne({ userId });
    if (!admin && (!role || !["Teacher", "Student"].includes(role.roleName))) {
      logger.warn(`User ${userId} is not a teacher or student`);
      return res.status(403).json({ message: "Not authorized" });
    }

    const scheduledCall = await ScheduledCall.findById(callId)
      .populate("teacherId", "name email")
      .populate("studentIds", "name email");
    if (!scheduledCall) {
      logger.warn(`Scheduled call not found: ${callId}`);
      return res.status(404).json({ message: "Scheduled call not found" });
    }

    const isTeacher =
      role.roleName === "Teacher" &&
      scheduledCall.teacherId._id.toString() === userId;
    const isStudent =
      role.roleName === "Student" &&
      scheduledCall.studentIds.some((s) => s._id.toString() === userId);
    const isAdmin = !!admin;
    if (!isAdmin) {
      const now = new Date();
      const callStart = new Date(
        `${scheduledCall.date.toISOString().split("T")[0]} ${
          scheduledCall.startTime
        }`
      );
      const timeDiff = (callStart - now) / 1000 / 60;

      if (timeDiff > 10 || timeDiff < -60) {
        logger.warn(
          `Access to call links denied for call: ${callId}, time difference: ${timeDiff} min`
        );
        return res
          .status(403)
          .json({
            message:
              "Call links are only accessible 10 minutes before the call",
          });
      }
    }

    logger.info(`Call links accessed for call: ${callId} by user: ${userId}`);
    res.json({
      zoomLink: scheduledCall.zoomLink,
      passcode: scheduledCall.passcode,
      documents: scheduledCall.documents,
      classType: scheduledCall.classType,
      classSubType: scheduledCall.classSubType,
      timezone: scheduledCall.timezone,
    });
  } catch (error) {
    logger.error("Get call links error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Reschedule a Call (Admin or Teacher)
router.post(
  "/reschedule/:callId",
  isAdminOrTeacher,
  [
    check("callId").isMongoId().withMessage("Valid call ID is required"),
    check("date").optional().isISO8601().withMessage("Valid date is required"),
    check("startTime")
      .optional()
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage("Start time must be in HH:MM format"),
    check("endTime")
      .optional()
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage("End time must be in HH:MM format"),
    check("timezone").optional().notEmpty().withMessage("Timezone is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in reschedule call:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { callId } = req.params;
    const { date, startTime, endTime, timezone } = req.body;
    const userId = req.user.userId;

    try {
      const scheduledCall = await ScheduledCall.findById(callId)
        .populate("teacherId", "name email phone")
        .populate("studentIds", "name email phone");
      if (!scheduledCall) {
        logger.warn(`Scheduled call not found: ${callId}`);
        return res.status(404).json({ message: "Scheduled call not found" });
      }

      if (req.isTeacher && scheduledCall.teacherId._id.toString() !== userId) {
        logger.warn(
          `Teacher ${userId} attempted to reschedule call ${callId} not assigned to them`
        );
        return res
          .status(403)
          .json({ message: "Teachers can only reschedule their own calls" });
      }

      if (!["Scheduled", "Rescheduled"].includes(scheduledCall.status)) {
        logger.warn(
          `Call ${callId} cannot be rescheduled, status: ${scheduledCall.status}`
        );
        return res
          .status(400)
          .json({
            message: `Call cannot be rescheduled, current status: ${scheduledCall.status}`,
          });
      }

      let newStart, newEnd, duration;
      if (date || startTime || endTime) {
        const updatedDate = date || scheduledCall.date;
        const updatedStartTime = startTime || scheduledCall.startTime;
        const updatedEndTime = endTime || scheduledCall.endTime;
        newStart = new Date(`${updatedDate} ${updatedStartTime}`);
        newEnd = new Date(`${updatedDate} ${updatedEndTime}`);
        duration = (newEnd - newStart) / 1000 / 60;

        if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime())) {
          logger.warn(
            `Invalid date or time format: date=${updatedDate}, startTime=${updatedStartTime}, endTime=${updatedEndTime}`
          );
          return res
            .status(400)
            .json({ message: "Invalid date or time format" });
        }

        if (duration <= 0) {
          logger.warn(
            `Invalid time range: startTime ${updatedStartTime} is not before endTime ${updatedEndTime}`
          );
          return res
            .status(400)
            .json({ message: "End time must be after start time" });
        }
      }

      if (date) scheduledCall.date = date;
      if (startTime) scheduledCall.startTime = startTime;
      if (endTime) scheduledCall.endTime = endTime;
      if (timezone) scheduledCall.timezone = timezone;
      scheduledCall.status = "Rescheduled";

      let zoomMeeting;
      if (date || startTime || endTime || timezone) {
        const updatedTimezone = timezone || scheduledCall.timezone;
        logger.info(`Updating Zoom meeting for call: ${callId}`);
        zoomMeeting = await createZoomMeeting(
          `${scheduledCall.classType} - ${scheduledCall.classSubType}`,
          newStart.toISOString(),
          duration,
          scheduledCall.teacherId.email,
          updatedTimezone
        );
        scheduledCall.zoomLink = zoomMeeting.zoomLink;
        scheduledCall.meetingId = zoomMeeting.meetingId;
        scheduledCall.passcode = zoomMeeting.passcode;
      }

      await scheduledCall.save();

      logger.info("Sending reschedule notifications");
      const notifications = [
        new Notification({
          userId: scheduledCall.teacherId._id,
          message: `Call rescheduled: ${scheduledCall.classType} (${
            scheduledCall.classSubType
          }) to ${new Date(scheduledCall.date).toLocaleDateString()} from ${
            scheduledCall.startTime
          } to ${scheduledCall.endTime} (${scheduledCall.timezone})`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        }).save(),
        new Notification({
          userId: userId,
          message: `Call rescheduled for ${scheduledCall.teacherId.name}: ${scheduledCall.classType} (${scheduledCall.classSubType})`,
          link: `${process.env.BASE_URL}/${
            req.isAdmin ? "admin" : "teacher"
          }/schedule`,
        }).save(),
        ...scheduledCall.studentIds.map((student) =>
          new Notification({
            userId: student._id,
            message: `Call rescheduled with ${scheduledCall.teacherId.name}: ${
              scheduledCall.classType
            } (${scheduledCall.classSubType}) to ${new Date(
              scheduledCall.date
            ).toLocaleDateString()} from ${scheduledCall.startTime} to ${
              scheduledCall.endTime
            } (${scheduledCall.timezone})`,
            link: `${process.env.BASE_URL}/student/schedule`,
          }).save()
        ),
      ];
      await Promise.all(notifications);

      logger.info("Emitting Socket.io notifications for reschedule");
      getIO()
        .to(scheduledCall.teacherId._id.toString())
        .emit("notification", {
          message: `Call rescheduled: ${scheduledCall.classType} (${
            scheduledCall.classSubType
          }) to ${new Date(scheduledCall.date).toLocaleDateString()} from ${
            scheduledCall.startTime
          } to ${scheduledCall.endTime} (${scheduledCall.timezone})`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        });
      getIO()
        .to(userId)
        .emit("notification", {
          message: `Call rescheduled for ${scheduledCall.teacherId.name}: ${scheduledCall.classType} (${scheduledCall.classSubType})`,
          link: `${process.env.BASE_URL}/${
            req.isAdmin ? "admin" : "teacher"
          }/schedule`,
        });
      scheduledCall.studentIds.forEach((student) => {
        getIO()
          .to(student._id.toString())
          .emit("notification", {
            message: `Call rescheduled with ${scheduledCall.teacherId.name}: ${
              scheduledCall.classType
            } (${scheduledCall.classSubType}) to ${new Date(
              scheduledCall.date
            ).toLocaleDateString()} from ${scheduledCall.startTime} to ${
              scheduledCall.endTime
            } (${scheduledCall.timezone})`,
            link: `${process.env.BASE_URL}/student/schedule`,
          });
      });

      logger.info("Sending reschedule email");
      const callDetails = {
        classType: scheduledCall.classType,
        classSubType: scheduledCall.classSubType,
        date: scheduledCall.date,
        startTime: scheduledCall.startTime,
        endTime: scheduledCall.endTime,
        timezone: scheduledCall.timezone,
        rescheduled: true,
      };
      const communications = [
        sendRescheduleCallEmail(
          scheduledCall.teacherId.email,
          scheduledCall.teacherId.name,
          callDetails
        ).catch((error) => {
          logger.error(
            `Failed to send reschedule email to ${scheduledCall.teacherId.email}:`,
            error
          );
        }),
        ...scheduledCall.studentIds
          .map((student) => [
            sendRescheduleCallEmail(
              student.email,
              student.name,
              callDetails
            ).catch((error) => {
              logger.error(
                `Failed to send reschedule email to ${student.email}:`,
                error
              );
            }),
          ])
          .flat(),
      ];
      await Promise.all(communications);

      logger.info(`Call rescheduled: ${callId} by user: ${userId}`);
      res.json({
        message: "Call rescheduled successfully",
        call: scheduledCall,
      });
    } catch (error) {
      logger.error("Reschedule call error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Cancel a Call (Admin or Teacher)
router.post(
  "/cancel/:callId",
  isAdminOrTeacher,
  [check("callId").isMongoId().withMessage("Valid call ID is required")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in cancel call:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { callId } = req.params;
    const userId = req.user.userId;

    try {
      const scheduledCall = await ScheduledCall.findById(callId)
        .populate("teacherId", "name email phone")
        .populate("studentIds", "name email phone");
      if (!scheduledCall) {
        logger.warn(`Scheduled call not found: ${callId}`);
        return res.status(404).json({ message: "Scheduled call not found" });
      }

      if (req.isTeacher && scheduledCall.teacherId._id.toString() !== userId) {
        logger.warn(
          `Teacher ${userId} attempted to cancel call ${callId} not assigned to them`
        );
        return res
          .status(403)
          .json({ message: "Teachers can only cancel their own calls" });
      }

      if (!["Scheduled", "Rescheduled"].includes(scheduledCall.status)) {
        logger.warn(
          `Call ${callId} cannot be cancelled, status: ${scheduledCall.status}`
        );
        return res
          .status(400)
          .json({
            message: `Call cannot be cancelled, current status: ${scheduledCall.status}`,
          });
      }

      scheduledCall.status = "Cancelled";
      await scheduledCall.save();

      logger.info("Sending cancel notifications");
      const notifications = [
        new Notification({
          userId: scheduledCall.teacherId._id,
          message: `Call cancelled: ${scheduledCall.classType} (${
            scheduledCall.classSubType
          }) on ${new Date(scheduledCall.date).toLocaleDateString()}`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        }).save(),
        new Notification({
          userId: userId,
          message: `Call cancelled for ${scheduledCall.teacherId.name}: ${scheduledCall.classType} (${scheduledCall.classSubType})`,
          link: `${process.env.BASE_URL}/${
            req.isAdmin ? "admin" : "teacher"
          }/schedule`,
        }).save(),
        ...scheduledCall.studentIds.map((student) =>
          new Notification({
            userId: student._id,
            message: `Call cancelled with ${scheduledCall.teacherId.name}: ${scheduledCall.classType} (${scheduledCall.classSubType})`,
            link: `${process.env.BASE_URL}/student/schedule`,
          }).save()
        ),
      ];
      await Promise.all(notifications);

      logger.info("Emitting Socket.io notifications for cancel");
      getIO()
        .to(scheduledCall.teacherId._id.toString())
        .emit("notification", {
          message: `Call cancelled: ${scheduledCall.classType} (${
            scheduledCall.classSubType
          }) on ${new Date(scheduledCall.date).toLocaleDateString()}`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        });
      getIO()
        .to(userId)
        .emit("notification", {
          message: `Call cancelled for ${scheduledCall.teacherId.name}: ${scheduledCall.classType} (${scheduledCall.classSubType})`,
          link: `${process.env.BASE_URL}/${
            req.isAdmin ? "admin" : "teacher"
          }/schedule`,
        });
      scheduledCall.studentIds.forEach((student) => {
        getIO()
          .to(student._id.toString())
          .emit("notification", {
            message: `Call cancelled with ${scheduledCall.teacherId.name}: ${scheduledCall.classType} (${scheduledCall.classSubType})`,
            link: `${process.env.BASE_URL}/student/schedule`,
          });
      });

      logger.info("Sending cancel email");
      const callDetails = {
        classType: scheduledCall.classType,
        classSubType: scheduledCall.classSubType,
        date: scheduledCall.date,
        startTime: scheduledCall.startTime,
        endTime: scheduledCall.endTime,
        timezone: scheduledCall.timezone,
        cancelled: true,
      };
      const communications = [
        sendCancelCallEmail(
          scheduledCall.teacherId.email,
          scheduledCall.teacherId.name,
          callDetails
        ).catch((error) => {
          logger.error(
            `Failed to send cancel email to ${scheduledCall.teacherId.email}:`,
            error
          );
        }),
        ...scheduledCall.studentIds
          .map((student) => [
            sendCancelCallEmail(student.email, student.name, callDetails).catch(
              (error) => {
                logger.error(
                  `Failed to send cancel email to ${student.email}:`,
                  error
                );
              }
            ),
          ])
          .flat(),
      ];
      await Promise.all(communications);

      logger.info(`Call cancelled: ${callId} by user: ${userId}`);
      res.json({ message: "Call cancelled successfully" });
    } catch (error) {
      logger.error("Cancel call error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Get Students Assigned to a Teacher
router.get("/students", async (req, res) => {
  const teacherId = req.user.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const teacher = await User.findOne({ _id: teacherId }).populate({
      path: "role",
      select: "roleName",
    });

    if (!teacher || !teacher.role || teacher.role.roleName !== "Teacher") {
      logger.warn(`Unauthorized student fetch attempt by user: ${teacherId}`);
      return res
        .status(403)
        .json({
          message: "Access denied. Only teachers can view their students.",
        });
    }

    const query = { teacherId: new mongoose.Types.ObjectId(teacherId) };

    const students = await User.find(query)
      .select(
        "name email phone subjects profileImage gender studentId joinDate timezone teacherId"
      )
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await User.countDocuments(query);

    logger.info(`Students fetched by teacher: ${teacherId}, page: ${page}`);
    res.json({
      students,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    logger.error("Get students error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

const calculateDuration = (startDate, days, repeat, numberOfLessons) => {
  if (!repeat) return "1 day";

  const scheduleDates = generateScheduleDates(
    new Date(startDate),
    days,
    365,
    numberOfLessons
  );

  if (scheduleDates.length === 0) return "1 day";
  if (scheduleDates.length === 1) return "1 day";

  const firstDate = scheduleDates[0];
  const lastDate = scheduleDates[scheduleDates.length - 1];
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  const durationDays =
    Math.round((lastDate - firstDate) / millisecondsPerDay) + 1;

  if (durationDays <= 7) return "1 week";
  if (durationDays <= 14) return "2 weeks";
  if (durationDays <= 21) return "3 weeks";
  if (durationDays <= 30) return "1 month";
  return `${Math.ceil(durationDays / 30)} months`;
};

const generateScheduleDates = (
  startDate,
  daysOfWeek,
  durationDays,
  numberOfLessons
) => {
  const dates = [];
  const currentDate = new Date(startDate);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + durationDays);

  while (currentDate <= endDate && dates.length < numberOfLessons) {
    const dayName = currentDate.toLocaleString("en", { weekday: "long" });
    if (daysOfWeek.includes(dayName)) {
      dates.push(new Date(currentDate));
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
};

const formatDuration = (minutes) => {
  if (!minutes || minutes <= 0) return "0 min";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours} hr`;
  return `${hours} hr ${remainingMinutes} min`;
};

const findNextAvailableDate = (startDate, days, maxAttempts = 365) => {
  let currentDate = new Date(startDate);
  let attempts = 0;

  while (attempts < maxAttempts) {
    currentDate.setDate(currentDate.getDate() + 1);
    const dayName = currentDate.toLocaleString("en", { weekday: "long" });
    if (days.includes(dayName)) {
      return new Date(currentDate);
    }
    attempts++;
  }
  return null;
};

//create schedule
router.post(
  "/create",
  authenticate,
  [
    check("courseId").isMongoId().withMessage("Valid course ID is required"),
    check("batchId").isMongoId().withMessage("Valid batch ID is required"),
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
    check("startDate")
      .isISO8601()
      .withMessage("Start date must be a valid ISO 8601 date"),
    check("days")
      .isArray()
      .withMessage("Days must be an array")
      .custom((value) =>
        value.every((day) =>
          [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
          ].includes(day)
        )
      )
      .withMessage("Days must be valid days of the week"),
    check("repeat").isBoolean().withMessage("Repeat must be a boolean"),
    check("lessonIds")
      .optional()
      .isArray()
      .withMessage("Lesson IDs must be an array")
      .custom((value) =>
        value.every((id) => mongoose.Types.ObjectId.isValid(id))
      )
      .withMessage("All lesson IDs must be valid MongoDB ObjectIds"),
    check("callDuration")
      .isInt({ min: 1 })
      .withMessage("Call duration must be a positive integer in minutes"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in create schedule:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      courseId,
      batchId,
      classType,
      meetingType,
      meetingLink,
      zoomLink,
      timezone,
      startTime,
      startDate,
      days,
      repeat,
      lessonIds,
      callDuration,
    } = req.body;

    const teacherId = req.user.userId;

    try {
      const teacher = await User.findById(teacherId).populate("role");
      if (!teacher || teacher.role.roleName !== "Teacher") {
        logger.warn(
          `Unauthorized schedule creation attempt by user: ${teacherId}`
        );
        return res.status(403).json({ message: "Not authorized" });
      }

      const batch = await Batch.findById(batchId).populate("courseId");
      if (!batch || batch.teacherId.toString() !== teacherId) {
        logger.warn(`Batch not found or not assigned to teacher: ${batchId}`);
        return res
          .status(404)
          .json({ message: "Batch not found or not assigned to you" });
      }

      if (batch.courseId._id.toString() !== courseId) {
        logger.warn(`Course ${courseId} not assigned to batch ${batchId}`);
        return res
          .status(400)
          .json({ message: "Course is not assigned to this batch" });
      }

      const course = batch.courseId;
      if (
        !course.assignedTeachers.map((id) => id.toString()).includes(teacherId)
      ) {
        logger.warn(`Teacher ${teacherId} not assigned to course: ${courseId}`);
        return res
          .status(403)
          .json({ message: "Not authorized to schedule for this course" });
      }

      const [hours, minutes] = startTime.split(":").map(Number);
      const startDateTime = new Date(startDate);
      startDateTime.setHours(hours, minutes, 0, 0);
      const endDateTime = new Date(startDateTime.getTime() + callDuration * 60 * 1000);
      const endTime = `${endDateTime
        .getHours()
        .toString()
        .padStart(2, "0")}:${endDateTime
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;

      let lessonsToSchedule = [];
      let lessonSource = "course";

      if (batch.batchSpecificModifications?.chapters?.length > 0) {
        lessonsToSchedule = batch.batchSpecificModifications.chapters
          .flatMap((chapter) => chapter.lessons)
          .filter((lesson) => lessonIds?.includes(lesson._id?.toString()) || !lessonIds)
          .map((lesson) => ({
            _id: lesson._id || new mongoose.Types.ObjectId(),
            title: lesson.title,
          }));
        lessonSource = "batchSpecificModifications";
      } else if (batch.teacherCourseModifications?.chapters?.length > 0) {
        lessonsToSchedule = batch.teacherCourseModifications.chapters
          .flatMap((chapter) => chapter.lessons)
          .filter((lesson) => lessonIds?.includes(lesson._id?.toString()) || !lessonIds)
          .map((lesson) => ({
            _id: lesson._id || new mongoose.Types.ObjectId(),
            title: lesson.title,
          }));
        lessonSource = "teacherCourseModifications";
      } else {
        lessonsToSchedule = course.chapters
          .flatMap((chapter) => chapter.lessons)
          .filter((lesson) => lessonIds?.includes(lesson._id.toString()) || !lessonIds)
          .map((lesson) => ({
            _id: lesson._id,
            title: lesson.title,
          }));
      }

      if (lessonsToSchedule.length === 0) {
        logger.warn(`No lessons available to schedule for batch ${batchId}`);
        return res
          .status(400)
          .json({ message: "No lessons available to schedule" });
      }

      const duration = calculateDuration(
        new Date(startDate),
        days,
        repeat,
        lessonsToSchedule.length
      );

      const scheduleDates = repeat
        ? generateScheduleDates(
            new Date(startDate),
            days,
            365,
            lessonsToSchedule.length
          )
        : [new Date(startDate)];

      if (scheduleDates.length < lessonsToSchedule.length) {
        logger.warn(
          `Not enough valid days to schedule all lessons: ${lessonsToSchedule.length} lessons, ${scheduleDates.length} dates`
        );
        return res
          .status(400)
          .json({ message: "Not enough valid days to schedule all lessons" });
      }

      const scheduledCalls = [];
      const notifications = [];

      for (let i = 0; i < lessonsToSchedule.length; i++) {
        const lesson = lessonsToSchedule[i];
        const date = scheduleDates[i] || scheduleDates[0];
        const lessonStartDateTime = new Date(date);
        lessonStartDateTime.setHours(hours, minutes, 0, 0);
        const lessonEndDateTime = new Date(lessonStartDateTime.getTime() + callDuration * 60 * 1000);
        const lessonEndTime = `${lessonEndDateTime
          .getHours()
          .toString()
          .padStart(2, "0")}:${lessonEndDateTime
          .getMinutes()
          .toString()
          .padStart(2, "0")}`;

        const meetingDetails = {
          zoomLink: meetingType === "zoom" ? zoomLink : meetingLink,
          meetingId:
            meetingType === "zoom"
              ? zoomLink.match(/\/j\/([0-9]+)/)?.[1] || null
              : null,
          passcode: null,
        };

        const scheduledCall = new ScheduledCall({
          teacherId,
          courseId,
          batchId,
          lessonId: lesson._id,
          classType: classType || `${course.title} - Lesson: ${lesson.title} (Batch: ${batch.name})`,
          type: meetingType,
          date: lessonStartDateTime,
          startTime,
          endTime: lessonEndTime,
          timezone,
          zoomLink: meetingDetails.zoomLink,
          meetingId: meetingDetails.meetingId,
          scheduledBy: teacherId,
          studentIds: batch.studentIds.map((s) => s.studentId),
          days: repeat ? days : [],
          repeat,
          status: "Scheduled",
          notificationSent: [],
          callDuration,
        });

        await scheduledCall.save();
        scheduledCalls.push(scheduledCall);

        notifications.push(
          new Notification({
            userId: teacherId,
            message: `New call scheduled for batch "${batch.name}" lesson "${lesson.title}" on ${date.toLocaleDateString()} at ${startTime}`,
            link: `${process.env.BASE_URL}/teacher/schedule`,
          }).save()
        );

        batch.studentIds.forEach(({ studentId }) => {
          notifications.push(
            new Notification({
              userId: studentId,
              message: `New call scheduled for batch "${batch.name}" lesson "${lesson.title}" on ${date.toLocaleDateString()} at ${startTime}`,
              link: `${process.env.BASE_URL}/student/schedule`,
            }).save()
          );
        });

        getIO()
          .to(teacherId.toString())
          .emit("notification", {
            message: `New call scheduled for batch "${batch.name}" lesson "${lesson.title}" on ${date.toLocaleDateString()} at ${startTime}`,
            link: `${process.env.BASE_URL}/teacher/schedule`,
          });
        batch.studentIds.forEach(({ studentId }) => {
          getIO()
            .to(studentId.toString())
            .emit("notification", {
              message: `New call scheduled for batch "${batch.name}" lesson "${lesson.title}" on ${date.toLocaleDateString()} at ${startTime}`,
              link: `${process.env.BASE_URL}/student/schedule`,
            });
        });
      }

      const courseSummary = {
        courseTitle: course.title,
        batchName: batch.name,
        classType: classType || `${course.title} (Batch: ${batch.name})`,
        type: meetingType,
        schedule: scheduledCalls.map((call) => ({
          date: call.date.toLocaleDateString(),
          startTime: call.startTime,
          endTime: call.endTime,
        })),
        baseUrl: process.env.BASE_URL,
      };

      logger.info(`Course summary for email notifications:`, { courseSummary });

      const studentUsers = await User.find({
        _id: { $in: batch.studentIds.map((s) => s.studentId) },
      });
      const studentEmails = studentUsers.map((u) => ({
        email: u.email,
        name: u.name,
      }));

      const emailPromises = [];
      if (teacher.email) {
        emailPromises.push(
          sendCourseScheduledEmail(
            teacher.email,
            teacher.name,
            courseSummary,
            true
          ).catch((err) => {
            logger.error(
              `Failed to send email to teacher ${teacher.email}: ${err.message}`
            );
            return null;
          })
        );
      }

      studentEmails.forEach((s) => {
        emailPromises.push(
          sendCourseScheduledEmail(s.email, s.name, courseSummary, false).catch(
            (err) => {
              logger.error(
                `Failed to send email to student ${s.email}: ${err.message}`
              );
              return null;
            }
          )
        );
      });

      await Promise.all([...notifications, ...emailPromises]);

      logger.info(
        `Schedules created for course ${courseId}, batch ${batchId} by teacher ${teacherId}`
      );
      res.json({
        message: "Schedules created successfully",
        scheduleIds: scheduledCalls.map((call) => call._id),
        duration,
        callDuration: formatDuration(callDuration),
      });
    } catch (error) {
      logger.error("Create schedule error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Reschedule a lesson
router.put(
  "/reschedule/:scheduleId/:lessonId",
  authenticate,
  [
    check("scheduleId").isMongoId().withMessage("Valid schedule ID is required"),
    check("lessonId").isMongoId().withMessage("Valid lesson ID is required"),
    check("meetingType")
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
    check("timezone").notEmpty().withMessage("Timezone is required"),
    check("startTime")
      .matches(/^\d{2}:\d{2}$/)
      .withMessage("Start time must be in HH:mm format"),
    check("startDate")
      .isISO8601()
      .withMessage("Start date must be a valid ISO 8601 date"),
    check("days")
      .isArray()
      .withMessage("Days must be an array")
      .custom((value) =>
        value.every((day) =>
          [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
          ].includes(day)
        )
      )
      .withMessage("Days must be valid days of the week"),
    check("repeat").isBoolean().withMessage("Repeat must be a boolean"),
    check("useExistingLink")
      .optional()
      .isBoolean()
      .withMessage("useExistingLink must be a boolean"),
    check("callDuration")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Call duration must be a positive integer in minutes"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in reschedule call:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { scheduleId, lessonId } = req.params;
    const {
      classType,
      meetingType,
      meetingLink,
      zoomLink,
      timezone,
      startTime,
      startDate,
      days,
      repeat,
      useExistingLink,
      callDuration,
    } = req.body;

    const teacherId = req.user.userId;

    try {
      const teacher = await User.findById(teacherId).populate("role");
      if (!teacher || teacher.role.roleName !== "Teacher") {
        logger.warn(`Unauthorized reschedule attempt by user: ${teacherId}`);
        return res.status(403).json({ message: "Not authorized" });
      }

      const schedule = await ScheduledCall.findById(scheduleId).populate(
        "courseId batchId"
      );
      if (!schedule || schedule.teacherId.toString() !== teacherId) {
        logger.warn(
          `Schedule not found or not assigned to teacher: ${scheduleId}`
        );
        return res
          .status(404)
          .json({ message: "Schedule not found or not assigned to you" });
      }

      const course = schedule.courseId;
      const batch = schedule.batchId;
      if (!batch || batch.teacherId.toString() !== teacherId) {
        logger.warn(`Batch not found or not assigned to teacher: ${batch?._id}`);
        return res
          .status(404)
          .json({ message: "Batch not found or not assigned to you" });
      }

      if (!course?.title) {
        logger.warn(`Course title is missing for courseId: ${course._id}`);
        return res
          .status(400)
          .json({ message: "Course title is missing or invalid" });
      }

      let lesson;
      let lessonSource = "course";
      if (batch.batchSpecificModifications?.chapters?.length > 0) {
        lesson = batch.batchSpecificModifications.chapters
          .flatMap((chapter) => chapter.lessons)
          .find((l) => l._id?.toString() === lessonId);
        lessonSource = "batchSpecificModifications";
      } else if (batch.teacherCourseModifications?.chapters?.length > 0) {
        lesson = batch.teacherCourseModifications.chapters
          .flatMap((chapter) => chapter.lessons)
          .find((l) => l._id?.toString() === lessonId);
        lessonSource = "teacherCourseModifications";
      } else {
        lesson = course.chapters
          .flatMap((chapter) => chapter.lessons)
          .find((l) => l._id.toString() === lessonId);
      }

      if (!lesson) {
        logger.warn(
          `Lesson ${lessonId} not found in ${lessonSource} for course: ${course._id}, batch: ${batch._id}`
        );
        return res
          .status(404)
          .json({ message: "Lesson not found in this batch's course" });
      }

      if (schedule.lessonId.toString() !== lessonId) {
        logger.warn(
          `Lesson ${lessonId} does not match schedule ${scheduleId} lessonId`
        );
        return res
          .status(400)
          .json({ message: "Lesson ID does not match the scheduled lesson" });
      }

      const effectiveCallDuration = callDuration || schedule.callDuration;
      if (!effectiveCallDuration) {
        logger.warn(`No call duration provided and no existing duration found for schedule: ${scheduleId}`);
        return res
          .status(400)
          .json({ message: "Call duration is required" });
      }

      const [hours, minutes] = startTime.split(":").map(Number);
      const endDateTime = new Date(startDate);
      endDateTime.setHours(hours, minutes + effectiveCallDuration);
      const endTime = `${endDateTime
        .getHours()
        .toString()
        .padStart(2, "0")}:${endDateTime
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;

      const meetingDetails = {
        zoomLink: useExistingLink
          ? schedule.zoomLink || schedule.meetingLink
          : meetingType === "zoom"
          ? zoomLink
          : meetingLink,
        meetingId:
          meetingType === "zoom"
            ? useExistingLink
              ? schedule.meetingId
              : zoomLink?.match(/\/j\/([0-9]+)/)?.[1] || null
            : null,
        passcode: null,
      };

      schedule.previousDate = schedule.date;
      schedule.previousStartTime = schedule.startTime;
      schedule.previousEndTime = schedule.endTime;

      schedule.classType =
        classType ||
        `${course.title} - Lesson: ${lesson.title} (Batch: ${batch.name})`;
      schedule.type = meetingType;
      schedule.date = new Date(startDate);
      schedule.startTime = startTime;
      schedule.endTime = endTime;
      schedule.timezone = timezone;
      schedule.zoomLink = meetingDetails.zoomLink;
      schedule.meetingId = meetingDetails.meetingId;
      schedule.passcode = meetingDetails.passcode || "";
      schedule.status = "Rescheduled";
      schedule.days = repeat ? days : [];
      schedule.repeat = repeat;
      schedule.scheduledBy = teacherId;
      schedule.notificationSent = [];
      schedule.callDuration = effectiveCallDuration;
      await schedule.save();

      const duration = calculateDuration(new Date(startDate), days, repeat);

      const callDetails = {
        classType: schedule.classType,
        type: meetingType,
        lessonTitle: lesson.title,
        lessonId: schedule.lessonId,
        batchName: batch.name,
        previousDate: schedule.previousDate,
        previousStartTime: schedule.previousStartTime,
        previousEndTime: schedule.previousEndTime,
        date: new Date(startDate),
        startTime,
        endTime,
        timezone,
        zoomLink: meetingDetails.zoomLink,
        duration,
        teacher: teacher.name,
        callDuration: formatDuration(effectiveCallDuration),
        courseName: course.title,
        courseId: course._id,
        batchId: batch._id,
      };

      logger.info("callDetails for reschedule:", callDetails);

      const notifications = [
        new Notification({
          userId: teacherId,
          message: `Call for batch "${batch.name}" lesson "${lesson.title}" rescheduled from ${callDetails.previousDate ? new Date(callDetails.previousDate).toLocaleDateString() : "N/A"} ${callDetails.previousStartTime || "N/A"} to ${new Date(startDate).toLocaleDateString()} at ${startTime}`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        }).save(),
        ...batch.studentIds.map(({ studentId }) =>
          new Notification({
            userId: studentId,
            message: `Call for batch "${batch.name}" lesson "${lesson.title}" rescheduled from ${callDetails.previousDate ? new Date(callDetails.previousDate).toLocaleDateString() : "N/A"} ${callDetails.previousStartTime || "N/A"} to ${new Date(startDate).toLocaleDateString()} at ${startTime}`,
            link: `${process.env.BASE_URL}/student/schedule`,
          }).save()
        ),
      ];

      const students = await User.find({
        _id: { $in: batch.studentIds.map((s) => s.studentId) },
      });

      const emailNotifications = [
        sendCourseCallRescheduledEmail(teacher.email, teacher.name, callDetails, true),
        ...students.map((student) =>
          sendCourseCallRescheduledEmail(student.email, student.name, callDetails, false)
        ),
      ];

      await Promise.all([...notifications, ...emailNotifications]);

      getIO()
        .to(teacherId.toString())
        .emit("notification", {
          message: `Call for batch "${batch.name}" lesson "${lesson.title}" rescheduled from ${callDetails.previousDate ? new Date(callDetails.previousDate).toLocaleDateString() : "N/A"} ${callDetails.previousStartTime || "N/A"} to ${new Date(startDate).toLocaleDateString()} at ${startTime}`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        });
      batch.studentIds.forEach(({ studentId }) => {
        getIO()
          .to(studentId.toString())
          .emit("notification", {
            message: `Call for batch "${batch.name}" lesson "${lesson.title}" rescheduled from ${callDetails.previousDate ? new Date(callDetails.previousDate).toLocaleDateString() : "N/A"} ${callDetails.previousStartTime || "N/A"} to ${new Date(startDate).toLocaleDateString()} at ${startTime}`,
            link: `${process.env.BASE_URL}/student/schedule`,
          });
      });

      logger.info(
        `Schedule ${scheduleId} for lesson ${lesson.title} in batch ${batch.name} rescheduled by teacher ${teacherId}`
      );
      res.json({
        message: "Schedule rescheduled successfully",
        scheduleId: schedule._id,
        duration,
        callDuration: formatDuration(effectiveCallDuration),
      });
    } catch (error) {
      logger.error("Reschedule call error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Cancel a call
router.post(
  "/cancel/:callId/:lessonId",
  authenticate,
  [
    check("callId").isMongoId().withMessage("Valid call ID is required"),
    check("lessonId").isMongoId().withMessage("Valid lesson ID is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in cancel schedule:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { callId, lessonId } = req.params;
    const teacherId = req.user.userId;

    try {
      const teacher = await User.findById(teacherId).populate("role");
      if (!teacher || teacher.role.roleName !== "Teacher") {
        logger.warn(`Unauthorized schedule cancellation attempt by user: ${teacherId}`);
        return res.status(403).json({ message: "Not authorized" });
      }

      const schedule = await ScheduledCall.findById(callId).populate("courseId batchId");
      if (!schedule || schedule.teacherId.toString() !== teacherId) {
        logger.warn(`Schedule not found or not assigned to teacher: ${callId}`);
        return res.status(404).json({ message: "Schedule not found or not assigned to you" });
      }

      if (schedule.lessonId.toString() !== lessonId) {
        logger.warn(`Lesson ID ${lessonId} does not match schedule lessonId ${schedule.lessonId}`);
        return res.status(400).json({ message: "Invalid lesson ID for this schedule" });
      }

      const course = schedule.courseId;
      const batch = schedule.batchId;
      if (!batch || batch.teacherId.toString() !== teacherId) {
        logger.warn(`Batch not found or not assigned to teacher: ${batch?._id}`);
        return res.status(404).json({ message: "Batch not found or not assigned to you" });
      }

      if (!course?.title) {
        logger.warn(`Course title is missing for courseId: ${course._id}`);
        return res.status(400).json({ message: "Course title is missing or invalid" });
      }

      let lesson;
      let lessonSource = "course";
      if (batch.batchSpecificModifications?.chapters?.length > 0) {
        lesson = batch.batchSpecificModifications.chapters
          .flatMap((chapter) => chapter.lessons)
          .find((l) => l._id?.toString() === lessonId);
        lessonSource = "batchSpecificModifications";
      } else if (batch.teacherCourseModifications?.chapters?.length > 0) {
        lesson = batch.teacherCourseModifications.chapters
          .flatMap((chapter) => chapter.lessons)
          .find((l) => l._id?.toString() === lessonId);
        lessonSource = "teacherCourseModifications";
      } else {
        lesson = course.chapters
          .flatMap((chapter) => chapter.lessons)
          .find((l) => l._id.toString() === lessonId);
      }

      if (!lesson) {
        logger.warn(
          `Lesson ${lessonId} not found in ${lessonSource} for course: ${course._id}, batch: ${batch._id}`
        );
        return res.status(404).json({ message: "Lesson not found in this batch's course" });
      }

      schedule.status = "Cancelled";
      schedule.previousDate = schedule.date;
      schedule.previousStartTime = schedule.startTime;
      schedule.previousEndTime = schedule.endTime;
      await schedule.save();

      const allCalls = await ScheduledCall.find({
        batchId: batch._id,
        status: { $in: ["Scheduled", "Rescheduled", "Cancelled"] },
      })
        .sort({ date: 1 })
        .lean();

      const cancelledCallIndex = allCalls.findIndex(
        (call) => call._id.toString() === callId
      );

      if (cancelledCallIndex === -1) {
        logger.warn(`Cancelled call ${callId} not found in active calls`);
        return res.status(404).json({ message: "Cancelled call not found" });
      }

      const days = schedule.days || [];
      if (days.length === 0) {
        logger.warn(`No days pattern defined for schedule ${callId}`);
        return res.status(400).json({ message: "No days pattern defined for rescheduling" });
      }

      const maxAttempts = 365 * 2;
      const nextAvailableDate = findNextAvailableDate(schedule.date, days, maxAttempts);
      if (!nextAvailableDate) {
        logger.warn(`No available date found for rescheduling call ${callId}`);
        return res.status(400).json({ message: "No available date found for rescheduling" });
      }

      const [hours, minutes] = schedule.startTime.split(":").map(Number);
      const endDateTime = new Date(nextAvailableDate);
      endDateTime.setHours(hours, minutes + schedule.callDuration);
      const endTime = `${endDateTime
        .getHours()
        .toString()
        .padStart(2, "0")}:${endDateTime
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;

      const rescheduledCall = new ScheduledCall({
        teacherId,
        courseId: schedule.courseId,
        batchId: schedule.batchId,
        lessonId: schedule.lessonId,
        classType: schedule.classType,
        type: schedule.type,
        date: nextAvailableDate,
        startTime: schedule.startTime,
        endTime,
        timezone: schedule.timezone,
        zoomLink: schedule.zoomLink,
        meetingId: schedule.meetingId,
        scheduledBy: teacherId,
        studentIds: batch.studentIds.map((s) => s.studentId),
        days,
        repeat: schedule.repeat,
        status: "Rescheduled",
        notificationSent: [],
        callDuration: schedule.callDuration,
        previousDate: schedule.date,
        previousStartTime: schedule.startTime,
        previousEndTime: schedule.endTime,
      });

      await rescheduledCall.save();

      const subsequentCalls = allCalls.slice(cancelledCallIndex);
      const updatedCalls = [];
      let currentDate = new Date(nextAvailableDate);

      for (let i = 0; i < subsequentCalls.length; i++) {
        const call = subsequentCalls[i];
        const nextDate = findNextAvailableDate(currentDate, days, maxAttempts);
        if (!nextDate) {
          logger.warn(`No available date found for rescheduling call ${call._id}`);
          continue;
        }

        const callEndDateTime = new Date(nextDate);
        callEndDateTime.setHours(hours, minutes + schedule.callDuration);
        const callEndTime = `${callEndDateTime
          .getHours()
          .toString()
          .padStart(2, "0")}:${callEndDateTime
          .getMinutes()
          .toString()
          .padStart(2, "0")}`;

        const updatedCall = await ScheduledCall.findByIdAndUpdate(
          call._id,
          {
            date: nextDate,
            startTime: schedule.startTime,
            endTime: callEndTime,
            previousDate: call.date,
            previousStartTime: call.startTime,
            previousEndTime: call.endTime,
            status: "Rescheduled",
            notificationSent: [],
          },
          { new: true }
        );

        updatedCalls.push(updatedCall);
        currentDate = new Date(nextDate);
      }

      const callDetails = {
        classType: schedule.classType,
        type: schedule.type,
        lessonTitle: lesson.title,
        lessonId: schedule.lessonId,
        batchName: batch.name,
        courseName: course.title,
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        timezone: schedule.timezone,
        zoomLink: schedule.zoomLink,
        callDuration: formatDuration(schedule.callDuration),
      };

      const notifications = [
        new Notification({
          userId: teacherId,
          message: `Call for batch "${batch.name}" lesson "${lesson.title}" on ${new Date(schedule.date).toLocaleDateString()} cancelled`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        }).save(),
        ...batch.studentIds.map(({ studentId }) =>
          new Notification({
            userId: studentId,
            message: `Call for batch "${batch.name}" lesson "${lesson.title}" on ${new Date(schedule.date).toLocaleDateString()} cancelled`,
            link: `${process.env.BASE_URL}/student/schedule`,
          }).save()
        ),
      ];

      const allUsers = await User.find().populate("role");
      const teacherAdmins = allUsers.filter(user =>
        ["Admin", "Super Admin"].includes(user.role?.roleName)
      );

      const students = await User.find({ _id: { $in: batch.studentIds.map((s) => s.studentId) } });

      teacherAdmins.forEach((admin) => {
        notifications.push(
          new Notification({
            userId: admin._id,
            message: `Call for batch "${batch.name}" lesson "${lesson.title}" on ${new Date(schedule.date).toLocaleDateString()} cancelled by ${teacher.name}`,
            link: `${process.env.BASE_URL}/admin/schedule`,
          }).save()
        );
      });

      const emailNotifications = [
        sendCourseCallCancelledEmail(teacher.email, teacher.name, callDetails).catch((error) => {
          logger.error(`Failed to send cancel email to ${teacher.email}:`, error);
        }),
        ...students.map((student) =>
          sendCourseCallCancelledEmail(student.email, student.name, callDetails).catch((error) => {
            logger.error(`Failed to send cancel email to ${student.email}:`, error);
          })
        ),
        ...teacherAdmins.map((admin) =>
          sendCourseCallCancelledEmail(admin.email, admin.name, callDetails).catch((error) => {
            logger.error(`Failed to send cancel email to ${admin.email}:`, error);
          })
        ),
      ];

      const emitSocketNotification = (userId, message, link) => {
        getIO().to(userId.toString()).emit("notification", { message, link });
      };

      emitSocketNotification(
        teacherId,
        `Call for batch "${batch.name}" lesson "${lesson.title}" on ${new Date(schedule.date).toLocaleDateString()} cancelled`,
        `${process.env.BASE_URL}/teacher/schedule`
      );
      batch.studentIds.forEach(({ studentId }) => {
        emitSocketNotification(
          studentId,
          `Call for batch "${batch.name}" lesson "${lesson.title}" on ${new Date(schedule.date).toLocaleDateString()} cancelled`,
          `${process.env.BASE_URL}/student/schedule`
        );
      });
      teacherAdmins.forEach((admin) => {
        emitSocketNotification(
          admin._id,
          `Call for batch "${batch.name}" lesson "${lesson.title}" on ${new Date(schedule.date).toLocaleDateString()} cancelled by ${teacher.name}`,
          `${process.env.BASE_URL}/admin/schedule`
        );
      });

      const rescheduleCallDetails = {
        classType: rescheduledCall.classType,
        type: rescheduledCall.type,
        lessonTitle: lesson.title,
        lessonId: rescheduledCall.lessonId,
        batchName: batch.name,
        courseName: course.title,
        previousDate: rescheduledCall.previousDate,
        previousStartTime: rescheduledCall.previousStartTime,
        previousEndTime: rescheduledCall.previousEndTime,
        date: new Date(rescheduledCall.date),
        startTime: rescheduledCall.startTime,
        endTime: rescheduledCall.endTime,
        timezone: rescheduledCall.timezone,
        zoomLink: rescheduledCall.zoomLink,
        duration: calculateDuration(new Date(rescheduledCall.date), days, rescheduledCall.repeat),
        teacher: teacher.name,
        callDuration: formatDuration(rescheduledCall.callDuration),
      };

      notifications.push(
        new Notification({
          userId: teacherId,
          message: `Call for batch "${batch.name}" lesson "${lesson.title}" rescheduled to ${new Date(rescheduledCall.date).toLocaleDateString()} at ${rescheduledCall.startTime}`,
          link: `${process.env.BASE_URL}/teacher/schedule`,
        }).save(),
        ...batch.studentIds.map(({ studentId }) =>
          new Notification({
            userId: studentId,
            message: `Call for batch "${batch.name}" lesson "${lesson.title}" rescheduled to ${new Date(rescheduledCall.date).toLocaleDateString()} at ${rescheduledCall.startTime}`,
            link: `${process.env.BASE_URL}/student/schedule`,
          }).save()
        ),
        ...teacherAdmins.map((admin) =>
          new Notification({
            userId: admin._id,
            message: `Call for batch "${batch.name}" lesson "${lesson.title}" rescheduled to ${new Date(rescheduledCall.date).toLocaleDateString()} at ${rescheduledCall.startTime} by ${teacher.name}`,
            link: `${process.env.BASE_URL}/admin/schedule`,
          }).save()
        )
      );

      emailNotifications.push(
        sendCourseCallRescheduledEmail(teacher.email, teacher.name, rescheduleCallDetails).catch((error) => {
          logger.error(`Failed to send reschedule email to ${teacher.email}:`, error);
        }),
        ...students.map((student) =>
          sendCourseCallRescheduledEmail(student.email, student.name, rescheduleCallDetails).catch((error) => {
            logger.error(`Failed to send reschedule email to ${student.email}:`, error);
          })
        ),
        ...teacherAdmins.map((admin) =>
          sendCourseCallRescheduledEmail(admin.email, admin.name, rescheduleCallDetails).catch((error) => {
            logger.error(`Failed to send reschedule email to ${admin.email}:`, error);
          })
        )
      );

      for (const call of updatedCalls) {
        const callLesson = batch.batchSpecificModifications?.chapters?.length > 0
          ? batch.batchSpecificModifications.chapters
              .flatMap((chapter) => chapter.lessons)
              .find((l) => l._id?.toString() === call.lessonId?.toString())
          : batch.teacherCourseModifications?.chapters?.length > 0
          ? batch.teacherCourseModifications.chapters
              .flatMap((chapter) => chapter.lessons)
              .find((l) => l._id?.toString() === call.lessonId?.toString())
          : course.chapters
              .flatMap((chapter) => chapter.lessons)
              .find((l) => l._id.toString() === call.lessonId?.toString());

        const callLessonTitle = callLesson?.title || "Unknown Lesson";

        const shiftedCallDetails = {
          classType: call.classType,
          type: call.type,
          lessonTitle: callLessonTitle,
          lessonId: call.lessonId,
          batchName: batch.name,
          courseName: course.title,
          previousDate: call.previousDate,
          previousStartTime: call.previousStartTime,
          previousEndTime: call.previousEndTime,
          date: new Date(call.date),
          startTime: call.startTime,
          endTime: call.endTime,
          timezone: call.timezone,
          zoomLink: call.zoomLink,
          duration: calculateDuration(new Date(call.date), days, call.repeat),
          teacher: teacher.name,
          callDuration: formatDuration(call.callDuration),
        };

        notifications.push(
          new Notification({
            userId: teacherId,
            message: `Call for batch "${batch.name}" lesson "${callLessonTitle}" rescheduled to ${new Date(call.date).toLocaleDateString()} at ${call.startTime}`,
            link: `${process.env.BASE_URL}/teacher/schedule`,
          }).save(),
          ...batch.studentIds.map(({ studentId }) =>
            new Notification({
              userId: studentId,
              message: `Call for batch "${batch.name}" lesson "${callLessonTitle}" rescheduled to ${new Date(call.date).toLocaleDateString()} at ${call.startTime}`,
              link: `${process.env.BASE_URL}/student/schedule`,
            }).save()
          ),
          ...teacherAdmins.map((admin) =>
            new Notification({
              userId: admin._id,
              message: `Call for batch "${batch.name}" lesson "${callLessonTitle}" rescheduled to ${new Date(call.date).toLocaleDateString()} at ${call.startTime} by ${teacher.name}`,
              link: `${process.env.BASE_URL}/admin/schedule`,
            }).save()
          )
        );

        emailNotifications.push(
          sendCourseCallRescheduledEmail(teacher.email, teacher.name, shiftedCallDetails).catch((error) => {
            logger.error(`Failed to send reschedule email to ${teacher.email}:`, error);
          }),
          ...students.map((student) =>
            sendCourseCallRescheduledEmail(student.email, student.name, shiftedCallDetails).catch((error) => {
              logger.error(`Failed to send reschedule email to ${student.email}:`, error);
            })
          ),
          ...teacherAdmins.map((admin) =>
            sendCourseCallRescheduledEmail(admin.email, admin.name, shiftedCallDetails).catch((error) => {
              logger.error(`Failed to send reschedule email to ${admin.email}:`, error);
            })
          )
        );

        emitSocketNotification(
          teacherId,
          `Call for batch "${batch.name}" lesson "${callLessonTitle}" rescheduled to ${new Date(call.date).toLocaleDateString()} at ${call.startTime}`,
          `${process.env.BASE_URL}/teacher/schedule`
        );
        batch.studentIds.forEach(({ studentId }) => {
          emitSocketNotification(
            studentId,
            `Call for batch "${batch.name}" lesson "${callLessonTitle}" rescheduled to ${new Date(call.date).toLocaleDateString()} at ${call.startTime}`,
            `${process.env.BASE_URL}/student/schedule`
          );
        });
        teacherAdmins.forEach((admin) => {
          emitSocketNotification(
            admin._id,
            `Call for batch "${batch.name}" lesson "${callLessonTitle}" rescheduled to ${new Date(call.date).toLocaleDateString()} at ${call.startTime} by ${teacher.name}`,
            `${process.env.BASE_URL}/admin/schedule`
          );
        });
      }

      await Promise.all([...notifications, ...emailNotifications]);

      logger.info(
        `Schedule ${callId} for lesson ${lesson.title} in batch ${batch.name} cancelled and rescheduled by teacher ${teacherId}`
      );
      res.json({
        message: "Schedule cancelled and rescheduled successfully",
        cancelledScheduleId: schedule._id,
        rescheduledScheduleId: rescheduledCall._id,
        duration: calculateDuration(new Date(rescheduledCall.date), days, rescheduledCall.repeat),
        callDuration: formatDuration(rescheduledCall.callDuration),
      });
    } catch (error) {
      logger.error("Cancel and reschedule schedule error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Get batch calls
router.get("/batch/:batchId/calls", authenticate, async (req, res) => {
  try {
    const { batchId } = req.params;
    const userId = req.user.userId;

    const user = await User.findById(userId).populate("role");
    if (
      !user ||
      !["Admin", "Super Admin", "Teacher", "Student"].includes(user.role.roleName)
    ) {
      logger.warn(`Unauthorized batch calls fetch attempt by user: ${userId}`);
      return res.status(403).json({ message: "Not authorized" });
    }

    const batch = await Batch.findOne({ _id: batchId, isDeleted: false }).lean();
    if (!batch) {
      logger.warn(`Batch not found: ${batchId}`);
      return res.status(404).json({ message: "Batch not found" });
    }

    const course = await Course.findById(batch.courseId).lean();
    if (!course) {
      logger.warn(`Course not found for batch: ${batchId}`);
      return res.status(404).json({ message: "Course not found" });
    }

    if (user.role.roleName === "Teacher") {
      const teacherIds = course.assignedTeachers.map((teacher) => teacher.toString());
      if (!teacherIds.includes(userId) || batch.teacherId?.toString() !== userId) {
        logger.warn(`Teacher ${userId} not assigned to batch: ${batchId}`);
        return res.status(403).json({ message: "Not authorized to view this batch" });
      }
    } else if (user.role.roleName === "Student") {
      const isStudentEnrolled = batch.studentIds.some(
        (student) => student.studentId.toString() === userId
      );
      if (!isStudentEnrolled) {
        logger.warn(`Student ${userId} not assigned to batch: ${batchId}`);
        return res.status(403).json({ message: "Not authorized to view this batch" });
      }
    } else if (user.role.roleName === "Admin") {
      if (course.createdBy.toString() !== userId) {
        logger.warn(`Admin ${userId} not authorized for course: ${course._id}`);
        return res.status(403).json({ message: "Not authorized to view this batch" });
      }
    }

    const calls = await ScheduledCall.find({ batchId })
      .populate("teacherId", "_id name profileImage subjects")
      .populate("studentIds", "_id name profileImage subjects")
      .lean()
      .sort({ date: 1 }); 

    let scheduleDuration = "Unknown";
    let lessons = [];

    let lessonSource = "course";
    if (batch.batchSpecificModifications?.chapters?.length > 0) {
      lessons = batch.batchSpecificModifications.chapters
        .flatMap((chapter) =>
          chapter.lessons.map((lesson) => ({
            lessonId: lesson._id,
            lessonTitle: lesson.title,
            chapterId: chapter._id,
            chapterTitle: chapter.title,
            order: lesson.order,
          }))
        )
        .sort((a, b) => a.order - b.order);
      lessonSource = "batchSpecificModifications";
    } else if (batch.teacherCourseModifications?.chapters?.length > 0) {
      lessons = batch.teacherCourseModifications.chapters
        .flatMap((chapter) =>
          chapter.lessons.map((lesson) => ({
            lessonId: lesson._id,
            lessonTitle: lesson.title,
            chapterId: chapter._id,
            chapterTitle: chapter.title,
            order: lesson.order,
          }))
        )
        .sort((a, b) => a.order - b.order);
      lessonSource = "teacherCourseModifications";
    } else {
      lessons = course.chapters
        .flatMap((chapter) =>
          chapter.lessons.map((lesson) => ({
            lessonId: lesson._id,
            lessonTitle: lesson.title,
            chapterId: chapter._id,
            chapterTitle: chapter.title,
            order: lesson.order,
          }))
        )
        .sort((a, b) => a.order - b.order);
    }

    if (calls.length > 0) {
      const callDates = calls
        .map((call) => new Date(call.date))
        .filter((date) => !isNaN(date.getTime()));
      if (callDates.length > 0) {
        const earliestDate = new Date(Math.min(...callDates));
        const latestDate = new Date(Math.max(...callDates));
        const numberOfLessons = lessons.length;
        const repeat = calls.some((call) => call.repeat);
        const days = [...new Set(calls.flatMap((call) => call.days || []))];

        scheduleDuration = calculateDuration(
          earliestDate,
          days,
          repeat,
          numberOfLessons
        );
      }
    }

    let callsWithLessonDetails = calls.map((call, index) => {
      const lesson = lessons[index] || {
        lessonID: null,
        lessonTitle: "Unknown Lesson",
        chapterId: null,
        chapterTitle: "Unknown Chapter",
      };

      const response = {
        _id: call._id,
        teacherId: call.teacherId._id,
        teacherName: call.teacherId.name,
        teacherProfileImage: call.teacherId.profileImage,
        teacherSubjects: call.teacherId.subjects,
        studentIds: call.studentIds.map((student) => ({
          studentId: student._id,
          studentName: student.name,
          studentProfileImage: student.profileImage,
          studentSubjects: student.subjects,
        })),
        courseId: call.courseId,
        batchId: call.batchId,
        lessonId: lesson.lessonId,
        lessonTitle: lesson.lessonTitle,
        chapterId: lesson.chapterId,
        chapterTitle: lesson.chapterTitle,
        lessonSource,
        classType: call.classType,
        type: call.type,
        date: call.date,
        startTime: call.startTime,
        endTime: call.endTime,
        timezone: call.timezone,
        zoomLink: call.zoomLink,
        meetingId: call.meetingId,
        scheduledBy: call.scheduledBy,
        status: call.status,
        notificationSent: call.notificationSent,
        days: call.days,
        repeat: call.repeat,
        documents: call.documents,
        createdAt: call.createdAt,
        updatedAt: call.updatedAt,
        callDuration: formatDuration(call.callDuration),
      };

      if (call.status === "Rescheduled") {
        response.previousDate = call.previousDate
          ? new Date(call.previousDate).toISOString()
          : null;
        response.previousStartTime = call.previousStartTime || null;
        response.previousEndTime = call.previousEndTime || null;
      }

      return response;
    });

    const batchResponse = {
      batchId: batch._id,
      batchName: batch.name,
      teacherId: batch.teacherId,
      studentIds: batch.studentIds.map((s) => s.studentId),
      courseId: course._id,
      courseTitle: course.title,
      calls: callsWithLessonDetails,
      schedule: {
        scheduleStatus: calls.length > 0 ? "Scheduled" : "No Calls",
        scheduleDuration,
      },
    };

    logger.info(`Batch schedules fetched for batch: ${batchId} by user: ${userId}`);
    res.json({ batch: batchResponse });
  } catch (error) {
    logger.error("Get batch schedules error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});
module.exports = router;
