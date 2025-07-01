// const express = require("express");
// const router = express.Router();
// const { check, validationResult } = require("express-validator");
// const authenticate = require("../middleware/auth");
// const User = require("../models/User");
// const Role = require("../models/Role");
// const Ticket = require("../models/Ticket");
// const ScheduledCall = require("../models/ScheduledCall");
// const Notification = require("../models/Notification");
// const logger = require("../utils/logger");
// const {
//   sendTicketRaisedEmail,
//   sendTicketConfirmationEmail,
//   sendClassPauseRequestEmail,
//   sendTicketRatingEmail,
//   sendTimezoneChangeRequestEmail,
//   sendSubjectChangeRequestEmail,
//   sendTeacherChangeRequestEmail,
// } = require("../services/emailService");
// const { sendTicketConfirmationSMS } = require("../services/smsService");
// const { getIO } = require("../config/socket");
// const upload = require("../config/multer");
// const { uploadFile, deleteLocalFile } = require("../config/cloudinary");

// const sendDelayedNotifications = async (user, ticket) => {
//   const isValidPhone = (phone) => phone && /^\+?[1-9]\d{1,14}$/.test(phone);
//   const ticketDetails = {
//     name: user.name,
//     ticketId: ticket.ticketNumber,
//     issueType: ticket.issueType,
//   };

//   try {
//     await sendTicketConfirmationEmail(user.email, ticketDetails);
//     logger.info(
//       `Delayed ticket confirmation email sent to ${user.email} for ticket ${ticket.ticketNumber}`
//     );
//   } catch (error) {
//     logger.error(
//       `Failed to send delayed ticket confirmation email to ${user.email}:`,
//       error
//     );
//   }

//   if (isValidPhone(user.phone)) {
//     try {
//       await sendTicketConfirmationSMS(user.phone, ticketDetails);
//       logger.info(
//         `Delayed ticket confirmation SMS sent to ${user.phone} for ticket ${ticket.ticketNumber}`
//       );
//     } catch (error) {
//       logger.error(
//         `Failed to send delayed ticket confirmation SMS to ${user.phone}:`,
//         error
//       );
//     }
//   } else {
//     logger.warn(`Invalid or missing phone number for user: ${user._id}`);
//   }
// };

// router.use(authenticate);

// // Get Tickets
// router.get("/", async (req, res) => {
//   const userId = req.user.userId;
//   const page = parseInt(req.query.page) || 1;
//   const limit = parseInt(req.query.limit) || 10;

//   try {
//     const userRole = await Role.findOne({ userId });
//     let query = { userId };

//     if (userRole && userRole.roleName === "Teacher") {
//       const studentIds = await ScheduledCall.find({
//         teacherId: userId,
//       }).distinct("studentIds");
//       const studentUsers = await User.find({ _id: { $in: studentIds } }).select(
//         "_id"
//       );
//       query = {
//         $or: [
//           { userId },
//           {
//             userId: { $in: studentUsers.map((user) => user._id) },
//             visibleToTeacher: true,
//           },
//           {
//             teacherId: userId,
//             visibleToTeacher: true,
//           },
//         ],
//       };
//     }

//     const tickets = await Ticket.find(query)
//       .populate("userId", "name email")
//       .populate("teacherId", "name email")
//       .sort({ createdAt: -1 })
//       .skip((page - 1) * limit)
//       .limit(limit);

//     const total = await Ticket.countDocuments(query);

//     logger.info(`Tickets fetched for user: ${userId}, page: ${page}`);
//     res.json({
//       tickets: tickets.map((ticket) => ({
//         _id: ticket._id,
//         ticketNumber: ticket.ticketNumber,
//         issueType: ticket.issueType,
//         description: ticket.description,
//         visibleToTeacher: ticket.visibleToTeacher,
//         teacher: ticket.teacherId
//           ? { name: ticket.teacherId.name, email: ticket.teacherId.email }
//           : null,
//         status: ticket.status,
//         response: ticket.response,
//         fileUrl: ticket.fileUrl,
//         createdAt: ticket.createdAt,
//         user: { name: ticket.userId.name, email: ticket.userId.email },
//       })),
//       total,
//       page,
//       pages: Math.ceil(total / limit),
//     });
//   } catch (error) {
//     logger.error("Get tickets error:", error);
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// });

// // Raise a Ticket
// router.post(
//   "/raise",
//   upload.single("file"),
//   [
//     check("issueType")
//       .isIn([
//         "Technical",
//         "Content",
//         "Scheduling",
//         "Payment",
//         "Other",
//         "Time Change Request",
//         "Timezone Change Request",
//       ])
//       .withMessage("Invalid issue type"),
//     check("description").notEmpty().withMessage("Description is required"),
//     check("visibleToTeacher")
//       .isBoolean()
//       .withMessage("visibleToTeacher must be a boolean"),
//   ],
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       logger.warn("Validation errors in raise ticket:", errors.array());
//       if (req.file) deleteLocalFile(req.file.path);
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const { issueType, description, visibleToTeacher } = req.body;
//     const userId = req.user.userId;

//     try {
//       const user = await User.findById(userId);
//       if (!user) {
//         logger.warn(`User not found: ${userId}`);
//         if (req.file) deleteLocalFile(req.file.path);
//         return res.status(404).json({ message: "User not found" });
//       }

//       const userRole = await Role.findOne({ userId });
//       const roleName = userRole ? userRole.roleName : "Unknown";

//       let fileUrl = null;
//       if (req.file) {
//         const { url } = await uploadFile(req.file.path);
//         fileUrl = url;
//         deleteLocalFile(req.file.path);
//       }

//       let teacherId = null;
//       let isVisibleToTeacher = visibleToTeacher;
//       if (roleName === "Student" && visibleToTeacher) {
//         let scheduledCall = await ScheduledCall.findOne({
//           studentIds: userId,
//           status: "Scheduled",
//         })
//           .sort({ date: -1 })
//           .select("teacherId");
//         if (scheduledCall) {
//           teacherId = scheduledCall.teacherId;
//         } else {
//           const student = await User.findById(userId).select("subjects");
//           if (student.subjects && student.subjects.length > 0) {
//             const teacher = await User.findOne({
//               subjects: { $in: student.subjects },
//               _id: { $ne: userId },
//             }).select("_id");
//             teacherId = teacher ? teacher._id : null;
//           }
//         }
//       } else if (roleName !== "Student") {
//         isVisibleToTeacher = false;
//       }

