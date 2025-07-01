"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { User, AuthContextType, ApiError } from "@/types";
import api, { setSessionRestored } from "./api";
import toast from "react-hot-toast";
import { v4 as uuidv4 } from "uuid";

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const LOGOUT_TOAST_ID = "logout-success";
let isLoggingOut = false;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState<string>("");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname && pathname !== "/login" && pathname !== "/timezone-setup") {
      localStorage.setItem("lastPath", pathname);
    }
  }, [pathname]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userId = localStorage.getItem("userId");
    const isLoggedIn = localStorage.getItem("isLoggedIn");
    if (!token || !userId || isLoggedIn !== "true") {
      clearSession();
      setLoading(false);
      setSessionRestored(true);
      router.push("/login");
      return;
    }
  }, [router]);

  useEffect(() => {
    let storedDeviceId = localStorage.getItem("deviceId");
    if (!storedDeviceId) {
      storedDeviceId = uuidv4();
      localStorage.setItem("deviceId", storedDeviceId);
    }
    setDeviceId(storedDeviceId);
  }, []);


  const clearSession = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("lastPath");
    setUser(null);
  };

  // const restoreSession = useCallback(async () => {
  //   setLoading(true);
  //   const token = localStorage.getItem("token");
  //   const userId = localStorage.getItem("userId");
  //   const isLoggedIn = localStorage.getItem("isLoggedIn");
  //   const lastPath = localStorage.getItem("lastPath") || "/my-learnings";

  //   if (!token || !userId || isLoggedIn !== "true" || !deviceId) {
  //     clearSession();
  //     setLoading(false);
  //     setSessionRestored(true);
  //     router.push("/login");
  //     return;
  //   }

  //   try {
  //     const response = await api.post("/auth/direct-login", {}, {
  //       headers: { Authorization: `Bearer ${token}`, "Device-Id": deviceId },
  //     });
  //     const { user: restoredUser, token: returnedToken } = response.data;
  //     if (returnedToken && returnedToken !== token) {
  //       localStorage.setItem("token", returnedToken);
  //     }
  //     localStorage.setItem("userId", restoredUser._id);
  //     localStorage.setItem("isLoggedIn", "true");
  //     setUser(restoredUser);
  //     setSessionRestored(true);

  //     await api.post("/auth/sync-device", { deviceId }, {
  //       headers: { "Device-Id": deviceId, Authorization: `Bearer ${returnedToken || token}` },
  //     });

  //     const roleName = restoredUser.role?.roleName.toLowerCase().replace(/\s+/g, "");
  //     setTimeout(() => {
  //       if ((roleName === "student" || roleName === "teacher") && 
  //           (restoredUser.isFirstLogin || !restoredUser.isTimezoneSet)) {
  //         router.push("/timezone-setup");
  //         localStorage.setItem("lastPath", lastPath);
  //       } else {
  //         router.push(lastPath);
  //       }
  //     }, 500);
  //   } catch (error) {
  //     const errorMsg = error as ApiError;
  //     clearSession();
  //     setLoading(false);
  //     setSessionRestored(true);
  //     router.push("/login");
  //     toast.error(errorMsg?.response?.data?.message || "Session expired. Please log in again.");
  //   } finally {
  //     setLoading(false);
  //   }
  // }, [deviceId, router]);

  const restoreSession = useCallback(async () => {
  setLoading(true);
  const token = localStorage.getItem("token");
  const userId = localStorage.getItem("userId");
  const isLoggedIn = localStorage.getItem("isLoggedIn");
  const lastPath = localStorage.getItem("lastPath") || "/my-learnings";

  if (!token || !userId || isLoggedIn !== "true" || !deviceId) {
    clearSession();
    setLoading(false);
    setSessionRestored(true);
    router.push("/login");
    return;
  }

  try {
    const response = await api.post(
      "/auth/direct-login",
      {},
      {
        headers: { Authorization: `Bearer ${token}`, "Device-Id": deviceId },
      }
    );
    const { user: restoredUser, token: newToken } = response.data;

    // Update localStorage with the new token
    if (newToken && newToken !== token) {
      localStorage.setItem("token", newToken);
      console.debug("[AuthProvider] Updated token in localStorage");
    }

    localStorage.setItem("userId", restoredUser._id);
    localStorage.setItem("isLoggedIn", "true");
    setUser(restoredUser);
    setSessionRestored(true);

    await api.post(
      "/auth/sync-device",
      { deviceId },
      {
        headers: { "Device-Id": deviceId, Authorization: `Bearer ${newToken || token}` },
      }
    );

    const roleName = restoredUser.role?.roleName.toLowerCase().replace(/\s+/g, "");
    setTimeout(() => {
      if (
        (roleName === "student" || roleName === "teacher") &&
        (restoredUser.isFirstLogin || !restoredUser.isTimezoneSet)
      ) {
        router.push("/timezone-setup");
        localStorage.setItem("lastPath", lastPath);
      } else {
        router.push(lastPath);
      }
    }, 500);
  } catch (error) {
    const errorMsg = error as ApiError;
    clearSession();
    setLoading(false);
    setSessionRestored(true);
    router.push("/login");
    toast.error(errorMsg?.response?.data?.message || "Session expired. Please log in again.");
  } finally {
    setLoading(false);
  }
}, [deviceId, router]);

    useEffect(() => {
    if (deviceId) {
      restoreSession();
    }
  }, [deviceId, restoreSession]);

  const logout = useCallback(async () => {
    if (isLoggingOut) return;
    isLoggingOut = true;
    try {
      const token = localStorage.getItem("token");
      if (token) {
        await api.post(
          "/auth/logout",
          {},
          {
            headers: {
              "Device-Id": deviceId,
              Authorization: `Bearer ${token}`,
            },
          }
        );
      }
    } catch (error) {
      console.error("[AuthProvider] Logout error:", error);
    } finally {
      localStorage.setItem("isLoggedIn", "false");
      clearSession();
      toast.success("Logged out successfully!", { id: LOGOUT_TOAST_ID });
      router.push("/login");
      setTimeout(() => { isLoggingOut = false; }, 1000);
    }
  }, [deviceId, router]);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (
        event.key === "isLoggedIn" &&
        event.newValue === "false" && 
        event.storageArea === localStorage
      ) {
        logout();
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, setUser, logout, loading, deviceId }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};