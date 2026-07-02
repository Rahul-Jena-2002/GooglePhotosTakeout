/**
 * ToolWorkspace — root entry file.
 *
 * This file is intentionally lean: it provides auth guards (loading, maintenance,
 * suspended, !user) and then delegates all rendering to three focused components:
 *   - RestorePanel  (main content area — 4 tool tabs)
 *   - CommandSidebar (left panel — quotas, telemetry, stats)
 *   - ToolModals    (all floating modal overlays)
 *
 * All state and processing logic lives in useToolPipeline.ts.
 */
import React from "react"
import { HardDrive, AlertCircle } from "lucide-react"
import { Button } from "../components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card"
import AdBlockGate from "../components/AdBlockGate"
import { AuthProvider, useAuth } from "../contexts/AuthContext"
import { ToastContainer } from "../components/ui/toast"
import { useToolPipeline } from "../tool-workspace/useToolPipeline"
import { RestorePanel } from "../tool-workspace/RestorePanel"
import { CommandSidebar } from "../tool-workspace/CommandSidebar"
import { ToolModals } from "../tool-workspace/ToolModals"

// ---------------------------------------------------------------------------
// Inner component — rendered inside AuthProvider
// ---------------------------------------------------------------------------
export function ToolWorkspaceContent() {
  const { user, userData, loading, login } = useAuth()

  // ── Pipeline hook (all state + handlers) ──────────────────────────────────
  const pipeline = useToolPipeline()

  // ── Auth / system guards (all hooks are above — React rules of hooks) ──────
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-t-zinc-200 border-zinc-800 rounded-full animate-spin"></div>
      </div>
    )
  }

  if (pipeline.maintenance) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-black flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 animate-pulse" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Workspace Under Maintenance</h1>
        <p className="text-zinc-400 max-w-md mb-8">
          The TakeoutFix restoration engine is currently undergoing system updates. Normal operations will resume shortly. Thank you for your patience!
        </p>
        <a href="/dashboard" className="px-6 py-2.5 rounded-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-300 hover:text-white transition-all font-semibold">
          Return to Dashboard
        </a>
      </div>
    )
  }

  if (user && userData?.suspended) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">Account Suspended</h1>
        <p className="text-zinc-400 max-w-md mb-8">
          Your account has been suspended for violating our terms of service or due to an administrative hold. If you believe this is a mistake, please contact our support team.
        </p>
        <div className="flex gap-4">
          <a href="/support" className="px-5 py-2 rounded-full bg-zinc-900 border border-zinc-800 text-sm text-zinc-300 hover:text-white transition-all">
            Contact Support
          </a>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#0A0A0A] flex flex-col items-center justify-center p-6 text-center relative">
        <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-zinc-500/5 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-zinc-700/5 blur-[120px] rounded-full pointer-events-none"></div>

        <Card className="bg-zinc-950/50 border-white/10 p-8 rounded-3xl backdrop-blur-2xl shadow-2xl max-w-md w-full relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-800 dark:bg-zinc-200"></div>
          <CardHeader className="text-center pb-6">
            <div className="w-12 h-12 bg-zinc-800/20 text-zinc-400 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-850">
              <HardDrive className="w-6 h-6 animate-pulse" />
            </div>
            <CardTitle className="text-2xl font-black text-white">Unlock Recovery Center</CardTitle>
            <CardDescription className="text-zinc-400 text-sm mt-2">
              Please sign in to access the local metadata restoration engine, view your quotas, and manage your files.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={login}
              className="btn-monochrome-primary w-full h-12 font-bold rounded-xl flex items-center justify-center gap-2 border-0 transition-all duration-150 cursor-pointer shadow-none"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
              Sign In with Google
            </Button>
            <a href="/" className="block text-center text-xs text-zinc-500 hover:text-white transition-colors mt-2">
              Return to Home Page
            </a>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── Main workspace layout ─────────────────────────────────────────────────
  return (
    <AdBlockGate>
      <div className="w-full lg:h-[calc(100vh-64px)] h-auto flex flex-col lg:flex-row bg-[#0A0A0A] lg:overflow-hidden overflow-y-auto">

        {/* Main content: 4 tool tabs */}
        <RestorePanel
          activeToolTab={pipeline.activeToolTab}
          setActiveToolTab={pipeline.setActiveToolTab}
          plan={pipeline.plan}
          tierThresholds={pipeline.tierThresholds}
          takeoutFolder={pipeline.takeoutFolder}
          outputFolder={pipeline.outputFolder}
          zipFile={pipeline.zipFile}
          setZipFile={pipeline.setZipFile}
          setTakeoutFolder={pipeline.setTakeoutFolder}
          isDragOver={pipeline.isDragOver}
          isProcessing={pipeline.isProcessing}
          isPaused={pipeline.isPaused}
          progress={pipeline.progress}
          stats={pipeline.stats}
          logs={pipeline.logs}
          logTab={pipeline.logTab}
          setLogTab={pipeline.setLogTab}
          logContainerRef={pipeline.logContainerRef as React.RefObject<HTMLDivElement>}
          getEstimatedRestoreTime={pipeline.getEstimatedRestoreTime}
          pendingSession={pipeline.pendingSession}
          setPendingSession={pipeline.setPendingSession}
          sessionManagerRef={pipeline.sessionManagerRef}
          handleDragOver={pipeline.handleDragOver}
          handleDragLeave={pipeline.handleDragLeave}
          handleDrop={pipeline.handleDrop}
          handleSelectTakeout={pipeline.handleSelectTakeout}
          handleSelectOutput={pipeline.handleSelectOutput}
          handleReGrantPermissions={pipeline.handleReGrantPermissions}
          startProcessing={pipeline.startProcessing}
          cancelProcessing={pipeline.cancelProcessing}
          pauseProcessing={pipeline.pauseProcessing}
          resumeProcessing={pipeline.resumeProcessing}
          setShowCompareModal={pipeline.setShowCompareModal}
          viewerFile={pipeline.viewerFile}
          viewerExif={pipeline.viewerExif}
          viewerLoading={pipeline.viewerLoading}
          handleViewerFileChange={pipeline.handleViewerFileChange}
          compMediaFile={pipeline.compMediaFile}
          compJsonFile={pipeline.compJsonFile}
          compResult={pipeline.compResult}
          handleCompFilesChange={pipeline.handleCompFilesChange}
          dupFolder={pipeline.dupFolder}
          dupIsScanning={pipeline.dupIsScanning}
          dupStats={pipeline.dupStats}
          dupGroups={pipeline.dupGroups}
          dupScanStatus={pipeline.dupScanStatus}
          handleSelectDupFolder={pipeline.handleSelectDupFolder}
          startDuplicateScan={pipeline.startDuplicateScan}
          zipMode={pipeline.zipMode}
        />

        {/* Left sidebar: command center */}
        <CommandSidebar
          plan={pipeline.plan}
          limitFiles={pipeline.limitFiles}
          limitBytes={pipeline.limitBytes}
          currentUsedFiles={pipeline.currentUsedFiles}
          currentUsedBytes={pipeline.currentUsedBytes}
          sessionFiles={pipeline.sessionFiles}
          sessionBytes={pipeline.sessionBytes}
          formatByteSize={pipeline.formatByteSize}
          stats={pipeline.stats}
          isProcessing={pipeline.isProcessing}
          isPaused={pipeline.isPaused}
          useDeepExif={pipeline.useDeepExif}
          maxWorkers={pipeline.maxWorkers}
          telemetryCpu={pipeline.telemetryCpu}
          telemetryMem={pipeline.telemetryMem}
          telemetryTabHeap={pipeline.telemetryTabHeap}
          telemetryWorkers={pipeline.telemetryWorkers}
          userData={pipeline.userData}
          resetUserQuota={pipeline.resetUserQuota}
        />

      </div>

      {/* All modal overlays */}
      <ToolModals
        quotaAlert={pipeline.quotaAlert}
        setQuotaAlert={pipeline.setQuotaAlert}
        popupModal={pipeline.popupModal}
        setPopupModal={pipeline.setPopupModal}
        showCompareModal={pipeline.showCompareModal}
        setShowCompareModal={pipeline.setShowCompareModal}
        modalContext={pipeline.modalContext}
        setModalContext={pipeline.setModalContext}
        handleModalConfirm={pipeline.handleModalConfirm}
      />
    </AdBlockGate>
  )
}

// ---------------------------------------------------------------------------
// Default export — wraps everything in AuthProvider + toast container
// ---------------------------------------------------------------------------
export default function ToolWorkspace() {
  return (
    <AuthProvider>
      <ToolWorkspaceContent />
      <ToastContainer />
    </AuthProvider>
  )
}
