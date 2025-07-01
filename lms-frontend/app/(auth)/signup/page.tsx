// "use client";

// import { useEffect, useState } from "react";
// import { useRouter } from "next/navigation";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
// import Link from "next/link";
// import api from "@/lib/api";
// import toast from "react-hot-toast";
// import { CountryDropdown } from "@/components/ui/country-dropdown";
// import { v4 as uuidv4 } from "uuid";
// import Image from "next/image";
// import { IoMdMale, IoMdFemale } from "react-icons/io";
// import { FaTransgender } from "react-icons/fa";
// import { ApiError, SignupState } from "@/types";

// const validateInputs = (
//   name: string,
//   email: string,
//   phone: string,
//   gender: string
// ) => {
//   const errors: {
//     name?: string;
//     email?: string;
//     phone?: string;
//     gender?: string;
//   } = {};
//   if (!name.match(/^[A-Za-z\s]+$/)) {
//     errors.name = "Name must contain only letters and spaces";
//   }
//   const cleanEmail = email.replace(/\s+/g, "");
//   if (!cleanEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
//     errors.email = "Invalid email format";
//   }
//   if (!phone.match(/^\d{10}$/)) {
//     errors.phone = "Phone number must be 10 digits";
//   }
//   if (!gender) {
//     errors.gender = "Gender is required";
//   }
//   return errors;
// };

// export default function Signup() {
//   const [state, setState] = useState<SignupState>({
//     name: "",
//     email: "",
//     phone: "",
//     gender: "",
//     countryCode: "+91",
//     selectedCountry: "IN",
//     errors: {},
//     loading: false,
//     isLoggedIn: false,
//     deviceId: "",
//   });

//   const router = useRouter();
//   const Logo =
//     "https://res.cloudinary.com/dlie87ah0/image/upload/v1745815677/logo5_olvuok.jpg";

//   useEffect(() => {
//     let deviceId = localStorage.getItem("deviceId");
//     if (!deviceId) {
//       deviceId = uuidv4();
//       localStorage.setItem("deviceId", deviceId);
//     }
//     setState((prev) => ({ ...prev, deviceId: deviceId! }));
//   }, []);

//   const {
//     name,
//     email,
//     phone,
//     gender,
//     countryCode,
//     selectedCountry,
//     errors,
//     loading,
//     deviceId,
//   } = state;

//   const handleCountryChange = (isoCode: string, dialCode: string) => {
//     setState((prev) => ({
//       ...prev,
//       selectedCountry: isoCode,
//       countryCode: dialCode,
//     }));
//   };

//   const handleGenderChange = (selectedGender: string) => {
//     setState((prev) => ({
//       ...prev,
//       gender: selectedGender,
//       errors: { ...prev.errors, gender: undefined },
//     }));
//   };

//   const handleSignup = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setState((prev) => ({ ...prev, errors: {}, loading: true }));

//     const validationErrors = validateInputs(name, email, phone, gender);
//     if (Object.keys(validationErrors).length > 0) {
//       setState((prev) => ({
//         ...prev,
//         errors: { ...validationErrors },
//         loading: false,
//       }));
//       return;
//     }

//     try {
//       const fullPhone = `${countryCode}${phone}`;
//       const res = await api.post(
//         "/auth/signup",
//         { name, email, phone: fullPhone, gender },
//         { headers: { "Device-Id": deviceId } }
//       );

//       localStorage.setItem("userEmail", email);
//       localStorage.setItem("userPhone", fullPhone);

