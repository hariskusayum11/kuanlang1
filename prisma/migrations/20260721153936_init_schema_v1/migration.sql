-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "SheetStatus" AS ENUM ('PENDING', 'LOCKED', 'ENTERED_1', 'ENTERED_2', 'DISCREPANCY', 'NEEDS_FIELD_QUERY', 'VERIFIED', 'UNRESOLVABLE', 'SHEET_LOST', 'MERGED_INTO');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('RECEIVED', 'READY_FOR_ENTRY', 'IN_PROGRESS', 'CLOSED');

-- CreateEnum
CREATE TYPE "FieldStatusEnum" AS ENUM ('HAS_VALUE', 'EXPLICIT_NONE', 'BLANK_IN_PAPER', 'ILLEGIBLE');

-- CreateEnum
CREATE TYPE "DiscrepancyResolution" AS ENUM ('CHOSE_ENTRY_1', 'CHOSE_ENTRY_2', 'CHOSE_OTHER', 'MARKED_ILLEGIBLE', 'UNRESOLVABLE');

-- CreateEnum
CREATE TYPE "FieldQueryStatus" AS ENUM ('PENDING', 'SENT', 'ANSWERED', 'UNRESOLVABLE');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GIVEN', 'NOT_GIVEN', 'UNKNOWN', 'LEGAL_BASIS');

-- CreateEnum
CREATE TYPE "FloorLevel" AS ENUM ('BELOW_ROAD', 'EQUAL_ROAD', 'ABOVE_ROAD');

-- CreateEnum
CREATE TYPE "LastEvacuationPlace" AS ENUM ('UPPER_FLOOR', 'ROOF', 'NEAREST_SITE', 'OTHER');

-- CreateEnum
CREATE TYPE "NearestEvacSiteType" AS ENUM ('RELATIVE_HOUSE', 'SCHOOL', 'TEMPLE_MOSQUE', 'COMMUNITY_CENTER', 'MUNICIPALITY', 'UNKNOWN', 'OTHER');

-- CreateEnum
CREATE TYPE "EvacuationSiteType" AS ENUM ('RELATIVE_HOME', 'SCHOOL', 'TEMPLE_OR_MOSQUE', 'COMMUNITY_CENTER', 'MUNICIPAL_AREA', 'OTHER');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('CAR', 'MOTORCYCLE', 'BOAT', 'OTHER');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TriageLevel" AS ENUM ('P1', 'P2', 'P3');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT', 'LOGIN', 'LOGOUT', 'LOCK', 'UNLOCK', 'VERIFY', 'RESOLVE', 'MERGE', 'APPROVE', 'REJECT');

-- CreateEnum
CREATE TYPE "UserRoleEnum" AS ENUM ('ADMIN', 'EXECUTIVE', 'OFFICER', 'COORDINATOR', 'VERIFIER', 'VOLUNTEER', 'DATA_ENTRY', 'RESEARCHER', 'FIELD_SURVEYOR');

