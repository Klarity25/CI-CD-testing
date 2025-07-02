// "use client";
// import type React from "react";
// import { useState, useEffect, useCallback } from "react";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import {
//   Users,
//   ArrowRight,
//   Settings,
//   UserPlus,
//   Shield,
//   Clock,
//   User,
//   Bell,
//   Edit,
//   BookOpen,
//   FileText,
//   Presentation,
//   FileDown,
//   PlayCircle,
//   Headphones,
//   Calendar,
//   Activity,
//   AlertCircle,
//   CheckCircle,
//   Info,
//   XCircle,
//   Sparkles,
//   BarChart3,
//   Zap,
// } from "lucide-react";
// import { useRouter } from "next/navigation";
// import { Badge } from "@/components/ui/badge";
// import { Button } from "@/components/ui/button";
// import api from "@/lib/api";
// import { motion } from "framer-motion";
// import toast from "react-hot-toast";
// import { ApiError } from "@/types";
// import { useAuth } from "@/lib/auth";

// interface UserData {
//   role: {
//     roleName: string;
//   };
// }

// interface SystemMetric {
//   name: string;
//   count: number;
//   color: string;
//   icon: React.ReactNode;
// }

// interface Notification {
//   _id: string;
//   userId: string;
//   message: string;
//   link?: string;
//   read: boolean;
//   createdAt: string;
//   updatedAt: string;
// }

// interface Course {
//   _id: string;
//   title: string;
//   duration: string;
//   teachers: string;
//   Level: string;
//   courseId: string;
// }

// function filterStudents(array: UserData[]): UserData[] {
//   return array.filter((user: UserData) => user.role?.roleName === "Student");
// }

// function filterTeachers(array: UserData[]): UserData[] {
//   return array.filter((user: UserData) => user.role?.roleName === "Teacher");
// }

// export default function SuperAdminPortal() {
//   const router = useRouter();
//   const { user, loading: authLoading, deviceId } = useAuth();
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);
//   const [coursesdetails, setCoursesdetails] = useState<Course[]>([]);
//   const [notifications, setNotifications] = useState<Notification[]>([]);
//   const [notificationsLoading, setNotificationsLoading] = useState(false);
//   const [notificationsError, setNotificationsError] = useState<string | null>(
//     null
//   );
//   const [stats, setStats] = useState({
//     totalstudents: 0,
//     totalcourses: 0,
//     activeteachers: 0,
//     totalresourses: 32,
//   });

//   const handleUnauthorized = useCallback(() => {
//     console.debug("[SuperAdminPortal] Handling unauthorized access");
//     localStorage.removeItem("token");
//     localStorage.removeItem("userId");
//     localStorage.removeItem("isLoggedIn");
//     localStorage.removeItem("deviceId");
//     router.push("/login");
//   }, [router]);

//   useEffect(() => {
//     if (authLoading) return;
//     if (!user || user.role?.roleName !== "Super Admin") {
//       console.debug("[SuperAdminPortal] Redirecting to login", {
//         user: !!user,
//         role: user?.role?.roleName,
//         authLoading,
//       });
//       handleUnauthorized();
//     }
//   }, [user, authLoading, router, handleUnauthorized]);

//   const fetchNotifications = useCallback(async (): Promise<void> => {
//     if (!user || !deviceId) {
//       handleUnauthorized();
//       return;
//     }
//     try {
//       setNotificationsLoading(true);
//       setNotificationsError(null);
//       const token = localStorage.getItem("token");

//       if (!token) {
//         handleUnauthorized();
//         return;
//       }

//       const response = await api.get("/notifications", {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           "Device-Id": deviceId,
//         },
//         params: {
//           page: 1,
//           limit: 10,
//         },
//       });

//       const { notifications: notificationsData } = response.data;
//       setNotifications(notificationsData || []);
//     } catch (error) {
//       const apiError = error as ApiError;
//       console.error("[SuperAdminPortal] Failed to fetch notifications:", apiError);
//       const errorMessage =
//         apiError.response?.data?.message ||
//         apiError.message ||
//         "Failed to load notifications";
//       setNotificationsError(errorMessage);

//       if (apiError.response?.status === 401) {
//         handleUnauthorized();
//       } else if (apiError.response?.status !== 404) {
//         toast.error(errorMessage);
//       }
//     } finally {
//       setNotificationsLoading(false);
//     }
//   }, [user, deviceId, handleUnauthorized]);

//   const markNotificationAsRead = useCallback(
//     async (notificationId: string) => {
//       if (!user || !deviceId) {
//         handleUnauthorized();
//         return;
//       }
//       try {
//         const token = localStorage.getItem("token");
//         if (!token) {
//           handleUnauthorized();
//           return;
//         }

//         await api.put(
//           `/notifications/${notificationId}/read`,
//           {},
//           {
//             headers: {
//               Authorization: `Bearer ${token}`,
//               "Device-Id": deviceId,
//             },
//           }
//         );

//         setNotifications((prev) =>
//           prev.map((notif) =>
//             notif._id === notificationId ? { ...notif, read: true } : notif
//           )
//         );
//       } catch (error) {
//         const apiError = error as ApiError;
//         console.error(
//           "[SuperAdminPortal] Failed to mark notification as read:",
//           apiError
//         );
//         const errorMessage =
//           apiError.response?.data?.message ||
//           apiError.message ||
//           "Failed to mark notification as read";
//         if (apiError.response?.status === 401) {
//           handleUnauthorized();
//         } else {
//           toast.error(errorMessage);
//         }
//       }
//     },
//     [user, deviceId, handleUnauthorized]
//   );

//   const fetchData = useCallback(async () => {
//     if (!user || !deviceId) {
//       handleUnauthorized();
//       return;
//     }
//     try {
//       setLoading(true);
//       setError(null);
//       const token = localStorage.getItem("token");
//       if (!token) {
//         handleUnauthorized();
//         return;
//       }

//       const usersResponse = await api.get("admin/users", {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           "Device-Id": deviceId,
//         },
//       });

//       const filteredStudents = filterStudents(usersResponse.data.users).length;
//       const filteredTeacher = filterTeachers(usersResponse.data.users).length;

//       const coursesResponse = await api.get("courses/all", {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           "Device-Id": deviceId,
//         },
//       });
//       setCoursesdetails(coursesResponse.data.courses);

//       await fetchNotifications();

//       setStats((prevStats) => ({
//         ...prevStats,
//         totalstudents: filteredStudents,
//         activeteachers: filteredTeacher,
//         totalcourses: coursesResponse.data.courses.length,
//       }));
//     } catch (error) {
//       const apiError = error as ApiError;
//       console.error("[SuperAdminPortal] Failed to fetch data:", apiError);
//       const errorMessage =
//         apiError.response?.data?.message ||
//         apiError.message ||
//         "Failed to load dashboard data";
//       if (apiError.response?.status === 401) {
//         handleUnauthorized();
//       } else {
//         setError(errorMessage);
//         toast.error(errorMessage);
//       }
//     } finally {
//       setLoading(false);
//     }
//   }, [user, deviceId, handleUnauthorized, fetchNotifications]);

