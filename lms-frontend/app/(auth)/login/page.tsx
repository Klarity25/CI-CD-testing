// "use client";

// import { Suspense, useState, useEffect } from "react";
// import { useRouter, useSearchParams } from "next/navigation";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import Link from "next/link";
// import api from "@/lib/api";
// import toast from "react-hot-toast";
// import { CountryDropdown } from "@/components/ui/country-dropdown";
// import Image from "next/image";
// import { useAuth } from "@/lib/auth";
// import { ApiError, LoginState, ValidationResult } from "@/types"; 
// import SuspenseFallback from "@/components/SuspenseFallback";
// import LoadingPage from "@/components/LoadingPage";

// const validateIdentifier = (
//   identifier: string,
//   countryCode: string
// ): ValidationResult => {
//   const cleanIdentifier = identifier.replace(/\s+/g, "");
//   const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//   const phoneRegex = /^\d{10}$/;
//   if (emailRegex.test(cleanIdentifier)) return { isValid: true, type: "email" };
//   if (phoneRegex.test(cleanIdentifier))
//     return {
//       isValid: true,
//       type: "phone",
//       fullPhone: `${countryCode}${cleanIdentifier}`,
//     };
//   else {
//     return {
//       isValid: false,
//       type: "email",
//       error: "Invalid email or phone number",
//     };
//   }
// };

// export function LoginContent() {
//   const { user, setUser, deviceId, loading: authLoading } = useAuth();
//   const [state, setState] = useState<LoginState>({
//     identifier: "",
//     countryCode: "+91",
//     selectedCountry: "IN",
//     isPhoneLogin: false,
//     errors: { identifier: "", login: "" },
//     loading: false,
//     isLoggedIn: false,
//   });

//   const Logo =
//     "https://res.cloudinary.com/dlie87ah0/image/upload/v1745815677/logo5_olvuok.jpg";

//   const { identifier, countryCode, selectedCountry, isPhoneLogin, errors, loading } = state;
//   const router = useRouter();
//   const searchParams = useSearchParams();
//   const sessionExpired = searchParams.get("sessionExpired");

// useEffect(() => {
//   if (deviceId && !authLoading && !user) {
//     const checkSession = async () => {
//       const token = localStorage.getItem("token");
//       const userId = localStorage.getItem("userId");
//       const isLoggedIn = localStorage.getItem("isLoggedIn");

//       if (token && userId && isLoggedIn === "true" && deviceId) {
//         try {
//           setState((prev) => ({ ...prev, loading: true }));
//           const response = await api.post(
//             "/auth/direct-login",
//             {},
//             {
//               headers: {
//                 Authorization: `Bearer ${token}`,
//                 "Device-Id": deviceId,
//               },
//             }
//           );

//           const { user: directLoginUser, token: newToken } = response.data;
//           localStorage.setItem("token", newToken);
//           localStorage.setItem("userId", directLoginUser._id);
//           localStorage.setItem("isLoggedIn", "true");
//           setUser(directLoginUser);
//           toast.success("Logged in successfully!");

//           const roleName = directLoginUser.role?.roleName.toLowerCase().replace(/\s+/g, "");
//           if (!roleName) {
//             router.push("/my-learnings");
//           } else if (
//             (roleName === "student" || roleName === "teacher") &&
//             (directLoginUser.isFirstLogin || !directLoginUser.isTimezoneSet)
//           ) {
//             router.push("/timezone-setup");
//           } else if (roleName === "admin" || roleName === "superadmin") {
//             router.push(`/${roleName}`);
//           } else {
//             router.push(`/${roleName}`);
//           }
//         } catch (error) {
//           const errorMsg =  error as ApiError;
//           console.error("Direct login failed in LoginContent:", {
//             message: errorMsg.response?.data?.message,
//             status: errorMsg.response?.status,
//             response: errorMsg.response?.data,
//           });
//           if (errorMsg.response?.data?.errors?.[0]?.msg === "Session expired or invalid") {
//             localStorage.removeItem("token");
//             localStorage.removeItem("isLoggedIn");
//             localStorage.removeItem("isVerified");
//             localStorage.removeItem("userIdentifier");
//             localStorage.removeItem("identifierType");
//             localStorage.removeItem("userId");
//           }
//           setState((prev) => ({ ...prev, loading: false }));
//         }
//       } else {
//         setState((prev) => ({ ...prev, loading: false }));
//       }
//     };

