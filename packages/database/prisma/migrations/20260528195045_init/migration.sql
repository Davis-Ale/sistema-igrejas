-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'PASTOR', 'LEADER', 'VOLUNTEER', 'MEMBER');

-- CreateEnum
CREATE TYPE "VolunteerStatus" AS ENUM ('IN_FORMATION', 'ELIGIBLE', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RegStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'CHECKED_IN');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('TITHE', 'OFFERING', 'EVENT', 'EXPENSE', 'OTHER');

-- CreateEnum
CREATE TYPE "TxDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "PayMethod" AS ENUM ('PIX', 'CARD', 'CASH', 'BOLETO');

-- CreateTable
CREATE TABLE "Church" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "cnpj" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'pt-BR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Church_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campus" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cnpj" TEXT,
    "asaasAccountId" TEXT,
    "address" TEXT,
    "isHeadquarters" BOOLEAN NOT NULL DEFAULT false,
    "pastorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "campusId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "volunteerStatus" "VolunteerStatus" NOT NULL DEFAULT 'IN_FORMATION',
    "trailStageId" TEXT,
    "celulaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trail" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isVolunteerGate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrailStage" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "trailId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "requiresEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrailStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrailProgress" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrailProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Celula" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "campusId" TEXT,
    "leaderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "meetDay" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Celula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "canVolunteer" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "removedAt" TIMESTAMP(3),
    "removalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerLog" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "VolunteerStatus" NOT NULL,
    "changedBy" TEXT NOT NULL,
    "reason" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "campusId" TEXT,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "trailStageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registration" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "status" "RegStatus" NOT NULL DEFAULT 'PENDING',
    "paymentId" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "campusId" TEXT,
    "cnpj" TEXT,
    "personId" TEXT,
    "eventId" TEXT,
    "type" "TxType" NOT NULL,
    "direction" "TxDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PayMethod" NOT NULL,
    "costCenter" TEXT NOT NULL,
    "asaasId" TEXT,
    "nfseId" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Church_churchId_key" ON "Church"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "Church_slug_key" ON "Church"("slug");

-- CreateIndex
CREATE INDEX "Church_churchId_idx" ON "Church"("churchId");

-- CreateIndex
CREATE INDEX "Church_cnpj_idx" ON "Church"("cnpj");

-- CreateIndex
CREATE INDEX "Campus_churchId_idx" ON "Campus"("churchId");

-- CreateIndex
CREATE INDEX "Campus_churchId_cnpj_idx" ON "Campus"("churchId", "cnpj");

-- CreateIndex
CREATE INDEX "Campus_churchId_pastorId_idx" ON "Campus"("churchId", "pastorId");

-- CreateIndex
CREATE INDEX "Campus_churchId_isHeadquarters_idx" ON "Campus"("churchId", "isHeadquarters");

-- CreateIndex
CREATE INDEX "Person_churchId_idx" ON "Person"("churchId");

-- CreateIndex
CREATE INDEX "Person_churchId_campusId_idx" ON "Person"("churchId", "campusId");

-- CreateIndex
CREATE INDEX "Person_churchId_email_idx" ON "Person"("churchId", "email");

-- CreateIndex
CREATE INDEX "Person_churchId_phone_idx" ON "Person"("churchId", "phone");

-- CreateIndex
CREATE INDEX "Person_churchId_role_idx" ON "Person"("churchId", "role");

-- CreateIndex
CREATE INDEX "Person_churchId_volunteerStatus_idx" ON "Person"("churchId", "volunteerStatus");

-- CreateIndex
CREATE INDEX "Person_churchId_celulaId_idx" ON "Person"("churchId", "celulaId");

-- CreateIndex
CREATE INDEX "Person_churchId_trailStageId_idx" ON "Person"("churchId", "trailStageId");

-- CreateIndex
CREATE INDEX "Trail_churchId_idx" ON "Trail"("churchId");