//   useEffect(() => {
//     if (!authLoading && user && user.role?.roleName === "Super Admin") {
//       console.debug("[SuperAdminPortal] Fetching data", { userId: user._id });
//       fetchData();
//     }
//   }, [fetchData, authLoading, user]);

//   useEffect(() => {
//     if (!authLoading && user && user.role?.roleName === "Super Admin") {
//       const interval = setInterval(fetchNotifications, 30000);
//       return () => {
//         clearInterval(interval);
//       };
//     }
//   }, [fetchNotifications, authLoading, user]);

//   const resourceTypes: SystemMetric[] = [
//     {
//       name: "Presentations",
//       count: 142,
//       color: "from-blue-500 to-blue-600",
//       icon: <Presentation className="w-4 h-4" />,
//     },
//     {
//       name: "Worksheets",
//       count: 98,
//       color: "from-emerald-500 to-emerald-600",
//       icon: <FileDown className="w-4 h-4" />,
//     },
//     {
//       name: "Videos",
//       count: 86,
//       color: "from-rose-500 to-rose-600",
//       icon: <PlayCircle className="w-4 h-4" />,
//     },
//     {
//       name: "Audio",
//       count: 58,
//       color: "from-amber-500 to-amber-600",
//       icon: <Headphones className="w-4 h-4" />,
//     },
//   ];

//   const getNotificationType = (
//     message: string
//   ): "info" | "success" | "warning" | "error" => {
//     const lowerMessage = message.toLowerCase();
//     if (
//       lowerMessage.includes("error") ||
//       lowerMessage.includes("failed") ||
//       lowerMessage.includes("problem")
//     ) {
//       return "error";
//     }
//     if (
//       lowerMessage.includes("warning") ||
//       lowerMessage.includes("alert") ||
//       lowerMessage.includes("attention")
//     ) {
//       return "warning";
//     }
//     if (
//       lowerMessage.includes("success") ||
//       lowerMessage.includes("completed") ||
//       lowerMessage.includes("approved") ||
//       lowerMessage.includes("enrolled") ||
//       lowerMessage.includes("assigned")
//     ) {
//       return "success";
//     }
//     return "info";
//   };

//   const getNotificationIcon = (type: string) => {
//     switch (type) {
//       case "success":
//         return {
//           icon: <CheckCircle className="w-4 h-4" />,
//           className:
//             "bg-gradient-to-br from-emerald-100 to-green-100 text-emerald-600",
//         };
//       case "warning":
//         return {
//           icon: <AlertCircle className="w-4 h-4" />,
//           className:
//             "bg-gradient-to-br from-amber-100 to-yellow-100 text-amber-600",
//         };
//       case "error":
//         return {
//           icon: <XCircle className="w-4 h-4" />,
//           className: "bg-gradient-to-br from-red-100 to-rose-100 text-red-600",
//         };
//       default:
//         return {
//           icon: <Info className="w-4 h-4" />,
//           className:
//             "bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600",
//         };
//     }
//   };

//   const formatNotificationTime = (createdAt: string) => {
//     try {
//       const now = new Date();
//       const notificationTime = new Date(createdAt);
//       const diffInMinutes = Math.floor(
//         (now.getTime() - notificationTime.getTime()) / (1000 * 60)
//       );

//       if (diffInMinutes < 1) return "Just now";
//       if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
//       if (diffInMinutes < 1440)
//         return `${Math.floor(diffInMinutes / 60)} hours ago`;
//       return `${Math.floor(diffInMinutes / 1440)} days ago`;
//     } catch {
//       return "Unknown time";
//     }
//   };

//   const statCards = [
//     {
//       title: "Total Students",
//       value: stats.totalstudents.toLocaleString(),
//       icon: <Users className="w-7 h-7" />,
//       gradient: "from-blue-500 to-blue-600",
//       bgGradient: "from-blue-50 to-indigo-50",
//       description: "Active learners",
//       href: "/superadmin/users",
//     },
//     {
//       title: "Total Courses",
//       value: stats.totalcourses.toString(),
//       icon: <BookOpen className="w-7 h-7" />,
//       gradient: "from-emerald-500 to-green-600",
//       bgGradient: "from-emerald-50 to-green-50",
//       description: "Available courses",
//       href: "/superadmin/courses",
//     },
//     {
//       title: "Active Teachers",
//       value: stats.activeteachers.toLocaleString(),
//       icon: <Users className="w-7 h-7" />,
//       gradient: "from-violet-500 to-purple-600",
//       bgGradient: "from-violet-50 to-purple-50",
//       description: "Teaching staff",
//       href: "/superadmin/users",
//     },
//     {
//       title: "Total Resources",
//       value: stats.totalresourses.toString(),
//       icon: <FileText className="w-7 h-7" />,
//       gradient: "from-orange-500 to-red-500",
//       bgGradient: "from-orange-50 to-red-50",
//       description: "Learning materials",
//       href: "#",
//     },
//   ];

//   const quickActions = [
//     {
//       title: "Create New Course",
//       description: "Add a new course to your platform",
//       icon: <UserPlus className="w-6 h-6" />,
//       href: "superadmin/courses/create",
//       gradient: "from-orange-500 to-red-500",
//       bgGradient: "from-orange-50 to-red-50",
//     },
//     {
//       title: "Schedule Class",
//       description: "Schedule Class for a course",
//       icon: <Settings className="w-6 h-6" />,
//       href: "superadmin/schedule-call",
//       gradient: "from-violet-500 to-purple-500",
//       bgGradient: "from-violet-50 to-purple-50",
//     },
//     {
//       title: "Add New Resource",
//       description: "Upload Presentation, video, worksheet, etc.",
//       icon: <Shield className="w-6 h-6" />,
//       href: "#",
//       gradient: "from-emerald-500 to-green-500",
//       bgGradient: "from-emerald-50 to-green-50",
//     },
//   ];

//   // Render loading state until auth is resolved
//   if (authLoading || (!user && loading)) {
//     return (
//       <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
//         <div className="text-center">
//           <div className="relative">
//             <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-spin"></div>
//             <div className="absolute top-0 left-0 w-16 h-16 border-4 border-blue-600 rounded-full animate-spin border-t-transparent"></div>
//           </div>
//           <p className="mt-4 text-slate-600 font-medium">
//             Loading Super Admin Portal...
//           </p>
//         </div>
//       </div>
//     );
//   }

//   if (!user || user.role?.roleName !== "Super Admin") {
//     return null;
//   }

