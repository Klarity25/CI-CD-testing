// const express = require("express");
// const router = express.Router();
// const { check, validationResult } = require("express-validator");
// const authenticate = require("../middleware/auth");
// const Admin = require("../models/Admin");
// const Role = require("../models/Role");
// const Notification = require("../models/Notification");
// const User = require("../models/User");
// const logger = require("../utils/logger");
// const {
//   sendAdminNotificationEmail,
//   sendRegistrationEmail,
//   sendRoleAssignmentEmail,
// } = require("../services/emailService");
// const {
//   sendRoleAssignmentSMS,
//   sendAdminNotificationSMS,
// } = require("../services/smsService");
// const { getIO } = require("../config/socket");

// const generateUniqueId = async (suffix, model, field) => {
//   let id;
//   let isUnique = false;
//   while (!isUnique) {
//     const randomNum = Math.floor(1000 + Math.random() * 9000);
//     id = `KLARITY${randomNum}${suffix}`;
//     const existing = await model.findOne({ [field]: id });
//     if (!existing) isUnique = true;
//   }
//   return id;
// };

// router.use(authenticate);

// // Assign Role and Subjects
// router.post(
//   "/assign-role",
//   [
//     check("userId").isMongoId().withMessage("Valid user ID is required"),
//     check("roleName")
//       .isIn(["Admin", "Teacher", "Student", "Super Admin"])
//       .withMessage("Role must be Admin, Teacher, Student, or Super Admin"),
//     check("subjects")
//       .optional()
//       .isArray()
//       .withMessage("Subjects must be an array")
//       .custom((subjects) => {
//         if (subjects) {
//           const validSubjects = [
//             "Phonics",
//             "Creative Writing",
//             "Public Speaking",
//           ];
//           return subjects.every((subject) => validSubjects.includes(subject));
//         }
//         return true;
//       })
//       .withMessage("Invalid subjects provided"),
//     check("teacherId")
//       .optional()
//       .isMongoId()
//       .withMessage("Valid teacher ID is required for student role"),
//   ],
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       logger.warn("Validation errors in assign-role:", errors.array());
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const { userId, roleName, subjects, teacherId } = req.body;
//     const adminId = req.user?.userId;

//     if (!adminId) {
//       logger.error("No adminId found in req.user");
//       return res.status(401).json({ message: "Authentication failed" });
//     }

//     try {
//       const admin = await Admin.findOne({ userId: adminId }).populate(
//         "userId",
//         "_id email name phone"
//       );
//       if (!admin || !admin.userId) {
//         logger.warn(`Unauthorized access attempt by user: ${adminId}`);
//         return res.status(403).json({ message: "Not authorized" });
//       }

//       if (["Admin", "Super Admin"].includes(roleName) && !admin.isSuperAdmin) {
//         logger.warn(
//           `Non-super admin ${adminId} attempted to assign ${roleName} role`
//         );
//         return res
//           .status(403)
//           .json({ message: `Only Super Admins can assign ${roleName} role` });
//       }

//       const user = await User.findById(userId);
//       if (!user) {
//         logger.warn(`User not found: ${userId}`);
//         return res.status(404).json({ message: "User not found" });
//       }

//       let teacherName = "";
//       if (roleName === "Student" && teacherId) {
//         const teacher = await User.findById(teacherId).populate("role");
//         if (!teacher || teacher.role?.roleName !== "Teacher") {
//           logger.warn(`Invalid teacher ID: ${teacherId}`);
//           return res.status(400).json({ message: "Invalid teacher ID" });
//         }
//         if (
//           !subjects ||
//           !subjects.every((subject) => teacher.subjects.includes(subject))
//         ) {
//           logger.warn(
//             `Teacher ${teacherId} does not teach all selected subjects: ${subjects}`
//           );
//           return res
//             .status(400)
//             .json({ message: "Teacher does not teach all selected subjects" });
//         }
//         user.teacherId = teacherId;
//         teacherName = teacher.name;
//       } else if (roleName === "Student" && !teacherId) {
//         logger.warn(`Teacher ID required for student role assignment`);
//         return res
//           .status(400)
//           .json({ message: "Teacher ID is required for student role" });
//       }

//       const existingRole = await Role.findOne({ userId });
//       if (existingRole) {
//         if (
//           existingRole.roleName === roleName &&
//           JSON.stringify(user.subjects) === JSON.stringify(subjects || [])
//         ) {
//           logger.warn(
//             `User ${userId} already has role: ${roleName} with same subjects`
//           );
//           return res
//             .status(400)
//             .json({
//               message: `User already has ${roleName} role with specified subjects`,
//             });
//         }
//         existingRole.roleName = roleName;
//         existingRole.assignedBy = admin._id;
//         await existingRole.save();
//       } else {
//         const role = new Role({ userId, roleName, assignedBy: admin._id });
//         await role.save();
//         user.role = role._id;
//       }

