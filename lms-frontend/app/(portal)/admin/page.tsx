"use client";
import type React from "react";
import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Users,
  ArrowRight,
  Settings,
  UserPlus,
  Shield,
  Clock,
  User,
  Bell,
  Edit,
  BookOpen,
  FileText,
  Presentation,
  FileDown,
  PlayCircle,
  Headphones,
  Calendar,
  Activity,
  AlertCircle,
  CheckCircle,
  Info,
  XCircle,
  Sparkles,
  BarChart3,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { ApiError } from "@/types";
import { useAuth } from "@/lib/auth";

interface UserData {
  role: {
    roleName: string;
  };
}

interface SystemMetric {
  name: string;
  count: number;
  color: string;
  icon: React.ReactNode;
}

interface Notification {
  _id: string;
  userId: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Course {
  _id: string;
  title: string;
  duration: string;
  teachers: string;
  Level: string;
  courseId: string;
}

function filterStudents(array: UserData[]): UserData[] {
  return array.filter((user: UserData) => user.role?.roleName === "Student");
}

function filterTeachers(array: UserData[]): UserData[] {
  return array.filter((user: UserData) => user.role?.roleName === "Teacher");
}

export default function AdminPortal() {
  const router = useRouter();
  const { user, loading: authLoading, deviceId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [coursesdetails, setCoursesdetails] = useState<Course[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(
    null
  );
  const [stats, setStats] = useState({
    totalstudents: 0,
    totalcourses: 0,
    activeteachers: 0,
    totalresourses: 32,
  });

  const handleUnauthorized = useCallback(() => {
    console.debug("[AdminPortal] Handling unauthorized access");
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("deviceId");
    router.push("/login");
  }, [router]);

  useEffect(() => {
    if (authLoading) return;
    if (!user || user.role?.roleName !== "Admin") {
      console.debug("[AdminPortal] Redirecting to login", {
        user: !!user,
        role: user?.role?.roleName,
        authLoading,
      });
      handleUnauthorized();
    }
  }, [user, authLoading, router, handleUnauthorized]);

  const fetchNotifications = useCallback(async (): Promise<void> => {
    if (!user || !deviceId) {
      handleUnauthorized();
      return;
    }
    try {
      setNotificationsLoading(true);
      setNotificationsError(null);
      const token = localStorage.getItem("token");

      if (!token) {
        handleUnauthorized();
        return;
      }

      const response = await api.get("/notifications", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Device-Id": deviceId,
        },
        params: {
          page: 1,
          limit: 10,
        },
      });

      const { notifications: notificationsData } = response.data;
      setNotifications(notificationsData || []);
    } catch (error) {
      const apiError = error as ApiError;
      console.error("[AdminPortal] Failed to fetch notifications:", apiError);
      const errorMessage =
        apiError.response?.data?.message ||
        apiError.message ||
        "Failed to load notifications";
      setNotificationsError(errorMessage);

      if (apiError.response?.status === 401) {
        handleUnauthorized();
      } else if (apiError.response?.status !== 404) {
        toast.error(errorMessage);
      }
    } finally {
      setNotificationsLoading(false);
    }
  }, [user, deviceId, handleUnauthorized]);

  const markNotificationAsRead = useCallback(
    async (notificationId: string) => {
      if (!user || !deviceId) {
        handleUnauthorized();
        return;
      }
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          handleUnauthorized();
          return;
        }

        await api.put(
          `/notifications/${notificationId}/read`,
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Device-Id": deviceId,
            },
          }
        );