//     checkSession();
//   } else if (user) {
//     const roleName = user.role?.roleName.toLowerCase().replace(/\s+/g, "");
//     if (!roleName) {
//       router.push("/my-learnings");
//     } else if (
//       (roleName === "student" || roleName === "teacher") &&
//       (user.isFirstLogin || !user.isTimezoneSet)
//     ) {
//       router.push("/timezone-setup");
//     } else if (roleName === "admin" || roleName === "superadmin") {
//       router.push(`/${roleName}`);
//     } else {
//       router.push(`/${roleName}`);
//     }
//   } else {
//     setState((prev) => ({ ...prev, loading: false }));
//   }
// }, [deviceId, authLoading, user, router, setUser]);

//   if (authLoading) {
//     return <LoadingPage message="Checking authentication..." color="#ff0000" />;
//   }

//   const handleCountryChange = (isoCode: string, dialCode: string) => {
//     setState((prev) => ({
//       ...prev,
//       selectedCountry: isoCode,
//       countryCode: dialCode,
//     }));
//   };

//   const handleLogin = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setState((prev) => ({
//       ...prev,
//       errors: { identifier: "", login: "" },
//       loading: true,
//     }));

//     const validation = validateIdentifier(identifier, countryCode);
//     if (!validation.isValid) {
//       setState((prev) => ({
//         ...prev,
//         errors: { ...prev.errors, identifier: validation.error || "" },
//         loading: false,
//       }));
//       toast.error(validation.error || "Invalid input");
//       return;
//     }

//     try {
//       const payload = {
//         identifier:
//           validation.type === "phone" ? validation.fullPhone : identifier,
//       };
//       const res = await api.post("/auth/login", payload, {
//         headers: { "Device-Id": deviceId },
//       });

//       if (res.data.message === "Active session found, please use direct login") {
//         const { token } = res.data; 
//         const response = await api.post(
//           "/auth/direct-login",
//           {},
//           {
//             headers: {
//               Authorization: `Bearer ${token}`,
//               "Device-Id": deviceId,
//             },
//           }
//         );

//         const { user: directLoginUser, token: newToken } = response.data;
//         localStorage.setItem("token", newToken);
//         localStorage.setItem("userId", directLoginUser._id);
//         localStorage.setItem("isLoggedIn", "true");
//         setUser(directLoginUser);
//         toast.success("Logged in successfully!");

//         const roleName = directLoginUser.role?.roleName.toLowerCase().replace(/\s+/g, "");
//         if (!roleName) {
//           router.push("/my-learnings");
//         } else if (
//           (roleName === "student" || roleName === "teacher") &&
//           (directLoginUser.isFirstLogin || !directLoginUser.isTimezoneSet)
//         ) {
//           router.push("/timezone-setup");
//         } else if (roleName === "admin" || roleName === "superadmin") {
//           router.push(`/${roleName}`);
//         } else {
//           router.push(`/${roleName}`);
//         }
//         return;
//       }

//       const identifierValue =
//         validation.type === "phone" ? validation.fullPhone! : identifier;
//       const identifierType = validation.type;

//       localStorage.setItem("userIdentifier", identifierValue);
//       localStorage.setItem("identifierType", identifierType);
//       localStorage.setItem("userId", res.data.userId);

//       setState((prev) => ({
//         ...prev,
//         identifier: "",
//         errors: { identifier: "", login: "" },
//         loading: false,
//       }));
//       toast.success("OTP sent! Please check your email or phone.");
//       router.push(`/verify-otp?userId=${res.data.userId}&type=login`);
//     } catch (error) { 
//       const errorMsg =error as ApiError;
//       const errors =  errorMsg.response?.data?.errors?.[0]?.msg ||
//         errorMsg.response?.data?.message ||
//         "Login failed. Please try again.";
//       setState((prev) => ({
//         ...prev,
//         errors: { ...prev.errors, login: errors },
//         loading: false,
//       }));
//       toast.error(errors);
//       console.error("Login failed:", errorMsg);
//     }
//   };