//   if (error) {
//     return (
//       <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
//         <div className="text-center">
//           <div className="p-4 bg-red-50 rounded-xl shadow-lg">
//             <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
//             <h2 className="text-xl font-semibold text-gray-800 mb-2">
//               Error Loading Dashboard
//             </h2>
//             <p className="text-gray-600 mb-4">{error}</p>
//             <Button
//               onClick={() => {
//                 setError(null);
//                 fetchData();
//               }}
//               className="bg-blue-600 hover:bg-blue-700 text-white"
//             >
//               Try Again
//             </Button>
//           </div>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6 mt-10">
//       <div className="max-w-7xl mx-auto space-y-8">
//         {/* Header */}
//         <motion.div
//           initial={{ opacity: 0, y: -20 }}
//           animate={{ opacity: 1, y: 0 }}
//           className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-700 p-8 text-white shadow-xl"
//         >
//           <div className="absolute inset-0 bg-black/10"></div>
//           <div className="relative flex items-center justify-between">
//             <div>
//               <div className="flex items-center gap-3 mb-2">
//                 <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
//                   <Sparkles className="w-6 h-6" />
//                 </div>
//                 <h1 className="text-4xl font-bold">Super Admin Portal</h1>
//               </div>
//               <p className="text-blue-100 text-lg">
//                 Welcome back, {user.name || "Administrator"}! Here&apos;s your
//                 dashboard overview.
//               </p>
//             </div>
//             <div className="hidden md:flex items-center gap-4">
//               <div className="flex items-center gap-2 text-blue-100 bg-white/10 px-4 py-2 rounded-lg backdrop-blur-sm">
//                 <Calendar className="w-4 h-4" />
//                 <span className="text-sm font-medium">
//                   {new Date().toLocaleDateString("en-US", {
//                     weekday: "long",
//                     month: "long",
//                     day: "numeric",
//                     year: "numeric",
//                   })}
//                 </span>
//               </div>
//             </div>
//           </div>
//           <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
//           <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
//         </motion.div>

//         {/* Stats Cards */}
//         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
//           {statCards.map((stat, index) => (
//             <motion.div
//               key={index}
//               initial={{ opacity: 0, y: 20 }}
//               animate={{ opacity: 1, y: 0 }}
//               transition={{ delay: index * 0.1 }}
//               whileHover={{ y: -5, transition: { duration: 0.2 } }}
//             >
//                <Card
//                 className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white/80 backdrop-blur-sm cursor-pointer"
//                 onClick={() => router.push(stat.href)}
//               >     
//                 <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} opacity-50`}></div>
//                 <CardContent className="relative p-6">
//                   <div className="flex items-center justify-between mb-4">
//                     <div
//                       className={`p-3 rounded-xl bg-gradient-to-br ${stat.gradient} text-white shadow-lg`}
//                     >
//                       {stat.icon}
//                     </div>
//                   </div>
//                   <div className="space-y-2">
//                     <p className="text-sm font-medium text-slate-600">
//                       {stat.title}
//                     </p>
//                     <p className="text-3xl font-bold text-slate-900">
//                       {stat.value}
//                     </p>
//                     <p className="text-sm text-slate-500">{stat.description}</p>
//                   </div>
//                 </CardContent>
//               </Card>
//             </motion.div>
//           ))}
//         </div>

//         <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
//           <div className="lg:col-span-2">
//             <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
//               <CardHeader className="pb-4">
//                 <div className="flex items-center gap-3">
//                   <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-lg">
//                     <Zap className="w-5 h-5" />
//                   </div>
//                   <div>
//                     <CardTitle className="text-xl font-bold text-slate-900">
//                       Quick Actions
//                     </CardTitle>
//                     <p className="text-sm text-slate-600">
//                       Manage users, settings, and system operations
//                     </p>
//                   </div>
//                 </div>
//               </CardHeader>
//               <CardContent className="space-y-4">
//                 {quickActions.map((action, index) => (
//                   <motion.div
//                     key={index}
//                     initial={{ opacity: 0, x: -20 }}
//                     animate={{ opacity: 1, x: 0 }}
//                     transition={{ delay: index * 0.1 }}
//                     whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
//                     onClick={() => router.push(action.href)}
//                     className="group relative overflow-hidden rounded-xl p-5 cursor-pointer transition-all duration-300 hover:shadow-lg"
//                   >
//                     <div
//                       className={`absolute inset-0 bg-gradient-to-br ${action.bgGradient} opacity-60 group-hover:opacity-80 transition-opacity`}
//                     ></div>
//                     <div className="relative flex items-center gap-4">
//                       <div
//                         className={`p-3 rounded-xl bg-gradient-to-br ${action.gradient} text-white shadow-lg group-hover:scale-110 transition-transform`}
//                       >
//                         {action.icon}
//                       </div>
//                       <div className="flex-1">
//                         <h3 className="font-semibold text-slate-900 mb-1">
//                           {action.title}
//                         </h3>
//                         <p className="text-sm text-slate-600">
//                           {action.description}
//                         </p>
//                       </div>
//                       <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-1 transition-all" />
//                     </div>
//                   </motion.div>
//                 ))}
//               </CardContent>
//             </Card>
//           </div>

//           {/* Resource Types */}
//           <div>
//             <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
//               <CardHeader className="pb-4">
//                 <div className="flex items-center gap-3">
//                   <div className="p-2 bg-gradient-to-br from-emerald-500 to-green-600 text-white rounded-lg">
//                     <BarChart3 className="w-5 h-5" />
//                   </div>
//                   <div>
//                     <CardTitle className="text-xl font-bold text-slate-900">
//                       Resource Types
//                     </CardTitle>
//                     <p className="text-sm text-slate-600">
//                       Distribution of resource types
//                     </p>
//                   </div>
//                 </div>
//               </CardHeader>
//               <CardContent className="space-y-5">
//                 {resourceTypes.map((resource, index) => (
//                   <motion.div
//                     key={index}
//                     initial={{ opacity: 0, scale: 0.9 }}
//                     animate={{ opacity: 1, scale: 1 }}
//                     transition={{ delay: index * 0.1 }}
//                     className="flex items-center justify-between"
//                   >
//                     <div className="flex items-center gap-3">
//                       <div
//                         className={`p-2.5 rounded-lg bg-gradient-to-br ${resource.color} text-white shadow-md`}
//                       >
//                         {resource.icon}
//                       </div>
//                       <span className="font-medium text-slate-900">
//                         {resource.name}
//                       </span>
//                     </div>
//                     <div className="flex items-center gap-3">
//                       <span className="font-bold text-slate-900 w-8 text-right">
//                         {resource.count}
//                       </span>
//                     </div>
//                   </motion.div>
//                 ))}
//               </CardContent>
//             </Card>
//           </div>
//         </div>