//       const ticket = new Ticket({
//         userId,
//         issueType,
//         description,
//         visibleToTeacher: isVisibleToTeacher,
//         teacherId,
//         fileUrl,
//         status: "Open",
//       });
//       await ticket.save();

//       const supportEmails = process.env.SUPPORT_EMAIL
//         ? process.env.SUPPORT_EMAIL.split(",")
//         : [];

//       const userDetails = {
//         name: user.name,
//         email: user.email,
//         role: roleName,
//       };

//       const ticketDetails = {
//         _id: ticket._id,
//         ticketNumber: ticket.ticketNumber,
//         issueType: ticket.issueType,
//         description: ticket.description,
//         visibleToTeacher: ticket.visibleToTeacher,
//         teacherId: ticket.teacherId ? ticket.teacherId.toString() : null,
//         fileUrl: ticket.fileUrl,
//       };

//       const notifications = [
//         new Notification({
//           userId,
//           message: `Your ticket (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
//           link: `${process.env.BASE_URL}/${
//             roleName.toLowerCase().replace(/\s+/g, '') || "user"
//           }/raise-query`,
//         }).save(),
//       ];

//       if (isVisibleToTeacher && teacherId) {
//         const teacher = await User.findById(teacherId);
//         if (teacher) {
//           notifications.push(
//             new Notification({
//               userId: teacherId,
//               message: `New ticket raised by ${user.name} (Ticket Number: ${ticket.ticketNumber})`,
//               link: `${process.env.BASE_URL}/teacher/tickets`,
//             }).save()
//           );
//           getIO()
//             .to(teacherId.toString())
//             .emit("notification", {
//               message: `New ticket raised by ${user.name} (Ticket Number: ${ticket.ticketNumber})`,
//               link: `${process.env.BASE_URL}/teacher/tickets`,
//             });
//         }
//       }

//       await Promise.all(notifications);

//       getIO()
//         .to(userId)
//         .emit("notification", {
//           message: `Your ticket (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
//           link: `${process.env.BASE_URL}/${
//             roleName.toLowerCase().replace(/\s+/g, '') || "user"
//           }/raise-query`,
//         });

//       const supportEmailPromises = supportEmails.map((email) =>
//         sendTicketRaisedEmail(email, userDetails, ticketDetails).catch(
//           (error) => {
//             logger.error(
//               `Failed to send ticket raised email to ${email}:`,
//               error
//             );
//           }
//         )
//       );
//       await Promise.all(supportEmailPromises);

//       setTimeout(() => sendDelayedNotifications(user, ticket), 60000);

//       logger.info(
//         `Ticket raised by user: ${userId}, ticketNumber: ${ticket.ticketNumber}`
//       );
//       res.json({
//         message: "Ticket raised successfully",
//         ticket: {
//           ...ticket.toObject(),
//           ticketNumber: `Ticket - ${ticket.ticketNumber}`,
//         },
//       });
//     } catch (error) {
//       logger.error("Raise ticket error:", error);
//       if (req.file) deleteLocalFile(req.file.path);
//       res.status(500).json({ message: "Server error", error: error.message });
//     }
//   }
// );

// // Raise a Teacher Change Request
// router.post(
//   "/raise-teacher-change",
//   [check("description").notEmpty().withMessage("Description is required")],
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       logger.warn("Validation errors in raise teacher change:", errors.array());
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const { description } = req.body;
//     const userId = req.user.userId;

//     try {
//       const userRole = await Role.findOne({ userId });
//       if (!userRole || userRole.roleName !== "Student") {
//         logger.warn(`User ${userId} is not a student`);
//         return res
//           .status(403)
//           .json({ message: "Only students can raise teacher change requests" });
//       }

//       const user = await User.findById(userId);
//       if (!user) {
//         logger.warn(`User not found: ${userId}`);
//         return res.status(404).json({ message: "User not found" });
//       }

//       const scheduledCall = await ScheduledCall.findOne({ studentIds: userId })
//         .sort({ date: -1 })
//         .select("teacherId");
//       const teacherId = scheduledCall ? scheduledCall.teacherId : null;

//       const ticket = new Ticket({
//         userId,
//         issueType: "Teacher Change Request",
//         description,
//         visibleToTeacher: false,
//         teacherId,
//         status: "Open",
//       });
//       await ticket.save();

//       const supportEmails = process.env.SUPPORT_EMAIL
//         ? process.env.SUPPORT_EMAIL.split(",")
//         : [];

//       const userDetails = {
//         name: user.name,
//         email: user.email,
//         role: userRole.roleName,
//       };

//       const ticketDetails = {
//         _id: ticket._id,
//         ticketNumber: ticket.ticketNumber,
//         issueType: ticket.issueType,
//         description: ticket.description,
//         visibleToTeacher: ticket.visibleToTeacher,
//         teacherId: teacherId ? teacherId.toString() : null,
//       };

//       const notifications = [
//         new Notification({
//           userId,
//           message: `Your teacher change request (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
//           link: `${process.env.BASE_URL}/student/raise-query`,
//         }).save(),
//       ];

//       await Promise.all(notifications);

//       getIO()
//         .to(userId)
//         .emit("notification", {
//           message: `Your teacher change request (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
//           link: `${process.env.BASE_URL}/student/raise-query`,
//         });

//       const supportEmailPromises = supportEmails.map((email) =>
//         sendTeacherChangeRequestEmail(email, userDetails, ticketDetails).catch(
//           (error) => {
//             logger.error(
//               `Failed to send teacher change request email to ${email}:`,
//               error
//             );
//           }
//         )
//       );
//       await Promise.all(supportEmailPromises);

//       setTimeout(() => sendDelayedNotifications(user, ticket), 60000);