//   return (
//     <div className="flex items-center justify-center min-h-screen bg-gray-100">
//       <Card
//         className="w-full max-w-[400px] bg-white border-2 border-[#dddd] rounded-3xl transition-all mt-20"
//         style={{
//           transform:
//             "perspective(1000px) rotateX(2deg) rotateY(2deg) translateY(0)",
//           boxShadow: "6px 6px 0 0 #dddd",
//           border: "1px solid #eeee",
//           transition:
//             "transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out, border 0.3s ease-in-out",
//         }}
//         onMouseEnter={(e) => {
//           const card = e.currentTarget;
//           card.style.transform =
//             "perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(-8px)";
//           card.style.boxShadow = "12px 12px 0 0 #dddd";
//           card.style.border = "1px solid #eeee";
//         }}
//         onMouseLeave={(e) => {
//           const card = e.currentTarget;
//           card.style.transform =
//             "perspective(1000px) rotateX(2deg) rotateY(2deg) translateY(0)";
//           card.style.boxShadow = "6px 6px 0 0 #dddd";
//           card.style.border = "1px solid #eeee";
//         }}
//       >
//         <CardHeader className="pt-3">
//           <div className="flex justify-start">
//             <Image
//               src={Logo}
//               alt="Klariti Logo"
//               width={50}
//               height={60}
//               className="object-contain"
//             />
//           </div>
//           <CardTitle className="text-start text-3xl font-bold text-gray-900 break-words pt-2">
//             Continue to use Klariti
//           </CardTitle>
//           <p className="text-start text-md text-black-500 mt-1">
//             Welcome back! Please enter your details.
//           </p>
//           {sessionExpired === "true" && (
//             <p className="text-red-500 text-sm mt-2">
//               Session expired. Please log in again.
//             </p>
//           )}
//         </CardHeader>
//         <CardContent className="px-6 pb-6">
//           <form onSubmit={handleLogin}>
//             <div className="mb-4">
//               {isPhoneLogin ? (
//                 <div className="flex items-center space-x-2">
//                   <div className="relative rounded-md px-2 py-2 bg-white cursor-pointer border-0">
//                     <CountryDropdown
//                       value={selectedCountry}
//                       onChange={handleCountryChange}
//                       slim
//                     />
//                   </div>
//                   <Input
//                     id="identifier"
//                     value={identifier}
//                     onChange={(e) =>
//                       setState((prev) => ({
//                         ...prev,
//                         identifier: e.target.value.replace(/\s+/g, ""),
//                       }))
//                     }
//                     placeholder="Enter phone number"
//                     required
//                     disabled={loading}
//                     className={`flex-1 px-4 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 border ${
//                       errors.identifier ? "border-red-500" : "border-gray-300"
//                     } rounded-md`}
//                   />
//                 </div>
//               ) : (
//                 <Input
//                   id="identifier"
//                   value={identifier}
//                   onChange={(e) =>
//                     setState((prev) => ({
//                       ...prev,
//                       identifier: e.target.value.replace(/\s+/g, ""),
//                     }))
//                   }
//                   placeholder="Enter your email"
//                   required
//                   disabled={loading}
//                   className={`w-full border ${
//                     errors.identifier ? "border-red-500" : "border-gray-300"
//                   } rounded-md px-4 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 mt-1`}
//                 />
//               )}
//               {errors.identifier && (
//                 <p className="text-red-500 text-sm mt-1">{errors.identifier}</p>
//               )}
//             </div>
//             <Button
//               type="submit"
//               className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors cursor-pointer mb-4"
//               disabled={loading}
//             >
//               {loading ? "Checking..." : "Login"}
//             </Button>
//             {errors.login && (
//               <p className="text-red-500 text-sm mb-4">{errors.login}</p>
//             )}
//             <p
//               className="text-center text-md cursor-pointer"
//               onClick={() =>
//                 setState((prev) => ({
//                   ...prev,
//                   isPhoneLogin: !prev.isPhoneLogin,
//                   identifier: "",
//                   errors: { identifier: "", login: "" },
//                 }))
//               }
//             >
//               <span className="text-gray-600">OR</span>
//               <span className="text-blue-500 font-semibold">
//                 {isPhoneLogin
//                   ? ", Login using email"
//                   : ", Login using phone number"}
//               </span>
//             </p>
//             <p className="text-center text-sm text-gray-600 mt-3">
//               Not registered yet?{" "}
//               <Link href="/signup" className="text-blue-600 cursor-pointer">
//                 Sign Up
//               </Link>
//             </p>
//           </form>
//         </CardContent>
//       </Card>
//     </div>
//   );
// }

