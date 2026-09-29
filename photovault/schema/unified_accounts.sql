-- ============================================================================
-- Unified Multi-Tool Account & Sync Database Schema
-- Supports: TakeoutFix (Web & CLI) + PhotoVault (JavaFX Desktop & CLI)
-- Engine: PostgreSQL 14+ / Cloudflare D1 / SQLite 3 compatible
-- ============================================================================

-- 1. Core Users Table (Single Sign-On Identity)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id VARCHAR(128) UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255),
    avatar_url TEXT,
    stripe_customer_id VARCHAR(128) UNIQUE,
    role VARCHAR(32) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'pro', 'admin')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

-- 2. OAuth & Authentication Providers
CREATE TABLE IF NOT EXISTS user_identities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(64) NOT NULL CHECK (provider IN ('google', 'github', 'email_otp')),
    provider_user_id VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_identities_user_id ON user_identities(user_id);

-- 3. Multi-Tool Entitlements & Licensing
-- Allows one user account to manage licenses and quotas across TakeoutFix, PhotoVault, etc.
CREATE TABLE IF NOT EXISTS user_tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool_id VARCHAR(64) NOT NULL CHECK (tool_id IN ('takeoutfix', 'photovault', 'cloudvault')),
    plan_tier VARCHAR(32) NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro', 'lifetime', 'enterprise')),
    status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'expired')),
    max_files_quota BIGINT DEFAULT 100,       -- Free tier cap (e.g. 100 photos, NULL for unlimited)
    max_bytes_quota BIGINT DEFAULT 1073741824, -- Free tier cap (1 GB, NULL for unlimited)
    subscription_id VARCHAR(128),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_user_tools_lookup ON user_tools(user_id, tool_id);

-- 4. Authorized User Devices (Desktop & Web Clients)
CREATE TABLE IF NOT EXISTS user_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool_id VARCHAR(64) NOT NULL,
    device_name VARCHAR(128) NOT NULL,       -- e.g. "Rahul-Workstation-Windows"
    os VARCHAR(32) NOT NULL CHECK (os IN ('windows', 'macos', 'linux', 'web', 'android', 'ios')),
    client_version VARCHAR(32) NOT NULL,    -- e.g. "1.0.0"
    last_ip VARCHAR(64),
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);

-- 5. Monitored Photo Vaults / Backup Pairs
-- Tracks original and backup locations across desktop installs
CREATE TABLE IF NOT EXISTS photo_vaults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES user_devices(id) ON DELETE SET NULL,
    vault_name VARCHAR(255) NOT NULL,
    source_folder_name VARCHAR(255) NOT NULL,
    backup_folder_name VARCHAR(255) NOT NULL,
    source_path_hash CHAR(64),               -- SHA-256 of absolute path for local privacy
    backup_path_hash CHAR(64),
    total_files BIGINT DEFAULT 0,
    total_bytes BIGINT DEFAULT 0,
    last_verified_at TIMESTAMP WITH TIME ZONE,
    last_verification_state VARCHAR(32) DEFAULT 'PENDING' CHECK (last_verification_state IN ('PENDING', 'VERIFIED', 'ISSUES_FOUND', 'INCOMPLETE')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_photo_vaults_user ON photo_vaults(user_id);

-- 6. Verification Receipts & Audit Certificates
-- Certified audit runs stored by PhotoVault
CREATE TABLE IF NOT EXISTS verification_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vault_id UUID REFERENCES photo_vaults(id) ON DELETE SET NULL,
    run_id UUID NOT NULL,
    status VARCHAR(32) NOT NULL CHECK (status IN ('VERIFIED', 'ISSUES_FOUND', 'INCOMPLETE')),
    total_files BIGINT NOT NULL,
    matched_files BIGINT NOT NULL,
    mismatch_files INT NOT NULL DEFAULT 0,
    missing_files INT NOT NULL DEFAULT 0,
    read_errors INT NOT NULL DEFAULT 0,
    total_bytes BIGINT NOT NULL,
    duration_millis BIGINT NOT NULL,
    throughput_mb_s NUMERIC(8, 2) NOT NULL,
    audit_receipt_sha256 CHAR(64) NOT NULL,  -- Cryptographic digest of the certified receipt
    receipt_json_url TEXT,                   -- Cloud storage URL if synced
    verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_verification_receipts_user ON verification_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_receipts_vault ON verification_receipts(vault_id);

-- 7. Cross-Tool Activity & Synchronization Stream
CREATE TABLE IF NOT EXISTS tool_sync_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tool_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(64) NOT NULL,         -- e.g. "TAKEOUT_RESTORE_COMPLETED", "PHOTOVAULT_VERIFIED"
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tool_sync_events_user_time ON tool_sync_events(user_id, created_at DESC);
