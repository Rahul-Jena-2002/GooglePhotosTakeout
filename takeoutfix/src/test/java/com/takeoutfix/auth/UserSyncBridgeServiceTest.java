package com.takeoutfix.auth;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import java.nio.file.Path;

import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.*;

class UserSyncBridgeServiceTest {

    @TempDir
    Path tempDir;
    private UserSyncBridgeService bridgeService;

    @BeforeEach
    void setUp() {
        UserController.getCurrentUserProfile().clear();
        UserController.setUserService(null);
        CredentialStore store = new CredentialStore(tempDir.toFile());
        FirebaseTokenService tokens = new FirebaseTokenService();
        SessionManager sessions = new SessionManager(store, tokens);
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, sessions);
        bridgeService = new UserSyncBridgeService(auth, store, new FirebaseSyncService(tempDir.toFile(), false));
    }

    @org.junit.jupiter.api.AfterEach
    void tearDown() {
        bridgeService.shutdown();
        UserController.getCurrentUserProfile().clear();
        UserController.setProfileUpdateListener(null);
    }

    @Test
    void usageDuringSlowStartupVerificationIsCheckpointedForSavedAccount() throws Exception {
        var started = new java.util.concurrent.CountDownLatch(1);
        var resume = new java.util.concurrent.CountDownLatch(1);
        var completed = new java.util.concurrent.CountDownLatch(1);
        var saved = new AuthSession("saved-user", "saved@example.test", "Saved", "", "", "refresh", "free", 0);
        CredentialStore store = new CredentialStore(tempDir.toFile()) {
            @Override public synchronized AuthSession loadSession() { return saved; }
        };
        FirebaseTokenService tokens = new FirebaseTokenService();
        SessionManager sessions = new SessionManager(store, tokens) {
            @Override public SessionRestoreResult restore() {
                started.countDown();
                try { if (!resume.await(5, java.util.concurrent.TimeUnit.SECONDS)) throw new AssertionError("Verification did not resume"); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new AssertionError(e); }
                return new SessionRestoreResult.AuthUnavailable("Offline", null);
            }
        };
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, sessions);
        UserSyncBridgeService bridge = new UserSyncBridgeService(auth, store, new FirebaseSyncService(tempDir.toFile(), false));
        try {
            bridge.verifyStartupSession(result -> completed.countDown());
            assertTrue(started.await(5, java.util.concurrent.TimeUnit.SECONDS));
            assertFalse(bridge.isSignedIn());
            bridge.recordCommittedOutput(1, 42);
            bridge.checkpointCommittedUsage();
            assertEquals(42, new UsageJournal(tempDir.resolve("pending-usage-v2")).pendingFor("saved-user").get(0).bytes());
            resume.countDown();
            assertTrue(completed.await(5, java.util.concurrent.TimeUnit.SECONDS));
        } finally {
            resume.countDown();
            bridge.shutdown();
        }
    }

    @Test
    void offlineCheckpointIsDeliveredAfterSessionReconnects() throws Exception {
        var saved = new AuthSession("saved-user", "saved@example.test", "Saved", "", "token", "refresh", "free", Long.MAX_VALUE);
        var attempts = new java.util.concurrent.atomic.AtomicInteger();
        var initial = new java.util.concurrent.CountDownLatch(1);
        var delivered = new java.util.concurrent.CountDownLatch(1);
        var requestBody = new java.util.concurrent.atomic.AtomicReference<String>();
        var server = com.sun.net.httpserver.HttpServer.create(new java.net.InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/documents:commit", exchange -> {
            requestBody.set(new String(exchange.getRequestBody().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8));
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        server.start();
        CredentialStore store = new CredentialStore(tempDir.toFile()) {
            @Override public synchronized AuthSession loadSession() { return saved; }
        };
        FirebaseTokenService tokens = new FirebaseTokenService();
        SessionManager sessions = new SessionManager(store, tokens) {
            @Override public SessionRestoreResult restore() {
                return attempts.incrementAndGet() == 1 ? new SessionRestoreResult.AuthUnavailable("Offline", null)
                        : new SessionRestoreResult.Authenticated(saved);
            }
            @Override public AuthSession getCurrentSession() { return saved; }
        };
        var client = new UsageBatchClient(java.net.http.HttpClient.newHttpClient(),
                "http://127.0.0.1:" + server.getAddress().getPort() + "/documents", "projects/test/databases/(default)/documents");
        FirebaseSyncService sync = new FirebaseSyncService(tempDir.toFile(), false, store, client) {
            @Override public synchronized boolean pushCurrentTotalsToCloud() {
                boolean result = super.pushCurrentTotalsToCloud();
                delivered.countDown();
                return result;
            }
            @Override public synchronized void syncWithFirebase() { }
        };
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, sessions);
        UserSyncBridgeService bridge = new UserSyncBridgeService(auth, store, sync) {
            @Override public void triggerCloudSync(java.util.function.Consumer<Boolean> callback) { }
        };
        UserController.setProfileUpdateListener(null);
        try {
            bridge.verifyStartupSession(result -> initial.countDown());
            assertTrue(initial.await(5, java.util.concurrent.TimeUnit.SECONDS));
            bridge.recordCommittedOutput(2, 100);
            bridge.checkpointCommittedUsage();
            var journal = new UsageJournal(tempDir.resolve("pending-usage-v2"));
            assertEquals(1, journal.pendingFor("saved-user").size());
            bridge.syncIfOnline();
            assertTrue(delivered.await(5, java.util.concurrent.TimeUnit.SECONDS));
            assertTrue(journal.pendingFor("saved-user").isEmpty());
            assertTrue(requestBody.get().contains("/users/saved-user/usageBatches/"));
        } finally {
            bridge.shutdown();
            server.stop(0);
        }
    }

    @Test
    void offlineStartupAttributesUsageToSavedAccountWithoutGrantingSignIn() throws Exception {
        var initial = new java.util.concurrent.CountDownLatch(1);
        var saved = new AuthSession("saved-user", "saved@example.test", "Saved", "", "", "refresh", "free", 0);
        CredentialStore store = new CredentialStore(tempDir.toFile()) {
            @Override public synchronized AuthSession loadSession() { return saved; }
            @Override public synchronized boolean clear() { return true; }
        };
        FirebaseTokenService tokens = new FirebaseTokenService();
        SessionManager sessions = new SessionManager(store, tokens) {
            @Override public SessionRestoreResult restore() { return new SessionRestoreResult.AuthUnavailable("Offline", null); }
            @Override public synchronized boolean logout() { return true; }
        };
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, sessions);
        UserSyncBridgeService bridge = new UserSyncBridgeService(auth, store, new FirebaseSyncService(tempDir.toFile(), false));
        try {
            bridge.verifyStartupSession(result -> initial.countDown());
            assertTrue(initial.await(5, java.util.concurrent.TimeUnit.SECONDS));
            assertFalse(bridge.isSignedIn());
            bridge.recordCommittedOutput(2, 100);
            bridge.checkpointCommittedUsage();
            var journal = new UsageJournal(tempDir.resolve("pending-usage-v2"));
            assertEquals(2, journal.pendingFor("saved-user").get(0).files());
            bridge.signOut();
            bridge.recordCommittedOutput(1, 50);
            bridge.checkpointCommittedUsage();
            assertEquals(1, journal.pendingFor("saved-user").size());
        } finally {
            bridge.shutdown();
        }
    }

    @Test
    void retriesUnavailableStartupSessionAndSyncsPendingUsage() throws Exception {
        var attempts = new java.util.concurrent.atomic.AtomicInteger();
        var initial = new java.util.concurrent.CountDownLatch(1);
        var synced = new java.util.concurrent.CountDownLatch(1);
        var restored = new AuthSession("restored-user", "restored@example.test", "Restored", "", "token", "refresh", "free", Long.MAX_VALUE);
        CredentialStore store = new CredentialStore(tempDir.toFile());
        FirebaseTokenService tokens = new FirebaseTokenService();
        SessionManager sessions = new SessionManager(store, tokens) {
            @Override public SessionRestoreResult restore() {
                return attempts.incrementAndGet() == 1
                        ? new SessionRestoreResult.AuthUnavailable("Offline", null)
                        : new SessionRestoreResult.Authenticated(restored);
            }
            @Override public AuthSession getCurrentSession() { return restored; }
        };
        FirebaseSyncService sync = new FirebaseSyncService(tempDir.toFile(), false) {
            @Override boolean hasPendingUsageForCurrentAccount() { synced.countDown(); return false; }
        };
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, sessions);
        UserSyncBridgeService bridge = new UserSyncBridgeService(auth, store, sync) {
            @Override public void triggerCloudSync(java.util.function.Consumer<Boolean> callback) { }
        };
        UserController.setProfileUpdateListener(null);
        try {
            bridge.verifyStartupSession(result -> { assertFalse(result); initial.countDown(); });
            assertTrue(initial.await(5, java.util.concurrent.TimeUnit.SECONDS));
            bridge.syncIfOnline();
            assertTrue(synced.await(5, java.util.concurrent.TimeUnit.SECONDS));
            assertEquals(2, attempts.get());
            assertEquals("restored-user", UserController.getCurrentUserProfile().get("uid"));
        } finally {
            bridge.shutdown();
        }
    }

    @Test
    void signOutWhileStartupRetryRunsDoesNotRestoreAccount() throws Exception {
        var attempts = new java.util.concurrent.atomic.AtomicInteger();
        var initial = new java.util.concurrent.CountDownLatch(1);
        var retryStarted = new java.util.concurrent.CountDownLatch(1);
        var resume = new java.util.concurrent.CountDownLatch(1);
        var retryFinished = new java.util.concurrent.CountDownLatch(1);
        var restored = new AuthSession("old-user", "old@example.test", "Old", "", "token", "refresh", "free", Long.MAX_VALUE);
        CredentialStore store = new CredentialStore(tempDir.toFile());
        FirebaseTokenService tokens = new FirebaseTokenService();
        SessionManager sessions = new SessionManager(store, tokens) {
            @Override public SessionRestoreResult restore() {
                if (attempts.incrementAndGet() == 1) return new SessionRestoreResult.AuthUnavailable("Offline", null);
                retryStarted.countDown();
                try { if (!resume.await(5, java.util.concurrent.TimeUnit.SECONDS)) throw new AssertionError("Retry did not resume"); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new AssertionError(e); }
                return new SessionRestoreResult.Authenticated(restored);
            }
            @Override public AuthSession getCurrentSession() { return restored; }
        };
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, sessions);
        UserSyncBridgeService bridge = new UserSyncBridgeService(auth, store, new FirebaseSyncService(tempDir.toFile(), false)) {
            @Override public void verifyStartupSession(java.util.function.Consumer<Boolean> callback) {
                super.verifyStartupSession(result -> {
                    if (callback != null) callback.accept(result);
                    if (attempts.get() >= 2) retryFinished.countDown();
                });
            }
        };
        try {
            bridge.verifyStartupSession(result -> initial.countDown());
            assertTrue(initial.await(5, java.util.concurrent.TimeUnit.SECONDS));
            bridge.syncIfOnline();
            assertTrue(retryStarted.await(5, java.util.concurrent.TimeUnit.SECONDS));
            bridge.signOut();
            resume.countDown();
            assertTrue(retryFinished.await(5, java.util.concurrent.TimeUnit.SECONDS));
            assertTrue(UserController.getCurrentUserProfile().isEmpty());
        } finally {
            resume.countDown();
            bridge.shutdown();
        }
    }

    @Test
    void signOutPreventsRetryOfUnavailableStartupSession() throws Exception {
        var attempts = new java.util.concurrent.atomic.AtomicInteger();
        var initial = new java.util.concurrent.CountDownLatch(1);
        CredentialStore store = new CredentialStore(tempDir.toFile());
        FirebaseTokenService tokens = new FirebaseTokenService();
        SessionManager sessions = new SessionManager(store, tokens) {
            @Override public SessionRestoreResult restore() {
                attempts.incrementAndGet();
                return new SessionRestoreResult.AuthUnavailable("Offline", null);
            }
        };
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, sessions);
        UserSyncBridgeService bridge = new UserSyncBridgeService(auth, store, new FirebaseSyncService(tempDir.toFile(), false));
        try {
            bridge.verifyStartupSession(result -> initial.countDown());
            assertTrue(initial.await(5, java.util.concurrent.TimeUnit.SECONDS));
            bridge.signOut();
            bridge.syncIfOnline();
            assertEquals(1, attempts.get());
            assertTrue(UserController.getCurrentUserProfile().isEmpty());
        } finally {
            bridge.shutdown();
        }
    }

    @Test
    void committedOutputIsCheckpointedForItsSignedInOwner() throws Exception {
        var profile = UserController.getCurrentUserProfile();
        bridgeService.recordCommittedOutput(1, 10); // Guests are not assigned to an account.
        profile.putAll(Map.of("uid", "a", "email", "a@example.invalid", "idToken", "token-a"));
        bridgeService.recordCommittedOutput(2, 200);
        profile.clear();
        profile.putAll(Map.of("uid", "b", "email", "b@example.invalid", "idToken", "token-b"));
        bridgeService.recordCommittedOutput(1, 50);
        bridgeService.checkpointCommittedUsage();
        var journal = new UsageJournal(tempDir.resolve("pending-usage-v2"));
        assertEquals(2, journal.pendingFor("a").get(0).files());
        assertEquals(200, journal.pendingFor("a").get(0).bytes());
        assertEquals(1, journal.pendingFor("b").get(0).files());
        assertEquals(50, journal.pendingFor("b").get(0).bytes());
    }

    @Test
    void repeatedSyncRequestsDoNotQueueOverlappingWork() throws Exception {
        var started = new java.util.concurrent.CountDownLatch(1);
        var release = new java.util.concurrent.CountDownLatch(1);
        var calls = new java.util.concurrent.atomic.AtomicInteger();
        var fakeSync = new FirebaseSyncService(tempDir.toFile(), false) {
            @Override boolean hasPendingUsageForCurrentAccount() {
                calls.incrementAndGet();
                started.countDown();
                try { release.await(5, java.util.concurrent.TimeUnit.SECONDS); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); }
                return false;
            }
        };
        CredentialStore store = new CredentialStore(tempDir.toFile());
        FirebaseTokenService tokens = new FirebaseTokenService();
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, new SessionManager(store, tokens));
        var bridge = new UserSyncBridgeService(auth, store, fakeSync);
        try {
            UserController.getCurrentUserProfile().putAll(Map.of("uid", "a", "email", "a@example.invalid", "idToken", "token"));
            bridge.syncIfOnline();
            assertTrue(started.await(2, java.util.concurrent.TimeUnit.SECONDS));
            for (int i = 0; i < 20; i++) bridge.syncIfOnline();
            assertEquals(1, calls.get());
        } finally {
            release.countDown();
            bridge.shutdown();
        }
    }

    @Test
    @DisplayName("All users should have unlimited file processing permission")
    void testFreeTierQuotaLimit() {
        UserController.getCurrentUserProfile().put("plan", "free");
        UserController.getCurrentUserProfile().put("usedFiles", 200L);

        assertTrue(bridgeService.canProcessMoreFiles(50), "200 + 50 should be allowed");
        assertTrue(bridgeService.canProcessMoreFiles(51), "Unlimited mode allows 51 additional files");
        assertFalse(bridgeService.isQuotaExceeded(), "Quota is never exceeded in unlimited mode");
    }

    @Test
    @DisplayName("Pro and Super tiers should have unlimited file processing permission")
    void testProAndSuperUnlimited() {
        UserController.getCurrentUserProfile().put("plan", "pro");
        UserController.getCurrentUserProfile().put("usedFiles", 5000L);
        assertTrue(bridgeService.canProcessMoreFiles(10000), "Pro tier must be unlimited");

        UserController.getCurrentUserProfile().put("plan", "super");
        UserController.getCurrentUserProfile().put("usedFiles", 50000L);
        assertTrue(bridgeService.canProcessMoreFiles(100000), "Super tier must be unlimited");
    }

    @Test
    @DisplayName("Listener receives real-time profile updates when user data changes")
    void testListenerNotification() {
        AtomicBoolean updated = new AtomicBoolean(false);
        bridgeService.addListener(profile -> {
            if ("test@example.com".equals(profile.get("email"))) {
                updated.set(true);
            }
        });

        UserController.syncUser(Map.of("email", "test@example.com", "plan", "pro"));

        assertTrue(updated.get(), "Listener should have been triggered with new email");
    }

    @Test
    void signOutClearsTokenAfterConcurrentRefreshSave() throws Exception {
        var saveStarted = new java.util.concurrent.CountDownLatch(1);
        var finishSave = new java.util.concurrent.CountDownLatch(1);
        var stored = new java.util.concurrent.atomic.AtomicReference<AuthSession>();
        AuthSession session = new AuthSession("old-user", "old@example.test", "Old", "", "old-token", "refresh", "free", Long.MAX_VALUE);
        stored.set(session);
        CredentialStore store = new CredentialStore(tempDir.toFile()) {
            @Override public synchronized AuthSession loadSession() { return stored.get(); }
            @Override public synchronized void saveSession(AuthSession updated) {
                saveStarted.countDown();
                try {
                    if (!finishSave.await(5, java.util.concurrent.TimeUnit.SECONDS)) throw new AssertionError("Save did not resume");
                } catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new AssertionError(error); }
                stored.set(updated);
            }
            @Override public synchronized boolean clear() { stored.set(null); return true; }
        };
        FirebaseTokenService tokens = new FirebaseTokenService();
        SessionManager sessions = new SessionManager(store, tokens) {
            @Override public synchronized boolean logout() { return true; }
        };
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, sessions);
        FirebaseSyncService sync = new FirebaseSyncService(tempDir.toFile(), false, store);
        UserSyncBridgeService bridge = new UserSyncBridgeService(auth, store, sync);
        UserController.setProfileUpdateListener(null);
        UserController.syncUser(session.toMap());
        long version = UserController.sessionVersion();
        var response = new org.json.JSONObject().put("user_id", "old-user").put("id_token", "new-token").put("refresh_token", "refresh");
        var refresh = java.util.concurrent.CompletableFuture.supplyAsync(() -> sync.applyRefreshedTokens("old-user", version, "refresh", response));
        try {
            assertTrue(saveStarted.await(5, java.util.concurrent.TimeUnit.SECONDS));
            var logoutStarted = new java.util.concurrent.CountDownLatch(1);
            var logout = java.util.concurrent.CompletableFuture.supplyAsync(() -> { logoutStarted.countDown(); return bridge.signOut(); });
            assertTrue(logoutStarted.await(5, java.util.concurrent.TimeUnit.SECONDS));
            finishSave.countDown();
            assertEquals("new-token", refresh.get(5, java.util.concurrent.TimeUnit.SECONDS));
            assertTrue(logout.get(5, java.util.concurrent.TimeUnit.SECONDS));
            assertNull(stored.get());
            assertTrue(UserController.getCurrentUserProfile().isEmpty());
            assertFalse(sync.hasActiveUserSession());
        } finally {
            finishSave.countDown();
        }
    }

    @Test
    void newSignInWaitsUntilSignOutFinishesClearingOldSession() throws Exception {
        var clearStarted = new java.util.concurrent.CountDownLatch(1);
        var finishClear = new java.util.concurrent.CountDownLatch(1);
        var savedUid = new java.util.concurrent.atomic.AtomicReference<String>();
        CredentialStore store = new CredentialStore(tempDir.toFile()) {
            @Override public synchronized boolean clear() {
                clearStarted.countDown();
                try { return finishClear.await(5, java.util.concurrent.TimeUnit.SECONDS); }
                catch (InterruptedException error) { Thread.currentThread().interrupt(); return false; }
            }
            @Override public synchronized void saveSession(AuthSession session) { savedUid.set(session.getUid()); }
        };
        FirebaseTokenService tokens = new FirebaseTokenService();
        SessionManager sessions = new SessionManager(store, tokens) {
            @Override public synchronized boolean logout() { return true; }
        };
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, sessions);
        UserSyncBridgeService bridge = new UserSyncBridgeService(auth, store, new FirebaseSyncService(tempDir.toFile(), false, store));
        var newSession = new AuthSession("new-user", "new@example.test", "New", "", "token", "refresh", "free", Long.MAX_VALUE);
        var signOut = java.util.concurrent.CompletableFuture.supplyAsync(bridge::signOut);
        try {
            assertTrue(clearStarted.await(5, java.util.concurrent.TimeUnit.SECONDS));
            var signInStarted = new java.util.concurrent.CountDownLatch(1);
            var signIn = java.util.concurrent.CompletableFuture.runAsync(() -> {
                signInStarted.countDown();
                bridge.commitAuthenticatedSession(newSession);
            });
            assertTrue(signInStarted.await(5, java.util.concurrent.TimeUnit.SECONDS));
            assertFalse(signIn.isDone());
            finishClear.countDown();
            assertTrue(signOut.get(5, java.util.concurrent.TimeUnit.SECONDS));
            signIn.get(5, java.util.concurrent.TimeUnit.SECONDS);
            assertEquals("new-user", savedUid.get());
            assertEquals("new-user", UserController.getCurrentUserProfile().get("uid"));
        } finally {
            finishClear.countDown();
        }
    }

    @Test
    void signOutCleansOnlyConfiguredAccountDirectory() throws Exception {
        var accountDir = java.nio.file.Files.createDirectory(tempDir.resolve("account"));
        var otherDir = java.nio.file.Files.createDirectory(tempDir.resolve("other"));
        java.nio.file.Files.writeString(accountDir.resolve("session.json"), "test session");
        java.nio.file.Files.writeString(accountDir.resolve("users.json"), "test users");
        var unrelated = otherDir.resolve("session.json");
        java.nio.file.Files.writeString(unrelated, "keep");
        CredentialStore store = new CredentialStore(accountDir.toFile()) {
            @Override public synchronized boolean clear() { return true; }
        };
        FirebaseTokenService tokens = new FirebaseTokenService();
        SessionManager sessions = new SessionManager(store, tokens) {
            @Override public synchronized boolean logout() { return true; }
        };
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, sessions);
        UserSyncBridgeService bridge = new UserSyncBridgeService(auth, store, new FirebaseSyncService(accountDir.toFile(), false, store));
        UserController.getCurrentUserProfile().put("uid", "test-user");
        assertTrue(bridge.signOut());
        assertFalse(java.nio.file.Files.exists(accountDir.resolve("session.json")));
        assertFalse(java.nio.file.Files.exists(accountDir.resolve("users.json")));
        assertEquals("keep", java.nio.file.Files.readString(unrelated));
        assertTrue(UserController.getCurrentUserProfile().isEmpty());
    }

    @Test
    void sessionCommitWaitsForSessionManagerAndUsesInjectedStore() throws Exception {
        var saves = new java.util.concurrent.atomic.AtomicInteger();
        CredentialStore store = new CredentialStore(tempDir.toFile()) {
            @Override public synchronized void saveSession(AuthSession session) { saves.incrementAndGet(); }
        };
        FirebaseTokenService tokens = new FirebaseTokenService();
        SessionManager sessions = new SessionManager(store, tokens);
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, sessions);
        UserSyncBridgeService bridge = new UserSyncBridgeService(auth, store, new FirebaseSyncService(tempDir.toFile(), false));
        AuthSession session = new AuthSession("new-user", "new@example.test", "New", "", "token", "refresh", "free", Long.MAX_VALUE);
        var started = new java.util.concurrent.CountDownLatch(1);
        java.util.concurrent.CompletableFuture<Void> commit;
        synchronized (sessions) {
            commit = java.util.concurrent.CompletableFuture.runAsync(() -> {
                started.countDown();
                bridge.commitAuthenticatedSession(session);
            });
            assertTrue(started.await(5, java.util.concurrent.TimeUnit.SECONDS));
            assertFalse(commit.isDone());
            assertNull(UserController.getCurrentUserProfile().get("uid"));
        }
        commit.get(5, java.util.concurrent.TimeUnit.SECONDS);
        assertSame(session, sessions.getCurrentSession());
        assertEquals("new-user", UserController.getCurrentUserProfile().get("uid"));
        assertTrue(saves.get() >= 1);
        assertThrows(IllegalArgumentException.class, () -> bridge.commitAuthenticatedSession(AuthSession.unauthenticated()));
    }

    @Test
    void profileUpdateUsesBridgeCredentialStore() {
        var savedUid = new java.util.concurrent.atomic.AtomicReference<String>();
        CredentialStore store = new CredentialStore(tempDir.toFile()) {
            @Override public synchronized void saveSession(AuthSession session) { savedUid.set(session.getUid()); }
        };
        FirebaseTokenService tokens = new FirebaseTokenService();
        SessionManager sessions = new SessionManager(store, tokens);
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, sessions);
        new UserSyncBridgeService(auth, store, new FirebaseSyncService(tempDir.toFile(), false));
        UserController.syncUser(Map.of("uid", "test-user", "email", "test@example.test", "idToken", "test-token"));
        assertEquals("test-user", savedUid.get());
    }

    @Test
    void successfulStartupRestoreDoesNotUndoSignOut() throws Exception {
        var started = new java.util.concurrent.CountDownLatch(1);
        var resume = new java.util.concurrent.CountDownLatch(1);
        var completed = new java.util.concurrent.CountDownLatch(1);
        var restored = new AuthSession("old-user", "old@example.test", "Old", "", "token", "refresh", "free", Long.MAX_VALUE);
        CredentialStore store = new CredentialStore(tempDir.toFile());
        FirebaseTokenService tokens = new FirebaseTokenService();
        SessionManager sessions = new SessionManager(store, tokens) {
            @Override public SessionRestoreResult restore() {
                started.countDown();
                try { if (!resume.await(5, java.util.concurrent.TimeUnit.SECONDS)) throw new AssertionError("Restore did not resume"); }
                catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new AssertionError(error); }
                return new SessionRestoreResult.Authenticated(restored);
            }
            @Override public AuthSession getCurrentSession() { return AuthSession.unauthenticated(); }
        };
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, sessions);
        UserSyncBridgeService bridge = new UserSyncBridgeService(auth, store, new FirebaseSyncService(tempDir.toFile(), false));
        UserController.setProfileUpdateListener(null);
        try {
            bridge.verifyStartupSession(ignored -> completed.countDown());
            assertTrue(started.await(5, java.util.concurrent.TimeUnit.SECONDS));
            UserController.logout();
            resume.countDown();
            assertTrue(completed.await(5, java.util.concurrent.TimeUnit.SECONDS));
            assertTrue(UserController.getCurrentUserProfile().isEmpty());
        } finally {
            resume.countDown();
            var field = UserSyncBridgeService.class.getDeclaredField("executorService");
            field.setAccessible(true);
            ((java.util.concurrent.ExecutorService) field.get(bridge)).shutdownNow();
        }
    }

    @Test
    void currentStartupSessionIsApplied() throws Exception {
        var completed = new java.util.concurrent.CountDownLatch(1);
        var restored = new AuthSession("restored-user", "restored@example.test", "Restored", "", "token", "refresh", "free", Long.MAX_VALUE);
        CredentialStore store = new CredentialStore(tempDir.toFile());
        FirebaseTokenService tokens = new FirebaseTokenService();
        SessionManager sessions = new SessionManager(store, tokens) {
            @Override public SessionRestoreResult restore() { return new SessionRestoreResult.Authenticated(restored); }
            @Override public AuthSession getCurrentSession() { return restored; }
        };
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, sessions);
        UserSyncBridgeService bridge = new UserSyncBridgeService(auth, store, new FirebaseSyncService(tempDir.toFile(), false)) {
            @Override public void triggerCloudSync(java.util.function.Consumer<Boolean> callback) { }
        };
        UserController.setProfileUpdateListener(null);
        var authenticated = new AtomicBoolean();
        try {
            bridge.verifyStartupSession(result -> { authenticated.set(result); completed.countDown(); });
            assertTrue(completed.await(5, java.util.concurrent.TimeUnit.SECONDS));
            assertTrue(authenticated.get());
            assertEquals("restored-user", UserController.getCurrentUserProfile().get("uid"));
        } finally {
            var field = UserSyncBridgeService.class.getDeclaredField("executorService");
            field.setAccessible(true);
            ((java.util.concurrent.ExecutorService) field.get(bridge)).shutdownNow();
        }
    }

    @Test
    void successfulStartupRestoreDoesNotReplaceNewerSession() throws Exception {
        var started = new java.util.concurrent.CountDownLatch(1);
        var resume = new java.util.concurrent.CountDownLatch(1);
        var completed = new java.util.concurrent.CountDownLatch(1);
        var oldSession = new AuthSession("old-user", "old@example.test", "Old", "", "old-token", "old-refresh", "free", Long.MAX_VALUE);
        var newSession = new AuthSession("new-user", "new@example.test", "New", "", "new-token", "new-refresh", "free", Long.MAX_VALUE);
        CredentialStore store = new CredentialStore(tempDir.toFile());
        FirebaseTokenService tokens = new FirebaseTokenService();
        SessionManager sessions = new SessionManager(store, tokens) {
            @Override public SessionRestoreResult restore() {
                started.countDown();
                try { if (!resume.await(5, java.util.concurrent.TimeUnit.SECONDS)) throw new AssertionError("Restore did not resume"); }
                catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new AssertionError(error); }
                return new SessionRestoreResult.Authenticated(oldSession);
            }
            @Override public AuthSession getCurrentSession() { return newSession; }
        };
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, sessions);
        UserSyncBridgeService bridge = new UserSyncBridgeService(auth, store, new FirebaseSyncService(tempDir.toFile(), false));
        try {
            bridge.verifyStartupSession(ignored -> completed.countDown());
            assertTrue(started.await(5, java.util.concurrent.TimeUnit.SECONDS));
            UserController.getCurrentUserProfile().putAll(newSession.toMap());
            resume.countDown();
            assertTrue(completed.await(5, java.util.concurrent.TimeUnit.SECONDS));
            assertEquals("new-user", UserController.getCurrentUserProfile().get("uid"));
        } finally {
            resume.countDown();
            var field = UserSyncBridgeService.class.getDeclaredField("executorService");
            field.setAccessible(true);
            ((java.util.concurrent.ExecutorService) field.get(bridge)).shutdownNow();
        }
    }

    @Test
    void failedStartupRestoreDoesNotClearNewSignIn() throws Exception {
        var started = new java.util.concurrent.CountDownLatch(1);
        var resume = new java.util.concurrent.CountDownLatch(1);
        var completed = new java.util.concurrent.CountDownLatch(1);
        CredentialStore store = new CredentialStore(tempDir.toFile());
        FirebaseTokenService tokens = new FirebaseTokenService();
        SessionManager sessions = new SessionManager(store, tokens) {
            @Override public SessionRestoreResult restore() {
                started.countDown();
                try { if (!resume.await(5, java.util.concurrent.TimeUnit.SECONDS)) throw new AssertionError("Restore did not resume"); }
                catch (InterruptedException error) { Thread.currentThread().interrupt(); throw new AssertionError(error); }
                return new SessionRestoreResult.RequiresLogin("No stored session");
            }
        };
        GoogleAuthService auth = new GoogleAuthService(AuthCallbackServer::new, tokens, sessions);
        UserSyncBridgeService bridge = new UserSyncBridgeService(auth, store, new FirebaseSyncService(tempDir.toFile(), false));
        try {
            bridge.verifyStartupSession(ignored -> completed.countDown());
            assertTrue(started.await(5, java.util.concurrent.TimeUnit.SECONDS));
            UserController.getCurrentUserProfile().putAll(Map.of("uid", "new-user", "email", "new@example.test", "idToken", "new-token"));
            resume.countDown();
            assertTrue(completed.await(5, java.util.concurrent.TimeUnit.SECONDS));
            assertEquals("new-user", UserController.getCurrentUserProfile().get("uid"));
        } finally {
            resume.countDown();
            var field = UserSyncBridgeService.class.getDeclaredField("executorService");
            field.setAccessible(true);
            ((java.util.concurrent.ExecutorService) field.get(bridge)).shutdownNow();
        }
    }

    @Test
    void rejectsEnrichmentAfterSignOutOrAccountChange() {
        Map<String, Object> oldProfile = Map.of("uid", "first", "email", "first@example.com",
                "idToken", "old-token", "displayName", "Old response");
        UserController.getCurrentUserProfile().putAll(oldProfile);
        bridgeService.invalidateCloudEnrichment();
        assertFalse(bridgeService.applyCloudEnrichment(oldProfile, Map.of("displayName", "Old response"), 0));

        UserController.getCurrentUserProfile().clear();
        UserController.getCurrentUserProfile().putAll(Map.of("uid", "second", "email", "second@example.com",
                "idToken", "new-token"));
        assertFalse(bridgeService.applyCloudEnrichment(oldProfile, Map.of("displayName", "Old response"), 1));
        assertEquals("second", UserController.getCurrentUserProfile().get("uid"));
        assertFalse(UserController.getCurrentUserProfile().containsKey("displayName"));
    }

    @Test
    void enrichmentOnlyAppliesFieldsChangedByTheResponse() {
        Map<String, Object> original = Map.of("uid", "first", "idToken", "old-token", "plan", "free");
        Map<String, Object> enriched = Map.of("uid", "first", "idToken", "old-token", "plan", "pro");
        assertEquals(Map.of("plan", "pro"), UserSyncBridgeService.enrichmentChanges(original, enriched, original));
        Map<String, Object> active = Map.of("uid", "first", "idToken", "new-token", "plan", "unlimited");
        assertTrue(UserSyncBridgeService.enrichmentChanges(original, enriched, active).isEmpty());
    }

    @Test
    @DisplayName("Email privacy masking protects user email identity")
    void testMaskEmail() {
        assertEquals("ra***l@gmail.com", maskEmail("rahul@gmail.com"));
        assertEquals("ra***2@gmail.com", maskEmail("rahul.jena2002@gmail.com"));
        assertEquals("b***@test.com", maskEmail("bob@test.com"));
        assertEquals("invalid", maskEmail("invalid"));
        assertEquals("", maskEmail(""));
    }

    /** Inlined from deleted ProfileDashboardDialog (Swing) — pure email masking logic. */
    private static String maskEmail(String email) {
        if (email == null || email.isEmpty()) return "";
        int at = email.indexOf('@');
        if (at < 0) return email;
        String local = email.substring(0, at);
        String domain = email.substring(at);
        if (local.length() <= 3) return local.substring(0, 1) + "***" + domain;
        return local.substring(0, 2) + "***" + local.charAt(local.length() - 1) + domain;
    }
}
