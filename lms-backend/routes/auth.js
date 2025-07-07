const express = require("express");
const router = express.Router();
const { check, validationResult } = require("express-validator");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Admin = require("../models/Admin");
const Notification = require("../models/Notification");
const {
  sendEmailOTP,
  sendRegistrationEmail,
  sendTimezoneSetupEmail,
  sendLoginOTP,
} = require("../services/emailService");
const {
  sendSMSOTP,
  sendRegistrationSMS,
  sendLoginSMSOTP,
} = require("../services/smsService");
const { otpLimiter } = require("../middleware/rateLimit");
const logger = require("../utils/logger");
const { redisClient } = require("../config/redis");
const mongoose = require("mongoose");
const authenticate = require("../middleware/auth");
const { getIO } = require("../config/socket");
const upload = require("../config/multer");
const { uploadImage } = require("../config/cloudinary");
const fs = require("fs").promises;

// Generate OTP
const generateOTP = () => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  return otp.padStart(6, "0");
};

const acquireLock = async (key, timeout = 5000) => {
  const lockKey = `lock:${key}`;
  const result = await redisClient.set(lockKey, "locked", {
    NX: true,
    PX: timeout,
  });
  return result === "OK";
};

const releaseLock = async (key) => {
  const lockKey = `lock:${key}`;
  await redisClient.del(lockKey);
};

