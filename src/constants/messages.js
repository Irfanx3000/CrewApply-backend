'use strict';

const AUTH_MESSAGES = Object.freeze({
  // Registration
  REGISTER_SUCCESS: 'Registration successful. Please check your email to verify your account.',
  EMAIL_ALREADY_EXISTS: 'An account with this email address already exists.',

  // Email verification
  EMAIL_VERIFIED: 'Email verified successfully. You can now log in.',
  EMAIL_ALREADY_VERIFIED: 'This email address has already been verified.',
  INVALID_VERIFICATION_TOKEN: 'Email verification link is invalid or has expired.',
  VERIFICATION_EMAIL_SENT: 'A new verification email has been sent.',

  // Login
  LOGIN_SUCCESS: 'Login successful.',
  CURRENT_USER_FETCHED: 'Current user fetched successfully.',
  INVALID_CREDENTIALS: 'Invalid login credentials.',
  EMAIL_NOT_VERIFIED: 'Please verify your email address before logging in.',
  ACCOUNT_LOCKED: 'Your account has been temporarily locked due to multiple failed login attempts. Please try again later.',
  ACCOUNT_INACTIVE: 'Your account has been deactivated. Please contact support.',
  ACCOUNT_BLOCKED: 'Your account has been blocked by an administrator. Please contact support if you believe this is a mistake.',
  ACCOUNT_DELETED: 'Your account has been deleted. Please contact support if you believe this is a mistake.',

  // Tokens
  TOKEN_REFRESHED: 'Access token refreshed successfully.',
  INVALID_REFRESH_TOKEN: 'Refresh token is invalid or has expired.',
  TOKEN_REUSE_DETECTED: 'A security issue was detected with your session. Please log in again.',

  // Logout
  LOGOUT_SUCCESS: 'Logged out successfully.',
  LOGOUT_ALL_SUCCESS: 'Logged out from all devices successfully.',

  // Password
  PASSWORD_RESET_EMAIL_SENT: 'If an account with that email exists, a password reset code has been sent.',
  PASSWORD_RESET_SUCCESS: 'Password has been reset successfully. Please log in with your new password.',
  PASSWORD_CHANGED: 'Password changed successfully. All other sessions have been revoked.',
  INCORRECT_CURRENT_PASSWORD: 'Current password is incorrect.',
  PASSWORD_SAME_AS_CURRENT: 'New password must be different from your current password.',

  // OAuth
  GOOGLE_AUTH_SUCCESS: 'Google authentication successful.',
  GOOGLE_TOKEN_INVALID: 'Google authentication failed. Invalid or expired token.',
  GOOGLE_CLIENT_NOT_CONFIGURED: 'Google authentication is not available.',

  // Authorization
  UNAUTHORIZED: 'Authentication is required to access this resource.',
  FORBIDDEN: 'You do not have permission to access this resource.',

  // OTP
  OTP_SENT: 'Verification code sent to your email.',
  OTP_RESENT: 'A new verification code has been sent.',
  OTP_VERIFIED: 'Email verified successfully.',
  OTP_EXPIRED: 'Verification code has expired. Please request a new one.',
  OTP_INVALID: 'Invalid verification code.',
  OTP_NOT_FOUND: 'No verification code found. Please request a new one.',
  OTP_MAX_ATTEMPTS: 'Too many incorrect attempts. Please request a new code.',
  OTP_COOLDOWN: 'Please wait before requesting another verification code.',

  // Phone
  PHONE_ALREADY_REGISTERED: 'An account with this phone number already exists.',

  // Registration (new flow)
  REGISTER_PENDING: 'Account created. Please check your email for a verification code.',
  MOBILE_VERIFIED: 'Email verified. Your account is now active.',

  // Profile
  PROFILE_UPDATED: 'Profile updated successfully.',
  MARITIME_PROFILE_UPDATED: 'Maritime profile saved successfully.',
  PROFILE_PHOTO_UPDATED: 'Profile photo updated successfully.',

  // Users (admin)
  USERS_FETCHED: 'Users fetched successfully.',
  USER_FETCHED: 'User fetched successfully.',
  USER_NOT_FOUND: 'User not found.',
  USER_STATUS_UPDATED: 'User status updated successfully.',
  INVALID_USER_STATUS: 'Invalid user status.',
  CANNOT_MODIFY_NON_USER_ACCOUNT: 'Only seafarer/recruiter accounts can be managed from this panel.',

  // Admin accounts
  ADMINS_FETCHED: 'Admins fetched successfully.',
  ADMIN_INVITE_SENT: 'Invite sent successfully.',
  ADMIN_INVITE_ACCEPTED: 'Your admin account is now active.',
  ADMIN_ALREADY_ACTIVE: 'This email already belongs to an active admin.',
  EMAIL_BELONGS_TO_OTHER_ACCOUNT: 'This email is already registered to a different account.',
  USER_ALREADY_ADMIN: 'This user already has admin access.',
  ADMIN_INVITE_CONFIRMATION_REQUIRED: 'This email belongs to an existing account. Confirm to grant admin access.',
  ADMIN_INVITE_NOT_FOUND: 'No pending invite was found for this email.',
  ADMIN_NOT_FOUND: 'Admin account not found.',
  CANNOT_REVOKE_SELF: 'You cannot revoke your own admin access.',
  ADMIN_NOT_CURRENTLY_ACTIVE: 'This account does not currently have admin access.',
  ADMIN_ACCESS_REVOKED: 'Admin access revoked.',
  CANNOT_EDIT_OWN_PERMISSIONS: 'You cannot edit your own permissions.',
  ADMIN_PERMISSIONS_UPDATED: 'Admin permissions updated.',

  // Documents
  DOCUMENT_UPLOADED: 'Document uploaded successfully.',
  DOCUMENT_FETCHED: 'Document fetched successfully.',
  DOCUMENTS_FETCHED: 'Documents fetched successfully.',
  DOCUMENT_DELETED: 'Document removed successfully.',
  DOCUMENT_NOT_FOUND: 'Document not found.',
  NO_FILE_UPLOADED: 'No file was uploaded.',
  INVALID_FILE_TYPE: 'Invalid file type.',
  FILE_TOO_LARGE: 'File size exceeds the allowed limit.',

  // Resume
  RESUME_UPLOADED: 'Resume uploaded successfully.',
  RESUME_FETCHED: 'Resume fetched successfully.',

  // Certificates
  CERTIFICATES_UPLOADED: 'Certificate(s) uploaded successfully.',
  CERTIFICATES_FETCHED: 'Certificates fetched successfully.',

  // Passport
  PASSPORT_UPLOADED: 'Passport uploaded successfully.',
  PASSPORT_FETCHED: 'Passport fetched successfully.',

  // CDC
  CDC_UPLOADED: 'CDC uploaded successfully.',
  CDC_FETCHED: 'CDC fetched successfully.',

  // Medical
  MEDICAL_UPLOADED: 'Medical certificate uploaded successfully.',
  MEDICAL_FETCHED: 'Medical certificate fetched successfully.',

  // Visa
  VISA_UPLOADED: 'Visa document(s) uploaded successfully.',
  VISA_FETCHED: 'Visa documents fetched successfully.',

  // Generic
  NOT_FOUND: 'The requested resource was not found.',
  INTERNAL_ERROR: 'An unexpected error occurred. Please try again later.',
  TOO_MANY_REQUESTS: 'Too many requests. Please slow down and try again later.',
  VALIDATION_FAILED: 'Validation failed. Please check the provided data.',

  // Search
  SEARCH_RESULTS_FETCHED: 'Search results fetched successfully.',
  SEARCH_QUERY_TOO_SHORT: 'Search query must be at least 2 characters.',

  // Dashboard
  DASHBOARD_SUMMARY_FETCHED: 'Dashboard summary fetched successfully.',
  DASHBOARD_CHART_FETCHED: 'Dashboard chart data fetched successfully.',

  // Jobs
  JOB_CREATED: 'Job created successfully.',
  JOB_UPDATED: 'Job updated successfully.',
  JOB_FETCHED: 'Job fetched successfully.',
  JOBS_FETCHED: 'Jobs fetched successfully.',
  JOB_STATS_FETCHED: 'Job application statistics fetched successfully.',
  JOB_NOT_FOUND: 'Job not found.',
  JOB_STATUS_UPDATED: 'Job status updated successfully.',
  JOB_INVALID_STATUS_TRANSITION: 'Cannot change job status from "%s" to "%s".',
  JOB_IMAGE_UPLOADED: 'Job image uploaded successfully.',
  JOB_DELETED: 'Job deleted successfully.',
  JOB_DELETE_NOT_ALLOWED: 'Only draft or archived jobs can be deleted.',
  JOB_DELETE_HAS_APPLICATIONS: 'This job has applications against it and cannot be deleted.',

  // Saved jobs
  SAVED_JOBS_FETCHED: 'Saved jobs fetched successfully.',
  JOB_SAVED: 'Job saved successfully.',
  JOB_UNSAVED: 'Job removed from saved jobs.',

  // Banners
  BANNERS_FETCHED: 'Banners fetched successfully.',
  BANNER_CREATED: 'Banner created successfully.',
  BANNER_UPDATED: 'Banner updated successfully.',
  BANNER_DELETED: 'Banner deleted successfully.',
  BANNER_NOT_FOUND: 'Banner not found.',
  BANNER_IMAGE_UPLOADED: 'Banner image uploaded successfully.',

  // Subscriptions & payments
  PLANS_FETCHED: 'Plans fetched successfully.',
  PLAN_NOT_FOUND: 'This plan is not available.',
  PLAN_CREATED: 'Plan created successfully.',
  PLAN_UPDATED: 'Plan updated successfully.',
  PRICING_SETTINGS_FETCHED: 'Pricing settings fetched successfully.',
  PRICING_SETTINGS_UPDATED: 'Pricing settings updated successfully.',
  ORDER_CREATED: 'Payment order created.',
  PAYMENT_IN_PROGRESS: 'A payment is already in progress. Please complete or wait for it before starting another.',
  PAYMENT_ALREADY_MADE: 'Your previous payment already went through — your subscription is now active.',
  ALREADY_SUBSCRIBED: 'You already have an active subscription. It will apply until it expires.',
  PAYMENT_VERIFIED: 'Payment verified. Your subscription is now active.',
  PAYMENT_VERIFICATION_FAILED: 'Payment could not be verified.',
  PAYMENT_NOT_FOUND: 'Payment record not found.',
  WEBHOOK_INVALID_SIGNATURE: 'Invalid webhook signature.',
  PAYMENTS_FETCHED: 'Payments fetched successfully.',
  PAYMENT_STATS_FETCHED: 'Payment statistics fetched successfully.',
  SUBSCRIPTION_FETCHED: 'Subscription fetched successfully.',
  SUBSCRIPTION_ANALYTICS_FETCHED: 'Subscription analytics fetched successfully.',
  SUBSCRIPTIONS_FETCHED: 'Subscriptions fetched successfully.',
  SUBSCRIPTION_REQUIRED: 'An active subscription is required to access this feature.',
  SUBSCRIPTION_TIER_REQUIRED: 'Your current plan does not include this feature. Please upgrade.',
  APPLICATION_LIMIT_REACHED: 'You have reached your monthly application limit. Upgrade your plan or wait until next month.',
  PAYMENTS_NOT_CONFIGURED: 'Payments are not configured. Please try again later.',

  // Consultancy bookings
  CONSULTANCY_CONFIG_FETCHED: 'Consultancy configuration fetched successfully.',
  CONSULTANCY_FEE_UPDATED: 'Consultancy fee updated successfully.',
  CONSULTANCY_AVAILABILITY_FETCHED: 'Availability fetched successfully.',
  CONSULTANCY_SLOTS_FETCHED: 'Slots fetched successfully.',
  CONSULTANCY_SLOT_NOT_AVAILABLE: 'This slot is no longer available. Please choose another.',
  CONSULTANCY_SCHEDULE_UPDATED: 'Weekly availability schedule updated successfully.',
  CONSULTANCY_ORDER_CREATED: 'Consultancy booking order created.',
  CONSULTANCY_PAYMENT_VERIFIED: 'Payment verified. Your consultancy booking is confirmed and awaiting review.',
  CONSULTANCY_BOOKINGS_FETCHED: 'Bookings fetched successfully.',
  CONSULTANCY_BOOKING_FETCHED: 'Booking fetched successfully.',
  CONSULTANCY_BOOKING_NOT_FOUND: 'Booking not found.',
  CONSULTANCY_BOOKING_STATUS_UPDATED: 'Booking status updated successfully.',
  CONSULTANCY_BOOKING_INVALID_STATUS_TRANSITION: 'This booking has already been decided and cannot be updated again.',
  CONSULTANCY_RESUME_NOT_FOUND: 'No active resume found on your account.',

  // Support inquiries
  SUPPORT_INQUIRY_CREATED: 'Your message has been sent. Our team will get back to you as soon as possible.',
  SUPPORT_INQUIRIES_FETCHED: 'Support inquiries fetched successfully.',
  SUPPORT_INQUIRY_FETCHED: 'Support inquiry fetched successfully.',
  SUPPORT_INQUIRY_NOT_FOUND: 'Support inquiry not found.',
  SUPPORT_INQUIRY_STATUS_UPDATED: 'Support inquiry updated successfully.',

  // Referrals & wallet
  REFERRAL_FETCHED: 'Referral details fetched successfully.',
  REFERRAL_CODE_GENERATED: 'Referral code generated successfully.',
  REFERRALS_FETCHED: 'Referrals fetched successfully.',
  REFERRAL_NOT_FOUND: 'Referral not found.',
  REFERRAL_STATUS_UPDATED: 'Referral status updated successfully.',
  INVALID_REFERRAL_STATUS: 'Invalid referral status.',
  REFERRAL_SETTINGS_FETCHED: 'Referral settings fetched successfully.',
  REFERRAL_SETTINGS_UPDATED: 'Referral settings updated successfully.',
  INVALID_REFERRAL_CODE: 'This referral code is invalid.',
  SELF_REFERRAL_NOT_ALLOWED: 'You cannot use your own referral code.',
  WALLET_FETCHED: 'Wallet fetched successfully.',

  // Applications
  APPLICATION_SUBMITTED: 'Application submitted successfully.',
  APPLICATION_FETCHED: 'Application fetched successfully.',
  APPLICATIONS_FETCHED: 'Applications fetched successfully.',
  APPLICATION_NOT_FOUND: 'Application not found.',
  APPLICATION_ALREADY_EXISTS: 'You have already applied for this job.',
  APPLICATION_WITHDRAWN: 'Application withdrawn successfully.',
  APPLICATION_WITHDRAW_NOT_ALLOWED: 'This application can no longer be withdrawn.',
  JOB_NOT_OPEN_FOR_APPLICATIONS: 'This job is no longer accepting applications.',
  MISSING_REQUIRED_DOCUMENTS: 'You are missing required documents for this job.',
  ELIGIBILITY_FETCHED: 'Eligibility fetched successfully.',
  APPLICATION_STATUS_UPDATED: 'Application status updated successfully.',
  APPLICATION_INVALID_STATUS_TRANSITION: 'Cannot change application status from "%s" to "%s".',

  // Notifications
  NOTIFICATIONS_FETCHED: 'Notifications fetched successfully.',
  NOTIFICATION_NOT_FOUND: 'Notification not found.',
  NOTIFICATION_MARKED_READ: 'Notification marked as read.',
  ALL_NOTIFICATIONS_MARKED_READ: 'All notifications marked as read.',
  UNREAD_COUNT_FETCHED: 'Unread count fetched successfully.',
  UNREAD_COUNTS_BY_TYPE_FETCHED: 'Unread counts fetched successfully.',
  DEVICE_TOKEN_REGISTERED: 'Device registered for push notifications.',
  DEVICE_TOKEN_REMOVED: 'Device removed from push notifications.',
  NOTIFICATION_SETTINGS_FETCHED: 'Notification settings fetched successfully.',
  NOTIFICATION_SETTINGS_UPDATED: 'Notification settings updated successfully.',

  // Document Types
  DOCUMENT_TYPE_CREATED: 'Document type created successfully.',
  DOCUMENT_TYPE_UPDATED: 'Document type updated successfully.',
  DOCUMENT_TYPE_DEACTIVATED: 'Document type deactivated successfully.',
  DOCUMENT_TYPE_FETCHED: 'Document type fetched successfully.',
  DOCUMENT_TYPES_FETCHED: 'Document types fetched successfully.',
  DOCUMENT_TYPE_NOT_FOUND: 'Document type not found.',
  DOCUMENT_TYPE_KEY_EXISTS: 'A document type with this key already exists.',
  INVALID_DOCUMENT_CATEGORY: 'Invalid or inactive document category.',

  // Job Taxonomy — Department/Vessel Type
  JOB_TAXONOMY_CREATED: 'Added successfully.',
  JOB_TAXONOMY_UPDATED: 'Updated successfully.',
  JOB_TAXONOMY_DEACTIVATED: 'Deactivated successfully.',
  JOB_TAXONOMY_FETCHED: 'Fetched successfully.',
  JOB_TAXONOMIES_FETCHED: 'Fetched successfully.',
  JOB_TAXONOMY_NOT_FOUND: 'Not found.',
  JOB_TAXONOMY_EXISTS: 'This value already exists.',
  JOB_TAXONOMY_ICON_UPLOADED: 'Icon uploaded successfully.',

  // Career Profile Engine
  CAREER_PROFILE_FETCHED: 'Career profile fetched successfully.',
  CAREER_PROFILE_UPDATED: 'Career profile updated successfully.',
  CAREER_PROFILE_ENTRY_ADDED: 'Added successfully.',
  CAREER_PROFILE_ENTRY_UPDATED: 'Updated successfully.',
  CAREER_PROFILE_ENTRY_REMOVED: 'Removed successfully.',

  RESUME_TEMPLATE_CREATED: 'Resume template created successfully.',
  RESUME_TEMPLATE_UPDATED: 'Resume template updated successfully.',
  RESUME_TEMPLATE_DEACTIVATED: 'Resume template deactivated successfully.',
  RESUME_TEMPLATE_FETCHED: 'Resume template fetched successfully.',
  RESUME_TEMPLATES_FETCHED: 'Resume templates fetched successfully.',
  RESUME_TEMPLATE_NOT_FOUND: 'Resume template not found.',
  RESUME_TEMPLATE_KEY_EXISTS: 'A resume template with this key already exists.',

  RESUME_CONFIGURATION_CREATED: 'Resume created successfully.',
  RESUME_CONFIGURATION_UPDATED: 'Resume updated successfully.',
  RESUME_CONFIGURATION_DELETED: 'Resume deleted successfully.',
  RESUME_CONFIGURATION_FETCHED: 'Resume fetched successfully.',
  RESUME_CONFIGURATIONS_FETCHED: 'Resumes fetched successfully.',
  RESUME_CONFIGURATION_NOT_FOUND: 'Resume not found.',

  RESUME_GENERATED: 'Resume generated successfully.',
  RESUME_HISTORY_FETCHED: 'Resume history fetched successfully.',
});

module.exports = { AUTH_MESSAGES };
