const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authenticate = require("../middleware/auth");
const Notification = require("../models/Notification");
const { sendReportCardEmail } = require("../services/emailService");
const { check, validationResult } = require("express-validator");
const Role = require("../models/Role");
const ReportCard = require("../models/ReportCard");
const logger = require("../utils/logger");
const { getIO } = require("../config/socket");

// Get assigned students for a teacher
router.get("/teachers/:teacherId/students", authenticate, async (req, res) => {
  try {
    const { teacherId } = req.params;
    if (req.user.userId.toString() !== teacherId) {
      logger.warn(`Unauthorized access attempt by user: ${req.user.userId}`);
      return res.status(403).json({ message: "Unauthorized" });
    }

    const studentRole = await Role.findOne({ roleName: "Student" });
    if (!studentRole) {
      logger.warn("Student role not found");
      return res.status(404).json({ message: "Student role not found" });
    }

    const students = await User.find({
      teacherId,
      role: studentRole._id,
    })
      .populate("role")
      .select(
        "name email gender profileImage joinDate subjects studentId _id profile.about profile.hobbies profile.skills profile.bio profile.accomplishments profile.qualifications enrollmentStatus academicYear"
      );

    logger.info(
      `Fetched ${students.length} students for teacher: ${teacherId}`
    );
    res.json(students);
  } catch (error) {
    logger.error("Error fetching students:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get fellow students and teacher for a student
router.get("/students/:studentId/peers", authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    if (req.user.userId.toString() !== studentId) {
      logger.warn(`Unauthorized access attempt by user: ${req.user.userId}`);
      return res.status(403).json({ message: "Unauthorized" });
    }

    const student = await User.findById(studentId).select("teacherId");
    if (!student) {
      logger.warn(`Student not found: ${studentId}`);
      return res.status(404).json({ message: "Student not found" });
    }

    const fellowStudents = await User.find({
      teacherId: student.teacherId,
      _id: { $ne: studentId },
      "role.roleName": "Student",
    })
      .populate("role")
      .select(
        "name email gender profileImage joinDate subjects studentId _id profile.about profile.hobbies profile.skills profile.bio profile.accomplishments profile.qualifications"
      );

    const teacher = await User.findById(student.teacherId)
      .populate("role")
      .select(
        "name email gender profileImage joinDate subjects employeeId _id profile.about profile.hobbies profile.skills profile.bio profile.accomplishments profile.qualifications profile.experience"
      );

    logger.info(`Fetched peers for student: ${studentId}`);
    res.json({ fellowStudents, teacher });
  } catch (error) {
    logger.error("Error fetching peers:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get student profile by ID (restricted view)
router.get("/students/:studentId", authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await User.findById(studentId)
      .populate("role")
      .select(
        "name email gender profileImage joinDate subjects studentId _id profile.about profile.hobbies profile.skills profile.bio profile.accomplishments profile.qualifications"
      );
    if (!student || student.role.roleName !== "Student") {
      logger.warn(`Student not found: ${studentId}`);
      return res.status(404).json({ message: "Student not found" });
    }

    logger.info(`Fetched student profile: ${studentId}`);
    res.json(student);
  } catch (error) {
    logger.error("Error fetching student profile:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Submit report card
router.post("/report-card", authenticate, async (req, res) => {
  try {
    const teacher = await User.findById(req.user.userId).populate("role");
    if (!teacher || teacher.role.roleName !== "Teacher") {
      logger.warn(
        `Unauthorized report card submission by user: ${req.user.userId}`
      );
      return res
        .status(403)
        .json({ message: "Only teachers can submit report cards" });
    }

    const { studentId, rating, comments } = req.body;
    if (!studentId || !rating || rating < 1 || rating > 5) {
      logger.warn(
        `Invalid report card data: studentId=${studentId}, rating=${rating}`
      );
      return res.status(400).json({ message: "Invalid report card data" });
    }

    const student = await User.findById(studentId).populate("role");
    if (!student || student.role.roleName !== "Student") {
      logger.warn(`Invalid student ID: ${studentId}`);
      return res.status(404).json({ message: "Student not found" });
    }

    const reportCard = new ReportCard({
      studentId,
      teacherId: req.user.userId,
      rating,
      comments,
    });
    await reportCard.save();

    const adminRoles = await Role.find({
      roleName: { $in: ["Admin", "Super Admin"] },
    });
    const adminRoleIds = adminRoles.map((role) => role._id);
    if (!adminRoleIds.length) {
      logger.warn("No admin roles found");
    }

    const admins = await User.find({ role: { $in: adminRoleIds } }).populate(
      "role"
    );
    const notifications = admins.map((admin) =>
      new Notification({
        userId: admin._id,
        message: `New report card submitted for ${student.name} by ${teacher.name}. Rating: ${rating}/5`,
        link: `${process.env.BASE_URL}/admin/students`,
      }).save()
    );

    await Promise.all(notifications);

    admins.forEach((admin) => {
      getIO()
        .to(admin._id.toString())
        .emit("notification", {
          message: `New report card submitted for ${student.name} by ${teacher.name}. Rating: ${rating}/5`,
          link: `${process.env.BASE_URL}/admin/students`,
        });

      sendReportCardEmail(
        admin.email,
        student.name,
        teacher.name,
        rating,
        comments
      ).catch((error) => {
        logger.error(
          `Failed to send report card email to ${admin.email}:`,
          error
        );
      });
    });

    logger.info(
      `Report card submitted for student ${studentId}: Rating ${rating}, Comments: ${comments}`
    );
    res.json({ message: "Report card submitted successfully" });
  } catch (error) {
    logger.error("Error submitting report card:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get("/report-cards/:studentId", authenticate, async (req, res) => {
  try {
    const { studentId } = req.params;
    const user = await User.findById(req.user.userId).populate("role");
    if (!user || user.role.roleName !== "Teacher") {
      logger.warn(`Unauthorized access attempt by user: ${req.user.userId}`);
      return res
        .status(403)
        .json({ message: "Only teachers can view report cards" });
    }

    const student = await User.findById(studentId).populate("role");
    if (
      !student ||
      student.role.roleName !== "Student" ||
      student.teacherId.toString() !== req.user.userId
    ) {
      logger.warn(`Invalid or unauthorized student ID: ${studentId}`);
      return res
        .status(404)
        .json({ message: "Student not found or not assigned to you" });
    }

    const reportCards = await ReportCard.find({
      studentId,
      teacherId: req.user.userId,
    }).select(
      "_id studentId teacherId rating comments date createdAt updatedAt"
    );

    logger.info(`Fetched report cards for student: ${studentId}`);
    res.json(reportCards);
  } catch (error) {
    logger.error("Error fetching report cards:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get Notification Preferences
router.get("/notification-preferences", authenticate, async (req, res) => {
  const userId = req.user.userId;

  try {
    const user = await User.findById(userId);
    if (!user) {
      logger.warn(`User not found: ${userId}`);
      return res.status(404).json({ message: "User not found" });
    }

    const notificationPreferences = user.notificationPreferences || {
      enabled: true,
      methods: ["email"],
      timings: ["10min"],
    };

    logger.info(`Notification preferences retrieved for user: ${userId}`);
    res.json({ notificationPreferences });
  } catch (error) {
    logger.error("Get notification preferences error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Update Notification Preferences
router.put(
  "/notification-preferences",
  authenticate,
  [
    check("enabled").isBoolean().withMessage("Enabled must be a boolean"),
    check("methods")
      .isArray()
      .withMessage("Methods must be an array")
      .custom((methods) =>
        methods.every((method) => ["email", "whatsapp"].includes(method))
      )
      .withMessage("Methods must be email or whatsapp"),
    check("timings")
      .isArray()
      .withMessage("Timings must be an array")
      .custom((timings) =>
        timings.every((timing) =>
          ["1day", "1hour", "30min", "10min"].includes(timing)
        )
      )
      .withMessage("Timings must be 1day, 1hour, 30min, or 10min"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(
        "Validation errors in update notification preferences:",
        errors.array()
      );
      return res.status(400).json({ errors: errors.array() });
    }

    const { enabled, methods, timings } = req.body;
    const userId = req.user.userId;

    try {
      const user = await User.findById(userId);
      if (!user) {
        logger.warn(`User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      user.notificationPreferences = {
        enabled,
        methods: methods.length ? methods : ["email"],
        timings: timings.length ? timings : ["10min"],
      };
      await user.save();

      logger.info(`Notification preferences updated for user: ${userId}`);
      res.json({ message: "Notification preferences updated successfully" });
    } catch (error) {
      logger.error("Update notification preferences error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

module.exports = router;
