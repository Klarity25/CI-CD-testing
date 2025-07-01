// "use client";

// import Link from "next/link";
// import { useAuth } from "@/lib/auth";
// import { Button } from "@/components/ui/button";
// import Image from "next/image";
// import { usePathname, useRouter } from "next/navigation";
// import { MouseEvent } from "react";

// export default function Navbar() {
//   const { user } = useAuth();
//   const pathname = usePathname();
//   const router = useRouter();
//   const Logo =
//     "https://res.cloudinary.com/dlie87ah0/image/upload/v1745815676/logo4_ztueih.jpg";

//   const isAuthPage = pathname === "/login" || pathname === "/signup";

//   const smoothScrollToTop = () => {
//     const start = window.scrollY;
//     const target = 0;
//     const duration = 1500;
//     const startTime = performance.now();

//     const easeInOutQuad = (t: number): number =>
//       t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

//     const animateScroll = (currentTime: number) => {
//       const elapsed = currentTime - startTime;
//       const progress = Math.min(elapsed / duration, 1);
//       const easedProgress = easeInOutQuad(progress);

//       const newScroll = start + (target - start) * easedProgress;
//       window.scrollTo({
//         top: newScroll,
//         behavior: "auto",
//       });

//       if (progress < 1) {
//         requestAnimationFrame(animateScroll);
//       }
//     };
//     document.documentElement.style.scrollBehavior = "auto";
//     document.body.style.scrollBehavior = "auto";

//     requestAnimationFrame(animateScroll);

//     setTimeout(() => {
//       document.documentElement.style.scrollBehavior = "smooth";
//       document.body.style.scrollBehavior = "smooth";
//     }, duration);
//   };

//   const handleMyLearningsClick = (e: MouseEvent<HTMLAnchorElement>) => {
//     e.preventDefault();
//     smoothScrollToTop();

//     if (isAuthPage) {
//       return;
//     }

//     if (!user) {
//       router.push("/login");
//       return;
//     }

//     if (user && !user.role) {
//       router.push("/my-learnings");
//       return;
//     }

//     if (user?.role) {
//       router.push(`/${user.role.roleName.toLowerCase().replace(/\s+/g, '')}`);
//     }
//   };

//   return (
//     <nav className="bg-white shadow-md p-4 flex justify-between items-center fixed top-0 left-0 right-0 z-50">
//       <div className="flex items-center">
//         <Link href="/">
//           <Image
//             src={Logo}
//             alt="Klariti Logo"
//             width={103}
//             height={103}
//             className="object-contain"
//           />
//         </Link>
//       </div>

//       <div className="flex items-center space-x-6">
//         <Link href="/courses" className="text-gray-600 text-sm font-medium">
//           Courses
//         </Link>
//         <Link
//           href="/free-resources"
//           className="text-gray-600 text-sm font-medium"
//         >
//           Free Resources
//         </Link>
//         <Link
//           href="/book-a-free-demo"
//           className="text-gray-600 text-sm font-medium"
//         >
//           Book a Free Demo
//         </Link>
//         <Link href="/login" onClick={handleMyLearningsClick}>
//           <Button
//             variant="destructive"
//             className="bg-orange-500 text-white text-sm font-medium rounded-none transition-all duration-300 hover:bg-white hover:text-orange-500 hover:border hover:border-orange-500 cursor-pointer"
//           >
//             My Learnings
//           </Button>
//         </Link>
//       </div>
//     </nav>
//   );
// }

"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { MouseEvent } from "react";

export default function Navbar() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const Logo =
    "https://res.cloudinary.com/dlie87ah0/image/upload/v1745815676/logo4_ztueih.jpg";

  const isAuthPage = pathname === "/login" || pathname === "/signup";

  const smoothScrollToTop = () => {
    const start = window.scrollY;
    const target = 0;
    const duration = 1500;
    const startTime = performance.now();

    const easeInOutQuad = (t: number): number =>
      t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    const animateScroll = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeInOutQuad(progress);

      const newScroll = start + (target - start) * easedProgress;
      window.scrollTo({
        top: newScroll,
        behavior: "auto",
      });

      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      }
    };
    document.documentElement.style.scrollBehavior = "auto";
    document.body.style.scrollBehavior = "auto";

    requestAnimationFrame(animateScroll);

    setTimeout(() => {
      document.documentElement.style.scrollBehavior = "smooth";
      document.body.style.scrollBehavior = "smooth";
    }, duration);
  };

  const handleMyLearningsClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    smoothScrollToTop();

    if (isAuthPage) {
      return;
    }

    if (!user) {
      router.push("/login");
      return;
    }

    if (user && !user.role) {
      router.push("/my-learnings");
      return;
    }

    if (user?.role) {
      router.push(`/${user.role.roleName.toLowerCase().replace(/\s+/g, '')}`);
    }
  };

  return (
    <nav className="bg-white shadow-md p-4 flex justify-between items-center fixed top-0 left-0 right-0 z-50">
      <div className="flex items-center">
        <Link href="/">
          <Image
            src={Logo}
            alt="Klariti Logo"
            width={103}
            height={103}
            className="object-contain"
          />
        </Link>
      </div>

      <div className="flex items-center space-x-6">
        {/* Replace Link with span to make non-clickable and prevent prefetching */}
        <span className="text-gray-600 text-sm font-medium cursor-not-allowed opacity-50">
          Courses
        </span>
        <span className="text-gray-600 text-sm font-medium cursor-not-allowed opacity-50">
          Free Resources
        </span>
        <span className="text-gray-600 text-sm font-medium cursor-not-allowed opacity-50">
          Book a Free Demo
        </span>
        <Link href="/login" onClick={handleMyLearningsClick}>
          <Button
            variant="destructive"
            className="bg-orange-500 text-white text-sm font-medium rounded-none transition-all duration-300 hover:bg-white hover:text-orange-500 hover:border hover:border-orange-500 cursor-pointer"
          >
            My Learnings
          </Button>
        </Link>
      </div>
    </nav>
  );
}