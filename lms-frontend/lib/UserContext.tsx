// import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
// import api from "@/lib/api";
// import { ApiError, UserDetails, UserContextType, ApiUserResponse } from "@/types";
// import { useAuth } from "@/lib/auth"; 

// const UserContext = createContext<UserContextType | undefined>(undefined);

// export const UserProvider = ({ children }: { children: ReactNode }) => {
//   const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
//   const [loading, setLoading] = useState(true); 
//   const { user } = useAuth(); 

//   const fetchUserDetails = useCallback(  async () => {
//     setLoading(true);
//     const token = localStorage.getItem("token");
//     const deviceId = localStorage.getItem("deviceId") || "unknown";

// if (!token || !user || !deviceId || token === "null") {
//     setUserDetails(null);
//     setLoading(false);
//     return;
//   }

//     try {
//       const response = await api.get("/auth/me", {
//         headers: {
//           Authorization: `Bearer ${token}`,
//           "Device-Id": deviceId,
//         },
//       });
//       const data: ApiUserResponse  = response.data.user;
//       setUserDetails({
//         _id: data._id,
//         name: data.name,
//         email: data.email,
//         phone: data.phone,
//         gender: data.gender,
//         address: data.address || undefined,
//         timezone: data.timezone || undefined,
//         preferredTimeSlots: data.preferredTimeSlots || undefined,
//         studentId: data.studentId || undefined,
//         employeeId: data.employeeId || undefined,
//         subjects: data.subjects || undefined,
//         role: { roleName: data.role?.roleName ?? "Unknown" },
//         joinDate: data.joinDate || undefined,
//         profileImage: data.profileImage || undefined,
//         profile: {
//           bio: data.profile.bio || undefined,
//           hobbies: data.profile.hobbies || undefined,
//           skills: data.profile.skills || undefined,
//           about: data.profile.about || undefined,
//           accomplishments: data.profile.accomplishments || undefined,
//           qualifications: data.profile.qualifications || undefined,
//           enrollmentStatus: data.profile.enrollmentStatus || undefined,
//           experience: data.profile.experience || undefined,
//         },
//         createdAt: data.createdAt || undefined,
//         updatedAt: data.updatedAt || undefined,
//         isActive: data.isTimezoneSet || undefined,
//         isFirstLogin: data.isFirstLogin || undefined,
//         teacherId: data.teacherId || undefined, 
//       });
//     } catch (error) {
//       const apiError = error as ApiError;
//       console.error("Error fetching user details:", apiError.response?.data?.message || apiError.message);
//       setUserDetails(null);
//     } finally {
//       setLoading(false);
//     }
//   }, [user]);


//   useEffect(() => {
//     fetchUserDetails();
//   }, [fetchUserDetails, user]); 

//   return (
//     <UserContext.Provider value={{ userDetails, setUserDetails, loading }}>
//       {children}
//     </UserContext.Provider>
//   );
// };

// export const useUser = () => {
//   const context = useContext(UserContext);
//   if (!context) {
//     throw new Error("useUser must be used within a UserProvider");
//   }
//   return context;
// };

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import api from "@/lib/api";
import { ApiError, UserDetails, UserContextType, ApiUserResponse } from "@/types";
import { useAuth } from "@/lib/auth";

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, logout } = useAuth(); // Added logout for handling session expiration

  const fetchUserDetails = useCallback(async () => {
    if (!user) {
      setUserDetails(null);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem("token");
    const deviceId = localStorage.getItem("deviceId") || "unknown";

    if (!token || token === "null" || !deviceId) {
      setUserDetails(null);
      setLoading(false);
      logout();
      return;
    }

    try {
      const response = await api.get("/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Device-Id": deviceId,
        },
      });
      const { user: data, token: newToken }: { user: ApiUserResponse; token?: string } = response.data;

      // Update token in localStorage if a new one is returned
      if (newToken && newToken !== token) {
        localStorage.setItem("token", newToken);
        console.debug("[UserContext] Updated token in localStorage from /auth/me");
      }

      setUserDetails({
        _id: data._id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        gender: data.gender,
        address: data.address || undefined,
        timezone: data.timezone || undefined,
        preferredTimeSlots: data.preferredTimeSlots || undefined,
        studentId: data.studentId || undefined,
        employeeId: data.employeeId || undefined,
        subjects: data.subjects || undefined,
        role: { roleName: data.role?.roleName ?? "Unknown" },
        joinDate: data.joinDate || undefined,
        profileImage: data.profileImage || undefined,
        profile: {
          bio: data.profile.bio || undefined,
          hobbies: data.profile.hobbies || undefined,
          skills: data.profile.skills || undefined,
          about: data.profile.about || undefined,
          accomplishments: data.profile.accomplishments || undefined,
          qualifications: data.profile.qualifications || undefined,
          enrollmentStatus: data.profile.enrollmentStatus || undefined,
          experience: data.profile.experience || undefined,
        },
        createdAt: data.createdAt || undefined,
        updatedAt: data.updatedAt || undefined,
        isActive: data.isTimezoneSet || undefined,
        isFirstLogin: data.isFirstLogin || undefined,
        teacherId: data.teacherId || undefined,
      });
    } catch (error) {
      const apiError = error as ApiError;
      console.error(
        "[UserContext] Error fetching user details:",
        apiError.response?.data?.message || apiError.message
      );
      setUserDetails(null);
      if (apiError.response?.status === 401) {
        logout(); // Trigger logout on 401 Unauthorized
      }
    } finally {
      setLoading(false);
    }
  }, [user, logout]);

  useEffect(() => {
    fetchUserDetails();
  }, [fetchUserDetails]);

  return (
    <UserContext.Provider value={{ userDetails, setUserDetails, loading }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};