package com.takeoutfix.config;

import com.takeoutfix.restore.infrastructure.NativeExifToolEngine;
import com.takeoutfix.task.FileAccessCoordinator;
import com.takeoutfix.task.ResourceManager;
import com.takeoutfix.task.TaskManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

/**
 * Enterprise Spring Boot configuration providing modular, lifecycle-managed singleton beans
 * for system hardware telemetry, task orchestration, concurrent file access coordination,
 * and high-throughput ExifTool native process pooling.
 */
@Configuration
public class TakeoutAppConfig {

    @Bean(destroyMethod = "shutdown")
    @Primary
    public ResourceManager resourceManager() {
        return new ResourceManager();
    }

    @Bean
    @Primary
    public FileAccessCoordinator fileAccessCoordinator() {
        return new FileAccessCoordinator();
    }

    @Bean(destroyMethod = "shutdown")
    @Primary
    public TaskManager taskManager(ResourceManager resourceManager, FileAccessCoordinator fileAccessCoordinator) {
        return new TaskManager(resourceManager, fileAccessCoordinator);
    }

    @Bean(destroyMethod = "cleanup")
    @Primary
    public NativeExifToolEngine nativeExifToolEngine() {
        return NativeExifToolEngine.getDefault();
    }
}