//       if (roleName === "Student") {
//         user.studentId = await generateUniqueId("S", User, "studentId");
//         user.employeeId = undefined;
//       } else if (roleName === "Teacher") {
//         user.employeeId = await generateUniqueId("T", User, "employeeId");
//         user.studentId = undefined;
//       } else if (["Admin", "Super Admin"].includes(roleName)) {
//         user.employeeId = await generateUniqueId("D", User, "employeeId");
//         user.studentId = undefined;
//       } else {
//         user.studentId = undefined;
//         user.employeeId = undefined;
//       }

//       if (["Teacher", "Student"].includes(roleName)) {
//         user.subjects = subjects || [];
//       } else {
//         user.subjects = [];
//       }
//       await user.save();

//       if (["Admin", "Super Admin"].includes(roleName)) {
//         const existingAdmin = await Admin.findOne({ userId });
//         if (!existingAdmin) {
//           const newAdmin = new Admin({
//             userId,
//             role: roleName,
//             isSuperAdmin: roleName === "Super Admin",
//           });
//           await newAdmin.save();
//         } else if (existingAdmin.role !== roleName) {
//           existingAdmin.role = roleName;
//           existingAdmin.isSuperAdmin = roleName === "Super Admin";
//           await newAdmin.save();
//         }
//       }

//       const admins = await Admin.find().populate({
//         path: "userId",
//         select: "_id email name phone",
//       });

//       const requestingAdmin = admins.find(
//         (admin) => admin.userId?._id.toString() === adminId.toString()
//       );
//       const adminRole = requestingAdmin ? requestingAdmin.role : "Unknown Admin";

//       const notifications = [
//         new Notification({
//           userId,
//           message: `You have been assigned the role: ${roleName}${
//             subjects ? ` with subjects: ${subjects.join(", ")}` : ""
//           }${
//             teacherId ? ` and assigned to teacher: ${teacherName}` : ""
//           } by ${adminRole}`,
//         }).save(),
//         new Notification({
//           userId: adminId,
//           message: `Role ${roleName}${
//             subjects ? ` with subjects: ${subjects.join(", ")}` : ""
//           }${teacherId ? ` and teacher: ${teacherName}` : ""} assigned to ${
//             user.name
//           }`,
//         }).save(),
//         ...admins
//           .filter(
//             (admin) =>
//               admin.userId?._id && admin.userId._id.toString() !== adminId.toString()
//           )
//           .map((admin) =>
//             new Notification({
//               userId: admin.userId._id,
//               message: `User ${
//                 user.name
//               } has been assigned the role: ${roleName}${
//                 subjects ? ` with subjects: ${subjects.join(", ")}` : ""
//               }${teacherId ? ` and assigned to teacher: ${teacherName}` : ""}`,
//               link: `${process.env.BASE_URL}/admin/users/${user._id}`,
//             }).save()
//           ),
//       ];

//       await Promise.all(notifications);

//       const io = getIO();
//       io.to(userId).emit("notification", {
//         message: `You have been assigned the role: ${roleName}${
//           subjects ? ` with subjects: ${subjects.join(", ")}` : ""
//         }${
//           teacherId ? ` and assigned to teacher: ${teacherName}` : ""
//         } by ${adminRole}`,
//       });
//       io.to(adminId).emit("notification", {
//         message: `Role ${roleName}${
//           subjects ? ` with subjects: ${subjects.join(", ")}` : ""
//         }${teacherId ? ` and teacher: ${teacherName}` : ""} assigned to ${
//           user.name
//         }`,
//       });
//       admins
//         .filter(
//           (admin) =>
//             admin.userId?._id && admin.userId._id.toString() !== adminId.toString()
//         )
//         .forEach((admin) => {
//           io.to(admin.userId._id.toString()).emit("notification", {
//             message: `User ${
//               user.name
//             } has been assigned the role: ${roleName}${
//               subjects ? ` with subjects: ${subjects.join(", ")}` : ""
//             }${teacherId ? ` and assigned to teacher: ${teacherName}` : ""}`,
//             link: `${process.env.BASE_URL}/admin/users/${user._id}`,
//           });
//         });

