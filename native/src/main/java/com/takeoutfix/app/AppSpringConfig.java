package com.takeoutfix.app;

import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;

/**
 * Spring Framework Core Configuration.
 * Provides pure dependency injection with component scanning.
 * Zero web dependencies, zero embedded servers, zero servlet overhead.
 */
@Configuration
@ComponentScan(basePackages = "com.takeoutfix")
public class AppSpringConfig {
}