        setNotifications((prev) =>
          prev.map((notif) =>
            notif._id === notificationId ? { ...notif, read: true } : notif
          )
        );
      } catch (error) {
        const apiError = error as ApiError;
        console.error(
          "[AdminPortal] Failed to mark notification as read:",
          apiError
        );
        const errorMessage =
          apiError.response?.data?.message ||
          apiError.message ||
          "Failed to mark notification as read";
        if (apiError.response?.status === 401) {
          handleUnauthorized();
        } else {
          toast.error(errorMessage);
        }
      }
    },
    [user, deviceId, handleUnauthorized]
  );

  const fetchData = useCallback(async () => {
    if (!user || !deviceId) {
      handleUnauthorized();
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem("token");
      if (!token) {
        handleUnauthorized();
        return;
      }

      const usersResponse = await api.get("admin/users", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Device-Id": deviceId,
        },
      });

      const filteredStudents = filterStudents(usersResponse.data.users).length;
      const filteredTeacher = filterTeachers(usersResponse.data.users).length;

      const coursesResponse = await api.get("courses/all", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Device-Id": deviceId,
        },
      });
      setCoursesdetails(coursesResponse.data.courses);

      await fetchNotifications();

      setStats((prevStats) => ({
        ...prevStats,
        totalstudents: filteredStudents,
        activeteachers: filteredTeacher,
        totalcourses: coursesResponse.data.courses.length,
      }));
    } catch (error) {
      const apiError = error as ApiError;
      console.error("[AdminPortal] Failed to fetch data:", apiError);
      const errorMessage =
        apiError.response?.data?.message ||
        apiError.message ||
        "Failed to load dashboard data";
      if (apiError.response?.status === 401) {
        handleUnauthorized();
      } else {
        setError(errorMessage);
        toast.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [user, deviceId, handleUnauthorized, fetchNotifications]);

  useEffect(() => {
    if (!authLoading && user && user.role?.roleName === "Admin") {
      console.debug("[AdminPortal] Fetching data", { userId: user._id });
      fetchData();
    }
  }, [fetchData, authLoading, user]);

  useEffect(() => {
    if (!authLoading && user && user.role?.roleName === "Admin") {
      const interval = setInterval(fetchNotifications, 30000);
      return () => {
        clearInterval(interval);
      };
    }
  }, [fetchNotifications, authLoading, user]);

  const resourceTypes: SystemMetric[] = [
    {
      name: "Presentations",
      count: 142,
      color: "from-blue-500 to-blue-600",
      icon: <Presentation className="w-4 h-4" />,
    },
    {
      name: "Worksheets",
      count: 98,
      color: "from-emerald-500 to-emerald-600",
      icon: <FileDown className="w-4 h-4" />,
    },
    {
      name: "Videos",
      count: 86,
      color: "from-rose-500 to-rose-600",
      icon: <PlayCircle className="w-4 h-4" />,
    },
    {
      name: "Audio",
      count: 58,
      color: "from-amber-500 to-amber-600",
      icon: <Headphones className="w-4 h-4" />,
    },
  ];

  const getNotificationType = (
    message: string
  ): "info" | "success" | "warning" | "error" => {
    const lowerMessage = message.toLowerCase();
    if (
      lowerMessage.includes("error") ||
      lowerMessage.includes("failed") ||
      lowerMessage.includes("problem")
    ) {
      return "error";
    }
    if (
      lowerMessage.includes("warning") ||
      lowerMessage.includes("alert") ||
      lowerMessage.includes("attention")
    ) {
      return "warning";
    }
    if (
      lowerMessage.includes("success") ||
      lowerMessage.includes("completed") ||
      lowerMessage.includes("approved") ||
      lowerMessage.includes("enrolled") ||
      lowerMessage.includes("assigned")
    ) {
      return "success";
    }
    return "info";
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "success":
        return {
          icon: <CheckCircle className="w-4 h-4" />,
          className:
            "bg-gradient-to-br from-emerald-100 to-green-100 text-emerald-600",
        };
      case "warning":
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          className:
            "bg-gradient-to-br from-amber-100 to-yellow-100 text-amber-600",
        };
      case "error":
        return {
          icon: <XCircle className="w-4 h-4" />,
          className: "bg-gradient-to-br from-red-100 to-rose-100 text-red-600",
        };
      default:
        return {
          icon: <Info className="w-4 h-4" />,
          className:
            "bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-600",
        };
    }
  };

  const formatNotificationTime = (createdAt: string) => {
    try {
      const now = new Date();
      const notificationTime = new Date(createdAt);
      const diffInMinutes = Math.floor(
        (now.getTime() - notificationTime.getTime()) / (1000 * 60)
      );

      if (diffInMinutes < 1) return "Just now";
      if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
      if (diffInMinutes < 1440)
        return `${Math.floor(diffInMinutes / 60)} hours ago`;
      return `${Math.floor(diffInMinutes / 1440)} days ago`;
    } catch {
      return "Unknown time";
    }
  };

  const statCards = [
    {
      title: "Total Students",
      value: stats.totalstudents.toLocaleString(),
      icon: <Users className="w-7 h-7" />,
      gradient: "from-blue-500 to-blue-600",
      bgGradient: "from-blue-50 to-indigo-50",
      description: "Active learners",
      href: "admin/users",
    },
    {
      title: "Total Courses",
      value: stats.totalcourses.toString(),
      icon: <BookOpen className="w-7 h-7" />,
      gradient: "from-emerald-500 to-green-600",
      bgGradient: "from-emerald-50 to-green-50",
      description: "Available courses",
      href: "admin/courses",
    },
    {
      title: "Active Teachers",
      value: stats.activeteachers.toLocaleString(),
      icon: <Users className="w-7 h-7" />,
      gradient: "from-violet-500 to-purple-600",
      bgGradient: "from-violet-50 to-purple-50",
      description: "Teaching staff",
      href: "admin/users",
    },
    {
      title: "Total Resources",
      value: stats.totalresourses.toString(),
      icon: <FileText className="w-7 h-7" />,
      gradient: "from-orange-500 to-red-500",
      bgGradient: "from-orange-50 to-red-50",
      description: "Learning materials",
      href: "#",
    },
  ];

  const quickActions = [
    {
      title: "Create New Course",
      description: "Add a new course to your platform",
      icon: <UserPlus className="w-6 h-6" />,
      href: "admin/courses/create",
      gradient: "from-orange-500 to-red-500",
      bgGradient: "from-orange-50 to-red-50",
    },
    {
      title: "Schedule Class",
      description: "Schedule Class for a course",
      icon: <Settings className="w-6 h-6" />,
      href: "admin/schedule-call",
      gradient: "from-violet-500 to-purple-500",
      bgGradient: "from-violet-50 to-purple-50",
    },
    {
      title: "Add New Resource",
      description: "Upload Presentation, video, worksheet, etc.",
      icon: <Shield className="w-6 h-6" />,
      href: "#",
      gradient: "from-emerald-500 to-green-500",
      bgGradient: "from-emerald-50 to-green-50",
    },
  ];

  // Render loading state until auth is resolved
  if (authLoading || (!user && loading)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-blue-200 rounded-full animate-spin"></div>
            <div className="absolute top-0 left-0 w-16 h-16 border-4 border-blue-600 rounded-full animate-spin border-t-transparent"></div>
          </div>
          <p className="mt-4 text-slate-600 font-medium">
            Loading Admin Portal...
          </p>
        </div>
      </div>
    );
  }

  if (!user || user.role?.roleName !== "Admin") {
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 flex items-center justify-center">
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
                fetchData();
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 p-6 mt-10">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-700 p-8 text-white shadow-xl"
        >
          <div className="absolute inset-0 bg-black/10"></div>
          <div className="relative flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h1 className="text-4xl font-bold">Admin Portal</h1>
              </div>
              <p className="text-blue-100 text-lg">
                Welcome back, {user.name || "Administrator"}! Here&apos;s your
                dashboard overview.
              </p>
            </div>
            <div className="hidden md:flex items-center gap-4">
              <div className="flex items-center gap-2 text-blue-100 bg-white/10 px-4 py-2 rounded-lg backdrop-blur-sm">
                <Calendar className="w-4 h-4" />
                <span className="text-sm font-medium">
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          </div>
          <div className="absolute -top-4 -right-4 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
          <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full blur-2xl"></div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -5, transition: { duration: 0.2 } }}
            >
              <Card
                className="relative overflow-hidden border-0 shadow-lg hover:shadow-xl transition-all duration-300 bg-white/80 backdrop-blur-sm cursor-pointer"
                onClick={() => router.push(stat.href)}
              >                 
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.bgGradient} opacity-50`}
                ></div>
                <CardContent className="relative p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`p-3 rounded-xl bg-gradient-to-br ${stat.gradient} text-white shadow-lg`}
                    >
                      {stat.icon}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-slate-600">
                      {stat.title}
                    </p>
                    <p className="text-3xl font-bold text-slate-900">
                      {stat.value}
                    </p>
                    <p className="text-sm text-slate-500">{stat.description}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-lg">
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold text-slate-900">
                      Quick Actions
                    </CardTitle>
                    <p className="text-sm text-slate-600">
                      Manage users, settings, and system operations
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {quickActions.map((action, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
                    onClick={() => router.push(action.href)}
                    className="group relative overflow-hidden rounded-xl p-5 cursor-pointer transition-all duration-300 hover:shadow-lg"
                  >
                    <div
                      className={`absolute inset-0 bg-gradient-to-br ${action.bgGradient} opacity-60 group-hover:opacity-80 transition-opacity`}
                    ></div>
                    <div className="relative flex items-center gap-4">
                      <div
                        className={`p-3 rounded-xl bg-gradient-to-br ${action.gradient} text-white shadow-lg group-hover:scale-110 transition-transform`}
                      >
                        {action.icon}
                      </div>
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 mb-1">
                          {action.title}
                        </h3>
                        <p className="text-sm text-slate-600">
                          {action.description}
                        </p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-slate-600 group-hover:translate-x-1 transition-all" />
                    </div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Resource Types */}
          <div>
            <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-br from-emerald-500 to-green-600 text-white rounded-lg">
                    <BarChart3 className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl font-bold text-slate-900">
                      Resource Types
                    </CardTitle>
                    <p className="text-sm text-slate-600">
                      Distribution of resource types
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {resourceTypes.map((resource, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2.5 rounded-lg bg-gradient-to-br ${resource.color} text-white shadow-md`}
                      >
                        {resource.icon}
                      </div>
                      <span className="font-medium text-slate-900">
                        {resource.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-slate-900 w-8 text-right">
                        {resource.count}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-violet-500 to-purple-600 text-white rounded-lg">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold text-slate-900">
                    Recent Courses
                  </CardTitle>
                  <p className="text-sm text-slate-600">
                    Recently created and active courses
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-slate-200 cursor-pointer hover:bg-slate-50"
                onClick={() => router.push("/admin/courses")}
              >
                View All
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {coursesdetails?.slice(0, 4).map((course, index) => (
                <motion.div
                  key={course.courseId || index}
                  onClick={() =>
                    router.push(`/admin/courses/${course.courseId}`)
                  }
                  className="relative overflow-hidden rounded-xl p-5 bg-gradient-to-br from-slate-50 to-blue-50 hover:from-blue-50 hover:to-indigo-50 transition-all duration-300 border border-slate-200 cursor-pointer"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 mb-3 text-lg">
                        {course.title}
                      </h3>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600 mb-3">
                        <div className="flex items-center gap-1 bg-white/60 px-2 py-1 rounded-md">
                          <Clock className="w-3 h-3" />
                          <span>{course.duration}</span>
                        </div>
                        <div className="flex items-center gap-1 bg-white/60 px-2 py-1 rounded-md">
                          <User className="w-3 h-3" />
                          <span>{course.teachers}</span>
                        </div>
                        <div className="flex items-center gap-1 bg-white/60 px-2 py-1 rounded-md">
                          <Clock className="w-3 h-3" />
                          <span>{course.Level}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-9 w-9 p-0 cursor-pointer border-slate-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-600 transition-all duration-200 group"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/admin/courses/${course.courseId}/edit`);
                        }}
                        title="Edit Course"
                      >
                        <Edit className="w-4 h-4 cursor-pointer group-hover:scale-110 transition-transform" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/80 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-lg">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    Latest Notifications
                    {notifications.filter((n) => !n.read).length > 0 && (
                      <Badge className="bg-gradient-to-r from-red-50 to-rose-50 text-red-700 border border-red-200">
                        {notifications.filter((n) => !n.read).length} unread
                      </Badge>
                    )}
                  </CardTitle>
                  <p className="text-sm text-slate-600">
                    Latest system notifications
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchNotifications}
                disabled={notificationsLoading}
                className="border-slate-200 cursor-pointer hover:bg-slate-50"
              >
                <Bell className="w-4 h-4 mr-2" />
                {notificationsLoading ? "Loading..." : "Refresh"}
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {notificationsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="relative">
                    <div className="w-8 h-8 border-4 border-blue-200 rounded-full animate-spin"></div>
                    <div className="absolute top-0 left-0 w-8 h-8 border-4 border-blue-600 rounded-full animate-spin border-t-transparent"></div>
                  </div>
                </div>
              ) : notificationsError ? (
                <div className="text-center py-12">
                  <div className="p-3 bg-gradient-to-br from-red-100 to-rose-100 text-red-600 rounded-full w-fit mx-auto mb-4">
                    <XCircle className="w-8 h-8" />
                  </div>
                  <p className="text-red-600 font-semibold mb-1">
                    Failed to load notifications
                  </p>
                  <p className="text-sm text-slate-500 mb-4">
                    {notificationsError}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={fetchNotifications}
                    className="border-slate-200"
                  >
                    Try Again
                  </Button>
                </div>
              ) : notifications.length > 0 ? (
                notifications.slice(0, 4).map((notification, index) => {
                  const notificationType = getNotificationType(
                    notification.message
                  );
                  const notificationIcon =
                    getNotificationIcon(notificationType);

                  return (
                    <motion.div
                      key={notification._id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      whileHover={{
                        scale: 1.02,
                        transition: { duration: 0.2 },
                      }}
                      className={`relative overflow-hidden rounded-xl p-4 cursor-pointer transition-all duration-300 border ${
                        notification.read
                          ? "bg-gradient-to-br from-slate-50 to-gray-50 hover:from-gray-50 hover:to-slate-100 border-slate-200"
                          : "bg-gradient-to-br from-blue-50 to-indigo-50 hover:from-indigo-50 hover:to-blue-100 border-blue-200 shadow-md"
                      }`}
                      onClick={() =>
                        !notification.read &&
                        markNotificationAsRead(notification._id)
                      }
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex-shrink-0">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center ${notificationIcon.className} shadow-sm`}
                          >
                            {notificationIcon.icon}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 line-clamp-2 mb-3 leading-relaxed">
                            {notification.message}
                          </p>
                          <div className="flex items-center gap-2">
                            <Activity className="w-3 h-3 text-slate-400" />
                            <p className="text-xs text-slate-500 font-medium">
                              {formatNotificationTime(notification.createdAt)}
                            </p>
                          </div>
                        </div>
                        {!notification.read && (
                          <div className="w-2.5 h-2.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full mt-2 shadow-sm"></div>
                        )}
                      </div>
                    </motion.div>
                  );
                })
              ) : (
                <div className="text-center py-12">
                  <div className="p-3 bg-gradient-to-br from-slate-100 to-gray-100 text-slate-400 rounded-full w-fit mx-auto mb-4">
                    <Bell className="w-8 h-8" />
                  </div>
                  <p className="font-semibold text-slate-600 mb-1">
                    No notifications found
                  </p>
                  <p className="text-sm text-slate-500">
                    Check back later for updates
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