//         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
//           <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
//             <CardHeader className="flex flex-row items-center justify-between pb-4">
//               <div className="flex items-center gap-3">
//                 <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-lg">
//                   <BookOpen className="w-5 h-5" />
//                 </div>
//                 <div>
//                   <CardTitle className="text-xl font-bold text-slate-900">
//                     Recent Courses
//                   </CardTitle>
//                   <p className="text-sm text-slate-600">
//                     Recently created and active courses
//                   </p>
//                 </div>
//               </div>
//               <Button
//                 variant="outline"
//                 size="sm"
//                 className="border-slate-200 cursor-pointer hover:bg-slate-50"
//                 onClick={() => router.push("/superadmin/courses")}
//               >
//                 View All
//               </Button>
//             </CardHeader>
//             <CardContent className="space-y-4">
//               {coursesdetails?.slice(0, 4).map((course, index) => (
//                 <motion.div
//                   key={course.courseId || index}
//                   onClick={() =>
//                     router.push(`/superadmin/courses/${course.courseId}`)
//                   }
//                   className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-slate-50 to-blue-50 hover:from-blue-50 hover:to-indigo-50 transition-all duration-300 border border-slate-200 cursor-pointer"
//                   initial={{ opacity: 0, y: 20 }}
//                   animate={{ opacity: 1, y: 0 }}
//                   transition={{ delay: index * 0.1 }}
//                   whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
//                 >
//                   <div className="flex items-center justify-between">
//                     <div className="flex-1 min-w-0">
//                       <h3 className="font-semibold text-slate-900 mb-3 text-lg">
//                         {course.title}
//                       </h3>
//                       <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 mb-3">
//                         <div className="flex items-center gap-1 bg-white/60 px-2 py-1 rounded-md">
//                           <Clock className="w-3 h-3" />
//                           <span>{course.duration}</span>
//                         </div>
//                         <div className="flex items-center gap-1 bg-white/60 px-2 py-1 rounded-md">
//                           <User className="w-3 h-3" />
//                           <span>{course.teachers}</span>
//                         </div>
//                         <div className="flex items-center gap-1 bg-white/60 px-2 py-1 rounded-md">
//                           <Clock className="w-3 h-3" />
//                           <span>{course.Level}</span>
//                         </div>
//                       </div>
//                     </div>
//                     <div className="flex items-center gap-2 ml-4">
//                       <Button
//                         size="sm"
//                         variant="outline"
//                         className="h-9 w-9 p-0 cursor-pointer border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-600 transition-all duration-200 group"
//                         onClick={(e) => {
//                           e.stopPropagation();
//                           router.push(`/superadmin/courses/${course.courseId}/edit`);
//                         }}
//                         title="Edit Course"
//                       >
//                         <Edit className="w-4 h-4 cursor-pointer group-hover:scale-110 transition-transform" />
//                       </Button>
//                     </div>
//                   </div>
//                 </motion.div>
//               ))}
//             </CardContent>
//           </Card>

//           <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
//             <CardHeader className="flex flex-row items-center justify-between pb-4">
//               <div className="flex items-center gap-3">
//                 <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-lg">
//                   <Bell className="w-5 h-5" />
//                 </div>
//                 <div>
//                   <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
//                     Latest Notifications
//                     {notifications.filter((n) => !n.read).length > 0 && (
//                       <Badge className="bg-gradient-to-r from-red-50 to-rose-50 text-red-700 border border-red-200">
//                         {notifications.filter((n) => !n.read).length} unread
//                       </Badge>
//                     )}
//                   </CardTitle>
//                   <p className="text-sm text-slate-600">
//                     Latest system notifications
//                   </p>
//                 </div>
//               </div>
//               <Button
//                 variant="outline"
//                 size="sm"
//                 onClick={fetchNotifications}
//                 disabled={notificationsLoading}
//                 className="border-slate-200 cursor-pointer hover:bg-slate-50"
//               >
//                 <Bell className="w-4 h-4 mr-2" />
//                 {notificationsLoading ? "Loading..." : "Refresh"}
//               </Button>
//             </CardHeader>
//             <CardContent className="space-y-4">
//               {notificationsLoading ? (
//                 <div className="flex items-center justify-center py-12">
//                   <div className="relative">
//                     <div className="w-8 h-8 border-4 border-blue-200 rounded-full animate-spin"></div>
//                     <div className="absolute top-0 left-0 w-8 h-8 border-4 border-blue-600 rounded-full animate-spin border-t-transparent"></div>
//                   </div>
//                 </div>
//               ) : notificationsError ? (
//                 <div className="text-center py-12">
//                   <div className="p-3 bg-gradient-to-br from-red-100 to-rose-100 text-red-600 rounded-full w-fit mx-auto mb-4">
//                     <XCircle className="w-8 h-8" />
//                   </div>
//                   <p className="text-red-600 font-semibold mb-1">
//                     Failed to load notifications
//                   </p>
//                   <p className="text-sm text-slate-500 mb-4">
//                     {notificationsError}
//                   </p>
//                   <Button
//                     variant="outline"
//                     size="sm"
//                     onClick={fetchNotifications}
//                     className="border-slate-200"
//                   >
//                     Try Again
//                   </Button>
//                 </div>
//               ) : notifications.length > 0 ? (
//                 notifications.slice(0, 4).map((notification, index) => {
//                   const notificationType = getNotificationType(
//                     notification.message
//                   );
//                   const notificationIcon =
//                     getNotificationIcon(notificationType);

//                   return (
//                     <motion.div
//                       key={notification._id}
//                       initial={{ opacity: 0, x: 20 }}
//                       animate={{ opacity: 1, x: 0 }}
//                       transition={{ delay: index * 0.1 }}
//                       whileHover={{
//                         scale: 1.02,
//                         transition: { duration: 0.2 },
//                       }}
//                       className={`relative overflow-hidden rounded-xl p-4 cursor-pointer transition-all duration-300 border ${
//                         notification.read
//                           ? "bg-gradient-to-br from-slate-50 to-gray-50 hover:from-gray-50 hover:to-slate-100 border-slate-200"
//                           : "bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-indigo-50 hover:to-blue-100 border-blue-200 shadow-md"
//                       }`}
//                       onClick={() =>
//                         !notification.read &&
//                         markNotificationAsRead(notification._id)
//                       }
//                     >
//                       <div className="flex items-start gap-4">
//                         <div className="flex-shrink-0">
//                           <div
//                             className={`w-10 h-10 rounded-full flex items-center justify-center ${notificationIcon.className} shadow-sm`}
//                           >
//                             {notificationIcon.icon}
//                           </div>
//                         </div>
//                         <div className="flex-1 min-w-0">
//                           <p className="text-sm text-slate-700 line-clamp-2 mb-3 leading-relaxed">
//                             {notification.message}
//                           </p>
//                           <div className="flex items-center gap-2">
//                             <Activity className="w-3 h-3 text-slate-400" />
//                             <p className="text-xs text-slate-500 font-medium">
//                               {formatNotificationTime(notification.createdAt)}
//                             </p>
//                           </div>
//                         </div>
//                         {!notification.read && (
//                           <div className="w-2.5 h-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mt-2 shadow-sm"></div>
//                         )}
//                       </div>
//                     </motion.div>
//                   );
//                 })
//               ) : (
//                 <div className="text-center py-12">
//                   <div className="p-3 bg-gradient-to-br from-slate-100 to-gray-100 text-slate-400 rounded-full w-fit mx-auto mb-4">
//                     <Bell className="w-8 h-8" />
//                   </div>
//                   <p className="font-semibold text-slate-600 mb-1">
//                     No notifications found
//                   </p>
//                   <p className="text-sm text-slate-500">
//                     Check back later for updates
//                   </p>
//                 </div>
//               )}
//             </CardContent>
//           </Card>
//         </div>
//       </div>
//     </div>
//   );
// }

