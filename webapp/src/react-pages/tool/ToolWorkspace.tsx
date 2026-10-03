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
import React, { useEffect, useState } from "react"
import { AlertCircle } from "lucide-react"
import AdBlockGate from "../../components/monetization/AdBlockGate"
import { AuthProvider, useAuth } from "../../contexts/AuthContext"
import { ToastContainer } from "../../components/ui/toast"
import { useToolPipeline } from "../../tool-workspace/useToolPipeline"
import { RestorePanel } from "../../tool-workspace/RestorePanel"
import { ToolModals } from "../../tool-workspace/ToolModals"

// ---------------------------------------------------------------------------
// Inner component — rendered inside AuthProvider
// ---------------------------------------------------------------------------
export function ToolWorkspaceContent() {
  const { user, userData, loading, login } = useAuth()

  // ── Pipeline hook (all state + handlers) ──────────────────────────────────
  const pipeline = useToolPipeline()

  // ── Restore complete modal state ──────────────────────────────────────────
  const [showRestoreComplete, setShowRestoreComplete] = useState(false)
  const [frozenStats, setFrozenStats] = useState({ scanned: 0, matched: 0, unmatched: 0, errors: 0 })
  // Track previous isProcessing to detect the exact true→false transition
  const wasProcessingRef = React.useRef(false)

  useEffect(() => {
    const wasProcessing = wasProcessingRef.current
    wasProcessingRef.current = pipeline.isProcessing

    // Trigger ONLY when we transition from processing → done, with actual results
    // and not when the user cancels (stats.scanned > 0 but matched === 0 means cancelled early)
    if (wasProcessing && !pipeline.isProcessing && pipeline.stats.scanned > 0 && !showRestoreComplete) {
      const timer = setTimeout(() => {
        setFrozenStats({
          scanned: pipeline.stats.scanned,
          matched: pipeline.stats.matched,
          unmatched: pipeline.stats.unmatched,
          errors: pipeline.stats.errors,
        })
        setShowRestoreComplete(true)
      }, 600)
      return () => clearTimeout(timer)
    }
  }, [pipeline.isProcessing])

  // ── Auth / system guards (all hooks are above — React rules of hooks) ──────
  if (loading) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#F6F6F8] dark:bg-[#101114] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-t-indigo-600 dark:border-t-indigo-400 border-zinc-300 dark:border-zinc-800 rounded-full animate-spin"></div>
      </div>
    )
  }

  if (pipeline.maintenance) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#F6F6F8] dark:bg-[#101114] flex flex-col items-center justify-center p-6 text-center text-zinc-900 dark:text-white">
        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8 animate-pulse" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-2">Workspace Under Maintenance</h1>
        <p className="text-zinc-600 dark:text-zinc-400 max-w-md mb-8">
          The TakeoutFix restoration engine is currently undergoing system updates. Normal operations will resume shortly. Thank you for your patience!
        </p>
        <a href="/dashboard" className="px-6 py-2.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-800 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-white transition-all font-semibold shadow-xs">
          Return to Dashboard
        </a>
      </div>
    )
  }

  if (user && userData?.suspended) {
    return (
      <div className="min-h-screen bg-[#F6F6F8] dark:bg-[#101114] flex flex-col items-center justify-center p-6 text-center text-zinc-900 dark:text-white">
        <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-2">Account Suspended</h1>
        <p className="text-zinc-600 dark:text-zinc-400 max-w-md mb-8">
          Your account has been suspended for violating our terms of service or due to an administrative hold. If you believe this is a mistake, please contact our support team.
        </p>
        <div className="flex gap-4">
          <a href="/support" className="px-5 py-2 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-800 dark:text-zinc-300 hover:text-indigo-600 dark:hover:text-white transition-all shadow-xs">
            Contact Support
          </a>
        </div>
      </div>
    )
  }


  // ── Main workspace layout ──────────────────────────────────────────────────
  return (
    <AdBlockGate>
      <div className="tool-workspace-root w-full min-h-[calc(100vh-64px)] h-auto flex flex-col bg-[#F6F6F8] dark:bg-[#101114] text-zinc-900 dark:text-zinc-100 transition-colors duration-150">

        {/* Main content: 4 tool tabs */}
        <RestorePanel
          activeToolTab={pipeline.activeToolTab}
          setActiveToolTab={pipeline.setActiveToolTab}
          plan={pipeline.plan}
          unlockFreeFeatures={pipeline.unlockFreeFeatures}
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
          resetForNewRestore={pipeline.resetForNewRestore}
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
          elapsedSeconds={pipeline.elapsedSeconds}
          speedMBs={pipeline.speedMBs}
          downloadAuditLog={pipeline.downloadAuditLog}
          downloadIssuesLog={pipeline.downloadIssuesLog}
          sessionFiles={pipeline.sessionFiles}
          sessionBytes={pipeline.sessionBytes}
          currentUsedBytes={pipeline.currentUsedBytes}
          formatByteSize={pipeline.formatByteSize}
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
        showRestoreComplete={showRestoreComplete}
        restoreCompleteStats={frozenStats}
        onRestoreAnother={() => {
          setShowRestoreComplete(false)
          pipeline.resetForNewRestore()
        }}
        onRestoreCompleteDismiss={() => setShowRestoreComplete(false)}
        isGuest={!user}
        onSignIn={login}
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