//       const communications = [
//         sendRoleAssignmentEmail(
//           user.email,
//           user.name,
//           roleName,
//           adminRole,
//           subjects,
//           teacherId ? teacherName : undefined
//         ).catch((error) => {
//           logger.error(
//             `Failed to send role assignment email to ${user.email}:`,
//             error
//           );
//         }),
//         sendRoleAssignmentSMS(
//           user.phone,
//           user.name,
//           roleName,
//           adminRole,
//           subjects,
//           teacherId ? teacherName : undefined
//         ).catch((error) => {
//           logger.error(
//             `Failed to send role assignment SMS to ${user.phone}:`,
//             error
//           );
//         }),
//         sendRegistrationEmail(
//           user.email,
//           user.name,
//           `You have been assigned the role: ${roleName}${
//             subjects ? ` with subjects: ${subjects.join(", ")}` : ""
//           }${
//             teacherId ? ` and assigned to teacher: ${teacherName}` : ""
//           } by ${adminRole}. Login here: ${process.env.BASE_URL}/login`
//         ).catch((error) => {
//           logger.error(
//             `Failed to send registration email to ${user.email}:`,
//             error
//           );
//         }),
//         ...admins
//           .filter(
//             (admin) =>
//               admin.userId?.email && admin.userId._id.toString() !== adminId.toString()
//           )
//           .map((admin) => [
//             sendAdminNotificationEmail(
//               admin.userId.email,
//               user.name,
//               user._id,
//               `User ${user.name} has been assigned the role: ${roleName}${
//                 subjects ? ` with subjects: ${subjects.join(", ")}` : ""
//               }${teacherId ? ` and assigned to teacher: ${teacherName}` : ""}`
//             ).catch((error) => {
//               logger.error(
//                 `Failed to send admin notification email to ${admin.userId.email}:`,
//                 error
//               );
//             }),
//             sendAdminNotificationSMS(
//               admin.userId.phone,
//               user.name,
//               user._id,
//               `User ${user.name} has been assigned the role: ${roleName}${
//                 subjects ? ` with subjects: ${subjects.join(", ")}` : ""
//               }${teacherId ? ` and assigned to teacher: ${teacherName}` : ""}`
//             ).catch((error) => {
//               logger.error(
//                 `Failed to send admin notification SMS to ${admin.userId.phone}:`,
//                 error
//               );
//             }),
//           ])
//           .flat(),
//       ];

//       await Promise.all(communications);

//       logger.info(
//         `Role ${roleName}${
//           subjects ? ` with subjects: ${subjects.join(", ")}` : ""
//         }${
//           teacherId ? ` and teacher: ${teacherName}` : ""
//         } assigned to user: ${userId} by ${adminRole}`
//       );
//       res.json({ message: "Role and subjects assigned successfully" });
//     } catch (error) {
//       logger.error(`Assign role error for user ${userId}:`, error);
//       res.status(500).json({ message: "Server error", error: error.message });
//     }
//   }
// );

// // Get All Users
// router.get("/users", async (req, res) => {
//   const adminId = req.user.userId;
//   const page = parseInt(req.query.page) || 1;
//   const limit = parseInt(req.query.limit) || 10;
//   const role = req.query.role;

//   try {
//     const admin = await Admin.findOne({ userId: adminId });
//     if (!admin) {
//       logger.warn(`Unauthorized access attempt by user: ${adminId}`);
//       return res.status(403).json({ message: "Not authorized" });
//     }

//     let query = {};
//     if (role) {
//       const roleDocs = await Role.find({ roleName: role }).select("userId");
//       query._id = { $in: roleDocs.map((r) => r.userId) };
//     }

//     const users = await User.find(query)
//       .populate("role")
//       .populate("teacherId", "name email")
//       .populate("students", "name email")
//       .skip((page - 1) * limit)
//       .limit(limit);

//     const total = await User.countDocuments(query);

//     logger.info(`Users fetched by admin: ${adminId}, page: ${page}`);
//     res.json({
//       users,
//       total,
//       page,
//       pages: Math.ceil(total / limit),
//     });
//   } catch (error) {
//     logger.error("Get users error:", error);
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// });

// // Get Single User by ID
// router.get("/users/:id", async (req, res) => {
//   const adminId = req.user.userId;
//   const userId = req.params.id;

//   try {
//     const admin = await Admin.findOne({ userId: adminId });
//     if (!admin) {
//       logger.warn(`Unauthorized access attempt by user: ${adminId}`);
//       return res.status(403).json({ message: "Not authorized" });
//     }

//     const user = await User.findById(userId)
//       .populate("role")
//       .populate("teacherId", "name email subjects")
//       .populate("students", "name email studentId");

//     if (!user) {
//       logger.warn(`User not found: ${userId}`);
//       return res.status(404).json({ message: "User not found" });
//     }

