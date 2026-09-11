export function detectDirectoryRole(directory: string): string | null {
  // Check for infrastructure files
  if (directory.includes("/terraform") || directory.includes("\\terraform")) return "infrastructure"

  // Check for deployment files
  if (directory.includes("/deploy") || directory.includes("\\deploy")) return "deployment"

  // Check for tests directory
  if (directory.includes("/tests") || directory.includes("\\tests")) return "tests"

  // Check for backend indicators
  if (directory.includes("/api") || directory.includes("\\api")) return "backend"
  if (directory.includes("/server") || directory.includes("\\server")) return "backend"

  // Check for frontend indicators
  if (directory.includes("/web") || directory.includes("\\web")) return "frontend"
  if (directory.includes("/app") || directory.includes("\\app")) return "frontend"

  return null
}
