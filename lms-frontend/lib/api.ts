import axios, { InternalAxiosRequestConfig, AxiosRequestHeaders } from "axios";

interface PendingRequest {
  resolve: (config: InternalAxiosRequestConfig) => void;
  config: InternalAxiosRequestConfig;
}

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

let isSessionRestored = false;
let pendingRequests: PendingRequest[] = [];

const QUEUE_TIMEOUT = 5000;

export const setSessionRestored = (value: boolean) => {
  console.debug("[API] Setting isSessionRestored:", value);
  isSessionRestored = value;
  if (value && pendingRequests.length > 0) {
    console.debug(
      "[API] Resolving",
      pendingRequests.length,
      "pending requests"
    );
    pendingRequests.forEach(({ resolve, config }) => resolve(config));
    pendingRequests = [];
  }
};

api.interceptors.request.use(
  (
    config: InternalAxiosRequestConfig
  ): InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig> => {
    config.headers = config.headers || ({} as AxiosRequestHeaders);

    if (config.url?.includes("/auth/direct-login")) {
      console.debug(
        "[API] Bypassing interceptor for direct-login:",
        config.url
      );
      return config;
    }

    if (!isSessionRestored) {
      console.debug("[API] Session not restored, queuing request:", config.url);
      return new Promise(
        (resolve: (config: InternalAxiosRequestConfig) => void, reject) => {
          pendingRequests.push({ resolve, config });
          setTimeout(() => {
            if (
              !isSessionRestored &&
              pendingRequests.some((req) => req.config === config)
            ) {
              console.error(
                "[API] Request timeout waiting for session restoration:",
                config.url
              );
              pendingRequests = pendingRequests.filter(
                (req) => req.config !== config
              );
              reject(new Error("Session restoration timeout"));
              localStorage.setItem("isLoggedIn", "false");
            }
          }, QUEUE_TIMEOUT);
        }
      );
    }

    const token = localStorage.getItem("token");
    const deviceId = localStorage.getItem("deviceId");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    } else {
      console.warn("[API] No token found for request:", config.url);
    }
    if (deviceId) {
      config.headers["Device-Id"] = deviceId;
    } else {
      console.warn("[API] No deviceId found for request:", config.url);
    }
    console.debug("[API] Sending request:", {
      url: config.url,
      method: config.method,
    });
    return config;
  },
  (error) => {
    console.error("[API] Request interceptor error:", error);
    return Promise.reject(error);
  }
);

// api.interceptors.response.use(
//   (response) => {
//     console.debug("[API] Response received:", {
//       url: response.config.url,
//       status: response.status,
//     });
//     return response;
//   },
//   (error) => {
//     console.error("[API] Response error:", {
//       url: error.config?.url,
//       status: error.response?.status,
//       message: error.response?.data?.message,
//     });
//     if (
//       error.response?.status === 401 &&
//       !error.config.url.includes("/auth/logout")
//     ) {
//       console.warn("[API] 401 Unauthorized, clearing session");
//       localStorage.setItem("isLoggedIn", "false");
//       if (typeof window !== "undefined") {
//         window.location.href = "/login";
//       }
//     }
//     return Promise.reject(error);
//   }
// );

api.interceptors.response.use(
  (response) => {
    console.debug("[API] Response received:", {
      url: response.config.url,
      status: response.status,
    });
    if (response.data.token) {
      const currentToken = localStorage.getItem("token");
      if (response.data.token !== currentToken) {
        localStorage.setItem("token", response.data.token);
        console.debug("[API] Updated token in localStorage from response:", response.config.url);
      }
    }
    return response;
  },
  (error) => {
    console.error("[API] Response error:", {
      url: error.config?.url,
      status: error.response?.status,
      message: error.response?.data?.message,
    });
    if (
      error.response?.status === 401 &&
      !error.config.url.includes("/auth/logout")
    ) {
      console.warn("[API] 401 Unauthorized, clearing session");
      localStorage.setItem("isLoggedIn", "false");
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