"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  BookOpen,
  Users,
  FileText,
  Clock,
  TrendingUp,
  ArrowUpRight,
  User,
  MessageSquare,
  Settings,
  Bell,
  BarChart3,
  Sparkles,
  Star,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";
import toast from "react-hot-toast";
import moment from "moment-timezone";
import type { ScheduledCall, ApiError, Ticket } from "@/types";
import Loader from "@/components/Loader";

interface DashboardStats {
  totalScheduledCalls: number;
  upcomingCalls: number;
  completedCalls: number;
  openTickets: number;
  resolvedTickets: number;
}

const formatDateTime = (date: string) => {
  const callDate = new Date(date);
  return callDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const formatTimeRange = (
  date: string,
  startTime: string,
  endTime: string,
  timezone: string
) => {
  try {
    let parsedDate = date;
    if (!moment(date, "YYYY-MM-DD", true).isValid()) {
      const dateMoment = moment(date);
      if (!dateMoment.isValid()) {
        return "Invalid Date";
      }
      parsedDate = dateMoment.format("YYYY-MM-DD");
    }

    const timeFormats = [
      "h:mm a",
      "H:mm",
      "HH:mm",
      "h:mm A",
      "HH:mm:ss",
      "h:mm:ss a",
    ];

    let startMoment: moment.Moment | null = null;
    let endMoment: moment.Moment | null = null;

    for (const format of timeFormats) {
      startMoment = moment.tz(
        `${parsedDate} ${startTime}`,
        `YYYY-MM-DD ${format}`,
        timezone
      );
      if (startMoment.isValid()) {
        break;
      }
    }

    for (const format of timeFormats) {
      endMoment = moment.tz(
        `${parsedDate} ${endTime}`,
        `YYYY-MM-DD ${format}`,
        timezone
      );
      if (endMoment.isValid()) {
        break;
      }
    }

    if (!startMoment?.isValid() || !endMoment?.isValid()) {
      return "Invalid Time";
    }

    const startFormatted = startMoment.format("h:mm A");
    const endFormatted = endMoment.format("h:mm A");
    return `${startFormatted} - ${endFormatted}`;
  } catch {
    return "Invalid Time";
  }
};

const isJoinLinkEnabled = (
  date: string,
  startTime: string,
  endTime: string,
  timezone: string
) => {
  const now = moment.tz(timezone);
  try {
    const startMoment = moment.tz(
      `${date} ${startTime}`,
      "YYYY-MM-DD H:mm",
      timezone
    );
    const endMoment = moment.tz(
      `${date} ${endTime}`,
      "YYYY-MM-DD H:mm",
      timezone
    );

    if (!startMoment.isValid() || !endMoment.isValid()) {
      return false;
    }

    const enableStart = startMoment.clone().subtract(10, "minutes");
    return now.isBetween(enableStart, endMoment, undefined, "[]");
  } catch {
    return false;
  }
};

const isOngoingClass = (
  date: string,
  startTime: string,
  endTime: string,
  timezone: string
) => {
  const now = moment.tz(timezone);
  try {
    const startMoment = moment.tz(
      `${date} ${startTime}`,
      "YYYY-MM-DD H:mm",
      timezone
    );
    const endMoment = moment.tz(
      `${date} ${endTime}`,
      "YYYY-MM-DD H:mm",
      timezone
    );

    if (!startMoment?.isValid() || !endMoment?.isValid()) {
      return false;
    }

    return now.isBetween(startMoment, endMoment, undefined, "[]");
  } catch {
    return false;
  }
};

export default function StudentDashboard() {
  const { user, loading: authLoading, deviceId } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("Overview");
  const [upcomingCalls, setUpcomingCalls] = useState<ScheduledCall[]>([]);
  const [ongoingCall, setOngoingCall] = useState<ScheduledCall | null>(null);
  const [, setTickets] = useState<Ticket[]>([]);
  const [dashboardStats, setDashboardStats] = useState<DashboardStats>({
    totalScheduledCalls: 0,
    upcomingCalls: 0,
    completedCalls: 0,
    openTickets: 0,
    resolvedTickets: 0,
  });
  const [callsLoading, setCallsLoading] = useState(true);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleUnauthorized = useCallback(() => {
    console.debug("[StudentDashboard] Handling unauthorized access");
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("isLoggedIn");
    router.push("/login");
  }, [router]);

  useEffect(() => {
    if (!authLoading && (!user || user?.role?.roleName !== "Student")) {
      console.debug("[StudentDashboard] Redirecting to login", {
        user: !!user,
        role: user?.role?.roleName,
        authLoading,
      });
      handleUnauthorized();
    }
  }, [user, authLoading, router, handleUnauthorized]);

  const fetchCalls = useCallback(async () => {
    if (!user || !deviceId) return;
    try {
      setCallsLoading(true);
      setError(null);
      const token = localStorage.getItem("token");
      if (!token) {
        handleUnauthorized();
        return;
      }

      let allCalls: ScheduledCall[] = [];
      let page = 1;
      let hasMore = true;
      const limit = 10;

      while (hasMore) {
        const callsResponse = await api.get(
          `/schedule/student/calls?page=${page}&limit=${limit}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Device-Id": deviceId,
            },
          }
        );

        allCalls = [...allCalls, ...callsResponse.data.calls];
        hasMore = page < callsResponse.data.pages;
        page++;
      }

      const now = moment.tz("Asia/Kolkata");

      const ongoingCalls = allCalls.filter((call) => {
        return (
          (call.status === "Scheduled" || call.status === "Rescheduled") &&
          isOngoingClass(
            call.date,
            call.startTime,
            call.endTime,
            call.timezone || "Asia/Kolkata"
          )
        );
      });

      const allUpcomingCalls = allCalls
        .filter((call) => {
          const callDate = moment.tz(
            call.date,
            call.timezone || "Asia/Kolkata"
          );
          return (
            (call.status === "Scheduled" || call.status === "Rescheduled") &&
            callDate.isSameOrAfter(now, "day") &&
            !isOngoingClass(
              call.date,
              call.startTime,
              call.endTime,
              call.timezone || "Asia/Kolkata"
            )
          );
        })
        .sort((a, b) => {
          const dateA = moment
            .tz(
              `${a.date} ${a.startTime}`,
              "YYYY-MM-DD h:mm a",
              a.timezone || "Asia/Kolkata"
            )
            .valueOf();
          const dateB = moment
            .tz(
              `${b.date} ${b.startTime}`,
              "YYYY-MM-DD h:mm a",
              b.timezone || "Asia/Kolkata"
            )
            .valueOf();
          return dateA - dateB;
        });

      const completedCalls = allCalls.filter(
        (call) => call.status === "Completed"
      ).length;
      const totalScheduledCalls = allCalls.length;

      setOngoingCall(ongoingCalls[0] || null);
      setUpcomingCalls(allUpcomingCalls);
      setDashboardStats((prev) => ({
        ...prev,
        totalScheduledCalls,
        upcomingCalls: allUpcomingCalls.length,
        completedCalls,
      }));
    } catch (error) {
      const apiError = error as ApiError;
      console.error("[StudentDashboard] Failed to fetch calls:", apiError);
      const errorMessage =
        apiError.response?.data?.message || "Failed to fetch calls";
      setError(errorMessage);
      if (apiError.response?.status === 401) {
        handleUnauthorized();
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setCallsLoading(false);
    }
  }, [user, deviceId, handleUnauthorized]);

  const fetchTickets = useCallback(async () => {
    if (!user || !deviceId) return;
    try {
      setTicketsLoading(true);
      setError(null);
      const token = localStorage.getItem("token");
      if (!token) {
        handleUnauthorized();
        return;
      }

      const response = await api.get("/tickets", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Device-Id": deviceId,
        },
      });

      const ticketsData = response.data.tickets || [];
      setTickets(ticketsData);

      const openTickets = ticketsData.filter(
        (ticket: Ticket) =>
          ticket.status === "Open" || ticket.status === "In-progress"
      ).length;
      const resolvedTickets = ticketsData.filter(
        (ticket: Ticket) => ticket.status === "Resolved"
      ).length;

      setDashboardStats((prev) => ({
        ...prev,
        openTickets,
        resolvedTickets,
      }));
    } catch (error) {
      const apiError = error as ApiError;
      console.error("[StudentDashboard] Failed to fetch tickets:", apiError);
      const errorMessage =
        apiError.response?.data?.message || "Failed to fetch tickets";
      setError(errorMessage);
      if (apiError.response?.status === 401) {
        handleUnauthorized();
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setTicketsLoading(false);
    }
  }, [user, deviceId, handleUnauthorized]);

  useEffect(() => {
    if (!authLoading && user && user.role?.roleName === "Student") {
      console.debug("[StudentDashboard] Fetching data", { userId: user._id });
      fetchCalls();
      fetchTickets();
    }
  }, [fetchCalls, fetchTickets, authLoading, user]);

  const handleJoinCall = async (zoomLink: string) => {
    try {
      if (zoomLink) {
        window.open(zoomLink, "_blank", "noopener,noreferrer");
      } else {
        toast.error("No Zoom link available");
      }
    } catch {
      toast.error("Failed to join call");
    }
  };

  const getCurrentDate = () => {
    return moment().format("MMM DD, YYYY");
  };

  if (authLoading || (!user && callsLoading)) {
    return (
      <div className="text-center">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-teal-400 to-cyan-400 rounded-full blur-xl opacity-20 animate-pulse"></div>

          <Loader
            height="80"
            width="80"
            color="#06b6d4"
            ariaLabel="triangle-loading"
            wrapperStyle={{}}
            wrapperClass=""
            visible={true}
          />

          <p className="mt-6 text-teal-700 font-medium text-lg">
            Loading your dashboard...
          </p>
          <div className="flex items-center justify-center gap-1 mt-2">
            <Sparkles className="w-4 h-4 text-teal-500 animate-pulse" />
            <span className="text-teal-600 text-sm">
              Preparing your learning space
            </span>
            <Sparkles className="w-4 h-4 text-teal-500 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!user || user.role?.roleName !== "Student") {
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-teal-100 flex items-center justify-center">
        <div className="text-center">
          <div className="p-4 bg-red-50 rounded-xl shadow-lg">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              Error Loading Dashboard
            </h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button
              onClick={() => {
                setError(null);
                fetchCalls();
                fetchTickets();
              }}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-teal-100 pt-20 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Header with welcome banner */}
        <div className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-r from-teal-600 to-cyan-700 shadow-2xl">
          <div className="absolute inset-0 opacity-20">
            <svg className="h-full w-full" viewBox="0 0 800 800">
              <defs>
                <pattern
                  id="grid"
                  width="40"
                  height="40"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 40 0 L 0 0 0 40"
                    fill="none"
                    stroke="white"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
          <div className="absolute top-4 right-4 opacity-30">
            <div className="flex gap-2">
              <div className="w-3 h-3 bg-yellow-300 rounded-full animate-pulse"></div>
              <div className="w-3 h-3 bg-pink-300 rounded-full animate-pulse delay-75"></div>
              <div className="w-3 h-3 bg-cyan-300 rounded-full animate-pulse delay-150"></div>
            </div>
          </div>
          <div className="relative z-10 px-6 py-8 md:px-10 md:py-12 flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2 bg-white/20 backdrop-blur-sm rounded-xl">
                  <Star className="w-6 h-6 text-yellow-300" />
                </div>
                <h1 className="text-3xl md:text-4xl font-bold text-white">
                  Welcome back, {user?.name} !
                </h1>
              </div>
              <p className="text-cyan-100 text-lg md:text-xl max-w-2xl">
                Ready to continue your learning journey? Track your progress and
                join your classes seamlessly.
              </p>
            </div>
            <div className="mt-4 md:mt-0 flex items-center gap-3 bg-white/20 backdrop-blur-sm px-5 py-3 rounded-2xl text-white border border-white/20">
              <Calendar className="w-5 h-5 text-cyan-200" />
              <span className="font-medium">{getCurrentDate()}</span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex align-center justify-center flex-wrap gap-3 mb-8">
          {["Overview", "Schedule"].map((tab, index) => {
            const colors = [
              "from-teal-500 to-cyan-600",
              "from-cyan-500 to-teal-600",
              "from-blue-500 to-indigo-600",
            ];
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 cursor-pointer rounded-2xl font-medium transition-all transform hover:scale-105 ${
                  activeTab === tab
                    ? `bg-gradient-to-r ${colors[index]} text-white shadow-lg cursor-pointer shadow-cyan-200`
                    : "bg-white text-teal-700 hover:bg-teal-50 shadow-md cursor-pointer hover:shadow-lg"
                }`}
              >
                {tab === "Overview" && (
                  <BarChart3 className="w-4 h-4 cursor-pointer inline-block mr-2" />
                )}
                {tab === "Schedule" && (
                  <Calendar className="w-4 h-4 inline-block mr-2" />
                )}
                {tab}
              </button>
            );
          })}
        </div>

        {activeTab === "Overview" && (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {/* Total Classes */}
              <Card
                className="bg-gradient-to-br from-teal-50 to-cyan-100 border-0 shadow-lg hover:shadow-xl transition-all transform hover:scale-105 overflow-hidden cursor-pointer"
                onClick={() => router.push("/student/schedule")}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-2xl shadow-lg">
                      <BookOpen className="w-6 h-6 text-white" />
                    </div>
                    <div className="bg-teal-100 text-teal-700 text-xs font-bold px-3 py-1 rounded-full border border-teal-200">
                      ALL TIME
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-teal-600 font-semibold">Total Classes</p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
                      {callsLoading ? (
                        <span className="inline-block w-12 h-8 bg-gradient-to-r from-teal-200 to-cyan-200 animate-pulse rounded"></span>
                      ) : (
                        dashboardStats.totalScheduledCalls
                      )}
                    </p>
                    <div className="flex items-center text-cyan-600 text-sm font-medium">
                      <TrendingUp className="w-4 h-4 mr-1" />
                      <span>Scheduled</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Upcoming Classes */}
              <Card
                className="border-0 shadow-lg hover:shadow-xl transition-all transform hover:scale-105 overflow-hidden cursor-pointer"
                onClick={() => router.push("/student/schedule")}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gradient-to-r from-cyan-500 to-teal-600 rounded-2xl shadow-lg">
                      <Clock className="w-6 h-6 text-white" />
                    </div>
                    <div className="bg-cyan-100 text-cyan-700 text-xs font-bold px-3 py-1 rounded-full border border-cyan-200">
                      THIS WEEK
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-teal-600 font-semibold">
                      Upcoming Classes
                    </p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-teal-600 bg-clip-text text-transparent">
                      {callsLoading ? (
                        <span className="inline-block w-12 h-8 bg-gradient-to-r from-cyan-200 to-teal-200 animate-pulse rounded"></span>
                      ) : (
                        dashboardStats.upcomingCalls
                      )}
                    </p>
                    <div className="flex items-center text-cyan-600 text-sm font-medium">
                      <Clock className="w-4 h-4 mr-1" />
                      <span>Scheduled soon</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Completed Classes */}
              <Card
                className="bg-gradient-to-br from-cyan-50 to-teal-100 border-0 shadow-lg hover:shadow-xl transition-all transform hover:scale-105 overflow-hidden cursor-pointer"
                onClick={() => router.push("/student/schedule")}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gradient-to-r from-cyan-500 to-teal-600 rounded-2xl shadow-lg">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    <div className="bg-cyan-100 text-cyan-700 text-xs font-bold px-3 py-1 rounded-full border border-cyan-200">
                      COMPLETED
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-teal-600 font-semibold">
                      Completed Classes
                    </p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-cyan-600 to-teal-600 bg-clip-text text-transparent">
                      {callsLoading ? (
                        <span className="inline-block w-12 h-8 bg-gradient-to-r from-cyan-200 to-teal-200 animate-pulse rounded"></span>
                      ) : (
                        dashboardStats.completedCalls
                      )}
                    </p>
                    <div className="flex items-center text-cyan-600 text-sm font-medium">
                      <TrendingUp className="w-4 h-4 mr-1" />
                      <span>Total completed</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Support Tickets */}
              <Card
                className="bg-gradient-to-br from-orange-50 to-amber-100 border-0 shadow-lg hover:shadow-xl transition-all transform hover:scale-105 overflow-hidden cursor-pointer"
                onClick={() => router.push("/student/raise-query")}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-gradient-to-r from-orange-500 to-amber-600 rounded-2xl shadow-lg">
                      <FileText className="w-6 h-6 text-white" />
                    </div>
                    <div className="bg-orange-100 text-orange-700 text-xs font-bold px-3 py-1 rounded-full border border-orange-200">
                      SUPPORT
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-teal-600 font-semibold">
                      Support Tickets
                    </p>
                    <p className="text-3xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent">
                      {ticketsLoading ? (
                        <span className="inline-block w-12 h-8 bg-gradient-to-r from-orange-200 to-amber-200 animate-pulse rounded"></span>
                      ) : (
                        `${dashboardStats.openTickets}/${dashboardStats.resolvedTickets}`
                      )}
                    </p>
                    <div className="flex items-center text-orange-600 text-sm font-medium">
                      <MessageSquare className="w-4 h-4 mr-1" />
                      <span>Open/Resolved</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Ongoing/Upcoming Classes */}
              <Card className="bg-white border-0 shadow-xl hover:shadow-2xl transition-all overflow-hidden">
                <CardHeader className="border-b from-teal-50 to-cyan-50 pb-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-bold text-teal-900 flex items-center gap-3">
                      {ongoingCall ? (
                        <>
                          <div className="relative">
                            <div className="p-2 bg-gradient-to-r from-red-500 to-pink-600 rounded-xl">
                              <Clock className="w-5 h-5 text-white" />
                            </div>
                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
                          </div>
                          <span className="bg-gradient-to-r from-red-500 via-pink-500 to-pink-400 bg-clip-text text-transparent font-semibold drop-shadow-sm">
                            Ongoing Class
                          </span>
                        </>
                      ) : (
                        <>
                          <div className="p-2 rounded-xl">
                            <Calendar className="w-5 h-5 text-white" />
                          </div>
                          <span className="bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
                            Upcoming Classes
                          </span>
                        </>
                      )}
                    </CardTitle>
                    <Link href="/student/schedule">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 gap-1 rounded-xl cursor-pointer"
                      >
                        View All
                        <ArrowUpRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {callsLoading ? (
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-teal-400 to-cyan-400 rounded-full blur-xl opacity-20 animate-pulse"></div>
                      <Loader
                        height="40"
                        width="40"
                        color="#06b6d4"
                        ariaLabel="triangle-loading"
                        wrapperStyle={{}}
                        wrapperClass=""
                        visible={true}
                      />
                    </div>
                  ) : ongoingCall ? (
                    <div className="p-6 bg-gradient-to-r from-red-400 to-pink-500 border-t border-b border-teal-200">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-3">
                            <Badge className="bg-gradient-to-r from-red-500 to-pink-600 text-white px-3 py-1 text-xs font-bold animate-pulse">
                              🔴 LIVE NOW
                            </Badge>
                            <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
                          </div>
                          <h3 className="font-bold text-teal-900 text-lg mt-3">
                            {ongoingCall.classType} - {ongoingCall.type}
                          </h3>
                          <p className="text-sm text-teal-800 mt-1 font-medium">
                            {formatDateTime(ongoingCall.date)},{" "}
                            {formatTimeRange(
                              ongoingCall.date,
                              ongoingCall.startTime,
                              ongoingCall.endTime,
                              ongoingCall.timezone || "Asia/Kolkata"
                            )}
                          </p>
                        </div>
                        <Button
                          className="bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white rounded-2xl px-8 py-3 shadow-lg shadow-red-200 transition-all hover:shadow-red-300 transform hover:scale-105 font-bold"
                          onClick={() => handleJoinCall(ongoingCall.zoomLink)}
                        >
                          🚀 Join Now
                        </Button>
                      </div>
                    </div>
                  ) : upcomingCalls.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                      <div className="p-4 bg-gradient-to-r from-teal-100 to-cyan-100 rounded-3xl mb-4">
                        <Calendar className="w-12 h-12 text-teal-400" />
                      </div>
                      <p className="text-teal-600 font-semibold text-lg">
                        No upcoming classes scheduled
                      </p>
                      <p className="text-teal-400 text-sm mt-1">
                        Check back later for updates
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-teal-100">
                      {upcomingCalls.slice(0, 4).map((call, index) => (
                        <div
                          key={call._id}
                          className="p-6 hover:bg-gradient-to-r hover:from-teal-50 hover:to-cyan-50 transition-all"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex items-start gap-4">
                              <div
                                className={`p-3 bg-gradient-to-r ${
                                  index % 3 === 0
                                    ? "from-teal-500 to-cyan-600"
                                    : index % 3 === 1
                                    ? "from-cyan-500 to-teal-600"
                                    : "from-teal-500 to-cyan-600"
                                } rounded-2xl shrink-0 mt-1 shadow-lg`}
                              >
                                <Clock className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <h3 className="font-bold text-teal-900">
                                  {call.classType} - {call.type}
                                </h3>
                                <p className="text-sm text-teal-600 mt-1 font-medium">
                                  {formatDateTime(call.date)},{" "}
                                  {formatTimeRange(
                                    call.date,
                                    call.startTime,
                                    call.endTime,
                                    call.timezone || "Asia/Kolkata"
                                  )}
                                </p>
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge className="bg-gradient-to-r from-teal-100 to-cyan-100 text-teal-800 text-xs font-bold border border-teal-200">
                                    ✅ Scheduled
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            <Button
                              className={`rounded-2xl px-6 py-2 shadow-md transition-all transform hover:scale-105 font-semibold ${
                                isJoinLinkEnabled(
                                  call.date,
                                  call.startTime,
                                  call.endTime,
                                  call.timezone || "Asia/Kolkata"
                                )
                                  ? "bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white shadow-teal-200"
                                  : "bg-gradient-to-r from-teal-100 to-cyan-100 text-teal-500"
                              }`}
                              onClick={() => handleJoinCall(call.zoomLink)}
                              disabled={
                                !isJoinLinkEnabled(
                                  call.date,
                                  call.startTime,
                                  call.endTime,
                                  call.timezone || "Asia/Kolkata"
                                )
                              }
                            >
                              {isJoinLinkEnabled(
                                call.date,
                                call.startTime,
                                call.endTime,
                                call.timezone || "Asia/Kolkata"
                              )
                                ? "🚀 Join"
                                : "⏰ Join (10 min before)"}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card className="bg-white border-0 shadow-xl hover:shadow-2xl transition-all overflow-hidden">
                <CardHeader className="from-teal-50">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-bold text-teal-900 flex items-center gap-3">
                      <div className="p-2 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl">
                        <Settings className="w-5 h-5 text-white" />
                      </div>
                      <span className="bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
                        Quick Actions
                      </span>
                    </CardTitle>
                    <Badge className="bg-gradient-to-r from-teal-100 to-cyan-100 text-teal-700 border border-teal-200 font-bold">
                      🎯 Student Tools
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6 grid gap-4">
                  <Link href="/student/schedule">
                    <div className="group flex items-center justify-between p-5 bg-gradient-to-r from-teal-50 to-cyan-100 rounded-2xl hover:from-teal-100 hover:to-cyan-200 transition-all cursor-pointer border border-teal-100 transform hover:scale-105 shadow-md hover:shadow-lg">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-2xl shadow-lg group-hover:shadow-xl transition-shadow">
                          <Calendar className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-teal-900">
                            📅 View Schedule
                          </h3>
                          <p className="text-sm text-teal-600 font-medium">
                            See all your upcoming classes
                          </p>
                        </div>
                      </div>
                      <ArrowUpRight className="w-5 h-5 text-teal-600 opacity-70 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>

                  <Link href="/student/profile">
                    <div className="group flex items-center justify-between p-5 bg-gradient-to-r from-cyan-50 to-teal-100 rounded-2xl hover:from-cyan-100 hover:to-teal-200 transition-all cursor-pointer border border-cyan-100 transform hover:scale-105 shadow-md hover:shadow-lg">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-r from-cyan-500 to-teal-600 rounded-2xl shadow-lg group-hover:shadow-xl transition-shadow">
                          <User className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-teal-900">
                            👤 My Profile
                          </h3>
                          <p className="text-sm text-teal-600 font-medium">
                            Update your information
                          </p>
                        </div>
                      </div>
                      <ArrowUpRight className="w-5 h-5 text-cyan-600 opacity-70 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>

                  <Link href="/student/raise-query">
                    <div className="group flex items-center justify-between p-5 bg-gradient-to-r from-purple-50 to-pink-100 rounded-2xl hover:from-purple-100 hover:to-pink-200 transition-all cursor-pointer border border-purple-100 transform hover:scale-105 shadow-md hover:shadow-lg">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-r from-purple-500 to-pink-600 rounded-2xl shadow-lg group-hover:shadow-xl transition-shadow">
                          <MessageSquare className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-teal-900">
                            💬 Support Tickets
                          </h3>
                          <p className="text-sm text-teal-600 font-medium">
                            View your support requests
                          </p>
                        </div>
                      </div>
                      <ArrowUpRight className="w-5 h-5 text-purple-600 opacity-70 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>

                  <Link href="/student/raise-query/new">
                    <div className="group flex items-center justify-between p-5 bg-gradient-to-r from-orange-50 to-amber-100 rounded-2xl hover:from-orange-100 hover:to-amber-200 transition-all cursor-pointer border border-orange-100 transform hover:scale-105 shadow-md hover:shadow-lg">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-r from-orange-500 to-amber-600 rounded-2xl shadow-lg group-hover:shadow-xl transition-shadow">
                          <Bell className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-teal-900">
                            🎫 Raise Query
                          </h3>
                          <p className="text-sm text-teal-600 font-medium">
                            Create new support ticket
                          </p>
                        </div>
                      </div>
                      <ArrowUpRight className="w-5 h-5 text-orange-600 opacity-70 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {activeTab === "Schedule" && (
          <div className="bg-gradient-to-br from-white to-cyan-50 rounded-3xl shadow-xl p-8 text-center border border-cyan-100">
            <div className="bg-gradient-to-r from-teal-500 to-cyan-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
              <Calendar className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-3xl font-bold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent mb-4">
              📅 Class Schedule
            </h3>
            <p className="text-teal-600 mb-6 max-w-md mx-auto font-medium">
              View your complete class schedule and manage your upcoming
              learning sessions
            </p>
            <Link href="/student/schedule">
              <Button className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white px-8 py-3 rounded-2xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105 font-bold cursor-pointer">
                📋 View Full Schedule
                <ArrowUpRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}