-- CreateIndex
CREATE INDEX "Trail_churchId_isVolunteerGate_idx" ON "Trail"("churchId", "isVolunteerGate");

-- CreateIndex
CREATE INDEX "TrailStage_churchId_idx" ON "TrailStage"("churchId");

-- CreateIndex
CREATE INDEX "TrailStage_churchId_trailId_idx" ON "TrailStage"("churchId", "trailId");

-- CreateIndex
CREATE INDEX "TrailStage_churchId_requiresEventId_idx" ON "TrailStage"("churchId", "requiresEventId");

-- CreateIndex
CREATE UNIQUE INDEX "TrailStage_trailId_order_key" ON "TrailStage"("trailId", "order");

-- CreateIndex
CREATE INDEX "TrailProgress_churchId_idx" ON "TrailProgress"("churchId");

-- CreateIndex
CREATE INDEX "TrailProgress_churchId_personId_idx" ON "TrailProgress"("churchId", "personId");

-- CreateIndex
CREATE INDEX "TrailProgress_churchId_stageId_idx" ON "TrailProgress"("churchId", "stageId");

-- CreateIndex
CREATE INDEX "TrailProgress_churchId_approvedBy_idx" ON "TrailProgress"("churchId", "approvedBy");

-- CreateIndex
CREATE UNIQUE INDEX "TrailProgress_personId_stageId_key" ON "TrailProgress"("personId", "stageId");

-- CreateIndex
CREATE INDEX "Celula_churchId_idx" ON "Celula"("churchId");

-- CreateIndex
CREATE INDEX "Celula_churchId_campusId_idx" ON "Celula"("churchId", "campusId");

-- CreateIndex
CREATE INDEX "Celula_churchId_leaderId_idx" ON "Celula"("churchId", "leaderId");

-- CreateIndex
CREATE INDEX "Celula_churchId_region_idx" ON "Celula"("churchId", "region");

-- CreateIndex
CREATE INDEX "Membership_churchId_idx" ON "Membership"("churchId");

-- CreateIndex
CREATE INDEX "Membership_churchId_personId_idx" ON "Membership"("churchId", "personId");

-- CreateIndex
CREATE INDEX "Membership_churchId_groupId_idx" ON "Membership"("churchId", "groupId");

-- CreateIndex
CREATE INDEX "Membership_churchId_approvedBy_idx" ON "Membership"("churchId", "approvedBy");

-- CreateIndex
CREATE INDEX "Membership_churchId_canVolunteer_idx" ON "Membership"("churchId", "canVolunteer");

-- CreateIndex
CREATE INDEX "VolunteerLog_churchId_idx" ON "VolunteerLog"("churchId");

-- CreateIndex
CREATE INDEX "VolunteerLog_churchId_personId_idx" ON "VolunteerLog"("churchId", "personId");

-- CreateIndex
CREATE INDEX "VolunteerLog_churchId_changedBy_idx" ON "VolunteerLog"("churchId", "changedBy");

-- CreateIndex
CREATE INDEX "VolunteerLog_churchId_status_idx" ON "VolunteerLog"("churchId", "status");

-- CreateIndex
CREATE INDEX "VolunteerLog_churchId_at_idx" ON "VolunteerLog"("churchId", "at");

-- CreateIndex
CREATE INDEX "Event_churchId_idx" ON "Event"("churchId");

-- CreateIndex
CREATE INDEX "Event_churchId_campusId_idx" ON "Event"("churchId", "campusId");

-- CreateIndex
CREATE INDEX "Event_churchId_slug_idx" ON "Event"("churchId", "slug");

-- CreateIndex
CREATE INDEX "Event_churchId_date_idx" ON "Event"("churchId", "date");

-- CreateIndex
CREATE INDEX "Event_churchId_isPublic_idx" ON "Event"("churchId", "isPublic");

-- CreateIndex
CREATE INDEX "Event_churchId_trailStageId_idx" ON "Event"("churchId", "trailStageId");

