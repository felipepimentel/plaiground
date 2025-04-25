import EventEmitter from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Represents a permission granted to a resource
 */
export interface PermissionGrant {
    /**
     * Resource pattern (can include wildcards)
     */
    resource: string;

    /**
     * When the permission expires (null for never)
     */
    expiresAt: Date | null;

    /**
     * Whether the permission was explicitly granted by the user
     */
    explicit: boolean;
}

/**
 * User session events
 */
export interface UserSessionEvents {
    permissionGranted: [PermissionGrant];
    permissionRevoked: [string];
    metadataChanged: [string, unknown];
}

/**
 * Represents a user session
 */
export class UserSession extends EventEmitter<UserSessionEvents> {
    private readonly _id: string;
    private readonly _userId: string;
    private _permissions: Map<string, PermissionGrant> = new Map();
    private _metadata: Record<string, unknown> = {};
    private _createdAt: Date;
    private _lastActivityAt: Date;

    /**
     * Create a new session
     */
    constructor(userId: string, id?: string) {
        super();
        this._id = id || uuidv4();
        this._userId = userId;
        this._createdAt = new Date();
        this._lastActivityAt = new Date();
    }

    /**
     * Get the session ID
     */
    public get id(): string {
        return this._id;
    }

    /**
     * Get the user ID
     */
    public get userId(): string {
        return this._userId;
    }

    /**
     * Get the creation timestamp
     */
    public get createdAt(): Date {
        return this._createdAt;
    }

    /**
     * Get the last activity timestamp
     */
    public get lastActivityAt(): Date {
        return this._lastActivityAt;
    }

    /**
     * Update the last activity timestamp
     */
    public updateActivity(): void {
        this._lastActivityAt = new Date();
    }

    /**
     * Get session metadata
     */
    public get metadata(): Record<string, unknown> {
        return { ...this._metadata };
    }

    /**
     * Set session metadata
     */
    public setMetadata(key: string, value: unknown): void {
        this._metadata[key] = value;
        this.emit('metadataChanged', key, value);
    }

    /**
     * Grant permission to a resource
     */
    public grantPermission(permission: Omit<PermissionGrant, 'explicit'>): void {
        // Clean up expired permissions first
        this.cleanupExpiredPermissions();

        const grant: PermissionGrant = {
            ...permission,
            explicit: true,
        };

        this._permissions.set(permission.resource, grant);
        this.emit('permissionGranted', grant);
    }

    /**
     * Grant implicit permission to a resource (e.g., by the system)
     */
    public grantImplicitPermission(permission: Omit<PermissionGrant, 'explicit'>): void {
        // Only grant if no explicit permission exists
        if (!this._permissions.has(permission.resource)) {
            const grant: PermissionGrant = {
                ...permission,
                explicit: false,
            };

            this._permissions.set(permission.resource, grant);
            this.emit('permissionGranted', grant);
        }
    }

    /**
     * Revoke permission for a resource
     */
    public revokePermission(resource: string): void {
        if (this._permissions.delete(resource)) {
            this.emit('permissionRevoked', resource);
        }
    }

    /**
     * Check if permission is granted for a resource
     */
    public hasPermission(resource: string): boolean {
        // Clean up expired permissions first
        this.cleanupExpiredPermissions();

        // Check for direct match
        if (this._permissions.has(resource)) {
            return true;
        }

        // Check for pattern matches
        for (const [pattern, grant] of this._permissions.entries()) {
            if (this.matchesPattern(resource, pattern)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get all permissions
     */
    public getAllPermissions(): PermissionGrant[] {
        // Clean up expired permissions first
        this.cleanupExpiredPermissions();

        return Array.from(this._permissions.values());
    }

    /**
     * Clean up expired permissions
     */
    private cleanupExpiredPermissions(): void {
        const now = new Date();

        for (const [resource, grant] of this._permissions.entries()) {
            if (grant.expiresAt && grant.expiresAt < now) {
                this._permissions.delete(resource);
                this.emit('permissionRevoked', resource);
            }
        }
    }

    /**
     * Check if a resource matches a pattern
     */
    private matchesPattern(resource: string, pattern: string): boolean {
        // Convert glob pattern to regex
        const regexPattern = pattern
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.');

        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(resource);
    }
} 