//     logger.info(
//       `User details fetched for user: ${userId} by admin: ${adminId}`
//     );
//     res.json({ user });
//   } catch (error) {
//     logger.error(`Get user details error for user: ${userId}:`, error);
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// });

// // Create Admin
// router.post(
//   "/create-admin",
//   [
//     check("userId").isMongoId().withMessage("Valid user ID is required"),
//     check("isSuperAdmin")
//       .isBoolean()
//       .withMessage("isSuperAdmin must be a boolean"),
//     check("role")
//       .isIn(["Super Admin", "Admin"])
//       .withMessage("Role must be Super Admin or Admin")
//       .optional(),
//   ],
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       logger.warn("Validation errors in create-admin:", errors.array());
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const { userId, isSuperAdmin, role = "Admin" } = req.body;
//     const adminId = req.user.userId;

//     try {
//       const requestingAdmin = await Admin.findOne({ userId: adminId });
//       if (!requestingAdmin || !requestingAdmin.isSuperAdmin) {
//         logger.warn(`Unauthorized admin creation attempt by user: ${adminId}`);
//         return res.status(403).json({ message: "Not authorized" });
//       }

//       const user = await User.findById(userId);
//       if (!user) {
//         logger.warn(`User not found: ${userId}`);
//         return res.status(404).json({ message: "User not found" });
//       }

//       const adminRole = isSuperAdmin ? "Super Admin" : role;
//       let admin = await Admin.findOne({ userId });

//       if (admin) {
//         // Update existing admin entry
//         admin.role = adminRole;
//         admin.isSuperAdmin = isSuperAdmin;
//         await admin.save();
//         logger.info(`Updated admin role for user: ${userId} to ${adminRole}`);
//       } else {
//         // Create new admin entry
//         admin = new Admin({ userId, role: adminRole, isSuperAdmin });
//         await admin.save();
//         logger.info(`Created new admin for user: ${userId} with role ${adminRole}`);
//       }

//       // Update or create role entry
//       let existingRole = await Role.findOne({ userId });
//       if (!existingRole) {
//         const role = new Role({
//           userId,
//           roleName: adminRole,
//           assignedBy: requestingAdmin._id,
//         });
//         await role.save();
//         user.role = role._id;
//       } else if (existingRole.roleName !== adminRole) {
//         existingRole.roleName = adminRole;
//         existingRole.assignedBy = requestingAdmin._id;
//         await existingRole.save();
//       }

//       user.employeeId = await generateUniqueId("D", User, "employeeId");
//       user.subjects = [];
//       await user.save();

//       const admins = await Admin.find().populate({
//         path: "userId",
//         select: "_id email name phone",
//       });

//       const requestingAdminPopulated = admins.find(
//         (admin) => admin.userId._id.toString() === adminId.toString()
//       );
//       const adminRoleName = requestingAdminPopulated
//         ? requestingAdminPopulated.role
//         : "Unknown Admin";

//       const notifications = [
//         new Notification({
//           userId,
//           message: `You have been assigned the role: ${adminRole} by ${adminRoleName}`,
//         }).save(),
//         new Notification({
//           userId: adminId,
//           message: `Role ${adminRole} assigned to ${user.name}`,
//         }).save(),
//         ...admins
//           .filter(
//             (admin) =>
//               admin.userId &&
//               admin.userId._id &&
//               admin.userId._id.toString() !== adminId.toString()
//           )
//           .map((admin) =>
//             new Notification({
//               userId: admin.userId._id,
//               message: `User ${user.name} has been assigned the role: ${adminRole}`,
//               link: `${process.env.BASE_URL}/admin/users/${user._id}`,
//             }).save()
//           ),
//       ];

//       await Promise.all(notifications);

//       const io = getIO();
//       io.to(userId).emit("notification", {
//         message: `You have been assigned the role: ${adminRole} by ${adminRoleName}`,
//       });
//       io.to(adminId).emit("notification", {
//         message: `Role ${adminRole} assigned to ${user.name}`,
//       });
//       admins
//         .filter(
//           (admin) =>
//             admin.userId &&
//             admin.userId._id &&
//             admin.userId._id.toString() !== adminId.toString()
//         )
//         .forEach((admin) => {
//           io.to(admin.userId._id.toString()).emit("notification", {
//             message: `User ${user.name} has been assigned the role: ${adminRole}`,
//             link: `${process.env.BASE_URL}/admin/users/${user._id}`,
//           });
//         });

