/** Result of checking the installed version against the latest GitHub release. */
export interface AppUpdateCheckResult {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseName: string | null
  releaseNotes: string
  releaseUrl: string | null
}