//       setState((prev) => ({
//         ...prev,
//         name: "",
//         email: "",
//         phone: "",
//         gender: "",
//         errors: {},
//         loading: false,
//       }));
//       toast.success("OTPs sent to your email and phone!");
//       router.push(
//         `/verify-otp?verificationId=${res.data.verificationId}&type=signup`
//       );
//     } catch (error) {
//       const axiosError = error as ApiError;
//       const errorMsg =
//         axiosError.response?.data?.errors?.[0]?.msg ||
//         "Signup failed. Please try again.";
//       setState((prev) => ({
//         ...prev,
//         errors: { signup: errorMsg },
//         loading: false,
//       }));
//       toast.error(errorMsg);
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
//             Sign Up for Klariti
//           </CardTitle>
//           <p className="text-start text-md text-black-500 mt-1">
//             Create your account to start learning.
//           </p>
//         </CardHeader>
//         <CardContent className="px-6 pb-6">
//           <form onSubmit={handleSignup}>
//             <div className="mb-4">
//               <Input
//                 id="name"
//                 value={name}
//                 onChange={(e) =>
//                   setState((prev) => ({ ...prev, name: e.target.value }))
//                 }
//                 placeholder="Enter your name"
//                 required
//                 disabled={loading}
//                 className={`w-full border ${
//                   errors.name ? "border-red-500" : "border-gray-300"
//                 } rounded-md px-4 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500`}
//               />
//               {errors.name && (
//                 <p className="text-red-500 text-sm mt-1">{errors.name}</p>
//               )}
//             </div>
//             <div className="mb-4">
//               <Input
//                 id="email"
//                 value={email}
//                 onChange={(e) =>
//                   setState((prev) => ({
//                     ...prev,
//                     email: e.target.value.replace(/\s+/g, ""),
//                   }))
//                 }
//                 placeholder="Enter your email"
//                 required
//                 disabled={loading}
//                 className={`w-full border ${
//                   errors.email ? "border-red-500" : "border-gray-300"
//                 } rounded-md px-4 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500`}
//               />
//               {errors.email && (
//                 <p className="text-red-500 text-sm mt-1">{errors.email}</p>
//               )}
//             </div>
//             <div className="mb-4">
//               <div className="flex items-center space-x-2">
//                 <div className="relative rounded-md px-2 py-2 bg-white cursor-pointer border-0">
//                   <CountryDropdown
//                     value={selectedCountry}
//                     onChange={handleCountryChange}
//                     slim
//                   />
//                 </div>
//                 <Input
//                   id="phone"
//                   value={phone}
//                   onChange={(e) =>
//                     setState((prev) => ({ ...prev, phone: e.target.value }))
//                   }
//                   placeholder="Enter phone number"
//                   required
//                   disabled={loading}
//                   className={`flex-1 border ${
//                     errors.phone ? "border-red-500" : "border-gray-300"
//                   } rounded-md px-4 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500`}
//                 />
//               </div>
//               {errors.phone && (
//                 <p className="text-red-500 text-sm mt-1">{errors.phone}</p>
//               )}
//             </div>
//             <div className="mb-4">
//               <div className="flex justify-center items-center p-4 border border-gray-300 rounded-lg bg-gray-50">
//                 <div className="flex space-x-4 sm:space-x-6">
//                   <div
//                     onClick={() => handleGenderChange("male")}
//                     onKeyDown={(e) =>
//                       e.key === "Enter" && handleGenderChange("male")
//                     }
//                     tabIndex={0}
//                     role="radio"
//                     aria-checked={gender === "male"}
//                     className="flex flex-col items-center p-3 cursor-pointer transition-all duration-300 transform hover:scale-105"
//                   >
//                     <div
//                       className={`w-12 h-12 flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
//                         gender === "male"
//                           ? "border-blue-500 text-blue-500 bg-blue-100"
//                           : "border-gray-300 text-gray-500 bg-gray-100 hover:border-blue-400 hover:text-blue-400 hover:bg-blue-100"
//                       } mb-2`}
//                     >
//                       <IoMdMale size={30} />
//                     </div>
//                     <span
//                       className={`text-sm font-medium px-2 py-1 rounded transition-all duration-300 ${
//                         gender === "male"
//                           ? "text-blue-500 bg-blue-100"
//                           : "text-gray-700 hover:text-blue-400 hover:bg-blue-100"
//                       }`}
//                     >
//                       Male
//                     </span>
//                   </div>
//                   <div
//                     onClick={() => handleGenderChange("female")}
//                     onKeyDown={(e) =>
//                       e.key === "Enter" && handleGenderChange("female")
//                     }
//                     tabIndex={0}
//                     role="radio"
//                     aria-checked={gender === "female"}
//                     className="flex flex-col items-center p-3 cursor-pointer transition-all duration-300 transform hover:scale-105"
//                   >
//                     <div
//                       className={`w-12 h-12 flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
//                         gender === "female"
//                           ? "border-blue-500 text-blue-500 bg-blue-100"
//                           : "border-gray-300 text-gray-500 bg-gray-100 hover:border-blue-400 hover:text-blue-400 hover:bg-blue-100"
//                       } mb-2`}
//                     >
//                       <IoMdFemale size={30} />
//                     </div>
//                     <span
//                       className={`text-sm font-medium px-2 py-1 rounded transition-all duration-300 ${
//                         gender === "female"
//                           ? "text-blue-500 bg-blue-100"
//                           : "text-gray-700 hover:text-blue-400 hover:bg-blue-100"
//                       }`}
//                     >
//                       Female
//                     </span>
//                   </div>
//                   <div
//                     onClick={() => handleGenderChange("other")}
//                     onKeyDown={(e) =>
//                       e.key === "Enter" && handleGenderChange("other")
//                     }
//                     tabIndex={0}
//                     role="radio"
//                     aria-checked={gender === "other"}
//                     className="flex flex-col items-center p-3 cursor-pointer transition-all duration-300 transform hover:scale-105"
//                   >
//                     <div
//                       className={`w-12 h-12 flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
//                         gender === "other"
//                           ? "border-blue-500 text-blue-500 bg-blue-100"
//                           : "border-gray-300 text-gray-500 bg-gray-100 hover:border-blue-400 hover:text-blue-400 hover:bg-blue-100"
//                       } mb-2`}
//                     >
//                       <FaTransgender size={30} />
//                     </div>
//                     <span
//                       className={`text-sm font-medium px-2 py-1 rounded transition-all duration-300 ${
//                         gender === "other"
//                           ? "text-blue-500 bg-blue-100"
//                           : "text-gray-700 hover:text-blue-400 hover:bg-blue-100"
//                       }`}
//                     >
//                       Other
//                     </span>
//                   </div>
//                 </div>
//               </div>
//               {errors.gender && (
//                 <p className="text-red-500 text-sm mt-1">{errors.gender}</p>
//               )}
//             </div>
//             <Button
//               type="submit"
//               className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors cursor-pointer mb-4"
//               disabled={loading}
//             >
//               {loading ? "Sending OTPs..." : "Request OTPs"}
//             </Button>
//             {errors.signup && (
//               <p className="text-red-500 text-sm mb-4">{errors.signup}</p>
//             )}
//             <p className="text-center text-sm text-gray-600 mt-3">
//               Already have an account?{" "}
//               <Link href="/login" className="text-blue-600 cursor-pointer">
//                 Log In
//               </Link>
//             </p>
//           </form>
//         </CardContent>
//       </Card>
//     </div>
//   );
// }

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import api from "@/lib/api";
import toast from "react-hot-toast";
import { CountryDropdown } from "@/components/ui/country-dropdown";
import { v4 as uuidv4 } from "uuid";
import Image from "next/image";
import { IoMdMale, IoMdFemale } from "react-icons/io";
import { FaTransgender } from "react-icons/fa";
import { ApiError, SignupState } from "@/types";

