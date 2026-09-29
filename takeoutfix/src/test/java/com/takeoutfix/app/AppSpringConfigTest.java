package com.takeoutfix.app;

import com.takeoutfix.network.NetworkMonitorService;
import com.takeoutfix.auth.UserSyncBridgeService;
import com.takeoutfix.auth.UserRepository;
import com.takeoutfix.auth.UserService;
import com.takeoutfix.restore.SessionStatsService;
import com.takeoutfix.restore.infrastructure.*;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("Spring Framework Core Container & DI Tests")
public class AppSpringConfigTest {

    @Test
    @DisplayName("Verify pure Spring ApplicationContext initializes without web servers and wires all core beans")
    void testSpringContextInitializesAndWiresBeans() {
        System.setProperty("java.awt.headless", "true");

        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext(AppSpringConfig.class)) {
            // Verify core services are wired
            assertNotNull(context.getBean(MediaScanner.class), "MediaScanner bean should be present");
            assertNotNull(context.getBean(MetadataMatcher.class), "MetadataMatcher bean should be present");
            assertNotNull(context.getBean(TimestampRestorer.class), "TimestampRestorer bean should be present");
            assertNotNull(context.getBean(MetadataInjector.class), "MetadataInjector bean should be present");
            assertNotNull(context.getBean(FileOperationService.class), "FileOperationService bean should be present");
            assertNotNull(context.getBean(SessionStatsService.class), "SessionStatsService bean should be present");
            assertNotNull(context.getBean(UserRepository.class), "UserRepository bean should be present");
            assertNotNull(context.getBean(UserService.class), "UserService bean should be present");
            assertNotNull(context.getBean(ExtractionService.class), "ExtractionService bean should be present");
            assertNotNull(context.getBean(NetworkMonitorService.class), "NetworkMonitorService bean should be present");
            assertNotNull(context.getBean(UserSyncBridgeService.class), "UserSyncBridgeService bean should be present");
            assertNotNull(context.getBean(NativeDesktopGui.class), "NativeDesktopGui bean should be present");
        }
    }
}