//       logger.info(
//         `Teacher change request raised by user: ${userId}, ticketNumber: ${ticket.ticketNumber}`
//       );
//       res.json({
//         message: "Teacher change request raised successfully",
//         ticket: {
//           ...ticket.toObject(),
//           ticketNumber: `Ticket - ${ticket.ticketNumber}`,
//         },
//       });
//     } catch (error) {
//       logger.error("Raise teacher change request error:", error);
//       res.status(500).json({ message: "Server error", error: error.message });
//     }
//   }
// );

// // Raise a Timezone Change Request
// router.post(
//   "/raise-timezone-change",
//   [
//     check("description").notEmpty().withMessage("Description is required"),
//     check("visibleToTeacher")
//       .optional()
//       .isBoolean()
//       .withMessage("visibleToTeacher must be a boolean"),
//   ],
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       logger.warn(
//         "Validation errors in raise timezone change:",
//         errors.array()
//       );
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const { description, visibleToTeacher = false } = req.body;
//     const userId = req.user.userId;

//     try {
//       const userRole = await Role.findOne({ userId });
//       if (!userRole || !["Student", "Teacher"].includes(userRole.roleName)) {
//         logger.warn(`User ${userId} is not a student or teacher`);
//         return res
//           .status(403)
//           .json({
//             message:
//               "Only students and teachers can raise timezone change requests",
//           });
//       }

//       const user = await User.findById(userId);
//       if (!user) {
//         logger.warn(`User not found: ${userId}`);
//         return res.status(404).json({ message: "User not found" });
//       }

//       let teacherId = null;
//       let isVisibleToTeacher = visibleToTeacher;

//       if (userRole.roleName === "Student") {
//         let scheduledCall = await ScheduledCall.findOne({
//           studentIds: userId,
//           status: "Scheduled",
//         })
//           .sort({ date: -1 })
//           .select("teacherId");
//         if (scheduledCall) {
//           teacherId = scheduledCall.teacherId;
//         } else {
//           const student = await User.findById(userId).select("subjects");
//           if (student.subjects && student.subjects.length > 0) {
//             const teacher = await User.findOne({
//               subjects: { $in: student.subjects },
//               _id: { $ne: userId },
//             }).select("_id");
//             teacherId = teacher ? teacher._id : null;
//           }
//         }
//       } else {
//         isVisibleToTeacher = false;
//       }

//       const ticket = new Ticket({
//         userId,
//         issueType: "Timezone Change Request",
//         description,
//         visibleToTeacher: isVisibleToTeacher,
//         teacherId,
//         status: "Open",
//       });
//       await ticket.save();

//       const supportEmails = process.env.SUPPORT_EMAIL
//         ? process.env.SUPPORT_EMAIL.split(",")
//         : [];

//       const userDetails = {
//         name: user.name,
//         email: user.email,
//         role: userRole.roleName,
//       };

//       const ticketDetails = {
//         _id: ticket._id,
//         ticketNumber: ticket.ticketNumber,
//         issueType: ticket.issueType,
//         description: ticket.description,
//         visibleToTeacher: ticket.visibleToTeacher,
//         teacherId: ticket.teacherId ? ticket.teacherId.toString() : null,
//       };

//       const notifications = [
//         new Notification({
//           userId,
//           message: `Your timezone change request (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
//           link: `${
//             process.env.BASE_URL
//           }/${userRole.roleName.toLowerCase().replace(/\s+/g, '')}/raise-query`,
//         }).save(),
//       ];

//       if (isVisibleToTeacher && teacherId) {
//         const teacher = await User.findById(teacherId);
//         if (teacher) {
//           notifications.push(
//             new Notification({
//               userId: teacherId,
//               message: `New timezone change request raised by ${user.name} (Ticket Number: ${ticket.ticketNumber})`,
//               link: `${process.env.BASE_URL}/teacher/tickets`,
//             }).save()
//           );
//           getIO()
//             .to(teacherId.toString())
//             .emit("notification", {
//               message: `New timezone change request raised by ${user.name} (Ticket Number: ${ticket.ticketNumber})`,
//               link: `${process.env.BASE_URL}/teacher/tickets`,
//             });
//         }
//       }

//       await Promise.all(notifications);

//       getIO()
//         .to(userId)
//         .emit("notification", {
//           message: `Your timezone change request (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
//           link: `${
//             process.env.BASE_URL
//           }/${userRole.roleName.toLowerCase().replace(/\s+/g, '')}/raise-query`,
//         });

//       const supportEmailPromises = supportEmails.map((email) =>
//         sendTimezoneChangeRequestEmail(email, userDetails, ticketDetails).catch(
//           (error) => {
//             logger.error(
//               `Failed to send timezone change request email to ${email}:`,
//               error
//             );
//           }
//         )
//       );
//       await Promise.all(supportEmailPromises);

//       setTimeout(() => sendDelayedNotifications(user, ticket), 60000);

//       logger.info(
//         `Timezone change request raised by user: ${userId}, ticketNumber: ${ticket.ticketNumber}`
//       );
//       res.json({
//         message: "Timezone change request raised successfully",
//         ticket: {
//           ...ticket.toObject(),
//           ticketNumber: `Ticket - ${ticket.ticketNumber}`,
//         },
//       });
//     } catch (error) {
//       logger.error("Raise timezone change request error:", error);
//       res.status(500).json({ message: "Server error", error: error.message });
//     }
//   }
// );

// // Raise a Class Pause Request
// router.post("/raise-class-pause", async (req, res) => {
//   const userId = req.user.userId;

//   try {
//     const userRole = await Role.findOne({ userId });
//     if (!userRole || userRole.roleName !== "Student") {
//       logger.warn(`User ${userId} is not a student`);
//       return res
//         .status(403)
//         .json({ message: "Only students can raise class pause requests" });
//     }

//     const user = await User.findById(userId);
//     if (!user) {
//       logger.warn(`User not found: ${userId}`);
//       return res.status(404).json({ message: "User not found" });
//     }

//     const ticket = new Ticket({
//       userId,
//       issueType: "Class Pause Request",
//       description: "The student has requested to pause their classes.",
//       visibleToTeacher: false,
//       teacherId: null,
//       status: "Open",
//     });
//     await ticket.save();

//     const supportEmails = process.env.SUPPORT_EMAIL
//       ? process.env.SUPPORT_EMAIL.split(",")
//       : [];

//     const userDetails = {
//       name: user.name,
//       email: user.email,
//       role: userRole.roleName,
//     };

//     const ticketDetails = {
//       _id: ticket._id,
//       ticketNumber: ticket.ticketNumber,
//       issueType: ticket.issueType,
//       description: ticket.description,
//       visibleToTeacher: ticket.visibleToTeacher,
//     };

//     const notifications = [
//       new Notification({
//         userId,
//         message: `Your class pause request (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
//         link: `${process.env.BASE_URL}/student/raise-query`,
//       }).save(),
//     ];

//     await Promise.all(notifications);

//     getIO()
//       .to(userId)
//       .emit("notification", {
//         message: `Your class pause request (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
//         link: `${process.env.BASE_URL}/student/raise-query`,
//       });

//     const supportEmailPromises = supportEmails.map((email) =>
//       sendClassPauseRequestEmail(email, userDetails, ticketDetails).catch(
//         (error) => {
//           logger.error(
//             `Failed to send class pause request email to ${email}:`,
//             error
//           );
//         }
//       )
//     );
//     await Promise.all(supportEmailPromises);

//     setTimeout(() => sendDelayedNotifications(user, ticket), 60000);

//     logger.info(
//       `Class pause request raised by user: ${userId}, ticketNumber: ${ticket.ticketNumber}`
//     );
//     res.json({
//       message: "Class pause request raised successfully",
//       ticket: {
//         ...ticket.toObject(),
//         ticketNumber: `Ticket - ${ticket.ticketNumber}`,
//       },
//     });
//   } catch (error) {
//     logger.error("Raise class pause request error:", error);
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// });

// // Rate a Ticket
// router.put(
//   "/:ticketId/rate",
//   [
//     check("rating")
//       .isInt({ min: 1, max: 5 })
//       .withMessage("Rating must be between 1 and 5"),
//   ],
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       logger.warn("Validation errors in rate ticket:", errors.array());
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const { ticketId } = req.params;
//     const { rating } = req.body;
//     const userId = req.user.userId;

//     try {
//       const ticket = await Ticket.findById(ticketId).populate(
//         "userId",
//         "name email"
//       );
//       if (!ticket) {
//         logger.warn(`Ticket not found: ${ticketId}`);
//         return res.status(404).json({ message: "Ticket not found" });
//       }

//       if (ticket.userId._id.toString() !== userId) {
//         logger.warn(
//           `User ${userId} is not authorized to rate ticket ${ticketId}`
//         );
//         return res
//           .status(403)
//           .json({ message: "Not authorized to rate this ticket" });
//       }

//       if (ticket.status !== "Resolved") {
//         logger.warn(`Ticket ${ticketId} is not resolved, cannot be rated`);
//         return res
//           .status(400)
//           .json({ message: "Only resolved tickets can be rated" });
//       }

//       ticket.rating = rating;
//       ticket.updatedAt = new Date();
//       await ticket.save();

//       const userDetails = {
//         name: ticket.userId.name,
//         email: ticket.userId.email,
//       };

//       const ticketDetails = {
//         ticketNumber: ticket.ticketNumber,
//         description: ticket.description,
//         rating: ticket.rating,
//       };

//       await sendTicketRatingEmail(
//         userDetails.email,
//         userDetails,
//         ticketDetails
//       );

//       const supportEmails = process.env.SUPPORT_EMAIL
//         ? process.env.SUPPORT_EMAIL.split(",")
//         : [];

//       const supportEmailPromises = supportEmails.map((email) =>
//         sendTicketRatingEmail(email, userDetails, ticketDetails).catch(
//           (error) => {
//             logger.error(
//               `Failed to send ticket rating email to ${email}:`,
//               error
//             );
//           }
//         )
//       );
//       await Promise.all(supportEmailPromises);

//       logger.info(
//         `Ticket ${ticketId} rated by user: ${userId}, rating: ${rating}`
//       );
//       res.json({
//         message: "Rating submitted successfully",
//         ticket: {
//           ...ticket.toObject(),
//           user: { name: ticket.userId.name, email: ticket.userId.email },
//         },
//       });
//     } catch (error) {
//       logger.error("Rate ticket error:", error);
//       res.status(500).json({ message: "Server error", error: error.message });
//     }
//   }
// );

// // Raise a Subject Change Request (Teacher only)
// router.post(
//   "/raise-subject-change",
//   [
//     check("description").notEmpty().withMessage("Description is required"),
//     check("currentSubject")
//       .notEmpty()
//       .withMessage("Current subject is required")
//       .isIn(["Phonics", "Creative Writing", "Public Speaking"])
//       .withMessage("Invalid current subject"),
//   ],
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       logger.warn("Validation errors in raise subject change:", errors.array());
//       return res.status(400).json({ errors: errors.array() });
//     }

//     const {
//       issueType = "Subject Change Request",
//       description,
//       currentSubject,
//       fileUrl,
//     } = req.body;
//     const userId = req.user.userId;

//     try {
//       const userRole = await Role.findOne({ userId });
//       if (!userRole || userRole.roleName !== "Teacher") {
//         logger.warn(`User ${userId} is not a teacher`);
//         return res
//           .status(403)
//           .json({ message: "Only teachers can raise subject change requests" });
//       }

//       const user = await User.findById(userId);
//       if (!user) {
//         logger.warn(`User not found: ${userId}`);
//         return res.status(404).json({ message: "User not found" });
//       }

//       const ticket = new Ticket({
//         userId,
//         issueType: "Subject Change Request",
//         description,
//         visibleToTeacher: false,
//         teacherId: user._id,
//         fileUrl,
//         status: "In Progress",
//       });
//       await ticket.save();

//       const userDetails = {
//         name: user.name,
//         email: user.email,
//         role: userRole.roleName,
//       };

//       const ticketDetails = {
//         _id: ticket._id,
//         ticketNumber: ticket.ticketNumber,
//         issueType: ticket.issueType,
//         description: ticket.description,
//         currentSubject: currentSubject || "Not specified",
//         teacherId: ticket.teacherId ? ticket.teacherId.toString() : null,
//         fileUrl: ticket.fileUrl,
//       };

//       const supportEmails = process.env.SUPPORT_EMAIL
//         ? process.env.SUPPORT_EMAIL.split(",")
//         : [];

//       const supportEmailPromises = supportEmails.map((email) =>
//         sendSubjectChangeRequestEmail(email, userDetails, ticketDetails).catch(
//           (error) => {
//             logger.error(
//               `Failed to send subject change request email to ${email}:`,
//               error
//             );
//           }
//         )
//       );
//       await Promise.all(supportEmailPromises);

//       const notifications = [
//         new Notification({
//           userId,
//           message: `Your subject change request (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
//           link: `${process.env.BASE_URL}/teacher/raise-query`,
//         }).save(),
//       ];
//       await Promise.all(notifications);

//       getIO()
//         .to(userId)
//         .emit("notification", {
//           message: `Your subject change request (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
//           link: `${process.env.BASE_URL}/teacher/raise-query`,
//         });

//       setTimeout(() => sendDelayedNotifications(user, ticket), 60000);

//       logger.info(
//         `Subject change request raised by user: ${userId}, ticketNumber: ${ticket.ticketNumber}`
//       );
//       res.status(201).json({
//         message: "Subject change request raised successfully",
//         ticket: {
//           ticketNumber: ticket.ticketNumber,
//           issueType: ticket.issueType,
//           status: ticket.status,
//           createdAt: ticket.createdAt,
//         },
//       });
//     } catch (error) {
//       logger.error("Raise subject change request error:", error);
//       res.status(500).json({ message: "Server error", error: error.message });
//     }
//   }
// );

// module.exports = router;

const express = require("express");
const router = express.Router();
const { check, validationResult } = require("express-validator");
const authenticate = require("../middleware/auth");
const User = require("../models/User");
const Role = require("../models/Role");
const Ticket = require("../models/Ticket");
const ScheduledCall = require("../models/ScheduledCall");
const Notification = require("../models/Notification");
const logger = require("../utils/logger");
const {
  sendTicketRaisedEmail,
  sendTicketConfirmationEmail,
  sendClassPauseRequestEmail,
  sendTicketRatingEmail,
  sendTimezoneChangeRequestEmail,
  sendSubjectChangeRequestEmail,
  sendTeacherChangeRequestEmail,
} = require("../services/emailService");
const { getIO } = require("../config/socket");
const upload = require("../config/multer");
const { uploadFile, deleteLocalFile } = require("../config/cloudinary");

const sendDelayedNotifications = async (user, ticket) => {
  const ticketDetails = {
    name: user.name,
    ticketId: ticket.ticketNumber,
    issueType: ticket.issueType,
  };

  try {
    await sendTicketConfirmationEmail(user.email, ticketDetails);
    logger.info(
      `Delayed ticket confirmation email sent to ${user.email} for ticket ${ticket.ticketNumber}`
    );
  } catch (error) {
    logger.error(
      `Failed to send delayed ticket confirmation email to ${user.email}:`,
      error
    );
  }
};

router.use(authenticate);

// Get Tickets
router.get("/", async (req, res) => {
  const userId = req.user.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  try {
    const userRole = await Role.findOne({ userId });
    let query = { userId };

    if (userRole && userRole.roleName === "Teacher") {
      const studentIds = await ScheduledCall.find({
        teacherId: userId,
      }).distinct("studentIds");
      const studentUsers = await User.find({ _id: { $in: studentIds } }).select(
        "_id"
      );
      query = {
        $or: [
          { userId },
          {
            userId: { $in: studentUsers.map((user) => user._id) },
            visibleToTeacher: true,
          },
          {
            teacherId: userId,
            visibleToTeacher: true,
          },
        ],
      };
    }

    const tickets = await Ticket.find(query)
      .populate("userId", "name email")
      .populate("teacherId", "name email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const total = await Ticket.countDocuments(query);

    logger.info(`Tickets fetched for user: ${userId}, page: ${page}`);
    res.json({
      tickets: tickets.map((ticket) => ({
        _id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        issueType: ticket.issueType,
        description: ticket.description,
        visibleToTeacher: ticket.visibleToTeacher,
        teacher: ticket.teacherId
          ? { name: ticket.teacherId.name, email: ticket.teacherId.email }
          : null,
        status: ticket.status,
        response: ticket.response,
        fileUrl: ticket.fileUrl,
        createdAt: ticket.createdAt,
        user: { name: ticket.userId.name, email: ticket.userId.email },
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    logger.error("Get tickets error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Raise a Ticket
router.post(
  "/raise",
  upload.single("file"),
  [
    check("issueType")
      .isIn([
        "Technical",
        "Content",
        "Scheduling",
        "Payment",
        "Other",
        "Time Change Request",
        "Timezone Change Request",
      ])
      .withMessage("Invalid issue type"),
    check("description").notEmpty().withMessage("Description is required"),
    check("visibleToTeacher")
      .isBoolean()
      .withMessage("visibleToTeacher must be a boolean"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in raise ticket:", errors.array());
      if (req.file) deleteLocalFile(req.file.path);
      return res.status(400).json({ errors: errors.array() });
    }

    const { issueType, description, visibleToTeacher } = req.body;
    const userId = req.user.userId;

    try {
      const user = await User.findById(userId);
      if (!user) {
        logger.warn(`User not found: ${userId}`);
        if (req.file) deleteLocalFile(req.file.path);
        return res.status(404).json({ message: "User not found" });
      }

      const userRole = await Role.findOne({ userId });
      const roleName = userRole ? userRole.roleName : "Unknown";

      let fileUrl = null;
      if (req.file) {
        const { url } = await uploadFile(req.file.path);
        fileUrl = url;
        deleteLocalFile(req.file.path);
      }

      let teacherId = null;
      let isVisibleToTeacher = visibleToTeacher;
      if (roleName === "Student" && visibleToTeacher) {
        let scheduledCall = await ScheduledCall.findOne({
          studentIds: userId,
          status: "Scheduled",
        })
          .sort({ date: -1 })
          .select("teacherId");
        if (scheduledCall) {
          teacherId = scheduledCall.teacherId;
        } else {
          const student = await User.findById(userId).select("subjects");
          if (student.subjects && student.subjects.length > 0) {
            const teacher = await User.findOne({
              subjects: { $in: student.subjects },
              _id: { $ne: userId },
            }).select("_id");
            teacherId = teacher ? teacher._id : null;
          }
        }
      } else if (roleName !== "Student") {
        isVisibleToTeacher = false;
      }

      const ticket = new Ticket({
        userId,
        issueType,
        description,
        visibleToTeacher: isVisibleToTeacher,
        teacherId,
        fileUrl,
        status: "Open",
      });
      await ticket.save();

      const supportEmails = process.env.SUPPORT_EMAIL
        ? process.env.SUPPORT_EMAIL.split(",")
        : [];

      const userDetails = {
        name: user.name,
        email: user.email,
        role: roleName,
      };

      const ticketDetails = {
        _id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        issueType: ticket.issueType,
        description: ticket.description,
        visibleToTeacher: ticket.visibleToTeacher,
        teacherId: ticket.teacherId ? ticket.teacherId.toString() : null,
        fileUrl: ticket.fileUrl,
      };

      const notifications = [
        new Notification({
          userId,
          message: `Your ticket (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
          link: `${process.env.BASE_URL}/${
            roleName.toLowerCase().replace(/\s+/g, '') || "user"
          }/raise-query`,
        }).save(),
      ];

      if (isVisibleToTeacher && teacherId) {
        const teacher = await User.findById(teacherId);
        if (teacher) {
          notifications.push(
            new Notification({
              userId: teacherId,
              message: `New ticket raised by ${user.name} (Ticket Number: ${ticket.ticketNumber})`,
              link: `${process.env.BASE_URL}/teacher/tickets`,
            }).save()
          );
          getIO()
            .to(teacherId.toString())
            .emit("notification", {
              message: `New ticket raised by ${user.name} (Ticket Number: ${ticket.ticketNumber})`,
              link: `${process.env.BASE_URL}/teacher/tickets`,
            });
        }
      }

      await Promise.all(notifications);

      getIO()
        .to(userId)
        .emit("notification", {
          message: `Your ticket (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
          link: `${process.env.BASE_URL}/${
            roleName.toLowerCase().replace(/\s+/g, '') || "user"
          }/raise-query`,
        });

      const supportEmailPromises = supportEmails.map((email) =>
        sendTicketRaisedEmail(email, userDetails, ticketDetails).catch(
          (error) => {
            logger.error(
              `Failed to send ticket raised email to ${email}:`,
              error
            );
          }
        )
      );
      await Promise.all(supportEmailPromises);

      setTimeout(() => sendDelayedNotifications(user, ticket), 60000);

      logger.info(
        `Ticket raised by user: ${userId}, ticketNumber: ${ticket.ticketNumber}`
      );
      res.json({
        message: "Ticket raised successfully",
        ticket: {
          ...ticket.toObject(),
          ticketNumber: `Ticket - ${ticket.ticketNumber}`,
        },
      });
    } catch (error) {
      logger.error("Raise ticket error:", error);
      if (req.file) deleteLocalFile(req.file.path);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Raise a Teacher Change Request
router.post(
  "/raise-teacher-change",
  [check("description").notEmpty().withMessage("Description is required")],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in raise teacher change:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { description } = req.body;
    const userId = req.user.userId;

    try {
      const userRole = await Role.findOne({ userId });
      if (!userRole || userRole.roleName !== "Student") {
        logger.warn(`User ${userId} is not a student`);
        return res
          .status(403)
          .json({ message: "Only students can raise teacher change requests" });
      }

      const user = await User.findById(userId);
      if (!user) {
        logger.warn(`User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      const scheduledCall = await ScheduledCall.findOne({ studentIds: userId })
        .sort({ date: -1 })
        .select("teacherId");
      const teacherId = scheduledCall ? scheduledCall.teacherId : null;

      const ticket = new Ticket({
        userId,
        issueType: "Teacher Change Request",
        description,
        visibleToTeacher: false,
        teacherId,
        status: "Open",
      });
      await ticket.save();

      const supportEmails = process.env.SUPPORT_EMAIL
        ? process.env.SUPPORT_EMAIL.split(",")
        : [];

      const userDetails = {
        name: user.name,
        email: user.email,
        role: userRole.roleName,
      };

      const ticketDetails = {
        _id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        issueType: ticket.issueType,
        description: ticket.description,
        visibleToTeacher: ticket.visibleToTeacher,
        teacherId: teacherId ? teacherId.toString() : null,
      };

      const notifications = [
        new Notification({
          userId,
          message: `Your teacher change request (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
          link: `${process.env.BASE_URL}/student/raise-query`,
        }).save(),
      ];

      await Promise.all(notifications);

      getIO()
        .to(userId)
        .emit("notification", {
          message: `Your teacher change request (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
          link: `${process.env.BASE_URL}/student/raise-query`,
        });

      const supportEmailPromises = supportEmails.map((email) =>
        sendTeacherChangeRequestEmail(email, userDetails, ticketDetails).catch(
          (error) => {
            logger.error(
              `Failed to send teacher change request email to ${email}:`,
              error
            );
          }
        )
      );
      await Promise.all(supportEmailPromises);

      setTimeout(() => sendDelayedNotifications(user, ticket), 60000);

      logger.info(
        `Teacher change request raised by user: ${userId}, ticketNumber: ${ticket.ticketNumber}`
      );
      res.json({
        message: "Teacher change request raised successfully",
        ticket: {
          ...ticket.toObject(),
          ticketNumber: `Ticket - ${ticket.ticketNumber}`,
        },
      });
    } catch (error) {
      logger.error("Raise teacher change request error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Raise a Timezone Change Request
router.post(
  "/raise-timezone-change",
  [
    check("description").notEmpty().withMessage("Description is required"),
    check("visibleToTeacher")
      .optional()
      .isBoolean()
      .withMessage("visibleToTeacher must be a boolean"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn(
        "Validation errors in raise timezone change:",
        errors.array()
      );
      return res.status(400).json({ errors: errors.array() });
    }

    const { description, visibleToTeacher = false } = req.body;
    const userId = req.user.userId;

    try {
      const userRole = await Role.findOne({ userId });
      if (!userRole || !["Student", "Teacher"].includes(userRole.roleName)) {
        logger.warn(`User ${userId} is not a student or teacher`);
        return res
          .status(403)
          .json({
            message:
              "Only students and teachers can raise timezone change requests",
          });
      }

      const user = await User.findById(userId);
      if (!user) {
        logger.warn(`User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      let teacherId = null;
      let isVisibleToTeacher = visibleToTeacher;

      if (userRole.roleName === "Student") {
        let scheduledCall = await ScheduledCall.findOne({
          studentIds: userId,
          status: "Scheduled",
        })
          .sort({ date: -1 })
          .select("teacherId");
        if (scheduledCall) {
          teacherId = scheduledCall.teacherId;
        } else {
          const student = await User.findById(userId).select("subjects");
          if (student.subjects && student.subjects.length > 0) {
            const teacher = await User.findOne({
              subjects: { $in: student.subjects },
              _id: { $ne: userId },
            }).select("_id");
            teacherId = teacher ? teacher._id : null;
          }
        }
      } else {
        isVisibleToTeacher = false;
      }

      const ticket = new Ticket({
        userId,
        issueType: "Timezone Change Request",
        description,
        visibleToTeacher: isVisibleToTeacher,
        teacherId,
        status: "Open",
      });
      await ticket.save();

      const supportEmails = process.env.SUPPORT_EMAIL
        ? process.env.SUPPORT_EMAIL.split(",")
        : [];

      const userDetails = {
        name: user.name,
        email: user.email,
        role: userRole.roleName,
      };

      const ticketDetails = {
        _id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        issueType: ticket.issueType,
        description: ticket.description,
        visibleToTeacher: ticket.visibleToTeacher,
        teacherId: ticket.teacherId ? ticket.teacherId.toString() : null,
      };

      const notifications = [
        new Notification({
          userId,
          message: `Your timezone change request (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
          link: `${
            process.env.BASE_URL
          }/${userRole.roleName.toLowerCase().replace(/\s+/g, '')}/raise-query`,
        }).save(),
      ];

      if (isVisibleToTeacher && teacherId) {
        const teacher = await User.findById(teacherId);
        if (teacher) {
          notifications.push(
            new Notification({
              userId: teacherId,
              message: `New timezone change request raised by ${user.name} (Ticket Number: ${ticket.ticketNumber})`,
              link: `${process.env.BASE_URL}/teacher/tickets`,
            }).save()
          );
          getIO()
            .to(teacherId.toString())
            .emit("notification", {
              message: `New timezone change request raised by ${user.name} (Ticket Number: ${ticket.ticketNumber})`,
              link: `${process.env.BASE_URL}/teacher/tickets`,
            });
        }
      }

      await Promise.all(notifications);

      getIO()
        .to(userId)
        .emit("notification", {
          message: `Your timezone change request (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
          link: `${
            process.env.BASE_URL
          }/${userRole.roleName.toLowerCase().replace(/\s+/g, '')}/raise-query`,
        });

      const supportEmailPromises = supportEmails.map((email) =>
        sendTimezoneChangeRequestEmail(email, userDetails, ticketDetails).catch(
          (error) => {
            logger.error(
              `Failed to send timezone change request email to ${email}:`,
              error
            );
          }
        )
      );
      await Promise.all(supportEmailPromises);

      setTimeout(() => sendDelayedNotifications(user, ticket), 60000);

      logger.info(
        `Timezone change request raised by user: ${userId}, ticketNumber: ${ticket.ticketNumber}`
      );
      res.json({
        message: "Timezone change request raised successfully",
        ticket: {
          ...ticket.toObject(),
          ticketNumber: `Ticket - ${ticket.ticketNumber}`,
        },
      });
    } catch (error) {
      logger.error("Raise timezone change request error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Raise a Class Pause Request
router.post("/raise-class-pause", async (req, res) => {
  const userId = req.user.userId;

  try {
    const userRole = await Role.findOne({ userId });
    if (!userRole || userRole.roleName !== "Student") {
      logger.warn(`User ${userId} is not a student`);
      return res
        .status(403)
        .json({ message: "Only students can raise class pause requests" });
    }

    const user = await User.findById(userId);
    if (!user) {
      logger.warn(`User not found: ${userId}`);
      return res.status(404).json({ message: "User not found" });
    }

    const ticket = new Ticket({
      userId,
      issueType: "Class Pause Request",
      description: "The student has requested to pause their classes.",
      visibleToTeacher: false,
      teacherId: null,
      status: "Open",
    });
    await ticket.save();

    const supportEmails = process.env.SUPPORT_EMAIL
      ? process.env.SUPPORT_EMAIL.split(",")
      : [];

    const userDetails = {
      name: user.name,
      email: user.email,
      role: userRole.roleName,
    };

    const ticketDetails = {
      _id: ticket._id,
      ticketNumber: ticket.ticketNumber,
      issueType: ticket.issueType,
      description: ticket.description,
      visibleToTeacher: ticket.visibleToTeacher,
    };

    const notifications = [
      new Notification({
        userId,
        message: `Your class pause request (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
        link: `${process.env.BASE_URL}/student/raise-query`,
      }).save(),
    ];

    await Promise.all(notifications);

    getIO()
      .to(userId)
      .emit("notification", {
        message: `Your class pause request (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
        link: `${process.env.BASE_URL}/student/raise-query`,
      });

    const supportEmailPromises = supportEmails.map((email) =>
      sendClassPauseRequestEmail(email, userDetails, ticketDetails).catch(
        (error) => {
          logger.error(
            `Failed to send class pause request email to ${email}:`,
            error
          );
        }
      )
    );
    await Promise.all(supportEmailPromises);

    setTimeout(() => sendDelayedNotifications(user, ticket), 60000);

    logger.info(
      `Class pause request raised by user: ${userId}, ticketNumber: ${ticket.ticketNumber}`
    );
    res.json({
      message: "Class pause request raised successfully",
      ticket: {
        ...ticket.toObject(),
        ticketNumber: `Ticket - ${ticket.ticketNumber}`,
      },
    });
  } catch (error) {
    logger.error("Raise class pause request error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Rate a Ticket
router.put(
  "/:ticketId/rate",
  [
    check("rating")
      .isInt({ min: 1, max: 5 })
      .withMessage("Rating must be between 1 and 5"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in rate ticket:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const { ticketId } = req.params;
    const { rating } = req.body;
    const userId = req.user.userId;

    try {
      const ticket = await Ticket.findById(ticketId).populate(
        "userId",
        "name email"
      );
      if (!ticket) {
        logger.warn(`Ticket not found: ${ticketId}`);
        return res.status(404).json({ message: "Ticket not found" });
      }

      if (ticket.userId._id.toString() !== userId) {
        logger.warn(
          `User ${userId} is not authorized to rate ticket ${ticketId}`
        );
        return res
          .status(403)
          .json({ message: "Not authorized to rate this ticket" });
      }

      if (ticket.status !== "Resolved") {
        logger.warn(`Ticket ${ticketId} is not resolved, cannot be rated`);
        return res
          .status(400)
          .json({ message: "Only resolved tickets can be rated" });
      }

      ticket.rating = rating;
      ticket.updatedAt = new Date();
      await ticket.save();

      const userDetails = {
        name: ticket.userId.name,
        email: ticket.userId.email,
      };

      const ticketDetails = {
        ticketNumber: ticket.ticketNumber,
        description: ticket.description,
        rating: ticket.rating,
      };

      await sendTicketRatingEmail(
        userDetails.email,
        userDetails,
        ticketDetails
      );

      const supportEmails = process.env.SUPPORT_EMAIL
        ? process.env.SUPPORT_EMAIL.split(",")
        : [];

      const supportEmailPromises = supportEmails.map((email) =>
        sendTicketRatingEmail(email, userDetails, ticketDetails).catch(
          (error) => {
            logger.error(
              `Failed to send ticket rating email to ${email}:`,
              error
            );
          }
        )
      );
      await Promise.all(supportEmailPromises);

      logger.info(
        `Ticket ${ticketId} rated by user: ${userId}, rating: ${rating}`
      );
      res.json({
        message: "Rating submitted successfully",
        ticket: {
          ...ticket.toObject(),
          user: { name: ticket.userId.name, email: ticket.userId.email },
        },
      });
    } catch (error) {
      logger.error("Rate ticket error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// Raise a Subject Change Request (Teacher only)
router.post(
  "/raise-subject-change",
  [
    check("description").notEmpty().withMessage("Description is required"),
    check("currentSubject")
      .notEmpty()
      .withMessage("Current subject is required")
      .isIn(["Phonics", "Creative Writing", "Public Speaking"])
      .withMessage("Invalid current subject"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in raise subject change:", errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      issueType = "Subject Change Request",
      description,
      currentSubject,
      fileUrl,
    } = req.body;
    const userId = req.user.userId;

    try {
      const userRole = await Role.findOne({ userId });
      if (!userRole || userRole.roleName !== "Teacher") {
        logger.warn(`User ${userId} is not a teacher`);
        return res
          .status(403)
          .json({ message: "Only teachers can raise subject change requests" });
      }

      const user = await User.findById(userId);
      if (!user) {
        logger.warn(`User not found: ${userId}`);
        return res.status(404).json({ message: "User not found" });
      }

      const ticket = new Ticket({
        userId,
        issueType: "Subject Change Request",
        description,
        visibleToTeacher: false,
        teacherId: user._id,
        fileUrl,
        status: "In Progress",
      });
      await ticket.save();

      const userDetails = {
        name: user.name,
        email: user.email,
        role: userRole.roleName,
      };

      const ticketDetails = {
        _id: ticket._id,
        ticketNumber: ticket.ticketNumber,
        issueType: ticket.issueType,
        description: ticket.description,
        currentSubject: currentSubject || "Not specified",
        teacherId: ticket.teacherId ? ticket.teacherId.toString() : null,
        fileUrl: ticket.fileUrl,
      };

      const supportEmails = process.env.SUPPORT_EMAIL
        ? process.env.SUPPORT_EMAIL.split(",")
        : [];

      const supportEmailPromises = supportEmails.map((email) =>
        sendSubjectChangeRequestEmail(email, userDetails, ticketDetails).catch(
          (error) => {
            logger.error(
              `Failed to send subject change request email to ${email}:`,
              error
            );
          }
        )
      );
      await Promise.all(supportEmailPromises);

      const notifications = [
        new Notification({
          userId,
          message: `Your subject change request (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
          link: `${process.env.BASE_URL}/teacher/raise-query`,
        }).save(),
      ];
      await Promise.all(notifications);

      getIO()
        .to(userId)
        .emit("notification", {
          message: `Your subject change request (Ticket Number: ${ticket.ticketNumber}) has been raised successfully.`,
          link: `${process.env.BASE_URL}/teacher/raise-query`,
        });

      setTimeout(() => sendDelayedNotifications(user, ticket), 60000);

      logger.info(
        `Subject change request raised by user: ${userId}, ticketNumber: ${ticket.ticketNumber}`
      );
      res.status(201).json({
        message: "Subject change request raised successfully",
        ticket: {
          ticketNumber: ticket.ticketNumber,
          issueType: ticket.issueType,
          status: ticket.status,
          createdAt: ticket.createdAt,
        },
      });
    } catch (error) {
      logger.error("Raise subject change request error:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

module.exports = router;