// export default function Login() {
//   return (
//     <Suspense fallback={<SuspenseFallback />}>
//       <LoginContent />
//     </Suspense>
//   );
// }

"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { CountryDropdown } from "@/components/ui/country-dropdown";
import Image from "next/image";
import { useAuth } from "@/lib/auth";
import { ApiError, LoginState, ValidationResult } from "@/types"; 
import SuspenseFallback from "@/components/SuspenseFallback";
import LoadingPage from "@/components/LoadingPage";

const validateIdentifier = (
  identifier: string,
  countryCode: string
): ValidationResult => {
  const cleanIdentifier = identifier.replace(/\s+/g, "").toLowerCase(); // Normalize identifier to lowercase
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phoneRegex = /^\d{10}$/;
  if (emailRegex.test(cleanIdentifier)) return { isValid: true, type: "email" };
  if (phoneRegex.test(cleanIdentifier))
    return {
      isValid: true,
      type: "phone",
      fullPhone: `${countryCode}${cleanIdentifier}`,
    };
  else {
    return {
      isValid: false,
      type: "email",
      error: "Invalid email or phone number",
    };
  }
};

export function LoginContent() {
  const { user, setUser, deviceId, loading: authLoading } = useAuth();
  const [state, setState] = useState<LoginState>({
    identifier: "",
    countryCode: "+91",
    selectedCountry: "IN",
    isPhoneLogin: false,
    errors: { identifier: "", login: "" },
    loading: false,
    isLoggedIn: false,
  });

  const Logo =
    "https://res.cloudinary.com/dlie87ah0/image/upload/v1745815677/logo5_olvuok.jpg";

  const { identifier, countryCode, selectedCountry, isPhoneLogin, errors, loading } = state;
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionExpired = searchParams.get("sessionExpired");

  useEffect(() => {
    if (deviceId && !authLoading && !user) {
      const checkSession = async () => {
        const token = localStorage.getItem("token");
        const userId = localStorage.getItem("userId");
        const isLoggedIn = localStorage.getItem("isLoggedIn");

        if (token && userId && isLoggedIn === "true" && deviceId) {
          try {
            setState((prev) => ({ ...prev, loading: true }));
            const response = await api.post(
              "/auth/direct-login",
              {},
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Device-Id": deviceId,
                },
              }
            );

            const { user: directLoginUser, token: newToken } = response.data;
            localStorage.setItem("token", newToken);
            localStorage.setItem("userId", directLoginUser._id);
            localStorage.setItem("isLoggedIn", "true");
            setUser(directLoginUser);
            toast.success("Logged in successfully!");

            const roleName = directLoginUser.role?.roleName.toLowerCase().replace(/\s+/g, "");
            if (!roleName) {
              router.push("/my-learnings");
            } else if (
              (roleName === "student" || roleName === "teacher") &&
              (directLoginUser.isFirstLogin || !directLoginUser.isTimezoneSet)
            ) {
              router.push("/timezone-setup");
            } else if (roleName === "admin" || roleName === "superadmin") {
              router.push(`/${roleName}`);
            } else {
              router.push(`/${roleName}`);
            }
          } catch (error) {
            const errorMsg = error as ApiError;
            console.error("Direct login failed in LoginContent:", {
              message: errorMsg.response?.data?.message,
              status: errorMsg.response?.status,
              response: errorMsg.response?.data,
            });
            if (errorMsg.response?.data?.errors?.[0]?.msg === "Session expired or invalid") {
              localStorage.removeItem("token");
              localStorage.removeItem("isLoggedIn");
              localStorage.removeItem("isVerified");
              localStorage.removeItem("userIdentifier");
              localStorage.removeItem("identifierType");
              localStorage.removeItem("userId");
            }
            setState((prev) => ({ ...prev, loading: false }));
          }
        } else {
          setState((prev) => ({ ...prev, loading: false }));
        }
      };

      checkSession();
    } else if (user) {
      const roleName = user.role?.roleName.toLowerCase().replace(/\s+/g, "");
      if (!roleName) {
        router.push("/my-learnings");
      } else if (
        (roleName === "student" || roleName === "teacher") &&
        (user.isFirstLogin || !user.isTimezoneSet)
      ) {
        router.push("/timezone-setup");
      } else if (roleName === "admin" || roleName === "superadmin") {
        router.push(`/${roleName}`);
      } else {
        router.push(`/${roleName}`);
      }
    } else {
      setState((prev) => ({ ...prev, loading: false }));
    }
  }, [deviceId, authLoading, user, router, setUser]);

  if (authLoading) {
    return <LoadingPage message="Checking authentication..." color="#ff0000" />;
  }

  const handleCountryChange = (isoCode: string, dialCode: string) => {
    setState((prev) => ({
      ...prev,
      selectedCountry: isoCode,
      countryCode: dialCode,
    }));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setState((prev) => ({
      ...prev,
      errors: { identifier: "", login: "" },
      loading: true,
    }));

    const normalizedIdentifier = identifier.replace(/\s+/g, "").toLowerCase(); // Normalize identifier to lowercase
    const validation = validateIdentifier(normalizedIdentifier, countryCode);
    if (!validation.isValid) {
      setState((prev) => ({
        ...prev,
        errors: { ...prev.errors, identifier: validation.error || "" },
        loading: false,
      }));
      toast.error(validation.error || "Invalid input");
      return;
    }

    try {
      const payload = {
        identifier:
          validation.type === "phone" ? validation.fullPhone : normalizedIdentifier,
      };
      const res = await api.post("/auth/login", payload, {
        headers: { "Device-Id": deviceId },
      });

      if (res.data.message === "Active session found, please use direct login") {
        const { token } = res.data; 
        const response = await api.post(
          "/auth/direct-login",
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Device-Id": deviceId,
            },
          }
        );

        const { user: directLoginUser, token: newToken } = response.data;
        localStorage.setItem("token", newToken);
        localStorage.setItem("userId", directLoginUser._id);
        localStorage.setItem("isLoggedIn", "true");
        setUser(directLoginUser);
        toast.success("Logged in successfully!");

        const roleName = directLoginUser.role?.roleName.toLowerCase().replace(/\s+/g, "");
        if (!roleName) {
          router.push("/my-learnings");
        } else if (
          (roleName === "student" || roleName === "teacher") &&
          (directLoginUser.isFirstLogin || !directLoginUser.isTimezoneSet)
        ) {
          router.push("/timezone-setup");
        } else if (roleName === "admin" || roleName === "superadmin") {
          router.push(`/${roleName}`);
        } else {
          router.push(`/${roleName}`);
        }
        return;
      }

      const identifierValue =
        validation.type === "phone" ? validation.fullPhone! : normalizedIdentifier;
      const identifierType = validation.type;

      localStorage.setItem("userIdentifier", identifierValue);
      localStorage.setItem("identifierType", identifierType);
      localStorage.setItem("userId", res.data.userId);

      setState((prev) => ({
        ...prev,
        identifier: "",
        errors: { identifier: "", login: "" },
        loading: false,
      }));
      toast.success("OTP sent! Please check your email or phone.");
      router.push(`/verify-otp?userId=${res.data.userId}&type=login`);
    } catch (error) { 
      const errorMsg = error as ApiError;
      const errors = errorMsg.response?.data?.errors?.[0]?.msg ||
        errorMsg.response?.data?.message ||
        "Login failed. Please try again.";
      setState((prev) => ({
        ...prev,
        errors: { ...prev.errors, login: errors },
        loading: false,
      }));
      toast.error(errors);
      console.error("Login failed:", errorMsg);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Card
        className="w-full max-w-[400px] bg-white border-2 border-[#dddd] rounded-3xl transition-all mt-20"
        style={{
          transform:
            "perspective(1000px) rotateX(2deg) rotateY(2deg) translateY(0)",
          boxShadow: "6px 6px 0 0 #dddd",
          border: "1px solid #eeee",
          transition:
            "transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out, border 0.3s ease-in-out",
        }}
        onMouseEnter={(e) => {
          const card = e.currentTarget;
          card.style.transform =
            "perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(-8px)";
          card.style.boxShadow = "12px 12px 0 0 #dddd";
          card.style.border = "1px solid #eeee";
        }}
        onMouseLeave={(e) => {
          const card = e.currentTarget;
          card.style.transform =
            "perspective(1000px) rotateX(2deg) rotateY(2deg) translateY(0)";
          card.style.boxShadow = "6px 6px 0 0 #dddd";
          card.style.border = "1px solid #eeee";
        }}
      >
        <CardHeader className="pt-3">
          <div className="flex justify-start">
            <Image
              src={Logo}
              alt="Klariti Logo"
              width={50}
              height={60}
              className="object-contain"
            />
          </div>
          <CardTitle className="text-start text-3xl font-bold text-gray-900 break-words pt-2">
            Continue to use Klariti
          </CardTitle>
          <p className="text-start text-md text-black-500 mt-1">
            Welcome back! Please enter your details.
          </p>
          {sessionExpired === "true" && (
            <p className="text-red-500 text-sm mt-2">
              Session expired. Please log in again.
            </p>
          )}
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <form onSubmit={handleLogin}>
            <div className="mb-4">
              {isPhoneLogin ? (
                <div className="flex items-center space-x-2">
                  <div className="relative rounded-md px-2 py-2 bg-white cursor-pointer border-0">
                    <CountryDropdown
                      value={selectedCountry}
                      onChange={handleCountryChange}
                      slim
                    />
                  </div>
                  <Input
                    id="identifier"
                    value={identifier}
                    onChange={(e) =>
                      setState((prev) => ({
                        ...prev,
                        identifier: e.target.value.replace(/\s+/g, ""),
                      }))
                    }
                    placeholder="Enter phone number"
                    required
                    disabled={loading}
                    className={`flex-1 px-4 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 border ${
                      errors.identifier ? "border-red-500" : "border-gray-300"
                    } rounded-md`}
                  />
                </div>
              ) : (
                <Input
                  id="identifier"
                  value={identifier}
                  onChange={(e) =>
                    setState((prev) => ({
                      ...prev,
                      identifier: e.target.value,
                    }))
                  }
                  placeholder="Enter your email"
                  required
                  disabled={loading}
                  className={`w-full border ${
                    errors.identifier ? "border-red-500" : "border-gray-300"
                  } rounded-md px-4 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 mt-1`}
                />
              )}
              {errors.identifier && (
                <p className="text-red-500 text-sm mt-1">{errors.identifier}</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors cursor-pointer mb-4"
              disabled={loading}
            >
              {loading ? "Checking..." : "Login"}
            </Button>
            {errors.login && (
              <p className="text-red-500 text-sm mb-4">{errors.login}</p>
            )}
            <p
              className="text-center text-md cursor-pointer"
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  isPhoneLogin: !prev.isPhoneLogin,
                  identifier: "",
                  errors: { identifier: "", login: "" },
                }))
              }
            >
              <span className="text-gray-600">OR</span>
              <span className="text-blue-500 font-semibold">
                {isPhoneLogin
                  ? ", Login using email"
                  : ", Login using phone number"}
              </span>
            </p>
            <p className="text-center text-sm text-gray-600 mt-3">
              Not registered yet?{" "}
              <Link href="/signup" className="text-blue-600 cursor-pointer">
                Sign Up
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<SuspenseFallback />}>
      <LoginContent />
    </Suspense>
  );
}