// Signup
router.post(
  "/signup",
  [
    check("name")
      .matches(/^[A-Za-z\s]+$/)
      .withMessage("Name must contain only alphabets and spaces"),
    check("email").isEmail().withMessage("Valid email is required"),
    check("phone")
      .matches(/^\+[1-9]\d{1,14}$/)
      .withMessage("Valid phone number is required"),
    check("gender")
      .isIn(["male", "female", "other"])
      .withMessage("Gender must be 'male', 'female', or 'other'"),
  ],
  otpLimiter,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in signup:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, phone, gender } = req.body;

    try {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        logger.warn(`User with email already registered: ${email}`);
        return res
          .status(400)
          .json({ errors: [{ msg: "User with email already registered" }] });
      }

      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        logger.warn(`User with phone already registered: ${phone}`);
        return res.status(400).json({
          errors: [{ msg: "User with phone number already registered" }],
        });
      }

      const adminUsers = await Admin.find().populate("userId");
      const existingEmailAdmin = adminUsers.find(
        (admin) => admin.userId?.email === email
      );
      if (existingEmailAdmin) {
        return res
          .status(400)
          .json({ errors: [{ msg: "User with email already registered" }] });
      }

      const existingPhoneAdmin = adminUsers.find(
        (admin) => admin.userId?.phone === phone
      );
      if (existingPhoneAdmin) {
        logger.warn(`User with phone already registered: ${phone}`);
        return res.status(400).json({
          errors: [{ msg: "User with phone number already registered" }],
        });
      }

      const verificationId = new mongoose.Types.ObjectId().toString();
      const emailOTP = generateOTP();
      const phoneOTP = generateOTP();

      const userData = JSON.stringify({ name, email, phone, gender });
      await redisClient.setEx(`pending_user:${verificationId}`, 300, userData);
      await redisClient.setEx(`otp:email:${email}`, 300, emailOTP);
      await redisClient.setEx(`otp:phone:${phone}`, 300, phoneOTP);

      await Promise.all([
        sendEmailOTP(email, emailOTP, name),
        sendSMSOTP(phone, phoneOTP, name),
      ]);

      logger.info(`User signup initiated: ${email}`);
      res.json({
        message: "OTPs sent. Verify to complete registration",
        verificationId,
      });
    } catch (error) {
      logger.error("Signup error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Verify OTP
router.post(
  "/verify-otp",
  [
    check("verificationId")
      .isString()
      .withMessage("Valid verification ID is required"),
    check("emailOTP")
      .matches(/^\d{6}$/)
      .withMessage("Email OTP must be a 6-digit number"),
    check("phoneOTP")
      .matches(/^\d{6}$/)
      .withMessage("Phone OTP must be a 6-digit number"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in verify-otp:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { verificationId, emailOTP, phoneOTP } = req.body;

    try {
      const userData = await redisClient.get(`pending_user:${verificationId}`);
      if (!userData) {
        logger.warn(
          `No pending registration found for verificationId: ${verificationId}`
        );
        return res
          .status(404)
          .json({ message: "No pending registration found or it has expired" });
      }

      let parsedData;
      try {
        parsedData = JSON.parse(userData);
      } catch (e) {
        logger.error("Invalid userData format in Redis:", e);
        return res.status(500).json({ message: "Invalid data format" });
      }
      const { name, email, phone, gender } = parsedData;

      const storedEmailOTP = await redisClient.get(`otp:email:${email}`);
      const storedPhoneOTP = await redisClient.get(`otp:phone:${phone}`);

      if (storedEmailOTP !== emailOTP || storedPhoneOTP !== phoneOTP) {
        logger.warn(`Invalid OTPs for verificationId: ${verificationId}`);
        return res.status(400).json({ message: "Invalid OTPs" });
      }

      const defaultProfileImages = {
        male: "https://res.cloudinary.com/dlie87ah0/image/upload/v1746686671/male_nwqqzv.jpg",
        female:
          "https://res.cloudinary.com/dlie87ah0/image/upload/v1746686671/female_ymrpbf.jpg",
        other:
          "https://res.cloudinary.com/dlie87ah0/image/upload/v1746686670/small_f1yzjb.png",
      };
      const profileImage = defaultProfileImages[gender];

      const user = new User({
        name,
        email,
        phone,
        gender,
        joinDate: new Date(),
        isFirstLogin: true,
        profileImage,
      });
      await user.save();

      const admins = await Admin.find().populate({
        path: "userId",
        select: "_id email name",
      });

      if (admins.length === 0) {
        logger.warn("No admins found in the Admin collection");
      }

      const adminNotifications = admins.map(async (admin) => {
        if (!admin.userId || !admin.userId._id) {
          logger.warn(`Invalid or missing userId for admin: ${admin._id}`);
          return Promise.resolve();
        }
        try {
          const notification = await new Notification({
            userId: admin.userId._id,
            message: `New user ${name} registered. Please assign a role.`,
            link: `${process.env.BASE_URL}/admin/assign-role/${user._id}`,
          }).save();
          await sendAdminNotificationEmail(
            admin.userId.email,
            name,
            user._id,
            `New user ${name} registered. Please assign a role.`
          );
          getIO()
            .to(admin.userId._id.toString())
            .emit("notification", {
              message: `New user ${name} registered. Please assign a role.`,
              link: `${process.env.BASE_URL}/admin/assign-role/${user._id}`,
            });
          logger.info(
            `Notification and email sent to admin: ${admin.userId.email}`
          );
        } catch (error) {
          logger.error(
            `Failed to send notification/email to admin ${admin.userId.email}:`,
            error
          );
        }
      });

      await Promise.all([
        redisClient.del(`pending_user:${verificationId}`),
        redisClient.del(`otp:email:${email}`),
        redisClient.del(`otp:phone:${phone}`),
        sendRegistrationEmail(email, name),
        sendRegistrationSMS(phone, name),
        ...adminNotifications,
      ]);

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
        expiresIn: "7d",
      });
      await redisClient.setEx(`session:${user._id}`, 7 * 24 * 3600, token);

      const verifiedUserData = {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        gender: user.gender,
        role: null,
        profileImage: user.profileImage,
        joinDate: user.joinDate,
        isFirstLogin: user.isFirstLogin,
      };

      logger.info(`User registered: ${email}`);
      res.json({
        message: "Registration successful",
        token,
        user: verifiedUserData,
      });
    } catch (error) {
      logger.error("Verify OTP error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

//Login
router.post(
  "/login",
  [
    check("identifier").custom((value) => {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      const isPhone = /^\+[1-9]\d{1,14}$/.test(value);
      if (!isEmail && !isPhone) {
        throw new Error(
          "Identifier must be a valid email or phone number starting with + followed by 1-14 digits"
        );
      }
      return true;
    }),
  ],
  otpLimiter,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in login:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { identifier } = req.body;
    const deviceId = req.header("Device-Id") || "unknown";

    try {
      let user = await User.findOne({
        $or: [{ email: identifier }, { phone: identifier }],
      });

      if (!user) {
        const errorMsg = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)
          ? "Email is not registered"
          : "Phone number is not registered";
        logger.warn(`${errorMsg}: ${identifier}`);
        return res.status(404).json({ errors: [{ msg: errorMsg }] });
      }

      // Check for existing session
      const sessionToken = await redisClient.get(
        `session:${user._id}:${deviceId}`
      );
      if (sessionToken) {
        logger.info(
          `Active session found for user: ${user._id}, redirecting to direct login`
        );
        return res.json({
          message: "Active session found, please use direct login",
          token: sessionToken,
          userId: user._id,
        });
      }

      const loginOTP = generateOTP();
      const loginMethod = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)
        ? "email"
        : "phone";
      await redisClient.setEx(
        `login:method:${user._id}:${deviceId}`,
        300,
        loginMethod
      );

      if (loginMethod === "email") {
        await redisClient.setEx(`otp:login:${user.email}`, 300, loginOTP);
        await sendLoginOTP(user.email, loginOTP, user.name);
      } else {
        await redisClient.setEx(`otp:login:${user.phone}`, 300, loginOTP);
        await sendLoginSMSOTP(user.phone, loginOTP, user.name);
      }

      logger.info(`Login OTP sent to ${identifier}`);
      res.json({ message: "OTP sent for login", userId: user._id });
    } catch (error) {
      logger.error("Login error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Verify Login OTP
router.post(
  "/verify-login-otp",
  [
    check("userId").isMongoId().withMessage("Valid user ID is required"),
    check("otp")
      .matches(/^\d{6}$/)
      .withMessage("OTP must be a 6-digit number"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in verify-login-otp:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId, otp } = req.body;
    const deviceId = req.header("Device-Id") || "unknown";
    const lockKey = `login:${userId}:${deviceId}`;

    try {
      const lockAcquired = await acquireLock(lockKey);
      if (!lockAcquired) {
        logger.warn(
          `Failed to acquire lock for user ${userId}, device ${deviceId}`
        );
        return res
          .status(429)
          .json({ message: "Too many login attempts, please try again" });
      }

      try {
        const user = await User.findById(userId).populate("role");
        if (!user) {
          logger.warn(`User not found: ${userId}`);
          return res.status(404).json({ message: "User not found" });
        }

        const storedOTP =
          (await redisClient.get(`otp:login:${user.email}`)) ||
          (await redisClient.get(`otp:login:${user.phone}`));
        if (storedOTP !== otp) {
          logger.warn(`Invalid login OTP for user: ${userId}`);
          return res.status(400).json({ message: "Invalid OTP" });
        }

        await Promise.all([
          redisClient.del(`otp:login:${user.email}`),
          redisClient.del(`otp:login:${user.phone}`),
          redisClient.del(`login:method:${userId}:${deviceId}`),
        ]);

        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
          expiresIn: "7d",
        });
        await redisClient.setEx(
          `session:${user._id}:${deviceId}`,
          7 * 24 * 3600,
          token
        );

        let role = null;
        const admin = await Admin.findOne({ userId: user._id });
        if (admin) {
          role = { roleName: admin.role };
        } else if (user.role) {
          role = { roleName: user.role.roleName };
        }

        const loginUserData = {
          _id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          gender: user.gender,
          role,
          profileImage: user.profileImage,
          subjects: user.subjects,
          timezone: user.timezone,
          isTimezoneSet: user.isTimezoneSet,
          address: user.address,
          joinDate: user.joinDate,
          studentId: user.studentId,
          employeeId: user.employeeId,
          isFirstLogin: user.isFirstLogin,
          profile: user.profile,
        };

        logger.info(`User logged in: ${user.email}`);
        res.json({ message: "Login successful", token, user: loginUserData });
      } finally {
        await releaseLock(lockKey);
      }
    } catch (error) {
      logger.error("Verify login OTP error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Resend OTP
router.post(
  "/resend-otp",
  [
    check("verificationId")
      .isString()
      .withMessage("Valid verification ID is required"),
    check("method")
      .isIn(["email", "phone"])
      .withMessage("Method must be 'email' or 'phone'"),
  ],
  otpLimiter,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in resend-otp:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { verificationId, method } = req.body;

    try {
      const userData = await redisClient.get(`pending_user:${verificationId}`);
      if (!userData) {
        logger.warn(
          `No pending registration found for verificationId: ${verificationId}`
        );
        return res
          .status(404)
          .json({ message: "No pending registration found or it has expired" });
      }

      let parsedData;
      try {
        parsedData = JSON.parse(userData);
      } catch (e) {
        logger.error("Invalid userData format in Redis:", e);
        return res.status(500).json({ message: "Invalid data format" });
      }
      const { name, email, phone } = parsedData;

      const newOTP = generateOTP();
      if (method === "email") {
        await redisClient.setEx(`otp:email:${email}`, 300, newOTP);
        await sendEmailOTP(email, newOTP, name);
      } else {
        await redisClient.setEx(`otp:phone:${phone}`, 300, newOTP);
        await sendSMSOTP(phone, newOTP, name);
      }

      logger.info(
        `OTP resent via ${method} for verificationId: ${verificationId}`
      );
      res.json({ message: `OTP resent to ${method}` });
    } catch (error) {
      logger.error("Resend OTP error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Resend Login OTP
router.post(
  "/resend-login-otp",
  [check("userId").isMongoId().withMessage("Valid user ID is required")],
  otpLimiter,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in resend-login-otp:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId } = req.body;
    const deviceId = req.header("Device-Id") || "unknown";

    try {
      const user = await User.findById(userId);
      if (!user) {
        logger.warn(`User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      const loginMethod = await redisClient.get(
        `login:method:${userId}:${deviceId}`
      );
      if (!loginMethod) {
        logger.warn(
          `Login method not found for user: ${userId}, device: ${deviceId}`
        );
        return res.status(400).json({
          message: "No active login attempt found. Please start a new login.",
        });
      }

      const loginOTP = generateOTP();

      if (loginMethod === "email") {
        await redisClient.setEx(`otp:login:${user.email}`, 300, loginOTP);
        await sendLoginOTP(user.email, loginOTP, user.name);
      } else {
        await redisClient.setEx(`otp:login:${user.phone}`, 300, loginOTP);
        await sendLoginSMSOTP(user.phone, loginOTP, user.name);
      }

      logger.info(`Resent login OTP for user: ${userId} via ${loginMethod}`);
      res.json({
        message: `New login OTP sent successfully via ${loginMethod}`,
        userId,
      });
    } catch (error) {
      logger.error("Resend login OTP error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

router.post("/direct-login", async (req, res) => {
  try {
    const deviceId = req.header("Device-Id") || "unknown";
    const token = req.header("Authorization")?.replace("Bearer ", "");
    const lockKey = `login:${deviceId}`;

    if (!token) {
      logger.warn(`No token provided for device: ${deviceId}`);
      return res.status(401).json({ errors: [{ msg: "No token provided" }] });
    }

    let userId;
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      userId = decoded.userId;
      logger.debug(`JWT verified for user: ${userId}, device: ${deviceId}`);
    } catch (error) {
      logger.warn(`Invalid token for device: ${deviceId}`, {
        error: error.message,
      });
      return res
        .status(401)
        .json({ errors: [{ msg: "Invalid or expired token" }] });
    }

    const lockAcquired = await acquireLock(lockKey);
    if (!lockAcquired) {
      logger.warn(
        `Failed to acquire lock for user ${userId}, device ${deviceId}`
      );
      return res
        .status(429)
        .json({ message: "Too many login attempts, please try again" });
    }

    try {
      const sessionToken = await redisClient.get(
        `session:${userId}:${deviceId}`
      );
      if (!sessionToken) {
        logger.warn(
          `No active session for user: ${userId}, device: ${deviceId}`,
          {
            sessionTokenExists: !!sessionToken,
          }
        );
        return res.status(401).json({ errors: [{ msg: "Session expired" }] });
      }

      if (
        sessionToken === token &&
        decoded.exp > Math.floor(Date.now() / 1000) + 24 * 3600
      ) {
        logger.debug(
          `Reusing existing token for user: ${userId}, device: ${deviceId}`
        );
        await redisClient.expire(
          `session:${userId}:${deviceId}`,
          7 * 24 * 3600
        );
      } else {
        const newToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
          expiresIn: "7d",
        });
        await redisClient.setEx(
          `session:${userId}:${deviceId}`,
          7 * 24 * 3600,
          newToken
        );
        logger.debug(
          `New token issued for user: ${userId}, device: ${deviceId}`
        );
        token = newToken;
      }

      const user = await User.findById(userId).populate("role").select("-__v");
      if (!user) {
        logger.warn(`User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      let role = null;
      const admin = await Admin.findOne({ userId: user._id });
      if (admin) {
        role = { roleName: admin.role };
      } else if (user.role) {
        role = { roleName: user.role.roleName };
      }

      const directLoginUserData = {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        gender: user.gender,
        role,
        profileImage: user.profileImage,
        subjects: user.subjects,
        timezone: user.timezone,
        isTimezoneSet: user.isTimezoneSet,
        address: user.address,
        joinDate: user.joinDate,
        studentId: user.studentId,
        employeeId: user.employeeId,
        isFirstLogin: user.isFirstLogin,
        profile: user.profile,
      };

      logger.info(
        `Direct login successful for user: ${user.email}, device: ${deviceId}`
      );
      res.json({
        message: "Direct login successful",
        user: directLoginUserData,
        token,
      });
    } finally {
      await releaseLock(lockKey);
    }
  } catch (error) {
    logger.error("Direct login error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Timezone Setup
router.post(
  "/timezone-setup",
  authenticate,
  [
    check("timezone").isString().notEmpty().withMessage("Timezone is required"),
    check("preferredTimeSlots")
      .isArray()
      .withMessage("Preferred time slots must be an array")
      .custom((slots, { req }) => {
        const userRole = req.user.role?.roleName;
        if (userRole === "Student" && slots.length !== 1) {
          throw new Error("Students must select exactly one time slot");
        }
        return slots.every(
          (slot) => typeof slot === "string" && slot.match(/^\d{2}:\d{2}$/)
        );
      })
      .withMessage("Invalid time slot format"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in timezone-setup:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { timezone, preferredTimeSlots } = req.body;
    const userId = req.user.userId;

    try {
      const user = await User.findById(userId).populate("role");
      if (!user) {
        logger.warn(`User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      user.timezone = timezone;
      user.preferredTimeSlots = preferredTimeSlots;
      user.isTimezoneSet = true;
      user.isFirstLogin = false;
      await user.save();

      const userRole = user.role ? user.role.roleName : "User";
      const admins = await Admin.find().populate({
        path: "userId",
        select: "_id email name",
      });

      const notifications = admins.map(async (admin) => {
        if (!admin.userId || !admin.userId._id) {
          logger.warn(`Invalid or missing userId for admin: ${admin._id}`);
          return Promise.resolve();
        }
        try {
          const notification = await new Notification({
            userId: admin.userId._id,
            message: `User ${
              user.name
            } has set their timezone to ${timezone} and preferred time slot${
              preferredTimeSlots.length > 1 ? "s" : ""
            }: ${preferredTimeSlots.join(", ")}.`,
            link: `${process.env.BASE_URL}/admin/users/${user._id}`,
          }).save();
          await sendTimezoneSetupEmail(
            admin.userId.email,
            user.name,
            user._id,
            userRole,
            timezone,
            preferredTimeSlots
          );
          getIO()
            .to(admin.userId._id.toString())
            .emit("notification", {
              message: `User ${
                user.name
              } has set their timezone to ${timezone} and preferred time slot${
                preferredTimeSlots.length > 1 ? "s" : ""
              }: ${preferredTimeSlots.join(", ")}.`,
              link: `${process.env.BASE_URL}/admin/users/${user._id}`,
            });
          logger.info(`Notification sent to admin: ${admin.userId.email}`);
        } catch (error) {
          logger.error(
            `Failed to send notification to admin ${admin.userId.email}:`,
            error
          );
        }
      });

      await Promise.all(notifications);

      logger.info(`Timezone and time slots set for user: ${userId}`);
      res.json({ message: "Timezone and time slots set successfully" });
    } catch (error) {
      logger.error("Timezone setup error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Update Profile
router.put(
  "/update",
  authenticate,
  [
    check("name")
      .optional()
      .matches(/^[A-Za-z\s]+$/)
      .withMessage("Name must contain only alphabets and spaces"),
    check("email").optional().isEmail().withMessage("Valid email is required"),
    check("phone")
      .optional()
      .matches(/^\+[1-9]\d{1,14}$/)
      .withMessage("Valid phone number is required"),
    check("gender")
      .optional()
      .isIn(["male", "female", "other"])
      .withMessage("Gender must be 'male', 'female', or 'other'"),
    check("address")
      .optional()
      .isString()
      .withMessage("Address must be a string"),
    check("subjects")
      .optional()
      .isArray()
      .withMessage("Subjects must be an array"),
    check("preferredTimeSlots")
      .optional()
      .isArray()
      .withMessage("Preferred time slots must be an array"),
    check("profile.bio")
      .optional()
      .isString()
      .withMessage("Bio must be a string"),
    check("profile.hobbies")
      .optional()
      .isArray()
      .withMessage("Hobbies must be an array"),
    check("profile.skills")
      .optional()
      .isArray()
      .withMessage("Skills must be an array"),
    check("profile.about")
      .optional()
      .isString()
      .withMessage("About must be a string"),
    check("profile.accomplishments")
      .optional()
      .isArray()
      .withMessage("Accomplishments must be an array"),
    check("profile.qualifications")
      .optional()
      .isArray()
      .withMessage("Qualifications must be an array"),
    check("profile.enrollmentStatus")
      .optional()
      .isIn(["Active", "Inactive"])
      .withMessage("Enrollment status must be 'Active' or 'Inactive'"),
    check("profile.academicYear")
      .optional()
      .isString()
      .withMessage("Academic year must be a string"),
    check("profile.experience")
      .optional()
      .isArray()
      .withMessage("Experience must be an array"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in update:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.userId;
    const updateData = req.body;

    try {
      const user = await User.findById(userId);
      if (!user) {
        logger.warn(`User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      if (updateData.email && updateData.email !== user.email) {
        const existingEmail = await User.findOne({ email: updateData.email });
        if (existingEmail) {
          return res.status(400).json({ message: "Email already in use" });
        }
      }
      if (updateData.phone && updateData.phone !== user.phone) {
        const existingPhone = await User.findOne({ phone: updateData.phone });
        if (existingPhone) {
          return res
            .status(400)
            .json({ message: "Phone number already in use" });
        }
      }
      Object.assign(user, {
        name: updateData.name || user.name,
        email: updateData.email || user.email,
        phone: updateData.phone || user.phone,
        gender: updateData.gender || user.gender,
        address: updateData.address || user.address,
        subjects: updateData.subjects || user.subjects,
        preferredTimeSlots:
          updateData.preferredTimeSlots || user.preferredTimeSlots,
        profile: {
          ...user.profile,
          bio: updateData.profile?.bio || user.profile.bio,
          hobbies: updateData.profile?.hobbies || user.profile.hobbies,
          skills: updateData.profile?.skills || user.profile.skills,
          about: updateData.profile?.about || user.profile.about,
          accomplishments:
            updateData.profile?.accomplishments || user.profile.accomplishments,
          qualifications:
            updateData.profile?.qualifications || user.profile.qualifications,
          enrollmentStatus:
            updateData.profile?.enrollmentStatus ||
            user.profile.enrollmentStatus,
          academicYear:
            updateData.profile?.academicYear || user.profile.academicYear,
          experience: updateData.profile?.experience || user.profile.experience,
        },
      });

      await user.save();

      logger.info(`Profile updated for user: ${userId}`);
      res.json({ message: "Profile updated successfully", user });
    } catch (error) {
      logger.error("Update profile error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Update Profile Image
router.post(
  "/update-image",
  authenticate,
  upload.single("profileImage"),
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const file = req.file;

      if (!file) {
        logger.warn(`No file uploaded for user: ${userId}`);
        return res.status(400).json({ message: "No file uploaded" });
      }

      const user = await User.findById(userId);
      if (!user) {
        logger.warn(`User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      const uploadResult = await uploadImage(file.path);
      user.profileImage = uploadResult.url;
      await user.save();

      await fs.unlink(file.path);

      logger.info(`Profile image updated for user: ${userId}`);
      res.json({
        message: "Profile image updated successfully",
        profileImage: user.profileImage,
      });
    } catch (error) {
      logger.error("Update profile image error:", error);
      if (req.file?.path) {
        await fs
          .unlink(req.file.path)
          .catch((err) =>
            logger.error(`Failed to delete file: ${err.message}`)
          );
      }
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

//Me
router.get("/me", authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const deviceId = req.header("Device-Id") || "unknown";

    const newToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    await redisClient.setEx(
      `session:${userId}:${deviceId}`,
      7 * 24 * 3600,
      newToken
    );
    logger.debug(
      `New token issued and stored for user: ${userId}, device: ${deviceId}`
    );

    const user = await User.findById(userId).populate("role").select("-__v");
    if (!user) {
      logger.warn(`User not found: ${userId}`);
      return res.status(404).json({ message: "User not found" });
    }

    let role = null;
    const admin = await Admin.findOne({ userId: user._id });
    if (admin) {
      role = { roleName: admin.role };
    } else if (user.role) {
      role = { roleName: user.role.roleName };
    }

    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      gender: user.gender,
      role,
      profileImage: user.profileImage,
      subjects: user.subjects,
      timezone: user.timezone,
      isTimezoneSet: user.isTimezoneSet,
      address: user.address,
      joinDate: user.joinDate,
      studentId: user.studentId,
      employeeId: user.employeeId,
      isFirstLogin: user.isFirstLogin,
      preferredTimeSlots: user.preferredTimeSlots,
      profile: user.profile,
      teacherId: user.teacherId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    logger.info(`User data fetched and new token issued for: ${user.email}`);
    res.json({ user: userData, token: newToken });
  } catch (error) {
    logger.error("Fetch user error in /me:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

//Get all Teachers
router.get("/teachers", authenticate, async (req, res) => {
  const adminId = req.user.userId;

  try {
    const admin = await Admin.findOne({ userId: adminId });
    if (!admin) {
      logger.warn(`Unauthorized access attempt by user: ${adminId}`);
      return res.status(403).json({ message: "Not authorized" });
    }

    const teachers = await User.find({
      role: { $exists: true },
    })
      .populate({
        path: "role",
        match: { roleName: "Teacher" },
        select: "_id",
      })
      .select(
        "_id name email phone gender profileImage subjects preferredTimeSlots isTimezoneSet address joinDate isFirstLogin teacherId profile createdAt updatedAt employeeId role studentId timezone"
      )
      .lean();

    const filteredTeachers = teachers.filter((teacher) => teacher.role);

    logger.info(`Teachers fetched by admin: ${adminId}`);
    res.json({ teachers: filteredTeachers });
  } catch (error) {
    logger.error("Get teachers error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get Teacher by ID (Accessible to Authenticated Users)
router.get(
  "/teacher/:teacherId",
  authenticate,
  [check("teacherId").isMongoId().withMessage("Valid teacher ID is required")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in get-teacher:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { teacherId } = req.params;
    const userId = req.user.userId;

    try {
      const user = await User.findById(userId).populate("role");
      if (!user) {
        logger.warn(`User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      const teacher = await User.findById(teacherId)
        .populate({
          path: "role",
          match: { roleName: "Teacher" },
          select: "_id",
        })
        .select("_id name")
        .lean();

      if (!teacher || !teacher.role) {
        logger.warn(`Teacher not found or not a teacher: ${teacherId}`);
        return res.status(404).json({ message: "Teacher not found" });
      }

      logger.info(
        `Teacher data fetched for teacherId: ${teacherId} by user: ${userId}`
      );
      res.json({ teacher });
    } catch (error) {
      logger.error("Get teacher error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

router.post(
  "/sync-device",
  [
    check("deviceId")
      .isString()
      .notEmpty()
      .withMessage("Valid Device-Id is required")
      .custom((value, { req }) => {
        if (value !== req.header("Device-Id")) {
          throw new Error("Device-Id in body must match Device-Id header");
        }
        return true;
      }),
  ],
  authenticate,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in sync-device:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { deviceId } = req.body;
    const userId = req.user.userId;
    const token = req.header("Authorization")?.replace("Bearer ", "");

    try {
      if (!token) {
        logger.warn(
          `No token provided for user: ${userId}, device: ${deviceId}`
        );
        return res.status(401).json({ errors: [{ msg: "No token provided" }] });
      }

      try {
        await redisClient.setEx(
          `session:${userId}:${deviceId}`,
          7 * 24 * 3600,
          token
        );
        logger.debug(`Session synced for user: ${userId}, device: ${deviceId}`);
      } catch (redisError) {
        logger.error("Redis error during session sync:", redisError);
        return res
          .status(503)
          .json({ errors: [{ msg: "Service temporarily unavailable" }] });
      }

      logger.info(
        `Device synced successfully for user: ${userId}, device: ${deviceId}`
      );
      res.json({ message: "Device synced successfully" });
    } catch (error) {
      logger.error("Sync device error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

router.post(
  "/renew-token",
  [
    check("userId").isMongoId().withMessage("Valid user ID is required"),
    check("deviceId")
      .isString()
      .notEmpty()
      .withMessage("Valid Device-Id is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in renew-token:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId, deviceId } = req.body;
    const lockKey = `login:${userId}:${deviceId}`;

    try {
      const lockAcquired = await acquireLock(lockKey);
      if (!lockAcquired) {
        logger.warn(
          `Failed to acquire lock for user ${userId}, device ${deviceId}`
        );
        return res
          .status(429)
          .json({
            message: "Too many token renewal attempts, please try again",
          });
      }

      try {
        const user = await User.findById(userId).select("_id updatedAt");
        if (!user) {
          logger.warn(`User not found for token renewal: ${userId}`);
          return res.status(404).json({ message: "User not found" });
        }

        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        if (user.updatedAt < thirtyDaysAgo) {
          logger.warn(`User inactive for token renewal: ${userId}`);
          return res
            .status(401)
            .json({ errors: [{ msg: "User account inactive" }] });
        }

        const newToken = jwt.sign({ userId }, process.env.JWT_SECRET, {
          expiresIn: "7d",
        });
        await redisClient.setEx(
          `session:${userId}:${deviceId}`,
          7 * 24 * 3600,
          newToken
        );
        logger.debug(`Token renewed for user: ${userId}, device: ${deviceId}`);

        logger.info(
          `Token renewed successfully for user: ${userId}, device: ${deviceId}`
        );
        res.json({ message: "Token renewed successfully", token: newToken });
      } finally {
        await releaseLock(lockKey);
      }
    } catch (error) {
      logger.error("Renew token error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

router.post("/logout", authenticate, async (req, res) => {
  const userId = req.user.userId;
  const deviceId = req.header("Device-Id") || "unknown";

  try {
    await redisClient.del(`session:${userId}:${deviceId}`);
    logger.info(`User logged out: ${userId}, device: ${deviceId}`);
    res.json({ message: "Logout successful" });
  } catch (error) {
    logger.error("Logout error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;