-- CreateIndex
CREATE UNIQUE INDEX "Event_churchId_slug_key" ON "Event"("churchId", "slug");

-- CreateIndex
CREATE INDEX "Registration_churchId_idx" ON "Registration"("churchId");

-- CreateIndex
CREATE INDEX "Registration_churchId_eventId_idx" ON "Registration"("churchId", "eventId");

-- CreateIndex
CREATE INDEX "Registration_churchId_personId_idx" ON "Registration"("churchId", "personId");

-- CreateIndex
CREATE INDEX "Registration_churchId_status_idx" ON "Registration"("churchId", "status");

-- CreateIndex
CREATE INDEX "Registration_churchId_paymentId_idx" ON "Registration"("churchId", "paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_eventId_personId_key" ON "Registration"("eventId", "personId");

-- CreateIndex
CREATE INDEX "Transaction_churchId_idx" ON "Transaction"("churchId");

-- CreateIndex
CREATE INDEX "Transaction_churchId_campusId_idx" ON "Transaction"("churchId", "campusId");

-- CreateIndex
CREATE INDEX "Transaction_churchId_cnpj_idx" ON "Transaction"("churchId", "cnpj");

-- CreateIndex
CREATE INDEX "Transaction_churchId_personId_idx" ON "Transaction"("churchId", "personId");

-- CreateIndex
CREATE INDEX "Transaction_churchId_eventId_idx" ON "Transaction"("churchId", "eventId");

-- CreateIndex
CREATE INDEX "Transaction_churchId_type_idx" ON "Transaction"("churchId", "type");

-- CreateIndex
CREATE INDEX "Transaction_churchId_direction_idx" ON "Transaction"("churchId", "direction");

-- CreateIndex
CREATE INDEX "Transaction_churchId_method_idx" ON "Transaction"("churchId", "method");

-- CreateIndex
CREATE INDEX "Transaction_churchId_costCenter_idx" ON "Transaction"("churchId", "costCenter");

-- CreateIndex
CREATE INDEX "Transaction_churchId_asaasId_idx" ON "Transaction"("churchId", "asaasId");

-- CreateIndex
CREATE INDEX "Transaction_churchId_nfseId_idx" ON "Transaction"("churchId", "nfseId");

-- CreateIndex
CREATE INDEX "Transaction_churchId_at_idx" ON "Transaction"("churchId", "at");

-- AddForeignKey
ALTER TABLE "Campus" ADD CONSTRAINT "Campus_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campus" ADD CONSTRAINT "Campus_pastorId_fkey" FOREIGN KEY ("pastorId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_trailStageId_fkey" FOREIGN KEY ("trailStageId") REFERENCES "TrailStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_celulaId_fkey" FOREIGN KEY ("celulaId") REFERENCES "Celula"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trail" ADD CONSTRAINT "Trail_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailStage" ADD CONSTRAINT "TrailStage_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailStage" ADD CONSTRAINT "TrailStage_trailId_fkey" FOREIGN KEY ("trailId") REFERENCES "Trail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailStage" ADD CONSTRAINT "TrailStage_requiresEventId_fkey" FOREIGN KEY ("requiresEventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailProgress" ADD CONSTRAINT "TrailProgress_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailProgress" ADD CONSTRAINT "TrailProgress_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailProgress" ADD CONSTRAINT "TrailProgress_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "TrailStage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailProgress" ADD CONSTRAINT "TrailProgress_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Celula" ADD CONSTRAINT "Celula_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Celula" ADD CONSTRAINT "Celula_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Celula" ADD CONSTRAINT "Celula_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Celula"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerLog" ADD CONSTRAINT "VolunteerLog_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerLog" ADD CONSTRAINT "VolunteerLog_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerLog" ADD CONSTRAINT "VolunteerLog_changedBy_fkey" FOREIGN KEY ("changedBy") REFERENCES "Person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_trailStageId_fkey" FOREIGN KEY ("trailStageId") REFERENCES "TrailStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