//       const communications = [
//         sendRoleAssignmentEmail(
//           user.email,
//           user.name,
//           adminRole,
//           adminRoleName
//         ).catch((error) => {
//           logger.error(
//             `Failed to send role assignment email to ${user.email}:`,
//             error
//           );
//         }),
//         sendRoleAssignmentSMS(
//           user.phone,
//           user.name,
//           adminRole,
//           adminRoleName
//         ).catch((error) => {
//           logger.error(
//             `Failed to send role assignment SMS to ${user.phone}:`,
//             error
//           );
//         }),
//         sendRegistrationEmail(
//           user.email,
//           user.name,
//           `You have been assigned the role: ${adminRole} by ${adminRoleName}. Login here: ${process.env.BASE_URL}/login`
//         ).catch((error) => {
//           logger.error(
//             `Failed to send registration email to ${user.email}:`,
//             error
//           );
//         }),
//         ...admins
//           .filter(
//             (admin) =>
//               admin.userId &&
//               admin.userId.email &&
//               admin.userId._id.toString() !== adminId.toString()
//           )
//           .map((admin) => [
//             sendAdminNotificationEmail(
//               admin.userId.email,
//               user.name,
//               user._id,
//               `User ${user.name} has been assigned the role: ${adminRole}`
//             ).catch((error) => {
//               logger.error(
//                 `Failed to send admin notification email to ${admin.userId.email}:`,
//                 error
//               );
//             }),
//             sendAdminNotificationSMS(
//               admin.userId.phone,
//               user.name,
//               user._id,
//               `User ${user.name} has been assigned the role: ${adminRole}`
//             ).catch((error) => {
//               logger.error(
//                 `Failed to send admin notification SMS to ${admin.userId.phone}:`,
//                 error
//               );
//             }),
//           ])
//           .flat(),
//       ];

//       await Promise.all(communications);

//       logger.info(`Admin created for user: ${userId} by ${adminRole}`);
//       res.json({ message: "Admin created successfully" });
//     } catch (error) {
//       logger.error(`Create admin error:`, error);
//       res.status(500).json({ message: "Server error", error: error.message });
//     }
//   }
// );

// module.exports = router;

const express = require("express");
const router = express.Router();
const { check, validationResult } = require("express-validator");
const authenticate = require("../middleware/auth");
const Admin = require("../models/Admin");
const Role = require("../models/Role");
const Notification = require("../models/Notification");
const User = require("../models/User");
const logger = require("../utils/logger");
const {
  sendAdminNotificationEmail,
  sendRegistrationEmail,
  sendRoleAssignmentEmail,
} = require("../services/emailService");
const { getIO } = require("../config/socket");

const generateUniqueId = async (suffix, model, field) => {
  let id;
  let isUnique = false;
  while (!isUnique) {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    id = `KLARITY${randomNum}${suffix}`;
    const existing = await model.findOne({ [field]: id });
    if (!existing) isUnique = true;
  }
  return id;
};

router.use(authenticate);