-- CreateEnum
CREATE TYPE "SurveyorRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "PregnancyUnit" AS ENUM ('WEEKS', 'MONTHS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VolunteerApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CompareMode" AS ENUM ('EXACT', 'NORMALIZED_PHONE', 'NORMALIZED_TEXT', 'NUMERIC_TOLERANCE', 'SET_EQUALITY');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'UNREACHABLE', 'CANCELLED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "idToken" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "UserRoleEnum" NOT NULL,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_community_scope" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "canEdit" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "user_community_scope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "confidentiality_agreement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "agreedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "confidentiality_agreement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "province" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,

    CONSTRAINT "province_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "district" (
    "id" TEXT NOT NULL,
    "provinceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,

    CONSTRAINT "district_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tambon" (
    "id" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,

    CONSTRAINT "tambon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moo" (
    "id" TEXT NOT NULL,
    "tambonId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,

    CONSTRAINT "moo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "nameEn" TEXT,
    "totalHouseholds" INTEGER,
    "targetCoveragePercent" DOUBLE PRECISION NOT NULL DEFAULT 60,
    "lastPopulationUpdatedAt" TIMESTAMP(3),
    "populationDataSource" TEXT,
    "populationDataNote" TEXT,
    "populationUpdatedById" TEXT,
    "leaderName" TEXT,
    "leaderPhone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_tambon" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "tambonId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_tambon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_boundary" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "geom" geography(MultiPolygon, 4326),
    "source" TEXT,
    "accuracyNote" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_boundary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "building_type" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "building_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ownership_type" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ownership_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vulnerability_type" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "basePriority" "TriageLevel" NOT NULL,
    "requiresDetail" BOOLEAN NOT NULL DEFAULT false,
    "detailLabel" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "vulnerability_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistance_need_type" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "requiresCount" BOOLEAN NOT NULL DEFAULT true,
    "requiresDetail" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "assistance_need_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_type" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "resource_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_channel" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "isDigital" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "alert_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_skill_type" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "skillCategory" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "volunteer_skill_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_batch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "expectedCount" INTEGER NOT NULL,
    "receivedCount" INTEGER NOT NULL DEFAULT 0,
    "enteredCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedCount" INTEGER NOT NULL DEFAULT 0,
    "handedOverBy" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "receivedById" TEXT NOT NULL,
    "storageLocation" TEXT,
    "scanPdfUrl" TEXT,
    "status" "BatchStatus" NOT NULL DEFAULT 'RECEIVED',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paper_batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paper_sheet" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sheetNo" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "SheetStatus" NOT NULL DEFAULT 'PENDING',
    "lockedById" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lockExpiresAt" TIMESTAMP(3),
    "storageSlot" TEXT,
    "scanImageUrl" TEXT,
    "mergedIntoSheetId" TEXT,
    "lostReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paper_sheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_attempt" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "enteredById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "payload" JSONB NOT NULL,
    "isBlind" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_status" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "entryAttemptId" TEXT,
    "fieldPath" TEXT NOT NULL,
    "status" "FieldStatusEnum" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "field_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discrepancy" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "value1" TEXT,
    "value2" TEXT,
    "resolvedValue" TEXT,
    "resolution" "DiscrepancyResolution",
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discrepancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "field_query" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "surveyorName" TEXT,
    "status" "FieldQueryStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "answer" TEXT,
    "answeredById" TEXT,
    "pdfUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "field_query_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household" (
    "id" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "surveyNo" TEXT,
    "communityNameOnPaper" TEXT,
    "surveyorNameOnPaper" TEXT,
    "surveyorPhoneOnPaper" TEXT,
    "surveyedAt" TIMESTAMP(3),
    "surveyorUserId" TEXT,
    "enteredById" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "buildingTypeId" TEXT,
    "buildingTypeOther" TEXT,
    "placeName" TEXT,
    "respondentName" TEXT,
    "respondentPhone" TEXT,
    "houseNo" TEXT,
    "mooId" TEXT,
    "soi" TEXT,
    "road" TEXT,
    "tambonId" TEXT,
    "coordinateRawText" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "location" geography(Point, 4326),
    "memberCount" INTEGER,
    "ownershipTypeId" TEXT,
    "ownershipOther" TEXT,
    "hasVulnerable" BOOLEAN,
    "assistanceTotalPersonCount" INTEGER,
    "hasNoResources" BOOLEAN,
    "volunteerNotAvailable" BOOLEAN,
    "mentalHealthSupport" BOOLEAN,
    "suggestion" TEXT,
    "surveyorNote" TEXT,
    "povertyProgramInterest" BOOLEAN,
    "consentStatus" "ConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "consentNote" TEXT,
    "completenessScore" DOUBLE PRECISION,
    "illegibleCount" INTEGER NOT NULL DEFAULT 0,
    "blankCount" INTEGER NOT NULL DEFAULT 0,
    "hasDuplicateFlag" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_version" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeReason" TEXT,

    CONSTRAINT "household_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_record" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "consentGivenBy" TEXT,
    "relationship" TEXT,
    "consentedAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "consentType" TEXT,
    "scanUrl" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vulnerable_person" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "fullName" TEXT,
    "fullNameStatus" "FieldStatusEnum" NOT NULL DEFAULT 'HAS_VALUE',
    "age" INTEGER,
    "ageStatus" "FieldStatusEnum" NOT NULL DEFAULT 'HAS_VALUE',
    "phone" TEXT,
    "phoneStatus" "FieldStatusEnum" NOT NULL DEFAULT 'HAS_VALUE',
    "triageLevel" "TriageLevel",
    "triageComputedAt" TIMESTAMP(3),
    "triageBasedOnDate" TIMESTAMP(3),
    "triageStale" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vulnerable_person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_vulnerability" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "vulnerabilityTypeId" TEXT NOT NULL,
    "detail" TEXT,
    "pregnancyRawText" TEXT,
    "pregnancyUnit" "PregnancyUnit",
    "pregnancyValue" INTEGER,
    "pregnancyWeeks" INTEGER,
    "postpartumMonths" INTEGER,
    "referenceDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_vulnerability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistance_need" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "needTypeId" TEXT NOT NULL,
    "personCount" INTEGER,
    "detail" TEXT,

    CONSTRAINT "assistance_need_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flood_risk_profile" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "floorLevelVsRoad" "FloorLevel",
    "hasFloodedBefore" BOOLEAN,
    "floodDepthMetersRaw" INTEGER,
    "floodDepthCmRaw" INTEGER,
    "maxFloodDepthCm" INTEGER,
    "lastFloodDurationDays" INTEGER,
    "lastFloodYear" INTEGER,
    "hasSafeParking" BOOLEAN,
    "hasAlternateParking" BOOLEAN,
    "alternateParkingLocation" TEXT,
    "lastEvacuationPlace" "LastEvacuationPlace",
    "lastEvacuationOther" TEXT,
    "nearestEvacSiteType" "NearestEvacSiteType",
    "nearestEvacSiteOther" TEXT,
    "hasSurvivalKit" BOOLEAN,
    "canBeHostHouse" BOOLEAN,
    "rawScore" DOUBLE PRECISION,
    "maximumPossibleScore" DOUBLE PRECISION,
    "normalizedScore" DOUBLE PRECISION,
    "computedAt" TIMESTAMP(3),
    "riskLevelSurveyor" "SurveyorRiskLevel",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flood_risk_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_resource" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "resourceTypeId" TEXT NOT NULL,
    "quantity" INTEGER,
    "detail" TEXT,
    "isAvailableForCommunity" BOOLEAN,
    "condition" TEXT,

    CONSTRAINT "household_resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evacuation_vehicle" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "vehicleType" "VehicleType" NOT NULL,
    "detail" TEXT,

    CONSTRAINT "evacuation_vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_channel_pref" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "alertChannelId" TEXT NOT NULL,

    CONSTRAINT "alert_channel_pref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_readiness" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "usesSmartphone" BOOLEAN,
    "canScanQR" BOOLEAN,
    "lineUserId" TEXT,

    CONSTRAINT "digital_readiness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_interest" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "volunteerTypeId" TEXT NOT NULL,
    "contactPersonName" TEXT,
    "contactPhone" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "volunteer_interest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evacuation_site" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EvacuationSiteType",
    "address" TEXT,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "location" geography(Point, 4326),
    "capacity" INTEGER,
    "hasToilet" BOOLEAN NOT NULL DEFAULT false,
    "hasKitchen" BOOLEAN NOT NULL DEFAULT false,
    "hasPowerBackup" BOOLEAN NOT NULL DEFAULT false,
    "hasMedicalPoint" BOOLEAN NOT NULL DEFAULT false,
    "isAccessibleForDisabled" BOOLEAN NOT NULL DEFAULT false,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evacuation_site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_weight_config" (
    "id" TEXT NOT NULL,
    "factorCode" TEXT NOT NULL,
    "factorNameTh" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "risk_weight_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'FLOOD',
    "severity" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "status" "IncidentStatus" NOT NULL DEFAULT 'ACTIVE',
    "declaredById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_community" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,

    CONSTRAINT "incident_community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rescue_task" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "personId" TEXT,
    "priority" "TriageLevel" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "assignedToId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rescue_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_update" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "TaskStatus" NOT NULL,
    "note" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_update_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_template" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "subject" TEXT,
    "bodyTh" TEXT NOT NULL,
    "variables" TEXT[],

    CONSTRAINT "notification_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "recipientUserId" TEXT,
    "recipientPhone" TEXT,
    "recipientLineId" TEXT,
    "channel" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "incidentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "changes" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdpa_request" (
    "id" TEXT NOT NULL,
    "householdId" TEXT,
    "requestType" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterPhone" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "handledById" TEXT,
    "handledAt" TIMESTAMP(3),
    "response" TEXT,

    CONSTRAINT "pdpa_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_job" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "filterCriteria" JSONB,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "fileUrl" TEXT,
    "rowCount" INTEGER,
    "isAnonymized" BOOLEAN NOT NULL DEFAULT false,
    "coveragePercent" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "export_job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_setting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entry_stats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sheetsEntered" INTEGER NOT NULL DEFAULT 0,
    "sheetsVerified" INTEGER NOT NULL DEFAULT 0,
    "avgDurationSec" DOUBLE PRECISION,
    "errorRate" DOUBLE PRECISION,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entry_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contact" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isNationwide" BOOLEAN NOT NULL DEFAULT false,
    "communityId" TEXT,
    "provinceId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "communityId" TEXT,
    "status" "VolunteerApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "pdpaAcceptedAt" TIMESTAMP(3),
    "pdpaVersion" TEXT,
    "equipment" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "volunteer_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteer_profile_skill" (
    "id" TEXT NOT NULL,
    "volunteerProfileId" TEXT NOT NULL,
    "skillTypeId" TEXT NOT NULL,

    CONSTRAINT "volunteer_profile_skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "critical_field_config" (
    "id" TEXT NOT NULL,
    "fieldPath" TEXT NOT NULL,
    "labelTh" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "questionNo" TEXT,
    "isCritical" BOOLEAN NOT NULL DEFAULT true,
    "compareMode" "CompareMode" NOT NULL DEFAULT 'EXACT',
    "tolerance" DOUBLE PRECISION,
    "isRepeating" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "critical_field_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_userId_role_key" ON "user_role"("userId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "user_community_scope_userId_communityId_key" ON "user_community_scope"("userId", "communityId");

-- CreateIndex
CREATE UNIQUE INDEX "confidentiality_agreement_userId_key" ON "confidentiality_agreement"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "province_code_key" ON "province"("code");

-- CreateIndex
CREATE UNIQUE INDEX "district_code_key" ON "district"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tambon_code_key" ON "tambon"("code");

-- CreateIndex
CREATE INDEX "tambon_districtId_idx" ON "tambon"("districtId");

-- CreateIndex
CREATE UNIQUE INDEX "moo_tambonId_number_key" ON "moo"("tambonId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "community_code_key" ON "community"("code");

-- CreateIndex
CREATE INDEX "community_isActive_idx" ON "community"("isActive");

-- CreateIndex
CREATE INDEX "community_tambon_tambonId_idx" ON "community_tambon"("tambonId");

-- CreateIndex
CREATE INDEX "community_tambon_communityId_isPrimary_idx" ON "community_tambon"("communityId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "community_tambon_communityId_tambonId_key" ON "community_tambon"("communityId", "tambonId");

-- CreateIndex
CREATE INDEX "community_boundary_communityId_effectiveTo_idx" ON "community_boundary"("communityId", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "community_boundary_communityId_version_key" ON "community_boundary"("communityId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "building_type_code_key" ON "building_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ownership_type_code_key" ON "ownership_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "vulnerability_type_code_key" ON "vulnerability_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "assistance_need_type_code_key" ON "assistance_need_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "resource_type_code_key" ON "resource_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "alert_channel_code_key" ON "alert_channel"("code");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_skill_type_code_key" ON "volunteer_skill_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "paper_batch_code_key" ON "paper_batch"("code");

-- CreateIndex
CREATE INDEX "paper_batch_communityId_status_idx" ON "paper_batch"("communityId", "status");

-- CreateIndex
CREATE INDEX "paper_batch_status_idx" ON "paper_batch"("status");

-- CreateIndex
CREATE UNIQUE INDEX "paper_sheet_sheetNo_key" ON "paper_sheet"("sheetNo");

-- CreateIndex
CREATE INDEX "ix_sheet_pickup" ON "paper_sheet"("status", "batchId", "sequence");

-- CreateIndex
CREATE INDEX "ix_sheet_lock_expiry" ON "paper_sheet"("lockExpiresAt");

-- CreateIndex
CREATE INDEX "paper_sheet_batchId_sequence_idx" ON "paper_sheet"("batchId", "sequence");

-- CreateIndex
CREATE INDEX "ix_entry_attempt_user" ON "entry_attempt"("sheetId", "enteredById");

-- CreateIndex
CREATE INDEX "ix_entry_throughput" ON "entry_attempt"("enteredById", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "entry_attempt_sheetId_attemptNo_key" ON "entry_attempt"("sheetId", "attemptNo");

-- CreateIndex
CREATE INDEX "field_status_sheetId_fieldPath_idx" ON "field_status"("sheetId", "fieldPath");

-- CreateIndex
CREATE INDEX "ix_discrepancy_sheet" ON "discrepancy"("sheetId");

-- CreateIndex
CREATE INDEX "discrepancy_resolution_idx" ON "discrepancy"("resolution");

-- CreateIndex
CREATE INDEX "field_query_sheetId_idx" ON "field_query"("sheetId");

-- CreateIndex
CREATE INDEX "field_query_status_idx" ON "field_query"("status");

-- CreateIndex
CREATE UNIQUE INDEX "household_sheetId_key" ON "household"("sheetId");

-- CreateIndex
CREATE INDEX "ix_household_address_dup" ON "household"("houseNo", "mooId", "tambonId");

-- CreateIndex
CREATE INDEX "household_communityId_idx" ON "household"("communityId");

-- CreateIndex
CREATE INDEX "household_communityId_deletedAt_idx" ON "household"("communityId", "deletedAt");

-- CreateIndex
CREATE INDEX "household_batchId_idx" ON "household"("batchId");

-- CreateIndex
CREATE INDEX "household_deletedAt_idx" ON "household"("deletedAt");

-- CreateIndex
CREATE INDEX "household_surveyedAt_idx" ON "household"("surveyedAt");

-- CreateIndex
CREATE INDEX "household_hasDuplicateFlag_idx" ON "household"("hasDuplicateFlag");

-- CreateIndex
CREATE INDEX "ix_household_exact_coord" ON "household"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "household_version_householdId_versionNo_idx" ON "household_version"("householdId", "versionNo");

-- CreateIndex
CREATE INDEX "consent_record_householdId_idx" ON "consent_record"("householdId");

-- CreateIndex
CREATE INDEX "vulnerable_person_householdId_idx" ON "vulnerable_person"("householdId");

-- CreateIndex
CREATE INDEX "ix_vulnerable_triage" ON "vulnerable_person"("triageLevel");

-- CreateIndex
CREATE UNIQUE INDEX "vulnerable_person_householdId_seq_key" ON "vulnerable_person"("householdId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "person_vulnerability_personId_vulnerabilityTypeId_key" ON "person_vulnerability"("personId", "vulnerabilityTypeId");

-- CreateIndex
CREATE INDEX "assistance_need_householdId_idx" ON "assistance_need"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "flood_risk_profile_householdId_key" ON "flood_risk_profile"("householdId");

-- CreateIndex
CREATE INDEX "household_resource_householdId_idx" ON "household_resource"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "household_resource_householdId_resourceTypeId_key" ON "household_resource"("householdId", "resourceTypeId");

-- CreateIndex
CREATE INDEX "evacuation_vehicle_householdId_idx" ON "evacuation_vehicle"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "alert_channel_pref_householdId_alertChannelId_key" ON "alert_channel_pref"("householdId", "alertChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "digital_readiness_householdId_key" ON "digital_readiness"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_interest_householdId_volunteerTypeId_key" ON "volunteer_interest"("householdId", "volunteerTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "risk_weight_config_factorCode_key" ON "risk_weight_config"("factorCode");

-- CreateIndex
CREATE INDEX "incident_community_communityId_idx" ON "incident_community"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "incident_community_incidentId_communityId_key" ON "incident_community"("incidentId", "communityId");

-- CreateIndex
CREATE INDEX "ix_task_incident_status" ON "rescue_task"("incidentId", "status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "notification_template_code_key" ON "notification_template"("code");

-- CreateIndex
CREATE INDEX "ix_audit_entity" ON "audit_log"("entityType", "entityId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "audit_log_userId_createdAt_idx" ON "audit_log"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "system_setting_key_key" ON "system_setting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "entry_stats_userId_date_key" ON "entry_stats"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "emergency_contact_code_key" ON "emergency_contact"("code");

-- CreateIndex
CREATE INDEX "emergency_contact_isActive_sortOrder_idx" ON "emergency_contact"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "emergency_contact_communityId_idx" ON "emergency_contact"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_profile_userId_key" ON "volunteer_profile"("userId");

-- CreateIndex
CREATE INDEX "volunteer_profile_status_idx" ON "volunteer_profile"("status");

-- CreateIndex
CREATE INDEX "volunteer_profile_communityId_idx" ON "volunteer_profile"("communityId");

-- CreateIndex
CREATE UNIQUE INDEX "volunteer_profile_skill_volunteerProfileId_skillTypeId_key" ON "volunteer_profile_skill"("volunteerProfileId", "skillTypeId");

-- CreateIndex
CREATE INDEX "critical_field_config_isActive_isCritical_sortOrder_idx" ON "critical_field_config"("isActive", "isCritical", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "critical_field_config_fieldPath_version_key" ON "critical_field_config"("fieldPath", "version");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role" ADD CONSTRAINT "user_role_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_community_scope" ADD CONSTRAINT "user_community_scope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_community_scope" ADD CONSTRAINT "user_community_scope_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "confidentiality_agreement" ADD CONSTRAINT "confidentiality_agreement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "district" ADD CONSTRAINT "district_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tambon" ADD CONSTRAINT "tambon_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "district"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moo" ADD CONSTRAINT "moo_tambonId_fkey" FOREIGN KEY ("tambonId") REFERENCES "tambon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_tambon" ADD CONSTRAINT "community_tambon_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_tambon" ADD CONSTRAINT "community_tambon_tambonId_fkey" FOREIGN KEY ("tambonId") REFERENCES "tambon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_boundary" ADD CONSTRAINT "community_boundary_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_batch" ADD CONSTRAINT "paper_batch_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_batch" ADD CONSTRAINT "paper_batch_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_batch" ADD CONSTRAINT "paper_batch_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_sheet" ADD CONSTRAINT "paper_sheet_mergedIntoSheetId_fkey" FOREIGN KEY ("mergedIntoSheetId") REFERENCES "paper_sheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_sheet" ADD CONSTRAINT "paper_sheet_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "paper_batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paper_sheet" ADD CONSTRAINT "paper_sheet_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_attempt" ADD CONSTRAINT "entry_attempt_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "paper_sheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_attempt" ADD CONSTRAINT "entry_attempt_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_status" ADD CONSTRAINT "field_status_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "paper_sheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_status" ADD CONSTRAINT "field_status_entryAttemptId_fkey" FOREIGN KEY ("entryAttemptId") REFERENCES "entry_attempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discrepancy" ADD CONSTRAINT "discrepancy_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "paper_sheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discrepancy" ADD CONSTRAINT "discrepancy_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_query" ADD CONSTRAINT "field_query_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "paper_sheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "field_query" ADD CONSTRAINT "field_query_answeredById_fkey" FOREIGN KEY ("answeredById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household" ADD CONSTRAINT "household_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "paper_sheet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household" ADD CONSTRAINT "household_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household" ADD CONSTRAINT "household_buildingTypeId_fkey" FOREIGN KEY ("buildingTypeId") REFERENCES "building_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household" ADD CONSTRAINT "household_mooId_fkey" FOREIGN KEY ("mooId") REFERENCES "moo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household" ADD CONSTRAINT "household_tambonId_fkey" FOREIGN KEY ("tambonId") REFERENCES "tambon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household" ADD CONSTRAINT "household_ownershipTypeId_fkey" FOREIGN KEY ("ownershipTypeId") REFERENCES "ownership_type"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household" ADD CONSTRAINT "household_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household" ADD CONSTRAINT "household_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household" ADD CONSTRAINT "household_surveyorUserId_fkey" FOREIGN KEY ("surveyorUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_version" ADD CONSTRAINT "household_version_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_record" ADD CONSTRAINT "consent_record_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerable_person" ADD CONSTRAINT "vulnerable_person_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_vulnerability" ADD CONSTRAINT "person_vulnerability_personId_fkey" FOREIGN KEY ("personId") REFERENCES "vulnerable_person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_vulnerability" ADD CONSTRAINT "person_vulnerability_vulnerabilityTypeId_fkey" FOREIGN KEY ("vulnerabilityTypeId") REFERENCES "vulnerability_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistance_need" ADD CONSTRAINT "assistance_need_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistance_need" ADD CONSTRAINT "assistance_need_needTypeId_fkey" FOREIGN KEY ("needTypeId") REFERENCES "assistance_need_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flood_risk_profile" ADD CONSTRAINT "flood_risk_profile_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_resource" ADD CONSTRAINT "household_resource_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "household_resource" ADD CONSTRAINT "household_resource_resourceTypeId_fkey" FOREIGN KEY ("resourceTypeId") REFERENCES "resource_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evacuation_vehicle" ADD CONSTRAINT "evacuation_vehicle_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_channel_pref" ADD CONSTRAINT "alert_channel_pref_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_channel_pref" ADD CONSTRAINT "alert_channel_pref_alertChannelId_fkey" FOREIGN KEY ("alertChannelId") REFERENCES "alert_channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_readiness" ADD CONSTRAINT "digital_readiness_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_interest" ADD CONSTRAINT "volunteer_interest_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_interest" ADD CONSTRAINT "volunteer_interest_volunteerTypeId_fkey" FOREIGN KEY ("volunteerTypeId") REFERENCES "volunteer_skill_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evacuation_site" ADD CONSTRAINT "evacuation_site_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_community" ADD CONSTRAINT "incident_community_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_community" ADD CONSTRAINT "incident_community_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rescue_task" ADD CONSTRAINT "rescue_task_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rescue_task" ADD CONSTRAINT "rescue_task_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "household"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rescue_task" ADD CONSTRAINT "rescue_task_personId_fkey" FOREIGN KEY ("personId") REFERENCES "vulnerable_person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rescue_task" ADD CONSTRAINT "rescue_task_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_update" ADD CONSTRAINT "task_update_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "rescue_task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_update" ADD CONSTRAINT "task_update_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entry_stats" ADD CONSTRAINT "entry_stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_profile" ADD CONSTRAINT "volunteer_profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_profile" ADD CONSTRAINT "volunteer_profile_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_profile_skill" ADD CONSTRAINT "volunteer_profile_skill_volunteerProfileId_fkey" FOREIGN KEY ("volunteerProfileId") REFERENCES "volunteer_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteer_profile_skill" ADD CONSTRAINT "volunteer_profile_skill_skillTypeId_fkey" FOREIGN KEY ("skillTypeId") REFERENCES "volunteer_skill_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