const validateInputs = (
  name: string,
  email: string,
  phone: string,
  gender: string
) => {
  const errors: {
    name?: string;
    email?: string;
    phone?: string;
    gender?: string;
  } = {};
  if (!name.match(/^[A-Za-z\s]+$/)) {
    errors.name = "Name must contain only letters and spaces";
  }
  const cleanEmail = email.replace(/\s+/g, "").toLowerCase(); // Normalize email to lowercase
  if (!cleanEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    errors.email = "Invalid email format";
  }
  if (!phone.match(/^\d{10}$/)) {
    errors.phone = "Phone number must be 10 digits";
  }
  if (!gender) {
    errors.gender = "Gender is required";
  }
  return errors;
};

export default function Signup() {
  const [state, setState] = useState<SignupState>({
    name: "",
    email: "",
    phone: "",
    gender: "",
    countryCode: "+91",
    selectedCountry: "IN",
    errors: {},
    loading: false,
    isLoggedIn: false,
    deviceId: "",
  });

  const router = useRouter();
  const Logo =
    "https://res.cloudinary.com/dlie87ah0/image/upload/v1745815677/logo5_olvuok.jpg";

  useEffect(() => {
    let deviceId = localStorage.getItem("deviceId");
    if (!deviceId) {
      deviceId = uuidv4();
      localStorage.setItem("deviceId", deviceId);
    }
    setState((prev) => ({ ...prev, deviceId: deviceId! }));
  }, []);

  const {
    name,
    email,
    phone,
    gender,
    countryCode,
    selectedCountry,
    errors,
    loading,
    deviceId,
  } = state;

  const handleCountryChange = (isoCode: string, dialCode: string) => {
    setState((prev) => ({
      ...prev,
      selectedCountry: isoCode,
      countryCode: dialCode,
    }));
  };

  const handleGenderChange = (selectedGender: string) => {
    setState((prev) => ({
      ...prev,
      gender: selectedGender,
      errors: { ...prev.errors, gender: undefined },
    }));
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setState((prev) => ({ ...prev, errors: {}, loading: true }));

    const normalizedEmail = email.replace(/\s+/g, "").toLowerCase(); // Normalize email to lowercase
    const validationErrors = validateInputs(name, normalizedEmail, phone, gender);
    if (Object.keys(validationErrors).length > 0) {
      setState((prev) => ({
        ...prev,
        errors: { ...validationErrors },
        loading: false,
      }));
      return;
    }

    try {
      const fullPhone = `${countryCode}${phone}`;
      const res = await api.post(
        "/auth/signup",
        { name, email: normalizedEmail, phone: fullPhone, gender },
        { headers: { "Device-Id": deviceId } }
      );

      localStorage.setItem("userEmail", normalizedEmail);
      localStorage.setItem("userPhone", fullPhone);

      setState((prev) => ({
        ...prev,
        name: "",
        email: "",
        phone: "",
        gender: "",
        errors: {},
        loading: false,
      }));
      toast.success("OTPs sent to your email and phone!");
      router.push(
        `/verify-otp?verificationId=${res.data.verificationId}&type=signup`
      );
    } catch (error) {
      const axiosError = error as ApiError;
      const errorMsg =
        axiosError.response?.data?.errors?.[0]?.msg ||
        "Signup failed. Please try again.";
      setState((prev) => ({
        ...prev,
        errors: { signup: errorMsg },
        loading: false,
      }));
      toast.error(errorMsg);
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
            Sign Up for Klariti
          </CardTitle>
          <p className="text-start text-md text-black-500 mt-1">
            Create your account to start learning.
          </p>
        </CardHeader>
        <CardContent className="px-6 pb-6">
          <form onSubmit={handleSignup}>
            <div className="mb-4">
              <Input
                id="name"
                value={name}
                onChange={(e) =>
                  setState((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Enter your name"
                required
                disabled={loading}
                className={`w-full border ${
                  errors.name ? "border-red-500" : "border-gray-300"
                } rounded-md px-4 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500`}
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1">{errors.name}</p>
              )}
            </div>
            <div className="mb-4">
              <Input
                id="email"
                value={email}
                onChange={(e) =>
                  setState((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
                placeholder="Enter your email"
                required
                disabled={loading}
                className={`w-full border ${
                  errors.email ? "border-red-500" : "border-gray-300"
                } rounded-md px-4 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500`}
              />
              {errors.email && (
                <p className="text-red-500 text-sm mt-1">{errors.email}</p>
              )}
            </div>
            <div className="mb-4">
              <div className="flex items-center space-x-2">
                <div className="relative rounded-md px-2 py-2 bg-white cursor-pointer border-0">
                  <CountryDropdown
                    value={selectedCountry}
                    onChange={handleCountryChange}
                    slim
                  />
                </div>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) =>
                    setState((prev) => ({ ...prev, phone: e.target.value }))
                  }
                  placeholder="Enter phone number"
                  required
                  disabled={loading}
                  className={`flex-1 border ${
                    errors.phone ? "border-red-500" : "border-gray-300"
                  } rounded-md px-4 py-3 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500`}
                />
              </div>
              {errors.phone && (
                <p className="text-red-500 text-sm mt-1">{errors.phone}</p>
              )}
            </div>
            <div className="mb-4">
              <div className="flex justify-center items-center p-4 border border-gray-300 rounded-lg bg-gray-50">
                <div className="flex space-x-4 sm:space-x-6">
                  <div
                    onClick={() => handleGenderChange("male")}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleGenderChange("male")
                    }
                    tabIndex={0}
                    role="radio"
                    aria-checked={gender === "male"}
                    className="flex flex-col items-center p-3 cursor-pointer transition-all duration-300 transform hover:scale-105"
                  >
                    <div
                      className={`w-12 h-12 flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
                        gender === "male"
                          ? "border-blue-500 text-blue-500 bg-blue-100"
                          : "border-gray-300 text-gray-500 bg-gray-100 hover:border-blue-400 hover:text-blue-400 hover:bg-blue-100"
                      } mb-2`}
                    >
                      <IoMdMale size={30} />
                    </div>
                    <span
                      className={`text-sm font-medium px-2 py-1 rounded transition-all duration-300 ${
                        gender === "male"
                          ? "text-blue-500 bg-blue-100"
                          : "text-gray-700 hover:text-blue-400 hover:bg-blue-100"
                      }`}
                    >
                      Male
                    </span>
                  </div>
                  <div
                    onClick={() => handleGenderChange("female")}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleGenderChange("female")
                    }
                    tabIndex={0}
                    role="radio"
                    aria-checked={gender === "female"}
                    className="flex flex-col items-center p-3 cursor-pointer transition-all duration-300 transform hover:scale-105"
                  >
                    <div
                      className={`w-12 h-12 flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
                        gender === "female"
                          ? "border-blue-500 text-blue-500 bg-blue-100"
                          : "border-gray-300 text-gray-500 bg-gray-100 hover:border-blue-400 hover:text-blue-400 hover:bg-blue-100"
                      } mb-2`}
                    >
                      <IoMdFemale size={30} />
                    </div>
                    <span
                      className={`text-sm font-medium px-2 py-1 rounded transition-all duration-300 ${
                        gender === "female"
                          ? "text-blue-500 bg-blue-100"
                          : "text-gray-700 hover:text-blue-400 hover:bg-blue-100"
                      }`}
                    >
                      Female
                    </span>
                  </div>
                  <div
                    onClick={() => handleGenderChange("other")}
                    onKeyDown={(e) =>
                      e.key === "Enter" && handleGenderChange("other")
                    }
                    tabIndex={0}
                    role="radio"
                    aria-checked={gender === "other"}
                    className="flex flex-col items-center p-3 cursor-pointer transition-all duration-300 transform hover:scale-105"
                  >
                    <div
                      className={`w-12 h-12 flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
                        gender === "other"
                          ? "border-blue-500 text-blue-500 bg-blue-100"
                          : "border-gray-300 text-gray-500 bg-gray-100 hover:border-blue-400 hover:text-blue-400 hover:bg-blue-100"
                      } mb-2`}
                    >
                      <FaTransgender size={30} />
                    </div>
                    <span
                      className={`text-sm font-medium px-2 py-1 rounded transition-all duration-300 ${
                        gender === "other"
                          ? "text-blue-500 bg-blue-100"
                          : "text-gray-700 hover:text-blue-400 hover:bg-blue-100"
                      }`}
                    >
                      Other
                    </span>
                  </div>
                </div>
              </div>
              {errors.gender && (
                <p className="text-red-500 text-sm mt-1">{errors.gender}</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-lg transition-colors cursor-pointer mb-4"
              disabled={loading}
            >
              {loading ? "Sending OTPs..." : "Request OTPs"}
            </Button>
            {errors.signup && (
              <p className="text-red-500 text-sm mb-4">{errors.signup}</p>
            )}
            <p className="text-center text-sm text-gray-600 mt-3">
              Already have an account?{" "}
              <Link href="/login" className="text-blue-600 cursor-pointer">
                Log In
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}