// Assign Role and Subjects
router.post(
  "/assign-role",
  [
    check("userId").isMongoId().withMessage("Valid user ID is required"),
    check("roleName")
      .isIn(["Admin", "Teacher", "Student", "Super Admin"])
      .withMessage("Role must be Admin, Teacher, Student, or Super Admin"),
    check("subjects")
      .optional()
      .isArray()
      .withMessage("Subjects must be an array")
      .custom((subjects) => {
        if (subjects) {
          const validSubjects = [
            "Phonics",
            "Creative Writing",
            "Public Speaking",
          ];
          return subjects.every((subject) => validSubjects.includes(subject));
        }
        return true;
      })
      .withMessage("Invalid subjects provided"),
    check("teacherId")
      .optional()
      .isMongoId()
      .withMessage("Valid teacher ID is required for student role"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in assign-role:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId, roleName, subjects, teacherId } = req.body;
    const adminId = req.user?.userId;

    if (!adminId) {
      logger.error("No adminId found in req.user");
      return res.status(401).json({ message: "Authentication failed" });
    }

    try {
      const admin = await Admin.findOne({ userId: adminId }).populate(
        "userId",
        "_id email name phone"
      );
      if (!admin || !admin.userId) {
        logger.warn(`Unauthorized access attempt by user: ${adminId}`);
        return res.status(403).json({ message: "Not authorized" });
      }

      if (["Admin", "Super Admin"].includes(roleName) && !admin.isSuperAdmin) {
        logger.warn(
          `Non-super admin ${adminId} attempted to assign ${roleName} role`
        );
        return res
          .status(403)
          .json({ message: `Only Super Admins can assign ${roleName} role` });
      }

      const user = await User.findById(userId);
      if (!user) {
        logger.warn(`User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      let teacherName = "";
      if (roleName === "Student" && teacherId) {
        const teacher = await User.findById(teacherId).populate("role");
        if (!teacher || teacher.role?.roleName !== "Teacher") {
          logger.warn(`Invalid teacher ID: ${teacherId}`);
          return res.status(400).json({ message: "Invalid teacher ID" });
        }
        if (
          !subjects ||
          !subjects.every((subject) => teacher.subjects.includes(subject))
        ) {
          logger.warn(
            `Teacher ${teacherId} does not teach all selected subjects: ${subjects}`
          );
          return res
            .status(400)
            .json({ message: "Teacher does not teach all selected subjects" });
        }
        user.teacherId = teacherId;
        teacherName = teacher.name;
      } else if (roleName === "Student" && !teacherId) {
        logger.warn(`Teacher ID required for student role assignment`);
        return res
          .status(400)
          .json({ message: "Teacher ID is required for student role" });
      }

      const existingRole = await Role.findOne({ userId });
      if (existingRole) {
        if (
          existingRole.roleName === roleName &&
          JSON.stringify(user.subjects) === JSON.stringify(subjects || [])
        ) {
          logger.warn(
            `User ${userId} already has role: ${roleName} with same subjects`
          );
          return res
            .status(400)
            .json({
              message: `User already has ${roleName} role with specified subjects`,
            });
        }
        existingRole.roleName = roleName;
        existingRole.assignedBy = admin._id;
        await existingRole.save();
      } else {
        const role = new Role({ userId, roleName, assignedBy: admin._id });
        await role.save();
        user.role = role._id;
      }

      if (roleName === "Student") {
        user.studentId = await generateUniqueId("S", User, "studentId");
        user.employeeId = undefined;
      } else if (roleName === "Teacher") {
        user.employeeId = await generateUniqueId("T", User, "employeeId");
        user.studentId = undefined;
      } else if (["Admin", "Super Admin"].includes(roleName)) {
        user.employeeId = await generateUniqueId("D", User, "employeeId");
        user.studentId = undefined;
      } else {
        user.studentId = undefined;
        user.employeeId = undefined;
      }

      if (["Teacher", "Student"].includes(roleName)) {
        user.subjects = subjects || [];
      } else {
        user.subjects = [];
      }
      await user.save();

      if (["Admin", "Super Admin"].includes(roleName)) {
        const existingAdmin = await Admin.findOne({ userId });
        if (!existingAdmin) {
          const newAdmin = new Admin({
            userId,
            role: roleName,
            isSuperAdmin: roleName === "Super Admin",
          });
          await newAdmin.save();
        } else if (existingAdmin.role !== roleName) {
          existingAdmin.role = roleName;
          existingAdmin.isSuperAdmin = roleName === "Super Admin";
          await newAdmin.save();
        }
      }

      const admins = await Admin.find().populate({
        path: "userId",
        select: "_id email name phone",
      });

      const requestingAdmin = admins.find(
        (admin) => admin.userId?._id.toString() === adminId.toString()
      );
      const adminRole = requestingAdmin ? requestingAdmin.role : "Unknown Admin";

      const notifications = [
        new Notification({
          userId,
          message: `You have been assigned the role: ${roleName}${
            subjects ? ` with subjects: ${subjects.join(", ")}` : ""
          }${
            teacherId ? ` and assigned to teacher: ${teacherName}` : ""
          } by ${adminRole}`,
        }).save(),
        new Notification({
          userId: adminId,
          message: `Role ${roleName}${
            subjects ? ` with subjects: ${subjects.join(", ")}` : ""
          }${teacherId ? ` and teacher: ${teacherName}` : ""} assigned to ${
            user.name
          }`,
        }).save(),
        ...admins
          .filter(
            (admin) =>
              admin.userId?._id && admin.userId._id.toString() !== adminId.toString()
          )
          .map((admin) =>
            new Notification({
              userId: admin.userId._id,
              message: `User ${
                user.name
              } has been assigned the role: ${roleName}${
                subjects ? ` with subjects: ${subjects.join(", ")}` : ""
              }${teacherId ? ` and assigned to teacher: ${teacherName}` : ""}`,
              link: `${process.env.BASE_URL}/admin/users/${user._id}`,
            }).save()
          ),
      ];

      await Promise.all(notifications);

      const io = getIO();
      io.to(userId).emit("notification", {
        message: `You have been assigned the role: ${roleName}${
          subjects ? ` with subjects: ${subjects.join(", ")}` : ""
        }${
          teacherId ? ` and assigned to teacher: ${teacherName}` : ""
        } by ${adminRole}`,
      });
      io.to(adminId).emit("notification", {
        message: `Role ${roleName}${
          subjects ? ` with subjects: ${subjects.join(", ")}` : ""
        }${teacherId ? ` and teacher: ${teacherName}` : ""} assigned to ${
          user.name
        }`,
      });
      admins
        .filter(
          (admin) =>
            admin.userId?._id && admin.userId._id.toString() !== adminId.toString()
        )
        .forEach((admin) => {
          io.to(admin.userId._id.toString()).emit("notification", {
            message: `User ${
              user.name
            } has been assigned the role: ${roleName}${
              subjects ? ` with subjects: ${subjects.join(", ")}` : ""
            }${teacherId ? ` and assigned to teacher: ${teacherName}` : ""}`,
            link: `${process.env.BASE_URL}/admin/users/${user._id}`,
          });
        });

      const communications = [
        sendRoleAssignmentEmail(
          user.email,
          user.name,
          roleName,
          adminRole,
          subjects,
          teacherId ? teacherName : undefined
        ).catch((error) => {
          logger.error(
            `Failed to send role assignment email to ${user.email}:`,
            error
          );
        }),
        sendRegistrationEmail(
          user.email,
          user.name,
          `You have been assigned the role: ${roleName}${
            subjects ? ` with subjects: ${subjects.join(", ")}` : ""
          }${
            teacherId ? ` and assigned to teacher: ${teacherName}` : ""
          } by ${adminRole}. Login here: ${process.env.BASE_URL}/login`
        ).catch((error) => {
          logger.error(
            `Failed to send registration email to ${user.email}:`,
            error
          );
        }),
        ...admins
          .filter(
            (admin) =>
              admin.userId?.email && admin.userId._id.toString() !== adminId.toString()
          )
          .map((admin) => [
            sendAdminNotificationEmail(
              admin.userId.email,
              user.name,
              user._id,
              `User ${user.name} has been assigned the role: ${roleName}${
                subjects ? ` with subjects: ${subjects.join(", ")}` : ""
              }${teacherId ? ` and assigned to teacher: ${teacherName}` : ""}`
            ).catch((error) => {
              logger.error(
                `Failed to send admin notification email to ${admin.userId.email}:`,
                error
              );
            }),
          ])
          .flat(),
      ];

      await Promise.all(communications);

      logger.info(
        `Role ${roleName}${
          subjects ? ` with subjects: ${subjects.join(", ")}` : ""
        }${
          teacherId ? ` and teacher: ${teacherName}` : ""
        } assigned to user: ${userId} by ${adminRole}`
      );
      res.json({ message: "Role and subjects assigned successfully" });
    } catch (error) {
      logger.error(`Assign role error for user ${userId}:`, error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Get All Users
router.get("/users", async (req, res) => {
  const adminId = req.user.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const role = req.query.role;

  try {
    const admin = await Admin.findOne({ userId: adminId });
    if (!admin) {
      logger.warn(`Unauthorized access attempt by user: ${adminId}`);
      return res.status(403).json({ message: "Not authorized" });
    }

    let query = {};
    if (role) {
      const roleDocs = await Role.find({ roleName: role }).select("userId");
      query._id = { $in: roleDocs.map((r) => r.userId) };
    }

    const users = await User.find(query)
      .populate("role")
      .populate("teacherId", "name email")
      .populate("students", "name email")
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await User.countDocuments(query);

    logger.info(`Users fetched by admin: ${adminId}, page: ${page}`);
    res.json({
      users,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    logger.error("Get users error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get Single User by ID
router.get("/users/:id", async (req, res) => {
  const adminId = req.user.userId;
  const userId = req.params.id;

  try {
    const admin = await Admin.findOne({ userId: adminId });
    if (!admin) {
      logger.warn(`Unauthorized access attempt by user: ${adminId}`);
      return res.status(403).json({ message: "Not authorized" });
    }

    const user = await User.findById(userId)
      .populate("role")
      .populate("teacherId", "name email subjects")
      .populate("students", "name email studentId");

    if (!user) {
      logger.warn(`User not found: ${userId}`);
      return res.status(404).json({ message: "User not found" });
    }

    logger.info(
      `User details fetched for user: ${userId} by admin: ${adminId}`
    );
    res.json({ user });
  } catch (error) {
    logger.error(`Get user details error for user: ${userId}:`, error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Create Admin
router.post(
  "/create-admin",
  [
    check("userId").isMongoId().withMessage("Valid user ID is required"),
    check("isSuperAdmin")
      .isBoolean()
      .withMessage("isSuperAdmin must be a boolean"),
    check("role")
      .isIn(["Super Admin", "Admin"])
      .withMessage("Role must be Super Admin or Admin")
      .optional(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in create-admin:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { userId, isSuperAdmin, role = "Admin" } = req.body;
    const adminId = req.user.userId;

    try {
      const requestingAdmin = await Admin.findOne({ userId: adminId });
      if (!requestingAdmin || !requestingAdmin.isSuperAdmin) {
        logger.warn(`Unauthorized admin creation attempt by user: ${adminId}`);
        return res.status(403).json({ message: "Not authorized" });
      }

      const user = await User.findById(userId);
      if (!user) {
        logger.warn(`User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      const adminRole = isSuperAdmin ? "Super Admin" : role;
      let admin = await Admin.findOne({ userId });

      if (admin) {
        admin.role = adminRole;
        admin.isSuperAdmin = isSuperAdmin;
        await admin.save();
        logger.info(`Updated admin role for user: ${userId} to ${adminRole}`);
      } else {
        admin = new Admin({ userId, role: adminRole, isSuperAdmin });
        await admin.save();
        logger.info(`Created new admin for user: ${userId} with role ${adminRole}`);
      }

      let existingRole = await Role.findOne({ userId });
      if (!existingRole) {
        const role = new Role({
          userId,
          roleName: adminRole,
          assignedBy: requestingAdmin._id,
        });
        await role.save();
        user.role = role._id;
      } else if (existingRole.roleName !== adminRole) {
        existingRole.roleName = adminRole;
        existingRole.assignedBy = requestingAdmin._id;
        await existingRole.save();
      }

      user.employeeId = await generateUniqueId("D", User, "employeeId");
      user.subjects = [];
      await user.save();

      const admins = await Admin.find().populate({
        path: "userId",
        select: "_id email name phone",
      });

      const requestingAdminPopulated = admins.find(
        (admin) => admin.userId._id.toString() === adminId.toString()
      );
      const adminRoleName = requestingAdminPopulated
        ? requestingAdminPopulated.role
        : "Unknown Admin";

      const notifications = [
        new Notification({
          userId,
          message: `You have been assigned the role: ${adminRole} by ${adminRoleName}`,
        }).save(),
        new Notification({
          userId: adminId,
          message: `Role ${adminRole} assigned to ${user.name}`,
        }).save(),
        ...admins
          .filter(
            (admin) =>
              admin.userId &&
              admin.userId._id &&
              admin.userId._id.toString() !== adminId.toString()
          )
          .map((admin) =>
            new Notification({
              userId: admin.userId._id,
              message: `User ${user.name} has been assigned the role: ${adminRole}`,
              link: `${process.env.BASE_URL}/admin/users/${user._id}`,
            }).save()
          ),
      ];

      await Promise.all(notifications);

      const io = getIO();
      io.to(userId).emit("notification", {
        message: `You have been assigned the role: ${adminRole} by ${adminRoleName}`,
      });
      io.to(adminId).emit("notification", {
        message: `Role ${adminRole} assigned to ${user.name}`,
      });
      admins
        .filter(
          (admin) =>
            admin.userId &&
            admin.userId._id &&
            admin.userId._id.toString() !== adminId.toString()
        )
        .forEach((admin) => {
          io.to(admin.userId._id.toString()).emit("notification", {
            message: `User ${user.name} has been assigned the role: ${adminRole}`,
            link: `${process.env.BASE_URL}/admin/users/${user._id}`,
          });
        });

      const communications = [
        sendRoleAssignmentEmail(
          user.email,
          user.name,
          adminRole,
          adminRoleName
        ).catch((error) => {
          logger.error(
            `Failed to send role assignment email to ${user.email}:`,
            error
          );
        }),
        sendRegistrationEmail(
          user.email,
          user.name,
          `You have been assigned the role: ${adminRole} by ${adminRoleName}. Login here: ${process.env.BASE_URL}/login`
        ).catch((error) => {
          logger.error(
            `Failed to send registration email to ${user.email}:`,
            error
          );
        }),
        ...admins
          .filter(
            (admin) =>
              admin.userId &&
              admin.userId.email &&
              admin.userId._id.toString() !== adminId.toString()
          )
          .map((admin) => [
            sendAdminNotificationEmail(
              admin.userId.email,
              user.name,
              user._id,
              `User ${user.name} has been assigned the role: ${adminRole}`
            ).catch((error) => {
              logger.error(
                `Failed to send admin notification email to ${admin.userId.email}:`,
                error
              );
            }),
          ])
          .flat(),
      ];

      await Promise.all(communications);

      logger.info(`Admin created for user: ${userId} by ${adminRole}`);
      res.json({ message: "Admin created successfully" });
    } catch (error) {
      logger.error(`Create admin error:`, error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

module.exports = router;
